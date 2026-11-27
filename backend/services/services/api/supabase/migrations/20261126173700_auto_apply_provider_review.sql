begin;
alter table private.auto_apply_attempts
  add column mapping_revision text check (mapping_revision ~ '^[a-f0-9]{64}$'),
  add column destination_host text,
  add column failure_reason text;
-- Older drafts must be prepared again against the current mapping.
update private.auto_apply_attempts
  set state = 'failed', failure_reason = 'mapping_changed', review = null, version = version + 1
  where state = 'needs_review';
-- A pre-migration claim may already have reached the provider.
update private.auto_apply_attempts
  set state = 'unconfirmed', lease_until = null, receipt_check_after = now(), version = version + 1
  where state = 'submitting';
alter table private.auto_apply_attempts add constraint auto_apply_bound_provider_review
  check (state not in ('needs_review', 'submitting') or
    (mapping_revision is not null and destination_host is not null));
commit;
