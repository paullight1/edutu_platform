-- AI usage/cost tracking: one row per provider call (append-only telemetry).
create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp default now() not null,
  provider text not null,
  model text not null,
  route text not null,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  estimated_cost_usd numeric,
  latency_ms integer,
  success boolean not null default true,
  error text
);

create index if not exists idx_ai_usage_events_created_at
  on public.ai_usage_events (created_at);

create index if not exists idx_ai_usage_events_route_created_at
  on public.ai_usage_events (route, created_at);

-- Backend service role only; no client access.
alter table public.ai_usage_events enable row level security;
