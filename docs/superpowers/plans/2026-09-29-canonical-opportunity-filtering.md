# Canonical Opportunity Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make category filters return opportunities according to the canonical classification, even when a legacy display category is stale.

**Architecture:** Normalize the requested category with the existing API taxonomy. Apply it to canonical-category and legacy display fields in both the NestJS learner catalog and static snapshot fallback. Keep the current query parameter and response shape.

**Tech Stack:** NestJS, TypeScript, Drizzle ORM, Supabase client, PostgreSQL/PGlite, Jest.

**Spec:** [Edutu 2.0 product and guidance architecture](../../product-strategy/2026-09-28-edutu-v2-product-architecture.md), plus the [opportunity catalog trust slice](./2026-09-29-opportunity-catalog-trust.md).

## Global Constraints

- Canonical category is authoritative when present and recognized.
- Keep legacy category labels queryable during data cleanup.
- Preserve existing pagination, expiry, verification, and duplicate filters.
- Do not rewrite opportunity records or add a database migration in this slice.

## Review Focus

- Stale display labels must not hide an opportunity from its canonical category.
- Existing title-cased labels and canonical slugs both resolve to the same category.
- Unknown category values retain the existing exact legacy filter behavior.
- Static snapshot filtering must agree with the live catalog result.

---

### Task 1: Filter the learner catalog by canonical category

**Files:**
- Modify `backend/services/services/api/src/opportunities/opportunities.service.ts`
- Modify `backend/services/services/api/src/opportunities/opportunity-catalog.visibility.spec.ts`
- Modify `backend/services/services/api/src/opportunities/opportunity-static-snapshot.ts`
- Modify `backend/services/services/api/src/opportunities/opportunity-static-snapshot.spec.ts`

**Interface:** Keep `findAll(limit, offset, status, category)` and `filterStaticOpportunityRows(...)` unchanged. Normalize supported category aliases with `normalizeCategory`; match canonical category plus the compatible legacy category label in Supabase, Drizzle, and static snapshot paths.

- [x] Add a verified listing whose display `category` is `Scholarships` and `canonical_category` is `internships`. Assert an `internships` query includes it and a `scholarships` query excludes it.
- [x] Add the same case to static snapshot category filtering.
- [x] Run the catalog and snapshot tests and confirm the new cases fail against display-category-only filtering.
- [x] Implement canonical-first category query predicates without changing other public visibility filters.
- [x] Re-run catalog and snapshot tests, API lint, and API build.
- [ ] Commit as `fix(api): filter opportunities by canonical category`.
