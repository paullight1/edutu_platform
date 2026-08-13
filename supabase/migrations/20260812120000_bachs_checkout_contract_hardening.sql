-- Checkout schema hardening for the canonical provider-neutral billing core.
--
-- Deploy-safe catalog policy: the canonical Bachs product keys are complete
-- enough to validate fulfillment, but remain disabled and unmapped until a
-- release supplies verified provider IDs, prices, and currencies. This
-- migration never enables Bachs collection.

begin;

-- Complete the immutable catalog shape without replacing an already configured
-- catalog row. A configured product (enabled or mapped) is a deployment-owned
-- value and is left untouched.
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
  ('pro_weekly_pass', 'one_time_pass', 'pro', 'one_time', '{"allowed_methods":["card","bank_transfer","mobile_money","crypto"]}'::jsonb, null, null, 'weekly', interval '7 days', 0, false, 1),
  ('pro_monthly_pass', 'one_time_pass', 'pro', 'one_time', '{"allowed_methods":["card","bank_transfer","mobile_money","crypto"]}'::jsonb, null, null, 'monthly', interval '31 days', 0, false, 1),
  ('pro_yearly_pass', 'one_time_pass', 'pro', 'one_time', '{"allowed_methods":["card","bank_transfer","mobile_money","crypto"]}'::jsonb, null, null, 'yearly', interval '366 days', 0, false, 1),
  ('pro_weekly_recurring', 'subscription', 'pro', 'recurring', '{"allowed_methods":["card"],"allowed_currencies":["USD"]}'::jsonb, null, 'USD', 'weekly', null, 0, false, 1),
  ('pro_monthly_recurring', 'subscription', 'pro', 'recurring', '{"allowed_methods":["card"],"allowed_currencies":["USD"]}'::jsonb, null, 'USD', 'monthly', null, 0, false, 1),
  ('pro_yearly_recurring', 'subscription', 'pro', 'recurring', '{"allowed_methods":["card"],"allowed_currencies":["USD"]}'::jsonb, null, 'USD', 'yearly', null, 0, false, 1),
  ('season_pass', 'season_pass', 'pro', 'one_time', '{"allowed_methods":["card","bank_transfer","mobile_money","crypto"]}'::jsonb, null, null, 'season', interval '90 days', 0, false, 1),
  ('credits_100', 'credit_pack', null, 'one_time', '{"allowed_methods":["card","bank_transfer","mobile_money","crypto"]}'::jsonb, null, null, 'one_time', null, 100, false, 1),
  ('credits_250', 'credit_pack', null, 'one_time', '{"allowed_methods":["card","bank_transfer","mobile_money","crypto"]}'::jsonb, null, null, 'one_time', null, 250, false, 1),
  ('credits_700', 'credit_pack', null, 'one_time', '{"allowed_methods":["card","bank_transfer","mobile_money","crypto"]}'::jsonb, null, null, 'one_time', null, 700, false, 1)
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
    enabled = false,
    catalog_version = greatest(product.catalog_version, excluded.catalog_version),
    updated_at = now()
where product.enabled = false
  and not exists (
    select 1
    from public.billing_product_provider_mappings mapping
    where mapping.product_key = product.product_key
  );

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'billing_products_fulfillment_kind_check'
      and conrelid = 'public.billing_products'::regclass
  ) then
    alter table public.billing_products
      add constraint billing_products_fulfillment_kind_check
      check (fulfillment_kind in ('one_time_pass', 'subscription', 'season_pass', 'credit_pack')) not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'billing_products_fulfillment_contract_check'
      and conrelid = 'public.billing_products'::regclass
  ) then
    alter table public.billing_products
      add constraint billing_products_fulfillment_contract_check
      check (
        (fulfillment_kind = 'one_time_pass'
          and feature_key is not null
          and renewal_mode = 'one_time'
          and entitlement_duration is not null
          and credit_quantity = 0)
        or (fulfillment_kind = 'subscription'
          and feature_key is not null
          and renewal_mode = 'recurring'
          and credit_quantity = 0)
        or (fulfillment_kind = 'season_pass'
          and feature_key is not null
          and renewal_mode = 'one_time'
          and entitlement_duration is not null
          and credit_quantity = 0)
        or (fulfillment_kind = 'credit_pack'
          and feature_key is null
          and renewal_mode = 'one_time'
          and entitlement_duration is null
          and credit_quantity > 0)
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'billing_products_payment_policy_check'
      and conrelid = 'public.billing_products'::regclass
  ) then
    alter table public.billing_products
      add constraint billing_products_payment_policy_check
      check (
        jsonb_typeof(payment_method_policy) = 'object'
        and (
          not payment_method_policy ? 'allowed_methods'
          or (
            jsonb_typeof(payment_method_policy->'allowed_methods') = 'array'
            and jsonb_array_length(payment_method_policy->'allowed_methods') > 0
          )
        )
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'billing_products_enabled_price_check'
      and conrelid = 'public.billing_products'::regclass
  ) then
    alter table public.billing_products
      add constraint billing_products_enabled_price_check
      check (
        not enabled
        or (
          expected_amount_minor is not null
          and expected_amount_minor > 0
          and currency is not null
          and jsonb_typeof(payment_method_policy->'allowed_methods') = 'array'
          and jsonb_array_length(payment_method_policy->'allowed_methods') > 0
        )
      ) not valid;
  end if;
end;
$$;

alter table public.billing_checkout_intents
  add column if not exists return_surface text,
  add column if not exists provider_checkout_url_hash text,
  add column if not exists failure_code text;

update public.billing_checkout_intents
set return_surface = 'web'
where return_surface is null;

alter table public.billing_checkout_intents
  alter column return_surface set not null;

alter table public.billing_checkout_intents
  drop constraint if exists billing_checkout_intents_user_id_idempotency_key_key;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'billing_checkout_intents_provider_environment_user_idempotency_key'
      and conrelid = 'public.billing_checkout_intents'::regclass
  ) then
    alter table public.billing_checkout_intents
      add constraint billing_checkout_intents_provider_environment_user_idempotency_key
      unique (provider, environment, user_id, idempotency_key);
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

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'billing_checkout_intents_status_check'
      and conrelid = 'public.billing_checkout_intents'::regclass
  ) then
    alter table public.billing_checkout_intents
      add constraint billing_checkout_intents_status_check
      check (status in (
        'creating', 'open', 'provider_failed', 'paid', 'fulfilled', 'failed',
        'cancelled', 'expired', 'underpaid', 'review_required', 'processing'
      )) not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'billing_checkout_intents_product_provider_environment_fkey'
      and conrelid = 'public.billing_checkout_intents'::regclass
  ) then
    alter table public.billing_checkout_intents
      add constraint billing_checkout_intents_product_provider_environment_fkey
      foreign key (product_key, provider, environment)
      references public.billing_product_provider_mappings (product_key, provider, environment)
      not valid;
  end if;
end;
$$;

create index if not exists billing_checkout_intents_provider_environment_status_expires_idx
  on public.billing_checkout_intents (provider, environment, status, expires_at);

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'billing_provider_events_status_check'
      and conrelid = 'public.billing_provider_events'::regclass
  ) then
    alter table public.billing_provider_events
      add constraint billing_provider_events_status_check
      check (status in ('received', 'processing', 'processed', 'failed', 'dead_letter', 'review')) not valid;
  end if;
end;
$$;

create index if not exists billing_events_provider_environment_retry_idx
  on public.billing_provider_events (provider, environment, status, next_retry_at)
  where processed_at is null and status in ('received', 'failed');
create index if not exists billing_events_raw_payload_expiry_idx
  on public.billing_provider_events (raw_payload_expires_at)
  where raw_payload is not null;

commit;
