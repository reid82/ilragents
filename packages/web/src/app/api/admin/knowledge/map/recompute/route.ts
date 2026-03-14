import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAdminError } from '@/lib/admin-auth';
import { getSupabaseClient } from '@/lib/supabase';
import {
  getJobStatus,
  setJobStatus,
  isJobRunning,
} from '@/lib/map-job';

const BATCH_SIZE = 100;

/** POST — kick off a background map recompute */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAdminError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (isJobRunning()) {
    return NextResponse.json(
      { error: 'A recompute job is already running', status: getJobStatus() },
      { status: 409 }
    );
  }

  runRecompute().catch((err) => {
    console.error('Background map recompute crashed:', err);
    setJobStatus({
      state: 'error',
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  });

  return NextResponse.json({ started: true, status: getJobStatus() });
}

/** GET — poll job status */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAdminError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  return NextResponse.json(getJobStatus());
}

// ---- Background worker ----

async function runRecompute() {
  const supabase = getSupabaseClient();
  const startTime = Date.now();

  setJobStatus({ state: 'running', stage: 'Checking columns…', progress: 0, startedAt: startTime });

  const { error: probeError } = await supabase
    .from('chunks')
    .select('map_x')
    .limit(1);

  if (probeError && probeError.code === '42703') {
    setJobStatus({
      state: 'error',
      error:
        'Missing map_x/map_y columns. Run: ALTER TABLE chunks ADD COLUMN IF NOT EXISTS map_x float; ALTER TABLE chunks ADD COLUMN IF NOT EXISTS map_y float;',
    });
    return;
  }

  setJobStatus({ state: 'running', stage: 'Counting chunks…', progress: 5 });

  const { count, error: countError } = await supabase
    .from('chunks')
    .select('id', { count: 'exact', head: true })
    .not('embedding', 'is', null)
    .eq('content_layer', 'raw');

  if (countError) throw countError;

  if (!count || count === 0) {
    setJobStatus({ state: 'done', updated: 0, duration_ms: Date.now() - startTime, progress: 100 });
    return;
  }

  // Fetch embeddings in pages
  setJobStatus({ state: 'running', stage: `Fetching ${count} embeddings…`, progress: 10 });

  const allChunks: { id: string; embedding: number[] }[] = [];
  const pageSize = 500;
  let offset = 0;

  while (offset < count) {
    const { data, error } = await supabase
      .from('chunks')
      .select('id, embedding')
      .not('embedding', 'is', null)
      .eq('content_layer', 'raw')
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const chunk of data) {
      allChunks.push({
        id: chunk.id,
        embedding: chunk.embedding as number[],
      });
    }

    offset += pageSize;
    const fetchProgress = 10 + Math.round((offset / count) * 25);
    setJobStatus({ stage: `Fetched ${allChunks.length}/${count} embeddings…`, progress: Math.min(fetchProgress, 35) });
  }

  if (allChunks.length < 2) {
    setJobStatus({
      state: 'error',
      error: 'Need at least 2 chunks with embeddings to compute projection',
    });
    return;
  }

  // Compute 2D layout using cosine-similarity-based force layout
  // Entirely iterative — no recursion, no stack overflow risk
  setJobStatus({ stage: 'Computing 2D projection…', progress: 40 });

  const n = allChunks.length;
  const embeddings = allChunks.map((c) => c.embedding);

  // Step 1: Build cosine similarity matrix (only store k nearest neighbors)
  const K = Math.min(15, n - 1);
  setJobStatus({ stage: `Building ${K}-nearest neighbor graph…`, progress: 42 });

  // Pre-compute norms
  const norms = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    const e = embeddings[i];
    for (let d = 0; d < e.length; d++) sum += e[d] * e[d];
    norms[i] = Math.sqrt(sum);
  }

  // For each point, find K nearest neighbors by cosine similarity
  const neighbors: Int32Array[] = new Array(n);
  const similarities: Float64Array[] = new Array(n);

  for (let i = 0; i < n; i++) {
    // Compute cosine similarity to all other points
    const sims = new Float64Array(n);
    const ei = embeddings[i];
    const ni = norms[i];
    for (let j = 0; j < n; j++) {
      if (i === j) { sims[j] = -2; continue; } // exclude self
      let dot = 0;
      const ej = embeddings[j];
      for (let d = 0; d < ei.length; d++) dot += ei[d] * ej[d];
      sims[j] = dot / (ni * norms[j] + 1e-10);
    }

    // Find top-K neighbors (partial sort)
    const indices = new Int32Array(n);
    for (let j = 0; j < n; j++) indices[j] = j;
    // Simple partial sort: find top K
    for (let k = 0; k < K; k++) {
      let maxIdx = k;
      for (let j = k + 1; j < n; j++) {
        if (sims[indices[j]] > sims[indices[maxIdx]]) maxIdx = j;
      }
      // Swap
      const tmp = indices[k];
      indices[k] = indices[maxIdx];
      indices[maxIdx] = tmp;
    }

    neighbors[i] = new Int32Array(K);
    similarities[i] = new Float64Array(K);
    for (let k = 0; k < K; k++) {
      neighbors[i][k] = indices[k];
      similarities[i][k] = Math.max(0, sims[indices[k]]); // clamp negative
    }

    if (i % 50 === 0) {
      const nnProgress = 42 + Math.round((i / n) * 20);
      setJobStatus({ stage: `Building neighbor graph… ${i}/${n}`, progress: Math.min(nnProgress, 62) });
      // Yield to event loop periodically
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // Step 2: Initialize 2D positions randomly (seeded)
  const posX = new Float64Array(n);
  const posY = new Float64Array(n);
  let seed = 42;
  function seededRandom(): number {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }
  for (let i = 0; i < n; i++) {
    posX[i] = (seededRandom() - 0.5) * 10;
    posY[i] = (seededRandom() - 0.5) * 10;
  }

  // Step 3: Iterative force-directed layout
  // Attractive forces between neighbors, repulsive forces between all pairs
  const EPOCHS = 300;
  const REPULSION = 1.0;

  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    const lr = 1.0 * (1 - epoch / EPOCHS); // decaying learning rate
    const forceX = new Float64Array(n);
    const forceY = new Float64Array(n);

    // Attractive forces (from kNN graph)
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < K; k++) {
        const j = neighbors[i][k];
        const w = similarities[i][k];
        const dx = posX[j] - posX[i];
        const dy = posY[j] - posY[i];
        const attraction = w * 0.1;
        forceX[i] += dx * attraction;
        forceY[i] += dy * attraction;
      }
    }

    // Repulsive forces (sampled — use negative sampling for O(n) instead of O(n²))
    const nNegSamples = 5;
    for (let i = 0; i < n; i++) {
      for (let s = 0; s < nNegSamples; s++) {
        const j = Math.floor(seededRandom() * n);
        if (j === i) continue;
        const dx = posX[i] - posX[j];
        const dy = posY[i] - posY[j];
        const dist2 = dx * dx + dy * dy + 0.01; // avoid div by zero
        const repulsion = REPULSION / dist2;
        forceX[i] += dx * repulsion;
        forceY[i] += dy * repulsion;
      }
    }

    // Apply forces
    for (let i = 0; i < n; i++) {
      // Clamp force magnitude
      const fMag = Math.sqrt(forceX[i] * forceX[i] + forceY[i] * forceY[i]);
      const maxForce = 4.0;
      if (fMag > maxForce) {
        forceX[i] = (forceX[i] / fMag) * maxForce;
        forceY[i] = (forceY[i] / fMag) * maxForce;
      }
      posX[i] += forceX[i] * lr;
      posY[i] += forceY[i] * lr;
    }

    // Yield to event loop and report progress every 10 epochs
    if (epoch % 10 === 0) {
      const layoutProgress = 65 + Math.round((epoch / EPOCHS) * 17);
      setJobStatus({ stage: `Layout epoch ${epoch}/${EPOCHS}…`, progress: Math.min(layoutProgress, 82) });
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  setJobStatus({ stage: 'Saving coordinates…', progress: 83 });

  // Save results
  let updated = 0;
  const totalBatches = Math.ceil(n / BATCH_SIZE);

  for (let i = 0; i < n; i += BATCH_SIZE) {
    const batch = allChunks.slice(i, i + BATCH_SIZE);
    const updates = batch.map((chunk, idx) => ({
      id: chunk.id,
      map_x: posX[i + idx],
      map_y: posY[i + idx],
    }));

    const { error: updateError } = await supabase
      .from('chunks')
      .upsert(updates, { onConflict: 'id', ignoreDuplicates: false });

    if (updateError) throw updateError;
    updated += updates.length;

    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const saveProgress = 83 + Math.round((batchNum / totalBatches) * 17);
    setJobStatus({ stage: `Saved batch ${batchNum}/${totalBatches}…`, progress: Math.min(saveProgress, 99) });
  }

  const durationMs = Date.now() - startTime;

  setJobStatus({
    state: 'done',
    stage: 'Complete',
    progress: 100,
    updated,
    duration_ms: durationMs,
  });
}
