-- Idempotency key for server-side edutu-api credit metering (C4 reconciled to
-- the real credit system: profiles.credits + credit_transactions).
--
-- reserveRequestCredit (type 'spend', related_type 'api_request') and
-- recordApiCreditsPurchase (type 'purchase', related_type 'api_credit_purchase')
-- insert a credit_transactions row keyed by related_id (the API request id /
-- Paystack reference) and only move credits when the insert actually inserts.
--
-- Scoped to the two API-metering related_types so it never constrains other
-- credit flows (admin_grant, reward, creator_earning) that reuse related_id.
create unique index if not exists credit_transactions_api_ref_unique
  on public.credit_transactions (related_type, related_id)
  where related_id is not null
    and related_type in ('api_request', 'api_credit_purchase');
