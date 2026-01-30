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
} from './types.js';

export { CHUNK_CONFIGS } from './types.js';

// Chunker
export {
  chunkSource,
  chunkAll,
  loadChunkedSource,
  loadAllChunkedSources,
  getChunkStats,
} from './chunker.js';

// Summarizer
export {
  summarizeSource,
  summarizeAll,
  getSummarizationStats,
} from './summarizer.js';

// Embedder
export {
  generateEmbedding,
  generateEmbeddingsBatch,
  embedChunks,
  embedQuery,
} from './embedder.js';

// Supabase
export {
  upsertChunks,
  deleteChunksForSource,
  searchChunks,
  getIngestionStats,
  testConnection,
} from './supabase.js';
