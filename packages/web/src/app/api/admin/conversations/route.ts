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
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50', 10);
    const user = req.nextUrl.searchParams.get('user');

    // Fetch conversations with user profile info
    let query = supabase
      .from('conversations')
      .select('id, user_id, title, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (user) query = query.eq('user_id', user);

    const { data: conversations, error } = await query;
    if (error) throw error;

    // Enrich with message counts, user names, avg eval scores
    const enriched = await Promise.all(
      (conversations || []).map(async (convo) => {
        const [{ count: messageCount }, { data: profile }, { data: evals }] = await Promise.all([
          supabase
            .from('conversation_messages')
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', convo.id),
          supabase
            .from('user_profiles')
            .select('display_name, email')
            .eq('id', convo.user_id)
            .single(),
          supabase
            .from('message_evals')
            .select('overall_score')
            .eq('conversation_id', convo.id),
        ]);

        // Fallback to auth.users email if no user_profiles row
        let userName = profile?.display_name || profile?.email || null;
        if (!userName && convo.user_id) {
          const { data: authUser } = await supabase.auth.admin.getUserById(convo.user_id);
          userName = authUser?.user?.email || 'Unknown';
        }

        const avgScore = evals && evals.length > 0
          ? evals.reduce((sum, e) => sum + (e.overall_score || 0), 0) / evals.length
          : null;

        return {
          ...convo,
          message_count: messageCount || 0,
          user_name: userName,
          avg_eval_score: avgScore ? Math.round(avgScore * 100) / 100 : null,
        };
      })
    );

    return NextResponse.json(enriched);
  } catch (error) {
    console.error('Admin conversations error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch conversations' },
      { status: 500 }
    );
  }
}
