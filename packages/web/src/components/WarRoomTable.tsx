"use client";

import type { AgentDef } from "@/lib/agents";
import AgentAvatar from "@/components/AgentAvatar";
import "./war-room-table.css";

interface WarRoomTableProps {
  agents: AgentDef[];
  activeAgentId: string;
  lockedAgentIds: string[];
  onSelectAgent: (agentId: string) => void;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function placeOnCircle(index: number, total: number, radius: number) {
  const angle = (2 * Math.PI / total) * index - Math.PI / 2;
  return {
    left: `calc(50% + ${Math.cos(angle) * radius}px)`,
    top: `calc(50% + ${Math.sin(angle) * radius}px)`,
  };
}

export default function WarRoomTable({
  agents,
  activeAgentId,
  lockedAgentIds,
  onSelectAgent,
}: WarRoomTableProps) {
  const activeAgent = agents.find((a) => a.id === activeAgentId);
  const sweepColor = activeAgent
    ? hexToRgba(activeAgent.color, 0.3)
    : "rgba(59, 130, 246, 0.3)";

  // Facilitator first (12 o'clock), then advisors
  const orderedAgents = [
    ...agents.filter((a) => a.isFacilitator),
    ...agents.filter((a) => !a.isFacilitator),
  ];

  const tableRadius = 100;

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-zinc-950">
      {/* Grid overlay */}
      <svg
        className="absolute inset-0 w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="war-room-grid"
            width="40"
            height="40"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke="rgba(0,255,100,0.06)"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#war-room-grid)" />
      </svg>

      {/* Table circle */}
      <div
        className="relative rounded-full"
        style={{
          width: tableRadius * 2 + 80,
          height: tableRadius * 2 + 80,
          background:
            "radial-gradient(circle, #0a0a0f 0%, #111118 60%, #1a1a24 100%)",
          border: "1px solid rgba(0, 255, 100, 0.15)",
          backgroundImage: `
            radial-gradient(circle, #0a0a0f 0%, #111118 60%, #1a1a24 100%),
            repeating-radial-gradient(
              circle,
              transparent 0px,
              transparent 38px,
              rgba(0, 255, 100, 0.08) 38px,
              rgba(0, 255, 100, 0.08) 40px
            )
          `,
        }}
      >
        {/* Radar sweep */}
        <div
          className="radar-sweep"
          style={{ "--sweep-color": sweepColor } as React.CSSProperties}
        />

        {/* Centre crosshair */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-3 h-px bg-green-500/20" />
          <div className="absolute w-px h-3 bg-green-500/20" />
        </div>

        {/* Agent seats */}
        {orderedAgents.map((agent, i) => {
          const isActive = agent.id === activeAgentId;
          const isLocked = lockedAgentIds.includes(agent.id);
          const pos = placeOnCircle(i, orderedAgents.length, tableRadius);

          return (
            <div key={agent.id} className="absolute" style={{ ...pos, transform: "translate(-50%, -50%)" }}>
              {/* ACTIVE label */}
              {isActive && (
                <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-mono tracking-widest text-green-500/70 whitespace-nowrap">
                  ACTIVE
                </span>
              )}
              <button
                onClick={() => !isLocked && onSelectAgent(agent.id)}
                disabled={isLocked}
                className={`
                  relative w-11 h-11 rounded-full flex items-center justify-center
                  transition-all duration-200
                  ${isActive ? "scale-115 z-10" : ""}
                  ${isLocked ? "grayscale cursor-not-allowed opacity-40" : ""}
                  ${!isActive && !isLocked ? "opacity-60 hover:opacity-100 cursor-pointer" : ""}
                `}
                style={
                  isActive
                    ? { "--seat-color": hexToRgba(agent.color, 0.7) } as React.CSSProperties
                    : {}
                }
                title={`${agent.name} - ${agent.domain}`}
              >
                {/* Glow ring behind active seat */}
                {isActive && (
                  <div
                    className="seat-pulse absolute inset-[-4px] rounded-full"
                    style={{
                      "--seat-color": hexToRgba(agent.color, 0.7),
                      border: `2px solid ${hexToRgba(agent.color, 0.5)}`,
                    } as React.CSSProperties}
                  />
                )}
                <AgentAvatar agent={agent} size="sm" className="w-11 h-11 relative z-10" />
              </button>
              {/* Agent name below seat */}
              <span
                className={`
                  absolute top-full mt-1 left-1/2 -translate-x-1/2
                  text-[10px] whitespace-nowrap font-medium
                  ${isActive ? "text-zinc-300" : "text-zinc-600"}
                `}
              >
                {agent.name.split(" ")[0]}
              </span>
            </div>
          );
        })}
      </div>

      {/* HUD corner brackets */}
      <svg className="absolute top-3 left-3 w-4 h-4" viewBox="0 0 16 16">
        <path d="M0 12 V0 H12" fill="none" stroke="rgba(0,255,100,0.25)" strokeWidth="1" />
      </svg>
      <svg className="absolute top-3 right-3 w-4 h-4" viewBox="0 0 16 16">
        <path d="M16 12 V0 H4" fill="none" stroke="rgba(0,255,100,0.25)" strokeWidth="1" />
      </svg>
      <svg className="absolute bottom-3 left-3 w-4 h-4" viewBox="0 0 16 16">
        <path d="M0 4 V16 H12" fill="none" stroke="rgba(0,255,100,0.25)" strokeWidth="1" />
      </svg>
      <svg className="absolute bottom-3 right-3 w-4 h-4" viewBox="0 0 16 16">
        <path d="M16 4 V16 H4" fill="none" stroke="rgba(0,255,100,0.25)" strokeWidth="1" />
      </svg>

      {/* Scanlines */}
      <div className="scanlines rounded-lg" />
    </div>
  );
}
