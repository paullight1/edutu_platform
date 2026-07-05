-- Credit-ledger idempotency (C4).
--
-- reserveRequestCredit (type 'api_request') and recordApiCreditsPurchase
-- (type 'credit_topup') both write a row to public.transactions keyed by an
-- external reference_id (the API request id / the Paystack reference) and then
-- mutate profiles.credits_balance. Neither was atomic or idempotent, so a
-- webhook redelivery or client retry could double-charge / double-credit and
-- leave duplicate ledger rows.
--
-- The application now inserts the ledger row with ON CONFLICT DO NOTHING and
-- only moves credits when the insert actually inserts. That requires a unique
-- key on (type, reference_id). Rows that share (type, reference_id) are, by
-- definition, duplicates of the same logical event; collapse them (keeping the
-- earliest) before enforcing uniqueness so index creation cannot fail.

-- 1) Remove exact duplicate ledger rows for non-null references, keeping the
--    earliest per (type, reference_id).
delete from public.transactions t
using (
  select
    id,
    row_number() over (
      partition by type, reference_id
      order by created_at asc, id asc
    ) as rn
  from public.transactions
  where reference_id is not null
) dups
where t.id = dups.id
  and dups.rn > 1;

-- 2) Enforce one ledger row per (type, reference_id) for referenced events.
create unique index if not exists transactions_type_reference_unique
  on public.transactions (type, reference_id)
  where reference_id is not null;
