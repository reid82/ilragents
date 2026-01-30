import { NextResponse } from 'next/server';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '../../.env') });

export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;

  if (!apiKey || !agentId) {
    return NextResponse.json(
      { error: 'Voice chat is not configured', available: false },
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
