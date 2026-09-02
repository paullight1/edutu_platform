# Opportunity Pipeline PR 2 — State and Schema Review

## Scope

PR 2 adds only the backend domain vocabulary and additive persistence foundation for the intentional opportunity pipeline.

It does not add controllers, repositories, recommendation logic, preparation templates, web or mobile UI, legacy backfill, remote migration execution, or feature-flag activation.

## State contract

The persisted journey states are:

```text
shortlisted
pursuing
preparing
ready_to_apply
application_opened
applied
interview
offer
rejected
withdrawn
no_response
expired
archived
```

The learner-facing stages remain:

```text
Discover
Pursuing
Applied
Outcome
```

`application_opened` is deliberately separate from `applied`. A generic state transition cannot confirm an application or write an outcome. Later API work must use dedicated application-confirmation and outcome actions.

## Additive database objects

The canonical migration creates:

- `opportunity_intents`
- `user_opportunity_journeys`
- `opportunity_journey_tasks`
- `opportunity_journey_events`

The migration does not alter or delete an existing table.

Important invariants are enforced in PostgreSQL:

- one active intent per user;
- one journey per user and opportunity;
- one active primary pursuit per user;
- unique task positions within a journey;
- unique event idempotency keys per user;
- bounded state, priority, eligibility, outcome, task, source, horizon, and readiness vocabularies;
- positive journey versions and non-negative task positions.

All four tables have row-level security enabled. `anon` and `authenticated` receive no table privileges or direct policies. These records are owned by the NestJS API.

## Drizzle composition

The existing `src/db/schema.ts` is already broad. PR 2 therefore keeps the new mappings in the cohesive `src/db/opportunity-journey.schema.ts` module and composes it with the existing schema through `src/db/all-schema.ts`.

Both the runtime database client and Drizzle Kit use the composed schema. This avoids increasing the responsibility of the existing schema file while keeping one complete runtime schema object.

## Local review

Create an isolated worktree from the exact PR head:

```bash
git fetch origin --prune
git worktree add -b review/opportunity-pipeline-pr2 ../edutu-opportunity-pr2-review origin/feat/opportunity-pipeline-pr2
cd ../edutu-opportunity-pr2-review

git rev-parse HEAD
git status --short
git diff --stat origin/feat/opportunity-pipeline-pr1...HEAD
git diff --check origin/feat/opportunity-pipeline-pr1...HEAD
```

From `backend/services/services/api` run:

```bash
npm ci
npm test -- --runInBand \
  opportunity-journey-state.spec.ts \
  opportunity-journey-schema.contract.spec.ts
npm run lint
npm run build
```

From the repository root run:

```bash
node scripts/check-migration-timestamps.mjs
```

Do not run a migration command during source review.

## Staging sequence

After PR 1 is merged into `develop`:

1. rebase or rebuild PR 2 on the exact `develop` head;
2. retarget PR 2 to `develop`;
3. rerun the full repository checks;
4. complete exact-SHA local review;
5. merge PR 2 into `develop` only;
6. apply the migration to the isolated staging database;
7. verify the four tables, constraints, RLS state, and API service access;
8. leave all opportunity-pipeline feature flags disabled.

## Rollback

Before any staging migration is applied, rollback is simply closing the PR or disabling the branch deployment.

After an additive staging migration is applied, application rollback does not require dropping tables because no runtime feature uses them yet and all feature flags remain off. Preserve the schema for diagnosis unless the staging environment must be reset.

Production rollback is not part of PR 2. Production migration requires a later reviewed `develop` to `main` release, a backup, an exact migration inventory, and explicit promotion approval.
