"use client";

import type { AgentDef } from "@/lib/agents";

interface AgentStripProps {
  agents: AgentDef[];
  activeAgentId: string;
  lockedAgentIds: string[];
  onSelectAgent: (agentId: string) => void;
}

export default function AgentStrip({
  agents,
  activeAgentId,
  lockedAgentIds,
  onSelectAgent,
}: AgentStripProps) {
  // Facilitator first, then advisors
  const ordered = [
    ...agents.filter((a) => a.isFacilitator),
    ...agents.filter((a) => !a.isFacilitator),
  ];

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-zinc-950 border-b border-zinc-800 overflow-x-auto">
      {ordered.map((agent) => {
        const isActive = agent.id === activeAgentId;
        const isLocked = lockedAgentIds.includes(agent.id);
        const initials = agent.name
          .split(" ")
          .map((w) => w[0])
          .join("");

        return (
          <button
            key={agent.id}
            onClick={() => !isLocked && onSelectAgent(agent.id)}
            disabled={isLocked}
            className={`
              flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center
              text-white font-bold text-xs transition-all duration-200
              ${isLocked ? "grayscale opacity-30 cursor-not-allowed" : "cursor-pointer"}
              ${isActive ? "ring-2 ring-offset-2 ring-offset-zinc-950 opacity-100" : ""}
              ${!isActive && !isLocked ? "opacity-50 hover:opacity-80" : ""}
            `}
            style={{
              backgroundColor: agent.color,
              ...(isActive ? { ringColor: agent.color } : {}),
            }}
            title={agent.name}
          >
            {initials}
          </button>
        );
      })}
    </div>
  );
}
