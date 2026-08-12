-- Retry-safe fulfillment primitives. Provider payloads must be authenticated
-- and validated by the server before these service-role-only functions run.

begin;

create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  type text not null,
  amount integer not null,
  description text,
  related_id text,
  related_type text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Legacy installations may have used UUID profile keys. Preserve the exact
-- existing value as text; identity reconciliation is handled by aliases.
alter table public.credit_transactions alter column user_id type text using user_id::text;

create index if not exists billing_credit_transactions_resource_idx
  on public.credit_transactions (related_type, related_id)
  where related_id is not null;
create unique index if not exists billing_credit_transactions_purchase_unique
  on public.credit_transactions (related_type, related_id)
  where related_type = 'billing_credit_pack' and related_id is not null;

create or replace function public.billing_fulfill_one_time_purchase(
  p_provider text,
  p_environment text,
  p_provider_resource_id text,
  p_user_id text,
  p_product_key text,
  p_amount_minor bigint,
  p_currency char(3),
  p_occurred_at timestamptz,
  p_checkout_intent_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.billing_products%rowtype;
  v_ledger_id uuid;
  v_valid_until timestamptz;
begin
  select * into strict v_product
  from public.billing_products
  where product_key = p_product_key
    and enabled
  for share;

  if v_product.fulfillment_kind not in ('season_pass', 'one_time_pass')
     or v_product.renewal_mode <> 'one_time'
     or v_product.feature_key is null
     or v_product.entitlement_duration is null then
    raise exception 'product % is not a fulfillable one-time entitlement', p_product_key;
  end if;

  if v_product.expected_amount_minor is distinct from p_amount_minor
     or v_product.currency is distinct from upper(p_currency)::char(3) then
    raise exception 'provider amount or currency does not match product %', p_product_key;
  end if;

  insert into public.billing_payment_ledger (
    provider,
    environment,
    provider_resource_id,
    checkout_intent_id,
    user_id,
    entry_kind,
    amount_minor,
    currency,
    customer_amount_minor,
    customer_currency,
    status,
    occurred_at,
    metadata
  ) values (
    p_provider,
    p_environment,
    p_provider_resource_id,
    p_checkout_intent_id,
    p_user_id,
    'charge',
    p_amount_minor,
    upper(p_currency)::char(3),
    p_amount_minor,
    upper(p_currency)::char(3),
    'succeeded',
    p_occurred_at,
    jsonb_build_object('product_key', p_product_key)
  )
  on conflict (provider, environment, provider_resource_id) do nothing
  returning id into v_ledger_id;

  if v_ledger_id is null then
    return jsonb_build_object('fulfilled', false, 'duplicate', true);
  end if;

  v_valid_until := p_occurred_at + v_product.entitlement_duration;

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
    p_provider,
    p_environment,
    'payment',
    p_provider_resource_id,
    p_user_id,
    v_product.feature_key,
    p_occurred_at,
    v_valid_until,
    'active'
  )
  on conflict (
    provider,
    environment,
    source_kind,
    source_resource_id,
    feature_key
  ) do nothing;

  return jsonb_build_object(
    'fulfilled', true,
    'ledger_id', v_ledger_id,
    'valid_until', v_valid_until
  );
end;
$$;

create or replace function public.billing_fulfill_credit_pack(
  p_provider text,
  p_environment text,
  p_provider_resource_id text,
  p_user_id text,
  p_product_key text,
  p_amount_minor bigint,
  p_currency char(3),
  p_occurred_at timestamptz,
  p_checkout_intent_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.billing_products%rowtype;
  v_ledger_id uuid;
  v_credit_transaction_id uuid;
begin
  select * into strict v_product
  from public.billing_products
  where product_key = p_product_key
    and enabled
  for share;

  if v_product.fulfillment_kind <> 'credit_pack'
     or v_product.credit_quantity <= 0
     or v_product.renewal_mode <> 'one_time' then
    raise exception 'product % is not a fulfillable credit pack', p_product_key;
  end if;

  if v_product.expected_amount_minor is distinct from p_amount_minor
     or v_product.currency is distinct from upper(p_currency)::char(3) then
    raise exception 'provider amount or currency does not match product %', p_product_key;
  end if;

  insert into public.billing_payment_ledger (
    provider,
    environment,
    provider_resource_id,
    checkout_intent_id,
    user_id,
    entry_kind,
    amount_minor,
    currency,
    customer_amount_minor,
    customer_currency,
    status,
    occurred_at,
    metadata
  ) values (
    p_provider,
    p_environment,
    p_provider_resource_id,
    p_checkout_intent_id,
    p_user_id,
    'charge',
    p_amount_minor,
    upper(p_currency)::char(3),
    p_amount_minor,
    upper(p_currency)::char(3),
    'succeeded',
    p_occurred_at,
    jsonb_build_object(
      'product_key', p_product_key,
      'credit_quantity', v_product.credit_quantity
    )
  )
  on conflict (provider, environment, provider_resource_id) do nothing
  returning id into v_ledger_id;

  if v_ledger_id is null then
    return jsonb_build_object('fulfilled', false, 'duplicate', true);
  end if;

  insert into public.credit_transactions (
    user_id,
    amount,
    type,
    description,
    related_id,
    related_type,
    metadata
  ) values (
    p_user_id,
    v_product.credit_quantity,
    'purchase',
    'Billing credit pack',
    p_provider_resource_id,
    'billing_credit_pack',
    jsonb_build_object(
      'provider', p_provider,
      'environment', p_environment,
      'product_key', p_product_key
    )
  )
  returning id into v_credit_transaction_id;

  if to_regclass('public.profiles') is null then
    raise exception 'profiles table does not exist';
  elsif exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = to_regclass('public.profiles')
      and attname = 'credits_balance'
      and not attisdropped
  ) then
    update public.profiles
    set credits_balance = coalesce(credits_balance, 0) + v_product.credit_quantity
    where user_id::text = p_user_id;
  elsif exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = to_regclass('public.profiles')
      and attname = 'credits'
      and not attisdropped
  ) then
    update public.profiles
    set credits = coalesce(credits, 0) + v_product.credit_quantity
    where user_id::text = p_user_id;
  else
    raise exception 'profiles has no recognized credit balance column';
  end if;

  if not found then
    raise exception 'billing profile % does not exist', p_user_id;
  end if;

  return jsonb_build_object(
    'fulfilled', true,
    'ledger_id', v_ledger_id,
    'credit_transaction_id', v_credit_transaction_id,
    'credit_quantity', v_product.credit_quantity
  );
end;
$$;

revoke all on function public.billing_fulfill_one_time_purchase(
  text, text, text, text, text, bigint, char, timestamptz, uuid
) from public, anon, authenticated;
revoke all on function public.billing_fulfill_credit_pack(
  text, text, text, text, text, bigint, char, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public.billing_fulfill_one_time_purchase(
  text, text, text, text, text, bigint, char, timestamptz, uuid
) to service_role;
grant execute on function public.billing_fulfill_credit_pack(
  text, text, text, text, text, bigint, char, timestamptz, uuid
) to service_role;

commit;
