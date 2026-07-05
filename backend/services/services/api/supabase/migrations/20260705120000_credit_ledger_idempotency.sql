-- Credit-ledger idempotency (C4).
--
-- reserveRequestCredit (type 'api_request') and recordApiCreditsPurchase
-- (type 'credit_topup') insert a row into public.transactions keyed by an
-- external reference_id and then mutate credits. The app now inserts with
-- ON CONFLICT DO NOTHING and only moves credits when the insert inserts, which
-- requires a unique key on (type, reference_id).
--
-- IMPORTANT: the live Supabase DB has no public.transactions table (the real
-- credit ledger is credit_transactions / billing_transactions + RPCs); the
-- Drizzle `transactions` table is only present in environments whose DATABASE_URL
-- points at a DB built from the Drizzle schema. This migration is therefore
-- guarded so it safely no-ops where the table is absent instead of failing
-- `supabase db push`. The C4 metering code needs reconciling with the real
-- credit system separately.

do $$
begin
  if to_regclass('public.transactions') is null then
    raise notice 'Skipping credit_ledger_idempotency: public.transactions does not exist.';
    return;
  end if;

  -- 1) Collapse exact duplicate ledger rows for non-null references, keeping the
  --    earliest per (type, reference_id), so unique-index creation cannot fail.
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
end $$;
