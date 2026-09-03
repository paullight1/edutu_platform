# Opportunity Pipeline PR 4 — API Vertical Slice Review

## Scope

PR 4 adds the first complete backend vertical slice for the intentional opportunity journey:

- bounded, intent-aware recommendations;
- shortlist and active-pursuit creation;
- one primary plus two secondary active-pursuit limits;
- deterministic tasks, progress, and one next action;
- separate application-opened and application-confirmed transitions;
- dedicated outcome transitions;
- authenticated NestJS endpoints;
- one aggregate opportunity-home response.

No web or mobile UI is enabled. No remote migration, deployment, legacy backfill, notification, or analytics job is executed by this PR.

## Exact source review

```bash
git fetch origin --prune
git worktree add \
  -b review/opportunity-pipeline-pr4 \
  ../edutu-opportunity-pr4-review \
  origin/feat/opportunity-pipeline-pr4
cd ../edutu-opportunity-pr4-review

git rev-parse HEAD
git status --short
git diff --stat origin/feat/opportunity-pipeline-pr3...HEAD
git diff --check origin/feat/opportunity-pipeline-pr3...HEAD
```

Copy the current PR head SHA from GitHub before review. Any later commit invalidates the approval.

## Verification

```bash
cd backend/services/services/api
npm ci
npm test -- --runInBand \
  opportunity-shortlist.service.spec.ts \
  opportunity-journeys.service.spec.ts \
  opportunity-home.service.spec.ts \
  opportunity-journeys.controller.spec.ts
npm run test:e2e -- --runInBand opportunity-journeys.e2e-spec.ts
npm run lint
npm run build

cd ../../../..
node scripts/check-migration-timestamps.mjs
```

Do not run `db:migrate`, `db:push`, `db:seed`, or `supabase db push` during source review.

## Behaviour to inspect

- Focused recommendations default to three and are capped at five.
- Existing journey opportunity IDs are excluded from focused recommendations.
- Explicitly ineligible opportunities are excluded from the focused shortlist.
- Intent fit changes ordering but does not replace the existing match score.
- Recommendation degradation is disclosed while active guidance remains available.
- The first active pursuit becomes primary; the next two become secondary.
- A fourth active pursuit is blocked with the current active pursuits in the error payload.
- Required tasks cannot be skipped.
- Completing all required tasks moves the journey to ready to apply.
- Opening the external application writes `application_opened` only.
- Only explicit confirmation writes `applied` and emits the existing apply signal.
- Outcome updates use the dedicated endpoint and state authority.
- Requests require authentication, validation, idempotency, and expected-version data.

## Rollback

This PR does not enable any learner surface. Before staging, close the PR. After it is merged to `develop`, rollback consists of disabling every opportunity-pipeline flag and reverting the application commit if needed. The additive PR 2/PR 3 tables and event history may remain inert. No production rollback or database down-migration should be attempted from this branch.
