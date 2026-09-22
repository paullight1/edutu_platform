# Care Plan 01 — Foundation and Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Delegate only when authorized.

**Goal:** Make one authoritative, reliable opportunity plan available on both clients.

**Architecture:** Preserve the journey API and compatibility bridge. Add a versioned care-plan read model and thin client adapters; expand readiness behavior through explicit capability negotiation.

**Tech Stack:** Existing NestJS/Drizzle/Jest, React/Vite/Vitest, Expo/Jest and Clerk.

**Spec:** [Care Plan v1](../specs/2026-09-09-edutu-care-plan-v1.md), R01, R06, R10, R15, R16.

## Global Constraints

- All business data flows through the NestJS backend; clients do not gain direct Supabase business-data access.
- Clerk identity is resolved by the backend; clients never choose the owner of a plan or material.
- Preserve the existing journey state machine and immutable history; introduce only additive, tested changes.
- Web and mobile use the same server decisions, dates, progress, versions, and reminder preferences.
- Opening a provider link never confirms submission; only an explicit user confirmation records applied status.

Also apply every global constraint in the spec. This milestone does not enable unbuilt care actions.

## Task 1: Establish API availability and a tested read contract

**Files:**
- Inspect/modify as diagnosed: `backend/services/services/api/src/app.module.ts`, `src/opportunity-journeys/opportunity-journeys.module.ts`, `src/opportunity-journeys/opportunity-home.service.ts` (the latter paths are relative to the API package).
- Create in API: `src/opportunity-journeys/care-plan.types.ts`, `care-plan.controller.ts`, `care-plan.service.ts`, `care-plan.contract.spec.ts` in the same directory.
- Create: `test-fixtures/care-plan/v1.json`, `docs/operations/care-plan-api-readiness.md`.
- Modify: `docs/operations/mobile-my-plan.md` to link the new readiness checklist.

**Interfaces:** `GET /me/care-plan` returns `CarePlanSnapshot`; the service exports `getSnapshot(userId: string): Promise<CarePlanSnapshot>`. Keep existing full-detail routes unchanged. Define the new wire contract:

```ts
export type PlanAction = {
  key: 'continue_task' | 'open_application' | 'confirm_application' |
       'resolve_blocker' | 'review_schedule' | 'follow_up' | 'record_outcome';
  journeyId: string; taskId: string | null; label: string;
  estimatedMinutes: number | null; dueAt: string | null;
};
export type PlanSummary = {
  journeyId: string; opportunityId: string; title: string;
  state: string; version: number; activityStatus: 'active' | 'paused';
  nextAction: PlanAction | null;
};
export type CarePlanSnapshot = {
  schemaVersion: 1; generatedAt: string;
  capabilities: string[]; pursuits: PlanSummary[]; today: PlanAction[];
  degradedReasons: string[];
};
```

- [ ] Record baseline request URL/status, signed-in identity mapping, module registration and migration ledger in the readiness document. Never record tokens or secrets. Compare authenticated `/me/opportunity-journeys?stage=pursuing` and `/me/opportunity-home`; do not guess whether missing migration, routing, auth or data is responsible. Deployment authorization is a separate execution concern.
- [ ] Add contract tests using the shared fixture and existing PGlite HTTP patterns in `opportunity-plan.e2e.spec.ts`. Include unauthenticated 401, another user's detail 404, empty 200, unavailable dependency error (not a fake empty 200), same-user legacy import twice, stable event counts and no state rewind. Add the canonical shape assertion:

```ts
expect(snapshot.schemaVersion).toBe(1);
expect(snapshot.pursuits.map(p => p.journeyId)).toEqual([ownedJourneyId]);
expect(snapshot.today.every(a => a.journeyId === ownedJourneyId)).toBe(true);
```

Here `snapshot`, `ownedJourneyId` are created by the existing e2e fixture setup extended with one owned and one foreign journey; keep them inside each test, not shared global state.
- [ ] Run API `npm test -- --runInBand --testPathPatterns=care-plan.contract`; expect failure before the route/service exists.
- [ ] Implement a read-only aggregation of journey and next-action services. Return supported capabilities only; initial capability is `care-plan-v1-read`. Register the controller/provider in the existing module. Write a JSON fixture with one pursuit, one next action and unknown estimate/date represented as null. Return 503 for missing required storage and preserve a safe error code; mark optional recommendation failure degraded while retaining saved pursuits.
- [ ] Re-run contract and existing `opportunity-plan.e2e` tests; run `npm run build`. Record staging evidence only after an actual authenticated request succeeds. Commit only this task's reviewed files with `feat: establish care plan read contract`.

## Task 2: Separate provider access, readiness and submission

**Files:**
- Create in API `src/opportunity-journeys/`: `opportunity-preparation-policy.ts`, `opportunity-preparation-policy.spec.ts`.
- Modify in API `src/opportunity-journeys/`: `opportunity-journeys.service.ts`, `opportunity-journey-state.ts`, `opportunity-next-action.ts`, `dto/opportunity-journey.dto.ts`, `opportunity-journey-compatibility.service.ts`, `opportunity-plan.e2e.spec.ts`.
- Modify API `src/db/opportunity-journey.schema.ts`.
- Create migration `backend/services/services/api/supabase/migrations/20260909100000_care_plan_task_provenance.sql`.

**Interfaces:** Export `preparationAccess(input: PreparationInput): PreparationAccess` from the new policy file. Define:

```ts
export type PreparationInput = {
  hasProviderUrl: boolean; providerRequirementsKnown: boolean;
  missingProviderRequired: number; missingSuggested: number;
};
export type PreparationAccess = {
  canOpenProvider: boolean; readiness: 'ready' | 'incomplete' | 'unknown';
};
export function preparationAccess(i: PreparationInput): PreparationAccess {
  return { canOpenProvider: i.hasProviderUrl,
    readiness: !i.providerRequirementsKnown ? 'unknown' :
      i.missingProviderRequired > 0 ? 'incomplete' : 'ready' };
}
```

- [ ] Write policy tests and HTTP regression scenarios: incomplete suggestions permit provider access; unknown requirements never show ready; opening does not mark applied; tasks stay editable after opening; explicitly confirming an off-platform application preserves incomplete tasks; duplicate confirmation does not duplicate history; stale updates return 409.

```ts
expect(preparationAccess({ hasProviderUrl: true,
  providerRequirementsKnown: false, missingProviderRequired: 0,
  missingSuggested: 3 })).toEqual({ canOpenProvider: true, readiness: 'unknown' });
```

- [ ] Run API `npm test -- --runInBand --testPathPatterns='opportunity-preparation-policy|opportunity-plan.e2e'`; new assertions should fail against old gating.
- [ ] Add task fields `requirementKind`, `evidenceUrl`, `evidenceCheckedAt`; keep legacy `required` for older clients. Backfill template/AI tasks to unknown provenance, never verified provider requirements. Add nullable journey `requirementsVerifiedAt`. Implement the policy and additive transitions for pursuing/preparing → application_opened; allow preparation edits while opened. Keep confirmed submission behind its dedicated endpoint. For capable clients include `care-plan-v1-preparation` and the new readiness field; preserve old response fields and compatibility projections without turning legacy clicks into confirmed submissions.
- [ ] Run policy, state-machine, next-action, compatibility, schema and HTTP tests plus API build. Rehearse the migration on a disposable database containing legacy rows. Commit scoped files with `feat: separate preparation readiness from provider access`.

## Task 3: Deliver real web/mobile workspace parity and failure recovery

**Files:**
- Create web: `src/types/carePlan.ts`, `src/services/carePlan.ts`, `src/features/my-plan/{MyPlanPage,MyPlanPursuitsPage,MyPlanDetailPage,PlanActionCard,PlanStateView}.tsx`, `src/features/my-plan/carePlanState.ts`, `src/features/my-plan/carePlan.test.ts`, `src/features/my-plan/MyPlanPage.test.tsx`.
- Modify web: `src/App.tsx`, `src/components/{workspaceNavigation.ts,AppWorkspaceShell.tsx,ApplicationsPage.tsx,DeadlinesPage.tsx}`.
- Create mobile: `packages/core/src/types/carePlan.ts`, `packages/core/src/services/carePlan.ts`, `lib/carePlanState.ts`, `__tests__/carePlanContract.test.ts`, `__tests__/carePlanParity.test.tsx`, `app/(app)/my-plan/pursuits.tsx`.
- Modify mobile: `app/(app)/my-plan/{index,[id]}.tsx`, `components/opportunity-path/{JourneyCard,PlanWorkspaceHeader,PlanOpportunityActions}.tsx`, `packages/core/src/services/opportunityJourney.ts`.

**Interfaces:** Both adapters expose `getCarePlan(): Promise<CarePlanSnapshot>` and consume the exact task 1 wire contract. Authentication stays in each existing `productApi` service. Define local view state in each client:

```ts
export type PlanLoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; snapshot: CarePlanSnapshot }
  | { kind: 'cached'; snapshot: CarePlanSnapshot; savedAt: string }
  | { kind: 'unavailable'; retryable: boolean };
export function canMutatePlan(state: PlanLoadState): boolean {
  return state.kind === 'ready';
}
```

- [ ] Add fixture conformance tests in both clients and interaction tests for new user, cached plan, retry, signed-out redirect, stale-version refresh and stable tab/back navigation. Tests must assert actual requests from complete/confirm actions and the resulting visible state, not only component existence.

```ts
expect(canMutatePlan({ kind: 'cached', snapshot: fixture,
  savedAt: '2026-09-09T09:00:00Z' })).toBe(false);
expect(canMutatePlan({ kind: 'ready', snapshot: fixture })).toBe(true);
```

`fixture` is parsed from `test-fixtures/care-plan/v1.json` and typed as `CarePlanSnapshot` in each client test.
- [ ] Run web `npm test -- src/features/my-plan/carePlan.test.ts src/features/my-plan/MyPlanPage.test.tsx`; mobile `npm test -- --runInBand carePlanContract carePlanParity`; expect the new module/action assertions to fail.
- [ ] Implement authenticated adapters, Today/Pursuits/detail routes and the workspace navigation from the spec. Reuse legacy Applications/Deadlines components through route aliases. Store read snapshots by resolved account with timestamp; clear on account change/sign-out; show “Saved on this device” and Retry for cached data. Never resolve a failed fetch as an empty plan. Preserve one idempotency key for a retried action and refresh/offer reapply after 409; do not overwrite a newer version. Wire Help/Materials/Calendar actions only when their capabilities are enabled in later plans.
- [ ] Run both new suites, existing shell/My Plan action suites and both typechecks. Perform the milestone's signed-in web→mobile→web acceptance slice against staging with actual Clerk credentials, recording evidence without secrets. Commit scoped files with `feat: add cross-platform care plan workspace`.

**Exit:** R01 works against the real API; new preparation policy is verified; web and mobile expose the same initial plan with honest unavailable/cached states. No deployment or feature-completion claim can be based solely on fixtures.
