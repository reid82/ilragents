import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAdminError } from '@/lib/admin-auth';
import { getSupabaseClient } from '@/lib/supabase';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (isAdminError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('improvement_suggestions')
      .select('*, message_evals(topic, overall_score, accuracy_score, relevance_score, grounding_score, accuracy_reasoning, relevance_reasoning, grounding_reasoning, message_id, conversation_id)')
      .eq('id', id)
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Suggestion fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch suggestion' },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (isAdminError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const { status } = body;

    if (!status || !['applied', 'dismissed', 'pending'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from('improvement_suggestions')
      .update({
        status,
        applied_by: status === 'applied' ? auth.userId : null,
      })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Suggestion update error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update suggestion' },
      { status: 500 }
    );
  }
}
