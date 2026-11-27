begin;

alter table private.auto_apply_attempts
  add column question_max_length integer check (question_max_length between 1 and 4000);

commit;
