import { NextResponse } from 'next/server';
import { requireAdmin, isAdminError } from '@/lib/admin-auth';
import { getSupabaseClient } from '@/lib/supabase';

export async function GET() {
  const auth = await requireAdmin();
  if (isAdminError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabase = getSupabaseClient();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('message_evals')
      .select('topic')
      .gte('created_at', sevenDaysAgo)
      .not('topic', 'is', null);

    if (error) throw error;

    // Count topic occurrences
    const topicCounts: Record<string, number> = {};
    for (const row of data || []) {
      if (row.topic) {
        topicCounts[row.topic] = (topicCounts[row.topic] || 0) + 1;
      }
    }

    const topics = Object.entries(topicCounts)
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json(topics);
  } catch (error) {
    console.error('Topics stats error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch topics' },
      { status: 500 }
    );
  }
}
