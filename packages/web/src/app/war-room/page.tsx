"use client";

import { useState, useSyncExternalStore } from "react";
import { AGENTS, getAgentById, getAdvisors, getFacilitator } from "@/lib/agents";
import { useSessionStore } from "@/lib/stores/session-store";
import { useClientProfileStore } from "@/lib/stores/financial-store";
import { useChatStore } from "@/lib/stores/chat-store";
import { TEST_PROFILES } from "@/lib/test-profiles";
import WarRoomTable from "@/components/WarRoomTable";
import AgentStrip from "@/components/AgentStrip";
import ChatPanel from "@/components/ChatPanel";

export default function WarRoomPage() {
  const facilitator = getFacilitator();
  const advisors = getAdvisors();

  const isOnboarded = useSessionStore((s) => s.isOnboarded);
  const setOnboarded = useSessionStore((s) => s.setOnboarded);
  const setSessionId = useSessionStore((s) => s.setSessionId);
  const setProfile = useClientProfileStore((s) => s.setProfile);
  const financialClear = useClientProfileStore((s) => s.clear);
  const currentProfile = useClientProfileStore((s) => s.profile);
  const clearAllChats = useChatStore((s) => s.clearAllChats);

  const [activeAgentId, setActiveAgentId] = useState(facilitator.id);
  const [showDevPanel, setShowDevPanel] = useState(false);

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
    setProfile(profile.profile);
    setSessionId(`test-${profile.id}`);
    setOnboarded(true);
    setShowDevPanel(false);
  }

  function resetProfile() {
    financialClear();
    clearAllChats();
    setOnboarded(false);
    setActiveAgentId(facilitator.id);
    setShowDevPanel(false);
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
        <div className="flex-1 relative">
          <WarRoomTable
            agents={AGENTS}
            activeAgentId={activeAgentId}
            lockedAgentIds={lockedAgentIds}
            onSelectAgent={handleSelectAgent}
          />
        </div>

        {/* Dev tools - bottom of left panel */}
        <div className="border-t border-zinc-800 px-3 py-2">
          <button
            onClick={() => setShowDevPanel(!showDevPanel)}
            className="text-[10px] text-amber-500/60 hover:text-amber-400 transition-colors font-mono"
          >
            [DEV]
          </button>
          {showDevPanel && (
            <div className="mt-2 bg-zinc-900 border border-zinc-700 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-medium text-zinc-400 font-mono">
                  TEST PROFILES
                </span>
                {isOnboarded && (
                  <button
                    onClick={resetProfile}
                    className="text-[10px] text-red-400 hover:text-red-300 font-mono"
                  >
                    RESET
                  </button>
                )}
              </div>
              <div className="space-y-1">
                {TEST_PROFILES.map((profile) => (
                  <button
                    key={profile.id}
                    onClick={() => activateProfile(profile.id)}
                    className={`w-full text-left px-2 py-1.5 rounded text-[11px] transition-colors ${
                      currentProfile?.summary === profile.profile.summary
                        ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                    }`}
                  >
                    {profile.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile: Top agent strip */}
      <div className="md:hidden">
        <AgentStrip
          agents={AGENTS}
          activeAgentId={activeAgentId}
          lockedAgentIds={lockedAgentIds}
          onSelectAgent={handleSelectAgent}
        />
      </div>

      {/* Right panel - Chat */}
      <div className="flex-1 flex flex-col min-w-0">
        <ChatPanel
          key={activeAgentId}
          agentSlug={activeAgentId}
          agent={activeAgent}
        />
      </div>
    </div>
  );
}
