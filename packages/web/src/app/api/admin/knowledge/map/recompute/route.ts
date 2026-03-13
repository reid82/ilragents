import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAdminError } from '@/lib/admin-auth';
import { getSupabaseClient } from '@/lib/supabase';
import { UMAP } from 'umap-js';

const MAX_CHUNKS_SYNC = 5000;
const BATCH_SIZE = 100;

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAdminError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabase = getSupabaseClient();
    const startTime = Date.now();

    // First, count how many chunks we're dealing with
    const { count, error: countError } = await supabase
      .from('chunks')
      .select('id', { count: 'exact', head: true })
      .not('embedding', 'is', null)
      .eq('content_layer', 'raw');

    if (countError) throw countError;

    if (!count || count === 0) {
      return NextResponse.json({ updated: 0, duration_ms: Date.now() - startTime });
    }

    if (count > MAX_CHUNKS_SYNC) {
      return NextResponse.json(
        {
          error: 'Too many chunks for synchronous computation',
          count,
          max: MAX_CHUNKS_SYNC,
          message: `Dataset has ${count} chunks which exceeds the ${MAX_CHUNKS_SYNC} limit for synchronous UMAP. Consider running this as a background job.`,
        },
        { status: 202 }
      );
    }

    // Fetch all chunks with embeddings in pages (Supabase default limit is 1000)
    const allChunks: { id: string; embedding: number[] }[] = [];
    const pageSize = 1000;
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
    }

    if (allChunks.length < 2) {
      return NextResponse.json(
        { error: 'Need at least 2 chunks with embeddings to compute UMAP' },
        { status: 400 }
      );
    }

    // Run UMAP dimensionality reduction
    const nNeighbors = Math.min(15, allChunks.length - 1);
    const umap = new UMAP({
      nComponents: 2,
      nNeighbors,
      minDist: 0.1,
      spread: 1.0,
    });

    const embeddings = allChunks.map((c) => c.embedding);
    const projection = umap.fit(embeddings);

    // Batch update map_x and map_y
    let updated = 0;

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
    }

    const durationMs = Date.now() - startTime;

    return NextResponse.json({
      updated,
      duration_ms: durationMs,
    });
  } catch (error) {
    console.error('UMAP recompute error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to recompute UMAP projection' },
      { status: 500 }
    );
  }
}
