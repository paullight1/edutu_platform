# Task 8 report — opportunity submission review and global publication

## Status

Implemented and verified. User submissions are review-only: the API always stores `pending`, regardless of the admin content setting. Only the admin review route can approve a submission, and approval creates/links an `active` catalog opportunity before returning an approved result.

## Files changed

- `backend/services/services/api/src/opportunity-submissions/opportunity-submissions.service.ts`
  - Removed user-side auto-publication.
  - Added active catalog creation at admin approval.
  - Added idempotent reuse/reactivation for an existing approved catalog link.
  - Requires a safe HTTP(S) apply URL before approval.
  - Persists a generic recoverable pending state and emits an alert-level log when catalog creation fails.
- `backend/services/services/api/src/opportunity-submissions/dto/opportunity-submission.dto.ts`
  - Rejects dangerous URL protocols.
  - Bounds `extra` to 20 scalar metadata keys with bounded key/value lengths.
  - Rejects unknown top-level submission fields, including client publication status.
- `backend/services/services/api/src/opportunity-submissions/opportunity-submissions.service.spec.ts`
  - Covers pending-only submit, validation, ownership isolation, approval/linking, rejection, needs-info response, and recoverable publication failure.
- `backend/services/services/api/src/opportunities/opportunities.controller.spec.ts`
  - Covers active-only learner feed delegation.
- `backend/services/services/api/src/edutu-api/edutu-api.controller.spec.ts`
  - Covers an approved catalog fixture through the `/v1` opportunity response.
- `edutu-web-app/src/components/SubmitOpportunityPage.tsx`
  - Keeps submission copy and success messaging review-only even when settings disable approval.
- `edutu-web-app/src/test/__tests__/opportunitySubmission.test.tsx`
  - Covers review-only web submission behavior.
- `.superpowers/sdd/2026-08-12-edutu-api-production-plan/task-8-report.md`
  - This report.

No migration was required: the existing submission table already has `status`, `admin_note`, review audit fields, and `approved_opportunity_id`; the existing learner and Edutu API catalog paths already filter for `opportunities.status = 'active'`.

## Commit

Final focused `HEAD` commit on this branch (`feat: publish approved user opportunities globally`); resolve the exact hash with `git rev-parse HEAD`.

## Tests and results

- Focused backend: `npm test -- --runInBand src/opportunity-submissions/opportunity-submissions.service.spec.ts src/opportunities/opportunities.controller.spec.ts src/edutu-api/edutu-api.controller.spec.ts` — 3 suites, 15 tests passed.
- Focused web: `npm test -- --run src/test/__tests__/opportunitySubmission.test.tsx` — 1 test passed.
- Backend full suite: `npm test -- --runInBand` — 125 suites, 1,651 tests passed. Jest reported its existing open-handle warning after completion.
- Web full suite: `npm test -- --reporter=dot` — 50 files, 296 tests passed. Existing intentional error-path logging from `example.test.tsx` and cache fallback tests was emitted.
- Backend build: `npm run build` — passed.
- Backend lint: `npm run lint -- --no-warn-ignored` — passed.
- Web typecheck: `npm run typecheck` — passed.
- Web lint: `npm run lint` — passed.
- Web build: `npm run build` — passed. Vite emitted its existing ineffective dynamic-import warning.
- `git diff --check` — passed.

## Concerns / follow-up

- Approval failures use the existing user-visible `admin_note` field for a generic retryable message rather than adding a new review-error column. The detailed failure remains in the alert-level server log.
- The full backend suite still reports an open-handle warning; it does not affect the zero-failure result.
- The web build regenerates `edutu-web-app/public/sitemap.xml`; that generated change was restored because it is outside Task 8.
