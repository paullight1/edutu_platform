begin;

-- Auto Apply push-only jobs use the same durable per-device receipts as
-- other application notices. Respect bounded retries after quiet hours.
create function private.notification_queue_can_retry(payload jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(payload #>> '{channels,inApp}', 'true') <> 'false'
    or (
      coalesce(payload #>> '{metadata,source}', '') in
        ('application-confirmation', 'application-status', 'auto-apply-action')
      and nullif(payload ->> 'dedupeKey', '') is not null
    );
$$;
revoke all on function private.notification_queue_can_retry(jsonb) from public, anon, authenticated;

create or replace function private.notification_queue_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
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
    v_retry_safe := private.notification_queue_can_retry(new.payload);
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
create or replace function public.recover_stale_notification_queue()
returns integer
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_recovered integer := 0;
begin
  with stale as (
    select q.id, q.attempt_count, q.max_attempts,
      private.notification_queue_can_retry(q.payload) as retry_safe
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
commit;
