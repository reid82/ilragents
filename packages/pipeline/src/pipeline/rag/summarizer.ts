/**
 * Chunk Summarizer
 * Generates summaries for chunks using GPT-4o-mini via OpenRouter
 */

import OpenAI from 'openai';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { Chunk, ChunkedSource } from './types';
import { CHUNKS_DIR } from '../config';

// Rate limiting
const RATE_LIMIT_MS = 200; // 5 requests/second max for OpenRouter
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Create OpenRouter client
 */
function getOpenRouterClient(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is required');
  }

  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
    defaultHeaders: {
      'HTTP-Referer': 'https://ilragents.app',
      'X-Title': 'ILRE Agents RAG Pipeline',
    },
  });
}

/**
 * Generate summary for a single chunk
 */
async function summarizeChunk(
  client: OpenAI,
  chunk: Chunk,
  model: string
): Promise<{ summary: string; topics: string[] }> {
  const systemPrompt = `You are a content summarizer for real estate investing educational content.
Your task is to:
1. Create a concise 2-3 sentence summary capturing the key points
2. Extract 3-5 key topics/concepts mentioned

Context: This is from "${chunk.metadata.title}" by agent "${chunk.metadata.agent}".

Respond in JSON format:
{
  "summary": "Your 2-3 sentence summary here",
  "topics": ["topic1", "topic2", "topic3"]
}`;

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: chunk.text },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_tokens: 300,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from OpenRouter');
  }

  const result = JSON.parse(content);
  return {
    summary: result.summary || '',
    topics: result.topics || [],
  };
}

/**
 * Generate summaries for all chunks in a source
 */
export async function summarizeSource(
  sourceId: string,
  options: {
    force?: boolean;
    model?: string;
  } = {}
): Promise<ChunkedSource | null> {
  const { force = false, model = process.env.SUMMARIZATION_MODEL || 'openai/gpt-4o-mini' } = options;

  const filePath = path.join(CHUNKS_DIR, `${sourceId}.json`);

  if (!existsSync(filePath)) {
    throw new Error(`Chunked source not found: ${sourceId}`);
  }

  const content = await readFile(filePath, 'utf-8');
  const source: ChunkedSource = JSON.parse(content);

  // Check if already summarized
  if (!force && source.summaries && source.summaries.length > 0) {
    console.log(`  Skipping ${sourceId} (already summarized)`);
    return null;
  }

  const client = getOpenRouterClient();
  const summaries: Chunk[] = [];

  console.log(`  Summarizing ${source.chunks.length} chunks...`);

  for (let i = 0; i < source.chunks.length; i++) {
    const chunk = source.chunks[i];
    process.stdout.write(`    Chunk ${i + 1}/${source.chunks.length}... `);

    try {
      const { summary, topics } = await summarizeChunk(client, chunk, model);

      // Create summary chunk
      const summaryChunk: Chunk = {
        id: chunk.id.replace('-raw-', '-summary-'),
        sourceId: chunk.sourceId,
        text: summary,
        chunkIndex: chunk.chunkIndex,
        totalChunks: chunk.totalChunks,
        wordCount: summary.split(/\s+/).length,
        contentLayer: 'summary',
        metadata: {
          ...chunk.metadata,
          topics,
        },
      };

      summaries.push(summaryChunk);

      // Also update the raw chunk with extracted topics
      chunk.metadata.topics = topics;

      console.log('done');
    } catch (error) {
      console.log(`error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }

    // Rate limiting
    await sleep(RATE_LIMIT_MS);
  }

  // Update source with summaries
  source.summaries = summaries;

  // Save updated source
  await writeFile(filePath, JSON.stringify(source, null, 2));

  return source;
}

/**
 * Summarize all sources or a specific one
 */
export async function summarizeAll(options: {
  sourceId?: string;
  force?: boolean;
  model?: string;
} = {}): Promise<{
  processed: number;
  skipped: number;
  totalSummaries: number;
}> {
  const { sourceId, force = false, model } = options;

  // Get list of chunked sources
  const files = await import('fs/promises').then(fs => fs.readdir(CHUNKS_DIR));
  const jsonFiles = files.filter(f => f.endsWith('.json'));

  let filesToProcess: string[];

  if (sourceId) {
    const targetFile = `${sourceId}.json`;
    if (!jsonFiles.includes(targetFile)) {
      throw new Error(`Chunked source not found: ${sourceId}`);
    }
    filesToProcess = [targetFile];
  } else {
    filesToProcess = jsonFiles;
  }

  console.log(`\nSummarizing ${filesToProcess.length} source(s)...\n`);

  let processed = 0;
  let skipped = 0;
  let totalSummaries = 0;

  for (const file of filesToProcess) {
    const id = file.replace('.json', '');
    console.log(`Processing ${id}...`);

    try {
      const result = await summarizeSource(id, { force, model });

      if (result) {
        processed++;
        totalSummaries += result.summaries?.length || 0;
      } else {
        skipped++;
      }
    } catch (error) {
      console.log(`  Error: ${error instanceof Error ? error.message : 'Unknown'}`);
      skipped++;
    }
  }

  return { processed, skipped, totalSummaries };
}

/**
 * Get summarization statistics
 */
export async function getSummarizationStats(): Promise<{
  totalSources: number;
  summarizedSources: number;
  totalSummaries: number;
}> {
  const files = await import('fs/promises').then(fs => fs.readdir(CHUNKS_DIR));
  const jsonFiles = files.filter(f => f.endsWith('.json'));

  let summarizedSources = 0;
  let totalSummaries = 0;

  for (const file of jsonFiles) {
    const content = await readFile(path.join(CHUNKS_DIR, file), 'utf-8');
    const source: ChunkedSource = JSON.parse(content);

    if (source.summaries && source.summaries.length > 0) {
      summarizedSources++;
      totalSummaries += source.summaries.length;
    }
  }

  return {
    totalSources: jsonFiles.length,
    summarizedSources,
    totalSummaries,
  };
}
