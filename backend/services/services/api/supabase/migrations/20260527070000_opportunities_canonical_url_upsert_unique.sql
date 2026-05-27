-- Supabase/PostgREST upsert with on_conflict=canonical_url requires a
-- non-partial unique index that exactly matches the conflict target.
create unique index if not exists opportunities_canonical_url_upsert_unique_idx
  on public.opportunities (canonical_url);
