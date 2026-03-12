import { NextResponse } from 'next/server';
import { config } from 'dotenv';
import path from 'path';
import { requireAdmin, isAdminError } from '@/lib/admin-auth';

config({ path: path.resolve(process.cwd(), '../../.env') });

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (isAdminError(auth)) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { getSupabaseClient } = await import('@/lib/supabase');
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('agent_personas')
      .select('*')
      .order('agent_name');

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Personas fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch personas' },
      { status: 500 }
    );
  }
}
