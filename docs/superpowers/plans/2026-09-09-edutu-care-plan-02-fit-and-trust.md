# Care Plan 02 — Fit and Trust Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Delegate only when authorized.

**Goal:** Recommend opportunities that fit the user's circumstances and clearly explain the evidence and uncertainty.

**Architecture:** Extend existing intent, profile, ranking and shortlist services. Persist care preferences and feedback in the backend, enriching authoritative opportunity data with provenance instead of introducing a second ranking engine.

**Tech Stack:** Existing NestJS/Drizzle/Jest and platform UI/test stacks.

**Spec:** [Care Plan v1](../specs/2026-09-09-edutu-care-plan-v1.md), R02–R04 and R17. Depends on plan 01.

## Global Constraints

- Web and mobile use the same server decisions, dates, progress, versions, and reminder preferences.
- Provider requirements, user choices, and AI suggestions are visibly distinguishable.
- Unknown eligibility, cost, deadline, and response dates remain unknown until supported by a source or user entry.
- Users can edit preferences, pause a pursuit, change priority, dismiss recommendations, and stop reminders.

Also apply every global constraint in the spec.

## Task 1: Make circumstances editable and progressively collected

**Files:**
- Create API `src/opportunity-journeys/{care-profile.service.ts,care-profile.dto.ts,care-profile.spec.ts}`; modify `care-plan.types.ts`, `care-plan.controller.ts`, module, `opportunity-intent.service.ts` and `src/db/opportunity-journey.schema.ts`.
- Create migration `backend/services/services/api/supabase/migrations/20260909110000_care_profile_and_feedback.sql`.
- Create web `src/features/my-plan/{CarePreferences.tsx,CarePreferences.test.tsx}` and mobile `components/opportunity-path/CarePreferences.tsx`, `__tests__/carePreferences.test.tsx`; extend both carePlan service/type adapters.

**Interfaces:** `GET/PUT /me/care-plan/profile` returns `CareProfile`. PUT takes `{profile: CareProfile; intent?: PutOpportunityIntentInput; expectedVersion: number; idempotencyKey: string}` with version 0 for first creation. `PutOpportunityIntentInput` is the existing exported type in `src/opportunity-journeys/dto/opportunity-journey.dto.ts`. Intent retains goal/location/remote/readiness as its source of truth; make the existing intent write path transaction-aware and update those fields atomically with the adjunct profile when included in the form. Adjunct profile fields are:

```ts
export type CareProfile = {
  version: number; targetDate: string | null; timezone: string;
  availability: Array<{ weekday: 0|1|2|3|4|5|6; minutes: number }>;
  funding: 'full_required' | 'partial_ok' | 'self_funded' | 'unspecified';
  maximumUpfrontCost: { amountMinor: number; currency: string } | null;
  constraints: string[];
};
export function weeklyMinutes(p: CareProfile): number {
  return p.availability.reduce((sum, slot) => sum + slot.minutes, 0);
}
```

- [ ] Test skipped optional fields, explicit clearing, duplicate weekdays, negative/over-1440 daily minutes, invalid timezone/currency, stale version and cross-client edits. Test that changing an inferred goal to an explicit goal is retained on subsequent recommendations.

```ts
expect(weeklyMinutes({ version: 1, targetDate: null, timezone: 'Africa/Lagos',
  availability: [{ weekday: 1, minutes: 30 }, { weekday: 6, minutes: 60 }],
  funding: 'unspecified', maximumUpfrontCost: null, constraints: [] })).toBe(90);
```

- [ ] Run API `npm test -- --runInBand --testPathPatterns=care-profile`; add UI validation tests and run the corresponding web/mobile test files; expect new behavior failures.
- [ ] Store owner/version plus these adjunct fields in `opportunity_care_profiles`; add `opportunity_recommendation_feedback` with owner, opportunity, reason, action, createdAt, expiresAt and unique operation key for task 2. Use nullable optional values, validated IANA timezone and ISO currency. Enforce one availability entry per weekday. Scheduling and new recommendations consume exact total minutes; the legacy integer-hours projection is `Math.max(1, Math.ceil(totalMinutes / 60))` and must not override the exact availability, including a zero-capacity week. Add an optional, resumable preferences sheet and a “Why we ask” explanation beside requested data. Never force income, health, or family details into onboarding.
- [ ] Pass API/UI tests, fixture compatibility and both typechecks; add a same-user cross-client profile update scenario. Commit scoped files with `feat: add editable care preferences`.

## Task 2: Add explainable shortlist and correction feedback

**Files:**
- Modify API `src/opportunity-journeys/{opportunity-shortlist.service.ts,opportunity-decision-support.ts,opportunity-home.service.ts,care-plan.controller.ts,care-plan.types.ts}` and existing ranking service `src/opportunities/opportunity-ranking.service.ts`.
- Create API `src/opportunity-journeys/{care-recommendation-policy.ts,care-recommendation-policy.spec.ts}`.
- Create web `src/features/my-plan/{RecommendationCard.tsx,RecommendationCompare.tsx,RecommendationCard.test.tsx}`; mobile `components/opportunity-path/RecommendationCard.tsx`, `__tests__/careRecommendations.test.tsx`.

**Interfaces:** Add `GET /me/care-plan/recommendations?limit=3` returning `CareRecommendation[]`. `POST /me/care-plan/recommendations/:opportunityId/feedback` takes `{action:'dismiss'|'restore'; reason:'not_eligible'|'cost'|'location'|'timing'|'not_interested'|null; idempotencyKey:string}` and returns `{saved:true}`. Define in care-plan.types.ts:

```ts
export type CareRecommendation = {
  opportunityId: string; title: string;
  eligibility: 'eligible'|'likely'|'unclear'|'ineligible';
  reasons: string[]; unknowns: string[]; evidenceUrls: string[];
  estimatedMinutes: number | null;
  cost: { amountMinor: number; currency: string } | null;
  deadline: string | null; sourceCheckedAt: string | null;
};
export function fitsKnownCost(max: CareProfile['maximumUpfrontCost'],
  cost: CareRecommendation['cost']): 'fits'|'exceeds'|'unknown' {
  if (!max || !cost || max.currency !== cost.currency) return 'unknown';
  return cost.amountMinor <= max.amountMinor ? 'fits' : 'exceeds';
}
```

- [ ] Write deterministic tests for explicit disqualifying rule, unknown eligibility, unknown cost, mismatched currencies, opted-out recommendations, changed preferences and AI failure. UI tests assert visible reasons/unknowns, provider source, dismiss/undo and an actionable empty state.

```ts
expect(fitsKnownCost({ amountMinor: 0, currency: 'NGN' }, null)).toBe('unknown');
expect(fitsKnownCost({ amountMinor: 100, currency: 'USD' },
  { amountMinor: 101, currency: 'USD' })).toBe('exceeds');
```

- [ ] Run API `npm test -- --runInBand --testPathPatterns=care-recommendation-policy`; run both new card suites; expect new feature assertions to fail.
- [ ] Filter confirmed ineligible/closed opportunities from the default shortlist; keep explicitly requested discovery accessible with explanations. Apply funding/location/time constraints to the existing ranking path; return at most 5 and default 3. Preserve uncertain candidates with clear unknowns, never numerical acceptance probability. Persist dismissals for 90 days with Restore; correction changes profile only through explicit user edit. Render side-by-side comparison for two selections on desktop and stacked comparison on mobile. Gemini may rephrase only supplied evidence; deterministic reasons remain the fallback. A missing AI entitlement must not remove basic recommendations or tracking.
- [ ] Pass the new suites plus existing ranking/eligibility tests, same fixture contract checks and client typechecks. Commit with `feat: explain opportunity fit and accept corrections`.

## Task 3: Track source freshness and deadline changes

**Files:**
- Create API `src/opportunity-journeys/{opportunity-source-policy.ts,opportunity-source-policy.spec.ts}`; modify `care-plan.types.ts`, `care-plan.service.ts`, `src/db/opportunity-journey.schema.ts` and `src/notifications/opportunity-deadline-reminders.service.ts`.
- Create migration `backend/services/services/api/supabase/migrations/20260909120000_opportunity_source_observations.sql` and table definition in `src/db/opportunity-source.schema.ts`; register it in existing schema exports.
- Create API `src/opportunity-journeys/opportunity-source-observation.service.ts`; integrate at the existing opportunity persistence boundary after inspecting `src/scraper/` and opportunity write services. Use their existing normalized opportunity IDs; do not add another scraper.
- Create web `src/features/my-plan/SourceStatus.tsx`; mobile `components/opportunity-path/SourceStatus.tsx`, `__tests__/careSourceStatus.test.tsx`; extend existing opportunity detail screens and calendar consumers.

**Interfaces:** `recordObservation(opportunityId: string, observation: SourceObservation): Promise<{changed:boolean; revision:number}>` is server-only, not a user-editable verification endpoint.

```ts
export type SourceObservation = {
  sourceUrl: string; checkedAt: string;
  availability: 'open'|'closed'|'unknown';
  deadline: string | null; precision: 'instant'|'date'|'unknown';
  timezone: string | null;
};
export function deadlineLabelKind(s: SourceObservation): 'countdown'|'date'|'unknown' {
  return s.deadline === null ? 'unknown' :
    s.precision === 'instant' && s.timezone !== null ? 'countdown' : 'date';
}
```

- [ ] Test unchanged observation twice, moved deadline, provider closure, conflicting sources, date-only deadline, missing timezone and expired source check. Add UI assertions that unknown dates never show “0 days left”.

```ts
expect(deadlineLabelKind({ sourceUrl: 'https://provider.example/apply',
  checkedAt: '2026-09-09T12:00:00Z', availability: 'open',
  deadline: '2026-10-01', precision: 'date', timezone: null })).toBe('date');
```

- [ ] Run API `npm test -- --runInBand --testPathPatterns=opportunity-source-policy` and mobile source tests; expect new behavior failures.
- [ ] Persist source observations with source URL, observation time, normalized hash and revision, unique opportunity/hash observation semantics and an immutable changed event. Prefer the actual provider over aggregators; conflicting evidence marks uncertain and offers the source links. Mark checks older than 7 days stale, or older than 24 hours when a known deadline is within 7 days. These are UI freshness policies, not a promise that crawlers can refresh on demand. Failed checks retain the last successful observation and show its age. Changed deadline invalidates pending schedule previews and reschedules/cancels pending old reminder events through the shared queue; a single dedupe key includes opportunity/revision/user. Source freshness adds no arbitrary URL-fetch endpoint.
- [ ] Pass source, notification dedupe and contract tests; inspect source/deadline presentation on both clients, including a changed deadline across timezones. Commit with `feat: expose opportunity source freshness and changes`.

**Exit:** Users can correct what Edutu knows, understand a recommendation, and distinguish verified facts from unknown or stale information.
