import { NextResponse } from 'next/server';
import { config } from 'dotenv';
import path from 'path';
import { requireAdmin, isAdminError } from '@/lib/admin-auth';

config({ path: path.resolve(process.cwd(), '../../.env') });

export async function POST() {
  try {
    const auth = await requireAdmin();
    if (isAdminError(auth)) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { seedPersonas } = await import('@/lib/seed-personas');
    const count = await seedPersonas();
    return NextResponse.json({ seeded: count });
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Seed failed' },
      { status: 500 }
    );
  }
}
