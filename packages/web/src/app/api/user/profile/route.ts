import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/supabase-server';
import { getSupabaseClient } from '@/lib/supabase';

export async function GET(_req: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('financial_positions')
      .select('structured_data, raw_transcript, summary')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Failed to load user profile:', error);
      return NextResponse.json({ profile: null });
    }

    return NextResponse.json({ profile: data });
  } catch (error) {
    console.error('Profile load error:', error);
    return NextResponse.json({ profile: null });
  }
}

export async function POST(req: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { profile } = body;

  if (!profile) {
    return NextResponse.json({ error: 'profile is required' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from('financial_positions')
      .update({
        structured_data: profile,
        summary: profile.summary,
      })
      .eq('user_id', userId);

    if (error) {
      console.error('Failed to update profile:', error);
      return NextResponse.json({ error: 'Failed to save profile' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Profile save error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
