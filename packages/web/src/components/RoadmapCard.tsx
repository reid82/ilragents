'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { FileText, MessageSquare } from 'lucide-react';
import { useRoadmapStore } from '@/lib/stores/roadmap-store';
import type { RoadmapData } from '@/lib/stores/roadmap-store';
import { useSessionStore } from '@/lib/stores/session-store';
import { useAuthStore } from '@/lib/stores/auth-store';


interface RoadmapCardProps {
  isOnboarded: boolean;
  onStartChat?: (prompt: string) => void;
}

const ROADMAP_PROMPT = "I'd like you to generate my personalised investment roadmap.";
const REFINE_PROMPT = "I'd like to discuss and refine my investment roadmap.";

export default function RoadmapCard({ isOnboarded, onStartChat }: RoadmapCardProps) {
  const { status, sectionsCompleted, totalSections, currentSectionLabel, reportData } =
    useRoadmapStore();
  const sessionId = useSessionStore((s) => s.sessionId);
  const user = useAuthStore((s) => s.user);
  const syncRef = useRef(false);
  const hydrateRef = useRef(false);

  // On mount: if store says idle but user is logged in, check server for existing roadmap
  useEffect(() => {
    if (status !== 'idle' || !user || !isOnboarded || hydrateRef.current) return;
    hydrateRef.current = true;

    (async () => {
      try {
        const res = await fetch('/api/roadmap/mine');
        if (!res.ok) return;

        const data = await res.json();

        if (data.status === 'completed' && data.roadmapId) {
          useRoadmapStore.getState().setCompleted(
            data.reportMarkdown,
            data.reportData as RoadmapData,
            data.roadmapId
          );
        } else if (data.status === 'generating' && data.roadmapId) {
          useRoadmapStore.getState().setRoadmapId(data.roadmapId);
          useRoadmapStore.getState().setStatus('generating');
          useRoadmapStore.getState().setProgress(data.sectionsCompleted || 0);
        }
      } catch {
        // Non-fatal
      }
    })();
  }, [status, user, isOnboarded]);

  // Sync with server when store says "generating"
  useEffect(() => {
    if (status !== 'generating' || !sessionId || syncRef.current) return;
    syncRef.current = true;

    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/roadmap/status?sessionId=${sessionId}`);
        const data = await res.json();

        if (data.status === 'completed' && data.roadmapId) {
          clearInterval(poll);
          const reportRes = await fetch(`/api/roadmap/${data.roadmapId}`);
          if (reportRes.ok) {
            const report = await reportRes.json();
            useRoadmapStore.getState().setCompleted(
              report.reportMarkdown,
              report.reportData as RoadmapData,
              data.roadmapId
            );
          } else {
            useRoadmapStore.getState().reset();
          }
        } else if (data.status === 'failed' || data.status === 'none') {
          clearInterval(poll);
          useRoadmapStore.getState().reset();
        } else if (data.status === 'generating') {
          useRoadmapStore.getState().setProgress(
            data.sectionsCompleted || 0
          );
        }
      } catch {
        // Non-fatal, keep polling
      }
    }, 3000);

    const timeout = setTimeout(() => {
      clearInterval(poll);
      if (useRoadmapStore.getState().status === 'generating') {
        useRoadmapStore.getState().reset();
      }
    }, 600000);

    return () => {
      clearInterval(poll);
      clearTimeout(timeout);
      syncRef.current = false;
    };
  }, [status, sessionId]);

  if (!isOnboarded) return null;

  // Generating state - show progress
  if (status === 'generating') {
    const progress = totalSections > 0 ? (sectionsCompleted / totalSections) * 100 : 0;

    return (
      <div
        className="rounded-xl p-5"
        style={{
          border: '1px solid rgba(16, 185, 129, 0.2)',
          background: 'var(--primary-subtle)',
        }}
      >
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--primary-glow)' }}
          >
            <div
              className="w-5 h-5 border-2 rounded-full animate-spin"
              style={{ borderColor: 'var(--primary-light)', borderTopColor: 'transparent' }}
            />
          </div>
          <div>
            <h3 className="font-semibold text-white">Building Your Roadmap</h3>
            <p className="text-xs" style={{ color: 'var(--primary-light)' }}>
              {currentSectionLabel
                ? `Working on: ${currentSectionLabel}`
                : `Section ${sectionsCompleted} of ${totalSections}`}
            </p>
          </div>
        </div>
        <div className="w-full rounded-full h-2 overflow-hidden" style={{ background: 'var(--surface-3)' }}>
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%`, background: 'var(--primary)' }}
          />
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
          This takes a few minutes. You can navigate away safely.
        </p>
      </div>
    );
  }

  // Ready state - roadmap exists
  if (status === 'completed') {
    return (
      <div
        className="rounded-xl p-5"
        style={{
          background: 'linear-gradient(135deg, var(--primary-glow), var(--primary-subtle))',
          border: '1px solid rgba(16, 185, 129, 0.2)',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--primary-glow)' }}
            >
              <FileText className="w-5 h-5" style={{ color: 'var(--primary-light)' }} />
            </div>
            <div>
              <h3 className="font-semibold text-white">My Roadmap</h3>
              <p className="text-xs" style={{ color: 'var(--primary-light)' }}>Your personalised investment roadmap is ready</p>
            </div>
          </div>
          {reportData && (
            <div className="hidden sm:flex items-center gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span>Score: <span className="font-medium" style={{ color: 'var(--primary-light)' }}>{reportData.investorScore}/100</span></span>
              <span>Strategy: <span className="font-medium capitalize" style={{ color: 'var(--primary-light)' }}>{reportData.strategyType}</span></span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 mt-4">
          <Link
            href="/roadmap"
            className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            style={{
              background: 'var(--primary-glow)',
              color: 'var(--primary-light)',
            }}
          >
            <FileText className="w-4 h-4" />
            View Roadmap
          </Link>
          <button
            onClick={() => onStartChat?.(REFINE_PROMPT)}
            className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            style={{
              background: 'var(--surface-2)',
              color: 'var(--text-secondary)',
            }}
          >
            <MessageSquare className="w-4 h-4" />
            Discuss &amp; Refine
          </button>
        </div>
      </div>
    );
  }

  // Default - no roadmap yet
  return (
    <button
      onClick={() => onStartChat?.(ROADMAP_PROMPT)}
      className="group block w-full rounded-xl p-5 transition-all text-left"
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors"
            style={{ background: 'var(--surface-3)', color: 'var(--text-secondary)' }}
          >
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-white">My Roadmap</h3>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Your personalised strategy, deal criteria, and year-by-year plan</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm transition-colors" style={{ color: 'var(--text-secondary)' }}>
          <span>Generate your roadmap</span>
          <span className="transition-transform group-hover:translate-x-1">&rarr;</span>
        </div>
      </div>
    </button>
  );
}
