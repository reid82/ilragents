'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

// --- Interfaces ---

interface GapTopic {
  topic: string;
  query_count: number;
  avg_grounding_score: number;
  sample_questions: string[];
  latest_at: string;
  suggestion_count: number;
}

// --- Sub-nav tabs ---

const SUB_TABS = [
  { label: 'Manager', href: '/admin/knowledge' },
  { label: 'Map', href: '/admin/knowledge/map' },
  { label: 'Gaps', href: '/admin/knowledge/gaps' },
];

const TIMEFRAMES = [
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
] as const;

// --- Helpers ---

function relativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 30) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths} month${diffMonths !== 1 ? 's' : ''} ago`;
}

function scoreBadgeClasses(score: number): string {
  if (score < 0.3) return 'bg-red-500/20 text-red-400';
  if (score < 0.5) return 'bg-amber-500/20 text-amber-400';
  return 'bg-emerald-500/20 text-emerald-400';
}

function queryCountBadgeClasses(count: number): string {
  if (count >= 20) return 'bg-red-500/20 text-red-400';
  if (count >= 10) return 'bg-amber-500/20 text-amber-400';
  return 'bg-zinc-700/50 text-zinc-300';
}

function scoreBarWidth(score: number): string {
  return `${Math.max(Math.round(score * 100), 2)}%`;
}

function scoreBarColor(score: number): string {
  if (score < 0.3) return 'bg-red-500';
  if (score < 0.5) return 'bg-amber-500';
  return 'bg-emerald-500';
}

// --- Component ---

export default function GapsPage() {
  const [gaps, setGaps] = useState<GapTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  const loadGaps = useCallback(async (timeframe: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/knowledge/gaps?days=${timeframe}`);
      if (!res.ok) {
        throw new Error(`Failed to load gaps (${res.status})`);
      }
      const data = await res.json();
      setGaps(Array.isArray(data) ? data : data.gaps || []);
    } catch (err) {
      console.error('Failed to load knowledge gaps:', err);
      setError(err instanceof Error ? err.message : 'Failed to load knowledge gaps.');
      setGaps([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGaps(days);
  }, [days, loadGaps]);

  function handleTimeframeChange(newDays: number) {
    setDays(newDays);
  }

  // --- Computed stats ---
  const totalGaps = gaps.length;
  const avgGrounding =
    gaps.length > 0
      ? gaps.reduce((sum, g) => sum + g.avg_grounding_score, 0) / gaps.length
      : 0;
  const mostProblematic =
    gaps.length > 0
      ? gaps.reduce((top, g) => (g.query_count > top.query_count ? g : top), gaps[0])
      : null;

  // Sorted by query_count desc
  const sortedGaps = [...gaps].sort((a, b) => b.query_count - a.query_count);

  return (
    <div className="p-6 space-y-6">
      {/* Sub-navigation tabs */}
      <div className="flex gap-1">
        {SUB_TABS.map(tab => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              tab.href === '/admin/knowledge/gaps'
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Timeframe toggle + heading */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">Knowledge Gap Analysis</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Topics where the RAG couldn&apos;t provide well-grounded answers
          </p>
        </div>
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf.value}
              onClick={() => handleTimeframeChange(tf.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                days === tf.value
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm text-red-400">
          {error}
          <button
            onClick={() => loadGaps(days)}
            className="ml-3 underline hover:text-red-300 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="space-y-6">
          {/* Skeleton stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 animate-pulse">
                <div className="h-3 w-20 bg-zinc-800 rounded mb-3" />
                <div className="h-7 w-16 bg-zinc-800 rounded" />
              </div>
            ))}
          </div>
          {/* Skeleton cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 animate-pulse">
                <div className="h-5 w-40 bg-zinc-800 rounded mb-4" />
                <div className="h-3 w-full bg-zinc-800 rounded mb-2" />
                <div className="h-3 w-3/4 bg-zinc-800 rounded mb-4" />
                <div className="h-8 w-32 bg-zinc-800 rounded" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loaded content */}
      {!loading && !error && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-500 text-xs mb-1">Knowledge Gaps Found</p>
              <p className="text-2xl font-semibold text-white">{totalGaps}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-500 text-xs mb-1">Avg Grounding Score</p>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-semibold text-white">
                  {totalGaps > 0 ? avgGrounding.toFixed(2) : '--'}
                </p>
                {totalGaps > 0 && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${scoreBadgeClasses(avgGrounding)}`}
                  >
                    {avgGrounding < 0.3 ? 'Poor' : avgGrounding < 0.5 ? 'Weak' : 'Fair'}
                  </span>
                )}
              </div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-500 text-xs mb-1">Most Problematic Topic</p>
              <p className="text-lg font-semibold text-white truncate" title={mostProblematic?.topic}>
                {mostProblematic ? mostProblematic.topic : '--'}
              </p>
              {mostProblematic && (
                <p className="text-xs text-zinc-500 mt-0.5">
                  {mostProblematic.query_count} queries
                </p>
              )}
            </div>
          </div>

          {/* Empty state */}
          {sortedGaps.length === 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
              <div className="text-4xl mb-4 text-emerald-400">
                <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-zinc-300 text-sm">
                No knowledge gaps detected in the last {days} days.
              </p>
              <p className="text-zinc-500 text-sm mt-1">
                Your RAG is covering user questions well!
              </p>
            </div>
          )}

          {/* Gap cards grid */}
          {sortedGaps.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {sortedGaps.map(gap => (
                <div
                  key={gap.topic}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col"
                >
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="text-base font-semibold text-white leading-snug">
                      {gap.topic}
                    </h3>
                    <span
                      className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${queryCountBadgeClasses(
                        gap.query_count
                      )}`}
                    >
                      {gap.query_count} {gap.query_count === 1 ? 'query' : 'queries'}
                    </span>
                  </div>

                  {/* Grounding score bar */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-zinc-500">Avg Grounding Score</span>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded ${scoreBadgeClasses(
                          gap.avg_grounding_score
                        )}`}
                      >
                        {(gap.avg_grounding_score * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${scoreBarColor(
                          gap.avg_grounding_score
                        )}`}
                        style={{ width: scoreBarWidth(gap.avg_grounding_score) }}
                      />
                    </div>
                  </div>

                  {/* Sample questions */}
                  {gap.sample_questions && gap.sample_questions.length > 0 && (
                    <div className="space-y-2 mb-4">
                      <span className="text-xs text-zinc-500">Sample questions</span>
                      {gap.sample_questions.slice(0, 3).map((q, i) => (
                        <div
                          key={i}
                          className="border-l-2 border-zinc-700 pl-3 py-1"
                        >
                          <p className="text-sm italic text-zinc-400 leading-relaxed">
                            &ldquo;{q}&rdquo;
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Footer row */}
                  <div className="mt-auto flex items-center justify-between pt-3 border-t border-zinc-800/50">
                    <div className="flex items-center gap-4 text-xs text-zinc-500">
                      {gap.suggestion_count > 0 && (
                        <span>
                          {gap.suggestion_count} improvement{' '}
                          {gap.suggestion_count === 1 ? 'suggestion' : 'suggestions'}
                        </span>
                      )}
                      <span>{relativeTime(gap.latest_at)}</span>
                    </div>
                    <Link
                      href={`/admin/knowledge?mode=add&topic=${encodeURIComponent(gap.topic)}`}
                      className="text-xs font-medium px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
                    >
                      Add Knowledge
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
