'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

// --- Interfaces ---

interface KnowledgeSource {
  source_id: string;
  title: string | null;
  agent: string;
  content_type: string;
  source_type: string | null;
  url: string | null;
  chunk_count: number;
  total_words: number;
  topics: string[];
  latest_chunked_at: string | null;
}

interface KnowledgeChunk {
  id: string;
  source_id: string;
  text: string;
  word_count: number;
  content_layer: string;
  topics: string[];
  similarity?: number;
}

interface AgentGroup {
  agent: string;
  sources: KnowledgeSource[];
  total_chunks: number;
}

// --- Sub-nav tabs ---

const SUB_TABS = [
  { label: 'Manager', href: '/admin/knowledge' },
  { label: 'Map', href: '/admin/knowledge/map' },
  { label: 'Gaps', href: '/admin/knowledge/gaps' },
];

const CONTENT_TYPES = ['vimeo', 'web', 'pdf', 'text'];

// --- Helpers ---

function contentTypeBadge(type: string) {
  const colors: Record<string, string> = {
    vimeo: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
    web: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    pdf: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    text: 'bg-zinc-700/50 text-zinc-400 border-zinc-600/30',
  };
  return colors[type] || colors.text;
}

function layerBadge(layer: string) {
  const colors: Record<string, string> = {
    core: 'bg-emerald-500/15 text-emerald-400',
    supplementary: 'bg-blue-500/15 text-blue-400',
    contextual: 'bg-amber-500/15 text-amber-400',
  };
  return colors[layer] || 'bg-zinc-700/50 text-zinc-400';
}

export default function KnowledgePage() {
  // --- Data state ---
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [stats, setStats] = useState({ total_chunks: 0, unique_sources: 0, agents_covered: 0, content_types: 0 });
  const [chunks, setChunks] = useState<KnowledgeChunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [chunksLoading, setChunksLoading] = useState(false);

  // --- UI state ---
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [sidebarFilter, setSidebarFilter] = useState('');
  const [collapsedAgents, setCollapsedAgents] = useState<Set<string>>(new Set());
  const [mainTab, setMainTab] = useState<'browse' | 'add'>('browse');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchActive, setSearchActive] = useState(false);
  const [expandedChunks, setExpandedChunks] = useState<Set<string>>(new Set());

  // --- Add Knowledge state ---
  const [addTab, setAddTab] = useState<'text' | 'url'>('text');
  const [addTitle, setAddTitle] = useState('');
  const [addContent, setAddContent] = useState('');
  const [addUrl, setAddUrl] = useState('');
  const [addAgent, setAddAgent] = useState('');
  const [addContentType, setAddContentType] = useState('text');
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // --- Delete state ---
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // --- Load sources ---
  const loadSources = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/knowledge/sources');
      const data: KnowledgeSource[] = await res.json();
      const sourceList = Array.isArray(data) ? data : [];
      setSources(sourceList);
      // Compute stats from the flat sources array
      const totalChunks = sourceList.reduce((sum, s) => sum + s.chunk_count, 0);
      const agents = new Set(sourceList.map(s => s.agent));
      const types = new Set(sourceList.map(s => s.content_type));
      setStats({
        total_chunks: totalChunks,
        unique_sources: sourceList.length,
        agents_covered: agents.size,
        content_types: types.size,
      });
    } catch (err) {
      console.error('Failed to load sources:', err);
    }
  }, []);

  useEffect(() => {
    loadSources().finally(() => setLoading(false));
  }, [loadSources]);

  // --- Load chunks for selected source ---
  const loadChunksForSource = useCallback(async (sourceId: string) => {
    setChunksLoading(true);
    setSearchActive(false);
    setSearchQuery('');
    try {
      const res = await fetch(`/api/admin/knowledge/chunks?source_id=${sourceId}`);
      const data = await res.json();
      setChunks(Array.isArray(data) ? data : data.chunks || []);
    } catch (err) {
      console.error('Failed to load chunks:', err);
      setChunks([]);
    } finally {
      setChunksLoading(false);
    }
  }, []);

  // --- Semantic search ---
  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setChunksLoading(true);
    setSelectedSourceId(null);
    setSearchActive(true);
    try {
      const res = await fetch(`/api/admin/knowledge/chunks?q=${encodeURIComponent(searchQuery.trim())}`);
      const data = await res.json();
      setChunks(Array.isArray(data) ? data : data.chunks || []);
    } catch (err) {
      console.error('Search failed:', err);
      setChunks([]);
    } finally {
      setChunksLoading(false);
    }
  }

  // --- Select source ---
  function selectSource(sourceId: string) {
    setSelectedSourceId(sourceId);
    setExpandedChunks(new Set());
    setMainTab('browse');
    loadChunksForSource(sourceId);
  }

  // --- Delete source ---
  async function handleDeleteSource(sourceId: string) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/knowledge/sources/${sourceId}`, { method: 'DELETE' });
      if (res.ok) {
        setSelectedSourceId(null);
        setChunks([]);
        setDeleteConfirm(null);
        await loadSources();
      } else {
        console.error('Delete failed');
      }
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setDeleting(false);
    }
  }

  // --- Submit new knowledge ---
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitStatus(null);

    const body: Record<string, string> = {
      title: addTitle,
      agent: addAgent,
      content_type: addContentType,
    };

    if (addTab === 'text') {
      body.text = addContent;
      body.mode = 'text';
    } else {
      body.url = addUrl;
      body.mode = 'url';
    }

    try {
      const res = await fetch('/api/admin/knowledge/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setSubmitStatus({ type: 'success', message: 'Knowledge ingested successfully.' });
        setAddTitle('');
        setAddContent('');
        setAddUrl('');
        await loadSources();
      } else {
        const err = await res.json().catch(() => ({}));
        setSubmitStatus({ type: 'error', message: err.error || 'Ingestion failed.' });
      }
    } catch (err) {
      setSubmitStatus({ type: 'error', message: 'Network error. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  // --- Group sources by agent ---
  const agentGroups: AgentGroup[] = (() => {
    const grouped = new Map<string, AgentGroup>();
    for (const src of sources) {
      const key = src.agent || 'unknown';
      if (!grouped.has(key)) {
        grouped.set(key, {
          agent: key,
          sources: [],
          total_chunks: 0,
        });
      }
      const group = grouped.get(key)!;
      group.sources.push(src);
      group.total_chunks += src.chunk_count;
    }
    return Array.from(grouped.values()).sort((a, b) => a.agent.localeCompare(b.agent));
  })();

  // --- Filter sources by sidebar search ---
  const filteredGroups = sidebarFilter.trim()
    ? agentGroups
        .map(g => ({
          ...g,
          sources: g.sources.filter(
            s =>
              (s.title || '').toLowerCase().includes(sidebarFilter.toLowerCase()) ||
              g.agent.toLowerCase().includes(sidebarFilter.toLowerCase()) ||
              s.content_type.toLowerCase().includes(sidebarFilter.toLowerCase())
          ),
        }))
        .filter(g => g.sources.length > 0)
    : agentGroups;

  // --- Unique agent list for dropdowns ---
  const uniqueAgents = agentGroups.map(g => ({ id: g.agent, name: g.agent }));

  // --- Toggle agent collapse ---
  function toggleAgent(agentId: string) {
    setCollapsedAgents(prev => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  }

  // --- Toggle chunk expand ---
  function toggleChunk(chunkId: string) {
    setExpandedChunks(prev => {
      const next = new Set(prev);
      if (next.has(chunkId)) next.delete(chunkId);
      else next.add(chunkId);
      return next;
    });
  }

  const selectedSource = sources.find(s => s.source_id === selectedSourceId);

  // --- Loading state ---
  if (loading) {
    return <div className="p-8 text-zinc-500">Loading knowledge base...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Sub-navigation tabs */}
      <div className="flex gap-1">
        {SUB_TABS.map(tab => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              tab.href === '/admin/knowledge'
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Total Chunks" value={stats.total_chunks} />
        <MetricCard label="Unique Sources" value={stats.unique_sources} />
        <MetricCard label="Agents Covered" value={stats.agents_covered} />
        <MetricCard label="Content Types" value={stats.content_types} />
      </div>

      {/* Two-panel layout */}
      <div className="flex gap-6 min-h-[600px]">
        {/* Left Sidebar */}
        <div className="w-80 shrink-0 bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col overflow-hidden">
          {/* Sidebar search */}
          <div className="p-3 border-b border-zinc-800">
            <input
              type="text"
              placeholder="Filter sources..."
              value={sidebarFilter}
              onChange={e => setSidebarFilter(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
            />
          </div>

          {/* Source list */}
          <div className="flex-1 overflow-y-auto">
            {filteredGroups.length === 0 ? (
              <div className="p-4 text-zinc-600 text-sm text-center">No sources found.</div>
            ) : (
              filteredGroups.map(group => (
                <div key={group.agent}>
                  {/* Agent header */}
                  <button
                    onClick={() => toggleAgent(group.agent)}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-zinc-850 hover:bg-zinc-800/60 transition-colors border-b border-zinc-800/50 text-left"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <svg
                        className={`w-3 h-3 text-zinc-500 transition-transform shrink-0 ${
                          collapsedAgents.has(group.agent) ? '' : 'rotate-90'
                        }`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="text-sm font-medium text-zinc-300 truncate">
                        {group.agent}
                      </span>
                    </div>
                    <span className="text-xs text-zinc-600 shrink-0 ml-2">
                      {group.total_chunks}
                    </span>
                  </button>

                  {/* Sources under agent */}
                  {!collapsedAgents.has(group.agent) && (
                    <div>
                      {group.sources.map(src => (
                        <button
                          key={src.source_id}
                          onClick={() => selectSource(src.source_id)}
                          className={`w-full text-left px-4 py-2 pl-9 border-b border-zinc-800/30 transition-colors ${
                            selectedSourceId === src.source_id
                              ? 'bg-emerald-500/10 border-l-2 border-l-emerald-500'
                              : 'hover:bg-zinc-800/40'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm text-zinc-300 truncate">{src.title}</span>
                            <span className="text-xs text-zinc-600 shrink-0">{src.chunk_count}</span>
                          </div>
                          <span
                            className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded border ${contentTypeBadge(
                              src.content_type
                            )}`}
                          >
                            {src.content_type}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Main Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Main tabs */}
          <div className="flex gap-1 mb-4">
            {(['browse', 'add'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setMainTab(tab)}
                className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                  mainTab === tab
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {tab === 'browse' ? 'Browse' : 'Add Knowledge'}
              </button>
            ))}
          </div>

          {/* Browse Mode */}
          {mainTab === 'browse' && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Search bar */}
              <form onSubmit={handleSearch} className="mb-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Semantic search across all chunks..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="flex-1 px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-700"
                  />
                  <button
                    type="submit"
                    disabled={chunksLoading}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm rounded-xl transition-colors"
                  >
                    Search
                  </button>
                  {(searchActive || selectedSourceId) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchActive(false);
                        setSearchQuery('');
                        setSelectedSourceId(null);
                        setChunks([]);
                      }}
                      className="px-3 py-2.5 text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </form>

              {/* Source header when viewing specific source */}
              {selectedSource && (
                <div className="flex items-center justify-between mb-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <div>
                    <h3 className="text-sm font-medium text-white">{selectedSource.title}</h3>
                    <p className="text-xs text-zinc-500 mt-1">
                      {selectedSource.agent} - {selectedSource.chunk_count} chunks -{' '}
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded border text-[10px] ${contentTypeBadge(
                          selectedSource.content_type
                        )}`}
                      >
                        {selectedSource.content_type}
                      </span>
                    </p>
                  </div>
                  <div>
                    {deleteConfirm === selectedSource.source_id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-red-400">Delete this source?</span>
                        <button
                          onClick={() => handleDeleteSource(selectedSource.source_id)}
                          disabled={deleting}
                          className="text-xs px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                        >
                          {deleting ? 'Deleting...' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="text-xs px-3 py-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(selectedSource.source_id)}
                        className="text-xs px-3 py-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                      >
                        Delete Source
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Chunks list */}
              <div className="flex-1 overflow-y-auto space-y-2">
                {chunksLoading ? (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-zinc-500 text-sm text-center">
                    Loading chunks...
                  </div>
                ) : chunks.length === 0 ? (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-zinc-500 text-sm text-center">
                    {searchActive
                      ? 'No results found for that query.'
                      : selectedSourceId
                      ? 'No chunks found for this source.'
                      : 'Select a source from the sidebar or use search to find chunks.'}
                  </div>
                ) : (
                  <>
                    {searchActive && (
                      <p className="text-xs text-zinc-500 mb-2">
                        {chunks.length} result{chunks.length !== 1 ? 's' : ''} for &quot;{searchQuery}&quot;
                      </p>
                    )}
                    {chunks.map(chunk => {
                      const isExpanded = expandedChunks.has(chunk.id);
                      const preview =
                        chunk.text.length > 200 ? chunk.text.slice(0, 200) + '...' : chunk.text;

                      return (
                        <div
                          key={chunk.id}
                          className="bg-zinc-900 border border-zinc-800 rounded-xl p-4"
                        >
                          {/* Chunk header row */}
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="text-xs text-zinc-600">{chunk.word_count} words</span>
                            {chunk.content_layer && (
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded ${layerBadge(
                                  chunk.content_layer
                                )}`}
                              >
                                {chunk.content_layer}
                              </span>
                            )}
                            {chunk.similarity != null && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
                                {(chunk.similarity * 100).toFixed(1)}% match
                              </span>
                            )}
                          </div>

                          {/* Chunk text */}
                          <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
                            {isExpanded ? chunk.text : preview}
                          </p>
                          {chunk.text.length > 200 && (
                            <button
                              onClick={() => toggleChunk(chunk.id)}
                              className="text-xs text-zinc-500 hover:text-zinc-300 mt-2 transition-colors"
                            >
                              {isExpanded ? 'Show less' : 'Show more'}
                            </button>
                          )}

                          {/* Topics */}
                          {chunk.topics && chunk.topics.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-3">
                              {chunk.topics.map(topic => (
                                <span
                                  key={topic}
                                  className="text-[10px] px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded-full"
                                >
                                  {topic}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Add Knowledge Mode */}
          {mainTab === 'add' && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              {/* Add sub-tabs */}
              <div className="flex gap-1 mb-6">
                {(['text', 'url'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => {
                      setAddTab(tab);
                      setSubmitStatus(null);
                    }}
                    className={`px-4 py-2 rounded-lg text-sm transition-colors capitalize ${
                      addTab === tab
                        ? 'bg-zinc-800 text-white'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-xs text-zinc-500 mb-1.5">Title</label>
                  <input
                    type="text"
                    value={addTitle}
                    onChange={e => setAddTitle(e.target.value)}
                    placeholder="Enter a descriptive title..."
                    required
                    className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
                  />
                </div>

                {/* Content or URL */}
                {addTab === 'text' ? (
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1.5">Content</label>
                    <textarea
                      value={addContent}
                      onChange={e => setAddContent(e.target.value)}
                      placeholder="Paste the knowledge content here..."
                      required
                      rows={10}
                      className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 resize-y"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1.5">URL</label>
                    <input
                      type="url"
                      value={addUrl}
                      onChange={e => setAddUrl(e.target.value)}
                      placeholder="https://..."
                      required
                      className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
                    />
                  </div>
                )}

                {/* Agent + Content Type row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1.5">Agent</label>
                    <select
                      value={addAgent}
                      onChange={e => setAddAgent(e.target.value)}
                      required
                      className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-zinc-600 appearance-none"
                    >
                      <option value="">Select agent...</option>
                      {uniqueAgents.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1.5">Content Type</label>
                    <select
                      value={addContentType}
                      onChange={e => setAddContentType(e.target.value)}
                      className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-zinc-600 appearance-none"
                    >
                      {CONTENT_TYPES.map(t => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Status message */}
                {submitStatus && (
                  <div
                    className={`text-sm px-4 py-3 rounded-lg ${
                      submitStatus.type === 'success'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}
                  >
                    {submitStatus.message}
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {submitting ? 'Ingesting...' : 'Ingest Knowledge'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- MetricCard component ---

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <p className="text-zinc-500 text-xs mb-1">{label}</p>
      <p className="text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}
