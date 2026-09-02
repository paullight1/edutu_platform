## Purpose

Describe the user or operational outcome of this pull request.

## Scope

- What changed:
- What did not change:
- Risk and rollback:

## Release path

Use `feature` for a PR into `develop`, `release` for `develop` into `main`, and
`hotfix` for a `hotfix/*` branch into `main`.

Release-Type: feature

## Exact-commit review evidence

Keep the pull request in Draft while these values are incomplete. From a clean
review worktree, run:

```bash
node scripts/local-review.mjs --base origin/develop --install
```

For a release or hotfix targeting `main`, use `--base origin/main`. Copy the
exact output below. Any new commit invalidates the approval until local review
is repeated.

Local-Review-Approved: no
Local-Review-SHA: pending

Release and hotfix pull requests into `main` also require review of the deployed
staging candidate tied to the same head commit.

Staging-Review-Approved: no
Staging-Review-SHA: pending

## Verification

- [ ] The PR is based on the correct branch.
- [ ] The worktree was clean before local review.
- [ ] Tests, type checks, lint and builds selected by the review command passed.
- [ ] No production secrets or writable production database were used locally.
- [ ] Preview or staging was reviewed where required.
- [ ] Existing routes and rollback behaviour were checked.
- [ ] The evidence SHA equals the current PR head SHA.

## UI conservation

- [ ] Existing Edutu colours, typography, cards, navigation and theme systems are preserved, or this PR does not change learner UI.
