'use client';

import { useState, useEffect, useCallback } from 'react';

interface FeedbackItem {
  id: string;
  user_question: string;
  assistant_message: string;
  feedback_comment: string;
  agent_id: string;
  agent_name: string;
  created_at: string;
  reviewed: boolean;
  reviewed_by: string | null;
}

export default function FeedbackReviewPage() {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'reviewed' | 'unreviewed'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchFeedback = useCallback(async () => {
    const params = new URLSearchParams({ limit: '100' });
    if (filter === 'reviewed') params.set('reviewed', 'true');
    if (filter === 'unreviewed') params.set('reviewed', 'false');

    try {
      const res = await fetch(`/api/admin/feedback?${params}`);
      const data = await res.json();
      setFeedback(data.feedback || []);
    } catch (error) {
      console.error('Failed to fetch feedback:', error);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    fetchFeedback();
  }, [fetchFeedback]);

  async function markReviewed(id: string) {
    try {
      await fetch(`/api/admin/feedback/${id}/review`, { method: 'PUT' });
      setFeedback(prev => prev.map(f => f.id === id ? { ...f, reviewed: true } : f));
    } catch (error) {
      console.error('Failed to mark reviewed:', error);
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Feedback Review</h2>
        <div className="flex gap-2">
          {(['all', 'unreviewed', 'reviewed'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-lg capitalize transition-colors ${
                filter === f
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'text-zinc-500 hover:text-zinc-300 bg-zinc-800'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-zinc-500 text-sm">Loading...</div>
      ) : feedback.length === 0 ? (
        <div className="text-zinc-500 text-sm text-center py-12">No feedback found.</div>
      ) : (
        <div className="space-y-2">
          {feedback.map(item => (
            <div
              key={item.id}
              className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden"
            >
              <button
                onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                className="w-full text-left p-4 hover:bg-zinc-800/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-300 truncate">{item.user_question}</p>
                    <p className="text-sm text-zinc-400 mt-1 line-clamp-2">{item.feedback_comment}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-zinc-600">{item.agent_name}</span>
                    <span className="text-xs text-zinc-600">
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                    {item.reviewed ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
                        Reviewed
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">
                        Pending
                      </span>
                    )}
                  </div>
                </div>
              </button>

              {expandedId === item.id && (
                <div className="border-t border-zinc-800 p-4 space-y-4">
                  <div>
                    <h4 className="text-xs font-medium text-zinc-500 mb-1">User Question</h4>
                    <p className="text-sm text-zinc-300 whitespace-pre-wrap">{item.user_question}</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-medium text-zinc-500 mb-1">Assistant Response</h4>
                    <p className="text-sm text-zinc-400 whitespace-pre-wrap max-h-60 overflow-y-auto">
                      {item.assistant_message}
                    </p>
                  </div>
                  <div>
                    <h4 className="text-xs font-medium text-zinc-500 mb-1">Feedback</h4>
                    <p className="text-sm text-zinc-300 whitespace-pre-wrap">{item.feedback_comment}</p>
                  </div>
                  {!item.reviewed && (
                    <button
                      onClick={() => markReviewed(item.id)}
                      className="text-sm px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
                    >
                      Mark as Reviewed
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
