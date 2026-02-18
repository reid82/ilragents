import { NextRequest, NextResponse } from 'next/server';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '../../.env') });

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }

    const { scrapeListing } = await import('@ilre/pipeline/listing');
    const listing = await scrapeListing(url);

    return NextResponse.json({
      listing,
      scrapedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Listing scrape error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Scrape failed' },
      { status: 500 }
    );
  }
}
