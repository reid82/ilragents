import { getAuthenticatedUserId } from './supabase-server';
import { getSupabaseClient } from './supabase';

/**
 * Check that the current request is from an authenticated admin user.
 * Returns the admin's user ID, or null if not authenticated/not admin.
 */
export async function requireAdmin(): Promise<{ userId: string } | { error: string; status: number }> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return { error: 'Unauthorized', status: 401 };
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (error || !data || data.role !== 'admin') {
    return { error: 'Forbidden', status: 403 };
  }

  return { userId };
}

/**
 * Helper to check result from requireAdmin and return a Response if it failed.
 */
export function isAdminError(result: { userId: string } | { error: string; status: number }): result is { error: string; status: number } {
  return 'error' in result;
}
