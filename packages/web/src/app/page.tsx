"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { getAgentsByTable, getFacilitator } from "@/lib/agents";
import type { AgentDef } from "@/lib/agents";
import { useSessionStore } from "@/lib/stores/session-store";

function AgentCard({ agent, locked }: { agent: AgentDef; locked?: boolean }) {
  const initials = agent.name
    .split(" ")
    .map((w) => w[0])
    .join("");

  if (locked) {
    return (
      <div className="relative rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 opacity-50 cursor-not-allowed">
        <div className="absolute top-3 right-3 text-zinc-600 text-sm">
          Locked
        </div>
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm grayscale"
            style={{ backgroundColor: agent.color }}
          >
            {initials}
          </div>
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
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm transition-transform group-hover:scale-110"
          style={{ backgroundColor: agent.color }}
        >
          {initials}
        </div>
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

function AgentTable({
  title,
  subtitle,
  agents,
  locked,
}: {
  title: string;
  subtitle: string;
  agents: AgentDef[];
  locked?: boolean;
}) {
  return (
    <section className="mb-12">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          {locked && (
            <span className="text-xs bg-zinc-800 text-zinc-500 px-2 py-0.5 rounded-full">
              Complete onboarding first
            </span>
          )}
        </div>
        <p className="text-sm text-zinc-500">{subtitle}</p>
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
  const strategyAgents = getAgentsByTable("strategy");
  const portfolioAgents = getAgentsByTable("portfolio");
  const isOnboarded = useSessionStore((s) => s.isOnboarded);
  const setOnboarded = useSessionStore((s) => s.setOnboarded);

  // Hydration guard: Zustand persist reads from localStorage async
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 px-4 sm:px-6 py-5">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold tracking-tight">ILRE Agents</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Real estate investment specialists powered by I Love Real Estate
            materials
          </p>
          {/* Dev toggle */}
          {hydrated && (
            <button
              onClick={() => setOnboarded(!isOnboarded)}
              className="mt-2 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              [Dev: {isOnboarded ? "Lock tables" : "Unlock tables"}]
            </button>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Baseline Ben - Hero Section */}
        <section className="mb-12">
          <Link
            href={isOnboarded ? `/chat/${facilitator.id}` : '/onboarding'}
            className="group block rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-5 sm:p-8 transition-all hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/5"
            style={{ borderTopColor: facilitator.color, borderTopWidth: "3px" }}
          >
            <div className="flex items-start gap-5">
              <div
                className="w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-white font-bold text-lg sm:text-xl flex-shrink-0 transition-transform group-hover:scale-110"
                style={{ backgroundColor: facilitator.color }}
              >
                {facilitator.name
                  .split(" ")
                  .map((w) => w[0])
                  .join("")}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-2xl font-bold">{facilitator.name}</h2>
                  <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
                    Start Here
                  </span>
                </div>
                <p className="text-zinc-400 text-sm mb-3">
                  {facilitator.domain}
                </p>
                <p className="text-zinc-300 leading-relaxed">
                  {facilitator.description}
                </p>
                <div className="mt-4 flex items-center gap-2 text-blue-400 text-sm font-medium">
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

        {/* Investment Strategies Table */}
        <AgentTable
          title="Investment Strategies"
          subtitle="Specialist agents for structuring and sourcing investments"
          agents={strategyAgents}
          locked={hydrated ? !isOnboarded : true}
        />

        {/* Portfolio Management Table */}
        <AgentTable
          title="Portfolio Management"
          subtitle="Specialist agents for managing and growing your portfolio"
          agents={portfolioAgents}
          locked={hydrated ? !isOnboarded : true}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 px-6 py-4 mt-8">
        <div className="max-w-6xl mx-auto text-center text-xs text-zinc-600">
          Powered by I Love Real Estate materials. AI-assisted, not financial
          advice.
        </div>
      </footer>
    </div>
  );
}
