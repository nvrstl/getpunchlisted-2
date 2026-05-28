-- ── pgvector + context_chunks ────────────────────────────────────────────────
-- Per-chunk embeddings for project_context rows. Lets the chat do semantic
-- retrieval across multi-hundred-page documents instead of the keyword
-- fallback in api/project-chat.js.
--
-- Embedding model: OpenAI text-embedding-3-small → 1536 dims.
-- Distance: cosine (<=> operator on the embedding column).
--
-- Safe to re-run.

create extension if not exists vector;

create table if not exists context_chunks (
  id                  uuid default gen_random_uuid() primary key,
  project_context_id  uuid references project_context(id) on delete cascade not null,
  project_id          uuid references projects(id)        on delete cascade not null,
  chunk_idx           int  not null,
  text                text not null,
  embedding           vector(1536),
  created_at          timestamptz default now(),
  unique (project_context_id, chunk_idx)
);

-- Per-project filtered cosine search is the hot query — index on project_id
-- as a btree, embedding with HNSW for fast nearest-neighbour lookup.
create index if not exists context_chunks_project_idx
  on context_chunks (project_id);

create index if not exists context_chunks_embedding_idx
  on context_chunks using hnsw (embedding vector_cosine_ops);

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Chunks inherit visibility from their project. Use the same user_can_access_project()
-- helper that backs every other per-project table.
alter table context_chunks enable row level security;

drop policy if exists "context_chunks_all" on context_chunks;
create policy "context_chunks_all" on context_chunks
  for all using (user_can_access_project(project_id));

-- ── Search function ──────────────────────────────────────────────────────────
-- Returns top-K chunks for a project, ranked by cosine similarity to the
-- supplied query embedding. Wrapped as a function so the chat handler can
-- call it with a single rpc('match_context_chunks', ...) instead of building
-- raw vector SQL on the client.
create or replace function match_context_chunks(
  p_project_id  uuid,
  p_embedding   vector(1536),
  p_match_count int default 20
)
returns table (
  chunk_id           uuid,
  project_context_id uuid,
  text               text,
  similarity         float
)
language sql
stable
as $$
  select
    cc.id                  as chunk_id,
    cc.project_context_id  as project_context_id,
    cc.text                as text,
    1 - (cc.embedding <=> p_embedding) as similarity
  from context_chunks cc
  where cc.project_id = p_project_id
    and cc.embedding is not null
  order by cc.embedding <=> p_embedding
  limit p_match_count;
$$;
