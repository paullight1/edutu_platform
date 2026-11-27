begin;
alter table private.auto_apply_attempts
  add column question_save_phone boolean not null default false;
commit;
