-- Task 6 follow-up: make digest claims lease-based and retryable after failure.

begin;

alter table public.weekly_digest_jobs
  add column if not exists status text,
  add column if not exists claim_token text default gen_random_uuid()::text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists attempt_count integer not null default 1,
  add column if not exists completed_at timestamptz,
  add column if not exists last_failed_at timestamptz;

-- Rows created by the original durable-claim migration must remain suppressed.
update public.weekly_digest_jobs
set status = 'succeeded',
    completed_at = coalesce(completed_at, claimed_at),
    claim_token = coalesce(claim_token, gen_random_uuid()::text)
where status is null;

alter table public.weekly_digest_jobs
  alter column status set default 'in_flight',
  alter column status set not null,
  alter column claim_token set not null,
  add constraint weekly_digest_jobs_status_check
    check (status in ('in_flight', 'succeeded', 'failed'));

drop function if exists public.claim_weekly_digest_job(integer, date);

create or replace function public.claim_weekly_digest_job(
  p_digest_day integer,
  p_execution_date date
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  existing public.weekly_digest_jobs%rowtype;
  new_claim_token text := gen_random_uuid()::text;
begin
  if p_digest_day is null or p_digest_day < 1 or p_digest_day > 7
    or p_execution_date is null then
    raise exception using
      errcode = '22023',
      message = 'Invalid weekly digest job key';
  end if;

  select * into existing
  from public.weekly_digest_jobs
  where digest_day = p_digest_day::smallint
    and execution_date = p_execution_date
  for update;

  if not found then
    insert into public.weekly_digest_jobs (
      digest_day,
      execution_date,
      status,
      claim_token,
      lease_expires_at,
      attempt_count,
      claimed_at,
      completed_at,
      last_failed_at
    ) values (
      p_digest_day::smallint,
      p_execution_date,
      'in_flight',
      new_claim_token,
      now() + interval '15 minutes',
      1,
      now(),
      null,
      null
    );
    return jsonb_build_object('claimed', true, 'claim_token', new_claim_token);
  end if;

  if existing.status = 'succeeded'
    or (existing.status = 'in_flight'
      and existing.lease_expires_at is not null
      and existing.lease_expires_at > now()) then
    return jsonb_build_object('claimed', false);
  end if;

  update public.weekly_digest_jobs
  set status = 'in_flight',
      claim_token = new_claim_token,
      lease_expires_at = now() + interval '15 minutes',
      attempt_count = existing.attempt_count + 1,
      claimed_at = now(),
      completed_at = null,
      last_failed_at = null
  where digest_day = p_digest_day::smallint
    and execution_date = p_execution_date;

  return jsonb_build_object('claimed', true, 'claim_token', new_claim_token);
end;
$$;

create or replace function public.complete_weekly_digest_job(
  p_digest_day integer,
  p_execution_date date,
  p_claim_token text
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  update public.weekly_digest_jobs
  set status = 'succeeded',
      lease_expires_at = null,
      completed_at = now()
  where digest_day = p_digest_day::smallint
    and execution_date = p_execution_date
    and status = 'in_flight'
    and claim_token = p_claim_token;
  return found;
end;
$$;

create or replace function public.fail_weekly_digest_job(
  p_digest_day integer,
  p_execution_date date,
  p_claim_token text
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  update public.weekly_digest_jobs
  set status = 'failed',
      lease_expires_at = now(),
      last_failed_at = now()
  where digest_day = p_digest_day::smallint
    and execution_date = p_execution_date
    and status = 'in_flight'
    and claim_token = p_claim_token;
  return found;
end;
$$;

revoke all on function public.claim_weekly_digest_job(integer, date)
from public, anon, authenticated;
revoke all on function public.complete_weekly_digest_job(integer, date, text)
from public, anon, authenticated;
revoke all on function public.fail_weekly_digest_job(integer, date, text)
from public, anon, authenticated;
grant execute on function public.claim_weekly_digest_job(integer, date)
to service_role;
grant execute on function public.complete_weekly_digest_job(integer, date, text)
to service_role;
grant execute on function public.fail_weekly_digest_job(integer, date, text)
to service_role;

commit;
