-- Durable post-commit verification handoff for approved user submissions.
create table if not exists public.opportunity_verification_operations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null,
  opportunity_id uuid not null,
  review_version integer not null,
  status text not null default 'queued',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error text,
  completed_at timestamptz,
  exhausted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opportunity_verification_operations_status_check
    check (status in ('queued', 'running', 'retry', 'completed', 'cancelled', 'exhausted')),
  constraint opportunity_verification_operations_review_unique
    unique (submission_id, review_version)
);

alter table public.opportunity_verification_operations
  add column if not exists lease_token uuid;

alter table public.opportunity_verification_operations
  add column if not exists lease_expires_at timestamptz;

create index if not exists idx_opportunity_verification_operations_due
  on public.opportunity_verification_operations (status, next_attempt_at);
create index if not exists idx_opportunity_verification_operations_opportunity
  on public.opportunity_verification_operations (opportunity_id);

alter table public.opportunity_verification_operations enable row level security;
