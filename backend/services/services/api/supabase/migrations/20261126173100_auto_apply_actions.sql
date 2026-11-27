begin;
alter table private.auto_apply_attempts
  add column question text,
  add column answers jsonb not null default '{}'::jsonb,
  add constraint auto_apply_question_required
    check (state <> 'needs_input' or coalesce(length(btrim(question)), 0) between 1 and 1000);

create function private.queue_auto_apply_action()
returns trigger language plpgsql set search_path = '' as $$
declare
  owner_id text;
  opportunity_id uuid;
begin
  if new.state not in ('needs_input', 'needs_review', 'unconfirmed') then return new; end if;
  if tg_op = 'UPDATE' and old.state = new.state
      and (new.state = 'needs_review' or old.version = new.version) then return new; end if;
  select a.user_id, a.opportunity_id into strict owner_id, opportunity_id
    from public.opportunity_applications a where a.id = new.application_id;

  insert into public.notification_queue (payload, scheduled_for, created_by)
  values (jsonb_build_object(
    'title', case new.state when 'needs_input' then 'Auto Apply needs your help' when 'needs_review' then 'Review your application' else 'Check your application submission' end,
    'body', 'Open Edutu to see what your application needs.',
    'kind', 'application-status', 'severity', 'info', 'audience', 'specific',
    'targetUserIds', jsonb_build_array(owner_id),
    'channels', jsonb_build_object('inApp', true, 'push', true, 'email', false),
    'dedupeKey', 'auto-apply:' || new.id::text || ':' || new.version::text || ':' || new.state,
    'metadata', jsonb_build_object('attemptId', new.id, 'opportunityId', opportunity_id,
      'source', 'auto-apply-action', 'state', new.state, 'attemptVersion', new.version, 'url', '/auto-apply/' || new.id::text)
  ), now(), null)
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function private.queue_auto_apply_action() from public;
create trigger auto_apply_action_outbox after insert or update on private.auto_apply_attempts
  for each row execute function private.queue_auto_apply_action();
commit;
