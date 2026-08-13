# Task 9 report: documentation and contract correction round

## Scope

Corrected the Task 9 public API documentation and integration contracts without changing API behavior, Task 4 metering, billing, payment, auth guards, or opportunity implementation files.

## Corrections

- Documented the approval state machine accurately: admin approval creates a shared `pending_review`/`unverified` catalog record; learner and `/v1` visibility begins only after verification/enrichment succeeds and the record transitions to `active`/`verified`.
- Standardized all public API pagination examples, OpenAPI descriptions, Markdown docs, and web examples on `meta.nextCursor` and `meta.hasMore`; removed the stale snake_case aliases.
- Replaced the DeveloperDocsPage opportunity example and field list with the actual public projection, including nested `urls` and `trust` fields plus `matchReasons`/`matchRisks`.
- Documented production peppered HMAC-SHA256 key hashing with `API_KEY_PEPPER`, indefinite legacy SHA-256 compatibility while the matcher is enabled, operational rotation guidance without an unenforced deadline, and the local no-pepper fallback.
- Replaced stale `edutu_test_*`, `edutu_live_*`, and `sk_live_edutu_*` examples with the generated `edu_*` contract or the `$EDUTU_API_KEY` placeholder across public docs and test fixtures.
- Added a reusable OpenAPI `503 billing_unavailable` response to all six chargeable operations, and documented the status/code in generated `llms.txt`, the standalone API reference, and the standalone errors page.
- Corrected rate-limit wording: health is public; usage and categories do not consume credits but their authenticated calls still count toward per-minute and monthly limits.
- Made the required scope list exhaustive: `opportunities:read`, `opportunities:sync`, `usage:read`, `recommendations:read`, and `events:write`.
- Updated the standalone API docs, generated overview/llms/OpenAPI contract, developer landing/dashboard copy, and source design contract to match.
- Added a backend expected live-operation table comparing overview endpoints, OpenAPI methods, free/chargeable classification, scopes, and chargeable `402`/`503` errors. Added rendered web assertions for the endpoint catalogue, hashing/rate-limit/billing wording, and stale-key removal.

Task 4 implementation findings concerning categories metering and billing-reservation fail-closed behavior were intentionally left to the separate Task 4 agent.

## Verification

All commands completed successfully:

```text
backend/services/services/api
npm test -- --runInBand src/edutu-api/edutu-api-docs.controller.spec.ts
Test Suites: 1 passed, Tests: 4 passed (includes the expected nine-operation table and chargeable 503 assertions)

npm run build
Nest build exited 0

edutu-web-app
npm test -- src/test/__tests__/scholarshipEnginePages.test.tsx
Test Files: 1 passed, Tests: 4 passed

Full web test suite: 50 files passed, 298 tests passed

npm run typecheck
tsc -b exited 0

npm run build
Vite/PWA build exited 0

Backend build exited 0

git diff --check
exited 0
```

## Scope safety

Only Task 9 documentation, contract, test, design-spec, standalone API-doc, and report files are included in the focused commit. Existing Task 4 implementation changes, billing/opportunity/auth changes, migrations, Supabase temp files, generated build output, and other unrelated dirty work were preserved and not staged.
