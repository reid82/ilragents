"use client";

import { useState } from "react";
import { X, Send, CheckCircle } from "lucide-react";
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

  const inputStyle = {
    background: 'var(--surface-2)',
    border: '1px solid var(--border-subtle)',
    color: 'var(--text-primary)',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        style={{
          background: 'var(--surface-0)',
          border: '1px solid var(--border-default)',
        }}
      >
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <h2 className="text-lg font-semibold text-white">
            Draft email to {team.name}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg transition-colors"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {sent ? (
          <div className="px-6 py-12 text-center">
            <CheckCircle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--primary)' }} />
            <div className="text-lg font-medium text-white mb-2">
              Email sent
            </div>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Your email has been sent to {team.name}. They will reply to{" "}
              {editReplyTo}.
            </p>
          </div>
        ) : (
          <>
            {/* Form */}
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>To</label>
                <div className="rounded-lg px-3 py-2 text-sm" style={{ ...inputStyle, color: 'var(--text-secondary)' }}>
                  {team.name} &lt;{team.email}&gt;
                </div>
              </div>

              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Your email (reply-to)
                </label>
                <input
                  type="email"
                  value={editReplyTo}
                  onChange={(e) => setEditReplyTo(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full rounded-lg px-3 py-2 text-sm placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                  style={inputStyle}
                />
              </div>

              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Subject
                </label>
                <input
                  type="text"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                  style={inputStyle}
                />
              </div>

              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Message
                </label>
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={10}
                  className="w-full rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                  style={inputStyle}
                />
              </div>

              {error && (
                <p className="text-red-400 text-sm">{error}</p>
              )}
            </div>

            {/* Actions */}
            <div className="px-6 py-4 flex justify-end gap-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm transition-colors"
                style={{ color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending || !editReplyTo.trim() || !editSubject.trim() || !editBody.trim()}
                className="flex items-center gap-2 px-5 py-2 text-sm text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))',
                  boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                }}
              >
                <Send className="w-3.5 h-3.5" />
                {sending ? "Sending..." : "Send Email"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
