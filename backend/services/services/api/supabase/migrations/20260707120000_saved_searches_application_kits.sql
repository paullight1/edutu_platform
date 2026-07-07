-- Saved-search alerts + AI application co-pilot storage.
--
-- saved_searches: a user's persisted Discover filter (query/category/region).
--   New or newly-approved opportunities are matched against notify-enabled
--   rows server-side; hits produce in-app notifications + push.
-- saved_search_matches: one row per (search, opportunity) hit. Doubles as the
--   alert dedupe ledger (insert ... on conflict do nothing tells the service
--   which hits are new), so re-approving an opportunity never double-notifies.
-- application_kits: per (user, opportunity) co-pilot workspace — AI-generated
--   kit (fit note, checklist, essay prompts, tips) plus the user's essay
--   drafts/feedback and checklist state.
--
-- All three tables are server-only (accessed via the API with the service
-- role); RLS is enabled with no policies so anon/authenticated clients cannot
-- touch them directly, matching admin_settings.

create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  query text,
  category text,
  funding_type text,
  target_region text,
  remote_only boolean,
  notify_enabled boolean not null default true,
  match_count integer not null default 0,
  last_matched_at timestamptz,
  last_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_searches_user_idx
  on public.saved_searches (user_id, created_at desc);

create index if not exists saved_searches_notify_idx
  on public.saved_searches (notify_enabled);

create table if not exists public.saved_search_matches (
  saved_search_id uuid not null,
  opportunity_id uuid not null,
  user_id uuid not null,
  notified_at timestamptz not null default now(),
  primary key (saved_search_id, opportunity_id)
);

create index if not exists saved_search_matches_user_idx
  on public.saved_search_matches (user_id, notified_at desc);

create table if not exists public.application_kits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  opportunity_id uuid not null,
  kit jsonb not null default '{}'::jsonb,
  essays jsonb not null default '[]'::jsonb,
  checklist_state jsonb not null default '{}'::jsonb,
  generated_by text default 'ai',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists application_kits_user_opportunity_idx
  on public.application_kits (user_id, opportunity_id);

create index if not exists application_kits_user_updated_idx
  on public.application_kits (user_id, updated_at desc);

-- Server-only: RLS on, no policies (service role bypasses RLS).
alter table public.saved_searches enable row level security;
alter table public.saved_search_matches enable row level security;
alter table public.application_kits enable row level security;
