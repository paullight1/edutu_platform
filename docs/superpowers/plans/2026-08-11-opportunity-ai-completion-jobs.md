# Opportunity AI Completion Jobs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make bulk opportunity AI completion persistent, token-conscious, and visibly trackable through a polished admin progress dialog.

**Architecture:** A Supabase-backed NestJS job service owns execution and recovery. The React admin starts and polls jobs through a focused API module and renders a modal state machine plus compact toolbar progress.

**Tech Stack:** NestJS 11, TypeScript, Supabase PostgreSQL, React 19, Vite, Vitest, Testing Library.

## Global Constraints

- Client requests must go through the NestJS backend.
- Existing user changes in the dirty worktree must be preserved.
- One active job is allowed globally, and bulk enhancement skips high-quality records enhanced within 30 days.
- The single-record AI improve action remains an explicit forced refresh.
- The background job must reconnect after navigation or refresh and must persist progress after every record.

---

### Task 1: Persistent job schema and job contract

**Files:**
- Create: `supabase/migrations/20260811180000_opportunity_ai_completion_jobs.sql`
- Create: `backend/services/services/api/src/opportunities/opportunity-enrichment-job.ts`
- Test: `backend/services/services/api/src/opportunities/opportunity-enrichment-job.spec.ts`

**Interfaces:**
- Produces: `OpportunityEnrichmentJob`, `shouldSkipOpportunityEnhancement(opportunity, now?)`, and progress/status normalization helpers.

- [ ] Write failing tests proving a recent score-70+ enhancement skips while stale, low-quality, or missing metadata does not.
- [ ] Run `npm test -- opportunity-enrichment-job.spec.ts --runInBand` and verify the missing module/function failure.
- [ ] Add the pure job contract/helper and SQL table with UUID validation, state constraints, counters, lease fields, RLS, service-role grants, and one-active-job index.
- [ ] Re-run the focused test and verify it passes.

### Task 2: Durable background worker and admin endpoints

**Files:**
- Create: `backend/services/services/api/src/opportunities/opportunity-enrichment-job.service.ts`
- Test: `backend/services/services/api/src/opportunities/opportunity-enrichment-job.service.spec.ts`
- Modify: `backend/services/services/api/src/opportunities/opportunities.service.ts`
- Modify: `backend/services/services/api/src/opportunities/opportunities.controller.ts`
- Modify: `backend/services/services/api/src/opportunities/opportunities.module.ts`

**Interfaces:**
- Produces: `createJob(ids, createdBy)`, `getActiveJob()`, and `getJob(id)`.
- Consumes: `OpportunitiesService.enhanceOpportunity(id, { skipIfFresh: true })`.

- [ ] Write failing service tests for one active job, sequential counter updates, skip accounting, failure continuation, and resume from `nextIndex`.
- [ ] Run the focused Jest test and verify behavioral failures.
- [ ] Implement the repository-backed worker with a per-instance busy guard, optimistic lease claim, heartbeat/progress writes, boot recovery, and interval recovery.
- [ ] Add the skip-if-fresh option to `enhanceOpportunity` while preserving forced single-row behavior.
- [ ] Add guarded create/active/detail controller routes and register the provider.
- [ ] Re-run focused tests and the opportunities test group.

### Task 3: Admin API client and progress dialog

**Files:**
- Create: `admin/src/pages/opportunities/ai-completion-job.ts`
- Test: `admin/src/pages/opportunities/ai-completion-job.spec.ts`
- Create: `admin/src/pages/opportunities/AiCompletionJobModal.tsx`
- Test: `admin/src/pages/opportunities/AiCompletionJobModal.spec.tsx`
- Modify: `admin/src/pages/Opportunities.tsx`
- Modify: `admin/src/index.css`

**Interfaces:**
- Produces: typed start/fetch helpers, `AiCompletionJobModal`, polling/reconnect state, and local-storage acknowledgement.

- [ ] Write failing tests for percent/count derivation and confirmation, running, background-dismiss, error, and completed UI states.
- [ ] Run the focused Vitest tests and verify the expected failures.
- [ ] Implement typed job helpers and the accessible dialog using existing admin tokens, reduced-motion support, skeleton/loading treatment, determinate progress, and result counters.
- [ ] Replace the browser-owned sequential loop with create-and-poll behavior; reconnect to the stored or active job on mount; keep compact toolbar progress visible while the dialog is closed.
- [ ] Re-run focused tests and the full admin test suite.

### Task 4: Verification and handoff

**Files:**
- Verify all files above without modifying unrelated work.

- [ ] Run backend focused tests, backend build, admin tests, admin lint, and admin build.
- [ ] Start the local apps if environment configuration permits and verify the confirmation, running, background, reconnect, and completed states in Playwright.
- [ ] Review `git diff` to confirm only intended files and pre-existing user edits are present.

