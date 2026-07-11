-- pay.edutu.org — database objects (run once in the Supabase SQL editor).
-- Idempotent: safe to re-run. Everything here is written ONLY by the service
-- role from the webhook/admin; the mobile app reads billing_entitlements.

-- ── Entitlements the app reads (useProStatus queries this exact shape) ────────
create table if not exists public.billing_entitlements (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null,                 -- raw Clerk user id
  feature_key  text not null default 'pro',   -- 'pro'
  status       text not null default 'active', -- 'active' | 'canceled' | 'expired'
  source       text,                          -- 'paystack' | 'admin_grant'
  reference    text,                          -- provider reference / grant note
  expires_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- One row per (user, feature) so grants upsert instead of duplicating.
create unique index if not exists billing_entitlements_user_feature_key
  on public.billing_entitlements (user_id, feature_key);

alter table public.billing_entitlements enable row level security;

-- Let a signed-in user read ONLY their own entitlement (service role bypasses
-- RLS for writes). user_id is the raw Clerk id, which is the `sub` claim of
-- the Clerk third-party-auth JWT Supabase verifies.
-- NOTE: the earlier permissive `using (true)` policy let ANY caller enumerate
-- every user's entitlement — drop it if this schema was applied before.
drop policy if exists "read own entitlements" on public.billing_entitlements;
create policy "read own entitlements" on public.billing_entitlements
  for select to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));

-- ── Payment ledger ("see users / see revenue") ───────────────────────────────
create table if not exists public.payments (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null,
  email        text,
  plan         text,                          -- 'monthly' | 'yearly'
  amount       numeric,                       -- major units (e.g. 4000.00)
  currency     text,
  provider     text not null default 'paystack',
  reference    text not null,
  status       text not null default 'success',
  raw          jsonb,
  created_at   timestamptz not null default now()
);

create unique index if not exists payments_reference_key
  on public.payments (provider, reference);

-- Ledger is service-role only: RLS on with no policies denies anon/authed reads.
alter table public.payments enable row level security;

-- ── Subscriptions (only used when Paystack Plans are configured) ──────────────
create table if not exists public.billing_subscriptions (
  id                uuid primary key default gen_random_uuid(),
  user_id           text not null,
  email             text,
  plan              text,
  subscription_code text not null,
  email_token       text,                     -- needed to disable via Paystack
  status            text not null default 'active',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists billing_subscriptions_code_key
  on public.billing_subscriptions (subscription_code);

-- Contains Paystack email_tokens (enough to disable a subscription) — must
-- never be readable by clients. Service-role only.
alter table public.billing_subscriptions enable row level security;

-- Renewal-charge webhooks resolve uid by email; keep that lookup indexed.
create index if not exists billing_subscriptions_email_idx
  on public.billing_subscriptions (email);

-- ── Optional: mirror Pro onto profiles (best-effort; entitlements are the
-- authoritative source the app reads). These columns already exist in Edutu.
-- alter table public.profiles add column if not exists is_pro boolean default false;
-- alter table public.profiles add column if not exists pro_since timestamptz;
-- alter table public.profiles add column if not exists pro_expires_at timestamptz;
-- alter table public.profiles add column if not exists subscription_id text;
