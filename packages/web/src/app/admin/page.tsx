'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Stats {
  activeUsers7d: number;
  activeUsersTrend: number;
  conversationsToday: number;
  avgMessagesPerSession: number;
  avgQualityScore: number | null;
  flaggedCount: number;
}

interface EngagementDay {
  date: string;
  messages: number;
  conversations: number;
}

interface TopicCount {
  topic: string;
  count: number;
}

interface FeedbackItem {
  id: string;
  user_question: string;
  feedback_comment: string;
  agent_name: string;
  created_at: string;
  reviewed: boolean;
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [engagement, setEngagement] = useState<EngagementDay[]>([]);
  const [topics, setTopics] = useState<TopicCount[]>([]);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [engagementDays, setEngagementDays] = useState(7);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/stats').then(r => r.json()),
      fetch(`/api/admin/stats/engagement?days=${engagementDays}`).then(r => r.json()),
      fetch('/api/admin/stats/topics').then(r => r.json()),
      fetch('/api/admin/feedback?limit=5').then(r => r.json()),
    ]).then(([s, e, t, f]) => {
      setStats(s);
      setEngagement(e);
      setTopics(t);
      setFeedback(f.feedback || []);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, [engagementDays]);

  if (loading) {
    return <div className="p-8 text-zinc-500">Loading dashboard...</div>;
  }

  const maxMessages = Math.max(...engagement.map(d => d.messages), 1);

  return (
    <div className="p-6 space-y-8">
      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Active Users (7d)"
          value={stats?.activeUsers7d ?? 0}
          trend={stats?.activeUsersTrend}
        />
        <MetricCard
          label="Conversations Today"
          value={stats?.conversationsToday ?? 0}
        />
        <MetricCard
          label="Avg Messages/Session"
          value={stats?.avgMessagesPerSession ?? 0}
        />
        <MetricCard
          label="Avg Quality Score"
          value={stats?.avgQualityScore != null ? `${(stats.avgQualityScore * 100).toFixed(0)}%` : 'N/A'}
        />
      </div>

      {/* Middle section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Engagement Chart */}
        <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-sm text-zinc-300">Engagement</h3>
            <div className="flex gap-2">
              {[7, 30].map(d => (
                <button
                  key={d}
                  onClick={() => setEngagementDays(d)}
                  className={`text-xs px-3 py-1 rounded-lg transition-colors ${
                    engagementDays === d
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>

          {engagement.length === 0 ? (
            <div className="text-zinc-500 text-sm py-8 text-center">No engagement data yet.</div>
          ) : (
            <div className="flex items-end gap-1 h-40">
              {engagement.map(day => (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full bg-emerald-500/30 rounded-t"
                    style={{ height: `${(day.messages / maxMessages) * 100}%`, minHeight: '2px' }}
                  />
                  <span className="text-[10px] text-zinc-600 rotate-[-45deg] origin-top-left whitespace-nowrap">
                    {day.date.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Flagged count */}
          {stats && stats.flaggedCount > 0 && (
            <Link
              href="/admin/quality"
              className="block bg-red-500/10 border border-red-500/20 rounded-xl p-4 hover:bg-red-500/15 transition-colors"
            >
              <span className="text-red-400 font-medium text-2xl">{stats.flaggedCount}</span>
              <p className="text-red-400/70 text-sm mt-1">flagged responses</p>
            </Link>
          )}

          {/* Recent Feedback */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-sm text-zinc-300">Recent Feedback</h3>
              <Link href="/admin/feedback" className="text-xs text-zinc-500 hover:text-zinc-300">
                View all
              </Link>
            </div>
            {feedback.length === 0 ? (
              <p className="text-zinc-500 text-sm">No feedback yet.</p>
            ) : (
              <div className="space-y-3">
                {feedback.map(f => (
                  <div key={f.id} className="text-sm">
                    <p className="text-zinc-300 line-clamp-2">{f.feedback_comment}</p>
                    <p className="text-zinc-600 text-xs mt-1">{f.agent_name} - {new Date(f.created_at).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Topic Coverage */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h3 className="font-medium text-sm text-zinc-300 mb-4">Topic Coverage (7d)</h3>
        {topics.length === 0 ? (
          <p className="text-zinc-500 text-sm">No topic data yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {topics.map(t => (
              <span
                key={t.topic}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 rounded-full text-sm"
              >
                <span className="text-zinc-300">{t.topic}</span>
                <span className="text-zinc-500 text-xs">{t.count}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, trend }: { label: string; value: string | number; trend?: number }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <p className="text-zinc-500 text-xs mb-1">{label}</p>
      <p className="text-2xl font-semibold text-white">{value}</p>
      {trend != null && trend !== 0 && (
        <p className={`text-xs mt-1 ${trend > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {trend > 0 ? '+' : ''}{trend.toFixed(0)}% vs prev
        </p>
      )}
    </div>
  );
}
