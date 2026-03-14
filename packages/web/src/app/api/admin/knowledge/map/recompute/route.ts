import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAdminError } from '@/lib/admin-auth';

/**
 * Map recompute is now a standalone CLI script (packages/pipeline/scripts/compute-map.ts).
 * This route just tells the frontend how to run it.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAdminError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  return NextResponse.json(
    {
      error: 'Recompute is now a CLI command',
      message:
        'Map coordinates are computed offline. Run: cd packages/pipeline && npx tsx scripts/compute-map.ts',
    },
    { status: 400 }
  );
}
