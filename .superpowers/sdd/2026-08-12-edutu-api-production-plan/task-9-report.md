# Task 9 report: public API documentation and contract alignment

## Scope

Aligned the Edutu API documentation surfaces without changing authentication, API-key guards, metering, billing, payment, opportunity workflow, or production bootstrap implementation.

## Changes

- Updated generated API overview, `llms.txt`, and OpenAPI output to distinguish Clerk user sessions for `/developer/*` and `/dashboard/developer` from Edutu API keys for `/v1/*`.
- Documented the live nine-operation endpoint set and removed stale claims for match, scraper-trigger, and API-key routes.
- Documented zero starting credits, dashboard project/key creation without a purchase, one-time non-expiring top-ups, free health/usage/categories, one-credit chargeable calls, and HTTP 402 `credits_exhausted` behavior.
- Added the server-to-server default and browser-key/CORS trade-off, a real `x-edutu-api-key` curl example, a redacted 402 response, and approved-submission/global-catalog visibility semantics.
- Updated the developer docs, landing page, and dashboard copy to match the contract.
- Extended backend contract tests and web page tests for authentication boundaries, endpoint policy, billing errors, supported routes, and stale-claim removal.

## Verification

All commands completed successfully:

```text
backend/services/services/api
npm test -- --runInBand src/edutu-api/edutu-api-docs.controller.spec.ts
Test Suites: 1 passed, Tests: 4 passed

npm run build
Nest build exited 0

edutu-web-app
npm test -- src/test/__tests__/scholarshipEnginePages.test.tsx
Test Files: 1 passed, Tests: 3 passed

npm run typecheck
tsc -b exited 0

npm run build
Vite/PWA build exited 0
```

The brief's web test command included Jest's `--runInBand`; this repository uses Vitest, so the same test target was run with the Vitest-compatible command shown above.

## Scope safety

Only Task 9 documentation/contract files and this report are included in the Task 9 commit. Existing billing, opportunity-submission, migration, security-remediation, Supabase temp, and other unrelated dirty files were preserved and not staged.
