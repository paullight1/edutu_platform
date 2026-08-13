-- Scope API request idempotency to the authenticated consumer and owner.
-- related_id is also stored as the scoped composite key so the legacy global
-- API reference index cannot let another owner claim the same request id.

alter table public.credit_transactions
  add column if not exists api_consumer_id text,
  add column if not exists api_request_idempotency_key text;

create unique index if not exists credit_transactions_api_request_idempotency_unique
  on public.credit_transactions (
    related_type,
    api_consumer_id,
    user_id,
    api_request_idempotency_key
  )
  where related_type = 'api_request'
    and api_consumer_id is not null
    and api_request_idempotency_key is not null;
