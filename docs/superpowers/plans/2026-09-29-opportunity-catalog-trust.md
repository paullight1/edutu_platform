# Opportunity Catalog Trust Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop duplicate opportunities and stale display categories from misleading learners across the public catalog, recommendations, and web cards.

**Architecture:** Extend Edutu's existing trust boundary. The NestJS API will exclude rows already marked with `duplicate_of` from browse, search, feeds, recommendations, and static lists while keeping existing direct details usable; the web adapter will prefer the canonical category already supplied by the API. The existing Postgres columns and API route shapes remain unchanged.

**Tech Stack:** NestJS, TypeScript, Drizzle ORM, PostgreSQL/Supabase, React, Vitest, Jest, PGlite.

**Spec:** [Edutu 2.0 product and guidance architecture](../../product-strategy/2026-09-28-edutu-v2-product-architecture.md), especially its data trust, source freshness, and deterministic recommendation constraints.

## Global Constraints

- All business data continues through the NestJS API; the browser does not gain direct Supabase access.
- Only active, verified, non-expired, non-duplicate opportunities may appear in browse, search, feeds, or recommendations; existing detail links remain usable for saved work and history.
- A canonical category is the API-owned classification; source/display category is a compatibility fallback only.
- Do not merge or delete existing opportunity records in this slice; existing duplicate annotations remain reviewable by admins.
- No database migration, new dependency, new route, or navigation redesign is required.

## Review Focus

- Legacy public API and learner service paths must apply the same duplicate exclusion.
- Static/degraded snapshots must not reintroduce duplicate rows filtered by the live query.
- Rows without duplicate metadata remain visible under current status and verification rules.
- A missing or generic canonical category must fall back to a useful stored display category.
- Category output keeps the current display labels and does not change ranking or eligibility.

---

### Task 1: Exclude annotated duplicates from public opportunity visibility

**Files:**
- Modify `backend/services/services/api/src/opportunities/opportunity-visibility.ts`
- Modify `backend/services/services/api/src/opportunities/opportunity-catalog.visibility.spec.ts`
- Modify `backend/services/services/api/src/opportunities/opportunity-static-snapshot.spec.ts`
- Modify other visibility contract tests only if a public call path is uncovered

**Interface:** Preserve existing detail-visibility helpers and response shapes. Add discoverability helpers that require `duplicateOf` to be null, and use them in browse, search, feeds, recommendations, sitemaps, and static snapshot lists. Direct detail lookups keep the existing active/verified rule so old saved items and journeys remain accessible.

- [x] Add an active, verified row with `duplicate_of` set to the existing approved row in the PGlite fixture. Assert it is absent from browse/search/recommendation results while its existing direct detail remains available.
- [x] Run `npm test -- --runInBand src/opportunities/opportunity-catalog.visibility.spec.ts src/opportunities/opportunity-static-snapshot.spec.ts` in `backend/services/services/api/` and confirm the duplicate row makes the new assertions fail.
- [x] Implement the null-duplicate predicate in discovery SQL, Drizzle, and snapshot list helpers without changing detail access, status, verification, or expiry rules.
- [x] Re-run the focused visibility suite and related opportunity catalog tests.
- [x] Commit as `fix(api): hide annotated duplicate opportunities`.

### Task 2: Prefer the canonical opportunity category in web cards

**Files:**
- Modify `edutu-web-app/src/services/opportunities.ts`
- Modify `edutu-web-app/src/test/__tests__/opportunitiesCache.test.ts`

**Interface:** Keep `Opportunity.category` as the same display string. In `pickCategory`, use a non-generic `canonical_category` or metadata classification before legacy `category`; when canonical data is missing or `other`, retain the current useful fallback behavior.

- [x] Add a normalization case with stale `category: "Scholarships"` and `canonical_category: "internships"`; assert the normalized card says `Internships`.
- [x] Run `npm run test -- src/test/__tests__/opportunitiesCache.test.ts` in `edutu-web-app/` and confirm the new case fails.
- [x] Implement canonical-first selection while preserving generic-category omission and existing fallback behavior.
- [x] Re-run the focused web test and `npm run typecheck`.
- [x] Commit as `fix(web): prefer canonical opportunity categories`.

### Task 3: Verify catalog presentation and release boundary

**Files:** No additional product files unless verification finds a concrete regression.

- [x] Run the focused backend visibility tests and web category tests together with web typecheck.
- [x] Verify `git diff --check`, inspect each commit, and confirm no generated sitemap or unrelated workspace files changed.
- [x] Do not run a production database cleanup or change existing records in this slice; report any live data repair as a separate, reviewable operation.
