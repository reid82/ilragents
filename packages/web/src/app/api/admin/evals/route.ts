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
    const topic = req.nextUrl.searchParams.get('topic');
    const flagged = req.nextUrl.searchParams.get('flagged');

    let query = supabase
      .from('message_evals')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (topic) query = query.eq('topic', topic);
    if (flagged === 'true') query = query.eq('flagged', true);
    if (flagged === 'false') query = query.eq('flagged', false);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Admin evals error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch evals' },
      { status: 500 }
    );
  }
}
