import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAdminError } from '@/lib/admin-auth';
import { getSupabaseClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAdminError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const days = parseInt(req.nextUrl.searchParams.get('days') || '7', 10);
    const supabase = getSupabaseClient();
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('usage_analytics')
      .select('date, messages_sent, messages_received, conversations_started')
      .gte('date', since)
      .order('date', { ascending: true });

    if (error) throw error;

    // Aggregate by date (multiple users per date)
    const byDate: Record<string, { date: string; messages: number; conversations: number }> = {};
    for (const row of data || []) {
      if (!byDate[row.date]) {
        byDate[row.date] = { date: row.date, messages: 0, conversations: 0 };
      }
      byDate[row.date].messages += (row.messages_sent || 0) + (row.messages_received || 0);
      byDate[row.date].conversations += row.conversations_started || 0;
    }

    return NextResponse.json(Object.values(byDate));
  } catch (error) {
    console.error('Engagement stats error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch engagement' },
      { status: 500 }
    );
  }
}
