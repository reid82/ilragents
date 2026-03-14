import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAdminError } from '@/lib/admin-auth';
import { getSupabaseClient } from '@/lib/supabase';
import { UMAP } from 'umap-js';
import {
  getJobStatus,
  setJobStatus,
  resetJob,
  isJobRunning,
} from '@/lib/map-job';

const BATCH_SIZE = 100;
const REDUCED_DIMS = 50; // Pre-reduce from 1536 to avoid stack overflow in umap-js tree building

/** POST — kick off a background UMAP recompute */
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

  // Start the background job — don't await it
  runRecompute().catch((err) => {
    console.error('Background UMAP recompute crashed:', err);
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

  // Check if map_x/map_y columns exist
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

  // Count chunks
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
    const fetchProgress = 10 + Math.round((offset / count) * 30); // 10-40%
    setJobStatus({ stage: `Fetched ${allChunks.length}/${count} embeddings…`, progress: Math.min(fetchProgress, 40) });
  }

  if (allChunks.length < 2) {
    setJobStatus({
      state: 'error',
      error: 'Need at least 2 chunks with embeddings to compute UMAP',
    });
    return;
  }

  // Reduce dimensionality: 1536 → 50 via random projection to prevent
  // stack overflow in umap-js's recursive tree building
  setJobStatus({ stage: 'Reducing dimensions…', progress: 42 });

  const rawEmbeddings = allChunks.map((c) => c.embedding);
  const origDims = rawEmbeddings[0].length;
  const embeddings = origDims > REDUCED_DIMS
    ? randomProject(rawEmbeddings, REDUCED_DIMS)
    : rawEmbeddings;

  // Run UMAP
  setJobStatus({ stage: `Running UMAP on ${allChunks.length} chunks…`, progress: 45 });

  const nNeighbors = Math.min(15, allChunks.length - 1);
  const umap = new UMAP({
    nComponents: 2,
    nNeighbors,
    minDist: 0.1,
    spread: 1.0,
  });

  // Use fitAsync with epoch callback for progress
  // UMAP default is 200 epochs for small datasets, scales with size
  const nEpochs = 200;
  let lastProgressUpdate = Date.now();

  const projection = await umap.fitAsync(embeddings, (epochNumber: number) => {
    // Throttle status updates to every 500ms to avoid overhead
    const now = Date.now();
    if (now - lastProgressUpdate > 500) {
      const umapProgress = 45 + Math.round((epochNumber / nEpochs) * 35); // 45-80%
      setJobStatus({ stage: `UMAP epoch ${epochNumber}…`, progress: Math.min(umapProgress, 80) });
      lastProgressUpdate = now;
    }
  });

  setJobStatus({ stage: 'Saving coordinates…', progress: 82 });

  // Batch update map_x and map_y
  let updated = 0;
  const totalBatches = Math.ceil(allChunks.length / BATCH_SIZE);

  for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
    const batch = allChunks.slice(i, i + BATCH_SIZE);
    const updates = batch.map((chunk, idx) => {
      const projIdx = i + idx;
      return {
        id: chunk.id,
        map_x: projection[projIdx][0],
        map_y: projection[projIdx][1],
      };
    });

    const { error: updateError } = await supabase
      .from('chunks')
      .upsert(updates, { onConflict: 'id', ignoreDuplicates: false });

    if (updateError) throw updateError;
    updated += updates.length;

    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const saveProgress = 82 + Math.round((batchNum / totalBatches) * 18); // 82-100%
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

/**
 * Random projection: reduces high-dimensional vectors to targetDims.
 * Uses a seeded Gaussian random matrix (Johnson–Lindenstrauss lemma
 * guarantees approximate distance preservation).
 */
function randomProject(vectors: number[][], targetDims: number): number[][] {
  const origDims = vectors[0].length;
  const scale = 1 / Math.sqrt(targetDims);

  // Generate random projection matrix (origDims × targetDims)
  // Using simple seeded approach for reproducibility
  let seed = 42;
  function nextRand(): number {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  }
  // Box-Muller for Gaussian random numbers
  function gaussRand(): number {
    const u1 = nextRand();
    const u2 = nextRand();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  // Build the projection matrix
  const projMatrix: number[][] = [];
  for (let j = 0; j < targetDims; j++) {
    const col = new Array(origDims);
    for (let i = 0; i < origDims; i++) {
      col[i] = gaussRand() * scale;
    }
    projMatrix.push(col);
  }

  // Project each vector
  const result: number[][] = new Array(vectors.length);
  for (let v = 0; v < vectors.length; v++) {
    const vec = vectors[v];
    const projected = new Array(targetDims);
    for (let j = 0; j < targetDims; j++) {
      let sum = 0;
      const col = projMatrix[j];
      for (let i = 0; i < origDims; i++) {
        sum += vec[i] * col[i];
      }
      projected[j] = sum;
    }
    result[v] = projected;
  }

  return result;
}
