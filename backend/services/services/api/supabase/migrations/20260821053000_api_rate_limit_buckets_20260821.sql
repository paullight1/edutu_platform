-- Shared fixed-window request buckets for the public Edutu API.
--
-- The API performs an atomic INSERT ... ON CONFLICT reservation against this
-- table so the configured requests/minute limit remains authoritative across
-- every backend replica. Browser roles have no direct access.

create table if not exists public.api_rate_limit_buckets (
  consumer_id uuid not null references public.api_consumers(id) on delete cascade,
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  rate_limit integer not null check (rate_limit > 0),
  updated_at timestamptz not null default now(),
  primary key (consumer_id, window_start)
);

create index if not exists api_rate_limit_buckets_window_start_idx
  on public.api_rate_limit_buckets (window_start);

alter table public.api_rate_limit_buckets enable row level security;

revoke all on table public.api_rate_limit_buckets from anon, authenticated;

comment on table public.api_rate_limit_buckets is
  'Server-only per-consumer Edutu API fixed-window rate-limit reservations.';
