"use client";

import { useState } from "react";
import type { SpecialistTeam } from "@/lib/specialists";

interface EmailDraftModalProps {
  team: SpecialistTeam;
  subject: string;
  body: string;
  replyTo: string;
  senderName: string;
  onClose: () => void;
  onSent: () => void;
}

export default function EmailDraftModal({
  team,
  subject,
  body,
  replyTo,
  senderName,
  onClose,
  onSent,
}: EmailDraftModalProps) {
  const [editSubject, setEditSubject] = useState(subject);
  const [editBody, setEditBody] = useState(body);
  const [editReplyTo, setEditReplyTo] = useState(replyTo);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    if (!editReplyTo.trim()) {
      setError("Please enter your email address so the team can reply to you.");
      return;
    }
    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: team.email,
          replyTo: editReplyTo.trim(),
          subject: editSubject.trim(),
          body: editBody.trim(),
          senderName: senderName || "ILR Client",
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to send (${res.status})`);
      }

      setSent(true);
      setTimeout(onSent, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="border-b border-zinc-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            Draft email to {team.name}
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {sent ? (
          <div className="px-6 py-12 text-center">
            <div className="text-green-400 text-lg font-medium mb-2">
              Email sent
            </div>
            <p className="text-zinc-400 text-sm">
              Your email has been sent to {team.name}. They will reply to{" "}
              {editReplyTo}.
            </p>
          </div>
        ) : (
          <>
            {/* Form */}
            <div className="px-6 py-4 space-y-4">
              {/* To - read only */}
              <div>
                <label className="block text-xs text-zinc-400 mb-1">To</label>
                <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300">
                  {team.name} &lt;{team.email}&gt;
                </div>
              </div>

              {/* Reply-To */}
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Your email (reply-to)
                </label>
                <input
                  type="email"
                  value={editReplyTo}
                  onChange={(e) => setEditReplyTo(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              {/* Subject */}
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Subject
                </label>
                <input
                  type="text"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              {/* Body */}
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Message
                </label>
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={10}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white resize-y focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              {error && (
                <p className="text-red-400 text-sm">{error}</p>
              )}
            </div>

            {/* Actions */}
            <div className="border-t border-zinc-700 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending || !editReplyTo.trim() || !editSubject.trim() || !editBody.trim()}
                className="px-5 py-2 text-sm bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
              >
                {sending ? "Sending..." : "Send Email"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
