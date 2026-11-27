begin;
alter table private.auto_apply_attempts
  add column handoff_step_url text check (length(handoff_step_url) <= 2048),
  add constraint auto_apply_handoff_step_requires_handoff
    check (handoff_step_url is null or handoff_required);
commit;
