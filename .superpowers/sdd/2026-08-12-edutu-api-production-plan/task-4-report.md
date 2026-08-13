# Task 4 report: explicit fail-closed API metering

## Implemented

- Added a centralized billing policy for the exact free endpoints:
  `GET /v1/health`, `GET /v1/usage`, and `GET /v1/categories`.
- Classified opportunity list/detail/stats/sync, recommendations, and events as
  one-credit operations.
- Added explicit controller billing metadata with path/method policy fallback.
- Enforced API key, scope, rate limit, monthly quota, credit reservation, then
  controller execution order.
- Mapped confirmed zero balances to `402 credits_exhausted`.
- Mapped missing owners, missing profiles, unknown balances, and reservation
  database failures to `503 billing_unavailable`.
- Preserved idempotent request-credit reservation and ensured paid controller
  work cannot run after reservation failure.
- Added stable machine-readable error payloads and removed database/provider
  error details from metering logs.

## Verification

Passed:

```text
81 Task 4-focused tests passed (including schema contracts, the migration-applied PGlite regression, and the correction-round pipeline suite)
npm run build
Task 4-only ESLint
```

The full backend lint command was also run. It remains non-zero because of
unrelated formatting errors in concurrent/pre-existing files:
`src/og/page-og.controller.ts`.

## Correction round

- Scoped API idempotency keys to consumer + owner + request ID.
- Added `api_consumer_id`, `api_request_idempotency_key`, and a unique
  consumer/owner/request index in `20260813150000_api_request_idempotency_scope.sql`.
- Duplicate claims now verify the ledger row is the matching one-credit API
  spend for the same consumer and owner and that the current owner profile
  exists; malformed, missing, mismatched, and legacy unscoped rows fail closed
  with `billing_unavailable`.
- A shared persistence-level test proves the same client request ID is charged
  independently for different consumers/owners.
- Added an HTTP request-pipeline test proving zero balance and reservation
  failure return stable status/code/request ID values without invoking a paid
  handler.

## Acceptance fix

- Extended `verify-api-production-schema.mjs` to require both scoped ledger
  columns and the effective unique index keys, uniqueness, and predicate.
- Extended the billing/schema contract tests to assert the manifest and
  migration contain the scoped idempotency contract.
- Added a migration-applied PGlite regression proving cross-consumer/owner
  isolation, exact retry idempotency, and fail-closed malformed/mismatched
  duplicates.
