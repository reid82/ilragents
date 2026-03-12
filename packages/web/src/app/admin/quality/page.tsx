'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface EvalSummary {
  accuracy: number;
  relevance: number;
  grounding: number;
  count: number;
}

interface FlaggedEval {
  id: string;
  message_id: string;
  conversation_id: string;
  overall_score: number;
  accuracy_score: number;
  relevance_score: number;
  grounding_score: number;
  accuracy_reasoning: string;
  relevance_reasoning: string;
  grounding_reasoning: string;
  topic: string;
  user_question: string;
  assistant_message: string;
  created_at: string;
}

interface Suggestion {
  id: string;
  category: string;
  description: string;
  suggested_fix: string;
  status: string;
  created_at: string;
  message_evals: {
    topic: string;
    overall_score: number;
  } | null;
}

function scoreColor(score: number): string {
  if (score >= 0.8) return 'text-emerald-400';
  if (score >= 0.6) return 'text-amber-400';
  return 'text-red-400';
}

function scoreBgColor(score: number): string {
  if (score >= 0.8) return 'bg-emerald-500/10 border-emerald-500/20';
  if (score >= 0.6) return 'bg-amber-500/10 border-amber-500/20';
  return 'bg-red-500/10 border-red-500/20';
}

const CATEGORY_LABELS: Record<string, string> = {
  knowledge_gap: 'Knowledge Gap',
  prompt_weakness: 'Prompt Weakness',
  hallucination: 'Hallucination',
  personalization_miss: 'Personalization Miss',
};

export default function QualityDashboardPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<EvalSummary | null>(null);
  const [flagged, setFlagged] = useState<FlaggedEval[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailModal, setDetailModal] = useState<Suggestion | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/evals?limit=500').then(r => r.json()),
      fetch('/api/admin/evals/flagged').then(r => r.json()),
      fetch('/api/admin/suggestions').then(r => r.json()),
    ]).then(([evals, flaggedData, suggestionsData]) => {
      // Compute summary from all evals
      const allEvals = Array.isArray(evals) ? evals : [];
      if (allEvals.length > 0) {
        setSummary({
          accuracy: allEvals.reduce((s: number, e: FlaggedEval) => s + (e.accuracy_score || 0), 0) / allEvals.length,
          relevance: allEvals.reduce((s: number, e: FlaggedEval) => s + (e.relevance_score || 0), 0) / allEvals.length,
          grounding: allEvals.reduce((s: number, e: FlaggedEval) => s + (e.grounding_score || 0), 0) / allEvals.length,
          count: allEvals.length,
        });
      }
      setFlagged(Array.isArray(flaggedData) ? flaggedData : []);
      setSuggestions(Array.isArray(suggestionsData) ? suggestionsData : []);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function dismissSuggestion(id: string) {
    try {
      await fetch(`/api/admin/suggestions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'dismissed' }),
      });
      setSuggestions(prev => prev.filter(s => s.id !== id));
    } catch (error) {
      console.error('Failed to dismiss:', error);
    }
  }

  function applySuggestion(id: string) {
    router.push(`/admin/personas?suggestion=${id}`);
  }

  if (loading) {
    return <div className="p-8 text-zinc-500">Loading quality data...</div>;
  }

  return (
    <div className="p-6 space-y-8">
      {/* Score Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        {(['accuracy', 'relevance', 'grounding'] as const).map(criterion => {
          const score = summary ? summary[criterion] : 0;
          return (
            <div
              key={criterion}
              className={`rounded-xl border p-4 ${scoreBgColor(score)}`}
            >
              <p className="text-zinc-500 text-xs capitalize mb-1">{criterion}</p>
              <p className={`text-2xl font-semibold ${scoreColor(score)}`}>
                {summary ? `${(score * 100).toFixed(0)}%` : 'N/A'}
              </p>
              <p className="text-zinc-600 text-xs mt-1">
                {summary?.count || 0} evaluations
              </p>
            </div>
          );
        })}
      </div>

      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Flagged Responses */}
        <div>
          <h3 className="font-medium text-sm text-zinc-300 mb-4">
            Flagged Responses ({flagged.length})
          </h3>
          {flagged.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-zinc-500 text-sm text-center">
              No flagged responses.
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {flagged.map(item => {
                const worstCriterion = [
                  { name: 'accuracy', score: item.accuracy_score, reasoning: item.accuracy_reasoning },
                  { name: 'relevance', score: item.relevance_score, reasoning: item.relevance_reasoning },
                  { name: 'grounding', score: item.grounding_score, reasoning: item.grounding_reasoning },
                ].sort((a, b) => a.score - b.score)[0];

                return (
                  <div key={item.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-sm text-zinc-300 line-clamp-2">{item.user_question}</p>
                      <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${
                        scoreColor(item.overall_score).replace('text-', 'bg-').replace('400', '500/20')
                      } ${scoreColor(item.overall_score)}`}>
                        {(item.overall_score * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 mb-1">
                      Worst: <span className="capitalize">{worstCriterion.name}</span> ({(worstCriterion.score * 100).toFixed(0)}%)
                    </p>
                    <p className="text-xs text-zinc-600 line-clamp-2">{worstCriterion.reasoning}</p>
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => router.push(`/admin/conversations?id=${item.conversation_id}`)}
                        className="text-xs text-zinc-400 hover:text-white transition-colors"
                      >
                        View Full
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Improvement Suggestions */}
        <div>
          <h3 className="font-medium text-sm text-zinc-300 mb-4">
            Improvement Suggestions ({suggestions.length})
          </h3>
          {suggestions.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-zinc-500 text-sm text-center">
              No pending suggestions.
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {suggestions.map(item => (
                <div key={item.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                      {CATEGORY_LABELS[item.category] || item.category}
                    </span>
                    {item.message_evals?.topic && (
                      <span className="text-xs text-zinc-600">{item.message_evals.topic}</span>
                    )}
                  </div>
                  <p className="text-sm text-zinc-300 mb-1">{item.description}</p>
                  <p className="text-xs text-zinc-500 line-clamp-2">{item.suggested_fix}</p>
                  <div className="flex gap-2 mt-3">
                    {item.category === 'prompt_weakness' ? (
                      <button
                        onClick={() => applySuggestion(item.id)}
                        className="text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
                      >
                        Apply
                      </button>
                    ) : (
                      <button
                        onClick={() => setDetailModal(item)}
                        className="text-xs px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
                      >
                        View Details
                      </button>
                    )}
                    <button
                      onClick={() => dismissSuggestion(item.id)}
                      className="text-xs px-3 py-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {detailModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">
                {CATEGORY_LABELS[detailModal.category] || detailModal.category}
              </h3>
              <button
                onClick={() => setDetailModal(null)}
                className="text-zinc-500 hover:text-white text-lg"
              >
                x
              </button>
            </div>
            <div>
              <h4 className="text-xs font-medium text-zinc-500 mb-1">Issue</h4>
              <p className="text-sm text-zinc-300">{detailModal.description}</p>
            </div>
            <div>
              <h4 className="text-xs font-medium text-zinc-500 mb-1">Suggested Fix</h4>
              <p className="text-sm text-zinc-300">{detailModal.suggested_fix}</p>
            </div>
            {detailModal.message_evals && (
              <div>
                <h4 className="text-xs font-medium text-zinc-500 mb-1">Context</h4>
                <p className="text-sm text-zinc-400">
                  Topic: {detailModal.message_evals.topic} |
                  Score: {(detailModal.message_evals.overall_score * 100).toFixed(0)}%
                </p>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  dismissSuggestion(detailModal.id);
                  setDetailModal(null);
                }}
                className="text-sm px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
              >
                Dismiss
              </button>
              {detailModal.category === 'prompt_weakness' && (
                <button
                  onClick={() => {
                    applySuggestion(detailModal.id);
                    setDetailModal(null);
                  }}
                  className="text-sm px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
                >
                  Apply to Persona
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
