'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare } from "lucide-react";
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { useAuthStore } from '@/lib/stores/auth-store';

export default function LoginPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      router.replace('/');
    }
  }, [user, router]);

  if (user) {
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        throw new Error('Authentication is not configured');
      }

      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) throw signUpError;

        // Create user_profiles row with display name
        await fetch('/api/user/ensure-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ display_name: fullName.trim() || undefined }),
        });

        router.push('/onboarding/welcome');
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;

        // Ensure profile exists for returning users (backfill)
        await fetch('/api/user/ensure-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });

        router.push('/');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-8 pb-safe" style={{ background: "var(--surface-0)", color: "var(--text-primary)" }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center mx-auto"
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "14px",
              background: "linear-gradient(135deg, var(--primary), var(--primary-hover))",
              boxShadow: "0 8px 32px rgba(16, 185, 129, 0.2)",
            }}
          >
            <MessageSquare className="w-6 h-6 text-white" />
          </div>
          <h1
            className="text-2xl font-bold mt-4"
            style={{ color: "var(--text-primary)" }}
          >
            ILR Edge
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            {isSignUp ? "Create your account" : "Your AI property investment advisor"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {isSignUp && (
            <div>
              <label htmlFor="fullName" className="block text-[13px] font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>
                Full Name
              </label>
              <input
                id="fullName"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-xl px-4 py-3.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-transparent"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)" }}
                placeholder="Your full name"
              />
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-[13px] font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl px-4 py-3.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-transparent"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)" }}
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-[13px] font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl px-4 py-3.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-transparent"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)" }}
              placeholder="At least 6 characters"
            />
          </div>

          {error && (
            <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full disabled:opacity-50 disabled:cursor-not-allowed text-white py-4 rounded-xl text-[15px] font-semibold transition-colors"
            style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))' }}
          >
            {loading ? 'Please wait...' : isSignUp ? 'Sign Up' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
            }}
            className="text-sm transition-colors" style={{ color: "var(--text-secondary)" }}
          >
            {isSignUp
              ? <>Already have an account? <span style={{ color: "var(--primary)" }}>Sign in</span></>
              : <>Don&apos;t have an account? <span style={{ color: "var(--primary)" }}>Sign up</span></>}
          </button>
        </div>

      </div>
    </div>
  );
}
