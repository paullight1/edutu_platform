# Task 8 correction report — opportunity submission review and global publication

## Status

Correction work completed in the scoped opportunity submission/catalog paths.
Approval is now a transactional, recoverable review operation: it creates or
reuses a catalog row as `pending_review`/`unverified`, links it to the approved
submission under a row lock, and invokes the existing verification worker. Only
the verification success path can make that row `active`/`verified`.

Approved catalog rows remain linked for audit and idempotent retries. A later
`rejected` or `needs_info` decision withdraws the linked row from public feeds;
repeated decisions are no-ops. Catalog insertion is deduplicated by the
server-written submission provenance key. Transaction/persistence failures
propagate instead of being swallowed.

The learner catalog and `/v1` service paths require both `status = 'active'`
and `verification_status = 'verified'`. Static snapshot compatibility keeps
legacy rows without a verification field readable while explicitly unverified
rows remain excluded.

Submitted URL verification now resolves every hostname, rejects loopback,
private, link-local, multicast, reserved, metadata, encoded-IP, and unsafe
IPv6 targets, pins the resolved address for the request, revalidates every
redirect, and enforces a bounded redirect limit.

## Scoped files changed

- `backend/services/services/api/src/opportunity-submissions/opportunity-submissions.service.ts`
- `backend/services/services/api/src/opportunity-submissions/opportunity-submissions.service.spec.ts`
- `backend/services/services/api/src/opportunity-submissions/opportunity-submissions.correction.spec.ts`
- `backend/services/services/api/src/opportunities/opportunities.service.ts`
- `backend/services/services/api/src/opportunities/opportunity-static-snapshot.ts`
- `backend/services/services/api/src/opportunities/opportunity-verification.service.ts`
- `backend/services/services/api/src/opportunities/opportunity-verification.service.spec.ts`
- `backend/services/services/api/src/opportunities/opportunity-catalog.visibility.spec.ts`
- `backend/services/services/api/src/edutu-api/edutu-api.service.ts`
- `backend/services/services/api/supabase/migrations/20260813130000_user_submission_catalog_idempotency.sql`

The web submission behavior/test from the prior Task 8 commit remains scoped
and unchanged in this correction round.

## Verification

- Focused backend Task 8: `NODE_OPTIONS=--experimental-vm-modules npm test -- --runInBand src/opportunity-submissions/opportunity-submissions.service.spec.ts src/opportunity-submissions/opportunity-submissions.correction.spec.ts src/opportunities/opportunity-verification.service.spec.ts src/opportunities/opportunity-catalog.visibility.spec.ts src/opportunities/opportunities.controller.spec.ts src/edutu-api/edutu-api.controller.spec.ts` — 6 suites, 28 tests passed.
- Focused web: `npm test -- --run src/test/__tests__/opportunitySubmission.test.tsx` — 1 test passed.
- Backend focused ESLint over all changed backend Task 8 files — passed.
- Web typecheck — passed.
- Web lint — passed.
- Web build — passed; existing Vite dynamic-import warning emitted.
- Backend full Jest — 126 suites/1,648 tests passed, with unrelated failures in the dirty `edutu-api-docs.controller.ts` (`TS1010`/related parse/type errors). The scoped Task 8 suites pass independently.
- Web full Jest — 49 files/295 tests passed; one unrelated dirty `scholarshipEnginePages.test.tsx` expectation failed because its dirty developer-page changes are incomplete.

## Scope protection

Billing files, billing types, new Bachs files, unrelated docs, migrations, and
temporary Supabase files were not staged. The final commit will be assembled
from an explicit Task 8 path list only.

## Commit

`fix: harden Task 8 opportunity publication` — resolve the exact containing
commit with `git rev-parse HEAD`.
