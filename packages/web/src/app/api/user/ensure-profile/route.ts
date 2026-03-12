import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/supabase-server';
import { getSupabaseClient } from '@/lib/supabase';

/**
 * Ensures a user_profiles row exists for the authenticated user.
 * Called after signup (with display_name) and on sign-in as a fallback.
 */
export async function POST(req: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const displayName: string | undefined = body.display_name;

  try {
    const supabase = getSupabaseClient();

    // Get the user's email from auth.users via the admin API
    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId);
    if (authError || !authUser?.user) {
      throw new Error('Failed to fetch auth user');
    }

    const email = authUser.user.email || '';

    // Check if profile already exists
    const { data: existing } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('id', userId)
      .single();

    if (existing) {
      // Update email (may have changed) but don't overwrite display_name unless provided
      const updates: Record<string, string> = { email, updated_at: new Date().toISOString() };
      if (displayName) updates.display_name = displayName;

      const { error } = await supabase
        .from('user_profiles')
        .update(updates)
        .eq('id', userId);

      if (error) {
        console.error('Failed to update user profile:', error);
        return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
      }
    } else {
      // Create new profile
      const { error } = await supabase
        .from('user_profiles')
        .insert({
          id: userId,
          email,
          display_name: displayName || null,
        });

      if (error) {
        console.error('Failed to create user profile:', error);
        return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Ensure profile error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
