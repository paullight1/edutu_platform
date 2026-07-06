-- Recommendation engine: pgvector embeddings + enrichment columns.
-- Zero behavior change on its own — the engine reads these once code ships.

-- 1. pgvector (Supabase installs into the extensions schema, already on search_path)
create extension if not exists vector;

-- 2. Opportunity enrichment + embedding columns
alter table public.opportunities
  add column if not exists skills text[] not null default '{}',
  add column if not exists embedding vector(768),
  add column if not exists embedding_model text,
  add column if not exists embedded_at timestamptz;

-- 3. One-time repair: the ranker reads eligibility_criteria but ingestion has
--    historically written requirements into metadata jsonb only.
update public.opportunities
set eligibility_criteria = (
  select string_agg(elem, e'\n')
  from jsonb_array_elements_text(metadata->'requirements') as elem
)
where (eligibility_criteria is null or eligibility_criteria = '')
  and jsonb_typeof(metadata->'requirements') = 'array'
  and jsonb_array_length(metadata->'requirements') > 0;

-- 4. ANN index: HNSW (no training step, good recall at 10k-100k rows).
--    Partial: only active, embedded rows are ever candidates.
create index if not exists idx_opportunities_embedding_hnsw
  on public.opportunities
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64)
  where status = 'active' and embedding is not null;

-- 5. Profile embeddings (backend-owned; service-role access only).
--    NOTE: profiles.user_id is TEXT in the live DB (Clerk-derived ids) — match it.
create table if not exists public.user_profile_embeddings (
  user_id text primary key references public.profiles(user_id) on delete cascade,
  embedding vector(768) not null,
  embedding_model text not null,
  profile_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profile_embeddings enable row level security;

-- 6. Backfill work-queue helper
create index if not exists idx_opportunities_embedding_missing
  on public.opportunities (updated_at desc)
  where status = 'active' and embedding is null;
