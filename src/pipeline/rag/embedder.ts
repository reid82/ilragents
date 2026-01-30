/**
 * Embedding Generator
 * Generates vector embeddings for chunks using OpenAI's text-embedding-3-small via OpenRouter
 */

import OpenAI from 'openai';
import type { Chunk, ChunkWithEmbedding } from './types.js';

// Rate limiting
const RATE_LIMIT_MS = parseInt(process.env.RATE_LIMIT_MS || '200');
const BATCH_SIZE = 20; // OpenAI supports up to 2048 inputs, but we batch smaller for safety
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Create OpenRouter client configured for embeddings
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
 * Generate embedding for a single text
 */
export async function generateEmbedding(
  text: string,
  model: string = process.env.EMBEDDING_MODEL || 'openai/text-embedding-3-small'
): Promise<number[]> {
  const client = getOpenRouterClient();

  const response = await client.embeddings.create({
    model,
    input: text,
  });

  return response.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts in batch
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  model: string = process.env.EMBEDDING_MODEL || 'openai/text-embedding-3-small'
): Promise<number[][]> {
  const client = getOpenRouterClient();

  const response = await client.embeddings.create({
    model,
    input: texts,
  });

  // Sort by index to ensure order matches input
  const sorted = response.data.sort((a, b) => a.index - b.index);
  return sorted.map(d => d.embedding);
}

/**
 * Add embeddings to chunks
 */
export async function embedChunks(
  chunks: Chunk[],
  options: {
    model?: string;
    onProgress?: (completed: number, total: number) => void;
  } = {}
): Promise<ChunkWithEmbedding[]> {
  const { model, onProgress } = options;
  const results: ChunkWithEmbedding[] = [];

  // Process in batches
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map(c => c.text);

    const embeddings = await generateEmbeddingsBatch(texts, model);

    for (let j = 0; j < batch.length; j++) {
      results.push({
        ...batch[j],
        embedding: embeddings[j],
      });
    }

    onProgress?.(Math.min(i + BATCH_SIZE, chunks.length), chunks.length);

    // Rate limiting between batches
    if (i + BATCH_SIZE < chunks.length) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  return results;
}

/**
 * Generate embedding for a search query
 */
export async function embedQuery(
  query: string,
  model?: string
): Promise<number[]> {
  return generateEmbedding(query, model);
}
