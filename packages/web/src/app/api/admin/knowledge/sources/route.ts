import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAdminError } from '@/lib/admin-auth';
import { getSupabaseClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAdminError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabase = getSupabaseClient();
    const agent = req.nextUrl.searchParams.get('agent');

    let query = supabase
      .from('chunks')
      .select('source_id, title, agent, content_type, source_type, url, word_count, topics, chunked_at');

    if (agent) query = query.eq('agent', agent);

    const { data: chunks, error } = await query;
    if (error) throw error;

    // Group by source_id and aggregate stats
    const sourceMap = new Map<string, {
      source_id: string;
      title: string | null;
      agent: string;
      content_type: string;
      source_type: string | null;
      url: string | null;
      chunk_count: number;
      total_words: number;
      topics: Set<string>;
      latest_chunked_at: string | null;
    }>();

    for (const chunk of chunks || []) {
      const existing = sourceMap.get(chunk.source_id);
      if (existing) {
        existing.chunk_count += 1;
        existing.total_words += chunk.word_count || 0;
        if (chunk.topics) {
          for (const t of chunk.topics) existing.topics.add(t);
        }
        if (chunk.chunked_at && (!existing.latest_chunked_at || chunk.chunked_at > existing.latest_chunked_at)) {
          existing.latest_chunked_at = chunk.chunked_at;
        }
      } else {
        const topicSet = new Set<string>();
        if (chunk.topics) {
          for (const t of chunk.topics) topicSet.add(t);
        }
        sourceMap.set(chunk.source_id, {
          source_id: chunk.source_id,
          title: chunk.title,
          agent: chunk.agent,
          content_type: chunk.content_type,
          source_type: chunk.source_type,
          url: chunk.url,
          chunk_count: 1,
          total_words: chunk.word_count || 0,
          topics: topicSet,
          latest_chunked_at: chunk.chunked_at,
        });
      }
    }

    const sources = Array.from(sourceMap.values()).map(s => ({
      ...s,
      topics: Array.from(s.topics),
    }));

    // Sort by latest_chunked_at descending
    sources.sort((a, b) => {
      if (!a.latest_chunked_at) return 1;
      if (!b.latest_chunked_at) return -1;
      return b.latest_chunked_at.localeCompare(a.latest_chunked_at);
    });

    return NextResponse.json(sources);
  } catch (error) {
    console.error('Admin knowledge sources error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch knowledge sources' },
      { status: 500 }
    );
  }
}
