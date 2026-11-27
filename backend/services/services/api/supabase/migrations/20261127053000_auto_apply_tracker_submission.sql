begin;

create function private.sync_auto_apply_tracker_submission()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  linked_attempt record;
begin
  select id, state, provider_receipt into linked_attempt
  from private.auto_apply_attempts
  where application_id = new.id
  for update nowait;

  if not found then return new; end if;

  if linked_attempt.state = 'submitting' then
    raise exception using errcode = '55P03', message = 'Auto Apply is submitting this application';
  end if;

  if linked_attempt.state <> 'submitted' then
    update private.auto_apply_attempts
    set state = 'submitted', version = version + 1, lease_until = null,
      profile_snapshot = null, provider_retry_after = null, receipt_check_after = null,
      question = null, question_choices = null, question_attachment = false, question_cv = false,
      handoff_required = false, handoff_step_url = null, handoff_catalog_fingerprint = null, failure_reason = null
    where id = linked_attempt.id;
  end if;

  new.metadata := case when jsonb_typeof(new.metadata) = 'object'
    then new.metadata - 'provider_receipt' else '{}'::jsonb end;
  if linked_attempt.provider_receipt is null then
    new.metadata := new.metadata || jsonb_build_object('submission_source', 'manual');
  else
    new.metadata := new.metadata || jsonb_build_object('submission_source', 'auto_apply',
      'provider_receipt', linked_attempt.provider_receipt);
  end if;
  return new;
end;
$$;
revoke all on function private.sync_auto_apply_tracker_submission() from public, anon, authenticated;

create trigger auto_apply_tracker_submission before update of status on public.opportunity_applications
for each row when (old.status = 'draft' and new.status = 'submitted')
execute function private.sync_auto_apply_tracker_submission();

commit;
