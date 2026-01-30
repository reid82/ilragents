import { NextRequest, NextResponse } from 'next/server';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '../../.env') });

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { transcript, sessionId } = body;

  if (!transcript) {
    return NextResponse.json(
      { error: 'transcript is required' },
      { status: 400 }
    );
  }

  try {
    const { extractFinancialContext } = await import(
      '@/lib/extract-financial-context'
    );

    const financialData = await extractFinancialContext(transcript);

    // Persist to Supabase if sessionId provided (non-fatal if fails)
    if (sessionId) {
      try {
        const { getSupabaseClient } = await import('@/lib/supabase');
        const supabase = getSupabaseClient();

        await supabase.from('financial_positions').upsert(
          {
            session_id: sessionId,
            raw_transcript: transcript,
            structured_data: financialData,
            summary: financialData.summary,
          },
          { onConflict: 'session_id' }
        );
      } catch (dbError) {
        console.error('Failed to persist financial data:', dbError);
      }
    }

    return NextResponse.json(financialData);
  } catch (error) {
    console.error('Extraction error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Extraction failed' },
      { status: 500 }
    );
  }
}
