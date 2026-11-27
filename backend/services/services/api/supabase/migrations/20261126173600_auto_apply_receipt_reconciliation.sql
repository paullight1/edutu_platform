begin;
alter table private.auto_apply_attempts
  add column receipt_check_after timestamptz,
  add column receipt_checks integer not null default 0;
update private.auto_apply_attempts set receipt_check_after = now()
  where state = 'unconfirmed';
create index auto_apply_receipt_check_idx
  on private.auto_apply_attempts(receipt_check_after)
  where state = 'unconfirmed' and receipt_checks < 3;
commit;
