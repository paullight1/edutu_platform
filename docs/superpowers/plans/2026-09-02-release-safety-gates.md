# Edutu Release Safety Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require exact-commit local review before feature PRs can leave draft, add a permanent `develop` staging route, and keep production release as a separate, explicitly approved decision.

**Architecture:** A pure Node module validates review evidence embedded in a PR body against the PR head SHA, base branch, head branch, draft state, and release type. A dedicated GitHub Actions workflow invokes that validator on PR lifecycle events. A cross-platform local-review CLI detects changed repository surfaces, runs the existing verification commands, and emits the exact approval block only after successful checks. Existing CI and architecture workflows are extended to PRs targeting `develop`; no product runtime, learner UI, database schema, or production deployment configuration changes in this PR.

**Tech Stack:** Node.js 22 built-ins, GitHub Actions, existing npm workspace scripts, Markdown runbooks.

**Spec:** Approved workflow in the Edutu opportunity-pipeline review: feature branch → exact-SHA local review → CI/preview → `develop` staging → release PR → manual production promotion.

## Global Constraints

- All product and opportunity-pipeline feature flags remain off.
- Do not change learner-facing web or mobile UI.
- Do not create, alter, or run a database migration.
- Do not store secrets or local environment files in the repository.
- Feature PRs target `develop`; release PRs target `main` from `develop`; hotfixes target `main` from `hotfix/*`.
- A non-draft PR must carry `Local-Review-Approved: yes` and a `Local-Review-SHA` equal to the current PR head SHA.
- A release or hotfix PR into `main` must additionally carry staging approval tied to the same current head SHA.
- Draft PRs remain usable while evidence is incomplete.
- The local-review command is non-mutating: it may install dependencies and run tests/builds, but it must not run migrations, seed data, start production services, or write remote configuration.
- Branch protection, hosting project settings, staging secrets, and manual promotion remain explicit account-level actions documented in the runbook.

---

### Task 1: Specify release-evidence and surface-detection behaviour

**Files:**
- Create: `scripts/release-review.test.mjs`

**Interfaces:**
- Consumes: Node `assert`, `node:test`, filesystem fixtures.
- Produces expected contracts for `parseReviewMarkers(body)`, `validatePullRequestReview(input)`, `detectChangedSurfaces(paths)`, `buildVerificationPlan(surfaces, options)`, and repository workflow/template files.

- [ ] Write tests for draft bypass, exact local SHA, stale local SHA, feature-to-main rejection, feature-to-develop acceptance, release-from-develop staging evidence, hotfix branch rules, malformed markers, changed-surface detection, and command selection.
- [ ] Write static-file tests requiring `develop` in CI and architecture PR triggers, exact evidence markers in the PR template, and the dedicated gate workflow event list.
- [ ] Commit only the tests and this plan.
- [ ] Open a draft PR and record the expected RED workflow result.

### Task 2: Implement pure validator and local-review CLI

**Files:**
- Create: `scripts/release-review.mjs`
- Create: `scripts/check-release-review.mjs`
- Create: `scripts/local-review.mjs`

**Interfaces:**
- `parseReviewMarkers(body: string): Record<string, string>`
- `validatePullRequestReview(input): { ok: boolean; status: string; errors: string[] }`
- `detectChangedSurfaces(paths: string[]): Set<'governance'|'backend'|'admin'|'web'|'mobile'|'voice'|'scraper'|'docs'>`
- `buildVerificationPlan(surfaces, { install }): Array<{ cwd: string; command: string; args: string[]; label: string }>`

- [ ] Implement only the behaviour required by Task 1 tests.
- [ ] Use `spawnSync` with inherited stdio for local commands.
- [ ] Refuse local approval on `main`, on a dirty worktree, or when any selected command fails.
- [ ] Resolve base to explicit `--base`, otherwise `origin/develop` when available, otherwise `origin/main`.
- [ ] Print a copyable approval block containing the exact current SHA only after all commands pass.
- [ ] Keep `--dry-run` available for reviewing the plan without executing it.

### Task 3: Wire GitHub review and staging gates

**Files:**
- Create: `.github/workflows/local-review-gate.yml`
- Create: `.github/pull_request_template.md`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/architecture-governance.yml`

**Interfaces:**
- Workflow passes PR metadata through environment variables to `scripts/check-release-review.mjs`.
- PR body markers are the durable human-review evidence contract.

- [ ] Trigger the gate on opened, edited, synchronize, reopened, ready-for-review, and converted-to-draft events for PRs targeting `main` or `develop`.
- [ ] Keep draft PRs green with an explicit informational result.
- [ ] Require exact-SHA evidence for non-draft PRs.
- [ ] Run existing CI and architecture checks for PRs targeting `develop` as well as `main`.
- [ ] Preserve all existing jobs and production push triggers.

### Task 4: Document and verify the operating procedure

**Files:**
- Create: `docs/runbooks/local-review-and-release.md`
- Modify: `docs/OPERATIONS.md`
- Modify: `README.md`

- [ ] Document worktree checkout, environment separation, local review commands, evidence update, preview review, `develop` staging, release PR, production promotion, hotfixes, database releases, and rollback.
- [ ] State that PR #82 remains draft until this process is adopted and its exact head SHA is reviewed.
- [ ] Document manual repository ruleset and hosting configuration because the repository cannot enforce account-level settings itself.
- [ ] Run the root release-review tests.
- [ ] Run workflow syntax/static checks through the tests.
- [ ] Run all changed-surface CI jobs and inspect their logs.
- [ ] Review the final diff against this plan and the Edutu code-review contract.
- [ ] Leave the PR draft for the user's own local review; do not merge it.
