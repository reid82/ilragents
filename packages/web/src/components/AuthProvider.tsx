'use client';

import { useEffect } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useSessionStore } from '@/lib/stores/session-store';
import { useClientProfileStore } from '@/lib/stores/financial-store';

async function loadProfileFromDB() {
  const res = await fetch('/api/user/profile');
  if (!res.ok) return null;
  const data = await res.json();
  return data.profile ?? null;
}

/** Wait for Zustand persist stores to finish hydrating from localStorage */
function waitForHydration(): Promise<void> {
  return new Promise((resolve) => {
    // Check if already hydrated
    if (
      useSessionStore.persist.hasHydrated() &&
      useClientProfileStore.persist.hasHydrated()
    ) {
      resolve();
      return;
    }
    // Wait for both stores to hydrate
    let sessionReady = useSessionStore.persist.hasHydrated();
    let profileReady = useClientProfileStore.persist.hasHydrated();
    const check = () => {
      if (sessionReady && profileReady) resolve();
    };
    if (!sessionReady) {
      useSessionStore.persist.onFinishHydration(() => {
        sessionReady = true;
        check();
      });
    }
    if (!profileReady) {
      useClientProfileStore.persist.onFinishHydration(() => {
        profileReady = true;
        check();
      });
    }
  });
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

    if (!supabase) {
      // Auth not configured -- skip silently
      setLoading(false);
      return;
    }

    // Wait for persist stores to hydrate from localStorage before loading
    // from DB, otherwise the DB values get overwritten by stale localStorage
    waitForHydration().then(() => {
      // Get initial session
      supabase.auth.getSession().then(({ data: { session } }) => {
        const user = session?.user ?? null;
        setUser(user);

        if (user) {
          // Hydrate stores from DB for returning users
          setSessionId(user.id);
          loadProfileFromDB().then((profile) => {
            if (profile) {
              setProfile(profile.structured_data);
              if (profile.raw_transcript) {
                setRawTranscript(profile.raw_transcript);
              }
              useClientProfileStore.getState().clearSavedProfile();
              setOnboarded(true);
            }
            setLoading(false);
          });
        } else {
          setLoading(false);
        }
      });
    });

    // Listen for auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const user = session?.user ?? null;
        setUser(user);

        if (user) {
          setSessionId(user.id);
          const profile = await loadProfileFromDB();
          if (profile) {
            setProfile(profile.structured_data);
            if (profile.raw_transcript) {
              setRawTranscript(profile.raw_transcript);
            }
            useClientProfileStore.getState().clearSavedProfile();
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
