/**
 * RAG System - Module Exports
 * Provides semantic search across ILRE content
 */

// Types
export type {
  Chunk,
  ChunkWithEmbedding,
  ChunkedSource,
  ChunkMetadata,
  ContentLayer,
  SearchResult,
  SearchOptions,
  RagStatus,
  ExtractedFrontmatter,
  ChunkConfig,
} from './types';

export { CHUNK_CONFIGS } from './types';

// Chunker
export {
  chunkSource,
  chunkAll,
  loadChunkedSource,
  loadAllChunkedSources,
  getChunkStats,
} from './chunker';

// Summarizer
export {
  summarizeSource,
  summarizeAll,
  getSummarizationStats,
} from './summarizer';

// Embedder
export {
  generateEmbedding,
  generateEmbeddingsBatch,
  embedChunks,
  embedQuery,
} from './embedder';

// Supabase
export {
  upsertChunks,
  deleteChunksForSource,
  searchChunks,
  getIngestionStats,
  testConnection,
} from './supabase';
