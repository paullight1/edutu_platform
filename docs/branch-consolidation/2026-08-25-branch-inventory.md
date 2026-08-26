# Edutu Branch Consolidation Inventory

**Generated:** 2026-08-25
**Baseline:** `fea6259d6d6ade688009bea0e29b16665d328b93` (`origin/main`)
**Integration branch:** `integration/branch-consolidation-20260825`

## Status

This inventory began as the first execution checkpoint and now records the completed local consolidation review. The four approved canonical branches were merged into the isolated integration branch, and every proposed selective-port source received an accept, superseded, defer, archive, or reject outcome. Nothing has been pushed to or merged into `main` yet.

Original remote decisions: **4 integrate**, **16 port**, **37 superseded**, **3 archive**, **6 reject**. Final fetches on 2026-08-26 discovered additional Community export/backup refs: temporary export workflows were rejected, legacy snapshots were archived, and the force-updated clean squash was superseded by the canonical Community integration plus the adapted roster-pagination port.

## Execution outcome

| Source | Final outcome | Integration evidence |
|---|---|---|
| Four canonical `integrate` branches | accepted | Merge commits `7b22edac`, `57bf30b9`, `bf039438`, and `8830e38d` |
| `feat/admin-engine-operability` | adapted port | `6b802bbf` |
| `perf/web-auth-speed` | adapted port | `8de2d4f3` |
| `feat/engine-prelaunch-hardening` | five adapted ports | `925a07b6`, `a26d2089`, `c9f8ea82`, `1d9dee93`, `a15d2e1b` |
| `feat/engine-fingerprint-ratelimit` | fingerprint accepted; Redis fallback rejected | `254e0fc5`; current atomic DB rate limiter retained |
| `docs/feature-5of5-production-plans` | canonical plans accepted; probe/markers rejected | `5de647d6` |
| `refactor/architecture-simplification` | migration ownership guard accepted; stale runtime/admin rewrites rejected | `4cbe0a88` |
| `codex/seo-p0-p4-hardening` | deployment-route parity residual accepted; duplicated behavior omitted | `95e65cec` |
| `feat/web-community-product` | member-roster pagination adapted; obsolete parallel UI/router rejected | `f2f9784e` |
| Supabase remediation, credits hardening, and local API billing | superseded by equivalent or stronger current implementations | no source changes |
| `chore/remove-legacy-scrapers` | rejected | conflicts with the repository's active `crawl4ai-scraper` contract |
| `worktree-scraper-progress-refactor` | rejected | unrelated old history targeting the retired admin Scraper monolith |
| `worktree-edutu-communities-slice-1` | deferred | dirty active worktree, 638 commits behind; owner handoff required |

## Decision meanings

- `integrate`: current canonical branch may be merged with a no-commit review and scoped verification.
- `port`: do not merge branch history; select or recreate only approved residual changes on the current integration baseline.
- `superseded`: current main or a recorded merged PR already contains the intended result.
- `archive`: preserve for history; never merge directly.
- `reject`: temporary, closed, obsolete, operational-only, or unrelated history.

## Completed direct integrations

| Branch | PR | Behind | Unique patches | Scope | Evidence |
|---|---:|---:|---:|---|---|
| `agent/opportunity-content-ux` | #66 OPEN; #64 MERGED | 0 | 29 | .github,docs,edutumobile | #66 OPEN; #64 MERGED; current canonical candidate at 0 commits behind main. |
| `codex/seo-hydration-consistency` | #67 OPEN draft | 0 | 19 | .github,backend,edutu-web-app,scripts | #67 OPEN draft; current canonical candidate at 0 commits behind main. |
| `feat/web-community-parity-seo` | #56 OPEN draft | 0 | 63 | admin,backend,docs,edutu-web-app,edutumobile | #56 OPEN draft; current canonical candidate at 0 commits behind main. |
| `refactor/admin-shell-engine-production` | #60 OPEN draft | 0 | 141 | .github,__invalid__,admin,backend,docs,scripts | #60 OPEN draft; current canonical candidate at 0 commits behind main. |

## Reviewed selective-port candidates

| Branch | PR | Behind | Unique patches | Scope | Evidence |
|---|---:|---:|---:|---|---|
| `chore/remove-legacy-scrapers` | #44 OPEN | 660 | 1 | admin,backend,crawl4ai-scraper,other-files | #44 OPEN; stale/stacked history requires selected commits or a refreshed diff. |
| `codex/seo-p0-p4-hardening` | #62 OPEN draft | 25 | 35 | .github,backend,docs,edutu-web-app,scripts,vercel.json | #62 OPEN draft; stale/stacked history requires selected commits or a refreshed diff. |
| `codex/supabase-render-security-remediation-20260812` | none | 517 | 26 | .superpowers,backend,docs,edutu-web-app,edutumobile,supabase | No PR; 26 unique security patches on a stale branch require selective review. |
| `docs/feature-5of5-production-plans` | #52 OPEN | 330 | 5 | docs | #52 OPEN; stale/stacked history requires selected commits or a refreshed diff. |
| `feat/admin-engine-operability` | #46 OPEN | 660 | 1 | admin,backend | #46 OPEN; stale/stacked history requires selected commits or a refreshed diff. |
| `feat/auth-remove-apple` | none | 773 | 1 | edutu-web-app | none; stale/stacked history requires selected commits or a refreshed diff. |
| `feat/engine-fingerprint-ratelimit` | #47 OPEN→feat/engine-prelaunch-hardening | 660 | 7 | api-docs,backend,edutu-web-app,edutumobile | #47 OPEN→feat/engine-prelaunch-hardening; stale/stacked history requires selected commits or a refreshed diff. |
| `feat/engine-prelaunch-hardening` | #43 OPEN | 660 | 5 | api-docs,backend,edutu-web-app,edutumobile | #43 OPEN; stale/stacked history requires selected commits or a refreshed diff. |
| `feat/mobile-haptics-toggle` | #39 OPEN→feat/ai-win-coach-everywhere | 710 | 1 | edutumobile | #39 OPEN→feat/ai-win-coach-everywhere; stale/stacked history requires selected commits or a refreshed diff. |
| `feat/web-community-product` | #74 CLOSED→feat/web-community-parity-seo; #57 OPEN draft | 309 | 108 | .github,admin,backend,edutu-web-app | #74 CLOSED→feat/web-community-parity-seo; #57 OPEN draft; stale/stacked history requires selected commits or a refreshed diff. |
| `fix/backend-lint-cleanup` | #14 MERGED | 761 | 1 | edutumobile | PR #14 merged at 58fe5448; current tip advanced to f6005d1e with one residual patch to review. |
| `fix/profile-raw-clerk-id-and-remove-web-ai-coach` | #13 MERGED; #12 MERGED | 765 | 1 | edutu-web-app,edutumobile | PRs #12/#13 merged; current tip advanced with one residual patch to review. |
| `perf/web-auth-speed` | #23 OPEN | 754 | 1 | edutu-web-app | #23 OPEN; stale/stacked history requires selected commits or a refreshed diff. |
| `refactor/architecture-simplification` | #55 OPEN draft | 276 | 37 | .github,admin,backend,docs,edutu-web-app,edutumobile,scripts,vercel.json | #55 OPEN draft; stale/stacked history requires selected commits or a refreshed diff. |
| `security/credits-hardening` | #4 OPEN→feat/personalized-yours-overhaul | 997 | NA | unrelated-history | #4 OPEN→feat/personalized-yours-overhaul; stale/stacked history requires selected commits or a refreshed diff. |
| `worktree-scraper-progress-refactor` | #5 OPEN draft→feat/personalized-yours-overhaul | 997 | NA | unrelated-history | #5 OPEN draft→feat/personalized-yours-overhaul; stale/stacked history requires selected commits or a refreshed diff. |

## Overlap resolution and executed order

| Order | Family | Canonical source | Residual sources | Resolution | Original blocker |
|---:|---|---|---|---|---|
| 1 | Opportunity content | `agent/opportunity-content-ux` / PR #66 | none | Merge the current branch, then verify mobile opportunity-detail/application-support behavior. | GitHub Mobile Tests currently fail; external Vercel checks are rate-limited. |
| 2 | SEO/hydration | `codex/seo-hydration-consistency` / PR #67 | `codex/seo-p0-p4-hardening` / PR #62 | Merge #67 as the current baseline; port only hardening behavior from #62 that is absent after #67. PR #61 (`codex/seo-p0-p4`) is already merged. | #67 currently fails backend lint, web lint, web build/typecheck, and two SEO contracts. #62 conflicts with main. |
| 3 | Admin shell/Engine | `refactor/admin-shell-engine-production` / PR #60 | `feat/admin-engine-operability` / PR #46 | Merge #60; its history contains `archive/admin-shell-engine-wip-2026-08-24`. Port the small independent operability residual afterward. | Production read-only smoke currently fails; source branch is large (113 files). |
| 4 | Community/RTL | `feat/web-community-parity-seo` / PR #56 | `feat/web-community-product` / PR #57 | Merge current, main-synced #56 first. PR #76 merged RTL into #57, but PR #74 attempted and did not merge #57 into #56; therefore review and port only the product/RTL residual after #56. | #57 conflicts with main and is 309 commits behind. #56 code checks pass; external Vercel checks are rate-limited. |
| 5 | Architecture/5-of-5 | current integration baseline | `refactor/architecture-simplification`, `docs/feature-5of5-production-plans` | Do not merge the stale architecture branch. Port only still-relevant architecture guards and the canonical documentation commits. | PR #55 conflicts with main and spans 58 files; docs PR #52 is 330 commits behind. |
| 6 | Engine hardening | current integration baseline | PRs #43, #47, #46, and #44 | Port in dependency order: prelaunch hardening, fingerprint/rate-limit, admin operability, then deliberate legacy deletion. | All source histories are roughly 660 commits behind; #43/#46/#44 conflict with main. |
| 7 | Security and local-only residuals | current integration baseline | Supabase/Render remediation, PR #4, `codex/push-main-20260813`, and `worktree-edutu-communities-slice-1` | Review individual security/social commits against current schemas and billing code; never merge their old histories. | PR #4 and the local worktrees are based on old or unrelated histories; active-worktree owner handoff is required. |

The user approved this order. Each blocker was fixed, adapted, or explicitly excluded on the integration branch before the next family proceeded; the resulting commits and checks are recorded in the integration log.

## Full remote inventory

| Branch | Tip | Behind/Ahead | Ancestry | Unique | Family | Touched roots | PRs | Decision | Evidence |
|---|---|---:|---|---:|---|---|---|---|---|
| `agent/community-legacy-export` | `3944b9b3` | 309/110 | unmerged | 110 | community/operations | .github plus stale community tree | none | **reject** | Adds only a temporary source-export workflow on top of `feat/web-community-product`; no new product patch. |
| `agent/community-merge-base-export` | `38319e76` | 309/1 | unmerged | 1 | community/operations | .github | none | **reject** | The sole patch is a temporary merge-base source-export workflow. |
| `agent/community-web-clean` | `71cfc518` | 0/1 | unmerged | 1 | community | admin,backend,edutu-web-app | none | **superseded** | Force-updated to a squash of the already-reviewed legacy parallel Community tree. Canonical PR #56 plus `f2f9784e` contains the accepted behavior without the obsolete duplicate router/components. |
| `agent/community-web-clean-backup-71cfc5` | `71cfc518` | 0/1 | unmerged | 1 | community/archive | admin,backend,edutu-web-app | none | **archive** | Backup ref at the exact same tip as `agent/community-web-clean`; retain for provenance only. |
| `agent/opportunity-content-ux` | `cda393fa` | 0/30 | unmerged | 29 | SEO/opportunity | .github,docs,edutumobile | #66 OPEN; #64 MERGED | **integrate** | #66 OPEN; #64 MERGED; current canonical candidate at 0 commits behind main. |
| `archive/admin-shell-engine-wip-2026-08-24` | `06dc6e1d` | 25/56 | unmerged | 55 | admin/engine | .github,admin,backend,docs,scripts | none | **archive** | Ancestor of refactor/admin-shell-engine-production; retain as snapshot. |
| `archive/pr56-before-pr57-reconciliation-2026-08-24` | `be233561` | 25/43 | unmerged | 43 | archive | .github,backend,docs,edutu-web-app,edutumobile | none | **archive** | Named historical snapshot; never merge directly. |
| `archive/web-community-parity-seo-pre-rebase-20260823` | `de15b3bd` | 328/85 | unmerged | 84 | community | backend,docs,edutu-web-app | none | **archive** | Named historical snapshot; never merge directly. |
| `archive/web-community-product-legacy-20260826` | `4d55c495` | 309/109 | unmerged | 108 | community/archive | .github,admin,backend,edutu-web-app | none | **archive** | Same product tip as `feat/web-community-product`; retained as the explicit legacy snapshot after selective review. |
| `chatgpt-write-test-20260820-1249` | `b9040827` | 331/2 | unmerged | 2 | other | none | none | **reject** | Temporary write-access test history; current tree contributes no files. |
| `chore/ci-hardening` | `fbeb799d` | 760/17 | unmerged | 16 | CI | .github,backend,edutumobile | #17 MERGED | **superseded** | #17 MERGED; GitHub records the source PR merged. |
| `chore/engine-governance-docs` | `fd7fc050` | 660/1 | unmerged | 1 | admin/engine | docs,scripts | #45 CLOSED | **superseded** | Closed PR #45; secret-rotation/readiness governance subsequently landed through PRs #58 and #59. |
| `chore/lint-check-mode` | `2110caf7` | 754/2 | unmerged | 2 | CI | backend | #26 MERGED | **superseded** | #26 MERGED; GitHub records the source PR merged. |
| `chore/remove-legacy-scrapers` | `dca52e97` | 660/1 | unmerged | 1 | scraper | admin,backend,crawl4ai-scraper,other-files | #44 OPEN | **port** | #44 OPEN; stale/stacked history requires selected commits or a refreshed diff. |
| `codex/bachs-source-of-truth-20260811` | `de868cd2` | 340/0 | merged | 0 | other | none | none | **superseded** | Branch tip is an ancestor of origin/main. |
| `codex/seo-hydration-consistency` | `b22c7dfb` | 0/19 | unmerged | 19 | SEO/opportunity | .github,backend,edutu-web-app,scripts | #67 OPEN draft | **integrate** | #67 OPEN draft; current canonical candidate at 0 commits behind main. |
| `codex/seo-p0-p4` | `e23b7671` | 45/27 | unmerged | 27 | SEO/opportunity | .github,backend,docs,edutu-web-app,scripts,vercel.json | #61 MERGED | **superseded** | #61 MERGED; GitHub records the source PR merged. |
| `codex/seo-p0-p4-hardening` | `bb6f3899` | 25/35 | unmerged | 35 | SEO/opportunity | .github,backend,docs,edutu-web-app,scripts,vercel.json | #62 OPEN draft | **port** | #62 OPEN draft; stale/stacked history requires selected commits or a refreshed diff. |
| `codex/seo-social-previews-20260812` | `bd9e6c75` | 557/22 | unmerged | 0 | SEO/opportunity | docs,edutu-web-app | none | **superseded** | No unique non-merge patches against origin/main. |
| `codex/supabase-render-security-remediation-20260812` | `8f403db1` | 517/26 | unmerged | 26 | security/billing | .superpowers,backend,docs,edutu-web-app,edutumobile,supabase | none | **port** | No PR; 26 unique security patches on a stale branch require selective review. |
| `deploy/backend-voice-main-20260812` | `4bda28eb` | 559/0 | merged | 0 | other | none | none | **superseded** | Branch tip is an ancestor of origin/main. |
| `docs/feature-5of5-production-plans` | `c7c97f52` | 330/5 | unmerged | 5 | architecture/5of5 | docs | #52 OPEN | **port** | #52 OPEN; stale/stacked history requires selected commits or a refreshed diff. |
| `feat/5of5-execution` | `90d1016c` | 67/0 | merged | 0 | architecture/5of5 | none | #53 MERGED | **superseded** | Branch tip is an ancestor of origin/main. |
| `feat/5of5-wave0-foundation` | `c7c97f52` | 330/5 | unmerged | 5 | architecture/5of5 | docs | none | **superseded** | Same tip as docs/feature-5of5-production-plans; keep one canonical port source. |
| `feat/admin-app-control-push` | `0562e6fe` | 739/2 | unmerged | 2 | admin/engine | admin,edutumobile | #36 MERGED | **superseded** | #36 MERGED; GitHub records the source PR merged. |
| `feat/admin-engine-operability` | `602c466a` | 660/1 | unmerged | 1 | admin/engine | admin,backend | #46 OPEN | **port** | #46 OPEN; stale/stacked history requires selected commits or a refreshed diff. |
| `feat/ai-copilot-and-fit-fixes` | `0b5dbea0` | 628/0 | merged | 0 | other | none | #48 MERGED | **superseded** | Branch tip is an ancestor of origin/main. |
| `feat/ai-win-coach-everywhere` | `10a455be` | 710/0 | merged | 0 | other | none | #37 MERGED | **superseded** | Branch tip is an ancestor of origin/main. |
| `feat/auth-remove-apple` | `ac6c1e02` | 773/1 | unmerged | 1 | auth | edutu-web-app | none | **port** | none; stale/stacked history requires selected commits or a refreshed diff. |
| `feat/engine-fingerprint-ratelimit` | `00b5e8bc` | 660/7 | unmerged | 7 | admin/engine | api-docs,backend,edutu-web-app,edutumobile | #47 OPEN→feat/engine-prelaunch-hardening | **port** | #47 OPEN→feat/engine-prelaunch-hardening; stale/stacked history requires selected commits or a refreshed diff. |
| `feat/engine-prelaunch-hardening` | `75ca62ab` | 660/5 | unmerged | 5 | admin/engine | api-docs,backend,edutu-web-app,edutumobile | #43 OPEN | **port** | #43 OPEN; stale/stacked history requires selected commits or a refreshed diff. |
| `feat/mobile-haptics-toggle` | `8d31ccab` | 710/1 | unmerged | 1 | mobile | edutumobile | #39 OPEN→feat/ai-win-coach-everywhere | **port** | #39 OPEN→feat/ai-win-coach-everywhere; stale/stacked history requires selected commits or a refreshed diff. |
| `feat/mobile-nav-styles` | `826e3342` | 746/0 | merged | 0 | mobile | none | none | **superseded** | Branch tip is an ancestor of origin/main. |
| `feat/paywall-redesign` | `23ada543` | 723/1 | unmerged | 0 | mobile | edutumobile | #38 OPEN | **superseded** | PR #38 remains open, but Git finds zero unique non-merge patches against current main. |
| `feat/personalized-yours-overhaul` | `9649104e` | 997/114 | unmerged | NA | other | unrelated-history | #6 MERGED | **superseded** | #6 MERGED; GitHub records the source PR merged. |
| `feat/user-trust-masterplan` | `6b433def` | 697/0 | merged | 0 | other | none | #40 MERGED | **superseded** | Branch tip is an ancestor of origin/main. |
| `feat/web-community-parity-seo` | `12aa2c3e` | 0/64 | unmerged | 63 | community | admin,backend,docs,edutu-web-app,edutumobile | #56 OPEN draft | **integrate** | #56 OPEN draft; current canonical candidate at 0 commits behind main. |
| `feat/web-community-product` | `4d55c495` | 309/109 | unmerged | 108 | community | .github,admin,backend,edutu-web-app | #74 CLOSED→feat/web-community-parity-seo; #57 OPEN draft | **port** | #74 CLOSED→feat/web-community-parity-seo; #57 OPEN draft; stale/stacked history requires selected commits or a refreshed diff. |
| `feat/web-community-rtl` | `bc8675f4` | 309/104 | unmerged | 104 | community | .github,admin,backend,edutu-web-app | #76 MERGED→feat/web-community-product | **superseded** | #76 MERGED→feat/web-community-product; GitHub records the source PR merged. |
| `feat/web-personalized-yours` | `789e4383` | 997/96 | unmerged | NA | other | unrelated-history | #1 MERGED | **superseded** | #1 MERGED; GitHub records the source PR merged. |
| `feat/web-swr-catalog` | `e9a0ae50` | 749/1 | unmerged | 0 | SEO/opportunity | edutu-web-app | #29 MERGED | **superseded** | #29 MERGED; GitHub records the source PR merged. |
| `feature/roadmap-goals-ux` | `949f11b1` | 997/103 | unmerged | NA | other | unrelated-history | #3 MERGED | **superseded** | #3 MERGED; GitHub records the source PR merged. |
| `fix/api-readiness-architecture-guards` | `60873542` | 30/0 | merged | 0 | architecture/5of5 | none | #58 MERGED | **superseded** | Branch tip is an ancestor of origin/main. |
| `fix/api-runtime-residuals` | `b3ad5fae` | 26/0 | merged | 0 | other | none | #59 MERGED | **superseded** | Branch tip is an ancestor of origin/main. |
| `fix/backend-lint-cleanup` | `f6005d1e` | 761/1 | unmerged | 1 | CI | edutumobile | #14 MERGED | **port** | PR #14 merged at 58fe5448; current tip advanced to f6005d1e with one residual patch to review. |
| `fix/backend-lint-post-merge` | `448c150e` | 751/1 | unmerged | 0 | CI | backend | #28 MERGED | **superseded** | #28 MERGED; GitHub records the source PR merged. |
| `fix/ci-backend-tests` | `760533bf` | 760/1 | unmerged | 1 | CI | backend | #16 CLOSED | **reject** | PR #16 closed unmerged; clean-main backend baseline currently passes all 2,009 tests. |
| `fix/ci-green-main` | `055063b3` | 638/1 | unmerged | 0 | CI | backend,edutumobile | #50 MERGED | **superseded** | #50 MERGED; GitHub records the source PR merged. |
| `fix/ci-mobile-typecheck` | `3b10e241` | 760/16 | unmerged | 16 | mobile | backend,edutumobile | #15 MERGED | **superseded** | #15 MERGED; GitHub records the source PR merged. |
| `fix/ci-node-20` | `4456b5c2` | 755/0 | merged | 0 | CI | none | #22 MERGED; #20 MERGED | **superseded** | Branch tip is an ancestor of origin/main. |
| `fix/ci-node-parity` | `71ba80a6` | 760/18 | unmerged | 17 | CI | .github,backend,edutumobile | #18 MERGED | **superseded** | #18 MERGED; GitHub records the source PR merged. |
| `fix/creator-studio-and-roadmap-detail-ui` | `781ca7eb` | 997/190 | unmerged | NA | other | unrelated-history | none | **reject** | none; no approved path to current main. |
| `fix/lint-drift-from-merges` | `affe7cb4` | 751/1 | unmerged | 0 | CI | backend | #27 MERGED | **superseded** | #27 MERGED; GitHub records the source PR merged. |
| `fix/metering-guestfeed-cv-crash` | `7f715c64` | 746/4 | unmerged | 4 | other | backend,edutumobile | #33 MERGED | **superseded** | #33 MERGED; GitHub records the source PR merged. |
| `fix/opportunities-first-impression` | `1968fbf7` | 310/0 | merged | 0 | other | none | #54 MERGED | **superseded** | Branch tip is an ancestor of origin/main. |
| `fix/production-hardening-p0-p1` | `b762a9fe` | 276/2 | unmerged | 0 | other | .github,admin,backend,docs,edutu-web-app,edutumobile,scripts,vercel.json | #51 CLOSED | **superseded** | PR #51 closed; its follow-up production work landed through PRs #53, #58, #59, and #61. |
| `fix/profile-raw-clerk-id-and-remove-web-ai-coach` | `be25edb1` | 765/2 | unmerged | 1 | other | edutu-web-app,edutumobile | #13 MERGED; #12 MERGED | **port** | PRs #12/#13 merged; current tip advanced with one residual patch to review. |
| `fix/roadmap-enrollment-user-id-keying` | `de3669e6` | 997/154 | unmerged | NA | other | unrelated-history | #7 MERGED | **superseded** | #7 MERGED; GitHub records the source PR merged. |
| `fix/share-unfurl-dedup` | `51ff5a80` | 664/0 | merged | 0 | other | none | #42 MERGED | **superseded** | Branch tip is an ancestor of origin/main. |
| `fix/store-launch-blockers` | `f8556187` | 744/20 | unmerged | 19 | other | backend,edutumobile,pay-edutu-org | #21 MERGED | **superseded** | #21 MERGED; GitHub records the source PR merged. |
| `integration/web-merge` | `df587963` | 997/148 | unmerged | NA | other | unrelated-history | none | **reject** | none; no approved path to current main. |
| `main` | `fea6259d` | 0/0 | merged | 0 | other | none | #73 MERGED→feat/web-community-parity-seo; #65 MERGED→refactor/admin-shell-engine-production; #63 MERGED→refactor/admin-shell-engine-production | **superseded** | Branch tip is an ancestor of origin/main. |
| `ops/render-deploy-main-2026-08-25` | `4270293b` | 0/1 | unmerged | 1 | other | .github | none | **reject** | Operational deployment trigger only; not product source. |
| `perf/web-auth-speed` | `0f66c53b` | 754/1 | unmerged | 1 | auth | edutu-web-app | #23 OPEN | **port** | #23 OPEN; stale/stacked history requires selected commits or a refreshed diff. |
| `refactor/admin-shell-engine-production` | `22cf9051` | 0/143 | unmerged | 141 | admin/engine | .github,__invalid__,admin,backend,docs,scripts | #60 OPEN draft | **integrate** | #60 OPEN draft; current canonical candidate at 0 commits behind main. |
| `refactor/architecture-simplification` | `aafaa2f4` | 276/39 | unmerged | 37 | architecture/5of5 | .github,admin,backend,docs,edutu-web-app,edutumobile,scripts,vercel.json | #55 OPEN draft | **port** | #55 OPEN draft; stale/stacked history requires selected commits or a refreshed diff. |
| `security/credits-hardening` | `79d325f7` | 997/109 | unmerged | NA | security/billing | unrelated-history | #4 OPEN→feat/personalized-yours-overhaul | **port** | #4 OPEN→feat/personalized-yours-overhaul; stale/stacked history requires selected commits or a refreshed diff. |
| `test-noop` | `fea6259d` | 0/0 | merged | 0 | other | none | none | **superseded** | Branch tip is an ancestor of origin/main. |
| `web-ui-theme-refactor` | `7b6d7d4f` | 997/96 | unmerged | NA | other | unrelated-history | #2 CLOSED | **reject** | PR #2 closed unmerged and history is unrelated to current main. |
| `worktree-group-discussions` | `7783f3cb` | 637/50 | unmerged | 46 | community | backend,docs,edutumobile,supabase | #49 MERGED | **superseded** | #49 MERGED; GitHub records the source PR merged. |
| `worktree-scraper-progress-refactor` | `178e07cb` | 997/111 | unmerged | NA | scraper | unrelated-history | #5 OPEN draft→feat/personalized-yours-overhaul | **port** | #5 OPEN draft→feat/personalized-yours-overhaul; stale/stacked history requires selected commits or a refreshed diff. |

## Local-only or deleted-remote branches

These branches are preserved locally and are not merged automatically.

| Branch | Tip | Behind | Ancestry | Unique | Decision | Evidence |
|---|---|---:|---|---:|---|---|
| `backend/ai-resilience-opportunity-cache` | `b66347e8` | 997 | unmerged | NA | **superseded** | Tip contained in main or no unique non-merge patches. |
| `backup/pre-split-74a02a9` | `74a02a9d` | 432 | unmerged | 1 | **archive** | Named pre-split backup; preserve as archive. |
| `chore/admin-lint-ci` | `6b1c1395` | 748 | unmerged | 0 | **superseded** | Tip contained in main or no unique non-merge patches. |
| `chore/mobile-lint-ci` | `66622c6b` | 746 | unmerged | 0 | **superseded** | Tip contained in main or no unique non-merge patches. |
| `chore/mobile-react-compiler-backlog` | `8594fd77` | 740 | unmerged | 0 | **superseded** | Tip contained in main or no unique non-merge patches. |
| `chore/web-lint-ci` | `d2acbacc` | 747 | unmerged | 2 | **superseded** | PR #31 merged; remote branch was deleted. |
| `codex/merge-security-into-main-20260813` | `9ac9d9e3` | 402 | merged | 0 | **superseded** | Tip contained in main or no unique non-merge patches. |
| `codex/pre-main-merge-20260815` | `7cb15539` | 401 | merged | 0 | **superseded** | Tip contained in main or no unique non-merge patches. |
| `codex/push-main-20260813` | `123771e6` | 532 | unmerged | 3 | **port** | Four local API billing/security commits; three unique patches require selective review. |
| `docs/bachs-payment-review-20` | `13f014ec` | 561 | merged | 0 | **superseded** | Tip contained in main or no unique non-merge patches. |
| `feat/ai-integration-safety-overhaul` | `e7d10b08` | 704 | merged | 0 | **superseded** | Tip contained in main or no unique non-merge patches. |
| `feat/bachs-universal-payments` | `13f014ec` | 561 | merged | 0 | **superseded** | Tip contained in main or no unique non-merge patches. |
| `feat/backend-og-render` | `60b27dc8` | 774 | unmerged | 0 | **superseded** | Tip contained in main or no unique non-merge patches. |
| `feat/revenuecat-mobile-e2e` | `129fdddc` | 706 | merged | 0 | **superseded** | Tip contained in main or no unique non-merge patches. |
| `feat/vercel-og-function` | `050e2611` | 780 | unmerged | 0 | **superseded** | Tip contained in main or no unique non-merge patches. |
| `feat/vercel-og-middleware` | `a6718eab` | 782 | unmerged | 0 | **superseded** | Tip contained in main or no unique non-merge patches. |
| `feature/roadmap-engine-quickwins` | `62f8c659` | 997 | unmerged | NA | **superseded** | Tip contained in main or no unique non-merge patches. |
| `feature/roadmap-ux` | `a496219c` | 997 | unmerged | NA | **superseded** | Tip contained in main or no unique non-merge patches. |
| `fix/mobile-intent-modal-retry` | `22d42950` | 739 | unmerged | 0 | **superseded** | Tip contained in main or no unique non-merge patches. |
| `merge/ai-overhaul-into-main` | `af3f83fc` | 665 | merged | 0 | **superseded** | Tip contained in main or no unique non-merge patches. |
| `merge/pr48-resolve` | `2e3d80ae` | 586 | unmerged | 1 | **superseded** | PR #48 is merged; preserve only as historical conflict-resolution branch. |
| `merge/round2` | `cb651435` | 643 | merged | 0 | **superseded** | Tip contained in main or no unique non-merge patches. |
| `merge/round3` | `0d3fc361` | 638 | merged | 0 | **superseded** | Tip contained in main or no unique non-merge patches. |
| `refactor/creator-studio-overview-spacing` | `abfb4da6` | 707 | merged | 0 | **superseded** | Tip contained in main or no unique non-merge patches. |
| `refactor/web-ui-theme-tokens` | `b925d1a5` | 997 | unmerged | NA | **superseded** | Tip contained in main or no unique non-merge patches. |
| `split/backend-e257-preview` | `bf510df9` | 536 | merged | 0 | **superseded** | Tip contained in main or no unique non-merge patches. |
| `ui/web-theme-tokens-refactor` | `04937092` | 997 | unmerged | NA | **reject** | Unrelated old history corresponding to the closed theme-refactor effort. |
| `worktree-edutu-communities-slice-1` | `21d49818` | 638 | unmerged | 23 | **port** | Active local worktree with 23 unique social/community patches; owner handoff required. |

## Concurrent work excluded from this audit

The shared main worktree contains uncommitted admin and backend changes owned by another terminal:

- `admin/src/pages/Dashboard.tsx`
- `admin/src/pages/Dashboard.test.tsx`
- `backend/services/services/api/src/db/index.ts`
- `backend/services/services/api/src/db/index.spec.ts`

These files were not staged, stashed, committed, reset, copied, or merged. Their owner must commit them to a named branch before they can enter the inventory.
