import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAdminError } from '@/lib/admin-auth';
import { getSupabaseClient } from '@/lib/supabase';
import { triggerEval } from '@/lib/eval-pipeline';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAdminError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const { messageId } = body;

    if (!messageId) {
      return NextResponse.json({ error: 'messageId is required' }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    // Fetch the message and its conversation
    const { data: message, error: msgError } = await supabase
      .from('conversation_messages')
      .select('id, conversation_id, content, sources, created_at')
      .eq('id', messageId)
      .single();

    if (msgError || !message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    // Get conversation's user_id
    const { data: convo } = await supabase
      .from('conversations')
      .select('user_id')
      .eq('id', message.conversation_id)
      .single();

    if (!convo) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Get the user's question (previous user message)
    const { data: userMessages } = await supabase
      .from('conversation_messages')
      .select('content')
      .eq('conversation_id', message.conversation_id)
      .eq('role', 'user')
      .lt('created_at', message.created_at || new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    const query = userMessages?.[0]?.content || '';
    const sources = message.sources || [];

    // Run eval (awaited for manual trigger so we can return result)
    await triggerEval({
      messageId: message.id,
      conversationId: message.conversation_id,
      userId: convo.user_id,
      query,
      assistantText: message.content,
      sources,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Manual eval error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Eval failed' },
      { status: 500 }
    );
  }
}
