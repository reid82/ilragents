import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  try {
    const { getSupabaseClient } = await import('@/lib/supabase');
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
