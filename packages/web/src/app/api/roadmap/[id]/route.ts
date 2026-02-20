import { NextRequest } from 'next/server';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '../../.env') });

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return new Response(
      JSON.stringify({ error: 'Roadmap ID is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { getSupabaseClient } = await import('@/lib/supabase');
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('roadmaps')
      .select('id, status, report_markdown, report_data, profile_snapshot, created_at, updated_at')
      .eq('id', id)
      .single();

    if (error || !data) {
      return new Response(
        JSON.stringify({ error: 'Roadmap not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (data.status !== 'completed') {
      return new Response(
        JSON.stringify({ error: 'Roadmap not yet completed', status: data.status }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        id: data.id,
        reportMarkdown: data.report_markdown,
        reportData: data.report_data,
        profileSnapshot: data.profile_snapshot,
        createdAt: data.created_at,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Roadmap fetch error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch roadmap' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
