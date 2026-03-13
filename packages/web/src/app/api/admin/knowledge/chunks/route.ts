import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAdminError } from '@/lib/admin-auth';
import { getSupabaseClient } from '@/lib/supabase';
import OpenAI from 'openai';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAdminError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabase = getSupabaseClient();
    const sourceId = req.nextUrl.searchParams.get('source_id');
    const agent = req.nextUrl.searchParams.get('agent');
    const contentType = req.nextUrl.searchParams.get('content_type');
    const contentLayer = req.nextUrl.searchParams.get('content_layer');
    const q = req.nextUrl.searchParams.get('q');
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50', 10);

    // Semantic search path
    if (q) {
      const client = new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY,
        defaultHeaders: {
          'HTTP-Referer': 'https://ilragents.app',
          'X-Title': 'ILRE Agents RAG Pipeline',
        },
      });

      const response = await client.embeddings.create({
        model: 'openai/text-embedding-3-small',
        input: q,
      });
      const queryEmbedding = response.data[0].embedding;

      const { data, error } = await supabase.rpc('match_chunks', {
        query_embedding: queryEmbedding,
        match_count: limit,
        filter_agent: agent || null,
        filter_content_type: contentType || null,
        filter_content_layer: contentLayer || null,
      });

      if (error) throw error;

      // Apply source_id filter if provided (not supported by the RPC)
      const filtered = sourceId
        ? (data || []).filter((row: Record<string, unknown>) => row.source_id === sourceId)
        : data || [];

      return NextResponse.json(filtered);
    }

    // Regular query path
    let query = supabase
      .from('chunks')
      .select('id, source_id, text, chunk_index, total_chunks, word_count, content_layer, agent, content_type, source_type, title, url, vimeo_id, topics, extracted_at, chunked_at')
      .order('chunked_at', { ascending: false })
      .limit(limit);

    if (sourceId) query = query.eq('source_id', sourceId);
    if (agent) query = query.eq('agent', agent);
    if (contentType) query = query.eq('content_type', contentType);
    if (contentLayer) query = query.eq('content_layer', contentLayer);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Admin knowledge chunks error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch chunks' },
      { status: 500 }
    );
  }
}
