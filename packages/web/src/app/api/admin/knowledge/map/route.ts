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

    const contentLayer = req.nextUrl.searchParams.get('content_layer') || 'raw';
    const agent = req.nextUrl.searchParams.get('agent');

    let query = supabase
      .from('chunks')
      .select('id, source_id, agent, content_type, title, topics, word_count, map_x, map_y, content_layer, text')
      .not('map_x', 'is', null)
      .not('map_y', 'is', null)
      .eq('content_layer', contentLayer);

    if (agent) {
      query = query.eq('agent', agent);
    }

    const { data, error } = await query;
    if (error) throw error;

    const points = (data || []).map((chunk) => ({
      id: chunk.id,
      source_id: chunk.source_id,
      agent: chunk.agent,
      content_type: chunk.content_type,
      title: chunk.title,
      topics: chunk.topics,
      word_count: chunk.word_count,
      map_x: chunk.map_x,
      map_y: chunk.map_y,
      content_layer: chunk.content_layer,
      snippet: chunk.text ? chunk.text.substring(0, 100) : '',
    }));

    const byAgent: Record<string, number> = {};
    const byContentType: Record<string, number> = {};

    for (const p of points) {
      const agentKey = p.agent || 'unknown';
      byAgent[agentKey] = (byAgent[agentKey] || 0) + 1;

      const typeKey = p.content_type || 'unknown';
      byContentType[typeKey] = (byContentType[typeKey] || 0) + 1;
    }

    return NextResponse.json({
      points,
      stats: {
        total: points.length,
        byAgent,
        byContentType,
      },
    });
  } catch (error) {
    console.error('Knowledge map error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch knowledge map' },
      { status: 500 }
    );
  }
}
