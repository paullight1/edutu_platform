# Application Co-pilot — Functionality Improvement Plan

Scope: make the kit grounded in real user data, stop charging credits for non-AI output,
survive slow generation, and remove dead ends. No visual redesign.

---

## Current state (how it works today)

**Flow.** Opportunity detail ("Apply with Edutu AI", `edutumobile/app/(app)/opportunities/[id].tsx:1973,2307`)
pushes `/copilot/[id]`. The screen (`edutumobile/app/(app)/copilot/[id].tsx`) loads the
opportunity (8s race vs AsyncStorage cache, lines 265–312), background-fetches any existing kit
(`fetchApplicationKit`, line 294), and shows an intro + "Generate my kit — 15 credits" CTA.
`handleGenerate` (line 383) calls `generateApplicationKit` → `POST /copilot/kits/:id/generate`.

**Backend.** `CopilotController` (`backend/services/services/api/src/copilot/copilot.controller.ts`)
exposes `/copilot/kits*`; generation is `@AiMetered("copilotKit")` (line 45), outline/feedback are
`@AiMetered("copilotAssist")` (lines 59, 70). `CopilotService.generateKit`
(`backend/services/services/api/src/copilot/copilot.service.ts:165-223`):
1. returns the cached kit if one exists and `refresh` is false (line 169–172);
2. loads the opportunity incl. `metadata.requirements/benefits/application_process` (`loadOpportunity`, 731–769);
3. loads the profile via `matchProfileUserId(profiles.userId, dbUserId)` + up to 3 goals (`loadProfile`, 771–807);
4. calls `aiService.generateJson({ feature: "copilot.kit", ... })` (181–188), Zod-parses via
   `KitContentSchema` (fitNote / strategy / checklist / essayPrompts —
   `src/copilot/dto/copilot.dto.ts:63-68`);
5. on any AI/parse error falls back to a deterministic template kit (`buildFallbackKit`, 521–599,
   `generatedBy: "fallback"`) and still returns 200;
6. upserts into `application_kits` (unique on user+opportunity, `src/db/schema.ts:1514-1540`),
   preserving `essays` and `checklistState` on refresh.

Outline (`generateOutline`, 229–281) and draft feedback (`essayFeedback`, 287–334) work the same
way (AI → Zod → deterministic fallback) and persist into the kit's `essays` jsonb. Checklist ticks
persist via `PATCH /copilot/kits/:id/checklist` (`updateChecklist`, 361–379).

**Metering.** `AiMeteringInterceptor` (`src/monetization/ai-metering.interceptor.ts:32-62`) charges
BEFORE the handler and refunds only if the handler throws. Prices come from admin OTA settings
(`src/settings/settings.dto.ts:264-265`, defaults kit=15 / assist=5). `MonetizationService` is
`@Global()` and exported (`src/monetization/monetization.module.ts`).

**Mobile client.** `edutumobile/packages/core/src/services/copilot.ts` mirrors the DTOs; every call
goes through `requestProductApi` (`packages/core/src/services/productApi.ts:69-128`) which has a
hard `DEFAULT_TIMEOUT_MS = 12000` and returns `null` on any non-billing failure; the copilot
service then substitutes local template content (`buildLocalKit`/`buildLocalOutline`/`buildLocalFeedback`).
Billing 402/429 throw `AiBillingError` and surface the upgrade sheet ([id].tsx:350–371).

**What already works well:** kit persistence + refresh preserving user state; deterministic
fallbacks so the endpoint never 500s; billing-error UX; checklist celebrations; referee email
drafting; STARTER badge on fallback kits; report-AI-content hook.

---

## P0 — bugs that make the kit wrong or overcharge users

### P0.1 Profile read can hit the empty orphan row (the id-keying bug — present here)

**Problem.** Profiles are canonically keyed by the RAW Clerk id, but the controller only passes
`@CurrentUser("id")` (the derived uuid from `toDatabaseUserId`). `loadProfile`
(`copilot.service.ts:771-807`) queries
`matchProfileUserId(profiles.userId, dbUserId)` with `.limit(1)` and **no ORDER BY / preference**.
`matchProfileUserId` (`src/common/user-id.ts:43-48`) matches BOTH the canonical raw-keyed row AND
the derived-uuid orphan row; when a user has both (the exact situation the chat fix addressed),
Postgres returns an arbitrary one — so kit generation can ground on an EMPTY profile and produce a
generic "your profile is empty"-style kit nondeterministically. Additionally the whole read is
wrapped in a catch that silently returns `{}` (line 801–806): if `public.clerk_id_to_uuid` is
missing/broken in an environment, every kit silently degrades to generic with `generatedBy: "ai"`
(no STARTER badge, user paid full price).

**Fix (same pattern as chat).**
- `copilot.controller.ts`: add `@CurrentUser("authId") authId: string` to `generateKit`,
  `generateOutline`, `essayFeedback` (the three routes that read the profile) and pass it through.
  `authId` is set by `ClerkAuthGuard` (`src/auth/clerk-auth.guard.ts:170,224`).
- `copilot.service.ts` `loadProfile(dbUserId, authId?)`: query
  `.where(eq(sql`${profiles.userId}::text`, authId))` first when `authId` is present; only fall
  back to `matchProfileUserId(..., dbUserId)` when that returns no row. Mirrors
  `chat.service.ts:421-433` (`body.authId || userId`) and coach-tools `resolveProfileRow`
  (`src/chat/tools/coach-tools.service.ts:1273-1283`).
- Keep the catch, but when the profile comes back empty, record it: add
  `profileGrounded: boolean` to the generate response (derived from whether any profile field was
  non-empty) so the client can show "Complete your profile for a sharper kit" instead of
  pretending the kit is personalized (see P1.2 for the UI).

**After:** kit/outline generation always reads the populated canonical profile; empty-profile kits
are detectable client-side.

### P0.2 Users are charged 15 credits for a cached kit (no AI call)

**Problem.** `@AiMetered("copilotKit")` charges before the handler runs, but
`generateKit(refresh=false)` returns the existing kit without any AI call (`copilot.service.ts:169-172`).
This is reachable in practice: the mobile screen's background kit fetch has a 12s timeout and is
non-blocking ([id].tsx:291–304); if it's slow/fails, the intro + Generate CTA shows for a user who
already has a kit — tapping it debits 15 credits and returns the cached kit.

**Fix.** Move metering for this route out of the interceptor and into the service, after the cache
check (the exact pattern `analyze_fit` already uses — `coach-tools.service.ts:1310-1373`):
- Remove `@AiMetered("copilotKit")` from `generateKit` in `copilot.controller.ts:45`.
- In `CopilotService`, inject `MonetizationService` (it's `@Global()`; no module import needed —
  `copilot.module.ts` stays as is or add the import for explicitness).
- In `generateKit`: cache check → return cached (no charge). On cache miss / refresh:
  `const charge = await this.monetizationService.meter(userId, "copilotKit")` → run generation in
  try/catch → `refund(charge)` + rethrow on unexpected errors.
- Preserve the `X-Edutu-Ai-Remaining` header behaviour: return `charge.remaining` in the response
  body (e.g. `aiRemaining`) or set the header in the controller via `@Res({ passthrough: true })`.

**After:** cached kit fetches are free; only real generations debit.

### P0.3 Users are charged full price for the heuristic fallback kit

**Problem.** When the AI call or Zod parse fails, `generateKit` serves `buildFallbackKit` with
`generatedBy: "fallback"` and returns 200 (`copilot.service.ts:189-198`) — the interceptor never
refunds because nothing threw. The user pays 15 credits for a static template (and pays again when
they tap Regenerate to get the real kit). Same for outline (5 credits, lines 259–267) and feedback
(lines 311–318).

**Fix.** With P0.2's service-side metering in place, refund when falling back:
in `generateKit` / `generateOutline` / `essayFeedback`, after the fallback branch executes, call
`void this.monetizationService.refund(charge)` (fire-and-forget, same as the interceptor). For
outline/feedback, also remove `@AiMetered("copilotAssist")` from the controller and meter in the
service (they have no cache path, but the fallback-refund requires service-side control).

**After:** `generatedBy/source === "fallback"` responses cost 0; only successful AI output debits.

### P0.4 12s client timeout guarantees "offline kit" on slow generations — while the server charges and persists

**Problem.** `requestProductApi` aborts at `DEFAULT_TIMEOUT_MS = 12000`
(`productApi.ts:3,92`). A full kit JSON from the routed provider (DeepSeek default) frequently
takes longer. On timeout the client gets `null` → `generateApplicationKit` returns
`buildLocalKit` (`packages/core/src/services/copilot.ts:112-121`) and the screen shows the
"Offline kit" alert ([id].tsx:410–415) — while the backend finishes, CHARGES the user, and
persists the real kit. The user sees a template they "paid" for; the real kit only appears on next
visit. Outline/feedback have the same failure (silent generic outline/local feedback while the
server saved the real one into `essays`).

**Fix.**
- `packages/core/src/services/productApi.ts`: accept `timeoutMs` (e.g. via
  `options as RequestInit & { timeoutMs?: number }` or a 4th param) and use it for both the token
  race and the abort timer.
- `packages/core/src/services/copilot.ts`: pass `timeoutMs: 60000` for
  `generate`/`outline`/`feedback` calls; keep 12s for GET/PATCH.
- In `generateApplicationKit`, on `null` response do a **recovery poll** before falling back to
  local: retry `GET /copilot/kits/:id` twice (2s apart); if a kit with content appears, return it
  with `source: 'ai'`. Only then fall back to `buildLocalKit`.
- [id].tsx `handleGenerate`: no change needed beyond the alert copy — with the poll, `source:
  'local'` now genuinely means offline.

**After:** slow generations complete visibly (the phase animation already loops indefinitely);
users stop paying for kits they never saw.

---

## P1 — functionality that makes the kit genuinely grounded and useful

### P1.1 Ground the kit in the user's full data (today it uses 8 profile fields + 3 goal titles)

**Problem.** `ProfileContext` (`copilot.service.ts:73-82`) omits fields that exist on `profiles`
(`src/db/schema.ts:19-54`): `age`, `cgpa`, `gradYear`, `interestedCountries`, and the
onboarding `preferences` jsonb. It also ignores the user's real materials that the win-coach
already grounds on: `user_cvs` (CV builder data) and uploaded documents
(`analyze_fit` accepts `upload_id` and injects extracted CV text —
`coach-tools.service.ts:1329-1355`). `describeProfile` (499–515) therefore feeds the LLM a
near-empty sketch, and `fitNote`/`suggestedAngle` come out generic.

**Fix.**
- Extend `ProfileContext` + `loadProfile` + `describeProfile` with: `age`, `cgpa`, `gradYear`,
  `interestedCountries`, and a compact serialization of relevant `preferences` keys (the
  personalization capture fields).
- Add the user's latest CV summary: select the most recent `user_cvs` row (keyed by raw Clerk id —
  reuse the raw `authId` from P0.1), extract headline/experience/skills sections, cap at ~1500
  chars, append as `APPLICANT CV (their real document):` in `buildKitPrompt` and
  `buildOutlinePrompt`. Wrap with the same untrusted-content guard used by coach tools
  (`wrapUntrusted` in `coach-tools.service.ts`) since CV text is user-supplied.
- Goal descriptions are already fetched but dropped (`describeProfile` line 511 joins titles
  only); include 1-line descriptions.

**After:** fitNote/strategy/suggestedAngle reference the applicant's actual record; outline points
can cite real achievements instead of "your 2-3 strongest achievements".

### P1.2 Honest fit: eligibility flags and gaps, not only cheerleading

**Problem.** The kit's "fit/match" section is a single always-positive `fitNote`. There is no
eligibility check: a user in a non-eligible country/level gets an encouraging kit for an
opportunity they cannot win (contradicts the shipped user-trust eligibility-gates direction, and
the `analyze_fit` tool that returns honest `gaps`). `loadOpportunity` also drops the structured
`eligibility` jsonb column (schema line 196) — only the free-text `eligibilityCriteria` is passed.

**Fix.**
- `loadOpportunity` (`copilot.service.ts:731-769`): include `eligibility` (jsonb), `location`, and
  `type`; add them to `describeOpportunity`.
- `KitContentSchema` (`dto/copilot.dto.ts:63-68`): add
  `eligibilityFlags: z.array(z.object({ flag: z.string(), severity: z.enum(["blocker","warning"]).catch("warning") })).default([])`
  and `gaps: z.array(z.string()).default([])`.
- `buildKitPrompt` (385–408): add rules — "Compare the applicant's country/level/field/age against
  the stated eligibility. List real conflicts in eligibilityFlags (severity 'blocker' only when the
  text is explicit). List the 2-3 biggest competitive gaps in gaps. Never invent eligibility rules;
  if unknown, omit."
- Mobile (`copilot.ts` types + `[id].tsx`): render a "Before you invest time" card above the fit
  note when `eligibilityFlags` is non-empty (blockers in error color, warnings in warning color),
  and a "Close these gaps" list under strategy. Also render the P0.1 `profileGrounded === false`
  notice here with a link to `/personalization` (or profile edit) + a Regenerate CTA.
- Fallback kit: leave both arrays empty.

**After:** the "Matching it against your profile" loading step actually delivers a match
assessment with the same honesty contract as `analyze_fit`.

### P1.3 Close the loop into the applied pipeline (biggest dead end)

**Problem.** The kit ends at "Apply Now" → external browser. Nothing records that the user
applied: no link to `trackOpportunityApplication`
(`packages/core/src/services/applications.ts:191` → `POST /me/applications`), so `applied.tsx`,
the win-coach `list_applications`/document nudges, and outcome signals never learn about
kit-driven applications. `fetchApplicationKits` / `GET /copilot/kits` (`copilot.ts:85-94`,
`copilot.controller.ts:31-34`) are entirely unused on mobile — in-progress kits are invisible
outside the opportunity page.

**Fix.**
- `[id].tsx`: after `openApply` hands off to the browser, on next AppState `active` (or on the
  overlay dismissing) show a one-time confirm: "Did you submit your application?" → Yes calls
  `trackOpportunityApplication(supabase, user.id, { opportunityId, status: 'submitted' }, getToken)`
  and routes to `/applied`; "Not yet" tracks `status: 'in_progress'` (only if not already
  tracked). Persist the not-yet answer per kit (AsyncStorage) so it doesn't nag.
- Also track `in_progress` automatically on first successful kit generation in `handleGenerate`
  (fire-and-forget) so applied.tsx's win-coach sees the application immediately.
- `applied.tsx`: for rows whose `opportunity_id` has a kit (one `fetchApplicationKits` call,
  matched by id), render an "Open co-pilot kit" affordance routing to `/copilot/[id]` — this makes
  the existing list endpoint useful instead of dead.

**After:** generating a kit creates a tracked application; submitting via the kit updates it; the
proactive doc-nudge cron and applied dashboard cover kit users.

### P1.4 Kit content freshness: deadline changes and closed opportunities

**Problem.** The kit is cached forever. If the opportunity's deadline moved or it closed
(ghost-closure system), the cached kit's checklist detail still shows the old deadline text
(baked into the AI/fallback strings, e.g. `copilot.service.ts:556-558`) and the screen happily
shows "Apply Now". The kit view doesn't surface the deadline at all (the pill renders only on the
intro screen, [id].tsx:783–800).

**Fix.**
- `[id].tsx`: render the `deadlineBadge` pill in the kit view header area too (data already
  computed at line 331). If `opportunity.status`/deadline indicates closed/past (same helper the
  detail screen uses, `getDeadlineBadge`), replace the Apply button with a "Deadline passed"
  state and offer "Find similar opportunities" (router back to detail's similar section).
- Backend `getKit`/`generateKit` responses already join live opportunity deadline
  (`withOpportunity`, 846–862; `listKits` join, 106–119) — client should prefer
  `kit.opportunity.deadline` over stale kit text. No backend change needed beyond P1.2's fields.

**After:** the kit can't coach a user into applying to a closed opportunity.

### P1.5 Stop hardcoding the credit price on mobile

**Problem.** `KIT_CREDIT_COST = 15` ([id].tsx:87) duplicates admin-editable OTA pricing
(`settings.dto.ts:264`, `monetization.service.ts:143`). If the admin changes `aiCosts.copilotKit`,
the mobile preflight check (line 389) and all CTA copy lie, and the preflight can block users who
could actually afford it (or let through users who get a surprise 402).

**Fix.** Expose the effective `aiCosts` (kit + assist) to clients: add them to the existing
`/mobile-control/config` payload (`src/mobile-control/mobile-control.service.ts` — config is
already fetched app-wide) or a small `GET /monetization/pricing` public route. Mobile: read the
price from config with `?? 15` fallback; use it for the preflight, CTA label, and insufficient-
credits alert.

**After:** one source of truth for pricing; admin repricing is instantly correct in-app.

---

## P2 — robustness and consistency polish

### P2.1 Unhandled promise rejections on non-billing errors
`handleGenerate`/`handleOutline`/`handleFeedback` rethrow non-billing errors
([id].tsx:427-428, 571-572, 601-602) inside `void`-invoked callbacks → unhandled rejection, no
user feedback. Replace `throw error` with an `Alert.alert("Something went wrong", …)` +
`console.error`. (With P0.4's local fallbacks, reaching here is rare — billing errors are the only
expected throw — but it must not be silent.)

### P2.2 Double-tap / concurrent generation
Two rapid generate calls both meter and both call the AI (`onConflictDoUpdate` makes the second
write win). The `generating` state guards the button, but add a cheap server guard: in
`generateKit`, re-check `findKit` right before the insert when `refresh === false` and skip the
AI call if content appeared meanwhile — or keep an in-memory in-flight map keyed
`userId:opportunityId`. Low cost, prevents double-billing under retry-happy networks.

### P2.3 Checklist tick loss on regenerate
`confirmRefresh` promises "checklist ticks are kept" ([id].tsx:437-439), and `checklistState` is
indeed preserved — but regenerated AI checklists mint new ids (`ensureStableIds` only fills
blanks, `copilot.service.ts:910-917`), so ticks orphan and progress resets. Fix cheaply in
`generateKit`: when refreshing, carry over ids from the previous kit for items whose normalized
`label` matches (case-insensitive trim), so common items keep their ticks. Update the alert copy
to "ticks are kept where items match".

### P2.4 Tests (the module has zero)
Add `copilot.service.spec.ts` covering: (a) cache hit ⇒ no meter call; (b) AI failure ⇒ fallback
+ refund; (c) profile read prefers the raw `authId` row over the derived orphan row (two seeded
rows, assert the populated one is used); (d) `stripNulls` + `KitContentSchema` parse of a
null-riddled LLM payload; (e) checklist id carry-over on refresh (P2.3). Mirror the mocking
patterns in `monetization.metering.spec.ts` and the coach-tools specs.

### P2.5 Consistency with the win-coach silo
`application_kits.essays` and the win-coach `application docs` system are parallel, unlinked
stores. Full unification is out of scope, but do the cheap link: the kit's `documents` checklist
items should deep-link to the coach document upload flow (route used by `AiActionBar` /
`DocumentUpload`), and `analyze_fit` results could be seeded from an existing kit's
`gaps` (P1.2) instead of a fresh charge. Defer anything bigger.

---

## Suggested execution order

1. P0.2 + P0.3 together (one metering refactor in `copilot.service.ts` + controller decorator
   removal) — pure backend, unblockable, test with `monetization.meter-refund.spec.ts` patterns.
2. P0.1 (authId threading) — backend, 3 controller signatures + `loadProfile`.
3. P0.4 (timeout override + recovery poll) — mobile core only.
4. P1.1 + P1.2 (grounding + honest fit; one prompt/schema change touches backend DTO, mobile
   types, and the kit render) — ship together since both change `KitContentSchema`.
5. P1.3 (applied-pipeline loop), then P1.4, P1.5, then P2 items opportunistically.

Backend changes are deploy-gated on Render as usual; `KitContentSchema` additions are
backward-compatible (`.default([])`), so old kits parse unchanged and no migration is needed.
