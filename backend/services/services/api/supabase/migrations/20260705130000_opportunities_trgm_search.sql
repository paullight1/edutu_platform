-- Trigram search indexes for the paid API's ?q= filter (edutu M4).
--
-- EdutuApiService.buildFilters searches with ILIKE '%term%' across title,
-- description, category and eligibility_criteria. A leading wildcard cannot use
-- a btree index, so every search was a sequential scan over the active-
-- opportunity set. A GIN index with gin_trgm_ops accelerates ILIKE/LIKE
-- wildcard matches automatically — no query change required.

create extension if not exists pg_trgm;

create index if not exists opportunities_title_trgm_idx
  on public.opportunities using gin (title gin_trgm_ops);

create index if not exists opportunities_description_trgm_idx
  on public.opportunities using gin (description gin_trgm_ops);

create index if not exists opportunities_category_trgm_idx
  on public.opportunities using gin (category gin_trgm_ops);

create index if not exists opportunities_eligibility_trgm_idx
  on public.opportunities using gin (eligibility_criteria gin_trgm_ops);
