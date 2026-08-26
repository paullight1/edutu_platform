# Edutu Branch Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Selectively integrate the still-relevant work from Edutu's outstanding branches, verify the combined product locally and in CI, and deliver one reviewed pull request into `main`.

**Architecture:** Keep the current main worktree isolated from consolidation and create a dedicated worktree from `origin/main`. Triage branch families before merging, use normal merge commits only for current canonical branches, and port selected commits from stale branches with `git cherry-pick -x`.

**Tech Stack:** Git/GitHub, TypeScript, React/Vite/Vitest, NestJS/Jest, Expo/Jest, Capacitor/PWA, Python scraper tooling, PostgreSQL/Supabase.

**Spec:** `docs/superpowers/specs/2026-08-25-branch-consolidation-design.md`

## Global Constraints

- Do not commit, stash, reset, or discard the concurrent changes in `admin/src/pages/Dashboard.tsx` and `admin/src/pages/Dashboard.test.tsx`.
- Do not merge directly into `main`; use `integration/branch-consolidation-20260825`.
- Use `/Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder-integration-20260825` as the isolated integration worktree.
- Do not automatically merge `archive/*`, `backup/*`, `chatgpt-write-test-*`, `ops/render-deploy-*`, or old `worktree-*` branches.
- Do not merge a branch more than 250 commits behind `origin/main` wholesale; port approved commits individually with `git cherry-pick -x`.
- Never resolve a conflict by choosing an entire side without reviewing the affected behavior and tests.
- Preserve source branches until the final pull request has merged and completed one release cycle.
- Do not push or open the final pull request until the user approves the completed local integration report.

---

### Task 1: Protect concurrent work and establish the baseline

**Files:**
- Inspect: `admin/src/pages/Dashboard.tsx`
- Inspect: `admin/src/pages/Dashboard.test.tsx`
- Inspect: `.git/`

**Interfaces:**
- Consumes: the other terminal's completed admin commit and branch name.
- Produces: a clean main worktree and a refreshed `origin/main` reference.

- [ ] **Step 1: Confirm the current worktree state without modifying it**

  Run from `/Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder`:

  ```bash
  git status --short --branch
  ```

  Expected before the other terminal finishes: the dashboard files may remain modified or untracked. If any change is present, stop and ask its owner to commit and push it to a named feature branch. Do not stash it.

- [ ] **Step 2: Confirm the worktree is clean after the admin handoff**

  ```bash
  git status --porcelain
  ```

  Expected: no output.

- [ ] **Step 3: Refresh all remote references**

  ```bash
  git fetch --prune origin
  git switch main
  git pull --ff-only origin main
  ```

  Expected: `main` fast-forwards or reports `Already up to date`; no merge commit is created.

- [ ] **Step 4: Record the immutable baseline SHA**

  ```bash
  git rev-parse origin/main
  git status --short --branch
  ```

  Expected: local `main` and `origin/main` are aligned and the worktree is clean. Copy the SHA into the inventory created in Task 3.

### Task 2: Create the isolated integration worktree

**Files:**
- Create worktree: `/Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder-integration-20260825`
- Create branch: `integration/branch-consolidation-20260825`

**Interfaces:**
- Consumes: the clean `origin/main` baseline from Task 1.
- Produces: an isolated worktree where all candidate merges and tests occur.

- [ ] **Step 1: Load the required worktree workflow**

  Read and follow `superpowers:using-git-worktrees` before creating the worktree.

- [ ] **Step 2: Confirm the target path and branch do not already exist**

  ```bash
  git worktree list --porcelain
  git show-ref --verify --quiet refs/heads/integration/branch-consolidation-20260825
  ```

  Expected: the target path is absent and the branch lookup exits non-zero. If either exists, inspect and reuse it only when it is based on the recorded baseline and has a clean status.

- [ ] **Step 3: Create the integration worktree**

  ```bash
  git worktree add /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder-integration-20260825 -b integration/branch-consolidation-20260825 origin/main
  ```

  Expected: Git creates and checks out the new branch at the recorded `origin/main` SHA.

- [ ] **Step 4: Verify isolation**

  Run from the new worktree:

  ```bash
  git branch --show-current
  git status --porcelain
  git rev-parse HEAD
  ```

  Expected: branch is `integration/branch-consolidation-20260825`, status is empty, and `HEAD` equals the Task 1 baseline.

### Task 3: Create the auditable branch inventory

**Files:**
- Create: `docs/branch-consolidation/2026-08-25-branch-inventory.md`
- Create: `docs/branch-consolidation/2026-08-25-integration-log.md`

**Interfaces:**
- Consumes: all refreshed `refs/remotes/origin/*` references.
- Produces: one decision per unique-patch branch and a permanent integration evidence log.

- [ ] **Step 1: Create the inventory header and fixed decision vocabulary**

  The inventory must record the baseline SHA and use exactly these decisions:

  ```text
  integrate  - merge the current canonical branch
  port       - cherry-pick selected commits onto the integration baseline
  superseded - another named branch or main already contains the intended result
  archive    - historical snapshot retained for reference
  reject     - change is obsolete, unsafe, or no longer desired
  ```

  Use these columns for every branch:

  ```text
  Branch | Tip SHA | Behind | Unique patches | Touched apps | Family | Decision | Superseded by / selected commits | Evidence
  ```

- [ ] **Step 2: Reproduce ancestry and patch-equivalence evidence**

  For each remote branch other than `origin/main`, copy its short name without the `origin/` prefix into the task-scoped `EDUTU_BRANCH` variable, then run the evidence commands. For example, begin with:

  ```bash
  EDUTU_BRANCH=agent/opportunity-content-ux
  ```

  ```bash
  git merge-base --is-ancestor "origin/$EDUTU_BRANCH" origin/main
  git rev-list --count "origin/$EDUTU_BRANCH..origin/main"
  git cherry origin/main "origin/$EDUTU_BRANCH"
  git diff --name-only "origin/main...origin/$EDUTU_BRANCH"
  ```

  Record the tip SHA with:

  ```bash
  git rev-parse "origin/$EDUTU_BRANCH"
  ```

- [ ] **Step 3: Apply the default exclusions**

  Mark ancestry-merged branches as `superseded`. Mark branches with no unique non-merge patches as `superseded` unless tree review proves missing merge-resolution content. Mark `archive/*` as `archive`; mark write-access tests and deployment records as `reject` unless the user explicitly overrides the decision.

- [ ] **Step 4: Seed the first review candidates**

  Add these branches to the inventory as `integrate` candidates pending Tasks 4 and 5:

  ```text
  agent/opportunity-content-ux
  codex/seo-hydration-consistency
  feat/web-community-parity-seo
  refactor/admin-shell-engine-production
  ```

- [ ] **Step 5: Create the integration log structure**

  Use these columns:

  ```text
  Order | Source branch | Source SHA/commits | Method | Conflicts | Tests | Resulting integration SHA | Outcome
  ```

- [ ] **Step 6: Commit the initial evidence documents**

  ```bash
  git add docs/branch-consolidation/2026-08-25-branch-inventory.md docs/branch-consolidation/2026-08-25-integration-log.md
  git commit -m "docs: add branch consolidation inventory"
  ```

### Task 4: Resolve overlapping branch families

**Files:**
- Modify: `docs/branch-consolidation/2026-08-25-branch-inventory.md`

**Interfaces:**
- Consumes: branch metadata from Task 3.
- Produces: one canonical branch or explicit commit list per feature family.

- [ ] **Step 1: Compare the community family**

  Compare these refs:

  ```text
  origin/feat/web-community-parity-seo
  origin/feat/web-community-product
  origin/feat/web-community-rtl
  origin/archive/web-community-parity-seo-pre-rebase-20260823
  ```

  Begin with the current product branch compared with the apparent canonical branch:

  ```bash
  EDUTU_OLDER_REF=origin/feat/web-community-product
  EDUTU_CANDIDATE_REF=origin/feat/web-community-parity-seo
  ```

  Run the ancestry and range comparison, then repeat it after setting `EDUTU_OLDER_REF` to `origin/feat/web-community-rtl` and `origin/archive/web-community-parity-seo-pre-rebase-20260823` in turn:

  ```bash
  git merge-base --is-ancestor "$EDUTU_OLDER_REF" "$EDUTU_CANDIDATE_REF"
  git range-diff "origin/main...$EDUTU_OLDER_REF" "origin/main...$EDUTU_CANDIDATE_REF"
  git diff --stat "origin/main...$EDUTU_CANDIDATE_REF"
  ```

  Select only the branch that represents the intended combined Community, RTL, and SEO behavior. Name every superseded branch in its inventory evidence.

- [ ] **Step 2: Compare the SEO and opportunity-content family**

  Review `origin/agent/opportunity-content-ux`, `origin/codex/seo-hydration-consistency`, `origin/codex/seo-p0-p4`, and `origin/codex/seo-p0-p4-hardening`. Keep branches separate only when their diffs and test surfaces are independent; otherwise choose the newest canonical result.

- [ ] **Step 3: Compare the admin family**

  Review `origin/refactor/admin-shell-engine-production`, `origin/archive/admin-shell-engine-wip-2026-08-24`, `origin/feat/admin-app-control-push`, `origin/feat/admin-engine-operability`, and the branch produced by the concurrent dashboard work. Select the canonical shell/dashboard implementation and identify any independent notification or engine-operability commits for porting.

- [ ] **Step 4: Compare architecture, 5/5, and engine-hardening families**

  Review `origin/refactor/architecture-simplification`, `origin/docs/feature-5of5-production-plans`, `origin/feat/5of5-wave0-foundation`, `origin/chore/engine-governance-docs`, `origin/chore/remove-legacy-scrapers`, `origin/feat/engine-fingerprint-ratelimit`, and `origin/feat/engine-prelaunch-hardening`. Any branch over 250 commits behind remains `port`, `superseded`, `archive`, or `reject`; it cannot receive `integrate`.

- [ ] **Step 5: Review the completed inventory with the user**

  Present the `integrate` and `port` lists with their touched applications and risks. Do not merge a source branch until the user approves its inventory decision.

- [ ] **Step 6: Commit the approved inventory**

  ```bash
  git add docs/branch-consolidation/2026-08-25-branch-inventory.md
  git commit -m "docs: approve branch consolidation decisions"
  ```

### Task 5: Integrate each approved current branch

**Files:**
- Modify: files listed by `git diff --name-only "origin/main...origin/$EDUTU_BRANCH"` for the approved branch recorded in the inventory.
- Modify: `docs/branch-consolidation/2026-08-25-integration-log.md`

**Interfaces:**
- Consumes: branches marked `integrate` in the approved inventory.
- Produces: one reviewed merge commit per accepted source branch.

- [ ] **Step 1: Start with a clean integration branch**

  ```bash
  git status --porcelain
  git branch --show-current
  ```

  Expected: no output from status and branch `integration/branch-consolidation-20260825`.

- [ ] **Step 2: Preview the candidate before merging**

  Set `EDUTU_BRANCH` to the exact branch-name cell of the next approved `integrate` inventory row. The first expected value is:

  ```bash
  EDUTU_BRANCH=agent/opportunity-content-ux
  ```

  ```bash
  git log --cherry-mark --oneline "origin/main...origin/$EDUTU_BRANCH"
  git diff --stat "HEAD...origin/$EDUTU_BRANCH"
  git diff --name-only "HEAD...origin/$EDUTU_BRANCH"
  ```

  Confirm that every changed path belongs to the approved branch purpose.

- [ ] **Step 3: Stage the merge without committing**

  ```bash
  git merge --no-ff --no-commit "origin/$EDUTU_BRANCH"
  ```

  If conflicts occur, inspect each base/ours/theirs version, resolve intentionally, and add focused regression coverage for behavior affected by the conflict. If ownership or intended behavior is unclear, run `git merge --abort` and return the branch to Task 4.

- [ ] **Step 4: Run the touched-application checks from Task 7**

  All checks for every touched application must pass before the merge is committed.

- [ ] **Step 5: Commit the accepted merge**

  ```bash
  git commit -m "merge: integrate $EDUTU_BRANCH"
  ```

- [ ] **Step 6: Update and commit the integration log**

  Record source SHA, conflicts, exact commands, pass counts, and resulting integration SHA, then run:

  ```bash
  git add docs/branch-consolidation/2026-08-25-integration-log.md
  git commit -m "docs: record $EDUTU_BRANCH integration evidence"
  ```

- [ ] **Step 7: Repeat Steps 1-6 for the next approved `integrate` branch**

  Preserve the approved sequence: backend/architecture, admin, web SEO/opportunity content, community/RTL, then mobile.

### Task 6: Port selected commits from stale branches

**Files:**
- Modify: only paths changed by commits explicitly listed in the approved inventory.
- Modify: `docs/branch-consolidation/2026-08-25-integration-log.md`

**Interfaces:**
- Consumes: exact commit SHAs from branches marked `port`.
- Produces: traceable cherry-picked commits without stale branch history.

- [ ] **Step 1: Confirm every selected commit and its patch**

  Copy the next exact approved commit SHA from the inventory into `EDUTU_COMMIT`. For the engine-governance candidate, derive the immutable full SHA directly from its refreshed remote ref:

  ```bash
  EDUTU_COMMIT=$(git rev-parse origin/chore/engine-governance-docs)
  ```

  For every later port, assign `EDUTU_COMMIT` from that row's exact selected-commit SHA before running:

  ```bash
  git show --stat --oneline "$EDUTU_COMMIT"
  git show --check "$EDUTU_COMMIT"
  ```

  Reject a commit that contains unrelated files; split or recreate the desired change in a separate approved task instead.

- [ ] **Step 2: Cherry-pick one commit with provenance**

  ```bash
  git cherry-pick -x "$EDUTU_COMMIT"
  ```

  Resolve conflicts using the current architecture and add regression coverage for conflict-sensitive behavior. Abort with `git cherry-pick --abort` when the intended behavior is unclear.

- [ ] **Step 3: Run the touched-application checks from Task 7**

  The selected commit remains only when all applicable checks pass.

- [ ] **Step 4: Update and commit the integration log**

  ```bash
  git add docs/branch-consolidation/2026-08-25-integration-log.md
  git commit -m "docs: record ported branch evidence"
  ```

- [ ] **Step 5: Repeat Steps 1-4 for each approved commit in order**

  Never cherry-pick an unlisted commit merely to make a later commit apply; return to Task 4 and update the approved commit set first.

### Task 7: Run the application verification matrix

**Files:**
- Inspect: all source and test paths changed since the recorded baseline.
- Modify tests only when a merge conflict or ported behavior requires regression coverage.

**Interfaces:**
- Consumes: the current integration head and the list of touched top-level directories.
- Produces: exact command evidence for each integrated branch and for the final combined result.

- [ ] **Step 1: Verify repository hygiene**

  ```bash
  git diff --check origin/main...HEAD
  git status --short --branch
  git diff --name-only origin/main...HEAD
  ```

  Expected: no whitespace errors, only intentional paths, and no untracked build artifacts.

- [ ] **Step 2: Verify the backend when `backend/` changes**

  Run from `backend/services/services/api`:

  ```bash
  npm run lint
  npm run test -- --runInBand
  npm run build
  npm run test:e2e -- --runInBand
  ```

  Expected: every command exits zero with no failed test suites.

- [ ] **Step 3: Verify admin when `admin/` changes**

  Run from `admin`:

  ```bash
  npm run lint
  npm test
  npm run build
  ```

  Expected: ESLint has zero warnings/errors, Vitest has zero failures, and the production build exits zero.

- [ ] **Step 4: Verify the web app when `edutu-web-app/` changes**

  Run from `edutu-web-app`:

  ```bash
  npm run lint
  npm test
  npm run typecheck
  npm run build
  ```

  Expected: lint, Vitest, TypeScript, SEO prebuild scripts, Vite build, and route-meta postbuild all exit zero.

- [ ] **Step 5: Verify mobile when `edutumobile/` or shared `packages/` change**

  Run from `edutumobile`:

  ```bash
  npm run lint
  npm run typecheck
  npm test -- --runInBand
  ```

  Expected: lint and TypeScript exit zero and Jest reports no failed suites. Launch the relevant Expo target for a manual smoke test before final approval.

- [ ] **Step 6: Verify scraper changes when `crawl4ai-scraper/` changes**

  Run from `crawl4ai-scraper`:

  ```bash
  python -m compileall .
  python main.py --help
  python cli.py --help
  ```

  Expected: compilation succeeds and both command-line entry points render help without importing or configuration errors. Do not run a live scrape without separate approval.

### Task 8: Perform combined product smoke testing

**Files:**
- Modify: `docs/branch-consolidation/2026-08-25-integration-log.md`

**Interfaces:**
- Consumes: the fully integrated and automatically verified branch.
- Produces: manual evidence for the combined user journeys.

- [ ] **Step 1: Start the backend and verify readiness**

  Run from `backend/services/services/api`:

  ```bash
  npm run dev
  ```

  Confirm startup has no migration/configuration crash and exercise the readiness endpoint used by the application.

- [ ] **Step 2: Smoke-test admin behavior**

  Run from `admin`:

  ```bash
  npm run dev
  ```

  Verify dashboard loading, protected navigation, scraper status, unknown protected-route recovery, and any approved admin notification or engine-operability changes.

- [ ] **Step 3: Smoke-test the web application**

  Run from `edutu-web-app`:

  ```bash
  npm run dev
  ```

  Verify opportunity discovery/detail pages, generated SEO metadata, Community entry/navigation, RTL navigation, authentication boundaries, and responsive layouts affected by the integration.

- [ ] **Step 4: Smoke-test mobile only when mobile/shared packages changed**

  Run from `edutumobile`:

  ```bash
  npx expo start
  ```

  Verify authentication, opportunity discovery/detail, roadmap entry, paywall/entitlement surfaces, and any directly changed screen on an emulator or device.

- [ ] **Step 5: Record outcomes**

  Add each scenario, environment, result, and defect link to the integration log. Any failed smoke test returns the responsible branch or commit to Task 5 or Task 6; do not defer a known regression to the final PR.

### Task 9: Refresh the integration baseline and run the final gate

**Files:**
- Modify through merge only: changes added to `origin/main` since Task 1.
- Modify: `docs/branch-consolidation/2026-08-25-integration-log.md`

**Interfaces:**
- Consumes: all approved integrations and the latest `origin/main`.
- Produces: the exact final integration SHA eligible for user approval.

- [ ] **Step 1: Fetch and incorporate the latest main branch**

  ```bash
  git fetch --prune origin
  git merge --no-ff origin/main
  ```

  Resolve any conflict using the same evidence rules as Task 5.

- [ ] **Step 2: Run the complete verification matrix**

  Run every command in Task 7 for backend, admin, web, and mobile, regardless of which application was touched. Run scraper verification when the final diff includes scraper paths.

- [ ] **Step 3: Review the complete diff**

  ```bash
  git diff --check origin/main...HEAD
  git diff --stat origin/main...HEAD
  git log --oneline --decorate origin/main..HEAD
  git status --porcelain
  ```

  Expected: no whitespace errors, no unrelated files, an understandable commit sequence, and clean status.

- [ ] **Step 4: Record the final evidence and commit it**

  Add the exact final SHA and all command results to the integration log, then run:

  ```bash
  git add docs/branch-consolidation/2026-08-25-integration-log.md
  git commit -m "docs: record final branch consolidation verification"
  ```

- [ ] **Step 5: Present the integration report for user approval**

  Report integrated branches, ported commits, excluded branches with reasons, conflicts, automated results, manual results, and the final diff summary. Stop before pushing until the user explicitly approves.

### Task 10: Push and merge through a reviewed pull request

**Files:**
- No additional source files unless CI reveals a confirmed defect.

**Interfaces:**
- Consumes: user-approved final integration SHA from Task 9.
- Produces: one reviewed pull request and a verified `main` merge.

- [ ] **Step 1: Push the approved integration branch**

  ```bash
  git push -u origin integration/branch-consolidation-20260825
  ```

- [ ] **Step 2: Open a pull request into `main`**

  The PR body must include the inventory path, integration-log path, source branches and commits, exclusions, conflicts, test evidence, manual smoke evidence, rollout concerns, and rollback plan.

- [ ] **Step 3: Verify required checks at the exact final SHA**

  Do not rely on earlier runs. Confirm every required GitHub check belongs to the final PR head and passes.

- [ ] **Step 4: Review the PR diff for unexpected branch-history imports**

  Compare the PR file list and commit list with Task 9. If they differ, update the integration branch and repeat the final gate.

- [ ] **Step 5: Merge the PR without bypassing protections**

  Use the repository's normal protected-branch merge method. Do not force-push `main` and do not bypass required reviews or checks.

- [ ] **Step 6: Verify local and remote main after the merge**

  ```bash
  git fetch origin
  git rev-list --left-right --count origin/main...integration/branch-consolidation-20260825
  git log -1 --oneline origin/main
  ```

  Confirm the integration result is contained in `origin/main`.

### Task 11: Preserve evidence and defer branch cleanup

**Files:**
- Inspect: `docs/branch-consolidation/2026-08-25-branch-inventory.md`
- Inspect: `docs/branch-consolidation/2026-08-25-integration-log.md`

**Interfaces:**
- Consumes: the merged PR and one completed release cycle.
- Produces: a separate, user-approved cleanup proposal; this task does not delete branches.

- [ ] **Step 1: Confirm the merged result has completed one release cycle**

  Record deployment and smoke-test evidence outside this consolidation execution if release occurs later.

- [ ] **Step 2: Re-run merged-branch ancestry checks**

  ```bash
  git fetch --prune origin
  git branch -r --merged origin/main
  git branch -r --no-merged origin/main
  ```

- [ ] **Step 3: Produce a cleanup proposal**

  List branches eligible for deletion, branches retained as archives, and branches still carrying unique work. Request explicit approval before deleting any local or remote branch.
