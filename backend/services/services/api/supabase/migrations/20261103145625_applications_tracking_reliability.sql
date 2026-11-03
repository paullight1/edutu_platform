begin;
set local lock_timeout = '5s';

-- This table predates the API migration tree. Include its compatible baseline
-- so a new development database can be initialized without a production dump.
create table if not exists public.opportunity_applications (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft','submitted','interview','offer','rejected','withdrawn','no_response')),
  submitted_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint applications_unique_user_opportunity unique (user_id, opportunity_id)
);
alter table public.opportunity_applications enable row level security;
grant select, insert, update, delete on public.opportunity_applications to service_role;
alter table public.opportunity_applications add column if not exists version integer not null default 1;

create index if not exists applications_owner_created_id_idx
  on public.opportunity_applications(user_id, created_at desc, id desc);
create index if not exists applications_owner_status_created_idx
  on public.opportunity_applications(user_id, status, created_at desc, id desc);

create schema if not exists private;
create table if not exists public.application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.opportunity_applications(id) on delete cascade,
  user_id text not null,
  event text not null check (event in ('application_opened','application_draft_saved','application_submitted_self_reported','application_status_changed','application_save_failed','application_prompt_snoozed')),
  created_at timestamptz not null default now()
);
create index if not exists application_events_owner_created on public.application_events(user_id, created_at desc);
alter table public.application_events enable row level security;
revoke all on public.application_events from anon, authenticated;
grant select, insert on public.application_events to service_role;
create or replace function private.version_application()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  new.updated_at := clock_timestamp();
  if new.status = 'submitted' and old.status <> 'submitted' then
    new.submitted_at := coalesce(old.submitted_at, clock_timestamp());
  end if;
  return new;
end;
$$;
revoke all on function private.version_application() from public, anon, authenticated;
drop trigger if exists application_version on public.opportunity_applications;
create trigger application_version before update on public.opportunity_applications
  for each row execute function private.version_application();

-- The application and its reminder commit together. No network call or
-- fire-and-forget application process is needed to persist the outbox entry.
create unique index if not exists application_notification_outbox_dedupe
  on public.notification_queue ((payload->>'dedupeKey'))
  where payload->'metadata'->>'source' in ('application-confirmation', 'application-status')
    and coalesce(payload->'channels'->>'inApp', 'true') <> 'false';

create or replace function private.queue_application_lifecycle()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_source text;
  v_key text;
  v_title text;
  v_body text;
  v_due timestamptz;
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.application_events(application_id, user_id, event) values(new.id, new.user_id,
      case when new.status = 'submitted' then 'application_submitted_self_reported'
        when tg_op = 'INSERT' and new.status = 'draft' then 'application_draft_saved'
        else 'application_status_changed' end);
  end if;
  if tg_op = 'INSERT' and new.status = 'draft'
     and nullif(new.metadata->>'application_opened_at', '') is not null then
    v_source := 'application-confirmation';
    v_key := 'application-confirmation:' || new.id::text;
    v_title := 'Did you submit your application?';
    v_body := 'You opened an application form. Did you finish submitting it? Update your tracker when you are ready.';
    v_due := new.created_at + interval '24 hours';
  elsif new.status <> 'draft' and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    v_source := 'application-status';
    -- Match the existing sender's dedupe key during rolling deployments.
    v_key := 'application-status:' || new.id::text || ':' || new.status;
    v_title := case when new.status = 'submitted' then 'Application submitted' else 'Application updated' end;
    v_body := 'Your application status is now ' || replace(new.status, '_', ' ') || '.';
    v_due := now();
  else
    return new;
  end if;
  insert into public.notification_queue (payload, scheduled_for, created_by)
  values (jsonb_build_object(
    'title', v_title, 'body', v_body, 'kind', 'application-status',
    'severity', case when new.status = 'rejected' then 'warning' else 'info' end,
    'audience', 'specific', 'targetUserIds', jsonb_build_array(new.user_id::text),
    'channels', jsonb_build_object('inApp', true, 'push', true, 'email', false),
    'dedupeKey', v_key,
    'metadata', jsonb_build_object('applicationId', new.id, 'opportunityId', new.opportunity_id,
      'source', v_source, 'status', new.status, 'url', '/applied')
  ), v_due, null)
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function private.queue_application_lifecycle() from public, anon, authenticated;
drop trigger if exists application_notification_outbox on public.opportunity_applications;
create trigger application_notification_outbox after insert or update of status on public.opportunity_applications
  for each row execute function private.queue_application_lifecycle();


-- Accepted provider requests are checkpointed per device. Retried application
-- jobs reuse the inbox row and skip these receipts, including quiet-hour jobs.
create table if not exists private.application_push_receipts (
  delivery_key text not null,
  token_id uuid not null,
  status text not null default 'sending' check (status in ('sending','accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key(delivery_key, token_id)
);
alter table private.application_push_receipts enable row level security;
revoke all on private.application_push_receipts from public, anon, authenticated;
grant select, insert, update, delete on private.application_push_receipts to service_role;

create unique index if not exists application_quiet_push_queue_dedupe_idx
  on public.notification_queue ((payload->>'dedupeKey'), (payload#>>'{targetUserIds,0}'))
  where payload#>>'{metadata,source}' in ('application-confirmation', 'application-status')
    and payload#>>'{metadata,quietHoursDeferred}' = 'true'
    and payload#>>'{channels,inApp}' = 'false';

-- Application push-only jobs now have durable device receipts, so they can
-- safely use the existing bounded retry and stale-worker recovery policy.
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
    v_retry_safe := (coalesce(new.payload #>> '{channels,inApp}', 'true') <> 'false' or (new.payload #>> '{metadata,source}' in ('application-confirmation', 'application-status') and nullif(new.payload ->> 'dedupeKey', '') is not null));
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
      (coalesce(q.payload #>> '{channels,inApp}', 'true') <> 'false' or (q.payload #>> '{metadata,source}' in ('application-confirmation', 'application-status') and nullif(q.payload ->> 'dedupeKey', '') is not null)) as retry_safe
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
