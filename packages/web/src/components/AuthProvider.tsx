'use client';

import { useEffect } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useSessionStore } from '@/lib/stores/session-store';
import { useClientProfileStore } from '@/lib/stores/financial-store';

async function loadProfileFromDB(userId: string) {
  const res = await fetch(`/api/user/profile?userId=${userId}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.profile ?? null;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const setUser = useAuthStore((s) => s.setUser);
  const setLoading = useAuthStore((s) => s.setLoading);
  const setSessionId = useSessionStore((s) => s.setSessionId);
  const setOnboarded = useSessionStore((s) => s.setOnboarded);
  const setProfile = useClientProfileStore((s) => s.setProfile);
  const setRawTranscript = useClientProfileStore((s) => s.setRawTranscript);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user ?? null;
      setUser(user);

      if (user) {
        // Hydrate stores from DB for returning users
        setSessionId(user.id);
        loadProfileFromDB(user.id).then((profile) => {
          if (profile) {
            setProfile(profile.structured_data);
            if (profile.raw_transcript) {
              setRawTranscript(profile.raw_transcript);
            }
            setOnboarded(true);
          }
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const user = session?.user ?? null;
        setUser(user);

        if (user) {
          setSessionId(user.id);
          const profile = await loadProfileFromDB(user.id);
          if (profile) {
            setProfile(profile.structured_data);
            if (profile.raw_transcript) {
              setRawTranscript(profile.raw_transcript);
            }
            setOnboarded(true);
          }
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [setUser, setLoading, setSessionId, setOnboarded, setProfile, setRawTranscript]);

  return <>{children}</>;
}
