# Architecture Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify Edutu's architecture incrementally while preserving behavior and returning to a fully green verification state after every phase.

**Architecture:** Establish automated safety rails first, remove duplicate runtime ownership next, then consolidate package/data ownership, decompose oversized admin/mobile/backend modules, and flatten physical paths only after logical boundaries are stable. Each task produces a reversible, independently verified slice.

**Tech Stack:** TypeScript, React/Vite, Expo/React Native, NestJS, Supabase/Postgres, Drizzle, Node.js, GitHub Actions, Vercel.

**Spec:** `docs/superpowers/specs/2026-08-21-architecture-simplification-design.md`

## Global Constraints

- No rewrite and no intentional product behavior change.
- Preserve the production-hardening/security controls already present on the base branch.
- Do not proceed from a red CI phase.
- Prefer extraction and deletion over wrappers and compatibility layers.
- Privileged business logic remains backend-owned.
- Do not flatten physical paths until Phase 6.
- Keep each refactor independently revertible.

---

### Task 1: Architecture regression guard

**Files:**
- Create: `scripts/architecture-boundaries.mjs`
- Create: `scripts/architecture-boundaries.test.mjs`
- Create: `scripts/check-architecture-boundaries.mjs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces `inspectArchitecture(entries)` returning an array of violation messages.
- CLI exits non-zero when violations are present.

- [ ] **Step 1: Write failing tests** covering legacy backend runtime files, repeated `services/services` growth, new app-local shared migration roots, and giant-file budget growth metadata.
- [ ] **Step 2: Run Repository Governance and verify the new tests fail because the production checker does not exist yet.**
- [ ] **Step 3: Implement the pure inspector and CLI.** Existing explicitly grandfathered debt is represented as named exceptions; new occurrences fail.
- [ ] **Step 4: Add the test and CLI to Repository Governance.**
- [ ] **Step 5: Run the exact-head CI matrix and require green before Task 2.**

### Task 2: Legacy Express backend retirement

**Files:**
- Delete when proven unused: `backend/server.js`
- Delete when proven unused: `backend/scraper.js`
- Delete when proven unused: `backend/database.js`
- Delete when proven unused: `backend/package.json`
- Delete when proven unused: `backend/package-lock.json`
- Delete when proven unused: `backend/.env.example`
- Delete or replace: `backend/README.md`
- Modify: root `README.md`
- Modify: `docs/ARCHITECTURE.md`

**Interfaces:**
- Canonical backend remains `backend/services/services/api` until Phase 6.
- No public endpoint is intentionally changed.

- [ ] **Step 1: Prove no CI/deployment file references `backend/server.js`, `backend/scraper.js`, or the `edutu-scraper-api` package.**
- [ ] **Step 2: Verify equivalent active scraper/admin capabilities are owned by the NestJS backend/crawl4ai stack.**
- [ ] **Step 3: Remove the unused legacy runtime files.**
- [ ] **Step 4: Update architecture docs to state there is one canonical backend runtime.**
- [ ] **Step 5: Run full CI and require green before Task 3.**

### Task 3: Canonical migration ownership

**Files:**
- Modify: `docs/MIGRATIONS.md`
- Modify: `docs/DATA_MODEL.md`
- Modify: `scripts/check-migration-timestamps.mjs` or create focused ownership checker if separation is clearer
- Test: add Node test coverage for migration ownership rules

**Interfaces:**
- Shared production migrations: `backend/services/services/api/supabase/migrations/`.
- App-local migration directories become grandfathered historical sources, not valid destinations for new shared migrations.

- [ ] **Step 1: Add a failing test for a newly-created shared-table migration outside the canonical directory.**
- [ ] **Step 2: Implement ownership validation with explicit historical grandfathering.**
- [ ] **Step 3: Update docs with exact ownership rules and migration workflow.**
- [ ] **Step 4: Run Repository Governance + backend tests + full CI.**

### Task 4: Package ownership contract

**Files:**
- Create: `docs/PACKAGE-OWNERSHIP.md`
- Create or modify architecture checker tests
- Later phases may move `edutumobile/packages/core` to root `packages/core`; this task does not move it yet.

**Interfaces:**
- Root `packages/` is the future home of cross-app packages.
- App-internal packages may exist only when they are intentionally app-specific.

- [ ] **Step 1: Encode the allowed current package roots and forbid additional ad hoc package roots.**
- [ ] **Step 2: Document package dependency direction and ownership.**
- [ ] **Step 3: Verify CI.**

### Task 5: Decompose admin Opportunities

**Files:**
- Modify: `admin/src/pages/Opportunities.tsx`
- Create under: `admin/src/features/opportunities/`

**Interfaces:**
- Preserve route and UI behavior.
- Extract domain types, API calls, bulk operations, form model, and presentational sections behind stable feature exports.

- [ ] **Step 1: Add/strengthen tests for opportunity list, create/edit, bulk action and share-card flows.**
- [ ] **Step 2: Extract pure types/constants/utilities.**
- [ ] **Step 3: Extract API/data adapter.**
- [ ] **Step 4: Extract bulk-operation controller/hook.**
- [ ] **Step 5: Extract form and modal components.**
- [ ] **Step 6: Reduce the page to orchestration.**
- [ ] **Step 7: Lower the architecture budget to the new measured line count.**
- [ ] **Step 8: Run admin tests/lint/build and full CI.**

### Task 6: Decompose admin Scraper

**Files:**
- Modify: `admin/src/pages/Scraper.tsx`
- Create under: `admin/src/features/scraper/`

- [ ] **Step 1: Freeze current scraper behaviors with tests.**
- [ ] **Step 2: Extract source/run state, API adapter, review table, settings panels, and progress UI by responsibility.**
- [ ] **Step 3: Reduce page to orchestration and lower its line budget.**
- [ ] **Step 4: Run admin tests/lint/build and full CI.**

### Task 7: Decompose mobile opportunity data layer

**Files:**
- Modify: `edutumobile/packages/core/src/services/opportunities.ts`
- Create under: `edutumobile/packages/core/src/opportunities/`

**Interfaces:**
- Preserve exported public API while implementation moves behind adapters.
- Canonical pieces: normalizer, matching fallback, cache adapter, API adapter, repository/orchestrator.

- [ ] **Step 1: Add characterization tests around normalization, signed-in fallback, offline cache, exclusions, detail status, and ranking hydration.**
- [ ] **Step 2: Extract pure normalization.**
- [ ] **Step 3: Extract pure offline matching.**
- [ ] **Step 4: Extract cache adapter.**
- [ ] **Step 5: Extract HTTP/Supabase adapters.**
- [ ] **Step 6: Leave `services/opportunities.ts` as a compatibility facade, then remove the facade in Phase 6 after imports migrate.**
- [ ] **Step 7: Run mobile tests/typecheck/lint and full CI.**

### Task 8: Decompose mobile opportunity detail

**Files:**
- Modify: `edutumobile/app/(app)/opportunities/[id].tsx`
- Create under: `edutumobile/features/opportunity-detail/`

- [ ] **Step 1: Characterize deep-link, save/apply, share, dismiss, roadmap, calendar, notification and AI-action behavior.**
- [ ] **Step 2: Extract share model and actions.**
- [ ] **Step 3: Extract roadmap controller.**
- [ ] **Step 4: Extract application/save/dismiss controller.**
- [ ] **Step 5: Extract screen view model.**
- [ ] **Step 6: Reduce route to params + view model + components.**
- [ ] **Step 7: Lower architecture budget and run mobile/full CI.**

### Task 9: Decompose mobile home and chat

**Files:**
- Modify: `edutumobile/app/(app)/index.tsx`
- Modify: `edutumobile/app/(app)/chat.tsx`
- Create feature modules beneath `edutumobile/features/`

- [ ] **Step 1: Characterize behavior.**
- [ ] **Step 2: Extract data/controller state from route components.**
- [ ] **Step 3: Extract cohesive visual sections.**
- [ ] **Step 4: Lower budgets and verify mobile/full CI after each screen.**

### Task 10: Decompose backend Opportunities service

**Files:**
- Modify: `backend/services/services/api/src/opportunities/opportunities.service.ts`
- Create focused services/repositories within the same Nest module.

- [ ] **Step 1: Characterize controller-visible behavior with existing unit/e2e tests plus focused tests for extracted responsibilities.**
- [ ] **Step 2: Extract catalog/query responsibility.**
- [ ] **Step 3: Extract recommendation/ranking responsibility.**
- [ ] **Step 4: Extract enrichment/share/publication responsibility.**
- [ ] **Step 5: Keep `OpportunitiesService` as thin orchestration/facade while controllers remain unchanged.**
- [ ] **Step 6: Lower budget and run backend/full CI.**

### Task 11: Decompose backend Scraper service

**Files:**
- Modify: `backend/services/services/api/src/scraper/scraper.service.ts`
- Create focused services within the scraper module.

- [ ] **Step 1: Characterize run control, fetching, extraction, dedup/trust, persistence, and publication flows.**
- [ ] **Step 2: Extract run orchestration.**
- [ ] **Step 3: Extract fetch/extraction pipeline.**
- [ ] **Step 4: Extract persistence/publication.**
- [ ] **Step 5: Lower budget and run backend/full CI.**

### Task 12: Physical layout migration

**Files:**
- Move apps/services/packages to target layout only after Tasks 1-11 are green.
- Modify all CI, deployment, tsconfig, package, Capacitor/Expo, Supabase and documentation paths atomically per moved subsystem.

- [ ] **Step 1: Move one subsystem at a time with a temporary compatibility command/alias only when necessary.**
- [ ] **Step 2: Verify subsystem CI and deployment configuration.**
- [ ] **Step 3: Remove compatibility shim.**
- [ ] **Step 4: Repeat until the target layout is reached.**
- [ ] **Step 5: Run the complete exact-head CI matrix and external deployment checks.**

### Task 13: Final architecture review

- [ ] **Step 1: Re-run architecture metrics and confirm all debt ceilings decreased or were intentionally eliminated.**
- [ ] **Step 2: Check dependency direction, migration ownership, package ownership, duplicate runtimes and direct data-access exceptions.**
- [ ] **Step 3: Update onboarding/architecture docs to match the actual tree.**
- [ ] **Step 4: Run full CI and review the final diff for accidental behavior changes.**
