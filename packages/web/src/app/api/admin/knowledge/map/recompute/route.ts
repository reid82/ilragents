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

  // Run UMAP
  setJobStatus({ stage: `Running UMAP on ${allChunks.length} chunks…`, progress: 45 });

  const nNeighbors = Math.min(15, allChunks.length - 1);
  const umap = new UMAP({
    nComponents: 2,
    nNeighbors,
    minDist: 0.1,
    spread: 1.0,
  });

  const embeddings = allChunks.map((c) => c.embedding);

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
