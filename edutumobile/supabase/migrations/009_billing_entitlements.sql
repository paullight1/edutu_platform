-- Shared billing and entitlement state for web, mobile, and backend gateways.
-- This is intentionally idempotent so it can be applied from either project.

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  provider text not null check (provider in ('paystack', 'stripe', 'flutterwave', 'revenuecat', 'manual')),
  provider_customer_id text,
  provider_subscription_id text not null,
  plan text not null check (plan in ('monthly', 'yearly', 'lifetime')),
  status text not null default 'active' check (status in ('active', 'trialing', 'past_due', 'cancelled', 'expired', 'paused')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);

create index if not exists billing_subscriptions_user_idx
  on public.billing_subscriptions (user_id, status);

create table if not exists public.billing_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  feature_key text not null,
  status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  source text not null default 'manual',
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, feature_key)
);

create index if not exists billing_entitlements_user_idx
  on public.billing_entitlements (user_id, status);

create table if not exists public.billing_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  provider text not null check (provider in ('paystack', 'stripe', 'flutterwave', 'revenuecat', 'manual')),
  provider_reference text not null,
  type text not null check (type in ('subscription', 'credit_purchase', 'refund', 'manual_adjustment')),
  amount integer not null default 0,
  currency text not null default 'NGN',
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'refunded')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_reference)
);

create index if not exists billing_transactions_user_idx
  on public.billing_transactions (user_id, created_at desc);

alter table public.profiles
  add column if not exists pro_since timestamptz,
  add column if not exists pro_expires_at timestamptz,
  add column if not exists subscription_id text;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_timestamp_billing_subscriptions on public.billing_subscriptions;
create trigger set_timestamp_billing_subscriptions
before update on public.billing_subscriptions
for each row execute function public.set_updated_at();

drop trigger if exists set_timestamp_billing_entitlements on public.billing_entitlements;
create trigger set_timestamp_billing_entitlements
before update on public.billing_entitlements
for each row execute function public.set_updated_at();

drop trigger if exists set_timestamp_billing_transactions on public.billing_transactions;
create trigger set_timestamp_billing_transactions
before update on public.billing_transactions
for each row execute function public.set_updated_at();

alter table public.billing_subscriptions enable row level security;
alter table public.billing_entitlements enable row level security;
alter table public.billing_transactions enable row level security;

drop policy if exists "Users view own billing subscriptions" on public.billing_subscriptions;
create policy "Users view own billing subscriptions"
  on public.billing_subscriptions
  for select
  using (auth.uid()::text = user_id);

drop policy if exists "Users view own billing entitlements" on public.billing_entitlements;
create policy "Users view own billing entitlements"
  on public.billing_entitlements
  for select
  using (auth.uid()::text = user_id);

drop policy if exists "Users view own billing transactions" on public.billing_transactions;
create policy "Users view own billing transactions"
  on public.billing_transactions
  for select
  using (auth.uid()::text = user_id);

drop policy if exists "Service role manages billing subscriptions" on public.billing_subscriptions;
create policy "Service role manages billing subscriptions"
  on public.billing_subscriptions
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Service role manages billing entitlements" on public.billing_entitlements;
create policy "Service role manages billing entitlements"
  on public.billing_entitlements
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Service role manages billing transactions" on public.billing_transactions;
create policy "Service role manages billing transactions"
  on public.billing_transactions
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
