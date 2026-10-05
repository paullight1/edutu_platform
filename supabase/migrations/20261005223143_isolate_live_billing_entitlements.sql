-- Sandbox payments must never update production entitlement projections.
begin;
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
    where g.environment = 'live' and g.user_id = p_user_id
      and g.feature_key = 'pro'
      and g.status = 'active'
      and g.revoked_at is null
      and g.valid_from <= p_as_of
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
      where active_grant.environment = 'live' and active_grant.user_id = p_user_id
        and active_grant.feature_key = p_feature_key
        and active_grant.status = 'active'
        and active_grant.revoked_at is null
        and active_grant.valid_from <= p_as_of
        and (
          active_grant.valid_until is null
          or active_grant.valid_until > p_as_of
        )
    ),
    bool_or(g.valid_until is null) filter (
      where g.status = 'active'
        and g.revoked_at is null
        and g.valid_from <= p_as_of
        and (g.valid_until is null or g.valid_until > p_as_of)
    )
  into v_active, v_has_unbounded
  from public.billing_entitlement_grants g
  where g.environment = 'live' and g.user_id = p_user_id
    and g.feature_key = p_feature_key;

  select case
    when v_has_unbounded then null
    else max(g.valid_until) filter (
      where g.status = 'active'
        and g.revoked_at is null
        and g.valid_from <= p_as_of
        and (g.valid_until is null or g.valid_until > p_as_of)
    )
  end
  into v_expires_at
  from public.billing_entitlement_grants g
  where g.environment = 'live' and g.user_id = p_user_id
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
        and g.valid_from <= now()
        and g.valid_until is null
      ) then null
      else max(g.valid_until) filter (
        where g.status = 'active'
          and g.revoked_at is null
        and g.valid_from <= now()
          and g.valid_until > now()
      )
    end as valid_until,
    bool_or(
      g.status = 'active'
      and g.revoked_at is null
        and g.valid_from <= now()
      and (g.valid_until is null or g.valid_until > now())
    ) as active
  from public.billing_entitlement_grants g
  where g.environment = 'live' and g.user_id = (select auth.jwt() ->> 'sub')
  group by g.user_id, g.feature_key;
$$;


-- Repair existing derived cache rows against live grants only.
select public.billing_refresh_entitlement_projection(user_id, feature_key)
from public.billing_entitlements where source = 'derived_grants';
commit;
