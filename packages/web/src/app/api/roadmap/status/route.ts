import { NextRequest } from 'next/server';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '../../.env') });

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId');
  if (!sessionId) {
    return new Response(
      JSON.stringify({ error: 'sessionId is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { getSupabaseClient } = await import('@/lib/supabase');
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('roadmaps')
      .select('id, status, sections_completed, total_sections, error_message, report_data')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return new Response(
        JSON.stringify({ status: 'none' }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        roadmapId: data.id,
        status: data.status,
        sectionsCompleted: data.sections_completed,
        totalSections: data.total_sections,
        errorMessage: data.error_message,
        reportData: data.status === 'completed' ? data.report_data : null,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Roadmap status error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to check status' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
