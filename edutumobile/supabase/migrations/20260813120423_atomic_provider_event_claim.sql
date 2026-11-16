-- Task 8: atomically lease RevenueCat provider events.
--
-- The webhook must never use a read-then-update claim. The unique provider /
-- environment / event identity is the inbox key; these service-role-only RPCs
-- atomically acquire a lease and require its random token for every terminal
-- transition. Downstream fulfillment remains independently idempotent.

begin;

alter table public.billing_provider_events
  add column if not exists user_id text,
  add column if not exists claim_token text,
  add column if not exists lease_expires_at timestamptz;

-- Existing receipts predate leases. Terminal receipts remain terminal; every
-- non-terminal receipt is immediately eligible for one safe retry.
update public.billing_provider_events
set claim_token = coalesce(claim_token, gen_random_uuid()::text),
    lease_expires_at = case
      when status = 'processed' or processed_at is not null then null
      else coalesce(lease_expires_at, now())
    end
where claim_token is null or (status <> 'processed' and lease_expires_at is null);

alter table public.billing_provider_events
  alter column claim_token set default gen_random_uuid()::text,
  alter column claim_token set not null;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'billing_provider_events_provider_environment_event_id_key'
      and conrelid = 'public.billing_provider_events'::regclass
  ) then
    alter table public.billing_provider_events
      add constraint billing_provider_events_provider_environment_event_id_key
      unique (provider, environment, event_id);
  end if;
end;
$$;

create or replace function public.claim_billing_provider_event(
  p_provider text,
  p_environment text,
  p_event_id text,
  p_event_type text,
  p_user_id text,
  p_payload_hash text,
  p_raw_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  new_claim_token text := gen_random_uuid()::text;
begin
  if p_provider is null or p_provider = ''
    or p_environment is null or p_environment = ''
    or p_event_id is null or p_event_id = ''
    or p_event_type is null or p_event_type = ''
    or p_user_id is null or p_user_id = ''
    or p_payload_hash is null or p_payload_hash = '' then
    raise exception using
      errcode = '22023',
      message = 'Invalid provider event claim';
  end if;

  insert into public.billing_provider_events (
    provider,
    environment,
    event_id,
    event_type,
    user_id,
    status,
    attempt_count,
    payload_hash,
    raw_payload,
    claim_token,
    lease_expires_at,
    processed_at,
    last_error,
    next_retry_at,
    updated_at
  ) values (
    p_provider,
    p_environment,
    p_event_id,
    p_event_type,
    p_user_id,
    'processing',
    1,
    p_payload_hash,
    p_raw_payload,
    new_claim_token,
    now() + interval '15 minutes',
    null,
    null,
    null,
    now()
  )
  on conflict (provider, environment, event_id) do update
  set status = 'processing',
      claim_token = new_claim_token,
      lease_expires_at = now() + interval '15 minutes',
      attempt_count = public.billing_provider_events.attempt_count + 1,
      processed_at = null,
      last_error = null,
      next_retry_at = null,
      updated_at = now()
  where public.billing_provider_events.processed_at is null
    and public.billing_provider_events.status <> 'processed'
    and (
      public.billing_provider_events.status in ('received', 'failed')
      or (
        public.billing_provider_events.status = 'processing'
        and public.billing_provider_events.lease_expires_at <= now()
      )
    )
    and (
      public.billing_provider_events.next_retry_at is null
      or public.billing_provider_events.next_retry_at <= now()
    )
  returning claim_token into new_claim_token;

  if found then
    return jsonb_build_object(
      'claimed', true,
      'claim_token', new_claim_token
    );
  end if;

  return jsonb_build_object('claimed', false);
end;
$$;

create or replace function public.complete_billing_provider_event(
  p_provider text,
  p_environment text,
  p_event_id text,
  p_claim_token text
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  update public.billing_provider_events
  set status = 'processed',
      processed_at = now(),
      claim_token = p_claim_token,
      lease_expires_at = null,
      last_error = null,
      next_retry_at = null,
      updated_at = now()
  where provider = p_provider
    and environment = p_environment
    and event_id = p_event_id
    and status = 'processing'
    and claim_token = p_claim_token
    and lease_expires_at > now();
  return found;
end;
$$;

create or replace function public.fail_billing_provider_event(
  p_provider text,
  p_environment text,
  p_event_id text,
  p_claim_token text,
  p_error text
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  update public.billing_provider_events
  set status = 'failed',
      lease_expires_at = now(),
      last_error = left(coalesce(p_error, 'Webhook processing failed'), 500),
      next_retry_at = now(),
      updated_at = now()
  where provider = p_provider
    and environment = p_environment
    and event_id = p_event_id
    and status = 'processing'
    and claim_token = p_claim_token
    and lease_expires_at > now();
  return found;
end;
$$;

revoke all on table public.billing_provider_events from public, anon, authenticated;
grant select, insert, update, delete on table public.billing_provider_events
to service_role;

revoke all on function public.claim_billing_provider_event(
  text, text, text, text, text, text, jsonb
) from public, anon, authenticated;
revoke all on function public.complete_billing_provider_event(
  text, text, text, text
) from public, anon, authenticated;
revoke all on function public.fail_billing_provider_event(
  text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.claim_billing_provider_event(
  text, text, text, text, text, text, jsonb
) to service_role;
grant execute on function public.complete_billing_provider_event(
  text, text, text, text
) to service_role;
grant execute on function public.fail_billing_provider_event(
  text, text, text, text, text
) to service_role;

commit;
