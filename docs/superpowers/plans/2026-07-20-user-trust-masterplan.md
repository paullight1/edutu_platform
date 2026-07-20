# User-Trust Masterplan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the structural trust loopholes found in the 2026-07-20 persona user-testing audit: match-% reads as win-probability, no eligibility gating, no scam screening, aggregator concentration, dead "no response" state, ghostwritten essays, and subscription/metering pointed against habit formation.

**Architecture:** Seven phases, each independently shippable and env-flag-gated. Backend changes concentrate in the NestJS API (`backend/services/services/api/src`); UI changes ride existing primitives (match-reason chips, risk lists, status pipeline) so most new backend data surfaces with little or no client work. All new gates fail open.

**Tech Stack:** NestJS + Drizzle + Supabase (backend), React/Vite (edutu-web-app), Expo/React Native + i18next (edutumobile), Next.js + Paystack (pay-edutu-org), Zod everywhere.

## Global Constraints

- Node 20 everywhere. Do NOT bump (ws polyfill in `main.ts`).
- Lint is a real gate in all four apps: `--max-warnings 0`.
- `admin_settings` writes MUST fit `AdminSettingsSchema` (`settings/settings.dto.ts`) or ALL settings fall back to defaults. Every new settings field needs `.default(...)` so legacy stored objects still parse.
- Mobile i18n: edit `edutumobile/lib/i18n/locales/<lang>/<ns>.json` (9 langs: ar en es fr ha hi pt sw zh), then regen with `node scripts/gen-i18n-resources.js` from `edutumobile/`. Never hand-edit `lib/i18n/resources.ts`. ar/ha/hi/sw JSONs mix 2-/4-space indent — preserve each file's existing style.
- ID namespaces: new backend per-user data keys on the **derived uuid** (`@CurrentUser("id")`, i.e. `toDatabaseUserId`), matching `application_kits`. Never mix with raw Clerk id.
- Every behavioral change gets an env flag, default matching current-safe behavior noted per task.
- Mobile jest: run with `--maxWorkers=2`. Web: `npm run build` wipes `public/sitemap.xml` — never commit that deletion.
- Backend tests: `cd backend/services/services/api && npx jest <path>`. Web: `cd edutu-web-app && npx vitest run <path>`.
- Commit per task on branch `feat/user-trust-masterplan`.
- API root abbreviation used below: `api/` = `backend/services/services/api/`.

---

## Phase 1 — Match % → fit language

Users read "94% match" as "94% chance I win"; losses then discredit the engine. Replace every user-facing percentage with tier language. Numeric score stays internal (thresholds, sorting, gating all unchanged).

Tiers (existing web boundaries, reused everywhere): `>=80` Excellent fit · `>=60` Strong fit · `>=40` Good fit · else Worth a look.

### Task 1.1: Web — MatchInsights speaks fit language

**Files:**
- Modify: `edutu-web-app/src/components/opportunity/MatchInsights.tsx`
- Test: `edutu-web-app/src/components/opportunity/__tests__/MatchInsights.test.tsx` (create)

**Interfaces:** `getMatchLabel(score: number): string` keeps its signature; `MatchScoreBadge`/`WhyThisMatches` props unchanged.

- [ ] **Step 1: Failing test** — render `MatchScoreBadge` with `score=87` and assert the badge text contains `Excellent fit` and does NOT match `/%/`; same for `WhyThisMatches` header area.
```tsx
import { render, screen } from '@testing-library/react'
import { MatchScoreBadge, getMatchLabel } from '../MatchInsights'

test('badge shows fit tier, never a percentage', () => {
  render(<MatchScoreBadge score={87} />)
  expect(screen.getByText(/Excellent fit/)).toBeInTheDocument()
  expect(screen.queryByText(/%/)).toBeNull()
})
test('labels per tier', () => {
  expect(getMatchLabel(85)).toBe('Excellent fit')
  expect(getMatchLabel(65)).toBe('Strong fit')
  expect(getMatchLabel(45)).toBe('Good fit')
  expect(getMatchLabel(20)).toBe('Worth a look')
})
```
- [ ] **Step 2: Run** `npx vitest run src/components/opportunity/__tests__/MatchInsights.test.tsx` — FAIL (labels currently "Excellent match" etc.; badge renders `{score}% match` at L90).
- [ ] **Step 3: Implement** — in `getMatchLabel` (L34-45) return `Excellent fit` / `Strong fit` / `Good fit` / `Worth a look`. In `MatchScoreBadge` (L69-98) replace the `{score}% match` text (L90) with `{getMatchLabel(score)}`; set the tooltip/title to `How well this fits your profile and interests — not your odds of winning.` In `WhyThisMatches` (L119-196) replace ``{score}% · {getMatchLabel(score)}`` (L147) with `{getMatchLabel(score)}`. Do not touch `getMatchTier` or any threshold props.
- [ ] **Step 4: Run test — PASS.** Then `npx tsc --noEmit` and grep the web src for other user-visible `% match` strings (`bookmarks.ts` `match_percentage` is a data field, not UI — leave).
- [ ] **Step 5: Commit** `feat(web): match badges speak fit tiers, never percentages`

### Task 1.2: Mobile — tier helper + i18n keys

**Files:**
- Create: `edutumobile/packages/core/src/utils/matchTier.ts`
- Test: `edutumobile/packages/core/src/utils/__tests__/matchTier.test.ts`
- Modify: `edutumobile/lib/i18n/locales/*/home.json` (add `opportunityCard.fitExcellent|fitStrong|fitGood|fitWorthALook`), `edutumobile/lib/i18n/locales/*/opps.json` (add `detail.fitExcellent|fitStrong|fitGood|fitWorthALook`), all 9 languages
- Run: `node scripts/gen-i18n-resources.js`

**Interfaces — Produces:** `getMatchTier(score: number): 'excellent'|'strong'|'good'|'fair'` and `MATCH_TIER_KEY: Record<MatchTier, 'fitExcellent'|'fitStrong'|'fitGood'|'fitWorthALook'>`; exported from `packages/core` index barrel.

- [ ] **Step 1: Failing test**
```ts
import { getMatchTier, MATCH_TIER_KEY } from '../matchTier'
test('tier boundaries', () => {
  expect(getMatchTier(80)).toBe('excellent')
  expect(getMatchTier(79)).toBe('strong')
  expect(getMatchTier(60)).toBe('strong')
  expect(getMatchTier(40)).toBe('good')
  expect(getMatchTier(39)).toBe('fair')
})
test('key map total', () => {
  expect(MATCH_TIER_KEY.excellent).toBe('fitExcellent')
  expect(MATCH_TIER_KEY.fair).toBe('fitWorthALook')
})
```
- [ ] **Step 2:** `npx jest --maxWorkers=2 packages/core/src/utils/__tests__/matchTier.test.ts` — FAIL (module missing).
- [ ] **Step 3: Implement** `matchTier.ts` exactly per interface (pure function, boundaries `>=80/>=60/>=40`), export from the core barrel where sibling utils are exported.
- [ ] **Step 4:** Test PASS. Add EN strings — `home.json` under `opportunityCard`: `"fitExcellent": "Excellent fit", "fitStrong": "Strong fit", "fitGood": "Good fit", "fitWorthALook": "Worth a look"`; same four under `detail` in `opps.json`. Translations: es (Encaje excelente/Encaje fuerte/Buen encaje/Vale la pena mirar), fr (Excellente adéquation/Forte adéquation/Bonne adéquation/À découvrir), pt (Encaixe excelente/Encaixe forte/Bom encaixe/Vale conferir), ar (ملاءمة ممتازة/ملاءمة قوية/ملاءمة جيدة/يستحق النظرة), hi (बेहतरीन मेल/मज़बूत मेल/अच्छा मेल/देखने लायक), sw (Inakufaa sana/Inakufaa vizuri/Inafaa/Inafaa kuangalia), ha (Ya dace sosai/Ya dace da kyau/Ya dace/Ya cancanci dubawa), zh (非常匹配/高度匹配/较匹配/值得一看). Preserve each file's indent style. Regen resources.
- [ ] **Step 5: Commit** `feat(mobile): match tier helper + fit-language i18n strings (9 langs)`

### Task 1.3: Mobile — swap every % render for tier labels

**Files:**
- Modify: `edutumobile/components/home/OpportunityCard.tsx` (L152-157, key `opportunityCard.percentMatch` at L155)
- Modify: `edutumobile/app/(app)/index.tsx` (badges L825, L966; **hardcoded** `` `${matchPct}% match` `` in BestShotCard L1206-1208)
- Modify: `edutumobile/app/(app)/opportunities/index.tsx` (`DetailCard` L456-461, `CompactCard` L559-564 — raw `{item.match}%`)
- Modify: `edutumobile/app/(app)/opportunities/[id].tsx` (L1534-1542, key `detail.matchPercent` at L1539)

**Interfaces — Consumes:** `getMatchTier`, `MATCH_TIER_KEY` from Task 1.2.

- [ ] **Step 1:** In each site replace the percent render with `t('opportunityCard.' + MATCH_TIER_KEY[getMatchTier(matchPct)])` (home namespace) or `t('detail.' + MATCH_TIER_KEY[getMatchTier(score)])` (opps namespace). BestShotCard uses the i18n path too (fixes the existing non-i18n divergence). Keep every gate/threshold (`>=40` show, best-shots `>=60`, `FOR_YOU_THRESHOLD=35`, sorts) untouched.
- [ ] **Step 2: Verify** `npx tsc --noEmit` (mobile), `npx eslint . --max-warnings 0` scoped to touched files, then `grep -rn "% match\|%\` *match\|matchPercent\|percentMatch" app components` → remaining hits must be non-UI (the now-unused `percentMatch`/`matchPercent` keys may stay in locale files; do not delete other languages' keys).
- [ ] **Step 3: Commit** `feat(mobile): all match badges render fit tiers instead of percentages`

---

## Phase 2 — Eligibility hard-gates before scoring

A "94% match" the user can't legally enter poisons all trust. Extract structured eligibility at scrape time; hard-filter the feed; annotate (not hide) on detail.

### Task 2.1: Scraper — structured eligibility (+fee +red flags, shared LLM pass)

**Files:**
- Modify: `api/src/scraper/scraper.service.ts` — `DeepSeekExtractionSchema` L119-131, mirror JSON schema L2831-2860 (+`required` L2846-2858), prompt L2794-2824 (eligibility block L2804-2808), `RawItem` L78-106, `enrichItem` return L2470-2504 and cache-hit branch L2354-2389, `transformToOpportunity` metadata L3642-3688 / eligibility column write L3626
- Test: `api/src/scraper/__tests__/extraction-schema.spec.ts` (create; if scraper specs live elsewhere, follow the existing spec location pattern)

**Interfaces — Produces (persisted shape consumed by 2.2/3.1/3.2):**
```ts
// opportunities.eligibility (jsonb column) — structured superset, all fields nullable
{ countries: string[]|null, age_min: number|null, age_max: number|null,
  degree_levels: string[]|null, gender: string|null,
  level?: unknown, nationality?: unknown, field?: unknown }  // legacy keys preserved
// metadata additions
metadata.application_fee = { is_free: boolean|null, amount: number|null, currency: string|null } | null
metadata.red_flags = string[]   // empty array when none
```

- [ ] **Step 1: Failing test** — parse a fixture through `DeepSeekExtractionSchema` (export it if not exported) containing structured eligibility + `application_fee` + `red_flags`; assert round-trip; assert legacy `{level, nationality, field}`-only payload still parses.
- [ ] **Step 2:** Run — FAIL (schema has free-form `z.record` eligibility, no fee/flags).
- [ ] **Step 3: Implement.** Zod:
```ts
eligibility: z.object({
  countries: z.array(z.string()).nullable().optional(),
  age_min: z.number().nullable().optional(),
  age_max: z.number().nullable().optional(),
  degree_levels: z.array(z.string()).nullable().optional(),
  gender: z.string().nullable().optional(),
}).passthrough().nullable().optional(),
application_fee: z.object({
  is_free: z.boolean().nullable(),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
}).nullable().optional(),
red_flags: z.array(z.string()).default([]),
```
Mirror the same in the response JSON schema (keep `additionalProperties:false` discipline; add the new keys to `required` as nullable). Prompt additions inside the existing eligibility block: countries as full country names or `null` if open to all (`"international"/"worldwide"` ⇒ null); age bounds as integers or null; degree_levels from `high school|undergraduate|graduate|doctoral|professional`; plus: *"application_fee: whether applying costs money (is_free true/false/null, amount+currency if stated). red_flags: list any of — fee required to apply or claim a prize; guaranteed selection/win language; contact only via free email or messaging apps; requests bank details or ID documents before selection; unrealistic benefit for no criteria. Empty list if none."* Carry through `RawItem` → `enrichItem` returns (both branches) → `transformToOpportunity` (eligibility column gets the structured object merged over legacy keys; metadata gets `application_fee`, `red_flags`).
- [ ] **Step 4:** Test PASS; `npx tsc --noEmit`; run scraper spec suite if present.
- [ ] **Step 5: Commit** `feat(scraper): structured eligibility, application fee and red-flag extraction`

### Task 2.2: Ranking — hard gate the feed, annotate match-scores

**Files:**
- Create: `api/src/opportunities/eligibility.util.ts`
- Test: `api/src/opportunities/__tests__/eligibility.util.spec.ts`
- Modify: `api/src/opportunities/opportunity-ranking.service.ts` — feed chain L403-418 (filter beside the dismissed-id filter at L404), match-scores path `scoreOpportunitiesForUser` L466/L493 (annotate only)

**Interfaces — Produces:**
```ts
export interface EligibilityVerdict { eligible: boolean; blockers: string[] }
export function checkEligibility(rawEligibility: unknown, profile: {
  country?: string|null; age?: number|null; dateOfBirth?: string|null; degree?: string|null;
}): EligibilityVerdict
```
Fail-open contract: missing/legacy/free-form eligibility, or missing profile field ⇒ `eligible: true`. Only explicit structured mismatches block. Env `RECS_ELIGIBILITY_GATE` (default `"true"`; `"false"` disables the feed filter entirely).

- [ ] **Step 1: Failing tests** (core cases):
```ts
const NG = { country: 'Nigeria', age: 24, degree: "Bachelor's" }
test('country mismatch blocks', () =>
  expect(checkEligibility({ countries: ['United States'] }, NG).eligible).toBe(false))
test('country match passes', () =>
  expect(checkEligibility({ countries: ['nigeria', 'Ghana'] }, NG).eligible).toBe(true))
test('null countries fail-open', () =>
  expect(checkEligibility({ countries: null }, NG).eligible).toBe(true))
test('legacy free-form fail-open', () =>
  expect(checkEligibility({ nationality: 'US citizens only' }, NG).eligible).toBe(true))
test('age ceiling blocks', () =>
  expect(checkEligibility({ age_max: 22 }, NG).eligible).toBe(false))
test('age derived from dob when age missing', () =>
  expect(checkEligibility({ age_max: 22 }, { country: null, dateOfBirth: '1990-01-01' }).eligible).toBe(false))
test('missing profile country fail-open', () =>
  expect(checkEligibility({ countries: ['United States'] }, { country: null }).eligible).toBe(true))
test('blockers name the reason', () =>
  expect(checkEligibility({ countries: ['United States'] }, NG).blockers[0]).toMatch(/United States/))
```
- [ ] **Step 2:** Run — FAIL (module missing).
- [ ] **Step 3: Implement util.** Country compare: lowercase/trim both sides; treat `any/all/international/worldwide/global/open` entries as unrestricted. Age: use `profile.age`, else derive from `dateOfBirth`. Degree: bucket `profile.degree` with the existing `matchEducationLevel` from `api/src/opportunities/profile-fit.util.ts` and compare against `degree_levels` buckets (unknown/unbucketable ⇒ fail-open). Blocker strings are user-facing: `"Open to applicants from: United States"`, `"Age limit: up to 22"`, `"Requires graduate-level study"`.
- [ ] **Step 4: Wire.** Feed (`queryRecommendations`): insert `.filter(row => !gateEnabled || checkEligibility(row.eligibility, profile).eligible)` immediately after the dismissed-id filter (L404). Match-scores (`scoreOpportunitiesForUser` map at L493): do NOT drop — compute the verdict and, when ineligible, unshift blockers into `matchRisks` (prefix `Eligibility: `) so the existing web "Worth checking" list (`WhyThisMatches` L170-188) and mobile `detail.thingsToCheck` (L1696-1717) surface them with zero client work.
- [ ] **Step 5:** Util tests PASS; ranking service compiles; run the opportunities test suite.
- [ ] **Step 6: Commit** `feat(recs): hard eligibility gate on feed, eligibility risks on detail`

---

## Phase 3 — Legitimacy layer

### Task 3.1: Scam gate in the ingestion pipeline

**Files:**
- Modify: `api/src/scraper/opportunity-dedup.service.ts` — add `applyScamGate` beside `applyDomainTrustGate` (L339); export and call it from `persistOpportunities` (`scraper.service.ts` L2131, same spot the trust gate runs)
- Test: `api/src/scraper/__tests__/scam-gate.spec.ts`

**Interfaces — Consumes:** `metadata.red_flags` from Task 2.1. Env `SCRAPER_SCAM_GATE` (default `"true"`).

- [ ] **Step 1: Failing tests** — given candidate rows: 0 flags ⇒ untouched; 1 flag ⇒ `metadata.needs_review=true` + `metadata.scam_risk={flags}` but status preserved; ≥2 flags ⇒ status capped to `pending_review` (never demotes an already-`pending_review`/`rejected` row upward), `needs_review=true`; gate env off ⇒ untouched.
- [ ] **Step 2:** FAIL. **Step 3: Implement** following `applyDomainTrustGate`'s annotate-only pattern (same function shape, same logging style). Never touch rows whose existing DB status is admin-set `active` when only 1 flag (status pinning from `fetchExistingStatuses` already protects re-scrapes — preserve that behavior). **Step 4:** PASS + suite green.
- [ ] **Step 5: Commit** `feat(scraper): scam-risk gate holds flagged listings for review`

### Task 3.2: "Free to apply" / fee visibility on detail

**Files:**
- Modify: `edutu-web-app/src/components/OpportunityDetail.tsx` (near the requirements block L895-908)
- Modify: `edutumobile/app/(app)/opportunities/[id].tsx` (stats/deadline card region ~L1564-1660)
- Modify: `edutumobile/lib/i18n/locales/*/opps.json` + regen (`detail.freeToApply` = "Free to apply", `detail.applicationFee` = "Application fee: {{fee}}"; translate all 9)

- [ ] **Step 1:** Read `opportunity.metadata.application_fee` (types: extend the web `Opportunity` mapping in `edutu-web-app/src/services/opportunities.ts` and mobile `packages/core/src/types/opportunity.ts` + `services/opportunities.ts` mapping with `applicationFee?: { isFree: boolean|null; amount: number|null; currency: string|null }`). Render: `is_free === true` ⇒ green "Free to apply" chip; `amount > 0` ⇒ neutral "Application fee: {currency} {amount}" line; null/absent ⇒ render nothing (no guessing).
- [ ] **Step 2: Verify** web tsc + mobile tsc + lint; i18n regen.
- [ ] **Step 3: Commit** `feat(app): application-fee visibility on opportunity detail`

---

## Phase 4 — Hidden gems (anti-trending)

The aggregator funnels everyone at the same famous listings. Surface strong-fit + low-engagement listings — data only Edutu has.

### Task 4.1: Migration — signals aggregate index

**Files:**
- Create: `supabase/migrations/20260720120000_signals_engagement_index.sql`
```sql
create index if not exists idx_user_opp_signals_opp_created
  on public.user_opportunity_signals (opportunity_id, created_at desc)
  where opportunity_id is not null;
```
- [ ] Apply to live DB via Supabase MCP `apply_migration` (name `signals_engagement_index`) AND commit the file. Commit: `chore(db): index for per-opportunity engagement aggregation`

### Task 4.2: Global engagement map + hidden-gem boost

**Files:**
- Modify: `api/src/opportunities/opportunity-ranking.service.ts` — add cached `getGlobalEngagement()` + hidden-gem annotation inside `queryRecommendations` (post-scoring, pre-sort, L403-424 region)
- Test: `api/src/opportunities/__tests__/hidden-gems.spec.ts` (pure-logic test of the annotator given a scored list + engagement map)

**Interfaces — Produces:** each scored feed item may gain `hidden_gem: true`, `matchReasons` entry `Hidden gem — strong fit, few applicants yet`, and `match` boosted by `HIDDEN_GEM_BOOST` (default 3, cap 100). Envs: `RECS_HIDDEN_GEMS` (default `"true"`), `RECS_HIDDEN_GEM_MAX_ENGAGEMENT` (default 5), `RECS_HIDDEN_GEM_MIN_MATCH` (default 60).

- [ ] **Step 1: Failing test** — extract the annotator as a pure function `annotateHiddenGems(items, engagement, opts)`: item with match 72 + engagement 2 gains flag/reason/boost; match 72 + engagement 40 doesn't; match 45 + engagement 0 doesn't; boost never exceeds 100.
- [ ] **Step 2:** FAIL. **Step 3: Implement.** Engagement SQL (10-min in-memory TTL cache, same style as the existing 45s response cache):
```sql
select opportunity_id,
       sum(case signal_type when 'apply' then 5 when 'save' then 3
           when 'click' then 1 when 'view' then 1 else 0 end)::int as engagement
from user_opportunity_signals
where opportunity_id is not null and created_at > now() - interval '30 days'
group by opportunity_id
```
Unknown/absent id ⇒ engagement 0 ⇒ eligible for gem (new listings are the point). Reason detail uses `kind: 'hidden_gem'` — verify the web icon map (`MatchInsights.tsx` L54-63) and mobile reason renderers fall back safely on unknown kinds (they render `label`; if the icon lookup would crash, add a default icon).
- [ ] **Step 4:** PASS + suite. **Step 5: Commit** `feat(recs): hidden-gem surfacing — strong fit, low competition`

*(Rails/carousels for gems on home screens: deliberate follow-up, not this plan — the reason-chip pipeline already shows the label on every card.)*

---

## Phase 5 — Ghost-closure + feasibility framing

### Task 5.1: `no_response` status end-to-end

**Files:**
- Modify: `api/src/me/dto/me.dto.ts` L15-22 (`ApplicationStatusSchema` — add `no_response`); `api/src/me/me.service.ts` L229-233 (outcome map: `no_response → "outcome_ghosted"`)
- Modify: `api/src/opportunities/dto/personalization.dto.ts` L41-65 (add `outcome_ghosted` to the signal enum)
- Create: `supabase/migrations/20260720121000_application_no_response_status.sql`
```sql
alter table public.opportunity_applications
  drop constraint if exists opportunity_applications_status_check;
alter table public.opportunity_applications
  add constraint opportunity_applications_status_check
  check (status in ('draft','submitted','interview','offer','rejected','withdrawn','no_response'));
```
  (verify live constraint name first: `select conname from pg_constraint where conrelid = 'public.opportunity_applications'::regclass and contype='c';` — adjust if it differs)
- Modify web: `edutu-web-app/src/services/applications.ts` (status union L7-13, `toAppStatus` L61-85 — map legacy `ghosted→no_response`; terminal set with rejected/withdrawn), `edutu-web-app/src/components/ApplicationsPage.tsx` (`STATUS_OPTIONS` L51-58 add `{ value:'no_response', label:'No response' }`; in `changeStatus` L273-303 show closure copy, not celebration: `No response counts as closed — that's on them, not you. Your work is saved for the next one.`)
- Modify mobile: `edutumobile/packages/core/src/services/applications.ts` (status type L5, `normalizeApplicationStatus` L46-63), `edutumobile/app/(app)/applied.tsx` (`STATUS_OPTIONS` L27; the `closed` StatFilter grouping L49/L384 includes `no_response`; on selecting it, trigger the existing next-best-shot card path — `setRejectionCardId` at L340 — so closure ends in a forward action)
- Test: extend `api` me.service spec (status accepted, `outcome_ghosted` signal emitted) — follow existing me spec file location/pattern.

- [ ] **Step 1:** Backend failing spec → implement dto/map → PASS.
- [ ] **Step 2:** Apply the migration live via Supabase MCP; commit the SQL file.
- [ ] **Step 3:** Web + mobile wiring above; web vitest suite + mobile jest (`--maxWorkers=2`) green; both tsc clean.
- [ ] **Step 4: Commit** `feat: no_response application status with closure UX end-to-end`

### Task 5.2: Ghost-closure nudge cron

**Files:**
- Create: `api/src/notifications/application-ghost-closure.service.ts`
- Modify: `api/src/notifications/notifications.module.ts` (register provider)
- Test: `api/src/notifications/__tests__/application-ghost-closure.spec.ts`

**Interfaces — Consumes:** the deadline-reminders pattern (`opportunity-deadline-reminders.service.ts` — `@Cron` + env gate + `replaceScheduledUserNotifications(userId, dedupePrefix, items)`), `submitted_at` column. Envs: `APPLICATION_GHOST_NUDGES_ENABLED` (default off — `!== "true"` no-op, matching how risky new crons ship), `APPLICATION_GHOST_DAYS` (default 45).

- [ ] **Step 1: Failing test** on the pure candidate-selection/message-build function: an application `submitted` 50 days ago yields one nudge with dedupe key `ghost:<applicationId>`; 30 days ⇒ none; statuses `offer/rejected/withdrawn/no_response/draft` ⇒ none.
- [ ] **Step 2:** FAIL. **Step 3: Implement.** Daily `@Cron(CronExpression.EVERY_DAY_AT_10AM)`; SQL over `opportunity_applications` join `opportunities` (title): `status='submitted' and submitted_at < now() - ($DAYS || ' days')::interval`. One push per application ever (dedupe prefix). Copy: title `Still waiting on {title}?`, body `It's been {weeks} weeks with no reply — that usually means they moved on, and it says nothing about you. Close it out and free the space; your next best shot is ready.` Deep link to the applied screen. Quiet-hours: reuse `deferForQuietHours` exactly as `opportunity-alerts.service.ts` L201/L509 does.
- [ ] **Step 4:** PASS + suite. **Step 5: Commit** `feat(api): ghost-closure nudges for long-silent applications`

### Task 5.3: Feasibility framing on urgent deadlines

**Files:**
- Modify: `edutu-web-app/src/components/OpportunityDetail.tsx` (deadline/urgency area) — when `getDeadlineBadge(deadline).isUrgent` and `metadata.requirements?.length > 0`, render under the pill: `“{n} requirements — still doable. Start with the first one.”`
- Modify: `edutumobile/app/(app)/opportunities/[id].tsx` deadline card (~L1592) — same line via new `opps.json` key `detail.feasibility` = `"{{count}} requirements — still doable. Start with the first one."` (+9 translations, regen)

- [ ] **Step 1:** Implement both; nothing renders when requirements are unknown (no invented effort estimates).
- [ ] **Step 2:** tsc + lint + regen. **Step 3: Commit** `feat(app): urgency framed with feasibility, not just alarm`

---

## Phase 6 — Answer bank + interviewer-mode AI

Every application must deposit a reusable asset; rejection UX points at the asset. No new table — the bank is a view over `application_kits.essays` (user drafts already live there, keyed by derived uuid).

### Task 6.1: Backend — answer-bank read API

**Files:**
- Modify: `api/src/copilot/copilot.controller.ts` (add `GET /copilot/answers`), `api/src/copilot/copilot.service.ts`
- Test: `api/src/copilot/__tests__/answer-bank.spec.ts` (or the module's existing spec file pattern)

**Interfaces — Produces:**
```ts
GET /copilot/answers → { answers: Array<{ kitOpportunityId: string; opportunityTitle: string|null;
  promptId: string; prompt: string; draft: string; updatedAt: string|null }>, count: number }
```
Selection rule: every essay entry across the user's kits with `draft` trimmed length ≥ 80 chars. Sort by updatedAt desc. Route note: static `answers` route MUST be declared before `kits/:opportunityId` params in the controller if adjacency creates conflicts (route-before-:id rule).

- [ ] **Step 1: Failing spec** on the pure extraction function (kits fixture → answers list; short drafts excluded; missing essays tolerated). **Step 2:** FAIL. **Step 3:** Implement (one supabase query on `application_kits` by `user_id`, title join on opportunities). **Step 4:** PASS. **Step 5: Commit** `feat(copilot): answer bank endpoint over existing essay drafts`

### Task 6.2: Rejection/closure UX points at the bank

**Files:**
- Modify web: `edutu-web-app/src/services/applications.ts` (add `fetchAnswerBankCount(token)` calling `/copilot/answers`, returning `count`), `edutu-web-app/src/components/ApplicationsPage.tsx` — in the rejected/no_response flows append: `Your answer bank now holds {count} answers you can reuse.` (omit line when count 0)
- Modify mobile: `edutumobile/packages/core/src/services/` (same fetch helper beside existing productApi services), `edutumobile/app/(app)/applied.tsx` — add the line to the next-best-shot/rejection card (L109-206), i18n `applied.answerBankLine` = `"Your answer bank holds {{count}} reusable answers."` (+9 translations, regen)

- [ ] **Step 1:** Implement + graceful failure (fetch error ⇒ no line, never block the card). **Step 2:** web vitest + mobile jest + both tsc/lint. **Step 3: Commit** `feat(app): rejections point at the surviving asset — the answer bank`

### Task 6.3: Interviewer-mode SOP (stop ghostwriting blind)

**Files:**
- Modify: `api/src/documents/documents.service.ts` — `generateSop` L134, prompt L170-181
- Modify: `api/src/chat/tools/coach-tools.service.ts` — `draft_sop` tool L830-872
- Modify: `api/src/chat/chat.service.ts` — `DEFAULT_AGENT_PERSONA` drafting rule (~L101)
- Test: extend documents/coach-tools specs per existing patterns

**Behavior:** when the user has provided no notes/voice (`notes` empty in the tool args AND no prior SOP content), `draft_sop` does NOT call the ghostwriter. It returns a structured ask instructing the coach to run a 4-question micro-interview first: (1) a specific moment that started this ambition, (2) the hardest relevant thing you've done, (3) why this program/opportunity specifically, (4) what you'll do with it. Once notes exist, `generateSop` runs with the prompt hardened: *"Use ONLY the applicant's notes for biography, motivations and events. Never invent experiences, names, places or achievements. Where material is missing, leave a bracketed [ask: …] placeholder instead of inventing."* Persona rule L101 updated to say SOPs are drafted **from the user's own answers, gathered first**.

- [ ] **Step 1: Failing spec** — `draft_sop` with empty notes returns the interview ask (no `aiService` call — assert the LLM client mock not invoked); with notes present it drafts. **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS + chat/documents suites. **Step 5: Commit** `feat(coach): SOP drafting becomes interview-first — no invented biography`

---

## Phase 7 — Season pass + habit-before-meter

### Task 7.1: Settings schema — season pass (Zod-safe)

**Files:**
- Modify: `api/src/settings/settings.dto.ts` — inside `PricingSettingsSchema` (L186-211) add:
```ts
seasonPass: z.object({
  enabled: z.boolean().default(false),
  price: z.number().min(0).max(10_000_000).default(15000),
  durationDays: z.number().int().min(7).max(366).default(90),
  label: z.string().max(60).default("Season Pass"),
}).default({ enabled: false, price: 15000, durationDays: 90, label: "Season Pass" }),
```
  and mirror the same object into `DEFAULT_ADMIN_SETTINGS.pricing` (L310-339).
- Test: settings spec — **critical regression test**: a stored settings object saved BEFORE this field exists must still `mergeAdminSettings(...)` without falling back to defaults.

- [ ] **Step 1:** Failing regression test (fixture = current defaults minus `seasonPass`). **Step 2:** FAIL if defaults wired wrong; implement; PASS. **Step 3: Commit** `feat(api): season-pass pricing settings (schema-fallback safe)`

### Task 7.2: pay.edutu.org — one-off season checkout + grant

**Files:**
- Modify: `pay-edutu-org/src/lib/money.ts` (`BillingPlan` L1 → `'monthly'|'yearly'|'season'`; `planDurationDays` L22-25 gains a season branch fed by config), `pay-edutu-org/src/lib/pricing.ts` (expose `seasonPass` from the admin config fetch), `pay-edutu-org/src/app/checkout/route.ts` (accept `plan=season` when `seasonPass.enabled`; **omit `planCode`** so Paystack runs a ONE-TIME charge — `initTransaction` L32-34 already branches on that; amount = `seasonPass.price`; reference `edutu_season_{uuid}`), `pay-edutu-org/src/app/api/webhook/route.ts` + `src/app/return/page.tsx` (references with prefix `edutu_season_` ⇒ `grantPro({ source:'season_pass', expiresAt: addDays(now, seasonPass.durationDays) })` — `grantPro` L19-73 already extends from remaining time)

- [ ] **Step 1:** Implement; `plan=weekly` behavior unchanged (still rejected). Add/extend the pay app's tests per its existing framework; if it has none, verify with `npm run build` + a route unit test only if a harness exists (do not introduce a new test framework in this task).
- [ ] **Step 2: Commit** `feat(pay): season pass — one-off Paystack charge granting Pro until a date`

### Task 7.3: Season pass surfaces (web upgrade + mobile paywall + RC webhook)

**Files:**
- Modify: `edutu-web-app` upgrade surface (`UpgradeModal.tsx` L79 area or the page it opens): when `mobile-control`/`web-config` pricing exposes `seasonPass.enabled`, show a third option card linking `{checkoutBaseUrl}/checkout?uid=...&email=...&plan=season`
- Modify: `edutumobile/app/(app)/paywall.tsx`: web-build path (`redirectToWebCheckout` L209-221) gains the season option when enabled; native IAP path lists it only when a `season_pass` RC product exists (guard on offering lookup)
- Modify: `edutumobile/supabase/functions/revenuecat-webhook/index.ts` — `handleOneTimePurchase` L332-409: branch on product id `season_pass` ⇒ entitlement upsert with `expires_at = now + durationDays` (read duration from mobile-control config; fallback 90)

- [ ] **Step 1:** Implement; document the manual step in the commit body: *create RevenueCat non-renewing product `season_pass` + Paystack nothing (one-off needs no plan object)*.
- [ ] **Step 2:** web tsc/lint; mobile tsc/lint; deno-check the edge function if the repo has a check script.
- [ ] **Step 3: Commit** `feat(app): season-pass purchase surfaces (web checkout link, mobile paywall, RC webhook)`

### Task 7.4: New-user chat grace (habit before meter)

**Files:**
- Modify: `api/src/monetization/monetization.service.ts` — `meter()` L97-145: for free users and `action === 'chatMessage'`, if the profile's `created_at` is within `FREE_CHAT_GRACE_DAYS` (env, default 7, `0` disables), allow at zero cost after `bumpDailyUsage` (usage still recorded; the `isPro()` SQL L59-89 already reads profiles — extend that select with `created_at` rather than adding a query)
- Test: monetization spec — new user day 3 ⇒ chat free beyond the 10/day free tier; day 10 ⇒ normal metering; grace 0 ⇒ normal metering.

- [ ] **Step 1:** Failing spec. **Step 2:** FAIL → implement → PASS + module suite. **Step 3: Commit** `feat(monetization): 7-day chat grace for new users — habit before meter`

---

## Rollout / Deploy checklist (post-merge; user's flow)

- Render env: `RECS_ELIGIBILITY_GATE=true`, `RECS_HIDDEN_GEMS=true`, `SCRAPER_SCAM_GATE=true`, `APPLICATION_GHOST_NUDGES_ENABLED=true` (opt-in — ships dark; enable only after validating nudge copy/threshold, since the first run can nudge the entire standing backlog of stale submitted applications at once, not just newly-stale ones), `FREE_CHAT_GRACE_DAYS=7`.
- Migrations (3) applied live via MCP during Tasks 4.1 / 5.1 — `20260720112224_signals_engagement_index`, `20260720114241_application_no_response_status`, `20260720115946_widen_notifications_kind_check` — verified via `list_migrations`.
- RevenueCat: create non-renewing product `season_pass` (mobile paywall hides it until then).
- Redeploy the `revenuecat-webhook` Supabase edge function (changed on this branch) and set `EDUTU_API_URL` on it so season duration follows admin config instead of falling back to 90 days.
- Deploy order matters: Render backend → pay.edutu.org site → `revenuecat-webhook` edge function → flip `pricing.seasonPass.enabled` in admin. Deploying pay-edutu-org before the backend/edge fn are live risks selling season passes the backend can't correctly duration.
- Admin: enable `pricing.seasonPass.enabled` via settings once pricing confirmed (last step, after the deploy order above).
- Existing scraped rows have legacy free-form eligibility ⇒ they fail open (no gating) until re-scraped (3-day recheck cycle refreshes actives). Optional LLM backfill deliberately deferred.
- The Desktop working tree has unpushed work (doc-nudge cron, pro-expiry cron, `AI_WINCOACH_ENABLED` naming); this plan builds only on what's on origin/main. Reconcile at merge if that work lands first.

## Self-review notes

- Every audit priority maps to a task: fit-language (1.1-1.3), eligibility gates (2.1-2.2), answer bank + rejection asset (6.1-6.2), anti-trending (4.1-4.2), ghost-closure + feasibility (5.1-5.3), legitimacy (2.1, 3.1-3.2), season pass + ungated coach core (7.1-7.4), interviewer-mode (6.3).
- Type consistency: `checkEligibility(rawEligibility, profile)` consumed in 2.2 as produced; `MATCH_TIER_KEY` names match 1.2↔1.3; `application_fee` snake_case in metadata (2.1) mapped to camelCase client types (3.2); `/copilot/answers` shape shared by 6.1↔6.2.
- Known deliberate deferrals: hidden-gems home rail, eligibility LLM backfill, coach outcome-recording tool, admin UI for seasonPass fields (settings PUT accepts them already).
