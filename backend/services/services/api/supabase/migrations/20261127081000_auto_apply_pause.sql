begin;

alter table private.auto_apply_attempts
  drop constraint auto_apply_attempts_state_check,
  add constraint auto_apply_attempts_state_check check (state in
    ('queued','running','paused','needs_input','needs_review','submitting','unconfirmed','submitted','cancelled','failed'));

commit;
