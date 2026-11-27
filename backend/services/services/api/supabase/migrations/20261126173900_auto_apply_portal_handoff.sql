begin;
alter table private.auto_apply_attempts
  add column handoff_required boolean not null default false,
  add constraint auto_apply_handoff_needs_input check (not handoff_required or state = 'needs_input');
create or replace function private.queue_auto_apply_action()
returns trigger language plpgsql set search_path = '' as $$
declare
  owner_id text;
  opportunity_id uuid;
  opportunity_title text;
begin
  if new.state not in ('needs_input', 'needs_review', 'unconfirmed') then return new; end if;
  if tg_op = 'UPDATE' and old.state = new.state
      and (new.state = 'needs_review' or old.version = new.version) then return new; end if;
  select a.user_id, a.opportunity_id, left(o.title, 120) into strict owner_id, opportunity_id, opportunity_title
    from public.opportunity_applications a
    left join public.opportunities o on o.id = a.opportunity_id
    where a.id = new.application_id;

  insert into public.notification_queue (payload, scheduled_for, created_by)
  values (jsonb_build_object(
    'title', case new.state when 'needs_input' then 'Auto Apply needs your help' when 'needs_review' then 'Review your application' else 'Check your application submission' end,
    'body', case new.state
      when 'needs_input' then coalesce(opportunity_title, 'Your application') ||
        case when new.handoff_required then ' needs your attention on the provider’s website.' else ' needs an answer to continue.' end
      when 'needs_review' then coalesce(opportunity_title, 'Your application') || ' is ready for you to review.'
      else 'Check the provider for a receipt for ' || coalesce(opportunity_title, 'your application') || '.'
    end,
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
commit;
