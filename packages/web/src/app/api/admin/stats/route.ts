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
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const today = now.toISOString().split('T')[0];

    // Active users in last 7 days
    const { data: activeUsers7d } = await supabase
      .from('usage_analytics')
      .select('user_id')
      .gte('date', sevenDaysAgo);
    const uniqueUsers7d = new Set(activeUsers7d?.map(r => r.user_id) || []).size;

    // Active users in previous 7 days (for trend)
    const { data: activeUsersPrev7d } = await supabase
      .from('usage_analytics')
      .select('user_id')
      .gte('date', fourteenDaysAgo)
      .lt('date', sevenDaysAgo);
    const uniqueUsersPrev7d = new Set(activeUsersPrev7d?.map(r => r.user_id) || []).size;

    // Conversations today
    const { count: conversationsToday } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', today + 'T00:00:00Z');

    // Avg messages per session (last 7 days)
    const { data: analytics7d } = await supabase
      .from('usage_analytics')
      .select('messages_sent, conversations_started')
      .gte('date', sevenDaysAgo);

    const totalMessages = analytics7d?.reduce((sum, r) => sum + (r.messages_sent || 0), 0) || 0;
    const totalConversations = analytics7d?.reduce((sum, r) => sum + (r.conversations_started || 0), 0) || 1;
    const avgMessagesPerSession = totalMessages / totalConversations;

    // Avg quality score (last 7 days)
    const { data: evals7d } = await supabase
      .from('message_evals')
      .select('overall_score')
      .gte('created_at', new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString());

    const avgQualityScore = evals7d && evals7d.length > 0
      ? evals7d.reduce((sum, e) => sum + (e.overall_score || 0), 0) / evals7d.length
      : null;

    // Flagged count (unreviewed)
    const { count: flaggedCount } = await supabase
      .from('message_evals')
      .select('*', { count: 'exact', head: true })
      .eq('flagged', true);

    return NextResponse.json({
      activeUsers7d: uniqueUsers7d,
      activeUsersTrend: uniqueUsersPrev7d > 0 ? ((uniqueUsers7d - uniqueUsersPrev7d) / uniqueUsersPrev7d * 100) : 0,
      conversationsToday: conversationsToday || 0,
      avgMessagesPerSession: Math.round(avgMessagesPerSession * 10) / 10,
      avgQualityScore: avgQualityScore ? Math.round(avgQualityScore * 100) / 100 : null,
      flaggedCount: flaggedCount || 0,
    });
  } catch (error) {
    console.error('Stats error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
