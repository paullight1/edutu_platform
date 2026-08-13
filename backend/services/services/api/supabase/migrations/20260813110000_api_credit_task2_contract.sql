-- Task 2 forward repair: enforce the canonical API credit invariant and expose
-- a service-role-only audit view. This is safe for fresh installs and for
-- databases that already applied the Task 1 credit contract migration.

begin;

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'public.profiles is required before the Task 2 API credit contract';
  end if;
end;
$$;

alter table public.profiles add column if not exists credits integer;
update public.profiles set credits = 0 where credits is null;
alter table public.profiles alter column credits set default 0;
alter table public.profiles alter column credits set not null;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'profiles_credits_nonnegative_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_credits_nonnegative_check
      check (credits >= 0) not valid;
  end if;
end;
$$;

alter table public.profiles
  validate constraint profiles_credits_nonnegative_check;

create or replace view public.api_credit_balance_integrity_audit as
select user_id::text as user_id, credits
from public.profiles
where credits is null or credits < 0;

revoke all on public.api_credit_balance_integrity_audit
  from public, anon, authenticated;
grant select on public.api_credit_balance_integrity_audit to service_role;

comment on column public.profiles.credits is
  'Canonical non-expiring Edutu credit balance; API metering and purchases use this column.';

commit;
