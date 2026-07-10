-- Duplicate detection support for scraped opportunities.
-- Idempotent: the columns may already exist in some environments
-- (they are declared in the API's Drizzle schema).
--
-- duplicate_of: annotation only — points at the opportunity this row likely
-- duplicates. Rows are never deleted; flagged rows are routed to
-- status 'pending_review' for admin triage.

alter table public.opportunities
  add column if not exists content_fingerprint text,
  add column if not exists duplicate_of uuid;

-- FK guard (nullable, no cascade — deleting the original must not delete the
-- flagged duplicate; it just clears the pointer).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'opportunities_duplicate_of_fkey'
  ) then
    alter table public.opportunities
      add constraint opportunities_duplicate_of_fkey
      foreign key (duplicate_of) references public.opportunities (id)
      on delete set null;
  end if;
end $$;

-- Batched Tier-1 dedup lookups run one IN query per scrape persist.
create index if not exists idx_opportunities_content_fingerprint
  on public.opportunities (content_fingerprint)
  where content_fingerprint is not null;

create index if not exists idx_opportunities_duplicate_of
  on public.opportunities (duplicate_of)
  where duplicate_of is not null;
