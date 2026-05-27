-- Keep the opportunity engine aligned with the canonical Supabase table shape.
-- The scraper and admin views use application_url/close_date/canonical_url, while
-- recommendation reads require status to filter publishable records.

alter table public.opportunities
  add column if not exists status text not null default 'active',
  add column if not exists type text,
  add column if not exists deadline timestamp with time zone,
  add column if not exists apply_url text,
  add column if not exists image_url text,
  add column if not exists eligibility_criteria text,
  add column if not exists funding_type text,
  add column if not exists target_region text,
  add column if not exists original_json text,
  add column if not exists source_url text,
  add column if not exists canonical_url text,
  add column if not exists content_fingerprint text,
  add column if not exists quality_score integer,
  add column if not exists validation_status text not null default 'pending',
  add column if not exists duplicate_of uuid references public.opportunities(id) on delete set null;

update public.opportunities
set canonical_url = nullif(
  lower(
    regexp_replace(
      regexp_replace(coalesce(application_url, ''), '(\?|#).*$', ''),
      '/+$',
      ''
    )
  ),
  ''
)
where canonical_url is null;

update public.opportunities
set content_fingerprint = md5(
  lower(trim(coalesce(title, ''))) || '|' ||
  lower(trim(coalesce(organization, ''))) || '|' ||
  coalesce(close_date::text, '')
)
where content_fingerprint is null;

create unique index if not exists opportunities_canonical_url_unique_idx
  on public.opportunities (canonical_url)
  where canonical_url is not null
    and duplicate_of is null;

create index if not exists opportunities_status_created_idx
  on public.opportunities (status, created_at desc, id desc);

create index if not exists opportunities_close_date_created_idx
  on public.opportunities (close_date, created_at desc, id desc);

create index if not exists opportunities_validation_status_idx
  on public.opportunities (validation_status, quality_score);
