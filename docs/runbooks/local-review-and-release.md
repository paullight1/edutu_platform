# Local Review, Staging, and Production Release Runbook

## Policy

Edutu separates four decisions:

1. **Implementation:** code exists on a feature branch.
2. **Local approval:** the exact current commit has been reviewed in a clean local worktree.
3. **Staging approval:** the exact release commit has been reviewed in a non-production deployment.
4. **Production promotion:** the approved deployment is deliberately released to production.

A merge is not a substitute for local or staging review. A new commit invalidates prior evidence because the pull-request head SHA changes.

## Branch model

```text
feature/*, fix/*, chore/*, or docs/*
                 ↓ pull request
               develop
                 ↓ staging deployment and release pull request
                main
                 ↓ manual production promotion
             production
```

Normal rules:

- Feature and ordinary fix pull requests use `Release-Type: feature` and target `develop`.
- Production release pull requests use `Release-Type: release`, originate from `develop`, and target `main`.
- Emergency production fixes use `Release-Type: hotfix`, originate from a `hotfix/*` branch, and target `main`.
- Direct pushes to `main` or `develop` are prohibited after repository rulesets are enabled.

`develop` was created from the unchanged production commit before release-safety PR #85 was retargeted. This allows the bootstrap to merge into a non-production branch first.

## Review the exact pull request locally

### 1. Fetch and create an isolated worktree

For release-safety PR #85:

```bash
git fetch origin --prune

git worktree add \
  -b review/pr-85 \
  ../edutu-pr-85 \
  origin/hotfix/release-safety-bootstrap

cd ../edutu-pr-85
```

For another pull request, replace the PR number, local review-branch name, and remote source branch. A worktree keeps review isolated from the developer's normal checkout.

### 2. Confirm the exact commit and base

For a feature pull request into `develop`:

```bash
git rev-parse HEAD
git rev-parse origin/develop
git status --short
git diff --stat origin/develop...HEAD
```

For a release or hotfix into `main`, compare against `origin/main` instead.

The worktree must be clean. The SHA shown by `git rev-parse HEAD` must equal the head SHA shown on GitHub. Repository rules should require the branch to be up to date before merge so a base-branch change forces another review cycle.

### 3. Run the non-mutating review command

Feature pull request into `develop`:

```bash
node scripts/local-review.mjs --base origin/develop --install
```

Release or hotfix into `main`:

```bash
node scripts/local-review.mjs --base origin/main --install
```

Inspect the selected commands without running them:

```bash
node scripts/local-review.mjs --base origin/develop --dry-run
```

The command:

- detects changed repository surfaces;
- runs the existing lint, test, type-check, build, PWA, and governance commands required for those surfaces;
- never runs a migration, seed, remote settings write, or deployment command;
- refuses to approve `main` or a dirty worktree;
- prints exact-SHA approval lines only after every selected command succeeds.

A repository-wide baseline failure also blocks local approval. Do not suppress a failing gate merely because it predates the feature; repair or explicitly resolve the baseline in a separate PR.

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

Use test accounts and a local or staging backend. Do not use production secrets, a production service-role key, a writable production database, production Paystack credentials, or production webhook destinations during local review.

### 5. Bind approval to the current SHA

Copy the command output into the pull-request body:

```text
Local-Review-Approved: yes
Local-Review-SHA: <40-character current head SHA>
```

The markers are a maintainer attestation, not cryptographic proof that a command ran. Only the maintainer who performed or directly observed the local review should change them to `yes`. Do not delegate this edit to untrusted automation or an external PR author.

Then mark the pull request Ready for review. The Local Review Gate reruns when:

- the PR body is edited;
- the PR becomes ready;
- the branch receives another commit;
- the PR is reopened;
- the PR is converted back to draft.

A stale SHA blocks the non-draft PR.

## Trusted gate execution

The sensitive evidence workflow uses `pull_request_target`, read-only repository permissions, and the target branch's exact base SHA. It does not check out or execute code from the pull-request branch. This prevents a PR from weakening its own release validator.

A separate ordinary pull-request workflow tests proposed policy-code changes. It is verification, not the trusted merge gate.

## Preview and staging review

### Feature preview

Each feature branch should receive a preview deployment where hosting supports it. Preview environment variables must point to staging services, never the production database or production API.

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
- Redis/cache instance where required;
- webhook destinations;
- AI test keys, limits, or budgets;
- Vercel/Render environment variables.

Do not share writable production data with staging. Use anonymised fixtures or a staging-only seed process.

## Release pull request

When approved work has been integrated and reviewed on `develop`, open:

```text
develop → main
```

Use:

```text
Release-Type: release
Local-Review-Approved: yes
Local-Review-SHA: <release head SHA>
Staging-Review-Approved: yes
Staging-Review-SHA: <same release head SHA>
```

Local and staging SHAs must both equal the current PR head. If `develop` moves, repeat the relevant checks and update the evidence.

The first release-safety promotion from `develop` to `main` is a bootstrap exception because the trusted target-branch workflow is not present on `main` until that release lands. It still requires manual exact-SHA local review, staging review, successful policy tests, and explicit production approval. After that release, configure `main` to require `Local Review Evidence` for every later production PR.

## Production promotion

Merging the release PR authorises a production candidate; it should not implicitly place traffic on an unreviewed deployment.

### Web and admin

Configure hosting so pull requests and `develop` create preview/staging deployments. Production should require deliberate promotion of the reviewed candidate. Before promotion:

- inspect the deployment commit SHA;
- run smoke checks against the candidate URL;
- inspect recent deployment errors;
- confirm production environment variables are present;
- confirm feature flags remain at their intended values.

Promote only the reviewed candidate. Keep the previous production deployment available for immediate rollback.

### Backend

Configure a separate staging API service from `develop`. The production backend should have automatic deployment disabled or require a protected manual approval after all required checks. Deploy the exact approved release SHA, then run health and production smoke checks.

### Mobile

A Git merge does not itself release an App Store or Play Store build. Build from the approved release SHA, test the signed candidate through internal distribution, and promote only after store-build review. OTA updates follow the same evidence and rollback policy.

## Database changes

Database PRs add a separate gate:

1. Apply the migration to a local disposable database.
2. Apply it to staging.
3. Run compatibility and backfill checks.
4. Record staging evidence and the recovery procedure.
5. Back up production.
6. Approve and run the production migration manually.
7. Deploy a backend version compatible with both old and new states where possible.
8. Enable user-facing flags only after schema, API, and clients are compatible.

The local-review command intentionally never runs `db:migrate`, `db:push`, `db:seed`, or `supabase db` commands.

## Hotfixes

Use `hotfix/<description>` and target `main` directly only for an urgent production correction. Hotfixes still require:

- exact-SHA local review;
- tests appropriate to the affected surface;
- staging or production-candidate review;
- exact-SHA staging evidence;
- manual production promotion;
- immediate integration back into `develop` after release.

## Repository settings checklist

These settings are account-level and cannot be guaranteed by repository files. Track them in issue #86.

### `main` ruleset

- Require a pull request.
- Block direct pushes, force pushes, and deletion.
- Require conversation resolution.
- Require the branch to be up to date.
- Require successful CI checks.
- Require `Architecture Boundaries`.
- Require `Local Review Evidence` after the bootstrap release installs it on `main`.
- Require a successful staging deployment when GitHub environments are connected.
- Do not enable automatic merge or automatic production promotion.

### `develop` ruleset

- Require a pull request.
- Block direct pushes, force pushes, and deletion.
- Require conversation resolution.
- Require the branch to be up to date.
- Require successful CI checks.
- Require `Architecture Boundaries`.
- Require `Local Review Evidence` after PR #85 is merged into `develop`.

For a solo-maintainer repository, an unavailable second reviewer must not make all releases impossible. Keep exact-SHA local and staging gates mandatory, and add an independent reviewer requirement when a second authorised reviewer is consistently available.

## Rollback

### Before production promotion

- Keep the PR unmerged or keep the production candidate unpromoted.
- Convert the PR back to draft when more work is required.
- Any new commit automatically invalidates the old SHA evidence.

### After web/admin promotion

- Return production traffic to the previous known-good deployment.
- Disable newly introduced feature flags where available.
- Record the failed release SHA and preserve logs.

### After backend promotion

- Deploy the previous compatible backend SHA.
- Avoid destructive database rollback unless a reviewed recovery script exists.
- Prefer forward repair for additive migrations.

### After mobile release

- Disable affected remote flags.
- Publish a tested compatible OTA correction where appropriate.
- Otherwise prepare a store hotfix from a reviewed SHA.

## Bootstrap sequence for the opportunity-pipeline programme

1. `develop` already exists at the unchanged pre-bootstrap `main` commit.
2. Review PR #85 locally at its exact current head SHA using:

   ```bash
   node scripts/local-review.mjs --base origin/develop --install
   ```

3. Keep PR #85 draft until local review passes and its SHA evidence is updated.
4. Merge PR #85 into `develop`, not `main`.
5. Confirm the `develop` push runs CI, Architecture Governance, Release Policy Tests, and the trusted Local Review Gate is now available for later PRs.
6. Configure isolated staging services and the `develop` ruleset from issue #86.
7. Review the release-safety behaviour on staging.
8. Open a focused `develop → main` release PR containing the release-safety infrastructure only.
9. Perform exact-SHA local and staging review, then manually approve its production promotion.
10. Configure the `main` ruleset after the gate exists on `main`.
11. Retarget opportunity-pipeline PR #82 from `main` to `develop` and set `Release-Type: feature`.
12. Review PR #82 locally, merge it only into `develop`, and review it on staging with all opportunity-pipeline flags initially off.
13. Release opportunity-pipeline work to `main` later through a separate, reviewed `develop → main` release PR.
