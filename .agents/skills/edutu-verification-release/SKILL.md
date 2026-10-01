---
name: edutu-verification-release
description: "Use when verifying an Edutu change, reporting completion, checking CI, preparing a PR, or evaluating release readiness."
---

# Edutu Verification and Release

## Workflow

1. Read `agent-system/README.md`, the approved criteria, actual diff, and current
   package scripts. Select checks from affected paths, not the implementer's
   success summary. Include shared and specialist code-review workflows.
2. Record commit, worktree changes, command, working directory, exit code,
   relevant output, environment, and artifact location. For uncommitted work,
   record diff and untracked-file fingerprints; a commit alone is insufficient.
3. Reproduce the target behavior and failure modes independently. Run focused
   tests before broader checks. A unit test is not E2E evidence, a build is not
   deployment evidence, and a skipped job is not success.
4. For agent-system changes run its unit tests, `validate`, and `drift --strict`.
   These verify tooling and named anchors, not application correctness or agent
   reasoning. Inspect existing architecture/CI checks without disabling them.
5. Separate new regressions from baseline failures using a comparable baseline.
   Any code change after verification invalidates affected results. Retest the
   combined integration result after merging independent work in a review branch.
6. Prepare a feature-branch PR to `develop` for maintainer exact-head review.
   Follow the approved staging and develop-to-main release process. Do not merge,
   enable auto-merge, promote production, or enable feature flags under this skill.

## Evidence

Report Implemented / Verified / Failed / Not run / Blocked, the exact tested
identity and scope, CI state, outstanding risks, and an explicit verdict.
Distinguish locally observed checks from GitHub-reported checks and queued jobs.

## Stop conditions

Never certify stale results, remove a failing gate to get green, or claim that
absence of check runs means CI passed. Missing required verification blocks
release readiness, not truthful reporting of completed portions.
