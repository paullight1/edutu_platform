begin;

create table if not exists public.application_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.opportunity_applications(id) on delete cascade,
  user_id text not null,
  event_type text not null check (event_type in ('created','status_change','reflection','note','interview')),
  previous_status text,
  next_status text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  actor_user_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists application_history_user_created_idx
  on public.application_history(user_id, created_at desc);
create index if not exists application_history_application_created_idx
  on public.application_history(application_id, created_at asc);

alter table public.application_history enable row level security;

drop policy if exists "Users read own application history" on public.application_history;
create policy "Users read own application history"
  on public.application_history
  for select
  to authenticated
  using (((select auth.jwt()) ->> 'sub') = user_id);

revoke insert, update, delete on public.application_history from anon, authenticated;
grant select on public.application_history to authenticated;
grant select, insert, update, delete on public.application_history to service_role;

create or replace function public.record_application_status_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.application_history (
      application_id, user_id, event_type, previous_status, next_status,
      actor_user_id, created_at
    ) values (
      new.id, new.user_id, 'created', null, new.status,
      new.user_id, coalesce(new.created_at, now())
    );
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.application_history (
      application_id, user_id, event_type, previous_status, next_status,
      actor_user_id, created_at
    ) values (
      new.id, new.user_id, 'status_change', old.status, new.status,
      new.user_id, now()
    );
  end if;

  return new;
end;
$$;

revoke all on function public.record_application_status_history() from public, anon, authenticated;
grant execute on function public.record_application_status_history() to service_role;

drop trigger if exists opportunity_applications_history_trigger on public.opportunity_applications;
create trigger opportunity_applications_history_trigger
after insert or update of status on public.opportunity_applications
for each row execute function public.record_application_status_history();

commit;
