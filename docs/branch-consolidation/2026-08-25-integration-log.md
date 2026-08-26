# Edutu Branch Consolidation Integration Log

**Baseline:** `fea6259d6d6ade688009bea0e29b16665d328b93`
**Worktree:** `/Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder-integration-20260825`
**Branch:** `integration/branch-consolidation-20260825`

## Baseline verification

| Surface | Command | Result |
|---|---|---|
| Architecture | `npm run check:architecture` | PASS — 8 critical-file budgets |
| Admin | `npm test` | PASS — 5 suites, 14 tests |
| Web | `npm test` | PASS — 61 suites, 336 tests |
| Mobile | `npm test -- --runInBand` | PASS — 110 suites, 796 tests |
| Backend | `npm run test -- --runInBand` plus cache-disabled retry of `main.spec.ts` | PASS evidence — 180 suites/1,994 tests completed in the full run; the only suite blocked by ENOSPC passed separately with 15/15 tests |
| Repository | `git status --short --branch` | PASS — clean after plan/design commit |

The backend full run encountered `ENOSPC` while writing Jest transform cache for `main.spec.ts`. The exact suite passed with `--no-cache`; this is recorded as an environmental disk-pressure event, not a source failure.

## Integration events

| Order | Source | Source SHA/commits | Method | Conflicts | Tests | Resulting SHA | Outcome |
|---:|---|---|---|---|---|---|---|
| 0 | consolidation plan/design | `fea6259d6d6ade688009bea0e29b16665d328b93` baseline | documentation commit | none | architecture + baseline suites above | `a2106b4a` | accepted |
| 1 | `origin/agent/opportunity-content-ux` (PR #66) | `cda393fab41582d1394760c5c8401a6aeda4ae68` | no-fast-forward merge with integration cleanup | none | mobile lint; mobile typecheck; affected tests 4 suites/19 tests; full mobile 111 suites/800 tests | `7b22edacb84b576629441ace14cfc882e155f705` | accepted |
| 2 | `origin/codex/seo-hydration-consistency` (PR #67) | `b22c7dfb076444fed1ed30e962b65e01d32ac893` | no-fast-forward merge with integration fixes | none | architecture; routing/hydration 6 tests; backend SEO 3 suites/15 tests; web focused 3 files/11 tests; backend lint/build/full 182 suites/2,012 tests; web lint/typecheck/build/full 64 files/347 tests | `57bf30b94c6bd709b3566ec20b2f37953338f2f9` | accepted |
| 3 | `origin/refactor/admin-shell-engine-production` (PR #60) | `22cf90513a921b16ef5bacacd8a4de06c6557c66` | no-fast-forward merge with integration cleanup | none | architecture/runtime policy 10 tests plus both live checks; admin lint/build/full 27 files/109 tests; backend scraper 22 suites/215 tests; backend lint/build | `bf03943809bc9f2af72a305bb1846335b98c2ccc` | accepted with external smoke gap |
| 4 | `origin/feat/web-community-parity-seo` (PR #56) | `12aa2c3e1fe3a7035c3afa235095e4cb1325d237` | no-fast-forward merge with semantic conflict resolution | `admin/src/App.tsx`; `admin/src/components/nav-items.tsx` | architecture; migration timestamps; focused admin 2 files/9 tests; focused backend 6 suites/23 tests; focused web 13 files/41 tests; focused mobile 2 suites/3 tests; all lints/typechecks/builds; full admin 28 files/112 tests; web 77 files/388 tests; mobile 113 suites/803 tests; backend 189 suites/2,038 tests | `8830e38dc07e42b59c6d6a2a928a09d1e33d98bf` | accepted |
| 5 | `origin/perf/web-auth-speed` | `0f66c53b59c0b6125faffc3afe7556a394afa100` | semantic port with extracted/testable warmup helpers | none | focused web 1 file/3 tests; web lint; web typecheck; web production build | `8de2d4f3` | accepted |
| 6 | `origin/feat/auth-remove-apple` | `ac6c1e02` | residual inspection | none | source inspection: current Clerk auth exposes Google only; no Apple provider or callback remains | n/a | no-op — already present |
| 7 | `origin/feat/mobile-haptics-toggle` | `8d31ccab` | patch-equivalence and source inspection | none | current `lib/haptics.ts` and `haptics.test.ts` are identical to source; mobile full suite passed at event 4 | n/a | no-op — already present; rejected source's tracked `node_modules` symlink |
| 8 | `origin/fix/backend-lint-cleanup`; `origin/fix/profile-raw-clerk-id-and-remove-web-ai-coach` | `f6005d1e`; `a6fe6de1` | residual inspection | mutually exclusive historic UI variants | current PR #66 Best Shots state is newer, compact, accessible, and routes both variants correctly; mobile focused/full tests passed at events 1 and 4 | n/a | no-op — superseded by event 1 |
| 9 | `origin/feat/admin-engine-operability` | `602c466af5770b7ffeac346a9f7fb8a025554741` | semantic port into the refactored Engine architecture | legacy `admin/src/pages/Scraper.tsx` was deleted by event 3 | backend focused 2 suites/4 tests; backend lint/build; admin focused 3 files/14 tests; admin lint/build; architecture and diff checks | `6b802bbf` | accepted in adapted form |
| 10 | `origin/feat/engine-prelaunch-hardening` | `8ff55134` | semantic port into current scraper/verifier services | stale service layout | focused backend verification, crawl-state, and scraper suites; backend lint/build | `925a07b6` | accepted in adapted form |
| 11 | `origin/feat/engine-prelaunch-hardening` | `36a1e194` | semantic port with current opportunity model and listing guards | stale DTO/service layout | focused backend scraper, opportunity, and apply-link coverage; backend lint/build | `a26d2089` | accepted in adapted form |
| 12 | `origin/feat/engine-prelaunch-hardening` | `8706fedc` | semantic port preserving the current backend trust schema | stale learner UI | focused web/mobile opportunity tests; lint/typecheck | `c9f8ea82` | accepted in adapted form |
| 13 | `origin/feat/engine-prelaunch-hardening` | `1be6a2a2` | semantic port into current ranking policy | none | focused backend ranking tests; backend lint/build | `1d9dee93` | accepted |
| 14 | `origin/feat/engine-prelaunch-hardening` | `75ca62ab` | documentation/cache-metadata port only | source also contained fail-open metering | focused API metadata tests; backend lint/build | `a15d2e1b` | accepted in narrowed form; fail-open metering rejected |
| 15 | `origin/feat/engine-fingerprint-ratelimit` | `00b5e8bc`; `fd37d3d2` | semantic fingerprint port; residual rate-limit inspection | current scraper service split and schema growth guard | focused backend 79 tests; backend lint/build; architecture; migration timestamp checks | `254e0fc5` | fingerprint accepted; Redis fallback rejected because the current atomic DB bucket remains fail-closed across replicas |
| 16 | `origin/docs/feature-5of5-production-plans` | `d4580752` | documentation-only port | none | `git diff --check`; source commit inspection | `5de647d6` | accepted; probe and execution-marker commits rejected |
| 17 | `origin/refactor/architecture-simplification` | `b0c6e248`, `99db3575`, `d13b04aa` behavior | semantic port into current architecture checker | stale Express deletion and admin transport rewrites excluded | migration ownership 3 tests; timestamp scan 73 migrations with 5 grandfathered collisions and no new collision; boundary 7 tests; architecture budgets | `4cbe0a88` | accepted in narrowed form |
| 18 | `origin/codex/seo-p0-p4-hardening` | route-contract and release-evidence residuals through `bb6f3899` | semantic port after PR #67 | root/app Vercel route drift | routing/hydration 9 tests; Vercel config 3 tests; JSON validation | `95e65cec` | accepted in adapted form; already-present sitemap/pagination behavior not duplicated |
| 19 | Supabase/security and local billing branches | `8f403db1`; `79d325f7`; `123771e6` | source and patch-equivalence review | old or unrelated histories | current ACL/RLS/Edge protections are equivalent or stronger; current API-key, credit, billing, and rate-limit implementations are newer | n/a | no-op — superseded; no stale security or billing history imported |
| 20 | `origin/feat/web-community-product` | member-roster cursor series `897425d2`..`139b1d84` | semantic port into canonical `features/community` architecture | source used an obsolete parallel component tree | focused Community 14 files/43 tests; web lint/typecheck | `f2f9784e` | roster pagination accepted; obsolete route gate and alternate component tree rejected |
| 21 | refreshed Community refs | `3944b9b3`; `cd339b38`; `4d55c495` | residual inspection after final fetch | none | ancestry, commit, and tree-diff review | n/a | source-export workflows rejected; legacy branch retained as archive |
| 22 | `worktree-edutu-communities-slice-1` | `21d49818` | read-only worktree/commit inspection | active worktree is dirty with tracked dependency deletions and is 638 commits behind | `git status`, ancestry count, commit list, and diff inventory | n/a | deferred — owner handoff required; no files imported |

### Event 1 notes

- Excluded `.github/workflows/pr66-ci-finalize.yml` and `.github/workflows/pr66-ci-repair.yml`. Both were temporary, branch-name-specific, self-mutating PR repair workflows and assumed an obsolete Flutter-at-repository-root layout.
- Replaced the stale source-text hierarchy test with a rendered-order regression test. The application-support internals were intentionally extracted into `OpportunityApplicationSupportActions`, so searching the parent route source for `<FitPanel>`, `<AiActionBar>`, and `<DocumentUpload>` no longer represented user-visible behavior.
- The React missing-key warning emitted by `mobileOpportunityDetail.test.tsx` reproduces on the untouched baseline and is therefore not introduced by this integration event.

### Event 2 notes

- Wired `/opportunities/:category` in `vercel.json` to the branch's new `/seo-hydration/opportunities/:category` owner. The route contract failed before this change and passed afterward.
- Corrected one malformed JSX whitespace expression in `BlogPage.tsx` (`{" ""}` to `{" "}`), which had blocked web parsing, lint, typecheck, and build.
- Applied the repository Prettier configuration only to the two new backend hydration files, resolving eight formatting-only lint failures.
- Restored tracked offline sitemap/robots outputs and removed the untracked `public/sitemaps` directory generated during the verified build; those generated artifacts were not part of the source branch.

### Event 3 notes

- Excluded `.github/workflows/production-smoke-pr60.yml`, whose job condition only allowed the original `refactor/admin-shell-engine-production` head branch, and excluded the accidental empty root file `__invalid__`.
- Kept the reusable repository CI additions for admin runtime configuration checks and the valid `VITE_BACKEND_URL` build fixture.
- The repository's reusable production API smoke script requires `EDUTU_API_KEY`; no key was exposed or inferred. PR #60's anonymous Production Health + Opportunity Smoke remains an external deployment-state verification gap, while all local source, build, architecture, and focused backend checks pass.

### Event 4 notes

- Preserved the centralized admin authentication/shell and manifest-driven navigation from event 3 instead of restoring the superseded inline route table from PR #56.
- Added `community-safety` to the canonical admin route manifest, People navigation group, and `AdminRoutes`. The new manifest test failed before the route was registered and passed after the integration fix.
- Removed trailing Markdown whitespace reported by `git diff --check` in four imported review/design documents.
- Restored tracked offline sitemap/robots outputs and removed the untracked `public/sitemaps` directory generated by the verified web build.

### Event 5 notes

- Preserved the current production Clerk-key guard while adding origin preconnects for Clerk, Supabase, and Clerk's Cloudflare challenge endpoint.
- Extracted Clerk-key decoding, duplicate-safe preconnect creation, and idle/fallback scheduling into `authWarmup.ts`; the focused regression suite was written red-first and covers all three behaviors.
- Prefetches the auth and dashboard route chunks only for signed-out users and shortens the auth entrance transition from 450ms to 220ms.
- Restored tracked offline sitemap/robots outputs and removed the untracked `public/sitemaps` directory generated by the verified web build.

### Event 9 notes

- The run metrics, structured error/warning rendering, and diagnostic normalization from the source branch are already implemented in the current `JobDetailsDialog` and `RunDetailsDialog`; those portions were not duplicated.
- Ported the remaining catalog-quality aggregate behind the existing admin guard and exposed it through the centralized Engine API client.
- Rebuilt the scorecard as a tested Engine status component instead of restoring the deleted legacy Scraper monolith.
- Extracted the SQL aggregate into `opportunity-quality-scorecard.ts`. The large-service ceiling was explicitly adjusted by five delegation-only lines; the query itself does not expand `opportunities.service.ts`.
- The admin production build passed with the repository-required `VITE_BACKEND_URL=https://api.example.com` fixture.

### Events 10–15 notes

- Ported launch-hardening behavior against the current scraper, opportunity, verification, and ranking architecture instead of replaying six-hundred-commit-old service files.
- Preserved the current stricter backend trust model and atomic database-backed API rate limiter. The stale Redis implementation degraded to per-instance memory on Redis failure, so it was not an acceptable replacement.
- Added a source-independent `title_fingerprint` with a deployable migration and extracted its helper to keep the scraper service inside the repository size budget.
- Kept API versioning and cache-metadata documentation while excluding the source branch's optional fail-open credit metering.

### Events 16–19 notes

- Ported only the canonical 5/5 production plans; temporary probe and execution-marker commits were excluded.
- Added frozen legacy-migration ownership checks to the current architecture guard without restoring the retired Express runtime or older admin transport layers.
- Added a deployment-route parity validator and aligned the root and web-app Vercel route contracts. Existing fail-closed sitemap and crawlable-pagination behavior was retained without duplication.
- The Supabase remediation tree is already present byte-for-byte where relevant, while current production-environment validation and RevenueCat entitlement handling are newer. Local API-key and credit branches were likewise superseded by stronger current implementations.

### Events 20–22 notes

- Added cursor-aware roster loading to the canonical Community API client and shared hook, including deduplication and “Load more members” controls in the group About panel and settings.
- Rejected the older `CommunityAppGate`: it owns an obsolete route/page set and would bypass current App-level behavior; the canonical `CommunityAppRouter` already lazy-loads current Community screens.
- A final fetch discovered `agent/community-legacy-export`, `agent/community-web-clean`, and `archive/web-community-product-legacy-20260826`. The first two add only temporary export workflows; the third is an archive of the already-reviewed stale branch.
- The local social-identity worktree was inspected read-only and left untouched because its checkout is dirty and its branch is 638 commits behind `origin/main`.

## Final combined verification

**Verified source head:** `ed2a8745` (the final evidence commit changes documentation only)

| Surface | Commands | Result |
|---|---|---|
| Repository | architecture budgets; boundary tests; migration ownership/timestamps; admin runtime guard; mobile audit guard; `git diff --check` | PASS — 7 critical-file budgets, 7 boundary tests, 3 migration-ownership tests, 73 migrations with no new timestamp collisions, 3 runtime tests, 5 mobile-audit tests |
| SEO deployment | route parity, Vercel configuration, hydration, and routing tests | PASS — 12 tests |
| Backend | lint; full Jest with `--runInBand --no-cache`; build; e2e with `--runInBand --no-cache` | PASS — 193 suites/2,072 unit tests; 4 suites/12 e2e tests |
| Admin | lint; full Vitest; production build with `VITE_BACKEND_URL=https://api.example.com` | PASS — 29 files/114 tests |
| Web | lint; typecheck; full Vitest; SEO/PWA production build | PASS — 80 files/395 tests; 21 prerendered routes; PWA output generated |
| Mobile | lint; typecheck; full Jest with `--runInBand` | PASS — 114 suites/805 tests |

The first combined run correctly failed on two integration-test assumptions: the PGlite catalog fixture lacked `title_fingerprint`, and the page-SEO registry accepted only static HTML despite the verified `/blog` and `/opportunities` API renderers. Commit `ed2a8745` aligned both contracts. Their focused suites passed 8/8 each, followed by the complete green backend and web reruns above.

The web build's generated `public/robots.txt`, `public/sitemap.xml`, and `public/sitemaps/*.xml` outputs were restored/removed after verification; no generated build artifact is part of the integration diff.
