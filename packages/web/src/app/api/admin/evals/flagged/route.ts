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

    const { data: evals, error } = await supabase
      .from('message_evals')
      .select('*')
      .eq('flagged', true)
      .order('overall_score', { ascending: true })
      .limit(limit);

    if (error) throw error;

    // Enrich with the original message content
    const enriched = await Promise.all(
      (evals || []).map(async (evalRecord) => {
        const { data: message } = await supabase
          .from('conversation_messages')
          .select('content, role')
          .eq('id', evalRecord.message_id)
          .single();

        // Get the user question (previous message in conversation)
        const { data: prevMessages } = await supabase
          .from('conversation_messages')
          .select('content')
          .eq('conversation_id', evalRecord.conversation_id)
          .eq('role', 'user')
          .order('created_at', { ascending: false })
          .limit(1);

        return {
          ...evalRecord,
          assistant_message: message?.content?.slice(0, 200) || '',
          user_question: prevMessages?.[0]?.content?.slice(0, 200) || '',
        };
      })
    );

    return NextResponse.json(enriched);
  } catch (error) {
    console.error('Flagged evals error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch flagged evals' },
      { status: 500 }
    );
  }
}
