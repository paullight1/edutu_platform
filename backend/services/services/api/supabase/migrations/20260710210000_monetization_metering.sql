-- Monetization metering (2026-07-10)
-- 1) Attribute AI usage to users so per-user cost/billing is computable.
-- 2) Daily per-user AI counters backing free-tier limits and Pro fair-use caps.

alter table if exists ai_usage_events
  add column if not exists user_id text;
create index if not exists ai_usage_events_user_id_idx
  on ai_usage_events (user_id, created_at desc);

alter table if exists ai_usage_logs
  add column if not exists user_id text;
create index if not exists ai_usage_logs_user_id_idx
  on ai_usage_logs (user_id, created_at desc);

create table if not exists user_ai_usage_daily (
  user_id text not null,
  day date not null default current_date,
  chat_messages integer not null default 0,
  action_credits integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- Service-role only: no policies on purpose (clients read limits via the API).
alter table user_ai_usage_daily enable row level security;

-- Allow 'ai_action' / 'ai_action_refund' ledger rows to be idempotent too.
create unique index if not exists credit_transactions_ai_action_idem
  on credit_transactions (related_type, related_id)
  where related_id is not null
    and related_type in ('ai_action', 'ai_action_refund');

-- Paystack credit-pack purchases (webhook retries must not double-grant).
create unique index if not exists credit_transactions_credit_pack_idem
  on credit_transactions (related_type, related_id)
  where related_id is not null and related_type = 'credit_pack';
