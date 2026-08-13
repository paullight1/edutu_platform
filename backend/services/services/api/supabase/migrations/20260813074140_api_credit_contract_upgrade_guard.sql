-- Forward-only repair and deployment gate for databases that may have applied
-- the original 20260812090000 Task 1 migration before its reconciliation fix.

begin;

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'public.profiles is required before the API credit upgrade guard';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = 'public.profiles'::regclass
      and attname = 'credits' and not attisdropped
  ) then
    raise exception 'profiles.credits is required for the API credit upgrade audit';
  end if;
end;
$$;

create table if not exists public.api_credit_cutover_upgrade_audit (
  id uuid primary key default gen_random_uuid(),
  migration_version text not null,
  migration_history_table_present boolean not null,
  original_contract_recorded boolean not null,
  corrected_reconciliation_marker_present boolean not null,
  legacy_column_preexisting boolean not null default false,
  profile_count bigint not null,
  divergent_profile_count bigint not null,
  credit_transaction_count bigint,
  payment_ledger_entry_count bigint,
  legacy_billing_transaction_count bigint,
  observed_at timestamptz not null default now()
);

alter table public.api_credit_cutover_upgrade_audit
  add column if not exists legacy_column_preexisting boolean not null default false;

create table if not exists public.api_credit_cutover_upgrade_attestations (
  migration_version text primary key,
  approved_by text not null check (length(trim(approved_by)) > 0),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  approved_at timestamptz not null default now()
);

alter table public.api_credit_cutover_upgrade_audit enable row level security;
alter table public.api_credit_cutover_upgrade_attestations enable row level security;
revoke all on table public.api_credit_cutover_upgrade_audit from public, anon, authenticated, service_role;
revoke all on table public.api_credit_cutover_upgrade_attestations from public, anon, authenticated, service_role;
grant select on table public.api_credit_cutover_upgrade_audit to service_role;

do $$
declare
  history_present boolean;
  original_recorded boolean := false;
  corrected_marker boolean := false;
  legacy_present boolean;
  profile_total bigint;
  divergent_total bigint;
  credit_total bigint;
  payment_total bigint;
  legacy_payment_total bigint;
begin
  history_present := to_regclass('supabase_migrations.schema_migrations') is not null;
  if history_present then
    execute $query$
      select exists (
        select 1
        from supabase_migrations.schema_migrations
        where version = '20260812090000'
      )
    $query$ into original_recorded;
  end if;

  if to_regclass('public.api_credit_balance_reconciliation_state') is not null then
    select exists (
      select 1
      from public.api_credit_balance_reconciliation_state
      where migration_key = '20260812090000_api_production_contract'
        and initial_reconciliation_completed
    ) into corrected_marker;
  end if;

  select exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = 'public.profiles'::regclass
      and attname = 'credits_balance'
      and not attisdropped
  ) into legacy_present;

  select count(*) into profile_total from public.profiles;
  if legacy_present then
    execute 'select count(*) filter (where credits is distinct from credits_balance) from public.profiles'
      into divergent_total;
  else
    divergent_total := 0;
  end if;

  if to_regclass('public.credit_transactions') is not null then
    select count(*) into credit_total from public.credit_transactions;
  end if;
  if to_regclass('public.billing_payment_ledger') is not null then
    select count(*) into payment_total from public.billing_payment_ledger;
  end if;
  if to_regclass('public.billing_transactions') is not null then
    select count(*) into legacy_payment_total from public.billing_transactions;
  end if;

  insert into public.api_credit_cutover_upgrade_audit (
    migration_version,
    migration_history_table_present,
    original_contract_recorded,
    corrected_reconciliation_marker_present,
    legacy_column_preexisting,
    profile_count,
    divergent_profile_count,
    credit_transaction_count,
    payment_ledger_entry_count,
    legacy_billing_transaction_count
  ) values (
    '20260812090000',
    history_present,
    original_recorded,
    corrected_marker,
    legacy_present,
    profile_total,
    divergent_total,
    credit_total,
    payment_total,
    legacy_payment_total
  );
end;
$$;

-- Preserve this audit even when the deployment gate below aborts. Operators
-- must compare it with backups/payment evidence before attesting an old cutover.
commit;

do $$
declare
  audit_row public.api_credit_cutover_upgrade_audit%rowtype;
begin
  select * into strict audit_row
  from public.api_credit_cutover_upgrade_audit
  where migration_version = '20260812090000'
  order by observed_at desc, id desc
  limit 1;

  if not audit_row.migration_history_table_present then
    raise exception 'Cannot verify Task 1 migration history: supabase_migrations.schema_migrations is unavailable. Run this migration through the Supabase migration runner.';
  end if;
  if not audit_row.original_contract_recorded then
    raise exception 'Task 1 migration 20260812090000 is not recorded. Repair migration ordering before applying the API credit upgrade guard.';
  end if;

  if audit_row.legacy_column_preexisting
     and not audit_row.corrected_reconciliation_marker_present
     and not exists (
       select 1
       from public.api_credit_cutover_upgrade_attestations
       where migration_version = '20260812090000'
     ) then
    raise exception 'Task 1 was previously deployed without the corrected reconciliation marker. Review public.api_credit_cutover_upgrade_audit plus backups/payment/grant evidence, then insert an approved attestation into public.api_credit_cutover_upgrade_attestations before retrying.';
  end if;
end;
$$;

begin;

create table if not exists public.api_credit_balance_reconciliation_state (
  migration_key text primary key,
  credits_column_preexisting boolean not null,
  legacy_column_preexisting boolean not null,
  initial_reconciliation_completed boolean not null default false,
  recorded_at timestamptz not null default now()
);

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
revoke all on table public.api_credit_balance_reconciliation_state from public, anon, authenticated, service_role;
revoke all on table public.api_credit_balance_reconciliation_audit from public, anon, authenticated, service_role;
revoke all on table public.api_credit_balance_reconciliation_resolutions from public, anon, authenticated, service_role;
grant select on table public.api_credit_balance_reconciliation_audit to service_role;

insert into public.api_credit_balance_reconciliation_state (
  migration_key,
  credits_column_preexisting,
  legacy_column_preexisting,
  initial_reconciliation_completed
) values (
  '20260812090000_api_production_contract',
  true,
  exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = 'public.profiles'::regclass
      and attname = 'credits_balance'
      and not attisdropped
  ),
  false
) on conflict (migration_key) do nothing;

-- SHARE ROW EXCLUSIVE conflicts with ordinary INSERT/UPDATE/DELETE writers.
-- Hold it from the definitive divergence snapshot through trigger installation
-- and the final invariant check so no one-column write can cross the cutover.
lock table public.profiles in share row exclusive mode;

do $$
declare
  legacy_present boolean;
  unresolved_count bigint;
  unresolved_sample text;
begin
  select exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = 'public.profiles'::regclass
      and attname = 'credits_balance'
      and not attisdropped
  ) into legacy_present;

  if legacy_present then
    execute $sql$
      insert into public.api_credit_balance_reconciliation_audit (
        migration_key,
        user_id,
        snapshot_fingerprint,
        observed_credits,
        observed_credits_balance,
        reconciliation_status
      )
      select
        '20260813074140_api_credit_contract_upgrade_guard',
        profile.user_id::text,
        md5(coalesce(profile.credits::text, '<null>') || '|' ||
            coalesce(profile.credits_balance::text, '<null>')),
        profile.credits,
        profile.credits_balance,
        'requires_resolution'
      from public.profiles profile
      where profile.credits is distinct from profile.credits_balance
      on conflict (migration_key, user_id, snapshot_fingerprint) do nothing
    $sql$;

    execute $sql$
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
    $sql$ into unresolved_count;

    if unresolved_count > 0 then
      execute $sql$
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
      $sql$ into unresolved_sample;
      raise exception 'Found % unresolved credit balance mismatch(es) under the profiles cutover lock (sample user_ids: %). Add exact approved reconciliation resolutions before retrying.',
        unresolved_count, coalesce(unresolved_sample, '<none>');
    end if;

    perform set_config('app.credit_op', 'on', true);

    execute $sql$
      update public.profiles profile
      set credits = resolution.resolved_balance,
          credits_balance = resolution.resolved_balance
      from public.api_credit_balance_reconciliation_resolutions resolution
      where resolution.user_id = profile.user_id::text
        and resolution.expected_credits is not distinct from profile.credits
        and resolution.expected_credits_balance is not distinct from profile.credits_balance
        and profile.credits is distinct from profile.credits_balance
    $sql$;

    execute $sql$
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
    $sql$;

    execute $sql$
      revoke all on function public.sync_profile_credit_balance_compat() from public, anon, authenticated
    $sql$;
    execute $sql$
      drop trigger if exists trg_00_sync_profile_credit_balance_compat on public.profiles
    $sql$;
    execute $sql$
      create trigger trg_00_sync_profile_credit_balance_compat
      before insert or update of credits, credits_balance on public.profiles
      for each row execute function public.sync_profile_credit_balance_compat()
    $sql$;

    execute $sql$
      select count(*)
      from public.profiles
      where credits is distinct from credits_balance
    $sql$ into unresolved_count;
    if unresolved_count > 0 then
      raise exception 'Credit reconciliation invariant failed after trigger installation with % remaining mismatch(es)',
        unresolved_count;
    end if;
  end if;
end;
$$;

update public.api_credit_balance_reconciliation_state
set initial_reconciliation_completed = true,
    legacy_column_preexisting = exists (
      select 1
      from pg_catalog.pg_attribute
      where attrelid = 'public.profiles'::regclass
        and attname = 'credits_balance'
        and not attisdropped
    )
where migration_key = '20260812090000_api_production_contract';

-- Normalize historical SQL-fulfillment rows and the active partial index to
-- the same discriminator used by BillingService. Block both discriminator
-- writers while checking for cross-tag collisions and rewriting old rows.
lock table public.credit_transactions in share row exclusive mode;

do $$
declare
  collision_count bigint;
begin
  select count(*) into collision_count
  from (
    select related_id
    from public.credit_transactions
    where related_id is not null
      and related_type in ('credit_pack', 'billing_credit_pack')
    group by related_id
    having bool_or(related_type = 'credit_pack')
       and bool_or(related_type = 'billing_credit_pack')
  ) collisions;

  if collision_count > 0 then
    raise exception 'Found % credit purchase reference collision(s) split across credit_pack and billing_credit_pack. Reconcile duplicate grants before retrying.',
      collision_count;
  end if;
end;
$$;

drop index if exists public.billing_credit_transactions_purchase_unique;

update public.credit_transactions
set related_type = 'credit_pack'
where related_type = 'billing_credit_pack';

create unique index billing_credit_transactions_purchase_unique
  on public.credit_transactions (related_type, related_id)
  where related_id is not null and related_type = 'credit_pack';

do $$
declare
  function_definition text;
begin
  select pg_catalog.pg_get_functiondef(proc.oid)
  into function_definition
  from pg_catalog.pg_proc proc
  join pg_catalog.pg_namespace namespace on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.proname = 'billing_fulfill_credit_pack';

  if function_definition is not null
     and position('billing_credit_pack' in function_definition) > 0 then
    execute replace(
      function_definition,
      quote_literal('billing_credit_pack'),
      quote_literal('credit_pack')
    );
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc proc
    join pg_catalog.pg_namespace namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname = 'billing_fulfill_credit_pack'
      and pg_catalog.pg_get_functiondef(proc.oid) like '%billing_credit_pack%'
  ) then
    raise exception 'billing_fulfill_credit_pack still contains the legacy billing_credit_pack discriminator';
  end if;
end;
$$;

commit;
