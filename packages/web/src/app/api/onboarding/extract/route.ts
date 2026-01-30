import { NextRequest, NextResponse } from 'next/server';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '../../.env') });

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { transcript, sessionId, existingProfile } = body;

  if (!transcript) {
    return NextResponse.json(
      { error: 'transcript is required' },
      { status: 400 }
    );
  }

  try {
    const { extractClientProfile, mergeClientProfile } = await import(
      '@/lib/extract-financial-context'
    );

    let profileData;

    if (existingProfile) {
      // Merge mode: update existing profile with new conversation data
      const { profile, hasChanges } = await mergeClientProfile(
        existingProfile,
        transcript
      );
      profileData = profile;

      if (!hasChanges) {
        return NextResponse.json({ ...profileData, _noChanges: true });
      }
    } else {
      // Fresh extraction from onboarding
      profileData = await extractClientProfile(transcript);
    }

    // Persist to Supabase if sessionId provided (non-fatal if fails)
    if (sessionId) {
      try {
        const { getSupabaseClient } = await import('@/lib/supabase');
        const supabase = getSupabaseClient();

        await supabase.from('financial_positions').upsert(
          {
            session_id: sessionId,
            raw_transcript: transcript,
            structured_data: profileData,
            summary: profileData.summary,
          },
          { onConflict: 'session_id' }
        );
      } catch (dbError) {
        console.error('Failed to persist profile data:', dbError);
      }
    }

    return NextResponse.json(profileData);
  } catch (error) {
    console.error('Extraction error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Extraction failed' },
      { status: 500 }
    );
  }
}
