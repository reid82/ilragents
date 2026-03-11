import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/supabase-server';
import { getSupabaseClient } from '@/lib/supabase';

/**
 * GET /api/roadmap/mine
 * Returns the authenticated user's latest completed roadmap.
 */
export async function GET(_req: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseClient();

    // Find the most recent completed (or generating) roadmap for this user
    const { data, error } = await supabase
      .from('roadmaps')
      .select('id, status, report_markdown, report_data, sections_completed, total_sections, created_at')
      .eq('user_id', userId)
      .in('status', ['completed', 'generating'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Roadmap mine query error:', error);
      return NextResponse.json({ error: 'Failed to query roadmaps' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ status: 'none' });
    }

    if (data.status === 'completed') {
      return NextResponse.json({
        status: 'completed',
        roadmapId: data.id,
        reportMarkdown: data.report_markdown,
        reportData: data.report_data,
        createdAt: data.created_at,
      });
    }

    // Still generating
    return NextResponse.json({
      status: 'generating',
      roadmapId: data.id,
      sectionsCompleted: data.sections_completed,
      totalSections: data.total_sections,
    });
  } catch (error) {
    console.error('Roadmap mine error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
