import { AGENTS } from './agents';
import { getSupabaseClient } from './supabase';

export async function seedPersonas(): Promise<number> {
  const supabase = getSupabaseClient();

  const rows = AGENTS.map((agent) => ({
    id: agent.id,
    agent_name: agent.name,
    domain: agent.domain,
    greeting_message: `Hi, I'm ${agent.name}. ${agent.description}`,
  }));

  const { error } = await supabase
    .from('agent_personas')
    .upsert(rows, { onConflict: 'id' });

  if (error) {
    throw new Error(`Failed to seed personas: ${error.message}`);
  }

  return rows.length;
}
