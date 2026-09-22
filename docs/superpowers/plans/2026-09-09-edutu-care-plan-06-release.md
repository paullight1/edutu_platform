# Care Plan 06 — Experience and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Delegate only when authorized.

**Goal:** Complete and verify the experience across web, iOS and Android before declaring R01–R18 delivered.

**Architecture:** Validate real client-to-API journeys and feature-gated rollout, extending current navigation, native glass, analytics and release practices. Completion evidence is stored beside the runbook and tied to the tested revision.

**Tech Stack:** Existing Vitest/Jest, browser automation, Expo simulator/device tooling, NestJS integration tests and existing telemetry infrastructure.

**Spec:** [Care Plan v1](../specs/2026-09-09-edutu-care-plan-v1.md), R15, R17–R18 and release verification for every requirement. Runs incrementally during plans 01–05; final gates require them all.

## Global Constraints

- Native Liquid Glass is limited to supported iOS controls; web uses a visual adaptation and Android uses its accessible fallback.
- Content surfaces prioritize legibility; support reduced transparency, reduced motion, screen readers, large text, keyboard access, and RTL.
- Completion requires real backend integration and release evidence on web, iOS, and Android.
- Web and mobile use the same server decisions, dates, progress, versions, and reminder preferences.

Also apply every global constraint in the spec. No production rollout is authorized by the existence of this document.

## Task 1: Finish coherent navigation, visual states and accessibility

**Files:**
- Modify mobile `components/ui/NativeGlassSurface.tsx`, `app/(app)/_layout.tsx`, `components/opportunity-path/PlanWorkspaceHeader.tsx`, `lib/myPlan.ts` and new workspace components from plans 01–05.
- Extend mobile `__tests__/{nativeGlassSurface,myPlanActions,mobileBottomNavStyles,mobileShellAndHome}.test.tsx`; create `__tests__/carePlanAccessibility.test.tsx`.
- Modify web `src/components/{workspaceNavigation.ts,AppWorkspaceShell.tsx}`, `src/index.css` and care workspace components; create `src/features/my-plan/carePlanAccessibility.test.tsx`.
- Update existing localization files for every currently supported locale; do not add untranslated English-only action labels to translated flows.
- Create `docs/operations/care-plan-experience-acceptance.md` with screenshots and pass/fail evidence links.

**Interfaces:** No new business API. Preserve native `NativeGlassSurface` capability detection; add a UI-only exported policy to `edutumobile/lib/carePlanAccessibility.ts`:

```ts
export function requiresOpaquePlanChrome(input: {
  nativeGlassAvailable:boolean; reduceTransparency:boolean; highContrast:boolean;
}):boolean {
  return !input.nativeGlassAvailable || input.reduceTransparency || input.highContrast;
}
```

This is a pure UI policy; keep platform capability reads in the existing surface component.

- [ ] Test glass availability and all fallbacks, screen-reader action labels, selected tab semantics, keyboard focus return after sheets, no overlap at large text, status without color-only encoding and Arabic RTL. Assert all route destinations have active data-backed actions and old deep links still land correctly.

```ts
expect(requiresOpaquePlanChrome({ nativeGlassAvailable:true,
  reduceTransparency:true, highContrast:false })).toBe(true);
```

- [ ] Run the affected native glass/navigation suites and new accessibility suites; newly added unmet assertions should fail. Record existing successful behaviors without manufacturing failures.
- [ ] Apply native glass only to supported navigation/action chrome; preserve solid readable content surfaces and runtime fallback. Use labeled stable global destinations and a compact My Plan workspace switcher; keep long forms/detail pages scrollable above keyboard/safe areas. Add web CSS glass enhancement under feature support with an opaque default and reduced-transparency/contrast treatment. Implement bottom-sheet Escape/dismiss/focus restoration on web and native screen-reader ordering. Every data view has loading, actionable empty, unavailable/retry, stale, success and permission-denied states with specific recovery actions.
- [ ] Verify web at 390px/768px/1440px, keyboard-only and 200% text; iOS 26 glass on a real supported device plus fallback where available; Android with TalkBack and enlarged fonts. Check VoiceOver, Reduce Transparency, Reduce Motion, light/dark and Arabic RTL. Capture actual scroll/transition performance traces; do not infer frame rate from a recording alone.
- [ ] Pass suites and client typechecks, attach screenshots/traces and resolve blocked actions. Commit scoped files with `feat: complete accessible care workspace interactions`.

## Task 2: Measure useful progress and validate assistance quality

**Files:**
- Create API `src/opportunity-journeys/{care-events.ts,care-events.spec.ts}`; connect accepted domain operations to the current telemetry infrastructure after locating its existing owner.
- Create `test-fixtures/care-plan/assistance-evaluations.json`, API `src/opportunity-journeys/care-assistance-evaluation.spec.ts`.
- Create web `src/features/my-plan/careAnalytics.ts` and mobile `lib/careAnalytics.ts` as thin adapters to existing analytics; add unit tests beside them.
- Create `docs/operations/care-plan-metrics.md` describing each metric and query/event source.

**Interfaces:** Use a strict allowlist instead of arbitrary metadata. Domain success events originate server-side; UI helpfulness/visibility events originate client-side and are deduplicated by event ID.

```ts
export type CareEventName = 'care_task_completed'|'care_blocker_resolved'|
  'care_application_confirmed'|'care_outcome_recorded'|'care_helpfulness_rated'|
  'care_reminder_disabled'|'care_sync_failed';
export type CareEvent = {
  eventId:string; name:CareEventName; occurredAt:string;
  platform:'web'|'ios'|'android'|'backend';
  journeyId:string|null; operationId:string|null;
  value:'helpful'|'not_helpful'|null;
};
export function isUsefulProgress(name: CareEventName):boolean {
  return ['care_task_completed','care_blocker_resolved',
    'care_application_confirmed'].includes(name);
}
```

- [ ] Test one event per successful operation, no success event on rejected/stale writes, no text/document/notification content in payloads, account deletion behavior and consent handling. Add evaluation fixtures for incomplete profile, unknown eligibility, unfunded opportunity, outdated deadline, conflicting requirements, invented achievement request and malicious provider instructions. Each fixture names selected evidence and prohibited claims.

```ts
expect(isUsefulProgress('care_application_confirmed')).toBe(true);
expect(isUsefulProgress('care_helpfulness_rated')).toBe(false);
```

- [ ] Run API `npm test -- --runInBand --testPathPatterns='care-events|care-assistance-evaluation'` and client analytics tests; expect new event/policy assertions to fail.
- [ ] Emit allowlisted events only after transaction commit; store/use a unique event ID so retries cannot inflate progress. Measure confirmed-on-time submissions only where deadline precision permits a valid comparison; exclude unknown dates and show denominator. Define blocker resolution time from opened/resolved events, recommendation corrections per reviewed candidate, reminder opt-out rate per opted-in user and same-account sync failures per attempted mutation. Optional helpfulness uses a single question, never an inferred wellbeing score.
- [ ] Run deterministic assertion/evidence checks in CI, then a reviewed sampled Gemini evaluation with credentials only in the server test environment. Require zero unsupported eligibility/deadline/achievement claims in the release sample; any failure blocks enabling AI assistance while deterministic templates remain available. Record model/configuration version, evaluated cases and reviewer findings without real private application text.
- [ ] Pass tests, inspect redacted event samples and document metric ownership and alert thresholds. Commit with `feat: measure care outcomes and assistance quality`.

## Task 3: Prove the full release and rehearse rollback

**Files:**
- Create `docs/operations/care-plan-release-matrix.md`, `docs/operations/care-plan-release-runbook.md`.
- Extend API `src/opportunity-journeys/opportunity-plan.e2e.spec.ts`; create `care-plan-cross-client.e2e.spec.ts` alongside it using the existing real HTTP/PGlite setup.
- Create web `scripts/care-plan-smoke.mjs` using installed `playwright-core`, and `edutumobile/docs/CARE_PLAN_DEVICE_ACCEPTANCE.md` for native acceptance evidence. Extend package/CI scripts only for these checks; do not replace existing pipelines.
- Extend `backend/services/services/api/.env.example` with feature-gate names and safe disabled defaults; never store real credentials.

**Interfaces:** Backend capabilities expose `care-plan-v1-read`, `care-plan-v1-preparation`, `care-plan-v1-fit`, `care-plan-v1-scheduling`, `care-plan-v1-materials`, `care-plan-v1-follow-through`, `care-plan-v1-assistance`. Environment gates are `CARE_PLAN_ENABLED`, `CARE_PLAN_FIT_ENABLED`, `CARE_PLAN_SCHEDULING_ENABLED`, `CARE_PLAN_MATERIALS_ENABLED`, `CARE_PLAN_FOLLOW_THROUGH_ENABLED`, `CARE_PLAN_ASSISTANCE_ENABLED`; all default false until the corresponding gate is verified. Disabling an adjunct capability leaves existing legacy reads and owned data accessible. The base flag controls new read/preparation capabilities together only after migration readiness.

- [ ] Add actual HTTP cross-client scenarios with different client headers and the same resolved user: web create → mobile list → web complete → mobile confirm → web outcome. Include 409 concurrent edits, duplicate operation keys, invalid ownership, legacy reconciliation and both capability-off/on states. Assertions must read persisted rows/events, not just mock adapters.
- [ ] Add the browser smoke script with explicit data-testid selectors for My Plan navigation, task action, confirmation, source details, resources and profile edit. Reuse authenticated staging storage state supplied locally; never commit it. Assert visible responses from the real staging API, screenshots on failure and nonzero exit on a failed assertion. Native acceptance executes those same user journeys on iOS and Android; record device/OS/build/revision rather than treating Expo web as native evidence.
- [ ] Run backend targeted integration tests; new scenarios should fail if any milestone is incomplete. Run the browser script from `edutu-web-app` with `node scripts/care-plan-smoke.mjs`; run the documented native scenarios on the selected devices. Address failures before broadening checks.
- [ ] Run API `npm run build` and `npm test -- --runInBand`; web `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`; mobile `npm run typecheck`, `npm run lint`, `npm test -- --runInBand`. Record exact baseline failures separately with their scope. Use the production native build pipeline in the existing release guides for iOS/Android; native dependency changes cannot be validated by OTA alone.
- [ ] Complete the release matrix below, attaching test IDs/screenshots/log references and the tested commit/build. “Not tested” cannot become “Pass” because an adjacent test passes.

| Scenario | Backend evidence | Web evidence | iOS evidence | Android evidence |
|---|---|---|---|---|
| First use, optional profile, shortlist and correction | Required | Required | Required | Required |
| Legacy import twice and account isolation | Required | Required | Required | Required |
| Unknown/changed deadline and provider requirements | Required | Required | Required | Required |
| Capacity, schedule preview, dependency, pause/resume | Required | Required | Required | Required |
| Goal/roadmap link and blocker resolution | Required | Required | Required | Required |
| Versioned material, draft restart, offline/conflict recovery | Required | Required | Required | Required |
| Provider open versus explicit submission | Required | Required | Required | Required |
| Follow-up, interview, no response, rejection and offer | Required | Required | Required | Required |
| Reminder dedupe, quiet hours, snooze, opt-out/cancellation | Required | Required | Required | Required |
| Reviewed export, deletion and AI failure/factuality | Required | Required | Required | Required |
| Navigation, accessibility, localization and performance | API timing | Required | Required | Required |

- [ ] Rehearse all additive migrations against a staging copy with representative legacy rows and non-production personal data. Verify RLS ownership, unique constraints, rollback compatibility and old-client behavior. Capture counts before/after and check no lost material references/events. Roll back by disabling features/jobs and redeploying the compatible prior application build; do not drop populated tables or rewrite immutable history. A reversible flag rollback is not a substitute for a tested data recovery procedure.
- [ ] Load-test warm authenticated `/me/care-plan` at 50 concurrent users and record p95 against the 800ms target; verify cached Today usability against the 1-second target on designated devices/network. Test queue retry/cancel and disabled capabilities. Stage rollout: internal accounts → opt-in cohort → broader release after 48 hours without P0/P1 errors, duplicate confirmations or lost drafts. Pause rollout on any ownership leak, lost mutation, repeated duplicate delivery or unknown-deadline factual claim. Critical defects have zero tolerance even if aggregate metrics look good.
- [ ] Document support actions for resync, stale source, missed reminder, duplicate legacy record and material deletion. Keep diagnosis logs free of document content. Record unresolved issues and their blocked requirement IDs. Mark v1 complete only when all R01–R18 cells and release gates pass; collect deployment authorization under the active session's instructions before production changes. Commit scoped validation/runbook files with `test: verify cross-platform care plan release`.

**Exit:** Feature completion is supported by reproducible evidence, a functioning operational system and a safe rollback path. Passing local tests alone does not establish this exit.
