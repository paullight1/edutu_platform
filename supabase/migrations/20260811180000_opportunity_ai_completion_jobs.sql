create table if not exists public.opportunity_ai_completion_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'completed_with_errors', 'failed')),
  opportunity_ids uuid[] not null,
  total integer not null check (total > 0 and total <= 500),
  next_index integer not null default 0 check (next_index >= 0),
  completed integer not null default 0 check (completed >= 0),
  skipped integer not null default 0 check (skipped >= 0),
  failed integer not null default 0 check (failed >= 0),
  current_opportunity_id uuid references public.opportunities(id) on delete set null,
  current_opportunity_title text,
  errors jsonb not null default '[]'::jsonb check (jsonb_typeof(errors) = 'array'),
  created_by text,
  worker_id text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  heartbeat_at timestamptz,
  lease_expires_at timestamptz,
  updated_at timestamptz not null default now(),
  check (cardinality(opportunity_ids) = total),
  check (next_index <= total),
  check (completed + skipped + failed <= total)
);

create unique index if not exists opportunity_ai_completion_jobs_one_active_idx
  on public.opportunity_ai_completion_jobs ((true))
  where status in ('queued', 'running');

create index if not exists opportunity_ai_completion_jobs_created_at_idx
  on public.opportunity_ai_completion_jobs (created_at desc);

alter table public.opportunity_ai_completion_jobs enable row level security;

revoke all on table public.opportunity_ai_completion_jobs from anon, authenticated;
grant select, insert, update, delete on table public.opportunity_ai_completion_jobs to service_role;

comment on table public.opportunity_ai_completion_jobs is
  'Durable, resumable admin jobs for bulk AI completion of opportunities.';
