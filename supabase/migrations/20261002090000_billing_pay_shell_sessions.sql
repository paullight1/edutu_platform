-- Server-only handoff authority. No bearer secrets are stored, only SHA-256 hashes.
begin;
create table if not exists public.billing_pay_shell_codes (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  user_id text not null,
  environment text not null check (environment in ('sandbox', 'live')),
  intent_id uuid references public.billing_checkout_intents(id) on delete cascade,
  destination text not null check (destination in ('checkout', 'account', 'result')),
  checkout_url text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((destination = 'checkout') = (checkout_url is not null)),
  check (destination = 'account' or intent_id is not null),
  check (checkout_url is null or checkout_url like 'https://checkout.bachs.io/%')
);
create table if not exists public.billing_pay_shell_sessions (
  session_hash text primary key check (session_hash ~ '^[0-9a-f]{64}$'),
  user_id text not null,
  environment text not null check (environment in ('sandbox', 'live')),
  intent_id uuid references public.billing_checkout_intents(id) on delete cascade,
  destination text not null check (destination in ('checkout', 'account', 'result')),
  checkout_url text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check ((destination = 'checkout') = (checkout_url is not null)),
  check (destination = 'account' or intent_id is not null)
);
create index if not exists billing_pay_shell_codes_expiry_idx on public.billing_pay_shell_codes(expires_at);
create index if not exists billing_pay_shell_sessions_expiry_idx on public.billing_pay_shell_sessions(expires_at);
alter table public.billing_pay_shell_codes enable row level security;
alter table public.billing_pay_shell_sessions enable row level security;
revoke all on public.billing_pay_shell_codes, public.billing_pay_shell_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.billing_pay_shell_codes, public.billing_pay_shell_sessions to service_role;

-- Fulfillment uses the immutable checkout snapshot. A catalog price change or
-- disable after checkout must not strand a provider-confirmed payment.
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
  v_intent public.billing_checkout_intents%rowtype;
  v_snapshot jsonb;
  v_validity_days integer;
  v_feature_key text;
  v_ledger_id uuid;
  v_valid_until timestamptz;
begin
  if p_checkout_intent_id is null then
    raise exception 'verified checkout intent is required';
  end if;

  select * into strict v_intent
  from public.billing_checkout_intents
  where id = p_checkout_intent_id
    and provider = p_provider
    and environment = p_environment
    and user_id = p_user_id
  for update;

  v_snapshot := v_intent.product_snapshot;
  v_validity_days := nullif(v_snapshot->>'validityDays', 'null')::integer;
  v_feature_key := case
    when p_product_key in ('lite_weekly_pass', 'lite_monthly_pass', 'lite_yearly_pass') then 'lite'
    when p_product_key in ('scholar_weekly_pass', 'scholar_monthly_pass', 'scholar_yearly_pass') then 'scholar'
    when p_product_key in ('pro_weekly_pass', 'pro_monthly_pass', 'pro_yearly_pass') then 'pro'
    else null
  end;

  if p_provider <> 'bachs'
     or p_environment not in ('sandbox', 'live')
     or v_snapshot->>'productKey' is distinct from p_product_key
     or v_snapshot->>'fulfillmentKind' <> 'pro'
     or v_snapshot->>'renewalMode' <> 'one_time'
     or v_snapshot->>'expectedAmountMinor' is distinct from p_amount_minor::text
     or upper(v_snapshot->>'currency') is distinct from upper(p_currency::text)
     or v_intent.expected_amount_minor is distinct from p_amount_minor
     or upper(v_intent.currency) is distinct from upper(p_currency::text)
     or v_validity_days is null or v_validity_days <= 0
     or v_feature_key is null
     or v_intent.status not in ('open', 'processing', 'paid') then
    raise exception 'checkout snapshot does not match one-time entitlement';
  end if;

  insert into public.billing_payment_ledger (
    provider, environment, provider_resource_id, checkout_intent_id,
    user_id, entry_kind, amount_minor, currency,
    customer_amount_minor, customer_currency, status, occurred_at, metadata
  ) values (
    p_provider, p_environment, p_provider_resource_id, p_checkout_intent_id,
    p_user_id, 'charge', p_amount_minor, upper(p_currency)::char(3),
    p_amount_minor, upper(p_currency)::char(3), 'succeeded', p_occurred_at,
    jsonb_build_object('product_key', p_product_key)
  )
  on conflict (provider, environment, provider_resource_id) do nothing
  returning id into v_ledger_id;

  if v_ledger_id is null then
    return jsonb_build_object('fulfilled', false, 'duplicate', true);
  end if;

  v_valid_until := p_occurred_at + make_interval(days => v_validity_days);
  insert into public.billing_entitlement_grants (
    provider, environment, source_kind, source_resource_id,
    user_id, feature_key, valid_from, valid_until, status
  ) values (
    p_provider, p_environment, 'payment', p_provider_resource_id,
    p_user_id, v_feature_key, p_occurred_at, v_valid_until, 'active'
  ) on conflict (
    provider, environment, source_kind, source_resource_id, feature_key
  ) do nothing;

  return jsonb_build_object(
    'fulfilled', true, 'ledger_id', v_ledger_id, 'valid_until', v_valid_until
  );
end;
$$;
revoke all on function public.billing_fulfill_one_time_purchase(
  text, text, text, text, text, bigint, char, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public.billing_fulfill_one_time_purchase(
  text, text, text, text, text, bigint, char, timestamptz, uuid
) to service_role;
commit;
