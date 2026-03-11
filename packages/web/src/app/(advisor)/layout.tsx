"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ConversationSidebar from "@/components/ConversationSidebar";
import { useConversationStore } from "@/lib/stores/conversation-store";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

async function getAuthToken(): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export default function AdvisorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const createConversation = useConversationStore((s) => s.createConversation);

  async function handleNewChat() {
    const token = await getAuthToken();
    if (!token) {
      router.push("/login");
      return;
    }
    const newId = await createConversation(token, "New conversation");
    router.push(`/chat/${newId}`);
    setSidebarOpen(false);
  }

  return (
    <div className="flex h-screen bg-zinc-950 text-white overflow-hidden">
      {/* Sidebar */}
      <ConversationSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewChat={handleNewChat}
      />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header with menu toggle */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-zinc-800 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-zinc-400 hover:text-white transition-colors p-1"
            aria-label="Open sidebar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-semibold text-sm">ILR Property Advisor</span>
        </div>
        {children}
      </div>
    </div>
  );
}
