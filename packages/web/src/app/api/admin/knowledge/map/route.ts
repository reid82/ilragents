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

    // Check if map_x/map_y columns exist by doing a minimal probe query
    const { error: probeError } = await supabase
      .from('chunks')
      .select('map_x')
      .limit(1);

    const hasMapColumns = !probeError || probeError.code !== '42703';

    const columns = hasMapColumns
      ? 'id, source_id, content_type, title, topics, word_count, map_x, map_y, text'
      : 'id, source_id, content_type, title, topics, word_count, text';

    // Paginate to get all rows (Supabase default limit is 1000)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allData: any[] = [];
    const pageSize = 1000;
    let offset = 0;

    while (true) {
      let query = supabase
        .from('chunks')
        .select(columns)
        .eq('content_layer', contentLayer)
        .range(offset, offset + pageSize - 1);

      if (hasMapColumns) {
        query = query.not('map_x', 'is', null).not('map_y', 'is', null);
      }

      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) break;

      allData.push(...data);
      if (data.length < pageSize) break;
      offset += pageSize;
    }

    const points = allData.map((chunk) => ({
      id: chunk.id,
      source_id: chunk.source_id,
      content_type: chunk.content_type,
      title: chunk.title,
      topics: chunk.topics || [],
      word_count: chunk.word_count,
      map_x: chunk.map_x ?? null,
      map_y: chunk.map_y ?? null,
      snippet: typeof chunk.text === 'string' ? chunk.text.substring(0, 120) : '',
    }));

    const byContentType: Record<string, number> = {};
    const byTopic: Record<string, number> = {};

    for (const p of points) {
      const typeKey = p.content_type || 'unknown';
      byContentType[typeKey] = (byContentType[typeKey] || 0) + 1;

      for (const t of p.topics) {
        byTopic[t] = (byTopic[t] || 0) + 1;
      }
    }

    return NextResponse.json({
      points,
      stats: {
        total: points.length,
        byContentType,
        byTopic,
      },
      migration_needed: !hasMapColumns,
    });
  } catch (error) {
    console.error('Knowledge map error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch knowledge map' },
      { status: 500 }
    );
  }
}
