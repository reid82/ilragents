import { NextRequest, NextResponse } from 'next/server';

/**
 * Validate the bearer token from the Authorization header and return the
 * authenticated user's ID.  Returns null if validation fails.
 */
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

export async function GET(req: NextRequest) {
  const authedUserId = await getAuthenticatedUserId(req);
  if (!authedUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { getSupabaseClient } = await import('@/lib/supabase');
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('financial_positions')
      .select('structured_data, raw_transcript, summary')
      .eq('user_id', authedUserId)
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
  const authedUserId = await getAuthenticatedUserId(req);
  if (!authedUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { profile } = body;

  if (!profile) {
    return NextResponse.json({ error: 'profile is required' }, { status: 400 });
  }

  try {
    const { getSupabaseClient } = await import('@/lib/supabase');
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from('financial_positions')
      .update({
        structured_data: profile,
        summary: profile.summary,
      })
      .eq('user_id', authedUserId);

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
