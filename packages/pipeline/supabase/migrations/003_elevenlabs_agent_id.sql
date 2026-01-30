-- Add ElevenLabs agent ID column to personas
alter table agent_personas add column if not exists elevenlabs_agent_id text;
