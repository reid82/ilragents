'use client';

import { useState, useEffect } from 'react';

interface ConversationListItem {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  user_name: string;
  avg_eval_score: number | null;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources: Array<{ title: string; score: number }> | null;
  created_at: string;
  eval: {
    overall_score: number;
    accuracy_score: number;
    relevance_score: number;
    grounding_score: number;
    accuracy_reasoning: string;
    relevance_reasoning: string;
    grounding_reasoning: string;
    topic: string;
    flagged: boolean;
  } | null;
}

interface ConversationDetail {
  id: string;
  title: string;
  user_name: string;
  created_at: string;
  messages: Message[];
}

function scoreColor(score: number): string {
  if (score >= 0.8) return 'bg-emerald-500/20 text-emerald-400';
  if (score >= 0.6) return 'bg-amber-500/20 text-amber-400';
  return 'bg-red-500/20 text-red-400';
}

export default function ConversationExplorerPage() {
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [selected, setSelected] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [expandedEval, setExpandedEval] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/conversations?limit=100')
      .then(r => r.json())
      .then(data => setConversations(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function selectConversation(id: string) {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/conversations/${id}`);
      const data = await res.json();
      setSelected(data);
    } catch (error) {
      console.error('Failed to load conversation:', error);
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-120px)]">
      {/* Left sidebar - conversation list */}
      <div className="w-80 border-r border-zinc-800 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-zinc-500 text-sm">Loading...</div>
        ) : conversations.length === 0 ? (
          <div className="p-4 text-zinc-500 text-sm">No conversations yet.</div>
        ) : (
          <div className="py-1">
            {conversations.map(convo => (
              <button
                key={convo.id}
                onClick={() => selectConversation(convo.id)}
                className={`w-full text-left px-4 py-3 border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/50 ${
                  selected?.id === convo.id ? 'bg-zinc-800' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-300 truncate">{convo.title}</p>
                    <p className="text-xs text-zinc-600 mt-0.5">{convo.user_name}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-zinc-600">{convo.message_count} msgs</span>
                    {convo.avg_eval_score != null && (
                      <span className={`text-xs px-1.5 py-0.5 rounded ${scoreColor(convo.avg_eval_score)}`}>
                        {(convo.avg_eval_score * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-zinc-600 mt-1">
                  {new Date(convo.updated_at).toLocaleDateString()}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main panel - conversation transcript */}
      <div className="flex-1 overflow-y-auto p-6">
        {detailLoading ? (
          <div className="text-zinc-500 text-sm">Loading conversation...</div>
        ) : !selected ? (
          <div className="text-zinc-500 text-sm text-center mt-20">
            Select a conversation to view the transcript.
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="mb-6">
              <h2 className="text-lg font-semibold">{selected.title}</h2>
              <p className="text-zinc-500 text-sm">{selected.user_name} - {new Date(selected.created_at).toLocaleDateString()}</p>
            </div>

            {selected.messages.map(msg => (
              <div
                key={msg.id}
                className={`rounded-xl p-4 ${
                  msg.role === 'user'
                    ? 'bg-zinc-800/50 ml-8'
                    : 'bg-zinc-900 border border-zinc-800 mr-8'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-zinc-500 uppercase">
                    {msg.role}
                  </span>
                  {msg.eval && (
                    <button
                      onClick={() => setExpandedEval(expandedEval === msg.id ? null : msg.id)}
                      className={`text-xs px-2 py-0.5 rounded ${scoreColor(msg.eval.overall_score)}`}
                    >
                      {(msg.eval.overall_score * 100).toFixed(0)}%
                      {msg.eval.flagged && ' !!'}
                    </button>
                  )}
                </div>

                <p className="text-sm text-zinc-300 whitespace-pre-wrap">{msg.content}</p>

                {/* Eval details */}
                {msg.eval && expandedEval === msg.id && (
                  <div className="mt-3 pt-3 border-t border-zinc-700 space-y-2">
                    <p className="text-xs text-zinc-500">Topic: {msg.eval.topic}</p>
                    <div className="grid grid-cols-3 gap-3">
                      {(['accuracy', 'relevance', 'grounding'] as const).map(criterion => {
                        const score = msg.eval![`${criterion}_score`];
                        const reasoning = msg.eval![`${criterion}_reasoning`];
                        return (
                          <div key={criterion} className="text-xs">
                            <div className="flex items-center gap-1 mb-1">
                              <span className="text-zinc-500 capitalize">{criterion}</span>
                              <span className={`px-1 rounded ${scoreColor(score)}`}>
                                {(score * 100).toFixed(0)}%
                              </span>
                            </div>
                            <p className="text-zinc-600 line-clamp-3">{reasoning}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Sources */}
                {msg.sources && msg.sources.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-xs text-zinc-600 cursor-pointer hover:text-zinc-400">
                      {msg.sources.length} sources
                    </summary>
                    <div className="mt-1 space-y-1">
                      {msg.sources.map((s, i) => (
                        <p key={i} className="text-xs text-zinc-600">
                          {s.title} ({(s.score * 100).toFixed(0)}%)
                        </p>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
