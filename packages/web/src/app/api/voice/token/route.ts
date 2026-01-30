import { NextRequest, NextResponse } from 'next/server';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '../../.env') });

export async function GET(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentSlug = req.nextUrl.searchParams.get('agent');

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Voice chat is not configured', available: false },
      { status: 503 }
    );
  }

  // Look up per-agent ElevenLabs ID from Supabase, fall back to env var
  let agentId: string | null = process.env.ELEVENLABS_AGENT_ID || null;

  if (agentSlug) {
    try {
      const { getSupabaseClient } = await import('@/lib/supabase');
      const supabase = getSupabaseClient();
      const { data } = await supabase
        .from('agent_personas')
        .select('elevenlabs_agent_id')
        .eq('id', agentSlug)
        .single();
      if (data?.elevenlabs_agent_id) {
        agentId = data.elevenlabs_agent_id;
      }
    } catch {
      // Non-fatal: fall back to default env var
    }
  }

  if (!agentId) {
    return NextResponse.json(
      { error: 'No ElevenLabs agent configured for this specialist', available: false },
      { status: 503 }
    );
  }

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
      {
        method: 'GET',
        headers: {
          'xi-api-key': apiKey,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }

    const data = await response.json();

    return NextResponse.json({
      available: true,
      signedUrl: data.signed_url,
    });
  } catch (error) {
    console.error('Voice token error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to get voice token',
        available: false,
      },
      { status: 500 }
    );
  }
}
