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

    // Fetch conversation details
    const { data: conversation, error: convoError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', id)
      .single();

    if (convoError) throw convoError;

    // Fetch messages
    const { data: messages, error: msgError } = await supabase
      .from('conversation_messages')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });

    if (msgError) throw msgError;

    // Fetch evals for all messages in this conversation
    const { data: evals } = await supabase
      .from('message_evals')
      .select('*')
      .eq('conversation_id', id);

    // Map evals by message_id for easy lookup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evalsByMessage: Record<string, any> = {};
    for (const e of evals || []) {
      evalsByMessage[e.message_id] = e;
    }

    // Fetch user profile
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('display_name, email')
      .eq('id', conversation.user_id)
      .single();

    // Fallback to auth.users email if no user_profiles row
    let userName = profile?.display_name || profile?.email || null;
    if (!userName && conversation.user_id) {
      const { data: authUser } = await supabase.auth.admin.getUserById(conversation.user_id);
      userName = authUser?.user?.email || 'Unknown';
    }

    // Enrich messages with evals
    const enrichedMessages = (messages || []).map((msg) => ({
      ...msg,
      eval: evalsByMessage[msg.id] || null,
    }));

    return NextResponse.json({
      ...conversation,
      user_name: userName,
      messages: enrichedMessages,
    });
  } catch (error) {
    console.error('Admin conversation detail error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch conversation' },
      { status: 500 }
    );
  }
}
