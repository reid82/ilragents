"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ConversationSidebar from "@/components/ConversationSidebar";
import ProfileModal from "@/components/ProfileModal";
import { useConversationStore } from "@/lib/stores/conversation-store";
import { useClientProfileStore } from "@/lib/stores/financial-store";
export default function AdvisorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const createConversation = useConversationStore((s) => s.createConversation);
  const clearMessages = useConversationStore((s) => s.clearMessages);
  const profile = useClientProfileStore((s) => s.profile);
  const setProfile = useClientProfileStore((s) => s.setProfile);

  async function handleNewChat() {
    try {
      clearMessages();
      const newId = await createConversation("New conversation");
      router.push(`/chat/${newId}`);
      setSidebarOpen(false);
    } catch {
      router.push("/login");
    }
  }

  async function handleSaveProfile(updated: typeof profile) {
    if (!updated) return;
    setProfile(updated);
    try {
      await fetch('/api/user/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: updated }),
      });
    } catch (err) {
      console.error('Failed to save profile to DB:', err);
    }
  }

  return (
    <div className="flex h-screen pb-14 bg-zinc-950 text-white overflow-hidden">
      {/* Sidebar */}
      <ConversationSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewChat={handleNewChat}
        onOpenProfile={() => setShowProfile(true)}
      />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header with menu toggle and home button */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden text-zinc-400 hover:text-white transition-colors p-1"
            aria-label="Open sidebar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Link
            href="/"
            className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span className="font-semibold text-sm">ILR Property Advisor</span>
          </Link>
        </div>
        {children}
      </div>

      {/* Profile modal */}
      {showProfile && profile && (
        <ProfileModal
          profile={profile}
          onSave={handleSaveProfile}
          onClose={() => setShowProfile(false)}
        />
      )}
    </div>
  );
}
