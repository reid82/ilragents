'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';

// --- Types ---

interface MapPoint {
  id: string;
  source_id: string;
  agent: string;
  content_type: string;
  title: string;
  topics: string[];
  word_count: number;
  map_x: number;
  map_y: number;
  snippet: string;
}

interface MapResponse {
  points: MapPoint[];
  stats: {
    total: number;
    byAgent: Record<string, number>;
    byContentType: Record<string, number>;
  };
}

type ColorMode = 'agent' | 'content_type' | 'topic';

// --- Constants ---

const SUB_TABS = [
  { label: 'Manager', href: '/admin/knowledge' },
  { label: 'Map', href: '/admin/knowledge/map' },
  { label: 'Gaps', href: '/admin/knowledge/gaps' },
];

const COLORS = [
  '#34d399', // emerald-400
  '#60a5fa', // blue-400
  '#f472b6', // pink-400
  '#fbbf24', // amber-400
  '#a78bfa', // violet-400
  '#fb923c', // orange-400
  '#2dd4bf', // teal-400
  '#e879f9', // fuchsia-400
  '#4ade80', // green-400
  '#f87171', // red-400
];

const DPR = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

// --- Helpers ---

function buildColorMap(keys: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const sorted = [...new Set(keys)].sort();
  sorted.forEach((key, i) => {
    map[key] = COLORS[i % COLORS.length];
  });
  return map;
}

function getPointColor(
  point: MapPoint,
  mode: ColorMode,
  colorMap: Record<string, string>,
): string {
  if (mode === 'agent') return colorMap[point.agent] || COLORS[0];
  if (mode === 'content_type') return colorMap[point.content_type] || COLORS[0];
  // topic mode: use first topic
  const topic = point.topics?.[0] || 'Unknown';
  return colorMap[topic] || COLORS[0];
}

function getPointRadius(wordCount: number): number {
  if (wordCount < 100) return 4;
  if (wordCount < 500) return 5;
  return 6;
}

// --- Component ---

export default function KnowledgeMapPage() {
  // Data state
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [stats, setStats] = useState<MapResponse['stats'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [colorMode, setColorMode] = useState<ColorMode>('agent');
  const [agentFilter, setAgentFilter] = useState('all');
  const [recomputing, setRecomputing] = useState(false);
  const [recomputeStage, setRecomputeStage] = useState('');
  const [recomputeProgress, setRecomputeProgress] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<MapPoint | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [selectedPoint, setSelectedPoint] = useState<MapPoint | null>(null);

  // Canvas state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const transformRef = useRef({ offsetX: 0, offsetY: 0, scale: 1 });
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const animFrameRef = useRef<number>(0);

  // --- Fetch map data ---
  const fetchMapData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/knowledge/map');
      if (!res.ok) throw new Error('Failed to load map data');
      const data: MapResponse = await res.json();
      setPoints(data.points || []);
      setStats(data.stats || null);
    } catch (err) {
      console.error('Failed to load map:', err);
      setError('Failed to load map data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMapData();
  }, [fetchMapData]);

  // --- Recompute map (background job + polling) ---
  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function pollStatus() {
    try {
      const res = await fetch('/api/admin/knowledge/map/recompute');
      if (!res.ok) return;
      const status = await res.json();

      setRecomputeStage(status.stage || '');
      setRecomputeProgress(status.progress || 0);

      if (status.state === 'done') {
        stopPolling();
        setRecomputing(false);
        setRecomputeStage('');
        setRecomputeProgress(0);
        await fetchMapData();
      } else if (status.state === 'error') {
        stopPolling();
        setRecomputing(false);
        setRecomputeStage('');
        setRecomputeProgress(0);
        setError(status.error || 'Recompute failed.');
      }
    } catch {
      // Network error during poll — keep polling
    }
  }

  async function handleRecompute() {
    setRecomputing(true);
    setRecomputeStage('Starting…');
    setRecomputeProgress(0);
    setError(null);
    try {
      const res = await fetch('/api/admin/knowledge/map/recompute', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to start recompute');
      }
      // Start polling every 2 seconds
      stopPolling();
      pollRef.current = setInterval(pollStatus, 2000);
    } catch (err) {
      console.error('Recompute failed:', err);
      setError(err instanceof Error ? err.message : 'Recompute failed.');
      setRecomputing(false);
      setRecomputeStage('');
      setRecomputeProgress(0);
    }
  }

  // Clean up polling on unmount
  useEffect(() => {
    return () => stopPolling();
  }, []);

  // --- Derived data ---
  const agents = useMemo(() => {
    const set = new Set(points.map(p => p.agent));
    return Array.from(set).sort();
  }, [points]);

  const filteredPoints = useMemo(() => {
    if (agentFilter === 'all') return points;
    return points.filter(p => p.agent === agentFilter);
  }, [points, agentFilter]);

  const mappedPoints = useMemo(() => {
    return filteredPoints.filter(p => p.map_x != null && p.map_y != null);
  }, [filteredPoints]);

  const colorMap = useMemo(() => {
    if (colorMode === 'agent') return buildColorMap(points.map(p => p.agent));
    if (colorMode === 'content_type') return buildColorMap(points.map(p => p.content_type));
    const allTopics = points.flatMap(p => p.topics?.length ? [p.topics[0]] : ['Unknown']);
    return buildColorMap(allTopics);
  }, [points, colorMode]);

  const legendEntries = useMemo(() => {
    return Object.entries(colorMap).sort(([a], [b]) => a.localeCompare(b));
  }, [colorMap]);

  // --- Resize observer ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setCanvasSize({ width: Math.floor(width), height: Math.floor(height) });
        }
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // --- Fit transform to data on load ---
  useEffect(() => {
    if (mappedPoints.length === 0) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of mappedPoints) {
      if (p.map_x < minX) minX = p.map_x;
      if (p.map_x > maxX) maxX = p.map_x;
      if (p.map_y < minY) minY = p.map_y;
      if (p.map_y > maxY) maxY = p.map_y;
    }

    const dataW = maxX - minX || 1;
    const dataH = maxY - minY || 1;
    const padding = 60;
    const availW = canvasSize.width - padding * 2;
    const availH = canvasSize.height - padding * 2;
    const scale = Math.min(availW / dataW, availH / dataH);
    const offsetX = padding + (availW - dataW * scale) / 2 - minX * scale;
    const offsetY = padding + (availH - dataH * scale) / 2 - minY * scale;

    transformRef.current = { offsetX, offsetY, scale };
  }, [mappedPoints, canvasSize]);

  // --- Canvas rendering ---
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvasSize;
    const { offsetX, offsetY, scale } = transformRef.current;

    canvas.width = width * DPR;
    canvas.height = height * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    // Clear
    ctx.fillStyle = '#09090b'; // zinc-950
    ctx.fillRect(0, 0, width, height);

    // Draw subtle grid
    ctx.strokeStyle = 'rgba(63, 63, 70, 0.3)'; // zinc-700 faint
    ctx.lineWidth = 0.5;
    const gridStep = 50;
    for (let gx = 0; gx < width; gx += gridStep) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, height);
      ctx.stroke();
    }
    for (let gy = 0; gy < height; gy += gridStep) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(width, gy);
      ctx.stroke();
    }

    // Draw points
    for (const point of mappedPoints) {
      const sx = point.map_x * scale + offsetX;
      const sy = point.map_y * scale + offsetY;
      const r = getPointRadius(point.word_count);
      const color = getPointColor(point, colorMode, colorMap);

      // Glow
      ctx.beginPath();
      ctx.arc(sx, sy, r + 3, 0, Math.PI * 2);
      ctx.fillStyle = color + '20'; // 12% opacity
      ctx.fill();

      // Point
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Highlight hovered or selected
      if (
        (hoveredPoint && hoveredPoint.id === point.id) ||
        (selectedPoint && selectedPoint.id === point.id)
      ) {
        ctx.beginPath();
        ctx.arc(sx, sy, r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }, [canvasSize, mappedPoints, colorMode, colorMap, hoveredPoint, selectedPoint]);

  useEffect(() => {
    cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(drawCanvas);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [drawCanvas]);

  // --- Hit detection ---
  function findPointAt(clientX: number, clientY: number): MapPoint | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const { offsetX, offsetY, scale } = transformRef.current;

    let closest: MapPoint | null = null;
    let closestDist = Infinity;

    for (const point of mappedPoints) {
      const sx = point.map_x * scale + offsetX;
      const sy = point.map_y * scale + offsetY;
      const r = getPointRadius(point.word_count) + 4; // extra tolerance
      const dx = mx - sx;
      const dy = my - sy;
      const dist = dx * dx + dy * dy;
      if (dist < r * r && dist < closestDist) {
        closest = point;
        closestDist = dist;
      }
    }
    return closest;
  }

  // --- Mouse handlers ---
  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (isDraggingRef.current) {
      const dx = e.clientX - lastMouseRef.current.x;
      const dy = e.clientY - lastMouseRef.current.y;
      transformRef.current.offsetX += dx;
      transformRef.current.offsetY += dy;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = requestAnimationFrame(drawCanvas);
      setHoveredPoint(null);
      return;
    }

    const hit = findPointAt(e.clientX, e.clientY);
    if (hit !== hoveredPoint) {
      setHoveredPoint(hit);
    }
    if (hit) {
      const canvas = canvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      if (rect) {
        setTooltipPos({ x: e.clientX - rect.left + 16, y: e.clientY - rect.top - 10 });
      }
    }
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    isDraggingRef.current = true;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  }

  function handleMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDraggingRef.current) return;
    const dx = Math.abs(e.clientX - lastMouseRef.current.x);
    const dy = Math.abs(e.clientY - lastMouseRef.current.y);
    isDraggingRef.current = false;

    // If barely moved, treat as click
    if (dx < 3 && dy < 3) {
      const hit = findPointAt(e.clientX, e.clientY);
      setSelectedPoint(hit);
    }
  }

  function handleMouseLeave() {
    isDraggingRef.current = false;
    setHoveredPoint(null);
  }

  function handleWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const t = transformRef.current;
    const newScale = t.scale * zoomFactor;

    // Zoom toward cursor
    t.offsetX = mx - (mx - t.offsetX) * zoomFactor;
    t.offsetY = my - (my - t.offsetY) * zoomFactor;
    t.scale = newScale;

    cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(drawCanvas);
  }

  // --- Loading / error ---
  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex gap-1">
          {SUB_TABS.map(tab => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                tab.href === '/admin/knowledge/map'
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center justify-center h-96 text-zinc-500 text-sm">
          Loading knowledge map...
        </div>
      </div>
    );
  }

  const hasMapData = mappedPoints.length > 0;

  return (
    <div className="p-6 space-y-4 h-full flex flex-col">
      {/* Sub-navigation tabs */}
      <div className="flex gap-1">
        {SUB_TABS.map(tab => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              tab.href === '/admin/knowledge/map'
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Controls Bar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-wrap items-center gap-4">
        {/* Color by */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Color by</span>
          <div className="flex gap-1">
            {(['agent', 'content_type', 'topic'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setColorMode(mode)}
                className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                  colorMode === mode
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                {mode === 'agent' ? 'Agent' : mode === 'content_type' ? 'Content Type' : 'Topic'}
              </button>
            ))}
          </div>
        </div>

        {/* Filter by agent */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Filter</span>
          <select
            value={agentFilter}
            onChange={e => setAgentFilter(e.target.value)}
            className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 focus:outline-none focus:border-zinc-600 appearance-none pr-7"
          >
            <option value="all">All Agents</option>
            {agents.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        {/* Recompute */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleRecompute}
            disabled={recomputing}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {recomputing && (
              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            )}
            Recompute Map
          </button>
          {recomputing && (
            <div className="flex items-center gap-2 min-w-[200px]">
              <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${recomputeProgress}%` }}
                />
              </div>
              <span className="text-zinc-400 text-xs whitespace-nowrap">
                {recomputeStage || 'Starting…'}
              </span>
            </div>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {legendEntries.map(([label, color]) => (
            <div key={label} className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-[10px] text-zinc-500 truncate max-w-[100px]">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Stats badges */}
      {stats && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-full text-zinc-400">
            {stats.total} chunks mapped
          </span>
          {Object.entries(stats.byAgent).sort(([a], [b]) => a.localeCompare(b)).map(([agent, count]) => (
            <span
              key={agent}
              className="text-xs px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-full text-zinc-500"
            >
              {agent}: {count}
            </span>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-sm px-4 py-3 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20">
          {error}
        </div>
      )}

      {/* Main canvas area + detail panel */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Canvas container */}
        <div
          ref={containerRef}
          className="flex-1 relative bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden"
          style={{ minHeight: 400 }}
        >
          {!hasMapData ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
                </svg>
              </div>
              <p className="text-zinc-400 text-sm font-medium mb-2">No map data yet</p>
              <p className="text-zinc-600 text-xs max-w-sm">
                Click &quot;Recompute Map&quot; to generate the 2D projection from your knowledge embeddings.
              </p>
            </div>
          ) : (
            <>
              <canvas
                ref={canvasRef}
                width={canvasSize.width * DPR}
                height={canvasSize.height * DPR}
                style={{ width: canvasSize.width, height: canvasSize.height, cursor: isDraggingRef.current ? 'grabbing' : 'grab' }}
                onMouseMove={handleMouseMove}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                onWheel={handleWheel}
              />

              {/* Hover tooltip */}
              {hoveredPoint && (
                <div
                  className="absolute pointer-events-none z-10 bg-zinc-900 border border-zinc-700 rounded-lg p-3 shadow-xl max-w-xs"
                  style={{
                    left: tooltipPos.x,
                    top: tooltipPos.y,
                    transform: tooltipPos.x > canvasSize.width - 260 ? 'translateX(-110%)' : undefined,
                  }}
                >
                  <p className="text-sm font-medium text-white truncate">{hoveredPoint.title}</p>
                  <p className="text-xs text-zinc-400 mt-1">{hoveredPoint.agent}</p>
                  <p className="text-xs text-zinc-500 mt-1.5 line-clamp-3">
                    {hoveredPoint.snippet?.slice(0, 100)}
                    {(hoveredPoint.snippet?.length || 0) > 100 ? '...' : ''}
                  </p>
                  <p className="text-[10px] text-zinc-600 mt-1.5">{hoveredPoint.word_count} words</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Detail panel */}
        {selectedPoint && (
          <div className="w-96 shrink-0 bg-zinc-900 border border-zinc-800 rounded-xl overflow-y-auto flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between p-4 border-b border-zinc-800">
              <h3 className="text-sm font-medium text-white pr-4 leading-snug">{selectedPoint.title}</h3>
              <button
                onClick={() => setSelectedPoint(null)}
                className="text-zinc-500 hover:text-zinc-300 shrink-0 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Meta */}
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wide">Agent</p>
                  <p className="text-sm text-zinc-300 mt-0.5">{selectedPoint.agent}</p>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wide">Content Type</p>
                  <p className="text-sm text-zinc-300 mt-0.5">{selectedPoint.content_type}</p>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wide">Word Count</p>
                  <p className="text-sm text-zinc-300 mt-0.5">{selectedPoint.word_count}</p>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wide">Source</p>
                  <p className="text-sm text-zinc-500 mt-0.5 truncate">{selectedPoint.source_id}</p>
                </div>
              </div>

              {/* Topics */}
              {selectedPoint.topics && selectedPoint.topics.length > 0 && (
                <div>
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1.5">Topics</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedPoint.topics.map(topic => (
                      <span
                        key={topic}
                        className="text-[10px] px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded-full border border-zinc-700"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Snippet */}
              <div>
                <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1.5">Snippet</p>
                <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                  {selectedPoint.snippet}
                </p>
              </div>

              {/* Link to Manager */}
              <Link
                href={`/admin/knowledge?source=${selectedPoint.source_id}`}
                className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors mt-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                View in Manager
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
