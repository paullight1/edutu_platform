-- Server-enforced premium voice accounting.
--
-- The Nest monetization service reserves voice_minutes atomically before the
-- edge function calls OpenAI. The edge function writes ai_voice_usage only
-- after a provider call succeeds. Neither table is a client-facing API.

begin;

create table if not exists public.user_ai_usage_daily (
  user_id text not null,
  day date not null default current_date,
  chat_messages integer not null default 0,
  action_credits integer not null default 0,
  voice_minutes integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day),
  check (chat_messages >= 0),
  check (action_credits >= 0),
  check (voice_minutes >= 0)
);

alter table public.user_ai_usage_daily
  add column if not exists voice_minutes integer not null default 0;

create table if not exists public.ai_voice_usage (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  kind text not null check (kind in ('stt', 'tts', 'realtime')),
  seconds numeric(10, 2) not null check (seconds > 0 and seconds <= 120),
  chars integer check (chars is null or (chars > 0 and chars <= 1200)),
  voice text,
  model text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_voice_usage_user_created_idx
  on public.ai_voice_usage (user_id, created_at desc);

-- Service-role only: callers receive quota responses through Nest, and the
-- edge function uses service_role for append-only telemetry after validation.
alter table public.user_ai_usage_daily enable row level security;
alter table public.ai_voice_usage enable row level security;
revoke all on table public.user_ai_usage_daily from anon, authenticated;
revoke all on table public.ai_voice_usage from anon, authenticated;
grant select, insert, update on table public.user_ai_usage_daily to service_role;
grant select, insert on table public.ai_voice_usage to service_role;

commit;
