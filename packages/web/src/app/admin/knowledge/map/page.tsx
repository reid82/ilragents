'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';

// --- Types ---

interface MapPoint {
  id: string;
  source_id: string;
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
    byContentType: Record<string, number>;
    byTopic: Record<string, number>;
  };
}

type ColorMode = 'topic' | 'content_type' | 'source';

// --- Constants ---

const SUB_TABS = [
  { label: 'Manager', href: '/admin/knowledge' },
  { label: 'Map', href: '/admin/knowledge/map' },
  { label: 'Gaps', href: '/admin/knowledge/gaps' },
];

const TOPIC_COLORS: Record<string, string> = {
  'Cash Cows':          '#34d399', // emerald
  'No Money Down':      '#60a5fa', // blue
  'Chunk Deals':        '#f472b6', // pink
  'Depreciation':       '#fbbf24', // amber
  'Renovation':         '#a78bfa', // violet
  'Due Diligence':      '#fb923c', // orange
  'Deal Finding':       '#2dd4bf', // teal
  'Finance & Lending':  '#e879f9', // fuchsia
  'Strata & Body Corp': '#4ade80', // green
  'Negotiation':        '#f87171', // red
  'Mindset & Strategy': '#38bdf8', // sky
  'Legal & Compliance': '#facc15', // yellow
  'Tenant Management':  '#c084fc', // purple
  'Market Analysis':    '#fb7185', // rose
  'Case Studies':       '#22d3ee', // cyan
  'Tax & Structure':    '#a3e635', // lime
  'General':            '#71717a', // zinc
};

const FALLBACK_COLORS = [
  '#34d399', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa',
  '#fb923c', '#2dd4bf', '#e879f9', '#4ade80', '#f87171',
];

const DPR = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

// --- Helpers ---

function buildColorMap(keys: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const sorted = [...new Set(keys)].sort();
  sorted.forEach((key, i) => {
    map[key] = FALLBACK_COLORS[i % FALLBACK_COLORS.length];
  });
  return map;
}

function getPointColor(
  point: MapPoint,
  mode: ColorMode,
  colorMap: Record<string, string>,
): string {
  if (mode === 'topic') {
    const topic = point.topics?.[0] || 'General';
    return TOPIC_COLORS[topic] || colorMap[topic] || '#71717a';
  }
  if (mode === 'content_type') return colorMap[point.content_type] || FALLBACK_COLORS[0];
  // source mode: color by title
  return colorMap[point.title] || FALLBACK_COLORS[0];
}

function getPointRadius(wordCount: number): number {
  if (wordCount < 100) return 3;
  if (wordCount < 500) return 4;
  return 5;
}

// Build kNN edges client-side from spatial proximity
function buildEdges(points: MapPoint[], k: number): [number, number][] {
  const n = points.length;
  if (n < 2) return [];

  const edges: [number, number][] = [];
  const maxK = Math.min(k, n - 1);

  for (let i = 0; i < n; i++) {
    // Find k nearest in 2D screen space
    const dists: { j: number; d: number }[] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const dx = points[i].map_x - points[j].map_x;
      const dy = points[i].map_y - points[j].map_y;
      dists.push({ j, d: dx * dx + dy * dy });
    }
    dists.sort((a, b) => a.d - b.d);
    for (let ki = 0; ki < maxK; ki++) {
      const j = dists[ki].j;
      // Avoid duplicate edges
      if (i < j) {
        edges.push([i, j]);
      }
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return edges.filter(([a, b]) => {
    const key = `${a}-${b}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// --- Component ---

export default function KnowledgeMapPage() {
  // Data state
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [stats, setStats] = useState<MapResponse['stats'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [colorMode, setColorMode] = useState<ColorMode>('topic');
  const [topicFilter, setTopicFilter] = useState('all');
  const [showEdges, setShowEdges] = useState(true);
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

  // --- Derived data ---
  const topics = useMemo(() => {
    const set = new Set(points.flatMap(p => p.topics || []));
    return Array.from(set).sort();
  }, [points]);

  const filteredPoints = useMemo(() => {
    if (topicFilter === 'all') return points;
    return points.filter(p => p.topics?.includes(topicFilter));
  }, [points, topicFilter]);

  const mappedPoints = useMemo(() => {
    return filteredPoints.filter(p => p.map_x != null && p.map_y != null);
  }, [filteredPoints]);

  const edges = useMemo(() => {
    if (!showEdges || mappedPoints.length > 3000) return [];
    return buildEdges(mappedPoints, 3);
  }, [mappedPoints, showEdges]);

  const colorMap = useMemo(() => {
    if (colorMode === 'topic') {
      const allTopics = points.flatMap(p => p.topics?.length ? [p.topics[0]] : ['General']);
      return buildColorMap(allTopics);
    }
    if (colorMode === 'content_type') return buildColorMap(points.map(p => p.content_type));
    return buildColorMap(points.map(p => p.title));
  }, [points, colorMode]);

  const legendEntries = useMemo(() => {
    if (colorMode === 'topic') {
      // Use TOPIC_COLORS for legend when in topic mode
      const usedTopics = new Set(points.flatMap(p => p.topics || []));
      return Object.entries(TOPIC_COLORS)
        .filter(([topic]) => usedTopics.has(topic))
        .sort(([a], [b]) => a.localeCompare(b));
    }
    return Object.entries(colorMap).sort(([a], [b]) => a.localeCompare(b));
  }, [colorMap, colorMode, points]);

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
    ctx.strokeStyle = 'rgba(63, 63, 70, 0.2)';
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

    // Draw edges first (behind points)
    if (edges.length > 0) {
      ctx.lineWidth = 0.5;
      for (const [i, j] of edges) {
        const pi = mappedPoints[i];
        const pj = mappedPoints[j];
        const sx1 = pi.map_x * scale + offsetX;
        const sy1 = pi.map_y * scale + offsetY;
        const sx2 = pj.map_x * scale + offsetX;
        const sy2 = pj.map_y * scale + offsetY;

        ctx.beginPath();
        ctx.moveTo(sx1, sy1);
        ctx.lineTo(sx2, sy2);
        ctx.strokeStyle = 'rgba(113, 113, 122, 0.12)'; // very faint zinc
        ctx.stroke();
      }
    }

    // Draw points
    for (const point of mappedPoints) {
      const sx = point.map_x * scale + offsetX;
      const sy = point.map_y * scale + offsetY;
      const r = getPointRadius(point.word_count);
      const color = getPointColor(point, colorMode, colorMap);

      // Glow
      ctx.beginPath();
      ctx.arc(sx, sy, r + 2, 0, Math.PI * 2);
      ctx.fillStyle = color + '18';
      ctx.fill();

      // Point
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = color + 'cc'; // slightly transparent
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
  }, [canvasSize, mappedPoints, edges, colorMode, colorMap, hoveredPoint, selectedPoint]);

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
      const r = getPointRadius(point.word_count) + 4;
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
            {(['topic', 'content_type', 'source'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setColorMode(mode)}
                className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                  colorMode === mode
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                {mode === 'topic' ? 'Topic' : mode === 'content_type' ? 'Type' : 'Source'}
              </button>
            ))}
          </div>
        </div>

        {/* Filter by topic */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Filter</span>
          <select
            value={topicFilter}
            onChange={e => setTopicFilter(e.target.value)}
            className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 focus:outline-none focus:border-zinc-600 appearance-none pr-7"
          >
            <option value="all">All Topics</option>
            {topics.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Show edges toggle */}
        <button
          onClick={() => setShowEdges(!showEdges)}
          className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
            showEdges
              ? 'bg-zinc-700/50 text-zinc-300'
              : 'text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800'
          }`}
        >
          {showEdges ? 'Edges on' : 'Edges off'}
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Chunk count */}
        <span className="text-xs text-zinc-600">
          {mappedPoints.length.toLocaleString()} chunks
        </span>
      </div>

      {/* Legend (topic colors) */}
      {colorMode === 'topic' && legendEntries.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1">
          {legendEntries.map(([label, color]) => (
            <button
              key={label}
              onClick={() => setTopicFilter(topicFilter === label ? 'all' : label)}
              className={`flex items-center gap-1.5 transition-opacity ${
                topicFilter !== 'all' && topicFilter !== label ? 'opacity-30' : 'opacity-100'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-[11px] text-zinc-400">{label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Main content */}
      {error ? (
        <div className="flex items-center justify-center flex-1 text-red-400 text-sm">
          {error}
        </div>
      ) : !hasMapData ? (
        <div className="flex items-center justify-center flex-1">
          <div className="text-center space-y-3">
            <p className="text-zinc-400 text-sm">No map data yet.</p>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <p className="text-zinc-500 text-xs mb-2">Generate the map by running:</p>
              <code className="text-emerald-400 text-sm font-mono">
                cd packages/pipeline && npx tsx scripts/compute-map.ts
              </code>
            </div>
          </div>
        </div>
      ) : (
        <div ref={containerRef} className="relative flex-1 min-h-0 rounded-xl overflow-hidden border border-zinc-800">
          <canvas
            ref={canvasRef}
            style={{ width: canvasSize.width, height: canvasSize.height, cursor: isDraggingRef.current ? 'grabbing' : 'crosshair' }}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onWheel={handleWheel}
          />

          {/* Tooltip */}
          {hoveredPoint && (
            <div
              className="absolute pointer-events-none bg-zinc-900/95 border border-zinc-700 rounded-lg p-3 text-xs shadow-xl max-w-xs z-10"
              style={{ left: tooltipPos.x, top: tooltipPos.y }}
            >
              <div className="font-medium text-zinc-200 mb-1 truncate">{hoveredPoint.title}</div>
              <div className="text-zinc-500 mb-1">{hoveredPoint.content_type} &middot; {hoveredPoint.word_count} words</div>
              {hoveredPoint.topics?.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {hoveredPoint.topics.map(t => (
                    <span
                      key={t}
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                      style={{ backgroundColor: (TOPIC_COLORS[t] || '#71717a') + '25', color: TOPIC_COLORS[t] || '#a1a1aa' }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <div className="text-zinc-500 line-clamp-2">{hoveredPoint.snippet}</div>
            </div>
          )}

          {/* Selected point detail panel */}
          {selectedPoint && (
            <div className="absolute bottom-4 left-4 right-4 bg-zinc-900/95 border border-zinc-700 rounded-xl p-4 shadow-xl z-10">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-zinc-200 truncate">{selectedPoint.title}</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {selectedPoint.content_type} &middot; {selectedPoint.word_count} words
                  </p>
                  {selectedPoint.topics?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {selectedPoint.topics.map(t => (
                        <span
                          key={t}
                          className="px-2 py-0.5 rounded text-[11px] font-medium"
                          style={{ backgroundColor: (TOPIC_COLORS[t] || '#71717a') + '25', color: TOPIC_COLORS[t] || '#a1a1aa' }}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-zinc-400 mt-2 line-clamp-3">{selectedPoint.snippet}</p>
                </div>
                <button
                  onClick={() => setSelectedPoint(null)}
                  className="text-zinc-500 hover:text-zinc-300 text-lg leading-none shrink-0"
                >
                  &times;
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
