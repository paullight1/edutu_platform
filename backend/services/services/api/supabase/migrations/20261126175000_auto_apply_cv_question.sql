begin;

alter table private.auto_apply_attempts
  add column question_cv boolean not null default false,
  add constraint auto_apply_cv_question check (not question_cv or
    (state = 'needs_input' and not handoff_required and not question_attachment and question_choices is null));

-- Existing attempts with the adapter's standard CV prompt can use the picker too.
update private.auto_apply_attempts
set question_cv = true
where state = 'needs_input' and not handoff_required and not question_attachment
  and question_choices is null and question = 'Paste the CV text you want Edutu to attach as a PDF.';

create or replace function private.queue_auto_apply_action()
returns trigger language plpgsql set search_path = '' set timezone = 'UTC' as $$
declare
  owner_id text;
  opportunity_id uuid;
  opportunity_title text;
begin
  if new.state not in ('needs_input', 'needs_review', 'unconfirmed', 'failed') then return new; end if;
  if tg_op = 'UPDATE' and old.state = new.state
      and (new.state = 'needs_review' or old.version = new.version) then return new; end if;
  select a.user_id, a.opportunity_id, left(o.title, 120) into strict owner_id, opportunity_id, opportunity_title
    from public.opportunity_applications a
    left join public.opportunities o on o.id = a.opportunity_id
    where a.id = new.application_id;

  insert into public.notification_queue (payload, scheduled_for, created_by)
  values (jsonb_build_object(
    'title', case new.state
      when 'needs_input' then case when new.question_attachment then 'Auto Apply needs a PDF' when new.question_cv then 'Auto Apply needs a CV' else 'Auto Apply needs your help' end
      when 'needs_review' then 'Review your application'
      when 'failed' then case new.failure_reason
        when 'opportunity_closed' then 'This opportunity has closed'
        when 'applicant_only' then 'Apply on the provider’s website'
        when 'attachment_changed' then 'Choose a PDF again'
        else 'Auto Apply could not continue' end
      else 'Check your application submission'
    end,
    'body', case new.state
      when 'needs_input' then coalesce(opportunity_title, 'Your application') ||
        case when new.handoff_required then ' needs your attention on the provider’s website.' when new.question_attachment then ' needs a PDF to continue.' when new.question_cv then ' needs a CV to continue.' else ' needs an answer to continue.' end
      when 'needs_review' then coalesce(opportunity_title, 'Your application') || ' is ready for you to review.'
      when 'failed' then case new.failure_reason
        when 'opportunity_closed' then coalesce(opportunity_title, 'This opportunity') || ' has closed. Open the application for its status.'
        when 'applicant_only' then 'Complete and submit your own application for ' || coalesce(opportunity_title, 'this opportunity') || ' on the provider’s website.'
        when 'attachment_changed' then 'Open ' || coalesce(opportunity_title, 'your application') || ' to choose the PDF again.'
        else 'Open your application for ' || coalesce(opportunity_title, 'this opportunity') || ' to retry or check what happened.' end
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
