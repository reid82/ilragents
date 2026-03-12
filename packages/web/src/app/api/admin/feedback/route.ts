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
    const reviewed = req.nextUrl.searchParams.get('reviewed');
    const agent = req.nextUrl.searchParams.get('agent');
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50', 10);

    let query = supabase
      .from('tester_feedback')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (reviewed === 'true') query = query.eq('reviewed', true);
    if (reviewed === 'false') query = query.eq('reviewed', false);
    if (agent) query = query.eq('agent_id', agent);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ feedback: data });
  } catch (error) {
    console.error('Admin feedback error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch feedback' },
      { status: 500 }
    );
  }
}
