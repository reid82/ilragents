/**
 * RAG System Types
 * Types for chunking, embeddings, and semantic search
 */

export type ContentLayer = 'raw' | 'summary';

export interface ChunkMetadata {
  agent: string;
  contentType: 'vimeo' | 'web' | 'pdf';
  sourceType?: string;
  title: string;
  url?: string;
  vimeoId?: string;
  topics?: string[];
  extractedAt?: string;
}

export interface Chunk {
  id: string;                    // sourceId-chunk-N or sourceId-summary-N
  sourceId: string;
  text: string;
  chunkIndex: number;
  totalChunks: number;
  wordCount: number;
  contentLayer: ContentLayer;
  metadata: ChunkMetadata;
}

export interface ChunkWithEmbedding extends Chunk {
  embedding: number[];
}

export interface ChunkedSource {
  sourceId: string;
  chunks: Chunk[];
  summaries?: Chunk[];
  metadata: ChunkMetadata;
  chunkedAt: string;
}

export interface SearchResult {
  chunk: Chunk;
  score: number;
  rank: number;
}

export interface SearchOptions {
  query: string;
  limit?: number;
  agent?: string;
  contentType?: 'vimeo' | 'web' | 'pdf';
  contentLayer?: ContentLayer;
  minScore?: number;
}

export interface RagStatus {
  totalChunks: number;
  rawChunks: number;
  summaryChunks: number;
  indexedChunks: number;
  byAgent: Record<string, { raw: number; summary: number; indexed: number }>;
  byContentType: Record<string, { raw: number; summary: number; indexed: number }>;
  lastUpdated: string;
}

// Parsed frontmatter from extracted content
export interface ExtractedFrontmatter {
  title: string;
  agent: string;
  sourceType: string;
  contentType: 'vimeo' | 'web' | 'pdf';
  vimeoId?: string;
  vimeoUrl?: string;
  url?: string;
  duration?: number;
  durationFormatted?: string;
  hasCaptions?: boolean;
  extractedAt?: string;
}

// Chunking configuration per content type
export interface ChunkConfig {
  targetWords: number;
  overlapWords: number;
}

export const CHUNK_CONFIGS: Record<string, ChunkConfig> = {
  vimeo: { targetWords: 1000, overlapWords: 150 },
  web: { targetWords: 600, overlapWords: 100 },
  pdf: { targetWords: 800, overlapWords: 100 },
};
