/**
 * Compute 2D map coordinates for knowledge chunks.
 *
 * Fetches embeddings from Supabase, runs a kNN force-directed layout
 * (cosine similarity on randomly-projected vectors), and writes
 * map_x / map_y back to the chunks table.
 *
 * Run with: npx tsx scripts/compute-map.ts
 *
 * Runs locally — no API timeouts, no stack limits, full CPU available.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// --- Config ---
const REDUCED_DIMS = 32;
const K_NEIGHBORS = 15;
const LAYOUT_EPOCHS = 300;
const REPULSION = 1.0;
const NEG_SAMPLES = 5;
const BATCH_SIZE = 100;

// --- Main ---
async function main() {
  const t0 = Date.now();

  // 1. Check columns exist
  console.log('Checking map_x/map_y columns…');
  const { error: probeError } = await supabase.from('chunks').select('map_x').limit(1);
  if (probeError?.code === '42703') {
    console.error(
      '\nmap_x/map_y columns missing. Run this SQL first:\n' +
        '  ALTER TABLE chunks ADD COLUMN IF NOT EXISTS map_x float;\n' +
        '  ALTER TABLE chunks ADD COLUMN IF NOT EXISTS map_y float;\n'
    );
    process.exit(1);
  }

  // 2. Count
  const { count, error: countError } = await supabase
    .from('chunks')
    .select('id', { count: 'exact', head: true })
    .not('embedding', 'is', null)
    .eq('content_layer', 'raw');

  if (countError) throw countError;
  if (!count || count === 0) {
    console.log('No chunks with embeddings found.');
    return;
  }
  console.log(`Found ${count} chunks with embeddings.`);

  // 3. Fetch embeddings
  console.log('Fetching embeddings…');
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
      // Supabase returns pgvector embeddings as JSON strings
      const emb = typeof chunk.embedding === 'string'
        ? JSON.parse(chunk.embedding)
        : chunk.embedding;
      allChunks.push({ id: chunk.id, embedding: emb as number[] });
    }
    offset += pageSize;
    process.stdout.write(`\r  ${allChunks.length}/${count}`);
  }
  console.log();

  if (allChunks.length < 2) {
    console.log('Need at least 2 chunks.');
    return;
  }

  const n = allChunks.length;
  const origDims = allChunks[0].embedding.length;

  // 4. Random projection: 1536 → 32
  console.log(`Reducing dimensions: ${origDims} → ${REDUCED_DIMS}…`);
  const embeddings = origDims > REDUCED_DIMS
    ? randomProject(allChunks.map((c) => c.embedding), REDUCED_DIMS)
    : allChunks.map((c) => c.embedding);
  const dims = embeddings[0].length;

  // 5. Build kNN graph
  console.log(`Building ${K_NEIGHBORS}-nearest neighbor graph…`);
  const norms = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let d = 0; d < dims; d++) sum += embeddings[i][d] * embeddings[i][d];
    norms[i] = Math.sqrt(sum);
  }

  const K = Math.min(K_NEIGHBORS, n - 1);
  const neighbors: Int32Array[] = new Array(n);
  const similarities: Float64Array[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const sims = new Float64Array(n);
    const ei = embeddings[i];
    const ni = norms[i];
    for (let j = 0; j < n; j++) {
      if (i === j) { sims[j] = -2; continue; }
      let dot = 0;
      const ej = embeddings[j];
      for (let d = 0; d < dims; d++) dot += ei[d] * ej[d];
      sims[j] = dot / (ni * norms[j] + 1e-10);
    }

    // Partial sort for top K
    const indices = new Int32Array(n);
    for (let j = 0; j < n; j++) indices[j] = j;
    for (let k = 0; k < K; k++) {
      let maxIdx = k;
      for (let j = k + 1; j < n; j++) {
        if (sims[indices[j]] > sims[indices[maxIdx]]) maxIdx = j;
      }
      const tmp = indices[k];
      indices[k] = indices[maxIdx];
      indices[maxIdx] = tmp;
    }

    neighbors[i] = new Int32Array(K);
    similarities[i] = new Float64Array(K);
    for (let k = 0; k < K; k++) {
      neighbors[i][k] = indices[k];
      similarities[i][k] = Math.max(0, sims[indices[k]]);
    }

    if (i % 100 === 0) process.stdout.write(`\r  ${i}/${n}`);
  }
  console.log(`\r  ${n}/${n}`);

  // 6. Force-directed layout
  console.log(`Running force layout (${LAYOUT_EPOCHS} epochs)…`);
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

  for (let epoch = 0; epoch < LAYOUT_EPOCHS; epoch++) {
    const lr = 1.0 * (1 - epoch / LAYOUT_EPOCHS);
    const forceX = new Float64Array(n);
    const forceY = new Float64Array(n);

    // Attractive forces
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < K; k++) {
        const j = neighbors[i][k];
        const w = similarities[i][k];
        forceX[i] += (posX[j] - posX[i]) * w * 0.1;
        forceY[i] += (posY[j] - posY[i]) * w * 0.1;
      }
    }

    // Repulsive forces (negative sampling)
    for (let i = 0; i < n; i++) {
      for (let s = 0; s < NEG_SAMPLES; s++) {
        const j = Math.floor(seededRandom() * n);
        if (j === i) continue;
        const dx = posX[i] - posX[j];
        const dy = posY[i] - posY[j];
        const dist2 = dx * dx + dy * dy + 0.01;
        const rep = REPULSION / dist2;
        forceX[i] += dx * rep;
        forceY[i] += dy * rep;
      }
    }

    // Apply with clamping
    for (let i = 0; i < n; i++) {
      const fMag = Math.sqrt(forceX[i] * forceX[i] + forceY[i] * forceY[i]);
      const maxF = 4.0;
      if (fMag > maxF) {
        forceX[i] = (forceX[i] / fMag) * maxF;
        forceY[i] = (forceY[i] / fMag) * maxF;
      }
      posX[i] += forceX[i] * lr;
      posY[i] += forceY[i] * lr;
    }

    if (epoch % 30 === 0) process.stdout.write(`\r  epoch ${epoch}/${LAYOUT_EPOCHS}`);
  }
  console.log(`\r  epoch ${LAYOUT_EPOCHS}/${LAYOUT_EPOCHS}`);

  // 7. Save to database (update existing rows one at a time)
  console.log('Saving map coordinates…');
  let updated = 0;
  for (let i = 0; i < n; i++) {
    const { error } = await supabase
      .from('chunks')
      .update({ map_x: posX[i], map_y: posY[i] })
      .eq('id', allChunks[i].id);

    if (error) throw error;
    updated++;
    if (updated % 100 === 0) process.stdout.write(`\r  ${updated}/${n}`);
  }
  process.stdout.write(`\r  ${updated}/${n}`);
  console.log();

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`Done! Updated ${updated} chunks in ${elapsed}s.`);
}

// --- Random Projection ---
function randomProject(vectors: number[][], targetDims: number): number[][] {
  const origDims = vectors[0].length;
  const scale = 1 / Math.sqrt(targetDims);

  let seed = 42;
  function nextRand(): number {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  }
  function gaussRand(): number {
    const u1 = nextRand();
    const u2 = nextRand();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  const projMatrix: number[][] = [];
  for (let j = 0; j < targetDims; j++) {
    const col = new Array(origDims);
    for (let i = 0; i < origDims; i++) col[i] = gaussRand() * scale;
    projMatrix.push(col);
  }

  return vectors.map((vec) => {
    const projected = new Array(targetDims);
    for (let j = 0; j < targetDims; j++) {
      let sum = 0;
      const col = projMatrix[j];
      for (let i = 0; i < origDims; i++) sum += vec[i] * col[i];
      projected[j] = sum;
    }
    return projected;
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
