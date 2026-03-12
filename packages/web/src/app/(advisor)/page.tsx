"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, Building2, Scissors, Wallet, Send, Plus, Clock } from "lucide-react";
import { useConversationStore } from "@/lib/stores/conversation-store";
import { useSessionStore } from "@/lib/stores/session-store";
import { useAuthStore } from "@/lib/stores/auth-store";
import RoadmapCard from "@/components/RoadmapCard";
import BottomSheet from "@/components/BottomSheet";

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
    icon: Building2,
    title: "Deal Analysis",
    description: "Step-by-step deal analysis frameworks",
    href: "#",
  },
  {
    icon: BarChart3,
    title: "Portfolio Planning",
    description: "Build a high-performing property portfolio",
    href: "#",
  },
  {
    icon: Scissors,
    title: "Subdivision",
    description: "Maximise returns through subdivision",
    href: "#",
  },
  {
    icon: Wallet,
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const conversations = useConversationStore((s) => s.conversations);
  const activeConversationId = useConversationStore((s) => s.activeConversationId);
  const fetchConversations = useConversationStore((s) => s.fetchConversations);

  async function startConversation(prompt: string) {
    if (!prompt.trim() || isCreating) return;
    setIsCreating(true);
    clearMessages();
    try {
      const title = prompt.length > 60 ? prompt.slice(0, 57) + "..." : prompt;
      const newId = await createConversation(title);
      router.push(`/chat/${newId}?prompt=${encodeURIComponent(prompt)}`);
    } catch {
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

  async function handleNewChat() {
    clearMessages();
    try {
      const newId = await createConversation("New conversation");
      router.push(`/chat/${newId}`);
    } catch {
      router.push("/login");
    }
  }

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Show nothing while auth is loading to prevent onboarding gate flash
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div
          className="w-6 h-6 border-2 rounded-full animate-spin"
          style={{ borderColor: 'var(--border-default)', borderTopColor: 'var(--primary)' }}
        />
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
              <div
                className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5"
                style={{
                  background: 'var(--primary-glow)',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                }}
              >
                <Building2 className="w-8 h-8" style={{ color: 'var(--primary-light)' }} />
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">
                Welcome to ILR Edge
              </h1>
              <p className="text-base sm:text-lg max-w-xl mx-auto leading-relaxed mb-8" style={{ color: 'var(--text-secondary)' }}>
                Your AI advisor trained on ILR&apos;s proven property investment methodology.
                To give you personalised guidance, we need to understand your financial position first.
              </p>
              <Link
                href="/onboarding"
                className="inline-flex items-center gap-2 text-white px-8 py-3.5 rounded-xl text-base font-medium transition-all"
                style={{
                  background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))',
                  boxShadow: '0 2px 12px rgba(16, 185, 129, 0.3)',
                }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Set Up Your Profile
              </Link>
              <p className="text-xs mt-4" style={{ color: 'var(--text-muted)' }}>
                Takes about 5 minutes. Our advisor Ben will walk you through it.
              </p>
            </div>

            {/* Resource cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full mb-6">
              {RESOURCE_CARDS.map((card) => {
                const Icon = card.icon;
                return (
                  <a
                    key={card.title}
                    href={card.href}
                    className="flex flex-col items-center text-center p-4 rounded-[14px] transition-all group"
                    style={{
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border-subtle)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-default)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-subtle)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <Icon className="w-6 h-6 mb-2" style={{ color: 'var(--primary)' }} />
                    <span className="text-xs font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                      {card.title}
                    </span>
                    <span className="text-[11px] leading-tight hidden sm:block" style={{ color: 'var(--text-muted)' }}>
                      {card.description}
                    </span>
                  </a>
                );
              })}
            </div>

            <p className="text-xs text-center max-w-md mx-auto" style={{ color: 'var(--text-muted)' }}>
              Trained on ILR&apos;s methodology. Always verify with your professional team.
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
            <div
              className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-5"
              style={{
                background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))',
                boxShadow: '0 0 20px var(--primary-glow)',
              }}
            >
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-white mb-3">
              ILR Edge
            </h1>
            <p className="text-sm sm:text-base max-w-xl mx-auto leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Your AI advisor trained on ILR&apos;s proven property investment methodology.
              Get personalised guidance on deals, strategy, finance, and more.
            </p>
          </div>

          {/* Roadmap card */}
          <div className="w-full mb-6">
            <RoadmapCard isOnboarded={isOnboarded} onStartChat={startConversation} />
          </div>

          {/* Resource cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full mb-6">
            {RESOURCE_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <a
                  key={card.title}
                  href={card.href}
                  className="flex flex-col items-center text-center p-4 rounded-[14px] transition-all group"
                  style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border-subtle)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-default)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-subtle)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <Icon className="w-6 h-6 mb-2" style={{ color: 'var(--primary)' }} />
                  <span className="text-xs font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                    {card.title}
                  </span>
                  <span className="text-[11px] leading-tight hidden sm:block" style={{ color: 'var(--text-muted)' }}>
                    {card.description}
                  </span>
                </a>
              );
            })}
          </div>

          <p className="text-xs text-center max-w-md mx-auto" style={{ color: 'var(--text-muted)' }}>
            Trained on ILR&apos;s methodology. Always verify with your professional team.
            This is not financial advice.
          </p>
        </div>
      </div>

      {/* Bottom section: starters + input */}
      <div className="flex-shrink-0 px-4 pb-4">
        {/* Action chips -- mobile only */}
        <div className="flex gap-1.5 px-4 py-2 lg:hidden">
          <button
            onClick={handleNewChat}
            className="flex items-center gap-1.5 text-xs font-medium px-3 rounded-full"
            style={{
              height: "36px",
              background: "var(--primary-subtle)",
              border: "1px solid var(--primary)",
              color: "var(--primary-light)",
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            New chat
          </button>
          <button
            onClick={() => setHistoryOpen(true)}
            className="flex items-center gap-1.5 text-xs font-medium px-3 rounded-full"
            style={{
              height: "36px",
              background: "var(--surface-2)",
              border: "1px solid var(--border-default)",
              color: "var(--text-secondary)",
            }}
          >
            <Clock className="w-3.5 h-3.5" />
            History
          </button>
        </div>

        {/* Chat starters */}
        <div className="flex overflow-x-auto no-scrollbar gap-1.5 mb-4 max-w-3xl mx-auto">
          {CHAT_STARTERS.map((starter) => (
            <button
              key={starter}
              onClick={() => startConversation(starter)}
              disabled={isCreating}
              className="text-[11px] px-3.5 py-1.5 rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.3)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
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
          className="max-w-[680px] mx-auto"
        >
          <div
            className="flex items-center gap-2 rounded-[18px] p-1 transition-all"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border-default)',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.3)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-default)';
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask your advisor..."
              disabled={isCreating}
              className="flex-1 bg-transparent px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none disabled:opacity-50"
              autoFocus
            />
            <button
              type="submit"
              disabled={isCreating || !input.trim()}
              className="flex items-center justify-center w-10 h-10 rounded-[14px] text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
              style={{
                background: isCreating || !input.trim()
                  ? 'var(--surface-3)'
                  : 'linear-gradient(135deg, var(--primary), var(--primary-hover))',
                boxShadow: isCreating || !input.trim() ? 'none' : '0 2px 8px rgba(16, 185, 129, 0.3)',
              }}
            >
              {isCreating ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
          <p className="text-center text-[10px] mt-1.5" style={{ color: 'var(--text-faint)' }}>
            AI-generated. Not financial advice. Always consult qualified professionals.
          </p>
        </form>
      </div>

      <BottomSheet
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Conversations"
      >
        <div className="space-y-1">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => {
                router.push(`/chat/${conv.id}`);
                setHistoryOpen(false);
              }}
              className="w-full text-left px-3 py-3 rounded-lg transition-colors"
              style={{
                background: conv.id === activeConversationId
                  ? "rgba(16, 185, 129, 0.06)"
                  : "transparent",
                borderLeft: conv.id === activeConversationId
                  ? "3px solid var(--primary)"
                  : "3px solid transparent",
              }}
            >
              <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                {conv.title}
              </p>
              <p className="text-xs truncate mt-0.5" style={{ color: "var(--text-muted)" }}>
                {new Date(conv.updated_at).toLocaleDateString()}
              </p>
            </button>
          ))}
        </div>
      </BottomSheet>
    </div>
  );
}
