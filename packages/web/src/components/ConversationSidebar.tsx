"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Search, Home, FileText, User, BookOpen, X } from "lucide-react";
import { useConversationStore } from "@/lib/stores/conversation-store";
import type { ConversationMeta } from "@/lib/stores/conversation-store";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useSessionStore } from "@/lib/stores/session-store";

interface ConversationSidebarProps {
  onNewChat: () => void;
  onOpenProfile?: () => void;
}

function getDateGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "Last 7 Days";
  return "Older";
}

const DATE_GROUP_ORDER = ["Today", "Yesterday", "Last 7 Days", "Older"];

export default function ConversationSidebar({
  onNewChat,
  onOpenProfile,
}: ConversationSidebarProps) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isOnboarded = useSessionStore((s) => s.isOnboarded);
  const conversations = useConversationStore((s) => s.conversations);
  const activeConversationId = useConversationStore((s) => s.activeConversationId);
  const fetchConversations = useConversationStore((s) => s.fetchConversations);
  const deleteConversation = useConversationStore((s) => s.deleteConversation);

  const [search, setSearch] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, search]);

  const grouped = useMemo(() => {
    const groups: Record<string, ConversationMeta[]> = {};
    for (const c of filtered) {
      const group = getDateGroup(c.updated_at || c.created_at);
      if (!groups[group]) groups[group] = [];
      groups[group].push(c);
    }
    return groups;
  }, [filtered]);

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await deleteConversation(id);
      if (activeConversationId === id) {
        router.push("/");
      }
    } finally {
      setDeletingId(null);
    }
  }

  function handleConversationClick(id: string) {
    router.push(`/chat/${id}`);
  }

  const sidebarContent = (
    <div className="flex flex-col h-full w-[300px]" style={{ background: 'var(--surface-1)', borderRight: '1px solid var(--border-subtle)' }}>
      {/* Header: Logo + New Chat */}
      <div className="p-3 flex-shrink-0 space-y-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <Link
          href="/"
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-colors"
          style={{ color: 'var(--text-primary)' }}
        >
          <div
            className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))',
            }}
          >
            <Home className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-sm">ILR Edge</span>
        </Link>
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
          style={{
            color: 'var(--primary)',
            background: 'var(--primary-subtle)',
            border: '1px solid rgba(16, 185, 129, 0.15)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--primary-glow)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--primary-subtle)';
          }}
        >
          <Plus className="w-4 h-4" />
          New Chat
        </button>
      </div>

      {/* Search */}
      <div className="p-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations..."
            className="w-full rounded-lg pl-8 pr-3 py-1.5 text-xs placeholder-zinc-500 focus:outline-none focus:ring-1"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto py-2">
        {filtered.length === 0 && (
          <p className="text-xs px-4 py-3" style={{ color: 'var(--text-muted)' }}>
            {search ? "No conversations match your search." : "No conversations yet."}
          </p>
        )}
        {DATE_GROUP_ORDER.map((group) => {
          const items = grouped[group];
          if (!items || items.length === 0) return null;
          return (
            <div key={group} className="mb-3">
              <p
                className="text-[10px] uppercase tracking-[0.8px] px-3 py-1 font-medium"
                style={{ color: 'var(--text-faint)' }}
              >
                {group}
              </p>
              {items.map((conv) => (
                <div
                  key={conv.id}
                  className="relative group"
                  onMouseEnter={() => setHoveredId(conv.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <button
                    onClick={() => handleConversationClick(conv.id)}
                    className="w-full text-left px-3 py-2 text-[13px] transition-colors rounded-lg mx-1"
                    style={{
                      maxWidth: "calc(100% - 8px)",
                      background: activeConversationId === conv.id ? 'var(--primary-subtle)' : 'transparent',
                      borderLeft: activeConversationId === conv.id ? '2px solid var(--primary)' : '2px solid transparent',
                      color: activeConversationId === conv.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                    }}
                    onMouseEnter={(e) => {
                      if (activeConversationId !== conv.id) {
                        e.currentTarget.style.background = 'var(--surface-3)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (activeConversationId !== conv.id) {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    <span className="block truncate pr-6">{conv.title}</span>
                  </button>
                  {hoveredId === conv.id && (
                    <button
                      onClick={(e) => handleDelete(conv.id, e)}
                      disabled={deletingId === conv.id}
                      title="Delete conversation"
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 transition-colors rounded disabled:opacity-50"
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                    >
                      {deletingId === conv.id ? (
                        <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <X className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Bottom section */}
      <div className="p-3 space-y-1 flex-shrink-0" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <a
          href="https://ilovepropertyco.com.au/resources"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors"
          style={{ color: 'var(--text-secondary)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--surface-3)';
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
        >
          <BookOpen className="w-4 h-4" />
          Resources
        </a>
        {isOnboarded && (
          <>
            <button
              onClick={onOpenProfile}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors w-full"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--surface-3)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              <User className="w-4 h-4" />
              My Profile
            </button>
            <Link
              href="/roadmap"
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--surface-3)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              <FileText className="w-4 h-4" />
              My Roadmap
            </Link>
          </>
        )}
        {user && (
          <button
            onClick={onOpenProfile}
            className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors w-full"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border-subtle)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--surface-3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--surface-2)';
            }}
          >
            <div
              className="w-[32px] h-[32px] rounded-lg flex items-center justify-center text-xs font-semibold text-white flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))',
              }}
            >
              {user.email?.[0]?.toUpperCase() ?? "U"}
            </div>
            <span className="text-xs truncate flex-1" style={{ color: 'var(--text-secondary)' }}>{user.email}</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-full">{sidebarContent}</div>
  );
}
