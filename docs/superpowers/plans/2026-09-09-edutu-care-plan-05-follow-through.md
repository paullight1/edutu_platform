# Care Plan 05 — Follow-Through and Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Delegate only when authorized.

**Goal:** Help users manage the period after applying and continue constructively through an outcome.

**Architecture:** Extend confirmed journey events and existing application history. Follow-up metadata and tasks feed Today and the current notification queue; one set of cancellation/delivery rules applies to old and new entry points.

**Tech Stack:** Existing NestJS/Drizzle notification scheduler, application services and web/mobile UI stacks.

**Spec:** [Care Plan v1](../specs/2026-09-09-edutu-care-plan-v1.md), R10–R13. Depends on plans 01, 03 and 04.

## Global Constraints

- Opening a provider link never confirms submission; only an explicit user confirmation records applied status.
- Unknown eligibility, cost, deadline, and response dates remain unknown until supported by a source or user entry.
- Users can edit preferences, pause a pursuit, change priority, dismiss recommendations, and stop reminders.
- AI drafts require review; no invented achievements, automatic submissions, or automatic external messages.

Also apply every global constraint in the spec.

## Task 1: Track confirmed submission, waiting, follow-up and interviews

**Files:**
- Extend API `src/opportunity-journeys/{opportunity-journeys.service.ts,dto/opportunity-journey.dto.ts,care-plan.types.ts,care-plan.controller.ts,care-today.policy.ts}` and module/schema.
- Create API `src/opportunity-journeys/{care-followups.service.ts,care-followups.policy.ts,care-followups.spec.ts}`.
- Create migration `backend/services/services/api/supabase/migrations/20260909150000_care_followups.sql`.
- Create web `src/features/my-plan/{MyPlanApplicationsPage,ApplicationConfirmationSheet,FollowUpPanel,InterviewPrepPanel}.tsx`, `careFollowups.test.tsx`; reuse `src/services/applications.ts` history interfaces.
- Create mobile `app/(app)/my-plan/applications.tsx`, `components/opportunity-path/{ApplicationConfirmationSheet,FollowUpPanel,InterviewPrepPanel}.tsx`, `__tests__/careFollowups.test.tsx`; route old `applied.tsx` through the shared application screen logic.

**Interfaces:** Extend the existing confirmation body additively with `submittedAt`, optional `reference`, and optional owned receipt material/version. Add `GET/PUT /me/care-plan/journeys/:id/follow-up`; PUT takes `{followUp:FollowUpPlan; expectedVersion:number; idempotencyKey:string}` and returns updated detail.

```ts
export type FollowUpPlan = {
  expectedReplyAt:string|null; expectedReplySource:'provider'|'user'|'unknown';
  sourceUrl:string|null; checkAgainAt:string|null;
  interview:{ at:string; timezone:string; locationOrLink:string|null }|null;
};
export function waitingAction(expectedAt:string|null, now:string):
  'keep_waiting'|'review_follow_up' {
  return expectedAt !== null && expectedAt <= now ? 'review_follow_up' : 'keep_waiting';
}
```

- [ ] Test opening versus confirmation, historical confirmed date, invalid future submission date, duplicate confirmation, receipt ownership, unknown reply date, interview reschedule and explicit check-in changes from the other client. Assert no response date automatically changes applied status.

```ts
expect(waitingAction(null, '2026-10-01T09:00:00Z')).toBe('keep_waiting');
expect(waitingAction('2026-09-30T09:00:00Z', '2026-10-01T09:00:00Z'))
  .toBe('review_follow_up');
```

- [ ] Run API `npm test -- --runInBand --testPathPatterns='care-followups|opportunity-plan.e2e'` and both client follow-up suites; expect new flows to fail.
- [ ] Persist owner/journey follow-up fields and version, with unique journey ownership and due-time index. Add submission reference/receipt links to existing history without copying private files. Prompt “Did you submit?” when the user returns from the provider, with Submitted / Still preparing / Later; only Submitted calls confirmation. Support manually recording a past submission independent of app checklist progress. Reject dates in the future beyond five minutes of clock skew.
- [ ] Add waiting actions Check provider status, Draft follow-up, Keep waiting and Record outcome. Build interview prep from existing selected materials, provider details, logistics and a user-editable practice checklist. User-selected personal dates and provider-stated dates use different labels. Follow-up drafts remain unsent until the user explicitly uses an external channel. A moved interview/check-in cancels its old queued reminder.
- [ ] Pass contract/history/ownership/UI suites and typechecks. Verify confirmation on mobile appears as confirmed on web, and an ordinary provider-link click does not. Commit scoped files with `feat: support application follow-through and interview preparation`.

## Task 2: Make outcomes useful without erasing the user's work

**Files:**
- Extend API `src/opportunity-journeys/{opportunity-journeys.service.ts,opportunity-journey-compatibility.service.ts,care-today.policy.ts,care-plan.types.ts}`.
- Create API `src/opportunity-journeys/{care-outcome.policy.ts,care-outcome.spec.ts}`.
- Modify `src/notifications/application-ghost-closure.service.ts` and its existing `__tests__/application-ghost-closure.spec.ts`.
- Create web `src/features/my-plan/{OutcomeReviewSheet.tsx,OutcomeReviewSheet.test.tsx}`; mobile `components/opportunity-path/OutcomeReviewSheet.tsx`, `__tests__/careOutcomes.test.tsx`.
- Reuse existing web `src/services/applicationReflectionState.ts` and application history APIs.

**Interfaces:** Keep the existing dedicated outcome endpoint. Extend its optional metadata with `{reflection:string|null; offerDecisionAt:string|null}`. Add `outcomeChoices(outcome:CareOutcome):string[]` as a deterministic suggestion policy, never an automatic command.

```ts
export type CareOutcome = 'offer'|'rejected'|'withdrawn'|'no_response'|'expired'|'archived';
export function outcomeChoices(outcome: CareOutcome): string[] {
  if (outcome === 'offer') return ['review_offer', 'set_decision_date', 'plan_next_steps'];
  if (outcome === 'archived') return ['view_history'];
  return ['save_learning', 'reuse_materials', 'explore_alternatives'];
}
```

- [ ] Test optional reflection, skip reflection, no-response selected explicitly, outcome correction preserving events, cancellation of future ordinary nudges, preserved material versions and an offer with unknown acceptance date. Assert ghost-nudge copy does not claim rejection or pressure closure.

```ts
expect(outcomeChoices('offer')).toContain('set_decision_date');
expect(outcomeChoices('rejected')).toContain('reuse_materials');
```

- [ ] Run API `npm test -- --runInBand --testPathPatterns='care-outcome|application-ghost-closure'` and both outcome UI suites; expect new policy/copy assertions to fail.
- [ ] Use the outcome authority to close the journey and retain its immutable history/material attachments. Add bounded optional reflection (2,000 characters), a user-selected offer deadline and custom next steps; mark generated suggestions as suggestions. Allow correction through a dedicated audited outcome correction command if existing transitions cannot safely express it, with `{outcome,expectedVersion,idempotencyKey,reason:string|null}`; never edit an existing event or let a legacy import overwrite the correction.
- [ ] Replace silence inference with neutral copy: “Still waiting on [title]? You can check the provider, set another reminder, or record an outcome.” Keep the existing rollout flag off until reminder integration in task 3 is verified. Suggest alternatives with the recommendation engine without automatically activating a new pursuit or changing the user's preferences.
- [ ] Pass outcome/history/compatibility/cancellation/UI tests and typechecks. Confirm a rejection on web leaves reusable materials visible on mobile and stops application-task reminders. Commit with `feat: support constructive outcome review and next steps`.

## Task 3: Unify reminders with user control and delivery-time checks

**Files:**
- Modify API `src/notifications/{opportunity-deadline-reminders.service.ts,notifications.service.ts,notifications.controller.ts,dto/notification.dto.ts,application-ghost-closure.service.ts}` and `src/notifications/scheduler/notification-scheduler.service.ts` plus their existing tests.
- Create API `src/notifications/{care-reminder-policy.ts,care-reminder-policy.spec.ts}`.
- Extend existing notification preference storage with a reviewed additive migration `backend/services/services/api/supabase/migrations/20260909160000_care_notification_preferences.sql`.
- Extend web notification settings/inbox services and create `src/features/my-plan/{CareReminderSettings.tsx,CareReminderSettings.test.tsx}`.
- Extend mobile `packages/core/src/services/notificationPreferences.ts`, inbox/deep-link handling and create `components/opportunity-path/CareReminderSettings.tsx`, `__tests__/careReminders.test.tsx`.

**Interfaces:** Extend current preferences with `{careEnabled:boolean; careMaxPerDay:number; careMaxPerWeek:number; careCriticalDeadlines:boolean}`; retain current channel, timezone and quiet-hour keys. Defaults are off until user opt-in, then one/day and three/week, and critical deadlines off. Export:

```ts
export type CareReminderContext = {
  optedIn:boolean; terminal:boolean; paused:boolean; resolved:boolean;
  critical:boolean; criticalOptIn:boolean; dailyUsed:number; weeklyUsed:number;
  dailyMax:number; weeklyMax:number;
};
export function mayDeliverCareReminder(c: CareReminderContext):boolean {
  if (!c.optedIn || c.terminal || c.resolved) return false;
  if (c.critical && !c.criticalOptIn) return false;
  if (c.paused && !(c.critical && c.criticalOptIn)) return false;
  return c.dailyUsed < c.dailyMax && c.weeklyUsed < c.weeklyMax;
}
```

- [ ] Test opt-out after enqueue, task completion before delivery, deadline revision, paused pursuit, terminal outcome, quiet hours across DST/timezone changes, permission revocation, account-wide cap, duplicate legacy/new jobs, retry after partial delivery and correct web/native deep links.

```ts
expect(mayDeliverCareReminder({ optedIn:true, terminal:true, paused:false,
  resolved:false, critical:false, criticalOptIn:false, dailyUsed:0,
  weeklyUsed:0, dailyMax:1, weeklyMax:3 })).toBe(false);
```

- [ ] Run API `npm test -- --runInBand --testPathPatterns='care-reminder|notification-scheduler|opportunity-deadline-reminders|application-ghost-closure'`; run both preference suites; expect new suppression/dedupe assertions to fail.
- [ ] Reuse `replaceScheduledUserNotifications` and current delivery/quiet-hour paths; do not create an independent push cron. Define one logical dedupe key `care:<userId>:<journeyId>:<eventKind>:<eventRevision>` shared by legacy compatibility and care producers. Add semantic cancellation when dates, stages or consent change. Check current domain/permission/preferences immediately before sending, not only when queuing; keep account-wide caps in addition to care caps. If delivery status is uncertain, query provider receipt/reuse provider idempotency where supported; never blindly issue another push. Retryable errors remain visible to operations.
- [ ] Implement channel opt-in at the moment the user schedules a useful reminder, timezone/quiet-hour settings, snooze and stop controls. Use canonical journey IDs in metadata and platform-specific route resolution (`/app/my-plan/:id` web; `/my-plan/:id` mobile); reject malformed/external deep-link payloads. Queue cancellation must cover old `/applied` ghost reminders as well as new events.
- [ ] Pass dedupe/delivery/quiet-hour/security/UI tests and typechecks. On staging schedule one reminder, pause/opt out before delivery and verify actual suppression; then enable and verify exactly one notification on the intended account/device. Commit with `feat: unify care reminders and user controls`.

**Exit:** Confirmed applications remain actionable through waiting/interview/outcome; reminders remain accurate, cancellable and controlled by the user.
