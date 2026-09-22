# Care Plan 03 — Planning and Blockers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Delegate only when authorized.

**Goal:** Turn pursuits into realistic daily progress, with recovery when time or dependencies become a problem.

**Architecture:** The backend generates deterministic, version-bound schedule previews and next actions. Users approve date changes; activity status and blocker records modify scheduling without rewriting opportunity outcomes.

**Tech Stack:** Existing NestJS/Drizzle and web/mobile stacks; timezone-aware date handling and existing calendar integrations.

**Spec:** [Care Plan v1](../specs/2026-09-09-edutu-care-plan-v1.md), R05–R07 and R14. Depends on plans 01–02.

## Global Constraints

- Web and mobile use the same server decisions, dates, progress, versions, and reminder preferences.
- Users can edit preferences, pause a pursuit, change priority, dismiss recommendations, and stop reminders.
- Preserve the existing journey state machine and immutable history; introduce only additive, tested changes.
- Unknown eligibility, cost, deadline, and response dates remain unknown until supported by a source or user entry.

Also apply every global constraint in the spec.

## Task 1: Build schedule previews and a useful Today view

**Files:**
- Create API `src/opportunity-journeys/{care-schedule.engine.ts,care-schedule.service.ts,care-schedule.spec.ts,care-today.policy.ts,care-today.spec.ts}`; extend `care-plan.controller.ts`, `care-plan.types.ts`, `care-plan.service.ts`, module and `src/db/opportunity-journey.schema.ts`.
- Create migration `backend/services/services/api/supabase/migrations/20260909130000_care_planning.sql`.
- Create web `src/features/my-plan/{SchedulePreview.tsx,TodayActions.tsx,MyPlanCalendarPage.tsx,SchedulePreview.test.tsx}`; mobile `components/opportunity-path/{SchedulePreview,TodayActions}.tsx`, `app/(app)/my-plan/calendar.tsx`, `__tests__/careSchedule.test.tsx`.
- Extend client adapters, Today routes and existing deadline presentation utilities.

**Interfaces:** `POST /me/care-plan/schedule/previews` takes `{journeyIds:string[]; bufferDays:number}`; returns a preview. `POST /me/care-plan/schedule/accept` takes `{previewId:string; idempotencyKey:string}`; returns the refreshed snapshot. Backend obtains profile/deadlines/tasks and their versions, never trusts client-supplied provider deadlines.

```ts
export type ScheduleTask = {
  id: string; journeyId: string; minutes: number; dependsOn: string[];
  deadline: string | null; lockedAt: string | null;
};
export type ScheduleSlot = { startAt: string; minutes: number };
export type SchedulePreview = {
  id: string; expiresAt: string; versions: Record<string, number>;
  assignments: Array<{ taskId:string; startAt:string; minutes:number }>;
  unscheduledTaskIds: string[];
  warnings: Array<{ code:'capacity'|'unknown_deadline'|'dependency'|'locked_conflict'; taskIds:string[] }>;
};
export type TodayCandidate = {
  action: PlanAction; paused:boolean; blocked:boolean; completed:boolean;
  priority: 'primary'|'secondary'|'none';
};
export function actionableToday(c: TodayCandidate): boolean {
  return !c.paused && !c.completed &&
    (!c.blocked || c.action.key === 'resolve_blocker');
}
```

`PlanAction` is defined by plan 01. Export `buildSchedule(tasks: ScheduleTask[], slots: ScheduleSlot[]): Omit<SchedulePreview,'id'|'expiresAt'|'versions'>` from the engine; `buildSchedule` consumes slots already converted from the profile's timezone and buffer-adjusted deadlines. Version keys are `journey:<id>`, `source:<opportunityId>` and `profile`; check each on acceptance. Persist the preview for 30 minutes but treat preview creation as read-like: it does not change any task date.

- [ ] Test feasible multi-pursuit schedule, insufficient time, unknown deadline, dependency cycle, locked-task conflict, DST boundary, date-only provider deadline and completion of a task on the other client. Verify no schedule is persisted until acceptance and a changed journey/source/profile version rejects the preview.

```ts
const result = buildSchedule([
  { id:'essay', journeyId:'j1', minutes:60, dependsOn:[],
    deadline:'2026-09-11T12:00:00Z', lockedAt:null }
], [{ startAt:'2026-09-10T10:00:00Z', minutes:30 }]);
expect(result.unscheduledTaskIds).toContain('essay');
expect(result.warnings.some(w => w.code === 'capacity')).toBe(true);
```

- [ ] Run API `npm test -- --runInBand --testPathPatterns='care-schedule|care-today'`; run new client schedule suites; expect new behavior failures.
- [ ] Add schedule records with owner, preview ID, profile/source/journey versions, assignments, warnings, acceptedAt and expiresAt (30 minutes). Normalize estimates up to 15-minute units. Validate the dependency graph, reserve locked tasks, traverse remaining tasks in reverse topological order, allocate the latest available contiguous/split 15-minute slots before each dependent task and buffered deadline, and return unallocated work explicitly. Never allocate beyond capacity or use a guessed deadline. Accept in one transaction after rechecking versions; duplicate accept returns the same result. Date-only deadlines use an explicit conservative personal planning date in the user's timezone, visibly distinct from the provider's unknown cutoff.
- [ ] Feed Today from actionable incomplete tasks: overdue/near-deadline actions first, then primary pursuit, then earliest accepted scheduled time; stable tie-break by task ID. Display one lead action and at most two more, plus a blocker-resolution action where necessary. Add calendar list/month views, distinguish provider deadlines from personal tasks, and implement explicit ICS export on web and existing permission-based calendar export on mobile. Exports include stable UID/version so repeated export does not imply a new task; external calendar changes are not silently treated as edits to Edutu.
- [ ] Pass schedule/Today/API/client tests and typechecks. Manually preview/accept on web then inspect mobile Today; repeat with no capacity. Commit scoped files with `feat: schedule achievable care plan actions`.

## Task 2: Pause, switch priority and connect goals/roadmaps

**Files:**
- Create API `src/opportunity-journeys/{care-activity.service.ts,care-activity.spec.ts,care-plan-links.service.ts,care-plan-links.spec.ts}`; modify controller/types/module, `opportunity-journeys.service.ts`, `opportunity-next-action.ts`, schema and plan 03 migration before release.
- Extend web `MyPlanPursuitsPage.tsx`, `MyPlanDetailPage.tsx`; create `src/features/my-plan/{PlanCapacitySheet,LinkedGoalSteps}.tsx`, `careActivity.test.ts`.
- Extend mobile journey cards/detail; create `components/opportunity-path/{PlanCapacitySheet,LinkedGoalSteps}.tsx`, `__tests__/careActivity.test.tsx`; modify `app/(app)/goals/index.tsx`, `app/(app)/roadmaps.tsx`.
- Reuse web `src/services/roadmapApi.ts`; create `src/services/goalApi.ts` against existing backend goal routes if no equivalent already exists.

**Interfaces:** `PATCH /me/care-plan/journeys/:id/activity` takes `{activityStatus:'active'|'paused'; resumeAt:string|null; expectedVersion:number; idempotencyKey:string}`. `POST /me/care-plan/journeys/:id/links` takes `{kind:'goal'|'roadmap_step'; targetId:string; taskId:string|null; expectedVersion:number; idempotencyKey:string}`. Return the updated journey detail with `activityStatus` and `links`. Export:

```ts
export function capacityDecision(activeCount: number,
  acknowledged: boolean): 'allow'|'confirm_workload'|'limit' {
  if (activeCount >= 20) return 'limit';
  return activeCount >= 3 && !acknowledged ? 'confirm_workload' : 'allow';
}
```

Add `POST /me/care-plan/journeys/:id/activation-preview` returning `{id:string; expiresAt:string; versions:Record<string,number>; activeCount:number; weeklyMinutes:number; decision:'allow'|'confirm_workload'|'limit'}`. Store this preview as kind `activation` in the preview table, expire after 30 minutes and include every active journey version. `POST /me/care-plan/journeys/:id/activate` takes `{previewId:string; acknowledgeWorkload:boolean; expectedVersion:number; idempotencyKey:string}` and returns the updated detail; recheck capacity under a user-scoped transaction lock. `DELETE /me/care-plan/journeys/:id/links/:linkId` takes `{expectedVersion:number;idempotencyKey:string}` and returns the updated detail. These commands reuse journey operations/history rather than write separate pursuit state.

- [ ] Write tests for paused task disappearing from Today, retained progress/history, resume requiring schedule preview, one-primary invariant, a fourth pursuit requiring acknowledgement, 20-active cap, foreign goal/roadmap denial and idempotent linked completion.

```ts
expect(capacityDecision(3, false)).toBe('confirm_workload');
expect(capacityDecision(3, true)).toBe('allow');
expect(capacityDecision(20, true)).toBe('limit');
```

- [ ] Run API `npm test -- --runInBand --testPathPatterns='care-activity|care-plan-links'` and client activity suites; expect behavior failures.
- [ ] Add journey `activityStatus`, `pausedAt`, `resumeAt`; add links table with owner, journey, kind, target ID and optional task ID, uniqueness on link identity. Ownership-check both ends. Link to existing goal/roadmap records rather than cloning their tasks; linked completion emits one canonical event and projects one completion into each existing view. A one-way checklist link can be removed without deleting the goal/roadmap. ResumeAt creates a prompt, not automatic resumption. Reassign primary and clear previous primary transactionally. Keep the old activation limit for legacy clients; capable clients send an acknowledged workload preview ID tied to current versions to exceed three. Pausing invalidates schedules and cancels affected queue entries through the existing service.
- [ ] Add controls and bidirectional deep links on both clients. For linked goals/roadmaps, expose title, step status and next action on web even where the older web navigation lacks a dedicated page. Do not remove existing tools or recalculate aggregate progress twice.
- [ ] Pass activity, link ownership, compatibility and queue-cancellation tests plus client typechecks. Commit with `feat: add flexible pursuit activity and goal links`.

## Task 3: Turn “I'm stuck” into specific, persistent help

**Files:**
- Create API `src/opportunity-journeys/{care-blockers.service.ts,care-blockers.policy.ts,care-blockers.spec.ts}`; extend controller/types/module, Today policy and planning schema/migration.
- Create web `src/features/my-plan/{BlockerHelpSheet.tsx,BlockerHelpSheet.test.tsx}`; mobile `components/opportunity-path/BlockerHelpSheet.tsx`, `__tests__/careBlockers.test.tsx`.
- Integrate into Today, pursuit detail, tasks and the existing copilot entry points on each client.

**Interfaces:** `POST /me/care-plan/journeys/:id/blockers` takes `{taskId:string|null; kind:BlockerKind; note:string|null; checkAgainAt:string|null; expectedVersion:number; idempotencyKey:string}`. `PATCH /me/care-plan/blockers/:id` takes `{status:'resolved'|'dismissed'; expectedVersion:number; idempotencyKey:string}`. Export:

```ts
export type BlockerKind = 'document'|'referee'|'question'|'time'|'cost'|'waiting';
export function blockerAction(kind: BlockerKind):
  'find_material'|'draft_request'|'explain_question'|'reschedule'|'review_cost'|'set_check_in' {
  return ({ document:'find_material', referee:'draft_request',
    question:'explain_question', time:'reschedule', cost:'review_cost',
    waiting:'set_check_in' } as const)[kind];
}
```

- [ ] Test every blocker mapping, saved blocker → Today change, waiting dependency → no repeated task reminder, resolution → actionable task restored, note length limits and foreign ownership rejection. UI tests assert the sheet produces a saved next step and allows cancel without changing the plan.

```ts
expect(blockerAction('time')).toBe('reschedule');
expect(blockerAction('referee')).toBe('draft_request');
```

- [ ] Run API `npm test -- --runInBand --testPathPatterns=care-blockers` and both client blocker suites; expect new action assertions to fail.
- [ ] Persist blocker owner/journey/task, kind, note (maximum 2,000 characters), status, checkAgainAt, version and timestamps. Route document help to Resources, referee help to an editable user-sent draft, unclear question to contextual copilot with source text, time to schedule preview, cost to visible funding/cost constraints and waiting to a chosen check-in. No inferred emotional state. Blocked tasks stay in progress accounting but cannot generate ordinary “complete this task” nudges. Resolve/dismiss updates the same journey version and creates an immutable event.
- [ ] Pass policy/API/UI/Today tests and typechecks; verify blocker resolution saved on mobile updates web. Commit with `feat: connect blockers to actionable help`.

**Exit:** The plan reflects actual time and dependencies; users can adjust it without losing progress, and asking for help changes what happens next.
