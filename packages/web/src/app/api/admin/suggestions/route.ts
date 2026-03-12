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
    const status = req.nextUrl.searchParams.get('status') || 'pending';
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50', 10);

    const { data, error } = await supabase
      .from('improvement_suggestions')
      .select('*, message_evals(topic, overall_score, accuracy_score, relevance_score, grounding_score, message_id, conversation_id)')
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Suggestions error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch suggestions' },
      { status: 500 }
    );
  }
}
