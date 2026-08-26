-- Source-independent dedup key: title + deadline only.
--
-- The primary content_fingerprint is `title|source|close_date`, so the SAME
-- opportunity harvested from two aggregators gets two different fingerprints and
-- slips past Tier-1 exact dedup. title_fingerprint drops the source so those
-- cross-source duplicates match. Purely additive — content_fingerprint is
-- unchanged, so nothing regresses; this only ADDS matches.

alter table public.opportunities
  add column if not exists title_fingerprint text;

-- Backfill with the EXACT normalization createTitleFingerprint() uses in the
-- scraper: trim -> collapse internal whitespace -> lowercase, then |close_date.
-- (lower/collapse order is irrelevant — neither affects the other.)
update public.opportunities
set title_fingerprint =
  lower(regexp_replace(btrim(coalesce(title, '')), '\s+', ' ', 'g'))
    || '|' || coalesce(close_date::text, '')
where title_fingerprint is null;

create index if not exists idx_opportunities_title_fingerprint
  on public.opportunities (title_fingerprint)
  where title_fingerprint is not null;
