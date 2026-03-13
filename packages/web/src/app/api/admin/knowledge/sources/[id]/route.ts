import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAdminError } from '@/lib/admin-auth';
import { getSupabaseClient } from '@/lib/supabase';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const auth = await requireAdmin();
  if (isAdminError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('chunks')
      .delete()
      .eq('source_id', id)
      .select('id');

    if (error) throw error;

    return NextResponse.json({ deleted: data?.length || 0 });
  } catch (error) {
    console.error('Admin knowledge delete source error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete source' },
      { status: 500 }
    );
  }
}
