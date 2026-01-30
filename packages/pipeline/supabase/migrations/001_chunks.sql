-- Enable pgvector extension
create extension if not exists vector;

-- Chunks table with vector embeddings
create table chunks (
  id text primary key,
  source_id text not null,
  text text not null,
  chunk_index int not null,
  total_chunks int not null,
  word_count int not null,
  content_layer text not null,  -- 'raw' or 'summary'

  -- Metadata for filtering
  agent text not null,
  content_type text not null,
  source_type text,
  title text,
  url text,
  vimeo_id text,
  topics text[],

  -- Timestamps
  extracted_at timestamptz,
  chunked_at timestamptz not null default now(),

  -- Vector embedding (1536 dimensions for text-embedding-3-small)
  embedding vector(1536)
);

-- Indexes for filtering and search
create index chunks_agent_idx on chunks(agent);
create index chunks_content_type_idx on chunks(content_type);
create index chunks_content_layer_idx on chunks(content_layer);
create index chunks_source_id_idx on chunks(source_id);

-- Vector similarity search index (IVFFlat for ~10k vectors)
create index chunks_embedding_idx on chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Function for similarity search
create or replace function match_chunks(
  query_embedding vector(1536),
  match_count int default 10,
  filter_agent text default null,
  filter_content_type text default null,
  filter_content_layer text default null
)
returns table (
  id text,
  source_id text,
  text text,
  chunk_index int,
  total_chunks int,
  word_count int,
  content_layer text,
  agent text,
  content_type text,
  source_type text,
  title text,
  url text,
  vimeo_id text,
  topics text[],
  extracted_at timestamptz,
  chunked_at timestamptz,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    c.id,
    c.source_id,
    c.text,
    c.chunk_index,
    c.total_chunks,
    c.word_count,
    c.content_layer,
    c.agent,
    c.content_type,
    c.source_type,
    c.title,
    c.url,
    c.vimeo_id,
    c.topics,
    c.extracted_at,
    c.chunked_at,
    1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  where
    c.embedding is not null
    and (filter_agent is null or c.agent = filter_agent)
    and (filter_content_type is null or c.content_type = filter_content_type)
    and (filter_content_layer is null or c.content_layer = filter_content_layer)
  order by c.embedding <=> query_embedding
  limit match_count;
end;
$$;
