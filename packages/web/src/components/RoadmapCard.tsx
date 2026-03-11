'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
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
          // Resume polling state
          useRoadmapStore.getState().setRoadmapId(data.roadmapId);
          useRoadmapStore.getState().setStatus('generating');
          useRoadmapStore.getState().setProgress(data.sectionsCompleted || 0);
        }
      } catch {
        // Non-fatal - user will just see the default idle state
      }
    })();
  }, [status, user, isOnboarded]);

  // Sync with server when store says "generating" - detect stale/failed state
  useEffect(() => {
    if (status !== 'generating' || !sessionId || syncRef.current) return;
    syncRef.current = true;

    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/roadmap/status?sessionId=${sessionId}`);
        const data = await res.json();

        if (data.status === 'completed' && data.roadmapId) {
          clearInterval(poll);
          // Fetch the full report
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

    // Stop polling after 10 minutes
    const timeout = setTimeout(() => {
      clearInterval(poll);
      // If still generating after 10 min, reset
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
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-white">Building Your Roadmap</h3>
            <p className="text-xs text-amber-300/80">
              {currentSectionLabel
                ? `Working on: ${currentSectionLabel}`
                : `Section ${sectionsCompleted} of ${totalSections}`}
            </p>
          </div>
        </div>
        <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
          <div
            className="bg-amber-500 h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-zinc-500 mt-2">
          This takes a few minutes. You can navigate away safely.
        </p>
      </div>
    );
  }

  // Ready state - roadmap exists
  if (status === 'completed') {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-500/5 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-white">My Roadmap</h3>
              <p className="text-xs text-amber-300/80">Your personalised investment roadmap is ready</p>
            </div>
          </div>
          {reportData && (
            <div className="hidden sm:flex items-center gap-4 text-xs text-zinc-400">
              <span>Score: <span className="text-amber-400 font-medium">{reportData.investorScore}/100</span></span>
              <span>Strategy: <span className="text-amber-400 font-medium capitalize">{reportData.strategyType}</span></span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 mt-4">
          <Link
            href="/roadmap"
            className="flex items-center gap-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            View Roadmap
          </Link>
          <button
            onClick={() => onStartChat?.(REFINE_PROMPT)}
            className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
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
      className="group block w-full rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 transition-all hover:border-zinc-600 hover:bg-zinc-900 text-left"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-white">My Roadmap</h3>
            <p className="text-xs text-zinc-400">Your personalised strategy, deal criteria, and year-by-year plan</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-zinc-400 text-sm group-hover:text-white transition-colors">
          <span>Generate your roadmap</span>
          <span className="transition-transform group-hover:translate-x-1">&rarr;</span>
        </div>
      </div>
    </button>
  );
}
