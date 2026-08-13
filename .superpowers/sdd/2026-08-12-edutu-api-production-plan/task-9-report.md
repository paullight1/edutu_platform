# Task 9 report: documentation and contract correction round

## Scope

Corrected the Task 9 public API documentation and integration contracts without changing API behavior, Task 4 metering, billing, payment, auth guards, or opportunity implementation files.

## Corrections

- Documented the approval state machine accurately: admin approval creates a shared `pending_review`/`unverified` catalog record; learner and `/v1` visibility begins only after verification/enrichment succeeds and the record transitions to `active`/`verified`.
- Standardized all public API pagination examples, OpenAPI descriptions, Markdown docs, and web examples on `meta.nextCursor` and `meta.hasMore`; removed the stale snake_case aliases.
- Replaced the DeveloperDocsPage opportunity example and field list with the actual public projection, including nested `urls` and `trust` fields plus `matchReasons`/`matchRisks`.
- Documented production peppered HMAC-SHA256 key hashing with `API_KEY_PEPPER`, the legacy SHA-256 migration window, rotation-based upgrade behavior, and the local no-pepper fallback.
- Made the required scope list exhaustive: `opportunities:read`, `opportunities:sync`, `usage:read`, `recommendations:read`, and `events:write`.
- Updated the standalone API docs, generated overview/llms/OpenAPI contract, developer landing/dashboard copy, and source design contract to match.
- Added backend generated-contract assertions and a rendered DeveloperDocsPage regression test covering projection fields, cursor naming, scopes, hashing claims, visibility state, and stale-field removal.

Task 4 implementation findings concerning categories metering and billing-reservation fail-closed behavior were intentionally left to the separate Task 4 agent.

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
Test Files: 1 passed, Tests: 4 passed

npm run typecheck
tsc -b exited 0

npm run build
Vite/PWA build exited 0

git diff --check
exited 0
```

## Scope safety

Only Task 9 documentation, contract, test, design-spec, standalone API-doc, and report files are included in the focused commit. Existing Task 4 implementation changes, billing/opportunity/auth changes, migrations, Supabase temp files, generated build output, and other unrelated dirty work were preserved and not staged.
