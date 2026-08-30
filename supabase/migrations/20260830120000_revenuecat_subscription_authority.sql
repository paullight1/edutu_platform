-- Canonical RevenueCat subscription catalog and lifecycle authority.
-- RevenueCat package IDs remain provider-neutral mappings; store-specific
-- identifiers live in a dedicated binding table because one package maps to
-- both an App Store product and a Google Play base plan.

begin;

alter table public.billing_provider_subscriptions
  add column if not exists provider_store text,
  add column if not exists entitlement_key text,
  add column if not exists last_event_id text,
  add column if not exists grace_period_expires_at timestamptz,
  add column if not exists auto_resume_at timestamptz,
  add column if not exists scheduled_product_key text references public.billing_products (product_key),
  add column if not exists scheduled_cadence text,
  add column if not exists scheduled_change_at timestamptz;

alter table public.billing_provider_events
  add column if not exists provider_reference text;

create table if not exists public.billing_revenuecat_store_products (
  id uuid primary key default gen_random_uuid(),
  environment text not null references public.billing_environments (environment),
  product_key text not null references public.billing_products (product_key),
  package_id text not null,
  store text not null check (store in ('APP_STORE', 'PLAY_STORE', 'TEST_STORE')),
  provider_product_id text not null,
  entitlement_key text not null check (entitlement_key in ('lite', 'pro', 'scholar')),
  cadence text not null check (cadence in ('weekly', 'monthly', 'yearly')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (environment, product_key, store),
  unique (environment, store, provider_product_id)
);

create table if not exists public.billing_revenuecat_event_effects (
  environment text not null references public.billing_environments (environment),
  event_id text not null,
  event_type text not null,
  provider_subscription_id text,
  user_id text not null,
  outcome text not null check (outcome in ('processing', 'applied', 'stale', 'review')),
  result jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (environment, event_id)
);

insert into public.billing_products as product (
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
  enabled,
  catalog_version
)
values
  ('lite_weekly', 'subscription', 'lite', 'recurring', '{"allowed_methods":["app_store","play_store"],"allowed_currencies":["USD"]}'::jsonb, 399, 'USD', 'weekly', null, 0, true, 1),
  ('lite_monthly', 'subscription', 'lite', 'recurring', '{"allowed_methods":["app_store","play_store"],"allowed_currencies":["USD"]}'::jsonb, 1000, 'USD', 'monthly', null, 0, true, 1),
  ('lite_yearly', 'subscription', 'lite', 'recurring', '{"allowed_methods":["app_store","play_store"],"allowed_currencies":["USD"]}'::jsonb, 10000, 'USD', 'yearly', null, 0, true, 1),
  ('pro_weekly', 'subscription', 'pro', 'recurring', '{"allowed_methods":["app_store","play_store"],"allowed_currencies":["USD"]}'::jsonb, 500, 'USD', 'weekly', null, 0, true, 1),
  ('pro_monthly', 'subscription', 'pro', 'recurring', '{"allowed_methods":["app_store","play_store"],"allowed_currencies":["USD"]}'::jsonb, 1500, 'USD', 'monthly', null, 0, true, 1),
  ('pro_yearly', 'subscription', 'pro', 'recurring', '{"allowed_methods":["app_store","play_store"],"allowed_currencies":["USD"]}'::jsonb, 15000, 'USD', 'yearly', null, 0, true, 1),
  ('scholar_weekly', 'subscription', 'scholar', 'recurring', '{"allowed_methods":["app_store","play_store"],"allowed_currencies":["USD"]}'::jsonb, 799, 'USD', 'weekly', null, 0, true, 1),
  ('scholar_monthly', 'subscription', 'scholar', 'recurring', '{"allowed_methods":["app_store","play_store"],"allowed_currencies":["USD"]}'::jsonb, 2499, 'USD', 'monthly', null, 0, true, 1),
  ('scholar_yearly', 'subscription', 'scholar', 'recurring', '{"allowed_methods":["app_store","play_store"],"allowed_currencies":["USD"]}'::jsonb, 20000, 'USD', 'yearly', null, 0, true, 1)
on conflict (product_key) do update
set fulfillment_kind = excluded.fulfillment_kind,
    feature_key = excluded.feature_key,
    renewal_mode = excluded.renewal_mode,
    payment_method_policy = excluded.payment_method_policy,
    expected_amount_minor = excluded.expected_amount_minor,
    currency = excluded.currency,
    cadence = excluded.cadence,
    entitlement_duration = excluded.entitlement_duration,
    credit_quantity = excluded.credit_quantity,
    enabled = excluded.enabled,
    catalog_version = greatest(product.catalog_version, excluded.catalog_version),
    updated_at = now();

insert into public.billing_product_provider_mappings as mapping (
  product_key,
  provider,
  environment,
  provider_product_id,
  provider_price_id
)
select
  product.product_key,
  'revenuecat',
  environment.environment,
  product.product_key,
  null
from (
  values
    ('lite_weekly'), ('lite_monthly'), ('lite_yearly'),
    ('pro_weekly'), ('pro_monthly'), ('pro_yearly'),
    ('scholar_weekly'), ('scholar_monthly'), ('scholar_yearly')
) as product(product_key)
cross join (values ('sandbox'), ('live')) as environment(environment)
on conflict (product_key, provider, environment) do update
set provider_product_id = excluded.provider_product_id,
    provider_price_id = excluded.provider_price_id,
    updated_at = now();

insert into public.billing_revenuecat_store_products as binding (
  environment,
  product_key,
  package_id,
  store,
  provider_product_id,
  entitlement_key,
  cadence
)
select
  environment.environment,
  catalog.product_key,
  catalog.package_id,
  catalog.store,
  catalog.provider_product_id,
  catalog.entitlement_key,
  catalog.cadence
from (
  values
    ('lite_weekly', 'lite_weekly', 'APP_STORE', 'edutu_lite_weekly_v1', 'lite', 'weekly'),
    ('lite_monthly', 'lite_monthly', 'APP_STORE', 'edutu_lite_monthly_v1', 'lite', 'monthly'),
    ('lite_yearly', 'lite_yearly', 'APP_STORE', 'edutu_lite_yearly_v1', 'lite', 'yearly'),
    ('pro_weekly', 'pro_weekly', 'APP_STORE', 'edutu_pro_weekly_v1', 'pro', 'weekly'),
    ('pro_monthly', 'pro_monthly', 'APP_STORE', 'edutu_pro_monthly_v1', 'pro', 'monthly'),
    ('pro_yearly', 'pro_yearly', 'APP_STORE', 'edutu_pro_yearly_v1', 'pro', 'yearly'),
    ('scholar_weekly', 'scholar_weekly', 'APP_STORE', 'edutu_scholar_weekly_v1', 'scholar', 'weekly'),
    ('scholar_monthly', 'scholar_monthly', 'APP_STORE', 'edutu_scholar_monthly_v1', 'scholar', 'monthly'),
    ('scholar_yearly', 'scholar_yearly', 'APP_STORE', 'edutu_scholar_yearly_v1', 'scholar', 'yearly'),
    ('lite_weekly', 'lite_weekly', 'PLAY_STORE', 'edutu_lite_v1:weekly-auto', 'lite', 'weekly'),
    ('lite_monthly', 'lite_monthly', 'PLAY_STORE', 'edutu_lite_v1:monthly-auto', 'lite', 'monthly'),
    ('lite_yearly', 'lite_yearly', 'PLAY_STORE', 'edutu_lite_v1:yearly-auto', 'lite', 'yearly'),
    ('pro_weekly', 'pro_weekly', 'PLAY_STORE', 'edutu_pro_v1:weekly-auto', 'pro', 'weekly'),
    ('pro_monthly', 'pro_monthly', 'PLAY_STORE', 'edutu_pro_v1:monthly-auto', 'pro', 'monthly'),
    ('pro_yearly', 'pro_yearly', 'PLAY_STORE', 'edutu_pro_v1:yearly-auto', 'pro', 'yearly'),
    ('scholar_weekly', 'scholar_weekly', 'PLAY_STORE', 'edutu_scholar_v1:weekly-auto', 'scholar', 'weekly'),
    ('scholar_monthly', 'scholar_monthly', 'PLAY_STORE', 'edutu_scholar_v1:monthly-auto', 'scholar', 'monthly'),
    ('scholar_yearly', 'scholar_yearly', 'PLAY_STORE', 'edutu_scholar_v1:yearly-auto', 'scholar', 'yearly'),
    ('lite_weekly', 'lite_weekly', 'TEST_STORE', 'edutu_lite_weekly_test_v1', 'lite', 'weekly'),
    ('lite_monthly', 'lite_monthly', 'TEST_STORE', 'edutu_lite_monthly_test_v1', 'lite', 'monthly'),
    ('lite_yearly', 'lite_yearly', 'TEST_STORE', 'edutu_lite_yearly_test_v1', 'lite', 'yearly'),
    ('pro_weekly', 'pro_weekly', 'TEST_STORE', 'edutu_pro_weekly_test_v1', 'pro', 'weekly'),
    ('pro_monthly', 'pro_monthly', 'TEST_STORE', 'edutu_pro_monthly_test_v1', 'pro', 'monthly'),
    ('pro_yearly', 'pro_yearly', 'TEST_STORE', 'edutu_pro_yearly_test_v1', 'pro', 'yearly'),
    ('scholar_weekly', 'scholar_weekly', 'TEST_STORE', 'edutu_scholar_weekly_test_v1', 'scholar', 'weekly'),
    ('scholar_monthly', 'scholar_monthly', 'TEST_STORE', 'edutu_scholar_monthly_test_v1', 'scholar', 'monthly'),
    ('scholar_yearly', 'scholar_yearly', 'TEST_STORE', 'edutu_scholar_yearly_test_v1', 'scholar', 'yearly')
) as catalog(product_key, package_id, store, provider_product_id, entitlement_key, cadence)
cross join (values ('sandbox'), ('live')) as environment(environment)
where catalog.store <> 'TEST_STORE' or environment.environment = 'sandbox'
on conflict (environment, product_key, store) do update
set package_id = excluded.package_id,
    provider_product_id = excluded.provider_product_id,
    entitlement_key = excluded.entitlement_key,
    cadence = excluded.cadence,
    updated_at = now();

create unique index if not exists billing_provider_events_provider_event_unique
  on public.billing_provider_events (provider, environment, event_id);

create index if not exists billing_revenuecat_store_products_lookup_idx
  on public.billing_revenuecat_store_products (environment, provider_product_id);
create index if not exists billing_revenuecat_effects_subscription_idx
  on public.billing_revenuecat_event_effects (environment, provider_subscription_id, created_at desc);

create or replace function public.billing_refresh_paid_tier_projections(
  p_user_id text,
  p_as_of timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.billing_refresh_entitlement_projection(p_user_id, 'lite', p_as_of);
  perform public.billing_refresh_entitlement_projection(p_user_id, 'pro', p_as_of);
  perform public.billing_refresh_entitlement_projection(p_user_id, 'scholar', p_as_of);
end;
$$;

create or replace function public.billing_apply_revenuecat_subscription_event(
  p_environment text,
  p_event_id text,
  p_event_type text,
  p_app_user_id text,
  p_product_id text,
  p_subscription_lineage_id text,
  p_transaction_id text,
  p_occurred_at timestamptz,
  p_expires_at timestamptz,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_key text;
  v_feature_key text;
  v_cadence text;
  v_store text;
  v_status text;
  v_valid_from timestamptz;
  v_grace_expires_at timestamptz;
  v_auto_resume_at timestamptz;
  v_existing_updated_at timestamptz;
  v_inserted integer;
  v_old_owner text;
  v_new_owner text;
  v_scheduled_product_key text;
  v_scheduled_cadence text;
  v_scheduled_change_at timestamptz;
  v_result jsonb;
begin
  if p_environment not in ('sandbox', 'live') then
    raise exception 'invalid RevenueCat environment';
  end if;
  if nullif(btrim(p_event_id), '') is null
    or nullif(btrim(p_event_type), '') is null
    or nullif(btrim(p_app_user_id), '') is null then
    raise exception 'missing RevenueCat event identity';
  end if;

  insert into public.billing_revenuecat_event_effects (
    environment,
    event_id,
    event_type,
    provider_subscription_id,
    user_id,
    outcome
  ) values (
    p_environment,
    p_event_id,
    p_event_type,
    p_subscription_lineage_id,
    p_app_user_id,
    'processing'
  )
  on conflict (environment, event_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select effect.result
      into v_result
    from public.billing_revenuecat_event_effects effect
    where effect.environment = p_environment
      and effect.event_id = p_event_id;
    return coalesce(v_result, jsonb_build_object('outcome', 'duplicate'))
      || jsonb_build_object('outcome', 'duplicate');
  end if;

  if p_event_type not in (
    'INITIAL_PURCHASE', 'RENEWAL', 'CANCELLATION', 'UNCANCELLATION',
    'SUBSCRIPTION_PAUSED', 'EXPIRATION', 'BILLING_ISSUE', 'PRODUCT_CHANGE',
    'SUBSCRIPTION_EXTENDED', 'REFUND_REVERSED', 'TRANSFER',
    'TEMPORARY_ENTITLEMENT_GRANT', 'PURCHASE_REDEEMED', 'REFUND',
    'PRICE_INCREASE_CONSENT_REQUIRED', 'PRICE_INCREASE_CONSENT_APPROVED'
  ) then
    v_result := jsonb_build_object(
      'outcome', 'review',
      'reason', 'unsupported_event_type',
      'eventType', p_event_type,
      'userId', p_app_user_id
    );
    update public.billing_revenuecat_event_effects
    set outcome = 'review', result = v_result, processed_at = now(), updated_at = now()
    where environment = p_environment and event_id = p_event_id;
    return v_result;
  end if;

  if p_event_type = 'TRANSFER' then
    v_old_owner := nullif(p_payload #>> '{event,transferred_from,0}', '');
    v_new_owner := coalesce(
      nullif(p_payload #>> '{event,transferred_to,0}', ''),
      p_app_user_id
    );

    if v_old_owner is null or v_new_owner is null
      or nullif(btrim(p_subscription_lineage_id), '') is null then
      v_result := jsonb_build_object(
        'outcome', 'review',
        'reason', 'invalid_transfer',
        'userId', p_app_user_id
      );
      update public.billing_revenuecat_event_effects
      set outcome = 'review', result = v_result, processed_at = now(), updated_at = now()
      where environment = p_environment and event_id = p_event_id;
      return v_result;
    end if;

    perform subscription.id
    from public.billing_provider_subscriptions subscription
    where subscription.provider = 'revenuecat'
      and subscription.environment = p_environment
      and subscription.user_id in (v_old_owner, v_new_owner)
    order by subscription.user_id
    for update;

    select subscription.product_key,
           subscription.entitlement_key,
           subscription.cadence,
           subscription.provider_store,
           subscription.current_period_end
      into v_product_key, v_feature_key, v_cadence, v_store, p_expires_at
    from public.billing_provider_subscriptions subscription
    where subscription.provider = 'revenuecat'
      and subscription.environment = p_environment
      and subscription.provider_subscription_id = p_subscription_lineage_id
    for update;

    if v_product_key is null then
      v_result := jsonb_build_object(
        'outcome', 'review',
        'reason', 'transfer_subscription_not_found',
        'userId', v_new_owner
      );
      update public.billing_revenuecat_event_effects
      set outcome = 'review', result = v_result, processed_at = now(), updated_at = now()
      where environment = p_environment and event_id = p_event_id;
      return v_result;
    end if;

    update public.billing_provider_subscriptions
    set user_id = v_new_owner,
        provider_customer_id = v_new_owner,
        last_event_id = p_event_id,
        provider_updated_at = p_occurred_at,
        updated_at = now()
    where provider = 'revenuecat'
      and environment = p_environment
      and provider_subscription_id = p_subscription_lineage_id;

    if p_environment = 'live' then
      delete from public.billing_entitlement_grants
      where provider = 'revenuecat'
        and environment = p_environment
        and source_kind = 'subscription'
        and source_resource_id = p_subscription_lineage_id;

      if p_expires_at is null or p_expires_at > p_occurred_at then
        insert into public.billing_entitlement_grants (
          provider, environment, source_kind, source_resource_id, user_id,
          feature_key, valid_from, valid_until, status
        ) values (
          'revenuecat', p_environment, 'subscription', p_subscription_lineage_id,
          v_new_owner, v_feature_key, p_occurred_at, p_expires_at, 'active'
        );
      end if;
    end if;

    perform public.billing_refresh_paid_tier_projections(v_old_owner, p_occurred_at);
    perform public.billing_refresh_paid_tier_projections(v_new_owner, p_occurred_at);

    v_result := jsonb_build_object(
      'outcome', 'applied',
      'userId', v_new_owner,
      'previousUserId', v_old_owner,
      'tier', v_feature_key,
      'productKey', v_product_key
    );
    update public.billing_revenuecat_event_effects
    set user_id = v_new_owner, outcome = 'applied', result = v_result,
        processed_at = now(), updated_at = now()
    where environment = p_environment and event_id = p_event_id;
    return v_result;
  end if;

  if nullif(btrim(p_product_id), '') is null
    or nullif(btrim(p_subscription_lineage_id), '') is null then
    v_result := jsonb_build_object(
      'outcome', 'review',
      'reason', 'missing_product_or_lineage',
      'userId', p_app_user_id
    );
    update public.billing_revenuecat_event_effects
    set outcome = 'review', result = v_result, processed_at = now(), updated_at = now()
    where environment = p_environment and event_id = p_event_id;
    return v_result;
  end if;

  select binding.product_key,
         binding.entitlement_key,
         binding.cadence,
         binding.store
    into v_product_key, v_feature_key, v_cadence, v_store
  from public.billing_revenuecat_store_products binding
  where binding.environment = p_environment
    and binding.provider_product_id = p_product_id;

  if v_product_key is null then
    v_result := jsonb_build_object(
      'outcome', 'review',
      'reason', 'unknown_product',
      'productId', p_product_id,
      'userId', p_app_user_id
    );
    update public.billing_revenuecat_event_effects
    set outcome = 'review', result = v_result, processed_at = now(), updated_at = now()
    where environment = p_environment and event_id = p_event_id;
    return v_result;
  end if;

  select subscription.provider_updated_at
    into v_existing_updated_at
  from public.billing_provider_subscriptions subscription
  where subscription.provider = 'revenuecat'
    and subscription.environment = p_environment
    and subscription.provider_subscription_id = p_subscription_lineage_id
  for update;

  if v_existing_updated_at is not null and v_existing_updated_at > p_occurred_at then
    v_result := jsonb_build_object(
      'outcome', 'stale',
      'userId', p_app_user_id,
      'tier', v_feature_key,
      'productKey', v_product_key
    );
    update public.billing_revenuecat_event_effects
    set outcome = 'stale', result = v_result, processed_at = now(), updated_at = now()
    where environment = p_environment and event_id = p_event_id;
    return v_result;
  end if;

  v_grace_expires_at := case
    when coalesce(p_payload #>> '{event,grace_period_expiration_at_ms}', '') ~ '^[0-9]+$'
      then to_timestamp((p_payload #>> '{event,grace_period_expiration_at_ms}')::double precision / 1000.0)
    else null
  end;
  v_auto_resume_at := case
    when coalesce(p_payload #>> '{event,auto_resume_at_ms}', '') ~ '^[0-9]+$'
      then to_timestamp((p_payload #>> '{event,auto_resume_at_ms}')::double precision / 1000.0)
    else null
  end;
  v_valid_from := case
    when coalesce(p_payload #>> '{event,purchased_at_ms}', '') ~ '^[0-9]+$'
      then to_timestamp((p_payload #>> '{event,purchased_at_ms}')::double precision / 1000.0)
    else p_occurred_at
  end;

  if p_event_type = 'PRODUCT_CHANGE'
    and nullif(p_payload #>> '{event,new_product_id}', '') is not null then
    select binding.product_key, binding.cadence
      into v_scheduled_product_key, v_scheduled_cadence
    from public.billing_revenuecat_store_products binding
    where binding.environment = p_environment
      and binding.provider_product_id = p_payload #>> '{event,new_product_id}';
    v_scheduled_change_at := p_expires_at;
    if v_scheduled_product_key is null then
      v_result := jsonb_build_object(
        'outcome', 'review',
        'reason', 'unknown_replacement_product',
        'productId', p_payload #>> '{event,new_product_id}',
        'userId', p_app_user_id
      );
      update public.billing_revenuecat_event_effects
      set outcome = 'review', result = v_result, processed_at = now(), updated_at = now()
      where environment = p_environment and event_id = p_event_id;
      return v_result;
    end if;
  end if;

  v_status := case
    when p_event_type = 'CANCELLATION' then 'canceled'
    when p_event_type = 'BILLING_ISSUE' and v_grace_expires_at > p_occurred_at then 'grace_period'
    when p_event_type = 'BILLING_ISSUE' then 'account_hold'
    when p_event_type = 'SUBSCRIPTION_PAUSED' then 'paused'
    when p_event_type = 'EXPIRATION' then 'expired'
    when p_event_type = 'REFUND' then 'refunded'
    when p_event_type = 'PRICE_INCREASE_CONSENT_REQUIRED' then 'price_consent_required'
    else 'active'
  end;

  insert into public.billing_provider_subscriptions as subscription (
    provider,
    environment,
    provider_subscription_id,
    provider_customer_id,
    user_id,
    product_key,
    status,
    cadence,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    canceled_at,
    provider_updated_at,
    provider_store,
    entitlement_key,
    last_event_id,
    grace_period_expires_at,
    auto_resume_at,
    scheduled_product_key,
    scheduled_cadence,
    scheduled_change_at
  ) values (
    'revenuecat',
    p_environment,
    p_subscription_lineage_id,
    p_app_user_id,
    p_app_user_id,
    v_product_key,
    v_status,
    v_cadence,
    v_valid_from,
    p_expires_at,
    p_event_type = 'CANCELLATION',
    case when p_event_type in ('CANCELLATION', 'EXPIRATION', 'REFUND') then p_occurred_at else null end,
    p_occurred_at,
    v_store,
    v_feature_key,
    p_event_id,
    v_grace_expires_at,
    v_auto_resume_at,
    v_scheduled_product_key,
    v_scheduled_cadence,
    v_scheduled_change_at
  )
  on conflict (provider, environment, provider_subscription_id) do update
  set provider_customer_id = excluded.provider_customer_id,
      user_id = excluded.user_id,
      product_key = excluded.product_key,
      status = excluded.status,
      cadence = excluded.cadence,
      current_period_start = excluded.current_period_start,
      current_period_end = excluded.current_period_end,
      cancel_at_period_end = excluded.cancel_at_period_end,
      canceled_at = excluded.canceled_at,
      provider_updated_at = excluded.provider_updated_at,
      provider_store = excluded.provider_store,
      entitlement_key = excluded.entitlement_key,
      last_event_id = excluded.last_event_id,
      grace_period_expires_at = excluded.grace_period_expires_at,
      auto_resume_at = excluded.auto_resume_at,
      scheduled_product_key = case
        when p_event_type = 'PRODUCT_CHANGE' then excluded.scheduled_product_key
        when subscription.scheduled_product_key = excluded.product_key then null
        else subscription.scheduled_product_key
      end,
      scheduled_cadence = case
        when p_event_type = 'PRODUCT_CHANGE' then excluded.scheduled_cadence
        when subscription.scheduled_product_key = excluded.product_key then null
        else subscription.scheduled_cadence
      end,
      scheduled_change_at = case
        when p_event_type = 'PRODUCT_CHANGE' then excluded.scheduled_change_at
        when subscription.scheduled_product_key = excluded.product_key then null
        else subscription.scheduled_change_at
      end,
      updated_at = now();

  if p_environment = 'live' then
    delete from public.billing_entitlement_grants
    where provider = 'revenuecat'
      and environment = p_environment
      and source_kind = 'subscription'
      and source_resource_id = p_subscription_lineage_id;

    if v_status in ('active', 'canceled', 'grace_period', 'price_consent_required')
      and (p_expires_at is null or p_expires_at > p_occurred_at) then
      insert into public.billing_entitlement_grants (
        provider,
        environment,
        source_kind,
        source_resource_id,
        user_id,
        feature_key,
        valid_from,
        valid_until,
        status
      ) values (
        'revenuecat',
        p_environment,
        'subscription',
        p_subscription_lineage_id,
        p_app_user_id,
        v_feature_key,
        least(v_valid_from, p_occurred_at),
        p_expires_at,
        'active'
      );
    end if;
  end if;

  perform public.billing_refresh_paid_tier_projections(p_app_user_id, p_occurred_at);

  v_result := jsonb_build_object(
    'outcome', 'applied',
    'userId', p_app_user_id,
    'tier', v_feature_key,
    'productKey', v_product_key,
    'status', v_status,
    'transactionId', p_transaction_id
  );
  update public.billing_revenuecat_event_effects
  set outcome = 'applied', result = v_result, processed_at = now(), updated_at = now()
  where environment = p_environment and event_id = p_event_id;
  return v_result;
end;
$$;

alter table public.billing_revenuecat_store_products enable row level security;
alter table public.billing_revenuecat_event_effects enable row level security;

revoke all on table public.billing_revenuecat_store_products from public, anon, authenticated;
revoke all on table public.billing_revenuecat_event_effects from public, anon, authenticated;
grant select, insert, update, delete on table public.billing_revenuecat_store_products to service_role;
grant select, insert, update, delete on table public.billing_revenuecat_event_effects to service_role;

revoke all on function public.billing_refresh_paid_tier_projections(text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.billing_refresh_paid_tier_projections(text, timestamptz)
  to service_role;
revoke all on function public.billing_apply_revenuecat_subscription_event(
  text, text, text, text, text, text, text, timestamptz, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.billing_apply_revenuecat_subscription_event(
  text, text, text, text, text, text, text, timestamptz, timestamptz, jsonb
) to service_role;

commit;
