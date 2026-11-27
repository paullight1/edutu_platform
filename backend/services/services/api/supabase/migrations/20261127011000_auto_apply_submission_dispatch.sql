begin;

-- NULL is deliberately ambiguous for claims made by older worker versions.
alter table private.auto_apply_attempts add column submission_dispatched boolean;

commit;
