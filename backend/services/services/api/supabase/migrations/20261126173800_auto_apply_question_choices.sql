begin;
alter table private.auto_apply_attempts
  add column question_choices jsonb
    check (question_choices is null or jsonb_typeof(question_choices) = 'array');
commit;
