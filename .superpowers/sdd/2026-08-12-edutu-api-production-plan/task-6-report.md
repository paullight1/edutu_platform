# Task 6 Report: Verified Bachs credit fulfillment and Paystack compatibility

## Status

Task 6 correction implementation committed for final review. The verified
purchase-to-ledger boundary, independent Bachs ingress, reconciliation wiring,
Paystack compatibility hardening, canonical migration, redaction/retention
path, and authenticated `GET /billing/catalog` route are included. Task 7 web
files are untouched.

## Fulfillment contract

- Added `CreditPurchaseService.fulfill()` for Bachs and legacy Paystack.
- Accepted API products are server-owned `api_credits_100`,
  `api_credits_250`, and `api_credits_700`, with exact positive quantities.
- Fulfillment requires a valid provider/environment/event/reference/user,
  positive amount, supported currency, and a successful provider event.
- A single transaction inserts `billing_provider_events`, inserts one positive
  `credit_transactions` row with `related_type = 'api_credit_purchase'`,
  updates exactly one canonical profile row, and marks the event/intent
  processed. The privileged `app.credit_op` setting is preserved.
- Duplicate event deliveries and provider-reference replays add zero credits;
  reference/user/quantity conflicts become review cases. Profile or ledger
  failures roll back the transaction, and credit purchases never write expiry.
- Added the canonical root Supabase migration for API-credit ledger idempotency
  and the non-expiring product contract. The backend-local duplicate migration
  was removed.

## Bachs

- Raw request bytes are still verified by `BachsWebhookVerifier` for timestamp,
  HMAC signature, organization, environment, JSON envelope, and depth/body
  limits.
- Only `collection.succeeded` can fulfill. `checkout.completed`, unknown event
  types, malformed payloads, mismatched intent/reference/owner, checkout ID,
  product mapping, quantity, amount, currency, status, or environment are
  quarantined without a grant.
- Successful deliveries return `fulfilled`; replayed deliveries return
  `duplicate`; quarantined deliveries return `review`.

## Paystack compatibility

- Legacy `charge.success` remains supported, but now requires a matching local
  pending/processing/completed credit checkout, exact user, amount, currency,
  environment, quantity, product metadata, and successful provider status.
- Verified legacy payments call the same `CreditPurchaseService`; arbitrary
  historical Paystack quantities remain supported only through an explicitly
  marked legacy product path. New API-credit products remain the three exact
  server-owned keys.
- New Paystack checkout initialization is gated/disabled when Bachs is enabled;
  missing local product, quantity, domain, or environment metadata is rejected.

## Reconciliation and event persistence

- Reconciliation now rejects pending/non-successful payments, validates exact
  currency and configurable API-credit catalog entries, and forwards verified
  identity/product/amount data to repair only missing resources.
- Billing event records now carry provider references and support Paystack as a
  provider while preserving payload-hash conflict detection and retry state.
- The billing module now wires concrete Bachs/Paystack reconciliation adapters,
  a service-role store, the shared repair boundary, scheduled reconciliation,
  and expired raw-payload purging. Provider payloads and error bodies are
  recursively redacted before persistence/logging.

## Verification

```text
Focused billing suites:
  full `src/billing` suite — 16 suites passed, 202 tests passed.

Additional Bachs/controller/verifier/schema suites:
  schema and other focused suites passed; `GET /billing/catalog` is included
  in the authenticated controller implementation.

Backend build:
  npm run build — passed

Scoped billing ESLint:
  npx eslint <Task 6 billing files> — passed

Diff whitespace:
  git diff --check — passed
```

Jest reports an existing open database-pool handle after the suites finish, but
the full billing suite has zero failures. Unrelated worktree changes and
temporary files were not included in this Task 6 scope.
