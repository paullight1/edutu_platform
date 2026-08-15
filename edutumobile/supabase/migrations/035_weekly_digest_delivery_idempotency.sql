-- Per-recipient delivery state prevents a retryable digest job from sending
-- successful recipients again after a later recipient fails.

begin;

create table if not exists public.weekly_digest_deliveries (
  digest_day smallint not null check (digest_day between 1 and 7),
  execution_date date not null,
  user_id text not null,
  status text not null default 'in_flight'
    check (status in ('in_flight', 'sent', 'skipped', 'failed')),
  claim_token text not null default gen_random_uuid()::text,
  lease_expires_at timestamptz not null default (now() + interval '15 minutes'),
  attempt_count integer not null default 1 check (attempt_count > 0),
  updated_at timestamptz not null default now(),
  primary key (digest_day, execution_date, user_id)
);

alter table public.weekly_digest_deliveries enable row level security;
revoke all on table public.weekly_digest_deliveries from public, anon, authenticated;
grant select, insert, update on table public.weekly_digest_deliveries to service_role;

create or replace function public.claim_weekly_digest_delivery(
  p_digest_day integer,
  p_execution_date date,
  p_user_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  existing public.weekly_digest_deliveries%rowtype;
  new_claim_token text := gen_random_uuid()::text;
begin
  if p_digest_day is null or p_digest_day < 1 or p_digest_day > 7
    or p_execution_date is null or p_user_id is null or p_user_id = '' then
    raise exception using errcode = '22023', message = 'Invalid digest delivery key';
  end if;

  insert into public.weekly_digest_deliveries (
    digest_day, execution_date, user_id, claim_token, lease_expires_at
  ) values (
    p_digest_day::smallint, p_execution_date, p_user_id,
    new_claim_token, now() + interval '15 minutes'
  ) on conflict (digest_day, execution_date, user_id) do nothing;

  select * into existing
  from public.weekly_digest_deliveries
  where digest_day = p_digest_day::smallint
    and execution_date = p_execution_date
    and user_id = p_user_id
  for update;

  if existing.claim_token = new_claim_token then
    return jsonb_build_object('claimed', true, 'claim_token', new_claim_token);
  end if;

  if existing.status in ('sent', 'skipped')
    or (existing.status = 'in_flight' and existing.lease_expires_at > now()) then
    return jsonb_build_object('claimed', false, 'status', existing.status);
  end if;

  update public.weekly_digest_deliveries
  set status = 'in_flight',
      claim_token = new_claim_token,
      lease_expires_at = now() + interval '15 minutes',
      attempt_count = existing.attempt_count + 1,
      updated_at = now()
  where digest_day = p_digest_day::smallint
    and execution_date = p_execution_date
    and user_id = p_user_id;

  return jsonb_build_object('claimed', true, 'claim_token', new_claim_token);
end;
$$;

create or replace function public.complete_weekly_digest_delivery(
  p_digest_day integer,
  p_execution_date date,
  p_user_id text,
  p_claim_token text,
  p_status text
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if p_status not in ('sent', 'skipped') then
    raise exception using errcode = '22023', message = 'Invalid digest delivery status';
  end if;
  update public.weekly_digest_deliveries
  set status = p_status,
      lease_expires_at = now(),
      updated_at = now()
  where digest_day = p_digest_day::smallint
    and execution_date = p_execution_date
    and user_id = p_user_id
    and status = 'in_flight'
    and claim_token = p_claim_token
    and lease_expires_at > now();
  return found;
end;
$$;

create or replace function public.fail_weekly_digest_delivery(
  p_digest_day integer,
  p_execution_date date,
  p_user_id text,
  p_claim_token text
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  update public.weekly_digest_deliveries
  set status = 'failed', lease_expires_at = now(), updated_at = now()
  where digest_day = p_digest_day::smallint
    and execution_date = p_execution_date
    and user_id = p_user_id
    and status = 'in_flight'
    and claim_token = p_claim_token
    and lease_expires_at > now();
  return found;
end;
$$;

revoke all on function public.claim_weekly_digest_delivery(integer, date, text)
from public, anon, authenticated;
revoke all on function public.complete_weekly_digest_delivery(integer, date, text, text, text)
from public, anon, authenticated;
revoke all on function public.fail_weekly_digest_delivery(integer, date, text, text)
from public, anon, authenticated;
grant execute on function public.claim_weekly_digest_delivery(integer, date, text) to service_role;
grant execute on function public.complete_weekly_digest_delivery(integer, date, text, text, text) to service_role;
grant execute on function public.fail_weekly_digest_delivery(integer, date, text, text) to service_role;

commit;
