begin;
alter table private.auto_apply_attempts
  add column lease_until timestamptz,
  add column review jsonb,
  add column drafted_statement text,
  add column provider_receipt text;

create index auto_apply_submission_queue_idx on private.auto_apply_attempts(created_at)
  where state = 'submitting';
create index auto_apply_worker_queue_idx on private.auto_apply_attempts(created_at)
  where state in ('queued', 'running');

commit;
