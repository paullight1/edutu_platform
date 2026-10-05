-- Require the access period to have started in every grant projection.
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
    where g.user_id = p_user_id
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
      where active_grant.user_id = p_user_id
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
  where g.user_id = p_user_id
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
  where g.user_id = (select auth.jwt() ->> 'sub')
  group by g.user_id, g.feature_key;
$$;


-- Serialize recurring checkout creation per billing account, including requests
-- with different idempotency keys. Existing subscriptions change via the portal.
create or replace function public.billing_guard_recurring_checkout()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.provider <> 'bachs' or new.product_snapshot->>'renewalMode' is distinct from 'recurring' then
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    new.provider || ':' || new.environment || ':' || new.user_id, 0));
  -- Preserve retrying the identical idempotent request.
  if exists(select 1 from public.billing_checkout_intents i
    where i.provider=new.provider and i.environment=new.environment
      and i.user_id=new.user_id and i.idempotency_key=new.idempotency_key) then
    return new;
  end if;
  if exists(select 1 from public.billing_checkout_intents i
    where i.provider=new.provider and i.environment=new.environment and i.user_id=new.user_id
      and i.product_snapshot->>'renewalMode'='recurring'
      and i.status in ('creating','open','processing','paid') and i.expires_at > now())
    or exists(select 1 from public.billing_provider_subscriptions s
      where s.provider=new.provider and s.environment=new.environment and s.user_id=new.user_id
        and s.status in ('active','trialing','past_due','unpaid')) then
    raise exception 'A recurring checkout or subscription already exists; manage billing from the account portal.'
      using errcode='23505';
  end if;
  return new;
end;
$$;
revoke all on function public.billing_guard_recurring_checkout() from public, anon, authenticated;
drop trigger if exists billing_guard_recurring_checkout on public.billing_checkout_intents;
create trigger billing_guard_recurring_checkout before insert on public.billing_checkout_intents
  for each row execute function public.billing_guard_recurring_checkout();
commit;
