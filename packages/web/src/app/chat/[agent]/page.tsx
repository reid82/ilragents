"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getAgentById } from "@/lib/agents";
import ChatPanel from "@/components/ChatPanel";
import { use } from "react";

export default function ChatPage({
  params,
}: {
  params: Promise<{ agent: string }>;
}) {
  const { agent: agentSlug } = use(params);
  const agent = getAgentById(agentSlug);
  const searchParams = useSearchParams();
  const initialPrompt = searchParams.get("prompt") || undefined;
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  if (!agent) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Agent not found</h1>
          <Link href="/" className="text-red-400 hover:underline">
            Back to Round Table
          </Link>
        </div>
      </div>
    );
  }

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="animate-pulse text-zinc-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col">
      <ChatPanel agentSlug={agentSlug} agent={agent} showBackLink initialPrompt={initialPrompt} />
    </div>
  );
}
