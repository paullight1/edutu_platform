-- Compatibility projections derived only from source-specific grants. A
-- provider updates its own grant; effective Pro is recomputed across all
-- active, non-revoked, non-expired sources.

begin;

create table if not exists public.billing_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  feature_key text not null,
  status text not null default 'expired',
  expires_at timestamptz,
  source text not null default 'derived_grants',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, feature_key)
);

-- Preserve legacy identifiers exactly while standardizing the canonical type.
do $$
declare
  v_type text;
begin
  select data_type into v_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'billing_entitlements'
    and column_name = 'user_id';

  if v_type is not null and v_type <> 'text' then
    execute 'alter table public.billing_entitlements alter column user_id type text using user_id::text';
  end if;
end;
$$;

alter table public.billing_entitlements
  add column if not exists feature_key text not null default 'pro',
  add column if not exists status text not null default 'expired',
  add column if not exists expires_at timestamptz,
  add column if not exists source text not null default 'derived_grants',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists billing_entitlements_user_feature_unique
  on public.billing_entitlements (user_id, feature_key);

create or replace function public.billing_has_active_pro_grant(
  p_user_id text,
  p_as_of timestamptz default now()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.billing_entitlement_grants g
    where g.user_id = p_user_id
      and g.feature_key = 'pro'
      and g.status = 'active'
      and g.revoked_at is null
      and (g.valid_until is null or g.valid_until > p_as_of)
  );
$$;

create or replace function public.billing_refresh_entitlement_projection(
  p_user_id text,
  p_feature_key text default 'pro',
  p_as_of timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active boolean;
  v_has_unbounded boolean;
  v_expires_at timestamptz;
  v_has_is_pro boolean;
  v_has_pro_expires_at boolean;
begin
  select
    exists (
      select 1
      from public.billing_entitlement_grants active_grant
      where active_grant.user_id = p_user_id
        and active_grant.feature_key = p_feature_key
        and active_grant.status = 'active'
        and active_grant.revoked_at is null
        and (
          active_grant.valid_until is null
          or active_grant.valid_until > p_as_of
        )
    ),
    bool_or(g.valid_until is null) filter (
      where g.status = 'active'
        and g.revoked_at is null
        and (g.valid_until is null or g.valid_until > p_as_of)
    )
  into v_active, v_has_unbounded
  from public.billing_entitlement_grants g
  where g.user_id = p_user_id
    and g.feature_key = p_feature_key;

  select case
    when v_has_unbounded then null
    else max(g.valid_until) filter (
      where g.status = 'active'
        and g.revoked_at is null
        and (g.valid_until is null or g.valid_until > p_as_of)
    )
  end
  into v_expires_at
  from public.billing_entitlement_grants g
  where g.user_id = p_user_id
    and g.feature_key = p_feature_key;

  insert into public.billing_entitlements as entitlement (
    user_id,
    feature_key,
    status,
    expires_at,
    source,
    metadata,
    updated_at
  ) values (
    p_user_id,
    p_feature_key,
    case when coalesce(v_active, false) then 'active' else 'expired' end,
    v_expires_at,
    'derived_grants',
    jsonb_build_object('derived_at', p_as_of),
    now()
  )
  on conflict (user_id, feature_key) do update
  set status = excluded.status,
      expires_at = excluded.expires_at,
      source = excluded.source,
      metadata = excluded.metadata,
      updated_at = excluded.updated_at;

  -- profiles.is_pro is only a cache. Do not write it unless the installation
  -- also has an explicit expiry column that can be updated in the same write.
  if to_regclass('public.profiles') is not null then
    select
      exists (
        select 1
        from pg_catalog.pg_attribute
        where attrelid = to_regclass('public.profiles')
          and attname = 'is_pro'
          and not attisdropped
      ),
      exists (
        select 1
        from pg_catalog.pg_attribute
        where attrelid = to_regclass('public.profiles')
          and attname = 'pro_expires_at'
          and not attisdropped
      )
    into v_has_is_pro, v_has_pro_expires_at;

    if v_has_is_pro and v_has_pro_expires_at and p_feature_key = 'pro' then
      update public.profiles
      set is_pro = coalesce(v_active, false),
          pro_expires_at = v_expires_at
      where user_id::text = p_user_id;
    end if;
  end if;
end;
$$;

create or replace function public.billing_refresh_projection_from_grant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.billing_refresh_entitlement_projection(
    new.user_id,
    new.feature_key
  );
  return new;
end;
$$;

drop trigger if exists billing_grants_refresh_projection
  on public.billing_entitlement_grants;
create trigger billing_grants_refresh_projection
  after insert or update of status, valid_until, revoked_at, revoke_reason
  on public.billing_entitlement_grants
  for each row execute function public.billing_refresh_projection_from_grant();

alter table public.billing_entitlements enable row level security;
revoke all on table public.billing_entitlements from public;
revoke all on table public.billing_entitlements from anon, authenticated;
grant select, insert, update, delete on table public.billing_entitlements
  to service_role;

revoke all on function public.billing_has_active_pro_grant(text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.billing_refresh_entitlement_projection(
  text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.billing_refresh_projection_from_grant()
  from public, anon, authenticated;
grant execute on function public.billing_has_active_pro_grant(text, timestamptz)
  to service_role;
grant execute on function public.billing_refresh_entitlement_projection(
  text, text, timestamptz
) to service_role;
grant execute on function public.billing_refresh_projection_from_grant()
  to service_role;

commit;
