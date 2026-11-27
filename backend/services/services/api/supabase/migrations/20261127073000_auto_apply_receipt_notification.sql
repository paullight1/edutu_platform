begin;

create or replace function private.sync_auto_apply_tracker_submission()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  linked_attempt record;
begin
  select id, state, version, provider_receipt into linked_attempt
  from private.auto_apply_attempts
  where application_id = new.id
  for update nowait;

  if not found then
    if jsonb_typeof(new.metadata) = 'object' then
      new.metadata := new.metadata - 'auto_apply_confirmation';
    end if;
    return new;
  end if;

  if linked_attempt.state = 'submitting' then
    raise exception using errcode = '55P03', message = 'Auto Apply is submitting this application';
  end if;

  if linked_attempt.state <> 'submitted' then
    update private.auto_apply_attempts
    set state = 'submitted', version = version + 1, lease_until = null,
      profile_snapshot = null, previous_answers = null, provider_retry_after = null, receipt_check_after = null,
      question = null, question_choices = null, question_attachment = false, question_cv = false,
      handoff_required = false, handoff_step_url = null, handoff_catalog_fingerprint = null, failure_reason = null
    where id = linked_attempt.id;
  end if;

  new.metadata := case when jsonb_typeof(new.metadata) = 'object'
    then new.metadata - array['provider_receipt', 'auto_apply_confirmation'] else '{}'::jsonb end;
  if linked_attempt.provider_receipt is null then
    new.metadata := new.metadata || jsonb_build_object('submission_source', 'manual');
  else
    new.metadata := new.metadata || jsonb_build_object('submission_source', 'auto_apply',
      'provider_receipt', linked_attempt.provider_receipt,
      'auto_apply_confirmation', jsonb_build_object('attemptId', linked_attempt.id, 'attemptVersion', linked_attempt.version));
  end if;
  return new;
end;
$$;

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
    -- Match the existing sender's dedupe key during rolling deployments.
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
