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
38 focused tests passed
npm run build
Task 4-only ESLint
```

The full backend lint command was also run. It remains non-zero because of
unrelated formatting errors in concurrent/pre-existing files:
`src/edutu-api/edutu-api-docs.controller.ts`,
`src/edutu-api/edutu-api-docs.controller.spec.ts`, and
`src/opportunities/opportunity-verification.service.ts`.
