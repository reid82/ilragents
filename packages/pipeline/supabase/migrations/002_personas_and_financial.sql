-- Agent personas table - stores system prompt overrides
create table if not exists agent_personas (
  id text primary key,
  agent_name text not null,
  domain text not null,
  base_system_prompt text,
  system_prompt_override text,
  personality_traits text,
  greeting_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Financial positions table - stores onboarding results per session
create table if not exists financial_positions (
  id uuid primary key default gen_random_uuid(),
  session_id text not null unique,
  raw_transcript text not null,
  structured_data jsonb,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists financial_positions_session_idx on financial_positions(session_id);

-- Updated_at trigger function
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Only create triggers if they don't exist (use DO block)
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'agent_personas_updated_at'
  ) then
    create trigger agent_personas_updated_at
      before update on agent_personas
      for each row execute function update_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'financial_positions_updated_at'
  ) then
    create trigger financial_positions_updated_at
      before update on financial_positions
      for each row execute function update_updated_at();
  end if;
end;
$$;
