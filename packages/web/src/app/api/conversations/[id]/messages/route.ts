import { NextRequest, NextResponse } from 'next/server';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '../../.env') });

async function getAuthenticatedUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const { getSupabaseClient } = await import('@/lib/supabase');
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { role, content, sources, referrals } = body;

    if (!role || !content) {
      return NextResponse.json({ error: 'role and content are required' }, { status: 400 });
    }

    if (!['user', 'assistant'].includes(role)) {
      return NextResponse.json({ error: 'role must be user or assistant' }, { status: 400 });
    }

    const { getSupabaseClient } = await import('@/lib/supabase');
    const supabase = getSupabaseClient();

    // Verify conversation ownership
    const { data: conv, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (convError || !conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Insert the message
    const { data: message, error: msgError } = await supabase
      .from('conversation_messages')
      .insert({
        conversation_id: id,
        role,
        content,
        sources: sources || null,
        referrals: referrals || null,
      })
      .select('id, role, content, sources, referrals, created_at')
      .single();

    if (msgError) {
      console.error('Failed to insert message:', msgError);
      return NextResponse.json({ error: 'Failed to save message' }, { status: 500 });
    }

    // Update conversation's updated_at
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId);

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    console.error('Message insert error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
