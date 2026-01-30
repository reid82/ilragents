import { NextResponse } from 'next/server';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '../../.env') });

export async function POST() {
  try {
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
