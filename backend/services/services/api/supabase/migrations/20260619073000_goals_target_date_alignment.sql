-- Align goals with the backend API contract.
-- target_date is the canonical timestamp; deadline is kept as a legacy date alias.

alter table if exists public.goals
  add column if not exists target_date timestamp with time zone,
  add column if not exists priority text,
  add column if not exists source text default 'custom',
  add column if not exists template_id text,
  add column if not exists completed_at timestamp with time zone;

update public.goals
set target_date = deadline::timestamp with time zone
where target_date is null
  and deadline is not null;

create index if not exists goals_target_date_idx
  on public.goals (user_id, target_date);

create or replace function public.sync_goal_deadline_columns()
returns trigger as $$
begin
  if new.target_date is null and new.deadline is not null then
    new.target_date := new.deadline::timestamp with time zone;
  end if;

  if new.deadline is null and new.target_date is not null then
    new.deadline := new.target_date::date;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists sync_goal_deadline_columns on public.goals;
create trigger sync_goal_deadline_columns
before insert or update of deadline, target_date on public.goals
for each row
execute function public.sync_goal_deadline_columns();

create table if not exists public.milestones (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals on delete cascade,
  title text not null,
  completed boolean not null default false,
  "order" integer not null default 0,
  created_at timestamp with time zone not null default now()
);

create index if not exists milestones_goal_idx
  on public.milestones (goal_id, "order");
