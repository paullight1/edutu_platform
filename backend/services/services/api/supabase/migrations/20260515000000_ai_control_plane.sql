-- Central AI control plane for provider keys, feature routes, prompts, and usage.
-- Public schema tables use explicit grants plus RLS. Admin writes should go
-- through the NestJS API/service role, not directly from public clients.

create extension if not exists "pgcrypto";

create table if not exists public.ai_provider_keys (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  label text not null,
  encrypted_key text not null,
  key_preview text not null,
  is_active boolean not null default true,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_provider_keys_provider
  on public.ai_provider_keys (provider);

create index if not exists idx_ai_provider_keys_active
  on public.ai_provider_keys (is_active);

create table if not exists public.ai_routes (
  id uuid primary key default gen_random_uuid(),
  feature text not null unique,
  provider text not null default 'deepseek',
  model text not null default 'deepseek-chat',
  provider_key_id uuid references public.ai_provider_keys on delete set null,
  system_prompt text,
  temperature integer not null default 20,
  max_output_tokens integer,
  response_mime_type text,
  fallback_provider text,
  fallback_model text,
  is_enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_routes_feature
  on public.ai_routes (feature);

create index if not exists idx_ai_routes_provider
  on public.ai_routes (provider);

create table if not exists public.ai_prompts (
  id uuid primary key default gen_random_uuid(),
  feature text not null,
  name text not null,
  content text not null,
  version integer not null default 1,
  is_active boolean not null default false,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_prompts_feature
  on public.ai_prompts (feature);

create index if not exists idx_ai_prompts_active
  on public.ai_prompts (is_active);

create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  feature text not null,
  provider text not null,
  model text not null,
  status text not null default 'success',
  latency_ms integer,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  error_message text,
  request_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_usage_logs_feature
  on public.ai_usage_logs (feature);

create index if not exists idx_ai_usage_logs_created_at
  on public.ai_usage_logs (created_at);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_timestamp_ai_provider_keys on public.ai_provider_keys;
create trigger set_timestamp_ai_provider_keys
before update on public.ai_provider_keys
for each row
execute function public.set_updated_at();

drop trigger if exists set_timestamp_ai_routes on public.ai_routes;
create trigger set_timestamp_ai_routes
before update on public.ai_routes
for each row
execute function public.set_updated_at();

alter table public.ai_provider_keys enable row level security;
alter table public.ai_routes enable row level security;
alter table public.ai_prompts enable row level security;
alter table public.ai_usage_logs enable row level security;

grant select on public.ai_routes to authenticated;
grant select on public.ai_prompts to authenticated;
grant select on public.ai_usage_logs to authenticated;
grant select, insert, update, delete on public.ai_provider_keys to service_role;
grant select, insert, update, delete on public.ai_routes to service_role;
grant select, insert, update, delete on public.ai_prompts to service_role;
grant select, insert on public.ai_usage_logs to service_role;

create policy "Authenticated users can view enabled ai routes"
  on public.ai_routes
  for select
  to authenticated
  using (is_enabled = true);

create policy "Authenticated users can view active ai prompts"
  on public.ai_prompts
  for select
  to authenticated
  using (is_active = true);

create policy "Service role manages ai provider keys"
  on public.ai_provider_keys
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Service role manages ai routes"
  on public.ai_routes
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Service role manages ai prompts"
  on public.ai_prompts
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Service role writes ai usage logs"
  on public.ai_usage_logs
  for insert
  with check (auth.role() = 'service_role');

create policy "Service role reads ai usage logs"
  on public.ai_usage_logs
  for select
  using (auth.role() = 'service_role');

insert into public.ai_routes (feature, provider, model, temperature, response_mime_type, metadata)
values
  ('chat.coach', 'openrouter', 'openrouter/auto', 20, null, '{"description":"Main learner chatbot"}'::jsonb),
  ('chat.transcribe', 'deepseek', 'deepseek-chat', 20, null, '{"description":"AI text response and ranking"}'::jsonb),
  ('scraper.extract', 'deepseek', 'deepseek-chat', 5, 'application/json', '{"description":"Scholarship page extraction"}'::jsonb),
  ('opportunities.enhance', 'deepseek', 'deepseek-chat', 20, 'application/json', '{"description":"Opportunity enrichment"}'::jsonb),
  ('opportunities.extract', 'deepseek', 'deepseek-chat', 20, 'application/json', '{"description":"Search result extraction"}'::jsonb),
  ('opportunities.rerank', 'deepseek', 'deepseek-chat', 20, 'application/json', '{"description":"Personalized opportunity reranking"}'::jsonb),
  ('cv.draft', 'deepseek', 'deepseek-chat', 20, 'application/json', '{"description":"CV draft generation"}'::jsonb),
  ('cv.tailor', 'deepseek', 'deepseek-chat', 20, 'application/json', '{"description":"CV tailoring"}'::jsonb),
  ('roadmaps.questions', 'deepseek', 'deepseek-chat', 30, 'application/json', '{"description":"Roadmap intake questions"}'::jsonb),
  ('roadmaps.intent_tags', 'deepseek', 'deepseek-chat', 20, 'application/json', '{"description":"Roadmap tagging and summary"}'::jsonb),
  ('roadmaps.match', 'deepseek', 'deepseek-chat', 20, 'application/json', '{"description":"Roadmap intent matching"}'::jsonb),
  ('quiz.generate', 'deepseek', 'deepseek-chat', 20, 'application/json', '{"description":"Quiz generation"}'::jsonb)
on conflict (feature) do nothing;
