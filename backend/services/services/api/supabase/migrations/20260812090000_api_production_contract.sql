-- Production contract for Edutu API ownership, metering, and one-time credits.
-- Additive only: legacy columns and billing rows are preserved.

begin;

create table if not exists public.api_consumers (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid,
  name text not null,
  contact_email text,
  key_prefix text,
  api_key_hash text not null unique,
  status text not null default 'active',
  plan text not null default 'starter',
  environment text not null default 'live',
  allowed_scopes text[] not null default array['opportunities:read', 'recommendations:read', 'events:write'],
  monthly_quota integer default 1000,
  rate_limit_per_minute integer default 60,
  last_used_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.api_consumers
  add column if not exists owner_user_id uuid,
  add column if not exists key_prefix text,
  add column if not exists api_key_hash text,
  add column if not exists status text default 'active',
  add column if not exists environment text default 'live',
  add column if not exists rate_limit_per_minute integer default 60,
  add column if not exists last_used_at timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists expires_at timestamptz;

-- A legacy row without key material cannot be authenticated safely. Preserve
-- it for audit, revoke it, and give it a collision-free disabled placeholder.
update public.api_consumers
set status = 'revoked',
    revoked_at = coalesce(revoked_at, now()),
    api_key_hash = coalesce(api_key_hash, 'disabled:' || id::text)
where api_key_hash is null;

update public.api_consumers set status = 'revoked' where status is null;
alter table public.api_consumers
  alter column api_key_hash set not null,
  alter column status set default 'active',
  alter column status set not null,
  alter column environment set default 'live',
  alter column environment set not null;

create index if not exists idx_api_consumers_owner
  on public.api_consumers (owner_user_id);
create index if not exists idx_api_consumers_status
  on public.api_consumers (status);
create unique index if not exists idx_api_consumers_key_hash_unique
  on public.api_consumers (api_key_hash);
create unique index if not exists idx_api_consumers_key_prefix_unique
  on public.api_consumers (key_prefix) where key_prefix is not null;

create table if not exists public.api_usage_events (
  id uuid primary key default gen_random_uuid(),
  consumer_id uuid not null references public.api_consumers(id) on delete cascade,
  request_id text,
  method text not null,
  endpoint text not null,
  status_code integer default 200,
  latency_ms integer,
  created_at timestamptz not null default now()
);

alter table public.api_usage_events
  add column if not exists request_id text,
  add column if not exists latency_ms integer;

create index if not exists idx_api_usage_consumer_created
  on public.api_usage_events (consumer_id, created_at desc);

create table if not exists public.api_usage_buckets (
  id uuid primary key default gen_random_uuid(),
  consumer_id uuid not null references public.api_consumers(id) on delete cascade,
  period_start date not null,
  request_count integer not null default 0,
  monthly_quota integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.api_usage_buckets
  add column if not exists monthly_quota integer,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'api_usage_buckets_consumer_period_unique'
      and conrelid = 'public.api_usage_buckets'::regclass
  ) then
    alter table public.api_usage_buckets
      add constraint api_usage_buckets_consumer_period_unique
      unique (consumer_id, period_start);
  end if;
end;
$$;

create table if not exists public.api_partner_events (
  id uuid primary key default gen_random_uuid(),
  consumer_id uuid not null references public.api_consumers(id) on delete cascade,
  request_id text,
  event_type text not null,
  opportunity_id uuid,
  external_user_id text,
  session_id text,
  source text not null default 'partner',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.api_partner_events
  add column if not exists request_id text,
  add column if not exists external_user_id text,
  add column if not exists session_id text,
  add column if not exists source text not null default 'partner',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_api_partner_events_consumer_created
  on public.api_partner_events (consumer_id, created_at desc);

-- Credit balances were historically written through both columns. Neither
-- column nor any one ledger is known to be a complete opening-balance source,
-- so divergent values must never be selected heuristically. Persist the
-- observed pair and all available evidence before the migration can abort.
create table if not exists public.api_credit_balance_reconciliation_state (
  migration_key text primary key,
  credits_column_preexisting boolean not null,
  legacy_column_preexisting boolean not null,
  initial_reconciliation_completed boolean not null default false,
  recorded_at timestamptz not null default now()
);
alter table public.api_credit_balance_reconciliation_state
  add column if not exists initial_reconciliation_completed boolean not null default false;

create table if not exists public.api_credit_balance_reconciliation_audit (
  id uuid primary key default gen_random_uuid(),
  migration_key text not null,
  user_id text not null,
  snapshot_fingerprint text not null,
  observed_credits integer,
  observed_credits_balance integer,
  credit_transactions_net bigint,
  credit_transactions_count bigint not null default 0,
  payment_ledger_credit_grants bigint,
  payment_ledger_credit_grant_count bigint not null default 0,
  legacy_billing_credit_grants bigint,
  legacy_billing_credit_grant_count bigint not null default 0,
  reconciliation_status text not null default 'requires_resolution',
  resolved_balance integer,
  resolved_at timestamptz,
  observed_at timestamptz not null default now(),
  unique (migration_key, user_id, snapshot_fingerprint)
);
alter table public.api_credit_balance_reconciliation_audit
  add column if not exists resolved_balance integer,
  add column if not exists resolved_at timestamptz;

create table if not exists public.api_credit_balance_reconciliation_resolutions (
  user_id text primary key,
  expected_credits integer,
  expected_credits_balance integer,
  resolved_balance integer not null check (resolved_balance >= 0),
  approved_by text not null check (length(trim(approved_by)) > 0),
  rationale text not null check (length(trim(rationale)) > 0),
  approved_at timestamptz not null default now()
);

alter table public.api_credit_balance_reconciliation_state enable row level security;
alter table public.api_credit_balance_reconciliation_audit enable row level security;
alter table public.api_credit_balance_reconciliation_resolutions enable row level security;
revoke all on table public.api_credit_balance_reconciliation_state from public, anon, authenticated;
revoke all on table public.api_credit_balance_reconciliation_audit from public, anon, authenticated;
revoke all on table public.api_credit_balance_reconciliation_resolutions from public, anon, authenticated;
revoke all on table public.api_credit_balance_reconciliation_state from service_role;
revoke all on table public.api_credit_balance_reconciliation_audit from service_role;
revoke all on table public.api_credit_balance_reconciliation_resolutions from service_role;
grant select on table public.api_credit_balance_reconciliation_audit to service_role;

do $$
declare
  had_credits boolean;
  has_legacy_balance boolean;
begin
  if to_regclass('public.profiles') is null then
    raise exception 'public.profiles is required before API production migration';
  end if;

  select exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = 'public.profiles'::regclass
      and attname = 'credits' and not attisdropped
  ) into had_credits;
  select exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = 'public.profiles'::regclass
      and attname = 'credits_balance' and not attisdropped
  ) into has_legacy_balance;

  insert into public.api_credit_balance_reconciliation_state (
    migration_key, credits_column_preexisting, legacy_column_preexisting
  ) values (
    '20260812090000_api_production_contract', had_credits, has_legacy_balance
  ) on conflict (migration_key) do nothing;

  if not had_credits then
    alter table public.profiles add column if not exists credits integer;
  end if;
end;
$$;

do $$
declare
  profile_row record;
  credit_net bigint;
  credit_count bigint;
  payment_grants bigint;
  payment_count bigint;
  legacy_grants bigint;
  legacy_count bigint;
  has_legacy_balance boolean;
begin
  select legacy_column_preexisting
  into has_legacy_balance
  from public.api_credit_balance_reconciliation_state
  where migration_key = '20260812090000_api_production_contract';

  if not has_legacy_balance then
    return;
  end if;

  for profile_row in execute
    'select user_id::text as user_id, credits, credits_balance
       from public.profiles
      where credits is distinct from credits_balance'
  loop
    credit_net := null;
    credit_count := 0;
    payment_grants := null;
    payment_count := 0;
    legacy_grants := null;
    legacy_count := 0;

    if to_regclass('public.credit_transactions') is not null then
      select coalesce(sum(amount), 0), count(*)
      into credit_net, credit_count
      from public.credit_transactions
      where user_id::text = profile_row.user_id;
    end if;

    if to_regclass('public.billing_payment_ledger') is not null then
      select
        coalesce(sum(
          case
            when metadata->>'credit_quantity' ~ '^[0-9]+$'
              then (metadata->>'credit_quantity')::bigint
            else 0
          end
        ), 0),
        count(*) filter (where metadata->>'credit_quantity' ~ '^[0-9]+$')
      into payment_grants, payment_count
      from public.billing_payment_ledger
      where user_id::text = profile_row.user_id
        and status = 'succeeded';
    end if;

    if to_regclass('public.billing_transactions') is not null then
      select coalesce(sum(amount), 0), count(*)
      into legacy_grants, legacy_count
      from public.billing_transactions
      where user_id::text = profile_row.user_id
        and status = 'completed'
        and type in ('credit_purchase', 'credit_topup');
    end if;

    insert into public.api_credit_balance_reconciliation_audit (
      migration_key,
      user_id,
      snapshot_fingerprint,
      observed_credits,
      observed_credits_balance,
      credit_transactions_net,
      credit_transactions_count,
      payment_ledger_credit_grants,
      payment_ledger_credit_grant_count,
      legacy_billing_credit_grants,
      legacy_billing_credit_grant_count
    ) values (
      '20260812090000_api_production_contract',
      profile_row.user_id,
      md5(coalesce(profile_row.credits::text, '<null>') || '|' ||
          coalesce(profile_row.credits_balance::text, '<null>')),
      profile_row.credits,
      profile_row.credits_balance,
      credit_net,
      credit_count,
      payment_grants,
      payment_count,
      legacy_grants,
      legacy_count
    ) on conflict (migration_key, user_id, snapshot_fingerprint) do nothing;
  end loop;
end;
$$;

-- This commit is intentional: reconciliation evidence and the original-column
-- shape remain available even when the following fail-closed preflight aborts.
commit;

do $$
declare
  mismatch_count bigint;
  mismatch_sample text;
  had_credits boolean;
  has_legacy_balance boolean;
  reconciliation_completed boolean;
begin
  select
    credits_column_preexisting,
    legacy_column_preexisting,
    initial_reconciliation_completed
  into had_credits, has_legacy_balance, reconciliation_completed
  from public.api_credit_balance_reconciliation_state
  where migration_key = '20260812090000_api_production_contract';

  if (not had_credits and not reconciliation_completed)
     or not has_legacy_balance then
    return;
  end if;

  execute $query$
    select count(*)
    from public.profiles profile
    where profile.credits is distinct from profile.credits_balance
      and not exists (
        select 1
        from public.api_credit_balance_reconciliation_resolutions resolution
        where resolution.user_id = profile.user_id::text
          and resolution.expected_credits is not distinct from profile.credits
          and resolution.expected_credits_balance is not distinct from profile.credits_balance
      )
  $query$ into mismatch_count;

  if mismatch_count > 0 then
    execute $query$
      select string_agg(user_id, ', ' order by user_id)
      from (
        select profile.user_id::text as user_id
        from public.profiles profile
        where profile.credits is distinct from profile.credits_balance
          and not exists (
            select 1
            from public.api_credit_balance_reconciliation_resolutions resolution
            where resolution.user_id = profile.user_id::text
              and resolution.expected_credits is not distinct from profile.credits
              and resolution.expected_credits_balance is not distinct from profile.credits_balance
          )
        order by profile.user_id::text
        limit 10
      ) sample
    $query$ into mismatch_sample;

    raise exception 'Found % unresolved credit balance mismatch(es) (sample user_ids: %). Inspect public.api_credit_balance_reconciliation_audit and add exact, approved rows to public.api_credit_balance_reconciliation_resolutions before retrying.',
      mismatch_count, coalesce(mismatch_sample, '<none>');
  end if;
end;
$$;

begin;

-- Prevent a balance writer from crossing the final reconciliation check and
-- trigger cutover. The lock is held through the final transaction commit.
lock table public.profiles in share row exclusive mode;

do $$
declare
  had_credits boolean;
  has_legacy_balance boolean;
  reconciliation_completed boolean;
  remaining_mismatches bigint;
begin
  select
    credits_column_preexisting,
    legacy_column_preexisting,
    initial_reconciliation_completed
  into had_credits, has_legacy_balance, reconciliation_completed
  from public.api_credit_balance_reconciliation_state
  where migration_key = '20260812090000_api_production_contract';

  perform set_config('app.credit_op', 'on', true);

  if has_legacy_balance then
    if had_credits or reconciliation_completed then
      execute $update$
        update public.profiles profile
        set credits = resolution.resolved_balance,
            credits_balance = resolution.resolved_balance
        from public.api_credit_balance_reconciliation_resolutions resolution
        where resolution.user_id = profile.user_id::text
          and resolution.expected_credits is not distinct from profile.credits
          and resolution.expected_credits_balance is not distinct from profile.credits_balance
          and profile.credits is distinct from profile.credits_balance
      $update$;
      update public.api_credit_balance_reconciliation_audit audit
      set reconciliation_status = 'resolved',
          resolved_balance = resolution.resolved_balance,
          resolved_at = now()
      from public.api_credit_balance_reconciliation_resolutions resolution
      where resolution.user_id = audit.user_id
        and resolution.expected_credits is not distinct from audit.observed_credits
        and resolution.expected_credits_balance is not distinct from audit.observed_credits_balance
        and audit.reconciliation_status = 'requires_resolution';
      execute 'update public.profiles set credits = 0, credits_balance = 0 where credits is null and credits_balance is null';
    else
      execute 'update public.profiles set credits = coalesce(credits_balance, 0), credits_balance = coalesce(credits_balance, 0)';
    end if;

    execute 'select count(*) from public.profiles where credits is distinct from credits_balance'
      into remaining_mismatches;
    if remaining_mismatches > 0 then
      raise exception 'Credit reconciliation invariant failed with % remaining mismatch(es)', remaining_mismatches;
    end if;

    execute $ddl$
      create or replace function public.sync_profile_credit_balance_compat()
      returns trigger
      language plpgsql
      set search_path = ''
      as $function$
      begin
        if tg_op = 'INSERT' then
          new.credits_balance := new.credits;
        elsif new.credits is distinct from old.credits then
          new.credits_balance := new.credits;
        elsif new.credits_balance is distinct from old.credits_balance then
          if current_user in ('anon', 'authenticated')
             and coalesce(current_setting('app.credit_op', true), '') <> 'on' then
            raise exception 'Cannot modify protected profile fields'
              using errcode = '42501';
          end if;
          new.credits := new.credits_balance;
        end if;
        return new;
      end;
      $function$
    $ddl$;
    execute 'revoke all on function public.sync_profile_credit_balance_compat() from public, anon, authenticated';
    execute 'drop trigger if exists trg_00_sync_profile_credit_balance_compat on public.profiles';
    execute $ddl$
      create trigger trg_00_sync_profile_credit_balance_compat
      before insert or update of credits, credits_balance on public.profiles
      for each row execute function public.sync_profile_credit_balance_compat()
    $ddl$;

    execute 'select count(*) from public.profiles where credits is distinct from credits_balance'
      into remaining_mismatches;
    if remaining_mismatches > 0 then
      raise exception 'Credit reconciliation invariant failed after trigger installation with % remaining mismatch(es)', remaining_mismatches;
    end if;
  else
    update public.profiles set credits = 0 where credits is null;
  end if;

  update public.api_credit_balance_reconciliation_state
  set initial_reconciliation_completed = true
  where migration_key = '20260812090000_api_production_contract';
end;
$$;

alter table public.profiles
  alter column credits set default 0,
  alter column credits set not null;

comment on column public.profiles.credits is
  'Canonical non-expiring Edutu credit balance; API metering and purchases use this column.';

create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  amount integer not null,
  type text not null,
  description text,
  related_id text,
  related_type text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.credit_transactions
  add column if not exists related_id text,
  add column if not exists related_type text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists credit_transactions_api_ref_unique
  on public.credit_transactions (related_type, related_id)
  where related_id is not null
    and related_type in ('api_request', 'api_credit_purchase');
create unique index if not exists billing_credit_transactions_purchase_unique
  on public.credit_transactions (related_type, related_id)
  where related_id is not null and related_type = 'credit_pack';

create table if not exists public.billing_providers (
  provider text primary key,
  display_name text not null,
  created_at timestamptz not null default now()
);
insert into public.billing_providers (provider, display_name)
values ('bachs', 'Bachs') on conflict (provider) do nothing;

create table if not exists public.billing_environments (
  environment text primary key,
  created_at timestamptz not null default now()
);
insert into public.billing_environments (environment)
values ('sandbox'), ('live') on conflict (environment) do nothing;

create table if not exists public.billing_products (
  product_key text primary key,
  fulfillment_kind text not null,
  feature_key text,
  renewal_mode text not null,
  payment_method_policy jsonb not null default '{}'::jsonb,
  expected_amount_minor bigint,
  currency char(3),
  cadence text,
  entitlement_duration interval,
  credit_quantity integer not null default 0,
  enabled boolean not null default false,
  catalog_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.billing_products
  add column if not exists fulfillment_kind text,
  add column if not exists feature_key text,
  add column if not exists renewal_mode text,
  add column if not exists payment_method_policy jsonb default '{}'::jsonb,
  add column if not exists expected_amount_minor bigint,
  add column if not exists currency char(3),
  add column if not exists cadence text,
  add column if not exists entitlement_duration interval,
  add column if not exists credit_quantity integer default 0,
  add column if not exists enabled boolean default false,
  add column if not exists catalog_version integer default 1;

insert into public.billing_products (
  product_key, fulfillment_kind, feature_key, renewal_mode,
  payment_method_policy, expected_amount_minor, currency, cadence,
  entitlement_duration, credit_quantity, enabled, catalog_version
)
values
  ('credits_100', 'credit_pack', null, 'one_time', '{"allowed_methods":["card"]}'::jsonb, null, null, 'one_time', null, 100, false, 1),
  ('credits_250', 'credit_pack', null, 'one_time', '{"allowed_methods":["card"]}'::jsonb, null, null, 'one_time', null, 250, false, 1),
  ('credits_700', 'credit_pack', null, 'one_time', '{"allowed_methods":["card"]}'::jsonb, null, null, 'one_time', null, 700, false, 1)
on conflict (product_key) do nothing;

create table if not exists public.billing_product_contract_quarantine (
  product_key text primary key,
  product_snapshot jsonb not null,
  reason text not null,
  quarantined_at timestamptz not null default now()
);

-- Preserve the exact legacy catalog row before taking it out of circulation.
-- Disabled malformed rows remain available for operator repair and audit.
insert into public.billing_product_contract_quarantine (
  product_key, product_snapshot, reason
)
select
  product.product_key,
  to_jsonb(product),
  'Enabled credit product violated the one-time non-expiring credit contract'
from public.billing_products product
where product.enabled
  and product.fulfillment_kind = 'credit_pack'
  and (
    product.renewal_mode is distinct from 'one_time'
    or coalesce(product.credit_quantity, 0) <= 0
    or product.entitlement_duration is not null
    or product.feature_key is not null
  )
on conflict (product_key) do nothing;

alter table public.billing_products
  drop constraint if exists billing_products_api_credit_contract_check;

update public.billing_products
set enabled = false,
    updated_at = now()
where enabled
  and fulfillment_kind = 'credit_pack'
  and (
    renewal_mode is distinct from 'one_time'
    or coalesce(credit_quantity, 0) <= 0
    or entitlement_duration is not null
    or feature_key is not null
  );

alter table public.billing_products
  add constraint billing_products_api_credit_contract_check
  check (
    not enabled
    or fulfillment_kind <> 'credit_pack'
    or (
      renewal_mode is not distinct from 'one_time'
      and coalesce(credit_quantity, 0) > 0
      and entitlement_duration is null
      and feature_key is null
    )
  ) not valid;

alter table public.billing_products
  validate constraint billing_products_api_credit_contract_check;

create table if not exists public.billing_product_provider_mappings (
  product_key text not null references public.billing_products(product_key),
  provider text not null references public.billing_providers(provider),
  environment text not null references public.billing_environments(environment),
  provider_product_id text not null,
  provider_price_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (product_key, provider, environment),
  unique (provider, environment, provider_product_id)
);

create table if not exists public.billing_checkout_intents (
  id uuid primary key default gen_random_uuid(),
  public_token_hash text not null unique,
  user_id text not null,
  provider text not null references public.billing_providers(provider),
  environment text not null references public.billing_environments(environment),
  product_key text not null references public.billing_products(product_key),
  product_snapshot jsonb not null,
  expected_amount_minor bigint not null,
  currency char(3) not null,
  provider_checkout_id text,
  provider_reference text,
  provider_checkout_url_hash text,
  status text not null default 'creating',
  expires_at timestamptz not null,
  idempotency_key text not null,
  return_surface text not null default 'web',
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.billing_checkout_intents
  add column if not exists provider_checkout_url_hash text,
  add column if not exists return_surface text default 'web',
  add column if not exists failure_code text;
update public.billing_checkout_intents set return_surface = 'web' where return_surface is null;
alter table public.billing_checkout_intents alter column return_surface set not null;

do $$
declare
  invalid_checkout_count bigint;
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'billing_checkout_intents_provider_environment_user_idempotency_'
      and conrelid = 'public.billing_checkout_intents'::regclass
  ) then
    alter table public.billing_checkout_intents
      add constraint billing_checkout_intents_provider_environment_user_idempotency_
      unique (provider, environment, user_id, idempotency_key);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'billing_checkout_intents_product_provider_environment_fkey'
      and conrelid = 'public.billing_checkout_intents'::regclass
  ) then
    alter table public.billing_checkout_intents
      add constraint billing_checkout_intents_product_provider_environment_fkey
      foreign key (product_key, provider, environment)
      references public.billing_product_provider_mappings
        (product_key, provider, environment)
      not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'billing_checkout_intents_return_surface_check'
      and conrelid = 'public.billing_checkout_intents'::regclass
  ) then
    alter table public.billing_checkout_intents
      add constraint billing_checkout_intents_return_surface_check
      check (return_surface in ('web', 'pwa')) not valid;
  end if;

  select count(*)
  into invalid_checkout_count
  from public.billing_checkout_intents intent
  where not exists (
    select 1
    from public.billing_product_provider_mappings mapping
    where mapping.product_key = intent.product_key
      and mapping.provider = intent.provider
      and mapping.environment = intent.environment
  );
  if invalid_checkout_count > 0 then
    raise exception 'Found % checkout intent(s) without a matching product/provider/environment mapping; repair those rows before retrying.',
      invalid_checkout_count;
  end if;
end;
$$;

alter table public.billing_checkout_intents
  validate constraint billing_checkout_intents_product_provider_environment_fkey;

create index if not exists billing_checkout_intents_provider_environment_status_expires_idx
  on public.billing_checkout_intents (provider, environment, status, expires_at);

create table if not exists public.billing_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null references public.billing_providers(provider),
  environment text not null references public.billing_environments(environment),
  event_id text not null,
  event_type text not null,
  organization_id text,
  provider_account_id text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'received',
  attempt_count integer not null default 0,
  last_error text,
  payload_hash text not null,
  raw_payload jsonb,
  raw_payload_expires_at timestamptz not null default (now() + interval '90 days'),
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'billing_provider_events_provider_event_unique'
      and conrelid = 'public.billing_provider_events'::regclass
  ) then
    alter table public.billing_provider_events
      add constraint billing_provider_events_provider_event_unique
      unique (provider, environment, event_id);
  end if;
end;
$$;

create index if not exists billing_events_provider_environment_retry_idx
  on public.billing_provider_events (provider, environment, status, next_retry_at)
  where processed_at is null and status in ('received', 'failed');

-- These tables are server-owned. RLS plus explicit revocation keeps accidental
-- Data API exposure from becoming a client-side billing mutation surface.
alter table public.api_consumers enable row level security;
alter table public.api_usage_events enable row level security;
alter table public.api_usage_buckets enable row level security;
alter table public.api_partner_events enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.billing_providers enable row level security;
alter table public.billing_environments enable row level security;
alter table public.billing_products enable row level security;
alter table public.billing_product_provider_mappings enable row level security;
alter table public.billing_checkout_intents enable row level security;
alter table public.billing_provider_events enable row level security;
alter table public.billing_product_contract_quarantine enable row level security;

revoke all on table public.api_consumers from public, anon, authenticated;
revoke all on table public.api_usage_events from public, anon, authenticated;
revoke all on table public.api_usage_buckets from public, anon, authenticated;
revoke all on table public.api_partner_events from public, anon, authenticated;
revoke all on table public.credit_transactions from public, anon, authenticated;
revoke all on table public.billing_providers from public, anon, authenticated;
revoke all on table public.billing_environments from public, anon, authenticated;
revoke all on table public.billing_products from public, anon, authenticated;
revoke all on table public.billing_product_provider_mappings from public, anon, authenticated;
revoke all on table public.billing_checkout_intents from public, anon, authenticated;
revoke all on table public.billing_provider_events from public, anon, authenticated;
revoke all on table public.billing_product_contract_quarantine from public, anon, authenticated;

-- Normalize service ownership to the explicit least-privilege matrix below;
-- earlier billing migrations may have granted broader table mutation rights.
revoke all on table public.api_consumers from service_role;
revoke all on table public.api_usage_events from service_role;
revoke all on table public.api_usage_buckets from service_role;
revoke all on table public.api_partner_events from service_role;
revoke all on table public.credit_transactions from service_role;
revoke all on table public.billing_providers from service_role;
revoke all on table public.billing_environments from service_role;
revoke all on table public.billing_products from service_role;
revoke all on table public.billing_product_provider_mappings from service_role;
revoke all on table public.billing_checkout_intents from service_role;
revoke all on table public.billing_provider_events from service_role;
revoke all on table public.billing_product_contract_quarantine from service_role;

grant select, insert, update on table public.api_consumers to service_role;
grant select, insert on table public.api_usage_events to service_role;
grant select, insert, update on table public.api_usage_buckets to service_role;
grant select, insert on table public.api_partner_events to service_role;
grant select, insert on table public.credit_transactions to service_role;
grant select on table public.billing_providers to service_role;
grant select on table public.billing_environments to service_role;
grant select on table public.billing_products to service_role;
grant select on table public.billing_product_provider_mappings to service_role;
grant select, insert, update on table public.billing_checkout_intents to service_role;
grant select, insert, update on table public.billing_provider_events to service_role;
grant select on table public.billing_product_contract_quarantine to service_role;

commit;
