/**
 * Supabase Integration
 * Handles ingestion and search operations with Supabase + pgvector
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Chunk, ChunkWithEmbedding, SearchResult, SearchOptions } from './types.js';
import { embedQuery } from './embedder.js';

let supabaseClient: SupabaseClient | null = null;

/**
 * Get or create Supabase client
 */
function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) return supabaseClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required');
  }

  supabaseClient = createClient(url, key);
  return supabaseClient;
}

/**
 * Convert Chunk to database row format
 */
function chunkToRow(chunk: ChunkWithEmbedding): Record<string, unknown> {
  return {
    id: chunk.id,
    source_id: chunk.sourceId,
    text: chunk.text,
    chunk_index: chunk.chunkIndex,
    total_chunks: chunk.totalChunks,
    word_count: chunk.wordCount,
    content_layer: chunk.contentLayer,
    agent: chunk.metadata.agent,
    content_type: chunk.metadata.contentType,
    source_type: chunk.metadata.sourceType || null,
    title: chunk.metadata.title,
    url: chunk.metadata.url || null,
    vimeo_id: chunk.metadata.vimeoId || null,
    topics: chunk.metadata.topics || [],
    extracted_at: chunk.metadata.extractedAt || null,
    embedding: chunk.embedding,
  };
}

/**
 * Convert database row to Chunk format
 */
function rowToChunk(row: Record<string, unknown>): Chunk {
  return {
    id: row.id as string,
    sourceId: row.source_id as string,
    text: row.text as string,
    chunkIndex: row.chunk_index as number,
    totalChunks: row.total_chunks as number,
    wordCount: row.word_count as number,
    contentLayer: row.content_layer as 'raw' | 'summary',
    metadata: {
      agent: row.agent as string,
      contentType: row.content_type as 'vimeo' | 'web' | 'pdf',
      sourceType: row.source_type as string | undefined,
      title: row.title as string,
      url: row.url as string | undefined,
      vimeoId: row.vimeo_id as string | undefined,
      topics: row.topics as string[] | undefined,
      extractedAt: row.extracted_at as string | undefined,
    },
  };
}

/**
 * Upsert a batch of chunks with embeddings to Supabase
 */
export async function upsertChunks(
  chunks: ChunkWithEmbedding[],
  options: {
    onProgress?: (completed: number, total: number) => void;
  } = {}
): Promise<{ inserted: number; errors: string[] }> {
  const client = getSupabaseClient();
  const { onProgress } = options;

  const BATCH_SIZE = 100;
  let inserted = 0;
  const errors: string[] = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const rows = batch.map(chunkToRow);

    const { error } = await client
      .from('chunks')
      .upsert(rows, { onConflict: 'id' });

    if (error) {
      errors.push(`Batch ${i}-${i + batch.length}: ${error.message}`);
    } else {
      inserted += batch.length;
    }

    onProgress?.(Math.min(i + BATCH_SIZE, chunks.length), chunks.length);
  }

  return { inserted, errors };
}

/**
 * Delete chunks for a source
 */
export async function deleteChunksForSource(sourceId: string): Promise<number> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from('chunks')
    .delete()
    .eq('source_id', sourceId)
    .select('id');

  if (error) {
    throw new Error(`Failed to delete chunks: ${error.message}`);
  }

  return data?.length || 0;
}

/**
 * Search chunks using vector similarity
 */
export async function searchChunks(options: SearchOptions): Promise<SearchResult[]> {
  const client = getSupabaseClient();

  const {
    query,
    limit = 10,
    agent,
    contentType,
    contentLayer,
    minScore = 0.5,
  } = options;

  // Generate embedding for query
  const queryEmbedding = await embedQuery(query);

  // Call the match_chunks function
  const { data, error } = await client.rpc('match_chunks', {
    query_embedding: queryEmbedding,
    match_count: limit,
    filter_agent: agent || null,
    filter_content_type: contentType || null,
    filter_content_layer: contentLayer || null,
  });

  if (error) {
    throw new Error(`Search failed: ${error.message}`);
  }

  // Filter by minimum score and convert to SearchResult
  const results: SearchResult[] = [];
  let rank = 1;

  for (const row of data || []) {
    const similarity = row.similarity as number;
    if (similarity >= minScore) {
      results.push({
        chunk: rowToChunk(row),
        score: similarity,
        rank: rank++,
      });
    }
  }

  return results;
}

/**
 * Get ingestion statistics from Supabase
 */
export async function getIngestionStats(): Promise<{
  totalChunks: number;
  rawChunks: number;
  summaryChunks: number;
  byAgent: Record<string, number>;
  byContentType: Record<string, number>;
}> {
  const client = getSupabaseClient();

  // Get total counts
  const { count: totalChunks } = await client
    .from('chunks')
    .select('*', { count: 'exact', head: true });

  const { count: rawChunks } = await client
    .from('chunks')
    .select('*', { count: 'exact', head: true })
    .eq('content_layer', 'raw');

  const { count: summaryChunks } = await client
    .from('chunks')
    .select('*', { count: 'exact', head: true })
    .eq('content_layer', 'summary');

  // Get counts by agent
  const { data: agentData } = await client
    .from('chunks')
    .select('agent');

  const byAgent: Record<string, number> = {};
  for (const row of agentData || []) {
    const agent = row.agent as string;
    byAgent[agent] = (byAgent[agent] || 0) + 1;
  }

  // Get counts by content type
  const { data: typeData } = await client
    .from('chunks')
    .select('content_type');

  const byContentType: Record<string, number> = {};
  for (const row of typeData || []) {
    const type = row.content_type as string;
    byContentType[type] = (byContentType[type] || 0) + 1;
  }

  return {
    totalChunks: totalChunks || 0,
    rawChunks: rawChunks || 0,
    summaryChunks: summaryChunks || 0,
    byAgent,
    byContentType,
  };
}

/**
 * Check if Supabase connection is working
 */
export async function testConnection(): Promise<boolean> {
  try {
    const client = getSupabaseClient();
    const { error } = await client.from('chunks').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
}
