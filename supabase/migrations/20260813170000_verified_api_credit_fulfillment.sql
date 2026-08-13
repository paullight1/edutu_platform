-- Task 6: durable, provider-neutral API credit fulfillment prerequisites.
-- The application service performs all trust-boundary validation and the
-- ledger/profile update in one transaction. This migration only makes the
-- idempotency and non-expiring API-credit contract durable at the database
-- boundary.

begin;

alter table public.credit_transactions
  add column if not exists related_id text,
  add column if not exists related_type text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- This predicate is intentionally identical to the application's ON CONFLICT
-- target. PostgreSQL requires the partial-index predicate to be inferable.
create unique index if not exists credit_transactions_api_ref_unique
  on public.credit_transactions (related_type, related_id)
  where related_id is not null
    and related_type in ('api_request', 'api_credit_purchase');

-- Do not allow the fulfillment path to depend on the legacy credit-pack
-- discriminator or an expiry column. API credit product rows are server-owned
-- catalog values and must remain one-time, positive, and non-expiring.
do $$
begin
  if to_regclass('public.billing_products') is not null then
    if not exists (
      select 1
      from pg_catalog.pg_constraint
      where conname = 'billing_products_api_credit_contract_check'
        and conrelid = 'public.billing_products'::regclass
    ) then
      alter table public.billing_products
        add constraint billing_products_api_credit_contract_check
        check (
          product_key not in ('api_credits_100', 'api_credits_250', 'api_credits_700')
          or (
            fulfillment_kind = 'credit_pack'
            and renewal_mode = 'one_time'
            and entitlement_duration is null
            and credit_quantity in (100, 250, 700)
            and (
              (product_key = 'api_credits_100' and credit_quantity = 100)
              or (product_key = 'api_credits_250' and credit_quantity = 250)
              or (product_key = 'api_credits_700' and credit_quantity = 700)
            )
          )
        ) not valid;
    end if;
  end if;
end;
$$;

commit;
