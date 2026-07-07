-- User reports on AI-generated content (chat, CV tailoring, co-pilot).
-- Required by Google Play's AI-Generated Content policy: users must be able
-- to flag offensive/inaccurate AI output in-app.
--
-- Writes go through the Clerk-verified `report-ai-content` edge function
-- using the service role; RLS is enabled with NO anon/authenticated policies
-- so the table is invisible to client keys.

create table if not exists public.ai_content_reports (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  source text not null check (source in ('chat', 'cv', 'copilot')),
  reason text not null check (reason in ('inaccurate', 'offensive', 'other')),
  content text not null,
  context jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'reviewed', 'actioned')),
  created_at timestamptz not null default now()
);

alter table public.ai_content_reports enable row level security;

create index if not exists ai_content_reports_status_idx
  on public.ai_content_reports (status, created_at desc);
