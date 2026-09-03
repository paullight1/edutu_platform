# Opportunity Pipeline PR 3 — Domain Foundation Review

## Scope

PR 3 adds backend-only domain capabilities on top of the PR 2 schema:

- transactional journey persistence;
- an immutable, idempotent event ledger;
- optimistic journey version checks;
- non-blocking current-intent inference and explicit persistence;
- shared eligibility-profile mapping;
- focused decision support;
- deterministic preparation templates;
- effort estimates, task scheduling, progress, and one next action.

It does not add public API endpoints, learner UI, feature activation, legacy backfill, notifications, analytics dashboards, or a remote migration execution.

## Exact source review

Review from an isolated worktree after fetching the branch:

```bash
git fetch origin --prune
git worktree add \
  -b review/opportunity-pipeline-pr3 \
  ../edutu-opportunity-pr3-review \
  origin/feat/opportunity-pipeline-pr3
cd ../edutu-opportunity-pr3-review

git rev-parse HEAD
git status --short
git diff --stat origin/feat/opportunity-pipeline-pr2...HEAD
git diff --check origin/feat/opportunity-pipeline-pr2...HEAD
```

The PR remains Draft until the exact current SHA is copied from the PR and reviewed locally. Any later commit invalidates the prior local approval.

## Verification

```bash
cd backend/services/services/api
npm ci
npm test -- --runInBand \
  opportunity-journey-state.spec.ts \
  opportunity-journey-schema.contract.spec.ts \
  opportunity-journeys.repository.spec.ts \
  eligibility-profile.util.spec.ts \
  eligibility.util.spec.ts \
  opportunity-decision-support.spec.ts \
  opportunity-intent.service.spec.ts \
  opportunity-journey-templates.spec.ts \
  opportunity-effort.spec.ts \
  opportunity-next-action.spec.ts
npm run lint
npm run build

cd ../../../..
node scripts/check-migration-timestamps.mjs
```

Do not run `db:migrate`, `db:push`, `db:seed`, or `supabase db push` during source review.

## Behaviour to inspect

- Reusing an idempotency key with the same mutation returns the original result.
- Reusing it with a different mutation fails closed.
- A stale expected version returns the current journey rather than silently overwriting it.
- Generic state transitions cannot mark an application submitted or record an outcome.
- Missing structured eligibility is shown as unclear, not falsely eligible.
- Explicit eligibility blockers are shown as ineligible.
- Current intent is inferred without blocking the user and is persisted only when required or explicitly saved.
- Preparation tasks are deterministic and end with opening the official application.
- Every active journey produces one next action.
- The event table rejects update and delete operations.

## Database safety

The only additional migration in PR 3 makes the event ledger append-only. It does not modify or delete product data. No remote database was changed while building this PR.

## Rollback

Before any staging migration, close the PR or delete the branch. After the additive migration has been tested in staging, the trigger and inert tables may remain while all pipeline feature flags stay disabled. Removing event immutability is not part of a routine application rollback; corrections must be represented by new events.
