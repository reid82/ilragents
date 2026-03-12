"use client";

import { useRouter } from "next/navigation";
import { MessageSquare, Clock } from "lucide-react";

const CHECKLIST = [
  "Your current financial position",
  "Investment goals and timeline",
  "Risk tolerance and preferences",
  "Existing property portfolio (if any)",
];

const VIDEO_URL = process.env.NEXT_PUBLIC_WELCOME_VIDEO_URL || "";

function isEmbedUrl(url: string): boolean {
  return /youtube\.com|youtu\.be|vimeo\.com|player\.vimeo/.test(url);
}

export default function WelcomePage() {
  const router = useRouter();

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--surface-0)" }}
    >
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 pt-12 pb-40">
        <div className="max-w-md mx-auto space-y-8">
          {/* Logo */}
          <div className="text-center">
            <div
              className="inline-flex items-center justify-center mx-auto"
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "14px",
                background: "linear-gradient(135deg, var(--primary), var(--primary-hover))",
                boxShadow: "0 8px 32px rgba(16, 185, 129, 0.2)",
              }}
            >
              <MessageSquare className="w-6 h-6 text-white" />
            </div>
            <h1
              className="text-[22px] font-bold mt-4"
              style={{ color: "var(--text-primary)" }}
            >
              Welcome to ILR Advisor
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              Let&apos;s get you set up
            </p>
          </div>

          {/* Video */}
          {VIDEO_URL && (
            <div
              className="relative overflow-hidden"
              style={{
                borderRadius: "14px",
                border: "1px solid rgba(255,255,255,0.06)",
                paddingBottom: "56.25%",
              }}
            >
              {isEmbedUrl(VIDEO_URL) ? (
                <iframe
                  src={VIDEO_URL}
                  className="absolute inset-0 w-full h-full"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                  style={{ border: "none" }}
                />
              ) : (
                <video
                  src={VIDEO_URL}
                  controls
                  playsInline
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}
            </div>
          )}

          {/* Explanation */}
          <div>
            <h2
              className="text-[17px] font-semibold mb-3"
              style={{ color: "var(--text-primary)" }}
            >
              Your personalised advisor starts here
            </h2>
            <p className="text-sm leading-relaxed mb-3" style={{ color: "var(--text-secondary)" }}>
              To give you the best property investment advice, we need to understand your
              financial situation. Think of this as a one-on-one interview with your advisor.
            </p>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              The more detail you provide, the more tailored and accurate your advice will be.
              Take your time -- this is the foundation everything else builds on.
            </p>
          </div>

          {/* Checklist */}
          <div
            className="p-4"
            style={{
              background: "rgba(255,255,255,0.03)",
              borderRadius: "12px",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <p
              className="text-xs font-medium uppercase tracking-wider mb-3"
              style={{ color: "var(--text-muted)" }}
            >
              What you&apos;ll cover
            </p>
            <div className="space-y-3">
              {CHECKLIST.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div
                    className="flex items-center justify-center flex-shrink-0 text-xs font-bold"
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "6px",
                      background: "var(--primary-subtle)",
                      color: "var(--primary-light)",
                    }}
                  >
                    {i + 1}
                  </div>
                  <p className="text-sm pt-0.5" style={{ color: "var(--text-primary)" }}>
                    {item}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Sticky CTA */}
      <div
        className="fixed bottom-0 left-0 right-0 px-6 pb-safe"
        style={{ zIndex: 20 }}
      >
        <div
          className="pt-6 pb-6"
          style={{
            background: "linear-gradient(to top, var(--surface-0) 60%, transparent)",
          }}
        >
          <div className="max-w-md mx-auto">
            <button
              onClick={() => router.push("/onboarding")}
              className="w-full text-base font-semibold text-white transition-all active:scale-[0.98]"
              style={{
                padding: "16px",
                borderRadius: "14px",
                background: "linear-gradient(135deg, var(--primary), var(--primary-hover))",
                boxShadow: "0 4px 16px rgba(16, 185, 129, 0.2)",
              }}
            >
              Start your profile interview
            </button>
            <p
              className="flex items-center justify-center gap-1.5 text-xs mt-3"
              style={{ color: "var(--text-muted)" }}
            >
              <Clock className="w-3.5 h-3.5" />
              Takes 15-20 minutes if done properly
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
