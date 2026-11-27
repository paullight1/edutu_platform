begin;
alter table private.auto_apply_attempts
  add column question_answer_hint text
    check (question_answer_hint is null or length(question_answer_hint) <= 400);
commit;
