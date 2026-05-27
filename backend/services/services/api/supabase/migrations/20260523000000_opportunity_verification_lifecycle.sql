-- Large-catalog opportunity verification and reconfirmation lifecycle.

alter table public.opportunities
  add column if not exists first_seen_at timestamptz default now(),
  add column if not exists last_seen_at timestamptz default now(),
  add column if not exists last_verified_at timestamptz,
  add column if not exists verification_status text not null default 'unverified',
  add column if not exists verification_attempts integer not null default 0,
  add column if not exists verification_error text,
  add column if not exists verification_next_check_at timestamptz,
  add column if not exists last_http_status integer,
  add column if not exists broken_link_count integer not null default 0;

update public.opportunities
set
  first_seen_at = coalesce(first_seen_at, created_at, now()),
  last_seen_at = coalesce(last_seen_at, updated_at, created_at, now()),
  verification_next_check_at = coalesce(verification_next_check_at, now())
where first_seen_at is null
   or last_seen_at is null
   or verification_next_check_at is null;

update public.opportunities
set
  verification_status = 'expired',
  status = 'expired',
  verification_next_check_at = null
where status = 'active'
  and coalesce(close_date::timestamptz, deadline) is not null
  and coalesce(close_date::timestamptz, deadline) < now();

create index if not exists opportunities_verification_due_idx
  on public.opportunities (verification_status, verification_next_check_at, updated_at desc, id)
  where duplicate_of is null
    and status in ('active', 'pending', 'pending_review');

create index if not exists opportunities_last_verified_idx
  on public.opportunities (last_verified_at, updated_at desc, id)
  where duplicate_of is null;

create index if not exists opportunities_last_seen_idx
  on public.opportunities (last_seen_at desc, id);

create table if not exists public.opportunity_verification_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null default 'manual',
  status text not null default 'running',
  requested_limit integer not null default 100,
  checked_count integer not null default 0,
  verified_count integer not null default 0,
  stale_count integer not null default 0,
  expired_count integer not null default 0,
  broken_count integer not null default 0,
  error_count integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  started_at timestamptz default now(),
  completed_at timestamptz,
  created_by text
);

create index if not exists opportunity_verification_runs_started_idx
  on public.opportunity_verification_runs (started_at desc);

create index if not exists opportunity_verification_runs_status_idx
  on public.opportunity_verification_runs (status);

alter table public.opportunity_verification_runs enable row level security;
