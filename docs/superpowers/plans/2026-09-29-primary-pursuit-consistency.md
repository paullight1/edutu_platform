# Primary Pursuit Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the primary opportunity pursuit first in My Plan, matching the next step already shown on Dashboard.

**Architecture:** The shared NestJS journey repository will order primary pursuits before secondary pursuits for the `pursuing` stage, then preserve its existing next-action/deadline ordering. Web and mobile list adapters keep rendering the server order; no client-side selection rules or response changes are added.

**Tech Stack:** NestJS, TypeScript, Drizzle ORM, PostgreSQL/PGlite, Jest.

**Spec:** [Edutu 2.0 product and guidance architecture](../../product-strategy/2026-09-28-edutu-v2-product-architecture.md) and the current `/me/opportunity-home` contract.

## Global Constraints

- The dashboard and My Plan use the same backend-owned primary pursuit.
- Keep current tie-breakers for secondary pursuits: next-action time, opportunity deadline, and update time.
- Do not change journey state, priority ownership, database schema, or API response shape.
- Preserve existing routes, card styling, and detail links.

## Review Focus

- A primary pursuit with a later next action must still precede an earlier-due secondary pursuit.
- When no primary exists, existing next-action ordering remains intact.
- Applied and outcome history keeps its current chronological ordering unless its stage has a primary pursuit.
- Journey task and opportunity joins return unchanged rows and versions.

---

### Task 1: Order primary pursuit before secondary pursuits

**Files:**
- Modify `backend/services/services/api/src/opportunity-journeys/opportunity-journeys.repository.ts`
- Modify `backend/services/services/api/src/opportunity-journeys/opportunity-journeys.repository.spec.ts`

**Interface:** Keep `listJourneysByStage(userId, stage)` unchanged. For `stage === "pursuing"`, order by priority (`primary` first), then retain the existing next-action/deadline/update tie-breakers. Other stages retain their existing ordering.

- [x] Update the repository test so a later-due primary pursuit is expected before an earlier-due secondary pursuit; keep secondary and no-primary ordering assertions.
- [x] Run `npm test -- --runInBand src/opportunity-journeys/opportunity-journeys.repository.spec.ts` and confirm it fails because the secondary currently sorts first.
- [x] Add the priority ordering only for the pursuing stage.
- [x] Re-run the focused repository test and opportunity-home service test; run API lint/build.
- [ ] Commit as `fix(api): keep primary pursuit first in plan`.
