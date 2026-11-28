begin;

alter table private.auto_apply_attempts
  add column reviewing_on_provider boolean not null default false,
  add constraint auto_apply_single_submission_mode
    check (not reviewing_on_provider or state <> 'submitting');

commit;
