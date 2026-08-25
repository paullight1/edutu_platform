# Edutu Branch Consolidation Design

**Date:** 2026-08-25

## Goal

Consolidate the still-relevant work from Edutu's outstanding branches into a tested integration branch, then merge that verified branch into `main` without disturbing concurrent admin work or importing stale and superseded changes.

## Current State

- `origin/main` is the baseline branch.
- The refreshed remote inventory contains 66 branches.
- Fourteen remote branch tips are ancestors of `origin/main`.
- Fifty-two remote branch tips are not ancestors of `origin/main`.
- Fourteen of those fifty-two have no unique non-merge patches compared with `origin/main`.
- Thirty-eight remote branches retain at least one unique non-merge patch.
- The main worktree currently contains concurrent admin edits and must not be used for consolidation until its owner saves that work.

## Chosen Approach

Use a dedicated Git worktree and a single integration branch based on the latest `origin/main`. Triage branches before merging, group overlapping branches by feature family, and integrate only the branch or selected commits that represent the intended final implementation.

`main` remains untouched until the integration branch passes all applicable automated checks and manual smoke tests. The final delivery is a pull request from the integration branch into `main`.

## Branch Decision Rules

1. Exclude branches whose tips are already ancestors of `origin/main`.
2. Exclude ancestry-unmerged branches with no unique non-merge patches unless a tree-level review finds meaningful merge-resolution content missing from `main`.
3. Exclude `archive/*`, `backup/*`, write-access tests, and deployment-record branches by default.
4. Do not merge branches hundreds of commits behind `main` wholesale. Port only explicitly selected commits with `git cherry-pick -x`.
5. Compare overlapping branches as a family and select one canonical branch or commit set.
6. A candidate is accepted only when its purpose is still wanted, its diff contains no unrelated work, conflicts have intentional resolutions, and all checks for touched applications pass.
7. Preserve every branch until the final pull request has merged and the result has completed one release cycle. Branch deletion is a separate approved operation.

## Initial Candidate Set

These current branches are the first candidates for detailed review because they are based directly on the current `main` baseline or represent the apparent canonical implementation:

- `agent/opportunity-content-ux`
- `codex/seo-hydration-consistency`
- `feat/web-community-parity-seo`
- `refactor/admin-shell-engine-production`

This is a review shortlist, not an automatic merge list.

## Overlapping Branch Families

### Community and RTL

Compare `feat/web-community-parity-seo`, `feat/web-community-product`, `feat/web-community-rtl`, and `archive/web-community-parity-seo-pre-rebase-20260823`. Prefer the canonical branch that contains the desired product, RTL, and SEO behavior without replaying superseded histories.

### SEO and opportunity content

Compare `agent/opportunity-content-ux`, `codex/seo-hydration-consistency`, `codex/seo-p0-p4`, `codex/seo-p0-p4-hardening`, and the already patch-equivalent social-preview branch. Keep independent opportunity-content work separate from general SEO plumbing when their tests and release risks differ.

### Admin shell and engine operations

Compare `refactor/admin-shell-engine-production`, `archive/admin-shell-engine-wip-2026-08-24`, `feat/admin-app-control-push`, `feat/admin-engine-operability`, and the concurrent dashboard edits. The concurrent work must be committed to a named branch before this family is evaluated.

### Architecture and 5/5 foundation

Compare `refactor/architecture-simplification`, `docs/feature-5of5-production-plans`, and `feat/5of5-wave0-foundation`. Since `feat/5of5-execution` is already contained in `main`, do not replay it.

### Engine hardening

Review `chore/engine-governance-docs`, `chore/remove-legacy-scrapers`, `feat/engine-fingerprint-ratelimit`, and `feat/engine-prelaunch-hardening` as independent ports. These old branches must not be merged wholesale.

## Integration Sequence

1. Protect and finish concurrent admin work.
2. Refresh `origin/main` and create the isolated integration worktree.
3. Produce a branch inventory with a decision and rationale for every unique-patch branch.
4. Resolve overlapping branch families and select canonical candidates.
5. Integrate backend and architecture foundations first.
6. Integrate admin changes.
7. Integrate web SEO and opportunity-content changes.
8. Integrate community and RTL changes.
9. Integrate mobile changes only when separately approved by the inventory.
10. Run complete verification, manual smoke tests, and pull-request review.

## Verification Contract

- Backend: lint, unit tests, build, and end-to-end tests.
- Admin: lint, Vitest suite, and production build.
- Web app: lint, Vitest suite, typecheck, SEO generation/verification through the production build, and production build.
- Mobile: lint, typecheck, Jest suite, and an Expo smoke launch when mobile files change.
- Repository: clean status, `git diff --check`, no unexpected generated files, and an intentional diff against `origin/main`.
- Release: all required CI checks pass at the exact final integration commit.

## Failure and Recovery

- Abort a merge when conflicts reveal unclear ownership or superseded behavior; do not guess.
- Revert a completed integration merge with a new revert commit rather than rewriting the shared integration history.
- Preserve the integration log with branch name, source SHA, decision, conflicts, tests, and outcome.
- Never stash, discard, reset, or overwrite the concurrent admin edits as part of consolidation.

## Completion Criteria

- Every remote branch with unique patches has a recorded `integrate`, `port`, `superseded`, `archive`, or `reject` decision.
- Every integrated change has targeted test evidence.
- The complete verification matrix passes on the final integration head.
- The integration branch contains no unrelated changes.
- The pull request into `main` is reviewed and merged without bypassing required checks.
