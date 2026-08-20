begin;

alter table public.notification_queue
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists locked_at timestamptz,
  add column if not exists last_error text,
  add column if not exists dead_lettered_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'notification_queue_attempt_count_nonnegative'
      and conrelid = 'public.notification_queue'::regclass
  ) then
    alter table public.notification_queue
      add constraint notification_queue_attempt_count_nonnegative
      check (attempt_count >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'notification_queue_max_attempts_bounded'
      and conrelid = 'public.notification_queue'::regclass
  ) then
    alter table public.notification_queue
      add constraint notification_queue_max_attempts_bounded
      check (max_attempts between 1 and 10);
  end if;
end
$$;

alter table public.notification_queue
  drop constraint if exists notification_queue_status_check;
alter table public.notification_queue
  add constraint notification_queue_status_check
  check (status in ('pending', 'processing', 'completed', 'failed', 'sent', 'dead_letter'));

create index if not exists notification_queue_pending_schedule_idx
  on public.notification_queue (scheduled_for, id)
  where status = 'pending';
create index if not exists notification_queue_processing_lease_idx
  on public.notification_queue (locked_at, id)
  where status = 'processing';
create index if not exists notification_queue_dead_letter_idx
  on public.notification_queue (dead_lettered_at desc, id)
  where status = 'dead_letter';

create or replace function private.notification_queue_retry_delay(p_attempt_count integer)
returns interval
language sql
immutable
set search_path = ''
as $$
  select make_interval(
    secs => least(
      900,
      60 * power(2, greatest(0, least(coalesce(p_attempt_count, 1) - 1, 4)))::integer
    )
  );
$$;
revoke all on function private.notification_queue_retry_delay(integer) from public;
revoke all on function private.notification_queue_retry_delay(integer) from anon;
revoke all on function private.notification_queue_retry_delay(integer) from authenticated;

create or replace function private.notification_queue_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next_attempt integer;
  v_retry_safe boolean;
  v_error text;
begin
  if tg_op = 'INSERT' then
    if coalesce(new.payload #>> '{channels,inApp}', 'true') <> 'false'
       and nullif(new.payload ->> 'dedupeKey', '') is null then
      new.payload := jsonb_set(
        new.payload,
        '{dedupeKey}',
        to_jsonb('notification-queue:' || new.id::text),
        true
      );
    end if;
    return new;
  end if;

  if new.status = 'processing' and old.status = 'pending' then
    new.locked_at := now();
    new.processed_at := null;
    new.dead_lettered_at := null;
    return new;
  end if;

  if new.status = 'failed' and old.status = 'processing' then
    v_next_attempt := old.attempt_count + 1;
    v_retry_safe := coalesce(new.payload #>> '{channels,inApp}', 'true') <> 'false';
    v_error := left(coalesce(new.result ->> 'error', 'Notification queue delivery failed'), 1000);
    new.attempt_count := v_next_attempt;
    new.last_error := v_error;
    new.locked_at := null;

    if v_retry_safe and v_next_attempt < new.max_attempts then
      new.status := 'pending';
      new.scheduled_for := now() + private.notification_queue_retry_delay(v_next_attempt);
      new.processed_at := null;
      new.dead_lettered_at := null;
      new.result := coalesce(new.result, '{}'::jsonb) || jsonb_build_object(
        'attempt', v_next_attempt,
        'retryScheduledFor', new.scheduled_for
      );
    else
      new.status := 'dead_letter';
      new.processed_at := coalesce(new.processed_at, now());
      new.dead_lettered_at := now();
      new.result := coalesce(new.result, '{}'::jsonb) || jsonb_build_object(
        'attempt', v_next_attempt,
        'terminal', true
      );
    end if;
    return new;
  end if;

  if new.status in ('completed', 'sent', 'dead_letter') then
    new.locked_at := null;
  end if;
  return new;
end;
$$;
revoke all on function private.notification_queue_lifecycle() from public;
revoke all on function private.notification_queue_lifecycle() from anon;
revoke all on function private.notification_queue_lifecycle() from authenticated;

drop trigger if exists notification_queue_lifecycle on public.notification_queue;
create trigger notification_queue_lifecycle
before insert or update of status on public.notification_queue
for each row execute function private.notification_queue_lifecycle();

update public.notification_queue
set status = 'dead_letter',
    attempt_count = greatest(attempt_count, 1),
    last_error = left(coalesce(result ->> 'error', 'Historical queue failure'), 1000),
    dead_lettered_at = coalesce(processed_at, now()),
    locked_at = null
where status = 'failed';

create or replace function public.recover_stale_notification_queue()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recovered integer := 0;
begin
  with stale as (
    select q.id, q.attempt_count, q.max_attempts,
      coalesce(q.payload #>> '{channels,inApp}', 'true') <> 'false' as retry_safe
    from public.notification_queue q
    where q.status = 'processing'
      and q.locked_at is not null
      and q.locked_at < now() - interval '15 minutes'
    for update skip locked
  ), updated as (
    update public.notification_queue q
    set attempt_count = stale.attempt_count + 1,
        last_error = 'Processing lease expired before completion',
        locked_at = null,
        status = case
          when stale.retry_safe and stale.attempt_count + 1 < stale.max_attempts then 'pending'
          else 'dead_letter'
        end,
        scheduled_for = case
          when stale.retry_safe and stale.attempt_count + 1 < stale.max_attempts
          then now() + private.notification_queue_retry_delay(stale.attempt_count + 1)
          else q.scheduled_for
        end,
        processed_at = case
          when stale.retry_safe and stale.attempt_count + 1 < stale.max_attempts then null
          else now()
        end,
        dead_lettered_at = case
          when stale.retry_safe and stale.attempt_count + 1 < stale.max_attempts then null
          else now()
        end,
        result = coalesce(q.result, '{}'::jsonb) || jsonb_build_object(
          'error', 'Processing lease expired before completion',
          'recoveredAt', now(),
          'attempt', stale.attempt_count + 1
        )
    from stale
    where q.id = stale.id
    returning q.id
  )
  select count(*)::integer into v_recovered from updated;
  return v_recovered;
end;
$$;
revoke all on function public.recover_stale_notification_queue() from public;
revoke all on function public.recover_stale_notification_queue() from anon;
revoke all on function public.recover_stale_notification_queue() from authenticated;
grant execute on function public.recover_stale_notification_queue() to service_role;

revoke all on table public.notification_queue from anon;
revoke all on table public.notification_queue from authenticated;
grant select, insert, update, delete on table public.notification_queue to service_role;

commit;
