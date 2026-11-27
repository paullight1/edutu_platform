begin;
alter table private.auto_apply_attempts
  add column handoff_catalog_fingerprint text,
  add constraint auto_apply_handoff_catalog_requires_step check (
    handoff_catalog_fingerprint is null or
    (handoff_step_url is not null and handoff_catalog_fingerprint ~ '^[a-f0-9]{64}$')
  );
commit;
