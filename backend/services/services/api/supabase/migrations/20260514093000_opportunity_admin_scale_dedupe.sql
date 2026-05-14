create extension if not exists pg_trgm;

alter table public.opportunities
  add column if not exists source_url text,
  add column if not exists is_featured boolean not null default false,
  add column if not exists views integer not null default 0,
  add column if not exists applications integer not null default 0,
  add column if not exists canonical_url text,
  add column if not exists content_fingerprint text,
  add column if not exists quality_score integer,
  add column if not exists validation_status text not null default 'pending',
  add column if not exists duplicate_of uuid references public.opportunities(id) on delete set null;

update public.opportunities
set canonical_url = nullif(
  lower(
    regexp_replace(
      regexp_replace(coalesce(application_url, ''), '(\?|#).*$',''),
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

update public.opportunities
set quality_score = nullif(metadata->>'extraction_quality_score', '')::integer
where quality_score is null
  and metadata ? 'extraction_quality_score'
  and (metadata->>'extraction_quality_score') ~ '^[0-9]+$';

with ranked_duplicates as (
  select
    id,
    first_value(id) over (
      partition by canonical_url
      order by created_at desc, id
    ) as survivor_id,
    row_number() over (
      partition by canonical_url
      order by created_at desc, id
    ) as duplicate_rank
  from public.opportunities
  where canonical_url is not null
)
update public.opportunities opportunity
set
  duplicate_of = ranked_duplicates.survivor_id,
  validation_status = 'duplicate',
  metadata = jsonb_set(
    coalesce(opportunity.metadata, '{}'::jsonb),
    '{duplicate_of}',
    to_jsonb(ranked_duplicates.survivor_id::text),
    true
  )
from ranked_duplicates
where opportunity.id = ranked_duplicates.id
  and ranked_duplicates.duplicate_rank > 1
  and opportunity.duplicate_of is null;

update public.opportunities
set validation_status = case
  when duplicate_of is not null then 'duplicate'
  when status = 'pending_review' or metadata->>'needs_review' = 'true' then 'needs_review'
  when status = 'active' then 'valid'
  else validation_status
end
where validation_status = 'pending'
  or duplicate_of is not null
  or status in ('pending_review', 'active');

create unique index if not exists opportunities_canonical_url_unique_idx
  on public.opportunities (canonical_url)
  where canonical_url is not null
    and duplicate_of is null;

create index if not exists opportunities_status_created_idx
  on public.opportunities (status, created_at desc, id desc);

create index if not exists opportunities_category_created_idx
  on public.opportunities (category, created_at desc, id desc);

create index if not exists opportunities_close_date_created_idx
  on public.opportunities (close_date, created_at desc, id desc);

create index if not exists opportunities_validation_status_idx
  on public.opportunities (validation_status, quality_score);

create index if not exists opportunities_content_fingerprint_idx
  on public.opportunities (content_fingerprint)
  where content_fingerprint is not null;

create index if not exists opportunities_title_trgm_idx
  on public.opportunities using gin (title gin_trgm_ops);

create index if not exists opportunities_organization_trgm_idx
  on public.opportunities using gin (organization gin_trgm_ops);
