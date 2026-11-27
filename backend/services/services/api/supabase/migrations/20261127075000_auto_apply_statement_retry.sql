begin;

alter table private.auto_apply_attempts
  add column question_statement_retryable boolean not null default false,
  add column statement_retry_used boolean not null default false;

commit;
