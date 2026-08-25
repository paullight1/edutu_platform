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
