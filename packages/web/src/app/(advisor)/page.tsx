"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConversationStore } from "@/lib/stores/conversation-store";
import { useSessionStore } from "@/lib/stores/session-store";
import { useAuthStore } from "@/lib/stores/auth-store";
import RoadmapCard from "@/components/RoadmapCard";

const CHAT_STARTERS = [
  "Analyse a property deal for me",
  "Help me build my investment portfolio",
  "How should I structure my finance?",
  "Is subdivision feasible for my property?",
  "What's my borrowing capacity?",
  "Should I set up a trust structure?",
];

const RESOURCE_CARDS = [
  {
    icon: "\u{1F3A5}",
    title: "Deal Analysis",
    description: "Step-by-step deal analysis frameworks",
    href: "#",
  },
  {
    icon: "\u{1F4CA}",
    title: "Portfolio Planning",
    description: "Build a high-performing property portfolio",
    href: "#",
  },
  {
    icon: "\u{1F3D7}\uFE0F",
    title: "Subdivision",
    description: "Maximise returns through subdivision",
    href: "#",
  },
  {
    icon: "\u{1F4B0}",
    title: "Finance Strategy",
    description: "Structure finance for growth",
    href: "#",
  },
];

export default function AdvisorLandingPage() {
  const router = useRouter();
  const createConversation = useConversationStore((s) => s.createConversation);
  const clearMessages = useConversationStore((s) => s.clearMessages);
  const isOnboarded = useSessionStore((s) => s.isOnboarded);
  const isLoading = useAuthStore((s) => s.isLoading);
  const [input, setInput] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function startConversation(prompt: string) {
    if (!prompt.trim() || isCreating) return;
    setIsCreating(true);
    clearMessages();
    try {
      const title = prompt.length > 60 ? prompt.slice(0, 57) + "..." : prompt;
      const newId = await createConversation(title);
      router.push(`/chat/${newId}?prompt=${encodeURIComponent(prompt)}`);
    } catch {
      // If unauthorized, redirect to login
      router.push("/login");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleSend() {
    const msg = input.trim();
    if (!msg) return;
    setInput("");
    await startConversation(msg);
  }

  // Show nothing while auth is loading to prevent onboarding gate flash
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-zinc-700 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  // Not onboarded: show welcome CTA
  if (!isOnboarded) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 flex flex-col items-center justify-center px-4 overflow-y-auto">
          <div className="max-w-3xl w-full py-8">
            {/* Hero */}
            <div className="text-center mb-10">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 mb-5">
                <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">
                Welcome to ILR Property Advisor
              </h1>
              <p className="text-zinc-400 text-base sm:text-lg max-w-xl mx-auto leading-relaxed mb-8">
                Your AI advisor trained on ILR's proven property investment methodology.
                To give you personalised guidance, we need to understand your financial position first.
              </p>
              <Link
                href="/onboarding"
                className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3.5 rounded-xl text-base font-medium transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Set Up Your Profile
              </Link>
              <p className="text-xs text-zinc-600 mt-4">
                Takes about 5 minutes. Our advisor Ben will walk you through it.
              </p>
            </div>

            {/* Resource cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full mb-6">
              {RESOURCE_CARDS.map((card) => (
                <a
                  key={card.title}
                  href={card.href}
                  className="flex flex-col items-center text-center p-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800 transition-colors group"
                >
                  <span className="text-2xl mb-2">{card.icon}</span>
                  <span className="text-xs font-semibold text-zinc-200 group-hover:text-white mb-1">
                    {card.title}
                  </span>
                  <span className="text-[11px] text-zinc-500 leading-tight hidden sm:block">
                    {card.description}
                  </span>
                </a>
              ))}
            </div>

            <p className="text-xs text-zinc-600 text-center max-w-md mx-auto">
              Trained on ILR's methodology. Always verify with your professional team.
              This is not financial advice.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Onboarded: full advisor experience
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 flex flex-col items-center justify-center px-4 overflow-y-auto">
        <div className="max-w-3xl w-full py-8">
          {/* Hero */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 mb-5">
              <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">
              ILR Property Advisor
            </h1>
            <p className="text-zinc-400 text-base sm:text-lg max-w-xl mx-auto leading-relaxed">
              Your AI advisor trained on ILR's proven property investment methodology.
              Get personalised guidance on deals, strategy, finance, and more.
            </p>
          </div>

          {/* Roadmap card */}
          <div className="w-full mb-6">
            <RoadmapCard isOnboarded={isOnboarded} onStartChat={startConversation} />
          </div>

          {/* Resource cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full mb-6">
            {RESOURCE_CARDS.map((card) => (
              <a
                key={card.title}
                href={card.href}
                className="flex flex-col items-center text-center p-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800 transition-colors group"
              >
                <span className="text-2xl mb-2">{card.icon}</span>
                <span className="text-xs font-semibold text-zinc-200 group-hover:text-white mb-1">
                  {card.title}
                </span>
                <span className="text-[11px] text-zinc-500 leading-tight hidden sm:block">
                  {card.description}
                </span>
              </a>
            ))}
          </div>

          <p className="text-xs text-zinc-600 text-center max-w-md mx-auto">
            Trained on ILR's methodology. Always verify with your professional team.
            This is not financial advice.
          </p>
        </div>
      </div>

      {/* Bottom section: starters + input */}
      <div className="flex-shrink-0 px-4 pb-4">
        {/* Chat starters */}
        <div className="flex flex-wrap justify-center gap-2 mb-4 max-w-3xl mx-auto">
          {CHAT_STARTERS.map((starter) => (
            <button
              key={starter}
              onClick={() => startConversation(starter)}
              disabled={isCreating}
              className="text-sm px-4 py-2 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white hover:border-indigo-500/50 hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {starter}
            </button>
          ))}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-3 max-w-3xl mx-auto"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Send a message..."
            disabled={isCreating}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50"
            autoFocus
          />
          <button
            type="submit"
            disabled={isCreating || !input.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-3 rounded-xl text-sm font-medium transition-colors"
          >
            {isCreating ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
