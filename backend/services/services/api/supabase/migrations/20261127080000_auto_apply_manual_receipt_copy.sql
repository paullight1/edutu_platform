begin;

-- Keep a manual self-report visibly distinct from a provider-confirmed receipt.
-- The application event name remains unchanged for analytics compatibility.
create or replace function private.queue_application_lifecycle()
returns trigger language plpgsql set search_path = '' set timezone = 'UTC' as $$
declare
  v_source text;
  v_key text;
  v_title text;
  v_body text;
  v_due timestamptz;
  v_confirmation jsonb;
  v_opportunity_title text;
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
    v_key := 'application-status:' || new.id::text || ':' || new.status;
    v_title := case when new.status = 'submitted' then 'Application submitted' else 'Application updated' end;
    v_body := 'Your application status is now ' || replace(new.status, '_', ' ') || '.';
    if tg_op = 'UPDATE' and old.status = 'draft' and new.status = 'submitted'
      and new.metadata ->> 'submission_source' = 'auto_apply' then
      v_confirmation := new.metadata -> 'auto_apply_confirmation';
      if v_confirmation is not null then
        select left(title, 120) into v_opportunity_title
        from public.opportunities where id = new.opportunity_id;
        v_title := 'Application receipt confirmed';
        v_body := coalesce(v_opportunity_title, 'Your application') ||
          ' has a provider receipt. Open Auto Apply to view it.';
      end if;
    elsif tg_op = 'UPDATE' and old.status = 'draft' and new.status = 'submitted'
      and new.metadata ->> 'submission_source' = 'manual' then
      select left(title, 120) into v_opportunity_title
      from public.opportunities where id = new.opportunity_id;
      v_title := 'Submission recorded';
      v_body := 'You recorded that you submitted ' || coalesce(v_opportunity_title, 'this application') ||
        ' on the provider site. Edutu does not have a provider receipt.';
    end if;
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
      || case when v_confirmation is null then '{}'::jsonb else v_confirmation ||
        jsonb_build_object('submissionVerified', true, 'url', '/auto-apply/' || (v_confirmation ->> 'attemptId'))
      end
  ), v_due, null)
  on conflict do nothing;
  return new;
end;
$$;

commit;
