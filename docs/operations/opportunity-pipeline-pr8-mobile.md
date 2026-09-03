# Opportunity Pipeline PR 8 — Mobile Core and Home Review

## Scope

PR 8 adds the mobile foundation for the intentional opportunity pipeline:

- typed API-only journey service;
- user-scoped last-good read snapshots;
- idempotent queued writes for temporary offline/server failure;
- replay using the original idempotency key and expected version;
- focused-home and journey hooks;
- current-theme home components for focus, one next action, active pursuits, and three recommendations;
- one guarded insertion that replaces only the existing personalised rail when `opportunity_pipeline_home` is enabled.

The existing Home remains unchanged when the flag is false, the user is signed out, or guest browsing is active. No mobile journey write uses the Supabase client.

## Exact source review

```bash
git fetch origin --prune
git worktree add \
  -b review/opportunity-pipeline-pr8 \
  ../edutu-opportunity-pr8-review \
  origin/feat/opportunity-pipeline-pr8
cd ../edutu-opportunity-pr8-review

git rev-parse HEAD
git status --short
git diff --stat origin/feat/opportunity-pipeline-pr4...HEAD
git diff --check origin/feat/opportunity-pipeline-pr4...HEAD
```

Any later commit invalidates the local approval.

## Verification

```bash
cd edutumobile
npm ci
npm test -- opportunityJourney --runInBand
npm run typecheck
npm run lint
npm run dev
```

Use development or staging credentials only. Do not point this review build at a writable production database or production payment/webhook environment.

## Behaviour to inspect

- With `opportunity_pipeline_home` false, Home is visually and functionally unchanged.
- With the flag true for a signed-in non-guest user, the existing personalised recommendation rail is replaced by the intentional section; no duplicate recommendation feed appears.
- Current focus uses existing theme tokens and can be edited without opening full onboarding.
- One next action appears before recommendations when an active pursuit exists.
- No more than three active pursuits and three recommendations are shown.
- Pursue and Save call the journey API; Pass uses the existing dismissal signal.
- An offline write shows pending-sync feedback and replays with the same key/version.
- A validation rejection is shown and is not queued.
- A stale read is labelled as the last synced path.
- Light and dark theme remain readable.
- Existing Home, Explore, Groups, and opportunity-detail navigation continue to work.

## Rollback

Disable `opportunity_pipeline_home`. The existing Home rail immediately becomes authoritative again. The mobile branch creates no schema and performs no deployment or remote write during source review.
