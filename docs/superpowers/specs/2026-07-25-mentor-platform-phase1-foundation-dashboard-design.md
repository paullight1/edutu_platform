# Mentor Platform — Phase 1: Foundation & Mentor Dashboard

**Date:** 2026-07-25
**Status:** Approved design, ready for implementation plan
**Program:** "Mentors" production build (4 phases). This spec covers **Phase 1 only**.

---

## 1. Background & current state

"Mentors" is not a real feature today — it is a KYC/label variant of the existing **Creator** program:

- **Web** (`/mentor`, `src/components/MentorPage.tsx`): a 4-step "Become a Mentor" application wizard. All stats (`10K+`, `500+`, `85%`) are hardcoded marketing copy. No dashboard, profiles, authoring, or pricing surface.
- **Mobile** (`/(app)/mentor-apply.tsx`): the same wizard, but the route is **orphaned** — nothing in the live UI links to it (`LandingCTA` is unused), and it is not registered as a `<Stack.Screen>` in `app/(app)/_layout.tsx`.
- **Backend**: no mentor module. "mentor" is `creator_applications.application_kind = 'mentor'`. `profiles.mentor_status` is written on apply/approve (`creator.service.ts:140`, `:230`) but is **never read anywhere** to grant a capability. Every real gate keys off `creator_status === 'approved'`.

**Consequence:** an approved *mentor* (mentor_status=approved, creator_status=none) receives a "Mentor application approved" notification but **cannot** open the dashboard, create listings, or publish roadmaps.

**Reusable infrastructure that already exists** (all Creator-gated):
- Roadmap authoring: `POST /roadmaps/creator` (auto-publishes), `POST /roadmaps/mine` (personal), publish/unpublish, comments, enrollments, AI assist.
- A dashboard: `GET /creator/dashboard` (backend) + `creator-dashboard.tsx` (mobile, already includes an authoring wizard) + web creator dashboard route.
- Marketplace listings + wallet, with an 85/15 credits revenue split (`PLATFORM_FEE_PERCENT`, `creator.service.ts:20`).

## 2. Program decisions (locked)

1. **Unify — "Mentor" is the public brand** for the existing Creator infrastructure. `mentor_status` becomes load-bearing.
2. **Pricing = reuse in-app credits** (85/15). No fiat/payout in this program.
3. **Full scope** across the program: dashboard, authoring, pricing, learner directory, public profiles, 1:1 booking — delivered in 4 phases.

## 3. Phase 1 goals

1. Make `mentor_status` load-bearing so an approved mentor unlocks the same capabilities as an approved creator.
2. Rebrand every **user-facing** "Creator" surface to "Mentor" (web + mobile), keeping internal route/table/column names unchanged.
3. Fix the orphaned mobile apply route and add proper profile entry points.
4. Replace hardcoded dashboard stats with **real** metrics.
5. Fix the admin-approval Clerk-sync bug for mentor applications.

### Non-goals (Phase 1)

- No new authoring capability (roadmaps/listings already work — Phase 2 polishes pricing/resources UX).
- No learner-facing mentor directory or public profiles (Phase 3).
- No 1:1 booking (Phase 4).
- No fiat pricing / payouts (out of program scope).
- No table/column/route renames; no changes to `profiles.role`.

## 4. Architecture decision

**Unified approved-contributor gate + user-facing rebrand only.**

Introduce one shared predicate and swap the inline creator gates to it:

```
isApprovedMentor(profile) := profile.creator_status === 'approved'
                          || profile.mentor_status  === 'approved'
```

- Existing approved creators keep working; newly approved mentors gain identical capabilities.
- Internal identifiers (`creator_applications`, `profiles.creator_status`, `/creator-dashboard`, admin "Creator Applications") stay as-is — zero schema/route churn on a live DB with concurrent sessions.
- Only the presentation layer (labels, headings, i18n strings, new alias route) changes to "Mentor."

**Rejected alternatives:** (a) add a first-class `mentor` role to `profiles.role` — cleaner long-term but rewrites the role/guard system and needs a data migration; (b) full `creator → mentor` table/column rename — highest risk on a live schema. Both are more churn for the same Phase-1 outcome.

## 5. Components

### 5.1 Backend — capability unification

**Unit: `isApprovedMentor` predicate.** A single exported helper (e.g. in a small `creator/mentor-access.ts` util or as a private method reused across services) taking a profile row and returning boolean per the definition above. One place to change the rule later.

**Swap call sites** (replace `creator_status === 'approved'` with the helper; keep the admin/moderator role fallbacks already present):
- `src/creator/creator.service.ts:302` — `getCreatorDashboard`
- `src/creator/creator.service.ts:354` — `createListing`
- `src/roadmaps/roadmaps.service.ts:279` — `createByCreator`
- `src/roadmaps/roadmaps.service.ts:368` — `setMineVisibility`
- Any other read of `creator_status === 'approved'` found during implementation (grep to confirm the set is complete).

**Contract:** inputs/outputs of the four gated methods are unchanged; only who passes the gate broadens. Depends on: `profiles` row already loaded by the guard.

### 5.2 Backend — real dashboard stats

Extend the payload returned by `getCreatorDashboard` (served at `GET /creator/dashboard`, `creator.controller.ts:46`) with a `stats` object. All values derive from existing tables, scoped to the requesting user:

| Stat | Source |
|---|---|
| `publishedContent` | count `roadmaps` where `created_by = uid AND status = 'published'` + count `marketplace_listings` where `seller_id = uid AND status = 'active'` |
| `learnersReached` | count `roadmap_enrollments` on the user's roadmaps + count `marketplace_enrollments` on the user's listings |
| `creditsEarned` | sum `transactions.amount` where `type = 'creator_earning' AND user = uid` |
| `walletBalance` | `profiles.credits_balance` (already surfaced) |
| `avgRating` / `ratingCount` | avg + count from `roadmap_feedback` on the user's roadmaps (null when no feedback) |
| `mentorStatus` | derived: `approved` if `isApprovedMentor`, else the pending/rejected/none status to drive the banner |

**Error handling:** each stat is best-effort — a failed sub-query yields `0`/`null` for that stat and **must not** fail the whole dashboard (mirror the existing "credits are a nice-to-have stat, never block the screen" pattern in `creator-dashboard.tsx`). Log and degrade.

### 5.3 Backend — admin approval Clerk-sync fix

In the mobile admin review path (`app/admin/creator-applications.tsx:178-179, 230`) and/or the backend `reviewApplication` (`creator.service.ts`), when the application `kind === 'mentor'`, sync a mentor status to Clerk metadata (e.g. `mentorStatus: 'approved'`) instead of always pushing `creatorStatus`. Approval of a mentor row must leave Clerk metadata consistent with the DB (`profiles.mentor_status`).

### 5.4 Web — rebrand + dashboard

- Rebrand user-facing labels: "Creator Studio" → **"Mentor Studio"**, "Become a Creator" → **"Become a Mentor"**, wallet/earnings copy → "Mentor earnings." Update the relevant i18n locale files under `edutu-web-app/src/i18n/locales/*`.
- Add a `/mentor/dashboard` route (alias/entry) that renders the existing creator dashboard component, so the Mentor brand has a clean URL. Keep the internal `creator-dashboard` component/page id.
- Surface the real `stats` from §5.2 in the dashboard header (replace any hardcoded figures). Add the mentor status banner (pending/approved/rejected).
- Keep the existing `/mentor` apply page; on success or when already approved, route users to `/mentor/dashboard`.

### 5.5 Mobile — rebrand + wiring + stats

- **Register the route:** add `<Stack.Screen name="mentor-apply" ... />` to `app/(app)/_layout.tsx` (alongside `creator-apply`).
- **Profile entry points** (`app/(app)/profile/index.tsx`): rebrand the `creatorStudio` menu item (`:151`) label → "Mentor Studio", and the "Become a Creator" banner (`:280-294`) → "Become a Mentor." Gate which one shows on mentor/creator status: show **Mentor Studio → `/creator-dashboard`** when `isApprovedMentor`, else the **Become a Mentor** banner → `/mentor-apply`.
- **Dashboard stats:** update `creator-dashboard.tsx` to render the real `stats` from §5.2, rebranded to "Mentor Studio."
- **i18n:** swap the user-facing strings — `view.menu.creatorStudio`/`creatorStudioDesc`, `view.becomeCreator`/`becomeCreatorDesc` (profile namespace), plus `mentorApply.*` (`misc.json`) copy review — across all locale files. Regenerate mobile i18n resources (`gen-i18n-resources.js`) if required. Hand-edit locales that mix indentation (per repo i18n gotchas), then regenerate.

## 6. Data flow

1. User applies (web `/mentor` or mobile `/mentor-apply`) → row in `creator_applications` (`application_kind='mentor'`), `profiles.mentor_status='pending'`.
2. Admin approves (`app/admin/creator-applications.tsx` → `review_creator_application` / `reviewApplication`) → `profiles.mentor_status='approved'`, Clerk metadata synced with mentor status (§5.3).
3. User opens Mentor Studio → `GET /creator/dashboard` → `isApprovedMentor` passes → dashboard returns real `stats`.
4. User authors/publishes roadmaps or listings → the same broadened gate lets the request through.

## 7. Testing

**Backend (jest):**
- `isApprovedMentor`: creator-approved → true; mentor-approved → true; both none → false; admin/moderator role fallback preserved.
- Each of the four gated methods: an approved-mentor-only profile now succeeds where it previously threw `Forbidden`.
- Dashboard stats aggregation: correct counts/sums against seeded rows; a failing sub-query degrades to `0`/`null` without failing the endpoint.
- Admin approval: mentor-kind approval writes `mentor_status` and syncs the mentor status to Clerk metadata.

**Web (vitest):** dashboard renders real stats from a mocked payload; rebranded labels present; existing mentor-apply flow stays green.

**Mobile (jest):** existing `mobileMentorApply.test.tsx` stays green; profile shows "Mentor Studio" vs "Become a Mentor" per status; `creator-dashboard` renders mocked stats.

All lint gates are real checks in this repo (backend/web/mobile/admin, `--max-warnings 0`) — code must pass them.

## 8. Rollout / deploy notes

- No DB migration required (columns already exist).
- Backend must be deployed for the broadened gate + stats before the rebranded UIs are useful; safe to deploy independently (backward compatible — creators unaffected).
- Mobile change requires a native/OTA build to reach devices; web deploys via existing pipeline.
- Concurrent-session caution: this touches shared files (`profile/index.tsx`, `_layout.tsx`, locale JSONs, `creator.service.ts`, `roadmaps.service.ts`). Re-check for divergence before committing.

## 9. Out of scope — later phases (context only)

- **Phase 2** — Authoring & Pricing: resources surface, credit pricing UX, listing `pending→active` approval, draft management.
- **Phase 3** — Learner Directory & Public Mentor Profiles: `/mentors` browse/search, public profile pages, ratings, public mentors read model.
- **Phase 4** — 1:1 Mentorship Booking: availability/calendar, session requests + lifecycle, paid in credits.
