-- Canonical provider-neutral billing foundation. This migration is additive,
-- creates no checkout route, and does not enable Bachs collection.

begin;

create table if not exists public.billing_providers (
  provider text primary key,
  display_name text not null,
  created_at timestamptz not null default now()
);

insert into public.billing_providers (provider, display_name)
values
  ('bachs', 'Bachs'),
  ('revenuecat', 'RevenueCat'),
  ('paystack', 'Paystack'),
  ('manual', 'Manual')
on conflict (provider) do nothing;

create table if not exists public.billing_environments (
  environment text primary key,
  created_at timestamptz not null default now()
);

insert into public.billing_environments (environment)
values ('sandbox'), ('live')
on conflict (environment) do nothing;

create table if not exists public.billing_products (
  product_key text primary key,
  fulfillment_kind text not null,
  feature_key text,
  renewal_mode text not null,
  payment_method_policy jsonb not null default '{}'::jsonb,
  expected_amount_minor bigint,
  currency char(3) check (
    currency = upper(currency) and currency ~ '^[A-Z]{3}$'
  ),
  cadence text not null,
  entitlement_duration interval,
  credit_quantity integer not null default 0 check (credit_quantity >= 0),
  enabled boolean not null default false,
  catalog_version integer not null default 1 check (catalog_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (renewal_mode in ('recurring', 'one_time')),
  check (entitlement_duration is null or entitlement_duration > interval '0 seconds'),
  check (expected_amount_minor is null or expected_amount_minor >= 0)
);

-- Canonical catalog keys are present only as disabled placeholders. Verified
-- prices, pass durations, and provider IDs are deployment inputs and are not
-- guessed by this migration. Recurring Bachs products are explicitly USD-card
-- only; no provider mapping is seeded here.
insert into public.billing_products (
  product_key,
  fulfillment_kind,
  feature_key,
  renewal_mode,
  payment_method_policy,
  expected_amount_minor,
  currency,
  cadence,
  entitlement_duration,
  credit_quantity,
  enabled
)
values
  ('pro_weekly_pass', 'one_time_pass', 'pro', 'one_time', '{}'::jsonb, null, null, 'weekly', null, 0, false),
  ('pro_monthly_pass', 'one_time_pass', 'pro', 'one_time', '{}'::jsonb, null, null, 'monthly', null, 0, false),
  ('pro_yearly_pass', 'one_time_pass', 'pro', 'one_time', '{}'::jsonb, null, null, 'yearly', null, 0, false),
  ('pro_weekly_recurring', 'subscription', 'pro', 'recurring', '{"allowed_methods":["card"],"allowed_currencies":["USD"]}'::jsonb, null, 'USD', 'weekly', null, 0, false),
  ('pro_monthly_recurring', 'subscription', 'pro', 'recurring', '{"allowed_methods":["card"],"allowed_currencies":["USD"]}'::jsonb, null, 'USD', 'monthly', null, 0, false),
  ('pro_yearly_recurring', 'subscription', 'pro', 'recurring', '{"allowed_methods":["card"],"allowed_currencies":["USD"]}'::jsonb, null, 'USD', 'yearly', null, 0, false),
  ('season_pass', 'season_pass', 'pro', 'one_time', '{}'::jsonb, null, null, 'season', null, 0, false),
  ('credits_100', 'credit_pack', null, 'one_time', '{}'::jsonb, null, null, 'one_time', null, 100, false),
  ('credits_250', 'credit_pack', null, 'one_time', '{}'::jsonb, null, null, 'one_time', null, 250, false),
  ('credits_700', 'credit_pack', null, 'one_time', '{}'::jsonb, null, null, 'one_time', null, 700, false)
on conflict (product_key) do nothing;

create table if not exists public.billing_product_provider_mappings (
  product_key text not null references public.billing_products (product_key),
  provider text not null,
  environment text not null,
  provider_product_id text not null,
  provider_price_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (product_key, provider, environment),
  unique (provider, environment, provider_product_id),
  foreign key (provider) references public.billing_providers (provider),
  foreign key (environment) references public.billing_environments (environment)
);

create table if not exists public.billing_checkout_intents (
  id uuid primary key default gen_random_uuid(),
  public_token_hash text not null unique,
  user_id text not null,
  provider text not null,
  environment text not null,
  product_key text not null references public.billing_products (product_key),
  product_snapshot jsonb not null,
  expected_amount_minor bigint not null check (expected_amount_minor >= 0),
  currency char(3) not null check (
    currency = upper(currency) and currency ~ '^[A-Z]{3}$'
  ),
  provider_checkout_id text,
  provider_reference text,
  status text not null default 'creating',
  expires_at timestamptz not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  unique (provider, environment, provider_checkout_id),
  unique (provider, environment, provider_reference),
  foreign key (provider) references public.billing_providers (provider),
  foreign key (environment) references public.billing_environments (environment)
);

create table if not exists public.billing_provider_customers (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  environment text not null,
  user_id text not null,
  provider_customer_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, environment, user_id),
  unique (provider, environment, provider_customer_id),
  foreign key (provider) references public.billing_providers (provider),
  foreign key (environment) references public.billing_environments (environment)
);

create table if not exists public.billing_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  environment text not null,
  event_id text not null,
  event_type text not null,
  organization_id text,
  provider_account_id text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'received',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  payload_hash text not null,
  raw_payload jsonb,
  raw_payload_expires_at timestamptz not null default (now() + interval '90 days'),
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, environment, event_id),
  foreign key (provider) references public.billing_providers (provider),
  foreign key (environment) references public.billing_environments (environment)
);

create table if not exists public.billing_payment_ledger (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  environment text not null,
  provider_resource_id text not null,
  provider_event_id text,
  checkout_intent_id uuid references public.billing_checkout_intents (id),
  user_id text not null,
  entry_kind text not null,
  amount_minor bigint not null,
  currency char(3) not null check (
    currency = upper(currency) and currency ~ '^[A-Z]{3}$'
  ),
  customer_amount_minor bigint,
  customer_currency char(3) check (
    customer_currency = upper(customer_currency)
    and customer_currency ~ '^[A-Z]{3}$'
  ),
  settlement_amount_minor bigint,
  settlement_currency char(3) check (
    settlement_currency = upper(settlement_currency)
    and settlement_currency ~ '^[A-Z]{3}$'
  ),
  status text not null,
  occurred_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider, environment, provider_resource_id),
  foreign key (provider) references public.billing_providers (provider),
  foreign key (environment) references public.billing_environments (environment),
  check ((customer_amount_minor is null) = (customer_currency is null)),
  check ((settlement_amount_minor is null) = (settlement_currency is null))
);

create table if not exists public.billing_provider_subscriptions (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  environment text not null,
  provider_subscription_id text not null,
  provider_customer_id text,
  user_id text not null,
  product_key text references public.billing_products (product_key),
  status text not null,
  cadence text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  provider_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, environment, provider_subscription_id),
  foreign key (provider) references public.billing_providers (provider),
  foreign key (environment) references public.billing_environments (environment)
);

create table if not exists public.billing_entitlement_grants (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  environment text not null,
  source_kind text not null,
  source_resource_id text not null,
  user_id text not null,
  feature_key text not null,
  valid_from timestamptz not null,
  valid_until timestamptz,
  status text not null default 'active',
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, environment, source_kind, source_resource_id, feature_key),
  foreign key (provider) references public.billing_providers (provider),
  foreign key (environment) references public.billing_environments (environment),
  check (valid_until is null or valid_until > valid_from)
);

create table if not exists public.billing_review_cases (
  id uuid primary key default gen_random_uuid(),
  provider text,
  environment text,
  event_id uuid references public.billing_provider_events (id),
  user_id text,
  case_type text not null,
  status text not null default 'open',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text,
  resolution_reason text,
  foreign key (provider) references public.billing_providers (provider),
  foreign key (environment) references public.billing_environments (environment)
);

create table if not exists public.billing_admin_audit (
  id uuid primary key default gen_random_uuid(),
  operator_user_id text not null,
  action text not null,
  reason text not null,
  target_type text not null,
  target_id text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists billing_events_retry_idx
  on public.billing_provider_events (status, next_retry_at)
  where processed_at is null;
create index if not exists billing_checkout_intents_user_status_created_idx
  on public.billing_checkout_intents (user_id, status, created_at desc);
create index if not exists billing_subscriptions_user_status_idx
  on public.billing_provider_subscriptions (user_id, status);
create index if not exists billing_grants_user_feature_status_validity_idx
  on public.billing_entitlement_grants (user_id, feature_key, status, valid_until);
create index if not exists billing_review_cases_status_created_idx
  on public.billing_review_cases (status, created_at);

create or replace function public.billing_reject_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'billing ledger and audit rows are append-only';
end;
$$;

drop trigger if exists billing_payment_ledger_append_only on public.billing_payment_ledger;
create trigger billing_payment_ledger_append_only
  before update or delete on public.billing_payment_ledger
  for each row execute function public.billing_reject_mutation();

drop trigger if exists billing_admin_audit_append_only on public.billing_admin_audit;
create trigger billing_admin_audit_append_only
  before update or delete on public.billing_admin_audit
  for each row execute function public.billing_reject_mutation();

alter table public.billing_providers enable row level security;
alter table public.billing_environments enable row level security;
alter table public.billing_products enable row level security;
alter table public.billing_product_provider_mappings enable row level security;
alter table public.billing_checkout_intents enable row level security;
alter table public.billing_provider_customers enable row level security;
alter table public.billing_provider_events enable row level security;
alter table public.billing_payment_ledger enable row level security;
alter table public.billing_provider_subscriptions enable row level security;
alter table public.billing_entitlement_grants enable row level security;
alter table public.billing_review_cases enable row level security;
alter table public.billing_admin_audit enable row level security;

revoke all on table public.billing_providers from public;
revoke all on table public.billing_environments from public;
revoke all on table public.billing_products from public;
revoke all on table public.billing_product_provider_mappings from public;
revoke all on table public.billing_checkout_intents from public;
revoke all on table public.billing_provider_customers from public;
revoke all on table public.billing_provider_events from public;
revoke all on table public.billing_payment_ledger from public;
revoke all on table public.billing_provider_subscriptions from public;
revoke all on table public.billing_entitlement_grants from public;
revoke all on table public.billing_review_cases from public;
revoke all on table public.billing_admin_audit from public;

revoke all on table public.billing_providers from anon, authenticated;
revoke all on table public.billing_environments from anon, authenticated;
revoke all on table public.billing_products from anon, authenticated;
revoke all on table public.billing_product_provider_mappings from anon, authenticated;
revoke all on table public.billing_checkout_intents from anon, authenticated;
revoke all on table public.billing_provider_customers from anon, authenticated;
revoke all on table public.billing_provider_events from anon, authenticated;
revoke all on table public.billing_payment_ledger from anon, authenticated;
revoke all on table public.billing_provider_subscriptions from anon, authenticated;
revoke all on table public.billing_entitlement_grants from anon, authenticated;
revoke all on table public.billing_review_cases from anon, authenticated;
revoke all on table public.billing_admin_audit from anon, authenticated;

grant select, insert, update, delete on table public.billing_providers to service_role;
grant select, insert, update, delete on table public.billing_environments to service_role;
grant select, insert, update, delete on table public.billing_products to service_role;
grant select, insert, update, delete on table public.billing_product_provider_mappings to service_role;
grant select, insert, update, delete on table public.billing_checkout_intents to service_role;
grant select, insert, update, delete on table public.billing_provider_customers to service_role;
grant select, insert, update, delete on table public.billing_provider_events to service_role;
grant select, insert, update, delete on table public.billing_payment_ledger to service_role;
grant select, insert, update, delete on table public.billing_provider_subscriptions to service_role;
grant select, insert, update, delete on table public.billing_entitlement_grants to service_role;
grant select, insert, update, delete on table public.billing_review_cases to service_role;
grant select, insert, update, delete on table public.billing_admin_audit to service_role;

revoke all on function public.billing_reject_mutation() from public, anon, authenticated;
grant execute on function public.billing_reject_mutation() to service_role;

-- The security-definer function is the sole narrow bypass of base-table RLS.
-- It derives the subject from the verified request JWT and returns no raw grant
-- rows. The view itself is security-invoker so it never gains owner privileges.
create or replace function public.billing_current_account_summary()
returns table (
  user_id text,
  feature_key text,
  valid_until timestamptz,
  active boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    g.user_id,
    g.feature_key,
    case
      when bool_or(
        g.status = 'active'
        and g.revoked_at is null
        and g.valid_until is null
      ) then null
      else max(g.valid_until) filter (
        where g.status = 'active'
          and g.revoked_at is null
          and g.valid_until > now()
      )
    end as valid_until,
    bool_or(
      g.status = 'active'
      and g.revoked_at is null
      and (g.valid_until is null or g.valid_until > now())
    ) as active
  from public.billing_entitlement_grants g
  where g.user_id = (select auth.jwt() ->> 'sub')
  group by g.user_id, g.feature_key;
$$;

revoke all on function public.billing_current_account_summary()
  from public, anon, authenticated;
grant execute on function public.billing_current_account_summary()
  to authenticated, service_role;

create or replace view public.billing_account_summary
with (security_barrier = true, security_invoker = true)
as
select * from public.billing_current_account_summary();

revoke all on public.billing_account_summary from public, anon;
grant select on public.billing_account_summary to authenticated, service_role;

comment on column public.billing_provider_events.raw_payload_expires_at is
  'Restricted raw provider payloads expire after 90 days; normalized ledgers follow accounting retention.';
comment on column public.billing_payment_ledger.customer_amount_minor is
  'Customer-facing amount in customer_currency when reported by the provider.';
comment on column public.billing_payment_ledger.settlement_amount_minor is
  'Provider settlement amount in settlement_currency; never used as the catalog-price authority.';

commit;
