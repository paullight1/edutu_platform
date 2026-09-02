# Local Review, Staging, and Production Release Runbook

## Policy

Edutu separates four decisions:

1. **Implementation:** code exists on a feature or hotfix branch.
2. **Local approval:** the exact current commit has been reviewed in a clean local worktree.
3. **Staging approval:** the exact release commit has been reviewed in a non-production deployment.
4. **Production promotion:** the approved deployment is deliberately released to production.

A merge is not a substitute for local or staging review. A new commit invalidates
prior evidence because the pull-request head SHA changes.

## Branch model

```text
feature/* or fix/*
        ↓ pull request
      develop
        ↓ staging deployment and release pull request
       main
        ↓ manual production promotion
    production
```

Normal rules:

- Feature and ordinary fix pull requests use `Release-Type: feature` and target
  `develop`.
- Production release pull requests use `Release-Type: release`, originate from
  `develop`, and target `main`.
- Emergency production fixes use `Release-Type: hotfix`, originate from a
  `hotfix/*` branch, and target `main`.
- Direct pushes to `main` or `develop` are prohibited after repository rulesets
  are enabled.

## Review the exact pull request locally

### 1. Fetch and create an isolated worktree

From the existing local repository:

```bash
git fetch origin --prune

git worktree add \
  -b review/pr-85 \
  ../edutu-pr-85 \
  origin/hotfix/release-safety-bootstrap

cd ../edutu-pr-85
```

For another pull request, replace the PR number and remote branch. A worktree
keeps the review isolated from the developer's normal checkout.

### 2. Confirm the exact commit

```bash
git rev-parse HEAD
git status --short
git diff --stat origin/main...HEAD
```

The worktree must be clean. The SHA shown by `git rev-parse HEAD` must equal the
head SHA shown on GitHub.

### 3. Run the non-mutating review command

For a feature pull request into `develop`:

```bash
node scripts/local-review.mjs --base origin/develop --install
```

For a release or hotfix pull request into `main`:

```bash
node scripts/local-review.mjs --base origin/main --install
```

To inspect the selected commands without running them:

```bash
node scripts/local-review.mjs --base origin/develop --dry-run
```

The command:

- detects changed repository surfaces;
- runs the existing lint, test, type-check, build, PWA, and governance commands
  required for those surfaces;
- never runs a migration, seed, remote settings write, or deployment command;
- refuses to approve `main` or a dirty worktree;
- prints exact-SHA approval lines only after every selected command succeeds.

### 4. Review the application interactively

Automated checks do not replace visual and workflow review.

Backend terminal:

```bash
cd backend/services/services/api
npm run dev
```

Admin terminal:

```bash
cd admin
VITE_BACKEND_URL=http://localhost:3000 npm run dev
```

Web terminal:

```bash
cd edutu-web-app
npm run dev
```

Mobile terminal when the PR affects Expo:

```bash
cd edutumobile
npm run dev
```

Use test accounts and a local or staging backend. Do not use production secrets,
a production service-role key, a writable production database, production
Paystack credentials, or production webhook destinations during local review.

### 5. Bind approval to the SHA

Copy the output into the pull-request body:

```text
Local-Review-Approved: yes
Local-Review-SHA: <40-character current head SHA>
```

Then mark the pull request Ready for review. The Local Review Gate reruns when:

- the PR body is edited;
- the PR becomes ready;
- the branch receives another commit;
- the PR is reopened;
- the PR is converted back to draft.

A stale SHA blocks the non-draft PR.

## Preview and staging review

### Feature preview

Each feature branch should receive a preview deployment where hosting supports
it. Preview environment variables must point to staging services, never the
production database or production API.

Review at least:

- authentication and test-account access;
- changed user journeys;
- responsive web behaviour;
- admin controls affected by the PR;
- error, loading, empty, offline, and retry states;
- logs for new errors;
- existing routes and rollback behaviour.

### Permanent staging

The `develop` branch is the integration and staging branch. Configure:

```text
staging.edutu.org
admin-staging.edutu.org
api-staging.edutu.org
```

Staging must have separate resources:

- Supabase project and service-role key;
- Clerk test configuration;
- Paystack test mode;
- Redis/cache instance;
- webhook endpoints;
- AI test keys, limits, or budgets;
- Vercel/Render environment variables.

Do not share writable production data with staging. Use anonymised fixtures or a
staging-only seed process.

## Release pull request

When approved feature PRs have been integrated and reviewed on `develop`, open:

```text
develop → main
```

Use this evidence:

```text
Release-Type: release
Local-Review-Approved: yes
Local-Review-SHA: <release head SHA>
Staging-Review-Approved: yes
Staging-Review-SHA: <same release head SHA>
```

Local and staging SHAs must both equal the current PR head. If the release branch
moves, repeat the relevant checks and update the evidence.

## Production promotion

Merging the release PR authorises a production candidate; it should not
implicitly place traffic on an unreviewed deployment.

### Web and admin

Configure Vercel so pull requests and `develop` create preview/staging
deployments. Production should require deliberate promotion of the reviewed
candidate. Before promotion:

- inspect the deployment commit SHA;
- run smoke checks against the candidate URL;
- inspect recent deployment errors;
- confirm production environment variables are present;
- confirm all opportunity-pipeline flags remain at their intended values.

Promote only the reviewed candidate. Keep the previous production deployment
available for immediate rollback.

### Backend

Configure a separate staging API service from `develop`. The production backend
should either have automatic deploy disabled or wait for all required checks and
a manual approval. Deploy the exact approved release SHA, then run health and
production smoke checks.

### Mobile

A Git merge does not itself release an App Store or Play Store build. Build from
the approved release SHA, test the signed candidate, use internal testing tracks,
and promote only after store-build review. OTA updates must follow the same
release evidence and rollback policy.

## Database changes

Database PRs add a separate gate:

1. Apply the migration to a local disposable database.
2. Apply it to staging.
3. Run compatibility and backfill checks.
4. Record staging evidence and recovery procedure.
5. Back up production.
6. Approve and run the production migration manually.
7. Deploy a backend version compatible with both old and new states where
   possible.
8. Enable user-facing flags only after schema, API, and clients are compatible.

The local-review command intentionally never runs `db:migrate`, `db:push`,
`db:seed`, or `supabase db` commands.

## Hotfixes

Use a branch named `hotfix/<description>` and target `main` directly only for an
urgent production correction. Hotfixes still require:

- exact-SHA local review;
- tests appropriate to the affected surface;
- staging or a production-candidate review;
- exact-SHA staging evidence;
- manual production promotion;
- immediate back-merge or equivalent integration into `develop` after release.

## Repository settings checklist

These settings are account-level and cannot be guaranteed by repository files.
Configure them in GitHub after this bootstrap PR is accepted.

### `main` ruleset

- Require a pull request.
- Block direct and force pushes.
- Block branch deletion.
- Require conversation resolution.
- Require the branch to be up to date.
- Require successful CI, Architecture Boundaries, and Local Review Evidence.
- Require a successful staging deployment when GitHub deployment environments
  are configured.
- Do not enable automatic merge to production.

### `develop` ruleset

- Require a pull request.
- Block direct and force pushes.
- Require successful CI, Architecture Boundaries, and Local Review Evidence.
- Require exact-SHA local review before a PR leaves draft.

For a solo-maintainer repository, an unavailable second reviewer must not make
all releases impossible. Keep the exact-SHA local and staging gates mandatory,
and add an independent reviewer requirement when a second authorised reviewer
is consistently available.

## Rollback

### Before production promotion

- Keep the PR unmerged or keep the production candidate unpromoted.
- Convert the PR back to draft when more work is required.
- Any new commit automatically invalidates the old SHA evidence.

### After web/admin promotion

- Reassign production traffic to the previous known-good deployment.
- Disable newly introduced feature flags where available.
- Record the failed release SHA and preserve logs.

### After backend promotion

- Deploy the previous compatible backend SHA.
- Avoid destructive database rollback unless a reviewed recovery script exists.
- Prefer forward repair for additive migrations.

### After mobile release

- Disable affected remote flags.
- Publish a tested OTA correction only when compatible.
- Otherwise prepare a store hotfix from a reviewed SHA.

## Bootstrap sequence for the opportunity-pipeline work

1. Review and merge the release-safety bootstrap PR using this runbook.
2. Create `develop` from the then-current `main`.
3. Configure GitHub rulesets and staging hosting/resources.
4. Retarget opportunity-pipeline PR #82 from `main` to `develop`.
5. Change PR #82 to `Release-Type: feature`.
6. Check out its exact current head SHA locally and run:

   ```bash
   node scripts/local-review.mjs --base origin/develop --install
   ```

7. Add exact-SHA evidence and mark it ready only after local review.
8. Merge PR #82 into `develop`, review staging, and leave production unchanged.
9. Release to `main` later through a separate `develop → main` release PR.
