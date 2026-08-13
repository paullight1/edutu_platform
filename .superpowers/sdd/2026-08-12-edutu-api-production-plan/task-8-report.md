# Task 8 correction report — opportunity submission review and global publication

## Status

Final correction work completed in the scoped opportunity submission/catalog
paths. Approval is now a transactional, recoverable review operation: it
creates or reuses a catalog row as `pending_review`/`unverified`, links it to
the approved submission under a row lock, and writes a durable verification
operation in the same transaction. Only the current approved provenance and
review version can make that row `active`/`verified`.

Approved catalog rows remain linked for audit and idempotent retries. A later
`rejected` or `needs_info` decision withdraws the linked row, increments its
server-owned review version, cancels queued/running verification operations,
and invalidates learner-feed caches. Repeated decisions are no-ops.
Catalog insertion is deduplicated by the server-written submission provenance
key. A stale verifier result is rejected by a conditional database update.
Verification recovery uses bounded retry/backoff, persists exhaustion, and
writes a critical audit alert. Running operations carry a bounded worker lease;
the recovery cron reclaims expired or legacy stale-running rows into the same
retry/exhaustion path, so worker termination cannot strand recovery forever.
Each claim receives a fresh lease token; worker completion, failure, and
cancellation writes are token-fenced, and a hard verification timeout expires
before the lease. Recovery selects no more than 25 ordered candidates per
pass. Re-approval copies the locked submission's current fields into the
linked catalog row atomically before enqueueing its new verification operation.
Review responses distinguish
`approved_for_verification` from `verified_public` and withdrawn states.

The learner catalog and `/v1` service paths require both `status = 'active'`
and `verification_status = 'verified'`. Static snapshot compatibility keeps
legacy rows without a verification field readable while explicitly unverified
rows remain excluded.

Submitted URL verification now resolves every hostname, rejects loopback,
private, link-local, multicast, reserved, metadata, encoded-IP, IPv4-mapped,
IPv4-compatible, and unsafe IPv6 targets, pins the resolved address for the
request, revalidates every initial/redirect target, and enforces a bounded
redirect limit.

## Scoped files changed

- `backend/services/services/api/src/opportunity-submissions/opportunity-submissions.service.ts`
- `backend/services/services/api/src/opportunity-submissions/opportunity-submissions.service.spec.ts`
- `backend/services/services/api/src/opportunity-submissions/opportunity-submissions.correction.spec.ts`
- `backend/services/services/api/src/opportunities/opportunities.service.ts`
- `backend/services/services/api/src/opportunities/opportunity-static-snapshot.ts`
- `backend/services/services/api/src/opportunities/opportunity-verification.service.ts`
- `backend/services/services/api/src/opportunities/opportunity-verification.service.spec.ts`
- `backend/services/services/api/src/opportunities/opportunity-verification.operations.spec.ts`
- `backend/services/services/api/src/opportunities/opportunity-catalog.visibility.spec.ts`
- `backend/services/services/api/src/db/schema.ts`
- `backend/services/services/api/src/edutu-api/edutu-api.service.ts`
- `backend/services/services/api/supabase/migrations/20260813130000_user_submission_catalog_idempotency.sql`
- `backend/services/services/api/supabase/migrations/20260813143000_opportunity_verification_operations.sql`

The web submission behavior/test from the prior Task 8 commit remains scoped
and unchanged in this correction round.

## Verification

- Focused backend Task 8: `NODE_OPTIONS=--experimental-vm-modules npm test -- --runInBand src/opportunity-submissions/opportunity-submissions.service.spec.ts src/opportunity-submissions/opportunity-submissions.correction.spec.ts src/opportunities/opportunity-verification.service.spec.ts src/opportunities/opportunity-catalog.visibility.spec.ts src/opportunities/opportunities.controller.spec.ts src/edutu-api/edutu-api.controller.spec.ts` — 6 suites, 28 tests passed.
- Focused web: `npm test -- --run src/test/__tests__/opportunitySubmission.test.tsx` — 1 test passed.
- Backend focused ESLint over all changed backend Task 8 files — passed.
- Final correction focus: 4 suites/28 tests passed, including the PGlite
  stale-write race, warmed-cache withdrawal/republication, hexadecimal
  mapped/compatible IPv6 initial and redirect targets, durable retry/backoff,
  exhaustion alerting, and approval response states.
- Recovery lease regression: claimed `running` operation was reclaimed,
  retried, and exhausted with the critical audit alert emitted.
- Final lease fencing/backlog/re-approval focus: 7 suites/45 tests passed,
  including late old-worker completion/failure fencing, a stale backlog larger
  than 25, and corrected needs-info submission data reaching catalog refresh.
- Backend `npm run build`: passed.
- Targeted backend ESLint over all final Task 8 backend files: passed.
- Backend `npx tsc --noEmit`: remains blocked by pre-existing unrelated dirty
  billing, communities, and events test/type changes; no Task 8 source error
  was reported, and the Nest build plus scoped lint pass.
- Web typecheck — passed.
- Web lint — passed.
- Web build — passed; existing Vite dynamic-import warning emitted.
- Backend full Jest — 126 suites/1,648 tests passed, with unrelated failures in the dirty `edutu-api-docs.controller.ts` (`TS1010`/related parse/type errors). The scoped Task 8 suites pass independently.
- Web full Jest — 49 files/295 tests passed; one unrelated dirty `scholarshipEnginePages.test.tsx` expectation failed because its dirty developer-page changes are incomplete.

## Scope protection

Billing files, billing types, new Bachs files, unrelated docs, migrations, and
temporary Supabase files were not staged. The focused Task 8 commit was
assembled from an explicit Task 8 path list only.

## Commit

`54ee61f fix: fence Task 8 verification leases`
