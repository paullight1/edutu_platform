---
target: roadmaps feature (mobile + web)
total_score: 18
p0_count: 2
p1_count: 4
timestamp: 2026-08-01T16-50-26Z
slug: edutumobile-app-app-roadmaps-tsx
---
⚠️ DEGRADED: single-context (project CLAUDE.md forbids dispatching subagents unless the user asks; Assessments A and B run sequentially)

**Scope:** `edutumobile/app/(app)/roadmaps.tsx`, `roadmap-templates/index.tsx` + `[id].tsx`, `goals/all-roadmaps.tsx`, `app/roadmap/[id].tsx`, `components/roadmap/RoadmapTimeline.tsx` + `RoadmapIntake.tsx`, `edutu-web-app/src/components/RoadmapsPage.tsx`, backend `roadmaps.service.ts` / `20260505100000_roadmaps_system.sql`.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | No started/enrolled state anywhere; `RefreshControl refreshing={loading}` double-renders with `LoadState` |
| 2 | Match System / Real World | 2 | "Roadmap" names three objects; enroll/adopt/start/add used interchangeably |
| 3 | User Control and Freedom | 2 | No un-enroll, no cancel for scheduled reminders, deep link discards id |
| 4 | Consistency and Standards | 1 | Two parallel catalogs + two adoption endpoints; rating renders 4.6 on web, 0.5 on mobile; web lacks My Roadmaps/templates/creator |
| 5 | Error Prevention | 2 | Unlimited re-adoption; intent modal submits empty; comment composer live when signed out |
| 6 | Recognition Rather Than Recall | 2 | Adoption output lives in Goals; catalog cards have no memory |
| 7 | Flexibility and Efficiency | 2 | No sort, no started filter; templates has no search while roadmaps does |
| 8 | Aesthetic and Minimalist Design | 2 | Header stacks 5 blocks before result one; 9.5pt labels |
| 9 | Error Recovery | 2 | Enroll is excellent; feedback reports success on HTTP 500 |
| 10 | Help and Documentation | 1 | Nothing explains what "Start This Roadmap" does before you tap |
| **Total** | | **18/40** | **Poor — good pieces, incoherent system** |

## Anti-Patterns Verdict

**LLM assessment.** Mobile: not AI-slop. The template detail screen (hero → floating stats card → rail timeline → resource library → comments → sticky action bar) is real design work; `RoadmapTimeline` with today-marker and node states is genuinely good. Web: partly yes — `RoadmapsPage.tsx` uses `text-xs font-semibold uppercase tracking-[0.16em]` "Roadmaps marketplace" above the h1 and repeats the tracked-uppercase eyebrow on every card. That's the banned kicker trope, already forbidden by DESIGN.md. The 3-col cover/eyebrow/title/desc/meta card grid is template-generic.

**Deterministic scan.** `detect.mjs --json` returned `[]` for all four targets — not a clean bill: the detector parses markup/CSS and the mobile surfaces are RN `StyleSheet`, so it had nothing to read. Mobile is manually reviewed only.

**Visual overlays.** Not attempted — no dev server running, RN surfaces aren't browser-injectable.

## Overall Impression

Every individual screen is better than it needs to be. The enroll error handling (server `message`, real status, Retry, offline distinguished from failure) beats most shipped apps. But they don't add up to a feature: a user wanting "a plan for this scholarship" can land in three unrelated places that all say Roadmap — `/roadmaps` (backend `roadmaps` table, `/adopt`), `/roadmap-templates` (different dataset, own `adoptTemplate`, own comments/reminders), `/goals/all-roadmaps` (goal rows grouped by opportunity). Three data models, three visual languages, three verbs, one word. Biggest opportunity: collapse to one object with one lifecycle.

## What's Working

- **Offline/failure posture** — `apiUnavailableUntil` cooldown, SWR paint-then-revalidate, `extractErrorMessage` unwrapping NestJS `message` arrays, intent modal staying open on save failure.
- **`RoadmapTimeline`** — done/current/upcoming nodes, strike-through, injectable `today` for deterministic tests, `accessibilityState={{ checked }}`. Currently used only on `opportunities/[id]`, not in roadmaps at all.
- **Template detail IA** — stats → outcomes → expandable rail journey with per-step deliverable and resources → library → comments → sticky Start.

## Priority Issues

### [P0] Mobile divides the rating by 10
`roadmaps.tsx:873` renders `(selectedItem.rating_avg / 10).toFixed(1)`. Column is `numeric(3,2)` (migration L21); `submitFeedback` writes raw 1–5 into the running average (`roadmaps.service.ts:1952`). A 4.6 roadmap shows **0.5** beside a filled star. Web renders it correctly (`RoadmapsPage.tsx:316`).
**Why:** the only social proof on the sheet tells every user every roadmap is half a star — corrosive for a trust-moat product.
**Fix:** delete `/ 10`; render "Not rated yet" when `rating_count === 0` instead of `N/A` beside a gold star.
**Command:** `/impeccable harden edutumobile/app/(app)/roadmaps.tsx`

### [P0] Three unrelated objects are all called "Roadmap"
`/roadmaps`, `/roadmap-templates`, `/goals/all-roadmaps`. Both catalogs are reachable from the same header (banner #2 pushes to the competitor). Tab is labelled **Plan** with a **ShoppingBag** icon (`_layout.tsx:1412`) routing to a screen titled **Roadmaps**.
**Why:** "Where's the roadmap I started?" has three plausible answers and no correct one — adoption produces goals, so it lives in neither catalog.
**Fix:** one noun, one lifecycle. Merge templates into `/roadmaps` as a published/draft distinction, keep the template detail screen as *the* detail screen, delete the modal sheet, rename `/goals/all-roadmaps` to "My Plans" or fold into roadmap progress.
**Command:** `/impeccable shape roadmaps information architecture`

### [P1] Nothing remembers that you started a roadmap
`GET /roadmaps/my-enrollments` exists (controller L225) and **no client calls it** (verified both apps). Cards show no started state; detail CTA always reads "Start This Roadmap"; re-tapping re-adopts and duplicates milestone goals. Web `adoptions` is component state — the "Added — 3 milestones" confirmation vanishes on reload.
**Fix:** fetch `my-enrollments` with the catalog, key by roadmap id; started cards get progress + "3/8 steps"; CTA becomes "Continue"; block re-adopt server-side.
**Command:** `/impeccable craft enrolled-state for roadmap cards and detail CTA`

### [P1] Feedback reports success even when the server rejects it
`submitFeedback` (`roadmaps.tsx:405`) never inspects the response. `apiFetch` returns `null` only on network failure and resolves any status otherwise — 402/429/500 and the offline path all fall through to `Alert.alert(thanksTitle, …)`. The `catch` only logs.
**Fix:** mirror `handleEnroll` — `null` → offline + Retry; `!res.ok` → `extractErrorMessage(res)`; thank only on success.
**Command:** `/impeccable harden roadmap feedback and comment submission`

### [P1] "Open Community" navigates to the screen you're already on
`roadmaps.tsx:587` — handler is `router.push('/roadmaps')`; the backend's `communityAction.route` is discarded. The success alert can present four buttons, which iOS stacks vertically with no visual primary.
**Fix:** route to `communityAction.route`; replace the `Alert` with the branch's `SuccessDialog` — one primary "See my plan", rest secondary.
**Command:** `/impeccable craft roadmap adoption success moment`

### [P1] Category-tinted micro-text fails WCAG AA on light theme
`cardDeadlineText` 10px/700 in `categoryColor` (L650) and `badgeText` 10px in `categoryColor` on `${categoryColor}15`. Business `#F59E0B` on white ≈2.1:1; tech `#06B6D4` ≈2.2:1 — both under 4.5:1, on the most decision-relevant text on the card. Also `iconActionText` 9.5px, `featuredText` 9px.
**Fix:** deadline text uses `urgencyColor(level)` at ≥12px, not the category hue; badges keep tint as background with `textPrimary` ink; floor all labels at 11px.
**Command:** `/impeccable audit roadmap card and action-bar contrast`

## Persona Red Flags

**Casey (distracted mobile, 3G):** roadmaps header burns a full screen height (gradient creator banner + template banner + search + chips + horizontal My-Roadmaps rail) before result one, every visit. Detail modal close is ~38pt (18px icon, 10px padding), under the 44pt floor, in the hardest thumb corner.

**Jordan (first-timer):** taps "Start This Roadmap", gets "6 milestones added to your goals. Reminders are scheduled." — none of which was disclosed on the button or in the sheet. Then four next steps, one of which reloads the current screen. Starting from `/roadmap-templates` instead: same action named differently, different endpoint, ends on "View my roadmaps" → the catalog, not anything Jordan owns.

**Riley (stress tester):** offline `/roadmap-templates` shows six `FALLBACK_TEMPLATES` with ratings/learners/author roles, no badge, no loading state (`index.tsx:41`). Tapping Start on one **silently** `router.push('/roadmaps')` (L249). "Reminders" schedules 8 local notifications with no surface to view or cancel them. `edutu://roadmap/<id>` hits a bare `<Redirect href="/roadmaps" />` — id discarded.

**Amara (project persona — 21, Kampala, fellowship closing in 18 days):** deadline math is 10px amber, fourth element in the card, under a 14px title. `formatTargetDeadline` hard-codes `toLocaleDateString('en-US', …)` (L444) — American date format inside translated copy across all nine locales including Arabic RTL. After adopting, the plan lives in Goals while the tab still offers to sell it to her again.

## Minor Observations

- `filteredRoadmaps` re-filters client-side against a hardcoded 7-category list *after* server filtering; any DB category outside it silently yields "No roadmaps found."
- Search debounced 300ms for the server call but the client filter runs on raw `search` — results flicker between two sets per keystroke.
- Personalized recommendations overwrite `roadmaps` with no label or explanation; the SWR background refresh can race and replace them (acknowledged in comments).
- Templates has no search; its hero vanishes when a category is selected, jumping the layout.
- Web `RoadmapDetailModal`: `role="dialog" aria-modal="true"` but no Esc handler, no focus trap, no return-focus, no body scroll lock; backdrop `onClick` means a click-drag ending on the backdrop discards the sheet.
- Mobile catalog cards are bare `TouchableOpacity` with no `accessibilityRole`/`accessibilityLabel`; filter chips lack `accessibilityState={{ selected }}` (unlike `RoadmapIntake`, which does it right).
- `RoadmapIntake` (good two-tap "fit to my life") is used only on the opportunity screen; the roadmaps intent modal reimplements the same two questions as AI-generated free text.
- Intent modal submits with zero answers (`goals: []`), which the DTO rejects; nothing disables submit.
- Template `exportCalendar` computes step dates as *now + week×7 days*, so exporting a plan adopted three weeks ago produces a calendar three weeks in the future.

## Questions to Consider

- If templates and roadmaps merged tomorrow, which detail screen survives? (The template one is better — so why is the modal wired to the main catalog?)
- What should a user see the *second* time they open a roadmap they've already started? Right now: exactly what they saw the first time.
- The feature's real output is goals with deadlines. Should the catalog be a tab at all, or a picker inside goal creation?
- `RoadmapTimeline` already renders progress well. What stops it from being the post-adoption roadmap detail screen?
