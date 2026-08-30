# Notification Engagement Engine v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an adaptive, measurable notification engine that selects the best opportunity, CV, AI-coach, or reactivation prompt for each Edutu learner and attributes the resulting valuable action.

**Architecture:** Backend producers enqueue validated notification candidates instead of sending routine discovery pushes directly. The existing scheduler ranks, collapses, suppresses, and times candidates before handing them to the existing transport, while a new authenticated telemetry boundary connects delivery and opens to downstream actions. Mobile remains a thin API client with contextual permission, preferences, deep links, and action reporting.

**Tech Stack:** NestJS, TypeScript, Drizzle ORM, PostgreSQL/Supabase, Expo React Native, Expo Notifications, Clerk, Jest.

**Spec:** `docs/superpowers/specs/2026-08-30-notification-engagement-engine-design.md`

## Global Constraints

- Clients use `backend/services/services/api` for business logic and privileged writes.
- Clerk is the primary user identity; backend ownership checks are mandatory.
- `notification_candidates` and attribution events are server-written only.
- AI copy may refine grounded deterministic copy but may not invent facts or urgency.
- Quiet hours, dedupe, explicit preferences, and transactional delivery remain enforced at the shared transport.
- Routine rollout starts in shadow mode and keeps a holdout group.

---

### Task 1: Canonical taxonomy, preferences, and schema

**Files:**
- Modify: `backend/services/services/api/src/notifications/dto/notification.dto.ts`
- Modify: `backend/services/services/api/src/db/schema.ts`
- Create: `backend/services/services/api/supabase/migrations/20260830170000_notification_engagement_engine_v1.sql`
- Modify: `edutumobile/packages/core/src/types/notification.ts`
- Modify: `edutumobile/packages/core/src/services/notificationPreferences.ts`
- Test: `backend/services/services/api/src/notifications/notifications.service.spec.ts`
- Test: `edutumobile/__tests__/notificationPreferences.test.ts`

**Interfaces:**
- Produces notification kinds `opportunity-recent`, `opportunity-interest`, `opportunity-similar`, `opportunity-trending`, `opportunity-potential`, `ai-coach`, `cv-update`, and `reactivation`.
- Produces preference booleans `cvCoaching`, `aiCoaching`, `communityUpdates`, and `reactivationNudges`.

- [ ] Write backend and mobile tests that reject unknown kinds and normalize every new preference.
- [ ] Run the focused tests and confirm they fail because the new kinds/preferences do not exist.
- [ ] Generate the migration with `supabase migration new notification_engagement_engine_v1`.
- [ ] Add columns, checks, telemetry table, uniqueness, RLS, revokes, and service-role grants.
- [ ] Update Drizzle, DTO, and mobile types/preferences.
- [ ] Run focused tests and SQL migration assertions until green.
- [ ] Commit the task.

### Task 2: Candidate ingestion boundary and scheduler modes

**Files:**
- Create: `backend/services/services/api/src/notifications/candidates/notification-candidate.service.ts`
- Create: `backend/services/services/api/src/notifications/candidates/notification-candidate.service.spec.ts`
- Create: `backend/services/services/api/src/notifications/candidates/notification-candidate.types.ts`
- Modify: `backend/services/services/api/src/notifications/notifications.module.ts`
- Modify: `backend/services/services/api/src/notifications/scheduler/notification-scheduler.service.ts`
- Modify: `backend/services/services/api/src/notifications/scheduler/notification-scheduler.service.spec.ts`

**Interfaces:**
- Produces `enqueue(input: NotificationCandidateInput): Promise<{ id: string | null; inserted: boolean }>`.
- Produces scheduler mode `off | shadow | live` from `NOTIFICATION_SCHEDULER_V2_MODE`.
- Produces `drain(...): { users; considered; collapsed; selected; sent; shadowed }`.

- [ ] Write failing tests for validation, UUID normalization, retry-safe conflicts, off mode, shadow non-consumption, and live selection ceilings.
- [ ] Run focused tests and confirm expected failures.
- [ ] Implement the minimal candidate service and module wiring.
- [ ] Refactor the scheduler flag into explicit modes and preserve the legacy boolean as a live-mode compatibility fallback.
- [ ] Add per-user winner ceiling and shadow decision telemetry.
- [ ] Run focused tests until green.
- [ ] Commit the task.

### Task 3: Adaptive budgets and topic enforcement

**Files:**
- Create: `backend/services/services/api/src/notifications/notification-budget-policy.ts`
- Create: `backend/services/services/api/src/notifications/notification-budget-policy.spec.ts`
- Modify: `backend/services/services/api/src/notifications/notifications.service.ts`
- Modify: `backend/services/services/api/src/notifications/notifications.service.spec.ts`

**Interfaces:**
- Produces `classifyEngagementTier(context): NotificationEngagementTier`.
- Produces `budgetForTier(tier): { routineDay; urgentDay; week }`.
- Maps every new kind to its account preference.

- [ ] Write failing table-driven tests for new, engaged, standard, and dormant tiers.
- [ ] Write failing service tests proving CV, AI, community, and reactivation preferences suppress only their mapped pushes.
- [ ] Run tests and confirm expected failures.
- [ ] Implement pure policy helpers and batched context loading.
- [ ] Replace static routine/week caps with per-user tier budgets while retaining urgent/transactional rules.
- [ ] Run focused tests until green.
- [ ] Commit the task.

### Task 4: Opportunity candidate producers

**Files:**
- Create: `backend/services/services/api/src/alerts/opportunity-notification-candidates.service.ts`
- Create: `backend/services/services/api/src/alerts/opportunity-notification-candidates.service.spec.ts`
- Modify: `backend/services/services/api/src/alerts/alerts.module.ts`
- Modify: `backend/services/services/api/src/alerts/opportunity-alerts.service.ts`
- Modify: `backend/services/services/api/src/alerts/opportunity-alerts.service.spec.ts`

**Interfaces:**
- Produces `produceForUser(user, now): Promise<ProducerResult>`.
- Enqueues recent, interest, similar, trending, and potential candidates with deterministic copy and routes.

- [ ] Write failing eligibility tests for each family using literal fixtures and independently derived scores.
- [ ] Write failing tests that dismissals/existing interactions prevent duplicate candidates.
- [ ] Run focused tests and confirm expected failures.
- [ ] Implement bounded queries for fresh catalog, recent signal velocity, similarity seeds, and near-match reasons.
- [ ] Enqueue candidates through `NotificationCandidateService`; preserve direct-send behavior only when scheduler mode is off.
- [ ] Run focused tests until green.
- [ ] Commit the task.

### Task 5: CV, AI-coach, and reactivation producers

**Files:**
- Create: `backend/services/services/api/src/notifications/producers/lifecycle-notification-producer.service.ts`
- Create: `backend/services/services/api/src/notifications/producers/lifecycle-notification-producer.service.spec.ts`
- Modify: `backend/services/services/api/src/notifications/notifications.module.ts`

**Interfaces:**
- Produces `run(now?: Date): Promise<{ users; cv; coach; reactivation }>`.
- CV eligibility uses saved/application intent plus missing or stale CV facts.
- Reactivation offsets are exactly 3, 7, and 14 days and are deduped per lifecycle window.

- [ ] Write failing tests for missing CV after multiple saves, stale CV after relevant activity, active application document gap, and non-eligible idle users.
- [ ] Write failing tests for the 3/7/14-day reactivation sequence and meaningful-action reset.
- [ ] Run focused tests and confirm expected failures.
- [ ] Implement bounded batched SQL and deterministic notification copy.
- [ ] Enqueue AI-coach candidates only when a concrete next action and destination exist.
- [ ] Run focused tests until green.
- [ ] Commit the task.

### Task 6: Authenticated conversion telemetry

**Files:**
- Create: `backend/services/services/api/src/notifications/notification-events.service.ts`
- Create: `backend/services/services/api/src/notifications/notification-events.service.spec.ts`
- Modify: `backend/services/services/api/src/notifications/notifications.controller.ts`
- Modify: `backend/services/services/api/src/notifications/dto/notification.dto.ts`

**Interfaces:**
- Produces `POST /notifications/:id/events` with `{ event, entityId?, occurredAt?, metadata? }`.
- Rejects notifications not owned by the authenticated user.
- Returns an idempotent event record for duplicate submissions.

- [ ] Write failing ownership, validation, idempotency, and event-shape tests.
- [ ] Run focused tests and confirm expected failures.
- [ ] Implement service and controller boundary.
- [ ] Add aggregation fields needed by scheduler conversion weighting.
- [ ] Run focused tests until green.
- [ ] Commit the task.

### Task 7: Mobile preferences, routing, and action attribution

**Files:**
- Create: `edutumobile/packages/core/src/services/notificationEvents.ts`
- Create: `edutumobile/__tests__/notificationEvents.test.ts`
- Modify: `edutumobile/app/(app)/profile/settings.tsx`
- Modify: `edutumobile/app/(app)/_layout.tsx`
- Modify: `edutumobile/app/(app)/notifications.tsx`
- Modify: `edutumobile/lib/notificationCategories.ts`
- Modify: `edutumobile/lib/notifications.ts`
- Delete: `edutumobile/packages/core/src/services/inAppNotifications.ts`
- Delete: `edutumobile/packages/core/src/services/notifications.ts`

**Interfaces:**
- Produces `reportNotificationEvent(getToken, notificationId, event, metadata)`.
- Topic toggles persist through `/notifications/preferences`.
- Every new kind has an icon and a valid backend-issued internal route.

- [ ] Write failing tests for event request auth/body, preference patches, and route/event extraction.
- [ ] Run mobile Jest tests and confirm expected failures.
- [ ] Implement the API service and mobile wiring.
- [ ] Add CV/coach Android channel and preserve opportunity/deadline/community channels.
- [ ] Make iOS dismissal recordable and remove unused direct-Supabase notification writers.
- [ ] Run mobile tests and typecheck until green.
- [ ] Commit the task.

### Task 8: Rollout controls and verification

**Files:**
- Modify: `backend/services/services/api/.env.example`
- Modify: `backend/services/services/api/src/notifications/scheduler/notification-scheduler.service.spec.ts`
- Create: `backend/services/services/api/docs/notification-engagement-rollout.md`

**Interfaces:**
- Documents `NOTIFICATION_SCHEDULER_V2_MODE=off|shadow|live`, cohort percentage, holdout percentage, and budget ramp.

- [ ] Add failing configuration tests for invalid mode/cohort/holdout values.
- [ ] Implement validated rollout configuration and deterministic user bucketing.
- [ ] Run notification/alert backend suites.
- [ ] Run backend lint and build/typecheck.
- [ ] Run mobile notification suites, typecheck, and lint.
- [ ] Run migration/security assertions or document the missing live-database verification explicitly.
- [ ] Review the diff for secrets, direct Supabase writes, unbounded queries, and unrelated changes.
- [ ] Commit the task.
