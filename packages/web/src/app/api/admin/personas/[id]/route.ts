import { NextRequest, NextResponse } from 'next/server';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '../../.env') });

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const { getSupabaseClient } = await import('@/lib/supabase');
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('agent_personas')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Persona fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch persona' },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await req.json();
    const { system_prompt_override, personality_traits, greeting_message, elevenlabs_agent_id } = body;

    const { getSupabaseClient } = await import('@/lib/supabase');
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('agent_personas')
      .update({
        system_prompt_override: system_prompt_override || null,
        personality_traits: personality_traits || null,
        greeting_message: greeting_message || null,
        elevenlabs_agent_id: elevenlabs_agent_id || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Persona update error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update persona' },
      { status: 500 }
    );
  }
}
