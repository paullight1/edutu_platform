# Edutu Care Plan v1 — product specification

**Date:** 2026-09-09
**Status:** Proposed implementation scope; no production rollout is implied.
**Product promise:** Help me choose worthwhile opportunities, make achievable progress, get unstuck, and follow through to an outcome.

## What “100% complete” means

Every requirement R01–R18 below works on web and mobile, persists through the shared backend, and passes its acceptance scenarios and release gates. Screens, mock data, generated drafts, and passing unit tests alone do not establish completion. This is a bounded v1 release definition, not a guarantee that users win opportunities or that software has no defects.

The two clients are `edutu-web-app/` (React/Vite/Capacitor/PWA) and `edutumobile/` (Expo/React Native). The landing page `edutu-web/`, admin redesign, scraper replacement, payments redesign, and a new mentor marketplace are outside this release. Existing providers, mentor tools, goals, roadmaps, CV tools, and document services are integration points. Automatic applications, automatic messages to providers/referees, inbox scraping, and predictive admission probabilities are outside v1.

## Existing foundations and gaps

| Area | Evidence in the repository | Treatment |
|---|---|---|
| Journey authority | `backend/services/services/api/src/opportunity-journeys/`, schema and two September migrations | Extend; preserve events, ownership, idempotency and legacy compatibility |
| Mobile workspace | `edutumobile/app/(app)/my-plan/`, journey service, Applications, Deadlines, Goals, Roadmaps | Extend the existing workspace; verify deployed API availability first |
| Web workspace | `edutu-web-app/src/components/AppWorkspaceShell.tsx`, ApplicationsPage, DeadlinesPage, profile and recommendation services | Add My Plan and use the journey backend; preserve existing routes and Community access |
| Recommendations | Opportunity intent, shortlist, decision support and ranking services | Add transparent constraints, freshness and feedback; reuse scoring infrastructure |
| Materials | Backend documents, CV, copilot answer bank and application-documents services | Add user verification, versioned reuse and per-opportunity requirements |
| Reminders | Existing notification queue, deadline reminders, scheduler and ghost-closure nudge | Extend one delivery system; suppress duplicates and unsupported assumptions |
| Glass treatment | Mobile `NativeGlassSurface.tsx` and recent workspace changes | Use existing native capability/fallback handling; finish navigation and accessibility validation |

The prior mobile review observed an unusable live journey response. Deployment/migrations/auth/configuration must be diagnosed; the root cause has not been established. Local source presence is not evidence of deployment.

Two current behaviors need deliberate changes: the journey service gates application opening on readiness, and `application-documents.service.ts` assumes CV and statement-of-purpose roles for all applications. Provider requirements must be specific to the opportunity. The existing ghost-closure copy infers that silence usually means rejection; replace that assertion with a neutral check-in and user choice.

## Global constraints

- All business data flows through the NestJS backend; clients do not gain direct Supabase business-data access.
- Clerk identity is resolved by the backend; clients never choose the owner of a plan or material.
- Preserve the existing journey state machine and immutable history; introduce only additive, tested changes.
- Web and mobile use the same server decisions, dates, progress, versions, and reminder preferences.
- Provider requirements, user choices, and AI suggestions are visibly distinguishable.
- Opening a provider link never confirms submission; only an explicit user confirmation records applied status.
- Users can edit preferences, pause a pursuit, change priority, dismiss recommendations, and stop reminders.
- AI drafts require review; no invented achievements, automatic submissions, or automatic external messages.
- Unknown eligibility, cost, deadline, and response dates remain unknown until supported by a source or user entry.
- Native Liquid Glass is limited to supported iOS controls; web uses a visual adaptation and Android uses its accessible fallback.
- Content surfaces prioritize legibility; support reduced transparency, reduced motion, screen readers, large text, keyboard access, and RTL.
- Completion requires real backend integration and release evidence on web, iOS, and Android.

## User journey and requirements

| ID | Capability | User-visible acceptance | Implementation owner |
|---|---|---|---|
| R01 | Reliable shared plan | Save on one client, reload on the other, see the same state; retry cannot create duplicates; account switching cannot expose another plan | Plan 01, tasks 1–3 |
| R02 | Editable circumstances | Goal, target date, location/remote preference, weekly availability, funding constraints and readiness can be skipped, edited or cleared; explain why each requested field helps | Plan 02, task 1 |
| R03 | Explainable recommendations | Show 3 strong candidates by default, up to 5; explain fit, uncertainty, evidence, effort and cost; correct preferences or dismiss with an optional reason | Plan 02, task 2 |
| R04 | Trustworthy opportunity details | Show source link and last check, eligibility unknowns, actual application link and deadline precision; changed/withdrawn opportunities trigger one actionable update | Plan 02, task 3 |
| R05 | Today and weekly planning | A meaningful next action, time estimate and deadline appear; user selects a realistic weekly workload and can preview changes before accepting them | Plan 03, tasks 1–2 |
| R06 | Manage pursuits | Shortlist, activate, switch primary, pause, resume, archive and filter; preserve work; explain capacity tradeoffs instead of silently overbooking | Plan 01, task 2; Plan 03, task 2 |
| R07 | Get unstuck | Missing document, referee, unclear question, time, cost and waiting produce specific next steps; saving a blocker changes the plan | Plan 03, task 3 |
| R08 | Reusable materials | Store/edit achievements, documents and answers; see verified status/version/expiry; attach a reviewed copy to an application; delete or export owned data | Plan 04, tasks 1–2 |
| R09 | Guided application preparation | Checklist reflects this provider; AI assistance uses selected facts with provenance, preserves drafts and supports user-approved export for review | Plan 04, task 3 |
| R10 | Confirmed submission | Link opening is recorded separately; users confirm date, optional reference and receipt; checklist suggestions do not obstruct access to the provider | Plan 01, task 2; Plan 05, task 1 |
| R11 | Follow-through | Track expected reply, follow-up and interview dates; prepare with a checklist and editable draft; never infer rejection from silence | Plan 05, task 1 |
| R12 | Outcomes and next steps | Record offer, rejection, withdrawal or no response; optional reflection; preserve reusable work; choose an alternative or offer next steps | Plan 05, task 2 |
| R13 | Respectful reminders | Opt-in channel, timezone, quiet hours and cadence; snooze/pause/cancel; no duplicate alert across legacy and journey systems; delivery rechecks eligibility | Plan 05, task 3 |
| R14 | Goals and roadmaps connected to action | Link existing goal/roadmap steps to a pursuit, deep-link both ways and count work once; web exposes the same linked information | Plan 03, task 2 |
| R15 | Coherent accessible interaction | Web desktop/mobile widths, native iOS and Android navigation, cards, detail, sheets and all loading/empty/error/success states are usable | Plan 01, task 3; Plan 06, task 1 |
| R16 | Honest low-connectivity behavior | Cached plan is labeled; text drafts survive restart; offline submission/status changes are never presented as saved; conflict recovery preserves user text | Plan 01, task 3; Plan 04, task 2 |
| R17 | Useful, controlled assistance | Explain suggestions, accept corrections, preserve non-AI alternatives, enforce quotas and prevent unauthorized material sharing | Plan 02, task 2; Plan 04, task 3; Plan 06, task 2 |
| R18 | Measured, operationally complete release | Scenario coverage across both clients, owner-isolation checks, useful-progress metrics, staged rollout, rollback and support runbook | Plan 06, tasks 2–3 |

## Page and navigation design

Make **My Plan** a first-class destination. Its landing page is **Today**, followed by **Pursuits**, **Applications**, **Calendar**, and **Resources**. Goals and Roadmaps remain available as connected planning tools, with old links preserved. Profile/settings stay reachable; Community remains reachable on web. Do not cram all these subpages into the global bottom bar.

Mobile global navigation retains the existing destinations and includes My Plan as a stable labeled destination. Use a compact workspace switcher beneath the page title. Opening a pursuit drills into a detail stack; Back restores the originating tab and scroll position. Bottom actions respect keyboard and safe areas. Test the existing custom navigator first; a full native-tab migration is not a prerequisite for functional v1.

Web My Plan uses the existing workspace shell, a persistent desktop sidebar and responsive workspace navigation. `/app/my-plan` is Today; `/app/my-plan/pursuits`, `/app/my-plan/applications`, `/app/my-plan/calendar`, `/app/my-plan/resources`, and `/app/my-plan/:journeyId` provide deep links. Static routes must resolve before the detail route. Existing `/app/applications`, `/app/deadlines`, saved, goal and roadmap entry points retain their URLs or explicit aliases.

Mobile routes mirror those concepts under `app/(app)/my-plan/`: `index.tsx`, `pursuits.tsx`, `applications.tsx`, `calendar.tsx`, `resources.tsx`, `[id].tsx`. Reuse screen components behind old `/applied` and `/deadlines` routes, rather than forking behavior.

| Surface | Contents and interaction |
|---|---|
| Today | One prioritized action; up to two additional actions; estimated time; current blocker/waiting state; next deadline; a small recommendation section |
| Pursuit card | Title/provider, stage, next action, deadline/source confidence, progress based on applicable requirements; one primary action; secondary menu for pause/priority/archive |
| Pursuit detail | Overview, Tasks, Materials, Timeline; contextual Help, Reschedule and provider link; show unknown requirements without pretending the application is ready |
| Applications | Confirmed submission history, waiting/follow-up/interview filters, editable expected response, outcome controls |
| Calendar | Deadline versus personal task dates visually distinct; timezone/precision shown; list alternative; explicit ICS export or native calendar permission |
| Resources | Verified profile facts, achievements, CV/documents and reusable answers; search, versions, review/attach/export/delete |

Use Liquid Glass for navigation and compact action surfaces where supported, with readable solid/tinted content cards. Avoid stacking transparent cards and glass sheets. Web glass is CSS styling, not the native iOS material. Provide visible labels, minimum 44pt native targets and 44px web targets, usable 200% text scaling, WCAG AA contrast, reduced-motion behavior and Arabic RTL validation.

## Behavioral decisions

**Readiness and external links.** Keep provider access available from all non-deleted opportunity details, including expired items with a status notice. Before first opening, show incomplete/unknown requirements as information. Readiness uses known provider requirements only, and remains uncertain when requirements are incomplete. Suggested tasks can be skipped. Opening a link records an event and does not freeze preparation tasks. User-confirmed submission may be recorded even if Edutu's checklist is incomplete; preserve the discrepancy, not a false checklist completion.

**Capacity and pause.** Keep one primary pursuit. Preserve the current three-active limit for legacy clients during initial rollout. For v1-capable clients, allow a fourth active pursuit only after a server-generated workload warning and explicit acknowledgement; a resource safety limit of 20 active pursuits remains with a clear archive/pause path. Paused is an orthogonal activity flag, not a rejection/outcome. It removes tasks from daily scheduling and cancels ordinary nudges; a separately enabled critical-deadline preference may still notify. Resume previews a revised schedule. No automatic state changes based on inactivity.

**Scheduling.** Inputs are confirmed deadline precision/timezone, estimated work, dependencies, user availability and manually locked dates. Schedule backward with a user-editable two-day buffer, in 15-minute units. Unknown deadlines produce unscheduled tasks. Impossible plans return capacity warnings and alternatives; never silently place tasks after a provider deadline. Overdue tasks prompt a preview, not automatic rewriting. Only accepting a preview persists dates; record the source journey versions to reject stale previews.

**Requirements and provenance.** Store requirement kind (`provider_required`, `suggested`, `unknown`), supporting URL/last-checked time and optional user correction. Do not relabel historical template tasks as verified requirements. Eligibility is a rules result with uncertainty, not acceptance probability. Unknown costs are not zero. Estimates and proposed actions are labeled as estimates/suggestions.

**Materials and privacy.** Reuse the document/CV/answer-bank systems. A verified fact means the user reviewed it, not that Edutu certified it. Attach immutable versions so editing a master CV does not silently change a submitted application. Sensitive files are online-only by default; offline persistence is for user text drafts with explicit device-storage disclosure and clear/delete controls. Drafts are scoped by account and purged on sign-out/account deletion. Export for mentor review is previewed and downloaded/shared explicitly by the user; v1 does not silently grant mentor access or send a message.

**Follow-through.** Expected response is optional and identified as provider-stated or user-chosen. Reaching it offers Check status, Draft follow-up, Keep waiting and Record outcome. No response is a user-selected outcome. Interview preparation contains logistics, selected application materials and a practice checklist. Offer support includes the provider's acceptance deadline and user-defined next tasks; never invent visa or legal advice.

**Notifications.** Reuse the current queue, preferences, timezone and quiet-hour mechanisms. One logical event can appear in inbox and an enabled delivery channel, but legacy/new jobs must not send duplicate pushes. Suggested default maximum is one noncritical care nudge per day and three per week, inside existing account-wide limits. Critical deadline alerts require a separate preference and still respect quiet hours. A deadline with no time uses a date label, not a fabricated countdown. Terminal outcomes, deleted journeys, revoked channel permission and changed task status are rechecked at delivery.

**AI and fallback.** Ranking eligibility and capacity checks remain deterministic. Gemini can phrase explanations, propose tasks and draft text using selected evidence; validate its structured response, reject unsupported factual assertions and fall back to templates on timeout/quota/failure. Standard tracking, reminder controls and access to owned materials remain available when AI credits are exhausted. Existing entitlements can govern AI generation; this release does not redesign billing.

## API, persistence and migration boundaries

Keep existing `/me/opportunity-home`, `/me/opportunity-intent` and `/me/opportunity-journeys` contracts compatible. Add `/me/care-plan` for versioned aggregate views and adjunct commands. Existing journey details and mutation endpoints stay authoritative. New writes use `idempotencyKey`; updates of existing versioned state also use `expectedVersion` in the body. Read-like previews do not mutate tasks, and acceptance checks all versions captured by the preview. Do not change the current intent header convention. Resolve ownership from Clerk and use one transaction for domain state plus immutable event. A repeated key with the same payload returns the original response; a different payload conflicts. A stale version returns 409 with a safe latest-version summary. Normalize instants to UTC ISO strings before comparisons; retain date-only values and their precision separately rather than coercing them into instants.

Keep canonical response types in new backend `src/opportunity-journeys/care-plan.types.ts`. Web `src/types/carePlan.ts` and mobile `packages/core/src/types/carePlan.ts` are platform adapters, not separate business rules. A shared JSON fixture at `test-fixtures/care-plan/v1.json` and contract tests in all three packages verify the wire shapes. Do not import the React Native core package into web/backend.

Additive migrations belong in the backend migration directory. New adjunct tables: `opportunity_care_profiles`, `opportunity_plan_schedules`, `opportunity_plan_blockers`, `opportunity_plan_links`, `opportunity_plan_followups`, `opportunity_material_versions`, `opportunity_recommendation_feedback`, and provider observation history `opportunity_source_observations`. Add activity/readiness provenance fields to journey/task schema. Reuse existing document storage, notification tables and profile data; do not duplicate mutable source files or identity records. Create immutable private material snapshots only where the existing source has no version facility. Include user ownership, foreign keys, unique idempotency constraints, indexes for due jobs, and direct-client RLS denial; provider observation history is shared factual data written only by trusted backend ingestion. Each detailed plan defines its columns and API bodies.

## Completion evidence

The release matrix must record actual backend, web, iOS and Android evidence per requirement. Cover a new user, existing bookmark/application import, uncertain eligibility, deadline changes, insufficient time, a blocked dependency, offline restart, concurrent edits, confirmed application, interview, no response, rejection, offer, opt-out and account deletion. There must be no unresolved P0/P1 issues; a P2 affecting one of these journeys blocks that journey's completion. Baseline unrelated failures are recorded separately and cannot be used to label an untested requirement complete.

Measure first useful action, confirmed submissions before known deadlines, blocker resolution, successful cross-client synchronization, reminder opt-outs and optional helpfulness feedback. Never collect application text, documents or inferred emotions in analytics. A useful-progress event requires an actual user-confirmed action; page views do not count. Monitor delivery duplicates, expired recommendations and eligibility corrections as quality guardrails.

Completion also requires migration rehearsal, authenticated staging smoke tests, job retry/cancel checks, disabled-feature fallback, documented rollback, accessibility checks, performance traces and support instructions. Proposed release targets: cached Today usable within 1 second on the designated test devices, warm authenticated Today API p95 under 800ms at 50 concurrent users excluding AI generation, no lost drafts or duplicated mutations in the acceptance suite. These are targets to validate, not current performance claims.
