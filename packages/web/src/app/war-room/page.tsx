"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { AGENTS, getAgentById, getAdvisors, getFacilitator } from "@/lib/agents";
import { useSessionStore } from "@/lib/stores/session-store";
import { useClientProfileStore } from "@/lib/stores/financial-store";
import { useChatStore } from "@/lib/stores/chat-store";
import { useAuthStore } from "@/lib/stores/auth-store";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { TEST_PROFILES } from "@/lib/test-profiles";
import WarRoomTable from "@/components/WarRoomTable";
import AgentStrip from "@/components/AgentStrip";
import ChatPanel from "@/components/ChatPanel";
import ProfileModal from "@/components/ProfileModal";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function WarRoomPage() {
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

  const [activeAgentId, setActiveAgentId] = useState(facilitator.id);
  const [showDevPanel, setShowDevPanel] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"reset" | null>(null);

  const isTestSession = sessionId?.startsWith("test-") ?? false;

  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const activeAgent = getAgentById(activeAgentId);
  const lockedAgentIds = isOnboarded
    ? []
    : advisors.map((a) => a.id);

  function handleSelectAgent(agentId: string) {
    if (lockedAgentIds.includes(agentId)) return;
    setActiveAgentId(agentId);
  }

  function activateProfile(profileId: string) {
    const profile = TEST_PROFILES.find((p) => p.id === profileId);
    if (!profile) return;

    // Save real profile before switching to test
    if (currentProfile && sessionId && !sessionId.startsWith("test-")) {
      saveCurrentProfile(sessionId);
    }

    clearAllChats();
    setProfile(profile.profile);
    setSessionId(`test-${profile.id}`);
    setOnboarded(true);
    setActiveAgentId(facilitator.id);
    setShowDevPanel(false);
  }

  function restoreMyProfile() {
    const restoredSessionId = restoreSavedProfile();
    if (!restoredSessionId) return;
    clearAllChats();
    setSessionId(restoredSessionId);
    setOnboarded(true);
    setActiveAgentId(facilitator.id);
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
    setActiveAgentId(facilitator.id);
    setShowDevPanel(false);
    setConfirmAction(null);
  }

  function hardReset() {
    financialClear();
    clearSavedProfile();
    clearAllChats();
    setOnboarded(false);
    setActiveAgentId(facilitator.id);
  }

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="animate-pulse text-zinc-500">Loading...</div>
      </div>
    );
  }

  if (!activeAgent) return null;

  return (
    <div className="h-screen bg-zinc-950 text-white flex flex-col md:flex-row overflow-hidden">
      {/* Desktop: Left panel - War Room Table */}
      <div className="hidden md:flex flex-col w-80 border-r border-zinc-800 flex-shrink-0">
        {/* Auth bar */}
        <div className="border-b border-zinc-800 px-3 py-2 flex items-center justify-between">
          {user ? (
            <>
              <span className="text-xs text-zinc-400 truncate mr-2">
                {user.email}
              </span>
              <div className="flex items-center gap-2">
                {isOnboarded && currentProfile && (
                  <button
                    onClick={() => setShowProfile(true)}
                    className="text-xs text-zinc-400 hover:text-white whitespace-nowrap"
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
                  className="text-xs text-zinc-400 hover:text-white whitespace-nowrap"
                >
                  Sign Out
                </button>
              </div>
            </>
          ) : (
            <Link
              href="/login"
              className="text-xs text-zinc-400 hover:text-white"
            >
              Sign In
            </Link>
          )}
        </div>
        <div className="flex-1 relative">
          <WarRoomTable
            agents={AGENTS}
            activeAgentId={activeAgentId}
            lockedAgentIds={lockedAgentIds}
            onSelectAgent={handleSelectAgent}
          />
        </div>

        {/* Profile switcher - bottom of left panel */}
        <div className="border-t border-zinc-800 px-3 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-amber-400 tracking-wide">
              TEST AS
            </span>
            {isOnboarded && (
              <button
                onClick={handleResetClick}
                className="text-xs text-red-400 hover:text-red-300 px-2 py-0.5 rounded border border-red-500/30 hover:bg-red-500/10 transition-colors"
              >
                Reset
              </button>
            )}
          </div>
          {currentProfile && (
            <button
              onClick={() => setShowProfile(true)}
              className="w-full mb-2 px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium text-left hover:bg-amber-500/20 transition-colors"
            >
              {currentProfile.personal.firstName} - {currentProfile.personal.state}, ${(currentProfile.employment.grossAnnualIncome / 1000).toFixed(0)}k
            </button>
          )}
          {savedProfile && isTestSession && (
            <button
              onClick={restoreMyProfile}
              className="w-full mb-2 px-2 py-1.5 rounded bg-green-500/10 border border-green-500/30 text-green-300 text-xs font-medium text-left hover:bg-green-500/20 transition-colors"
            >
              <div className="font-medium">My Profile</div>
              <div className="text-[10px] text-green-400/60 mt-0.5">
                {savedProfile.personal.firstName} - {savedProfile.personal.state}, ${(savedProfile.employment.grossAnnualIncome / 1000).toFixed(0)}k
              </div>
            </button>
          )}
          <button
            onClick={() => setShowDevPanel(!showDevPanel)}
            className="w-full text-left text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded px-3 py-2 transition-colors border border-zinc-700"
          >
            {showDevPanel ? "Hide profiles" : "Switch profile..."}
          </button>
          {showDevPanel && (
            <div className="mt-2 space-y-1">
              {TEST_PROFILES.map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => activateProfile(profile.id)}
                  className={`w-full text-left px-3 py-2 rounded text-xs transition-colors ${
                    currentProfile?.summary === profile.profile.summary
                      ? "bg-red-500/20 text-red-300 border border-red-500/30"
                      : "text-zinc-300 hover:text-white hover:bg-zinc-800 border border-zinc-800"
                  }`}
                >
                  <div className="font-medium">{profile.label}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">{profile.description}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mobile: Top agent strip + dev tools */}
      <div className="md:hidden">
        <AgentStrip
          agents={AGENTS}
          activeAgentId={activeAgentId}
          lockedAgentIds={lockedAgentIds}
          onSelectAgent={handleSelectAgent}
        />
        <div className="border-b border-zinc-800 px-4 py-2 flex items-center gap-2">
          <button
            onClick={() => setShowDevPanel(!showDevPanel)}
            className="text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded px-3 py-1.5 transition-colors border border-zinc-700"
          >
            {currentProfile ? currentProfile.personal.firstName : "Pick profile"}
          </button>
          {currentProfile && (
            <span className="text-[10px] text-amber-400/80">
              {currentProfile.personal.state}, ${(currentProfile.employment.grossAnnualIncome / 1000).toFixed(0)}k
            </span>
          )}
          {isOnboarded && (
            <button
              onClick={handleResetClick}
              className="ml-auto text-[10px] text-red-400 hover:text-red-300 px-2 py-1 rounded border border-red-500/30 hover:bg-red-500/10 transition-colors"
            >
              Reset
            </button>
          )}
        </div>
        {showDevPanel && (
          <div className="border-b border-zinc-800 px-4 py-2 bg-zinc-900/50">
            {savedProfile && isTestSession && (
              <button
                onClick={restoreMyProfile}
                className="w-full mb-2 px-2.5 py-2 rounded bg-green-500/10 border border-green-500/30 text-green-300 text-xs font-medium text-left hover:bg-green-500/20 transition-colors"
              >
                My Profile - {savedProfile.personal.firstName}, {savedProfile.personal.state}
              </button>
            )}
            <div className="grid grid-cols-2 gap-1.5">
              {TEST_PROFILES.map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => activateProfile(profile.id)}
                  className={`text-left px-2.5 py-2 rounded text-xs transition-colors ${
                    currentProfile?.summary === profile.profile.summary
                      ? "bg-red-500/20 text-red-300 border border-red-500/30"
                      : "text-zinc-300 hover:text-white hover:bg-zinc-800 border border-zinc-800"
                  }`}
                >
                  {profile.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right panel - Chat */}
      <div className="flex-1 flex flex-col min-w-0">
        <ChatPanel
          key={activeAgentId}
          agentSlug={activeAgentId}
          agent={activeAgent}
        />
      </div>

      {showProfile && currentProfile && (
        <ProfileModal
          profile={currentProfile}
          onSave={(updated) => setProfile(updated)}
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
