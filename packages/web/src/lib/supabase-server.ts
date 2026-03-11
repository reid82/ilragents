import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Create a Supabase client for API route handlers that reads the user session
 * from cookies (set by @supabase/ssr on the browser side).
 *
 * Returns null if env vars are missing.
 */
export async function createSupabaseRouteClient(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });
}

/**
 * Get the authenticated user ID from cookies. Use this in API route handlers
 * instead of reading the Authorization header.
 *
 * Returns null if unauthenticated.
 */
export async function getAuthenticatedUserId(): Promise<string | null> {
  const supabase = await createSupabaseRouteClient();
  if (!supabase) return null;

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user.id;
}
