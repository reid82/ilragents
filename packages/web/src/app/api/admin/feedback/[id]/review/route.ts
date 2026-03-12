import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAdminError } from '@/lib/admin-auth';
import { getSupabaseClient } from '@/lib/supabase';

export async function PUT(
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

    const { error } = await supabase
      .from('tester_feedback')
      .update({
        reviewed: true,
        reviewed_by: auth.userId,
      })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Review feedback error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to review feedback' },
      { status: 500 }
    );
  }
}
