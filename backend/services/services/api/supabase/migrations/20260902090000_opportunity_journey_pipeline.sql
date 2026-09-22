-- Intentional opportunity pipeline foundation.
--
-- These tables are owned by the backend service. Browser and mobile clients
-- must use the NestJS API rather than writing this lifecycle state directly.

create table if not exists public.opportunity_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  status text not null default 'active'
    constraint opportunity_intents_status_check
    check (status in ('active', 'archived')),
  goal_key text not null
    constraint opportunity_intents_goal_key_check
    check (goal_key in (
      'study_funding',
      'work_experience',
      'employment',
      'business_funding',
      'leadership_growth',
      'skill_building',
      'open_exploration'
    )),
  opportunity_types text[] not null default '{}'::text[],
  locations text[] not null default '{}'::text[],
  remote_preference text not null default 'neutral'
    constraint opportunity_intents_remote_preference_check
    check (remote_preference in ('required', 'preferred', 'neutral', 'excluded')),
  action_horizon_days integer not null default 90
    constraint opportunity_intents_action_horizon_days_check
    check (action_horizon_days in (30, 90, 180, 365)),
  weekly_hours integer not null default 4
    constraint opportunity_intents_weekly_hours_check
    check (weekly_hours between 1 and 40),
  readiness_mode text not null default 'apply_now'
    constraint opportunity_intents_readiness_mode_check
    check (readiness_mode in ('apply_now', 'prepare')),
  source text not null default 'explicit'
    constraint opportunity_intents_source_check
    check (source in ('inferred', 'explicit')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create unique index if not exists opportunity_intents_one_active_per_user
  on public.opportunity_intents (user_id)
  where status = 'active';

create table if not exists public.user_opportunity_journeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  opportunity_id uuid not null
    references public.opportunities(id) on delete restrict,
  intent_id uuid
    references public.opportunity_intents(id) on delete set null,
  state text not null
    constraint user_opportunity_journeys_state_check
    check (state in (
      'shortlisted',
      'pursuing',
      'preparing',
      'ready_to_apply',
      'application_opened',
      'applied',
      'interview',
      'offer',
      'rejected',
      'withdrawn',
      'no_response',
      'expired',
      'archived'
    )),
  priority text not null default 'none'
    constraint user_opportunity_journeys_priority_check
    check (priority in ('primary', 'secondary', 'none')),
  eligibility_status text not null default 'unclear'
    constraint user_opportunity_journeys_eligibility_status_check
    check (eligibility_status in ('eligible', 'likely', 'unclear', 'ineligible')),
  eligibility_confidence numeric(4,3) not null default 0
    constraint user_opportunity_journeys_eligibility_confidence_check
    check (eligibility_confidence between 0 and 1),
  eligibility_reasons jsonb not null default '[]'::jsonb,
  eligibility_blockers jsonb not null default '[]'::jsonb,
  match_score_snapshot integer,
  match_reasons_snapshot jsonb not null default '[]'::jsonb,
  match_risks_snapshot jsonb not null default '[]'::jsonb,
  estimated_effort_hours numeric(6,2),
  next_action_at timestamptz,
  committed_at timestamptz,
  apply_link_opened_at timestamptz,
  applied_at timestamptz,
  closed_at timestamptz,
  outcome text
    constraint user_opportunity_journeys_outcome_check
    check (
      outcome is null
      or outcome in (
        'offer',
        'rejected',
        'withdrawn',
        'no_response',
        'expired',
        'archived'
      )
    ),
  version integer not null default 1
    constraint user_opportunity_journeys_version_check
    check (version > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, opportunity_id)
);

create unique index if not exists opportunity_journeys_one_active_primary
  on public.user_opportunity_journeys (user_id)
  where priority = 'primary'
    and state in (
      'pursuing',
      'preparing',
      'ready_to_apply',
      'application_opened'
    );

create index if not exists opportunity_journeys_user_stage_idx
  on public.user_opportunity_journeys (user_id, state, updated_at desc);

create index if not exists opportunity_journeys_opportunity_idx
  on public.user_opportunity_journeys (opportunity_id);

create table if not exists public.opportunity_journey_tasks (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null
    references public.user_opportunity_journeys(id) on delete cascade,
  task_type text not null,
  title text not null,
  description text,
  position integer not null
    constraint opportunity_journey_tasks_position_check
    check (position >= 0),
  status text not null default 'pending'
    constraint opportunity_journey_tasks_status_check
    check (status in ('pending', 'in_progress', 'completed', 'skipped')),
  due_at timestamptz,
  required boolean not null default true,
  source text not null default 'template'
    constraint opportunity_journey_tasks_source_check
    check (source in ('template', 'user', 'ai')),
  metadata jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (journey_id, position)
);

create index if not exists journey_tasks_next_action_idx
  on public.opportunity_journey_tasks (journey_id, status, due_at, position);

create table if not exists public.opportunity_journey_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  journey_id uuid
    references public.user_opportunity_journeys(id) on delete cascade,
  intent_id uuid
    references public.opportunity_intents(id) on delete set null,
  opportunity_id uuid
    references public.opportunities(id) on delete set null,
  event_type text not null,
  source text not null
    constraint opportunity_journey_events_source_check
    check (source in ('web', 'mobile', 'backend', 'migration')),
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists journey_events_user_created_idx
  on public.opportunity_journey_events (user_id, created_at desc);

create index if not exists journey_events_type_created_idx
  on public.opportunity_journey_events (event_type, created_at desc);

comment on table public.opportunity_intents is
  'Backend-owned current opportunity intent. Direct client writes are forbidden.';
comment on table public.user_opportunity_journeys is
  'Backend-owned canonical user-to-opportunity lifecycle record.';
comment on table public.opportunity_journey_tasks is
  'Backend-owned preparation tasks for one opportunity journey.';
comment on table public.opportunity_journey_events is
  'Backend-owned immutable opportunity journey event ledger.';

alter table public.opportunity_intents enable row level security;
alter table public.user_opportunity_journeys enable row level security;
alter table public.opportunity_journey_tasks enable row level security;
alter table public.opportunity_journey_events enable row level security;

revoke all privileges on table public.opportunity_intents from anon, authenticated;
revoke all privileges on table public.user_opportunity_journeys from anon, authenticated;
revoke all privileges on table public.opportunity_journey_tasks from anon, authenticated;
revoke all privileges on table public.opportunity_journey_events from anon, authenticated;
