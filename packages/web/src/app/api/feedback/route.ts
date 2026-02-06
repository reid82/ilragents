import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userId,
      sessionId,
      agentId,
      agentName,
      userQuestion,
      assistantMessage,
      feedbackComment,
    } = body;

    if (!agentId || !agentName || !userQuestion || !assistantMessage || !feedbackComment) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const { getSupabaseClient } = await import('@/lib/supabase');
    const supabase = getSupabaseClient();

    const { error } = await supabase.from('tester_feedback').insert({
      user_id: userId || null,
      session_id: sessionId || null,
      agent_id: agentId,
      agent_name: agentName,
      user_question: userQuestion,
      assistant_message: assistantMessage,
      feedback_comment: feedbackComment,
    });

    if (error) {
      console.error('Failed to save feedback:', error);
      return NextResponse.json(
        { error: 'Failed to save feedback' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Feedback error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const agent = req.nextUrl.searchParams.get('agent');
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '20', 10);

  try {
    const { getSupabaseClient } = await import('@/lib/supabase');
    const supabase = getSupabaseClient();

    let query = supabase
      .from('tester_feedback')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (agent) {
      query = query.eq('agent_id', agent);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to fetch feedback:', error);
      return NextResponse.json(
        { error: 'Failed to fetch feedback' },
        { status: 500 }
      );
    }

    return NextResponse.json({ feedback: data });
  } catch (error) {
    console.error('Feedback fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
