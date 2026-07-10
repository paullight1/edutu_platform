-- Hybrid search support for opportunities:
--   1. pg_trgm for typo-tolerant trigram similarity on titles.
--   2. A weighted, generated (STORED) tsvector column for full-text search
--      (title=A, organization=B, summary/description=C).
--   3. GIN indexes on both.
-- All statements are idempotent (IF NOT EXISTS) and additive/non-breaking.

create extension if not exists pg_trgm;

-- Postgres 15 best practice: GENERATED ALWAYS AS ... STORED beats triggers for
-- multi-column weighted tsvectors (no trigger drift, always in sync).
-- Explicit 'english' regconfig keeps the expression IMMUTABLE as required.
-- Description is capped to keep the stored vector bounded on very long rows.
alter table public.opportunities
  add column if not exists search_tsv tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A')
      || setweight(to_tsvector('english', coalesce(organization, '')), 'B')
      || setweight(to_tsvector('english', coalesce(summary, '')), 'C')
      || setweight(to_tsvector('english', left(coalesce(description, ''), 20000)), 'C')
  ) stored;

create index if not exists idx_opportunities_search_tsv
  on public.opportunities
  using gin (search_tsv);

create index if not exists idx_opportunities_title_trgm
  on public.opportunities
  using gin (lower(title) gin_trgm_ops);
