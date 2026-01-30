/**
 * Content Chunker
 * Parses extracted content and splits into semantic chunks
 */

import { readFile, writeFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import matter from 'gray-matter';
import type { Chunk, ChunkedSource, ChunkMetadata, ExtractedFrontmatter, CHUNK_CONFIGS } from './types';
import { CHUNK_CONFIGS as configs } from './types';
import { DATA_DIR, CHUNKS_DIR } from '../config';

/**
 * Generate a unique chunk ID
 */
function generateChunkId(sourceId: string, index: number, layer: 'raw' | 'summary'): string {
  return `${sourceId}-${layer}-${index.toString().padStart(4, '0')}`;
}

/**
 * Count words in text
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Split text into chunks with overlap
 * Uses semantic boundaries (paragraphs, sentences) when possible
 */
function splitIntoChunks(
  text: string,
  targetWords: number,
  overlapWords: number
): string[] {
  const chunks: string[] = [];

  // Split by paragraphs first
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);

  let currentChunk: string[] = [];
  let currentWordCount = 0;

  for (const paragraph of paragraphs) {
    const paragraphWords = countWords(paragraph);

    // If a single paragraph exceeds target, split by sentences
    if (paragraphWords > targetWords * 1.5) {
      // Flush current chunk if any
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join('\n\n'));
        currentChunk = [];
        currentWordCount = 0;
      }

      // Split long paragraph by sentences
      const sentences = paragraph.split(/(?<=[.!?])\s+/);
      let sentenceChunk: string[] = [];
      let sentenceWordCount = 0;

      for (const sentence of sentences) {
        const sentenceWords = countWords(sentence);

        if (sentenceWordCount + sentenceWords > targetWords && sentenceChunk.length > 0) {
          chunks.push(sentenceChunk.join(' '));

          // Keep overlap from previous chunk
          const overlapSentences: string[] = [];
          let overlapCount = 0;
          for (let i = sentenceChunk.length - 1; i >= 0 && overlapCount < overlapWords; i--) {
            overlapSentences.unshift(sentenceChunk[i]);
            overlapCount += countWords(sentenceChunk[i]);
          }

          sentenceChunk = overlapSentences;
          sentenceWordCount = overlapCount;
        }

        sentenceChunk.push(sentence);
        sentenceWordCount += sentenceWords;
      }

      if (sentenceChunk.length > 0) {
        currentChunk = [sentenceChunk.join(' ')];
        currentWordCount = sentenceWordCount;
      }
    } else if (currentWordCount + paragraphWords > targetWords && currentChunk.length > 0) {
      // Current chunk is full, start a new one with overlap
      chunks.push(currentChunk.join('\n\n'));

      // Calculate overlap: keep last N words worth of paragraphs
      const overlapParagraphs: string[] = [];
      let overlapCount = 0;
      for (let i = currentChunk.length - 1; i >= 0 && overlapCount < overlapWords; i--) {
        overlapParagraphs.unshift(currentChunk[i]);
        overlapCount += countWords(currentChunk[i]);
      }

      currentChunk = [...overlapParagraphs, paragraph];
      currentWordCount = overlapCount + paragraphWords;
    } else {
      currentChunk.push(paragraph);
      currentWordCount += paragraphWords;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join('\n\n'));
  }

  return chunks;
}

/**
 * Parse a markdown file with frontmatter
 */
async function parseMarkdownFile(filePath: string): Promise<{
  frontmatter: ExtractedFrontmatter;
  content: string;
}> {
  const raw = await readFile(filePath, 'utf-8');
  const { data, content } = matter(raw);

  return {
    frontmatter: data as ExtractedFrontmatter,
    content: content.trim(),
  };
}

/**
 * Generate source ID from filename
 */
function getSourceIdFromFilename(filename: string): string {
  return filename.replace(/\.md$/, '');
}

/**
 * Chunk a single source file
 */
export async function chunkSource(
  filePath: string,
  force: boolean = false
): Promise<ChunkedSource | null> {
  const filename = path.basename(filePath);
  const sourceId = getSourceIdFromFilename(filename);
  const outputPath = path.join(CHUNKS_DIR, `${sourceId}.json`);

  // Check if already chunked
  if (!force && existsSync(outputPath)) {
    console.log(`  Skipping ${sourceId} (already chunked)`);
    return null;
  }

  const { frontmatter, content } = await parseMarkdownFile(filePath);

  // Skip empty content
  if (!content || content.length < 50) {
    console.log(`  Skipping ${sourceId} (no content)`);
    return null;
  }

  // Get chunk config for content type
  const config = configs[frontmatter.contentType] || configs.vimeo;

  // Split into chunks
  const textChunks = splitIntoChunks(content, config.targetWords, config.overlapWords);

  // Build metadata
  const metadata: ChunkMetadata = {
    agent: frontmatter.agent,
    contentType: frontmatter.contentType,
    sourceType: frontmatter.sourceType,
    title: frontmatter.title,
    url: frontmatter.vimeoUrl || frontmatter.url,
    vimeoId: frontmatter.vimeoId,
    extractedAt: frontmatter.extractedAt,
  };

  // Create Chunk objects
  const chunks: Chunk[] = textChunks.map((text, index) => ({
    id: generateChunkId(sourceId, index, 'raw'),
    sourceId,
    text,
    chunkIndex: index,
    totalChunks: textChunks.length,
    wordCount: countWords(text),
    contentLayer: 'raw' as const,
    metadata,
  }));

  const result: ChunkedSource = {
    sourceId,
    chunks,
    metadata,
    chunkedAt: new Date().toISOString(),
  };

  // Save to JSON
  await writeFile(outputPath, JSON.stringify(result, null, 2));

  return result;
}

/**
 * Get all content files from data directories
 */
async function getAllContentFiles(): Promise<string[]> {
  const files: string[] = [];

  const directories = ['transcripts', 'case-studies', 'pdfs'];

  for (const dir of directories) {
    const dirPath = path.join(DATA_DIR, dir);
    if (!existsSync(dirPath)) continue;

    const entries = await readdir(dirPath);
    for (const entry of entries) {
      if (entry.endsWith('.md')) {
        files.push(path.join(dirPath, entry));
      }
    }
  }

  return files;
}

/**
 * Chunk all content or a specific source
 */
export async function chunkAll(options: {
  sourceId?: string;
  force?: boolean;
} = {}): Promise<{
  processed: number;
  skipped: number;
  totalChunks: number;
}> {
  const { sourceId, force = false } = options;

  let files: string[];

  if (sourceId) {
    // Find the specific source file
    const allFiles = await getAllContentFiles();
    files = allFiles.filter(f => path.basename(f, '.md') === sourceId);

    if (files.length === 0) {
      throw new Error(`Source not found: ${sourceId}`);
    }
  } else {
    files = await getAllContentFiles();
  }

  console.log(`\nChunking ${files.length} file(s)...\n`);

  let processed = 0;
  let skipped = 0;
  let totalChunks = 0;

  for (const file of files) {
    const filename = path.basename(file);
    process.stdout.write(`Processing ${filename}... `);

    try {
      const result = await chunkSource(file, force);

      if (result) {
        console.log(`${result.chunks.length} chunks`);
        processed++;
        totalChunks += result.chunks.length;
      } else {
        skipped++;
      }
    } catch (error) {
      console.log(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      skipped++;
    }
  }

  return { processed, skipped, totalChunks };
}

/**
 * Load a chunked source from JSON
 */
export async function loadChunkedSource(sourceId: string): Promise<ChunkedSource | null> {
  const filePath = path.join(CHUNKS_DIR, `${sourceId}.json`);

  if (!existsSync(filePath)) {
    return null;
  }

  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content) as ChunkedSource;
}

/**
 * Load all chunked sources
 */
export async function loadAllChunkedSources(): Promise<ChunkedSource[]> {
  if (!existsSync(CHUNKS_DIR)) {
    return [];
  }

  const files = await readdir(CHUNKS_DIR);
  const sources: ChunkedSource[] = [];

  for (const file of files) {
    if (file.endsWith('.json')) {
      const content = await readFile(path.join(CHUNKS_DIR, file), 'utf-8');
      sources.push(JSON.parse(content) as ChunkedSource);
    }
  }

  return sources;
}

/**
 * Get chunking statistics
 */
export async function getChunkStats(): Promise<{
  totalSources: number;
  totalChunks: number;
  byAgent: Record<string, number>;
  byContentType: Record<string, number>;
  avgChunksPerSource: number;
}> {
  const sources = await loadAllChunkedSources();

  const byAgent: Record<string, number> = {};
  const byContentType: Record<string, number> = {};
  let totalChunks = 0;

  for (const source of sources) {
    totalChunks += source.chunks.length;

    const agent = source.metadata.agent;
    const contentType = source.metadata.contentType;

    byAgent[agent] = (byAgent[agent] || 0) + source.chunks.length;
    byContentType[contentType] = (byContentType[contentType] || 0) + source.chunks.length;
  }

  return {
    totalSources: sources.length,
    totalChunks,
    byAgent,
    byContentType,
    avgChunksPerSource: sources.length > 0 ? Math.round(totalChunks / sources.length) : 0,
  };
}
