"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { getAdvisors, getFacilitator } from "@/lib/agents";
import type { AgentDef } from "@/lib/agents";
import AgentAvatar from "@/components/AgentAvatar";
import { useSessionStore } from "@/lib/stores/session-store";
import { useClientProfileStore } from "@/lib/stores/financial-store";
import { useChatStore } from "@/lib/stores/chat-store";
import { useAuthStore } from "@/lib/stores/auth-store";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { TEST_PROFILES } from "@/lib/test-profiles";
import ProfileModal from "@/components/ProfileModal";
import ConfirmDialog from "@/components/ConfirmDialog";

function AgentCard({ agent, locked }: { agent: AgentDef; locked?: boolean }) {
  if (locked) {
    return (
      <div className="relative rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 opacity-50 cursor-not-allowed">
        <div className="absolute top-3 right-3 text-zinc-600 text-sm">
          Locked
        </div>
        <div className="flex items-center gap-3 mb-3">
          <AgentAvatar agent={agent} size="sm" className="grayscale" />
          <div>
            <h3 className="font-semibold text-zinc-400">{agent.name}</h3>
            <p className="text-xs text-zinc-600">{agent.domain}</p>
          </div>
        </div>
        <p className="text-sm text-zinc-600 leading-relaxed">
          {agent.description}
        </p>
      </div>
    );
  }

  return (
    <Link
      href={`/chat/${agent.id}`}
      className="group block rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 transition-all hover:border-zinc-600 hover:bg-zinc-900"
      style={{
        borderTopColor: agent.color,
        borderTopWidth: "2px",
      }}
    >
      <div className="flex items-center gap-3 mb-3">
        <AgentAvatar agent={agent} size="sm" className="transition-transform group-hover:scale-110" />
        <div>
          <h3 className="font-semibold text-white group-hover:text-white">
            {agent.name}
          </h3>
          <p className="text-xs text-zinc-400">{agent.domain}</p>
        </div>
      </div>
      <p className="text-sm text-zinc-400 leading-relaxed group-hover:text-zinc-300">
        {agent.description}
      </p>
    </Link>
  );
}

function AdvisorGrid({
  agents,
  locked,
}: {
  agents: AgentDef[];
  locked?: boolean;
}) {
  return (
    <section className="mb-12">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h2 className="text-xl font-bold text-white">Your Advisors</h2>
          {locked && (
            <span className="text-xs bg-zinc-800 text-zinc-500 px-2 py-0.5 rounded-full">
              Complete onboarding first
            </span>
          )}
        </div>
        <p className="text-sm text-zinc-500">
          Specialist advisors for sourcing, managing, and structuring property investments
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} locked={locked} />
        ))}
      </div>
    </section>
  );
}

export default function HomePage() {
  const facilitator = getFacilitator();
  const advisors = getAdvisors();
  const isOnboarded = useSessionStore((s) => s.isOnboarded);
  const setOnboarded = useSessionStore((s) => s.setOnboarded);
  const setSessionId = useSessionStore((s) => s.setSessionId);
  const setProfile = useClientProfileStore((s) => s.setProfile);
  const financialClear = useClientProfileStore((s) => s.clear);
  const currentProfile = useClientProfileStore((s) => s.profile);
  const savedProfile = useClientProfileStore((s) => s.savedProfile);
  const saveCurrentProfile = useClientProfileStore((s) => s.saveCurrentProfile);
  const restoreSavedProfile = useClientProfileStore((s) => s.restoreSavedProfile);
  const clearSavedProfile = useClientProfileStore((s) => s.clearSavedProfile);
  const clearAllChats = useChatStore((s) => s.clearAllChats);
  const user = useAuthStore((s) => s.user);
  const sessionId = useSessionStore((s) => s.sessionId);
  const [showDevPanel, setShowDevPanel] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"reset" | null>(null);

  const isTestSession = sessionId?.startsWith("test-") ?? false;

  // Hydration guard: Zustand persist reads from localStorage async
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  function activateProfile(profileId: string) {
    const profile = TEST_PROFILES.find((p) => p.id === profileId);
    if (!profile) return;

    // Save real profile before switching to test
    if (currentProfile && sessionId && !sessionId.startsWith("test-")) {
      saveCurrentProfile(sessionId);
    }

    setProfile(profile.profile);
    setSessionId(`test-${profile.id}`);
    setOnboarded(true);
    setShowDevPanel(false);
  }

  function restoreMyProfile() {
    const restoredSessionId = restoreSavedProfile();
    if (!restoredSessionId) return;
    clearAllChats();
    setSessionId(restoredSessionId);
    setOnboarded(true);
    setShowDevPanel(false);
  }

  function handleResetClick() {
    setConfirmAction("reset");
  }

  function confirmReset() {
    financialClear();
    clearSavedProfile();
    clearAllChats();
    setOnboarded(false);
    setShowDevPanel(false);
    setConfirmAction(null);
  }

  function hardReset() {
    financialClear();
    clearSavedProfile();
    clearAllChats();
    setOnboarded(false);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 px-4 sm:px-6 py-5">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-white rounded-lg px-3 py-1.5 flex-shrink-0">
                <Image src="/ilre-logo.png" alt="I Love Real Estate" width={120} height={56} className="h-8 w-auto" />
              </div>
              <p className="text-zinc-400 text-sm hidden sm:block">
                Your AI-powered property investment advisory team
              </p>
            </div>
            <div className="flex items-center gap-3">
              {user ? (
                <>
                  <span className="text-sm text-zinc-400 hidden sm:inline">
                    {user.email}
                  </span>
                  {hydrated && isOnboarded && currentProfile && (
                    <button
                      onClick={() => setShowProfile(true)}
                      className="text-sm text-zinc-400 hover:text-white bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 transition-colors"
                    >
                      My Financial Position
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      const supabase = getSupabaseBrowserClient();
                      await supabase?.auth.signOut();
                      hardReset();
                    }}
                    className="text-sm text-zinc-400 hover:text-white bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 transition-colors"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  className="text-sm text-zinc-400 hover:text-white bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 transition-colors"
                >
                  Sign In
                </Link>
              )}
            </div>
          </div>
          {/* Dev tools */}
          {hydrated && (
            <div className="mt-2">
              <button
                onClick={() => setShowDevPanel(!showDevPanel)}
                className="text-xs text-amber-500/70 hover:text-amber-400 transition-colors"
              >
                [Dev: Test Profiles{currentProfile ? ` - ${isTestSession ? currentProfile.personal.firstName : `User: ${currentProfile.personal.firstName}`}` : ''}]
              </button>
              {showDevPanel && (
                <div className="mt-3 bg-zinc-900 border border-zinc-700 rounded-lg p-4 max-w-2xl">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-zinc-300">
                      Select a test user profile
                    </span>
                    {isOnboarded && (
                      <button
                        onClick={handleResetClick}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Reset / Lock
                      </button>
                    )}
                  </div>
                  {/* User's own profile -- show when saved (test mode) or active (non-test) */}
                  {savedProfile && isTestSession ? (
                    <button
                      onClick={restoreMyProfile}
                      className="w-full mb-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-300 text-sm font-medium text-left hover:bg-green-500/20 transition-colors"
                    >
                      <div className="font-medium">User Profile: {savedProfile.personal.firstName}</div>
                      <div className="text-xs text-green-400/60 mt-0.5">
                        {savedProfile.personal.state}, ${(savedProfile.employment.grossAnnualIncome / 1000).toFixed(0)}k income, {savedProfile.portfolio.investmentProperties.length} investment {savedProfile.portfolio.investmentProperties.length === 1 ? 'property' : 'properties'}
                      </div>
                    </button>
                  ) : currentProfile && isOnboarded && !isTestSession ? (
                    <div
                      className="w-full mb-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-300 text-sm font-medium text-left"
                    >
                      <div className="font-medium">User Profile: {currentProfile.personal.firstName}</div>
                      <div className="text-xs text-green-400/60 mt-0.5">
                        {currentProfile.personal.state}, ${(currentProfile.employment.grossAnnualIncome / 1000).toFixed(0)}k income, {currentProfile.portfolio.investmentProperties.length} investment {currentProfile.portfolio.investmentProperties.length === 1 ? 'property' : 'properties'}
                      </div>
                    </div>
                  ) : null}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {TEST_PROFILES.map((profile) => (
                      <button
                        key={profile.id}
                        onClick={() => activateProfile(profile.id)}
                        className={`text-left p-3 rounded-lg border transition-colors ${
                          currentProfile?.summary === profile.profile.summary
                            ? 'border-red-500 bg-red-500/10'
                            : 'border-zinc-700 hover:border-zinc-500 bg-zinc-800/50'
                        }`}
                      >
                        <div className="text-sm font-medium text-zinc-200">
                          {profile.label}
                        </div>
                        <div className="text-xs text-zinc-500 mt-0.5">
                          {profile.description}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Baseline Ben - Hero Section */}
        <section className="mb-12">
          <Link
            href={isOnboarded ? `/chat/${facilitator.id}` : (user ? '/onboarding' : '/login')}
            className="group block rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-5 sm:p-8 transition-all hover:border-red-500/50 hover:shadow-lg hover:shadow-red-500/5"
            style={{ borderTopColor: facilitator.color, borderTopWidth: "3px" }}
          >
            <div className="flex items-start gap-5">
              <AgentAvatar agent={facilitator} size="md" className="flex-shrink-0 transition-transform group-hover:scale-110" />
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-2xl font-bold">{facilitator.name}</h2>
                  <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">
                    Start Here
                  </span>
                </div>
                <p className="text-zinc-400 text-sm mb-3">
                  {facilitator.domain}
                </p>
                <p className="text-zinc-300 leading-relaxed">
                  {facilitator.description}
                </p>
                <div className="mt-4 flex items-center gap-2 text-red-400 text-sm font-medium">
                  <span className="group-hover:underline">
                    {isOnboarded
                      ? "Continue conversation"
                      : "Begin your assessment"}
                  </span>
                  <span className="transition-transform group-hover:translate-x-1">
                    &rarr;
                  </span>
                </div>
              </div>
            </div>
          </Link>
        </section>

        {/* Advisor Grid */}
        <AdvisorGrid
          agents={advisors}
          locked={hydrated ? !isOnboarded : true}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 px-6 py-4 mt-8">
        <div className="max-w-6xl mx-auto text-center text-xs text-zinc-600">
          I Love Real Estate. AI-assisted, not financial advice.
        </div>
      </footer>

      {showProfile && currentProfile && (
        <ProfileModal
          profile={currentProfile}
          onSave={async (updated) => {
            setProfile(updated);
            // Persist to DB if user is authenticated
            if (user) {
              try {
                const supabase = getSupabaseBrowserClient();
                const session = (await supabase?.auth.getSession())?.data.session;
                if (session?.access_token) {
                  await fetch('/api/user/profile', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({ profile: updated }),
                  });
                }
              } catch (err) {
                console.error('Failed to save profile to DB:', err);
              }
            }
          }}
          onClose={() => setShowProfile(false)}
        />
      )}

      {confirmAction === "reset" && (
        <ConfirmDialog
          title="Clear Your Profile"
          message="This will clear your financial profile and all chat history. You will need to go through onboarding again. Are you sure?"
          confirmLabel="Clear Everything"
          variant="danger"
          onConfirm={confirmReset}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}
