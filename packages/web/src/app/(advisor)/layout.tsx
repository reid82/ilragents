"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import ConversationSidebar from "@/components/ConversationSidebar";
import ProfileModal from "@/components/ProfileModal";
import { useConversationStore } from "@/lib/stores/conversation-store";
import { useClientProfileStore } from "@/lib/stores/financial-store";
import { useAuthStore } from "@/lib/stores/auth-store";

export default function AdvisorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [showProfile, setShowProfile] = useState(false);
  const createConversation = useConversationStore((s) => s.createConversation);
  const clearMessages = useConversationStore((s) => s.clearMessages);
  const profile = useClientProfileStore((s) => s.profile);
  const setProfile = useClientProfileStore((s) => s.setProfile);
  const user = useAuthStore((s) => s.user);

  // Derive initials for avatar
  const initials = (() => {
    if (profile?.personal?.firstName) {
      return profile.personal.firstName[0].toUpperCase();
    }
    if (user?.email) return user.email[0].toUpperCase();
    return "?";
  })();

  async function handleNewChat() {
    try {
      clearMessages();
      const newId = await createConversation("New conversation");
      router.push(`/chat/${newId}`);
    } catch {
      router.push("/login");
    }
  }

  async function handleSaveProfile(updated: typeof profile) {
    if (!updated) return;
    setProfile(updated);
    try {
      await fetch("/api/user/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: updated }),
      });
    } catch (err) {
      console.error("Failed to save profile to DB:", err);
    }
  }

  return (
    <div
      className="flex h-screen text-white overflow-hidden"
      style={{ background: "var(--surface-0)" }}
    >
      {/* Desktop sidebar -- hidden below 1024px */}
      <div className="hidden lg:flex">
        <ConversationSidebar
          onNewChat={handleNewChat}
          onOpenProfile={() => setShowProfile(true)}
        />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile compact header -- visible below 1024px */}
        <div
          className="flex items-center justify-between px-4 flex-shrink-0 lg:hidden"
          style={{
            borderBottom: "1px solid var(--border-subtle)",
            height: "48px",
            zIndex: 20,
          }}
        >
          {/* Left: logo + app name */}
          <Link href="/" className="flex items-center gap-2">
            <div
              className="flex items-center justify-center"
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, var(--primary), var(--primary-hover))",
              }}
            >
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <span
              className="font-semibold text-sm"
              style={{ color: "var(--text-primary)" }}
            >
              ILR Edge
            </span>
          </Link>

          {/* Right: Roadmap + Profile avatar */}
          <div className="flex items-center gap-2">
            <Link
              href="/roadmap"
              className="px-3 py-1.5 text-xs font-medium rounded-full transition-colors"
              style={{
                color: "var(--text-secondary)",
                border: "1px solid var(--border-default)",
              }}
            >
              Roadmap
            </Link>
            <button
              onClick={() => setShowProfile(true)}
              className="flex items-center justify-center rounded-full text-xs font-semibold"
              style={{
                width: "32px",
                height: "32px",
                background: "var(--surface-3)",
                color: "var(--text-primary)",
              }}
              aria-label="Open profile"
            >
              {initials}
            </button>
          </div>
        </div>

        {/* Desktop header -- visible at 1024px+ */}
        <div
          className="hidden lg:flex items-center justify-between px-6 flex-shrink-0"
          style={{
            borderBottom: "1px solid var(--border-subtle)",
            height: "48px",
          }}
        >
          <div>
            <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              Conversation
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              disabled
              className="px-3 py-1.5 text-xs font-medium rounded-md opacity-40 cursor-not-allowed"
              style={{
                color: "var(--text-secondary)",
                border: "1px solid var(--border-default)",
              }}
            >
              Export
            </button>
          </div>
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
