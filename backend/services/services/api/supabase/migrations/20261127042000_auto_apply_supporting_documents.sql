begin;
alter table private.auto_apply_attempts
  add column supporting_documents jsonb
    check (supporting_documents is null or jsonb_typeof(supporting_documents) = 'object');
commit;
