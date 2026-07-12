-- Durable facts the AI coach learns about a user (chat extraction, behavior,
-- onboarding). Read/written exclusively by the backend with the service role;
-- RLS is enabled with no anon/authenticated policies on purpose.
-- (Applied live via Supabase MCP on 2026-07-12 as create_user_ai_memories.)

create table if not exists public.user_ai_memories (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  kind text not null check (kind in ('interest','preference','dislike','fact','context')),
  content text not null,
  source text not null default 'chat',
  confidence real not null default 0.7,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at timestamptz
);

create index if not exists idx_user_ai_memories_user on public.user_ai_memories (user_id, last_used_at desc);

alter table public.user_ai_memories enable row level security;
