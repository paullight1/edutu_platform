-- Task 6: one durable claim per digest weekday and UTC execution date.
-- The service-role-only RPC makes the claim atomic before any recipient or
-- email work begins. A claimed row is intentionally durable: retries must not
-- resend a partially delivered digest without an operator-reviewed recovery.

begin;

create table if not exists public.weekly_digest_jobs (
  digest_day smallint not null check (digest_day between 1 and 7),
  execution_date date not null,
  claimed_at timestamptz not null default now(),
  primary key (digest_day, execution_date)
);

alter table public.weekly_digest_jobs enable row level security;

revoke all on table public.weekly_digest_jobs from public, anon, authenticated;
grant select, insert, update on table public.weekly_digest_jobs to service_role;

drop policy if exists "service role manages weekly digest jobs"
on public.weekly_digest_jobs;
create policy "service role manages weekly digest jobs"
  on public.weekly_digest_jobs
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.claim_weekly_digest_job(
  p_digest_day integer,
  p_execution_date date
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if p_digest_day is null or p_digest_day < 1 or p_digest_day > 7
    or p_execution_date is null then
    raise exception using
      errcode = '22023',
      message = 'Invalid weekly digest job key';
  end if;

  insert into public.weekly_digest_jobs (digest_day, execution_date)
  values (p_digest_day::smallint, p_execution_date)
  on conflict (digest_day, execution_date) do nothing;

  return found;
end;
$$;

revoke all on function public.claim_weekly_digest_job(integer, date)
from public, anon, authenticated;
grant execute on function public.claim_weekly_digest_job(integer, date)
to service_role;

commit;
