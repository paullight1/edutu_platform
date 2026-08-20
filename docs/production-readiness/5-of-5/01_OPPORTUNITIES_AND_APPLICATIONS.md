# Opportunities & Applications 5/5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use test-driven implementation and review each task before moving to the next.

**Goal:** make Edutu's core Discover → Decide → Apply → Track loop production-grade.

**Primary files:** `edutu-web-app/src/components/OpportunitiesPage.tsx`, `OpportunityDetail*`, `Dashboard.tsx`, `ApplicationsPage.tsx`, `services/opportunities.ts`, `services/applications.ts`, `services/bookmarks.ts`, backend `opportunities/`, `applications/`, `me/`, and associated tests.

## Feature 1 — Opportunity Discovery & Matching

### 5/5 acceptance criteria

- Search/filter/sort are fast and correct with 100k+ opportunities.
- Match scores explain positive reasons, missing profile data, and eligibility risks.
- Every public opportunity exposes source provenance, last verified time, deadline confidence, application fee, required documents, and official application URL where available.
- Expired, duplicate, low-confidence, or unverified items are handled explicitly.
- Saving, sharing, dismissing, impressions, and personalization signals are durable and idempotent.
- Offline/PWA behavior never leaks user-scoped data across accounts.

### Tasks

- [ ] **F1-T1 — Move catalogue query semantics server-side.** Add cursor pagination, query, category, funding, deadline, location and sort parameters to backend opportunity queries; keep a small validated client cache rather than treating a full local array as the long-term search engine.
- [ ] **F1-T2 — Build decision-cockpit detail UX.** Add eligibility checklist, match explanation, missing-profile prompts, document checklist, effort estimate, source verification panel, fee/funding facts, and a primary CTA sequence: Save → Build plan → Track application → Apply externally.
- [ ] **F1-T3 — Add trust metadata.** Persist `verified_at`, source URL/domain, verification method, confidence, deadline confidence and source freshness. Never synthesize certainty when data is missing.
- [ ] **F1-T4 — Recommendation quality evaluation.** Create a labeled golden dataset and tests for eligibility, ranking, demographic neutrality, stale-data handling and explanation correctness.
- [ ] **F1-T5 — Performance.** Add API query indexes, cache-control/ETag strategy, query result limits, abortable client requests and Core Web Vitals budgets.
- [ ] **F1-T6 — Observability.** Track detail-open, save, dismiss reason, apply-start, external-apply click, recommendation impression and recommendation disagreement.

### Required tests

- Backend query/filter/pagination contract tests.
- Opportunity publication/active-only E2E.
- Browser test: search → filter → open → save → dismiss → return.
- Offline test with account switch proving no user data leakage.
- Load test for catalogue and recommendation endpoints.

## Feature 2 — Application Management

### 5/5 acceptance criteria

- Application state and history persist across devices.
- Users can track Draft → Submitted → Interview → Offer plus Rejected/Withdrawn/No Response without losing history.
- Notes/reflections/files/interview dates/reminders are server-backed.
- Every destructive/status action is authenticated, authorized and auditable.
- The product always offers a useful next action after terminal outcomes.

### Tasks

- [ ] **F2-T1 — Replace local-only reflection storage.** Move rejection/no-response reflections from `localStorage` into application history storage via the backend.
- [ ] **F2-T2 — Add immutable status timeline.** Record previous status, next status, timestamp, actor and optional note; derive analytics from history instead of current-row mutation only.
- [ ] **F2-T3 — Add application workspace.** Support document checklist, reusable answers, notes, interview details, reference/contact tasks and official application link.
- [ ] **F2-T4 — Concurrency/idempotency.** Add optimistic concurrency or version checks for application updates and idempotency for repeated writes.
- [ ] **F2-T5 — UX polish.** Replace browser confirms/alerts with accessible dialogs/toasts; add undo where safe; preserve filtered/search state on navigation.
- [ ] **F2-T6 — Lifecycle automation.** Trigger reminders for unfinished drafts, upcoming interviews, stale submitted applications and configurable no-response closure.
- [ ] **F2-T7 — Analytics.** Measure save→draft, draft→submit, submit→interview, interview→offer, time-in-stage and return-after-rejection.

### Required tests

- Authorization tests proving one user cannot read/mutate another user's applications.
- Status transition/state-machine tests.
- Cross-device persistence test for notes/reflections.
- Browser test: create/track → update status → add reflection → reload → verify persistence.
- Notification integration tests for application deadlines/interviews.

## Exit evidence

Do not mark either feature 5/5 until the global gates are green and the production-like browser journeys, security tests, performance budgets, and analytics events are demonstrated in the verification template.
