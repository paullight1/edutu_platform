# Web guidance implementation ledger

- Workspace: `/Users/MAC/.codex/worktrees/edutu-web-guidance/Edutu_Folder`
- Base branch: `main` at the starting commit; implementation branch managed by Codex worktree.
- Spec: `docs/product-strategy/2026-09-28-edutu-v2-product-architecture.md`
- Plan: `docs/superpowers/plans/2026-09-28-web-guidance-incremental.md`
- User requirement: keep current UI recognizable; generate an SVG asset; use existing libraries where possible.

## Preflight

- Repo scan: existing `opportunity-home`, intent, journey, task, application, outcome services and Drizzle schema found.
- Dependency scan: Zod, lucide-react, Tailwind, React/Vitest already declared in web package; no new web library expected.
- Data decision: no Supabase SQL migration expected unless implementation finds a concrete missing persisted field. Existing journeys/events already represent this release.
- Existing root checkout changes are preserved outside this worktree: category image contrast edits in `Dashboard.tsx` and animation edits in `DashboardUpdatePopup.tsx`.
- Verification policy: execute the focused checks included in the user-approved implementation plan. Never write to production Supabase during implementation.

## Task progress

- [x] Task 1 — home contract and primary action (API regression tests 5/5; web typecheck baseline passed)
- [x] Task 2 — typed web home adapter (4 focused tests pass; TypeScript check and ESLint passed; commit `83bb07ae`)
- [x] Task 3 — dashboard next-step card and SVG (6 card cases, 4 adapter cases, and 3 dashboard integration cases pass; TypeScript check and focused ESLint passed; commit `d635d32d`)
- [x] Task 4 — opportunity detail handoff and rationale (existing eligibility/match rationale retained; handoff now routes to the API-returned journey ID; regression test added)
- [x] Task 5 — post-onboarding focus and inferred-intent state (successful onboarding returns to and focuses the card; inferred intent is visibly labeled and editable)
- [x] Task 6 — My Plan application/outcome mutations (versioned/idempotent wrappers, explicit confirmation and outcome actions, response-confirmed events, stale-state refresh; UI and service tests)
- [x] Task 7 — event boundaries and release readiness (existing analytics aggregator, event definitions and rollout gates documented; no baseline or production rollout claimed)
- [x] Final branch review and build/type/lint verification (full web suite 553/553; focused API journey suite 16/16; build, typecheck, lint, and diff check pass)

## Decisions

- No new service, dependency, table, or Supabase SQL is needed for this release: current API and schema already contain opportunity intents, primary journeys, tasks, and immutable transition events.
- Home service takes the explicitly primary pursuit for `nextAction`; if an older active state has no primary, it falls back to the existing due-order first result. `featuredPursuitId` makes that choice explicit to clients.
- My Plan opening an official URL only records `application_opened` after the API confirms the mutation. A separate explicit user action records submission; outcomes remain available only when the backend action is `update_outcome`.
- `VITE_GUIDANCE_HOME_ENABLED=false` hides the card; it defaults on in `.env.example`. Environment-level rollback exists, but user/staff cohort assignment and a historical funnel dashboard are not present in this repository.
- The build regenerates SEO inventory files from local data. Those incidental sitemap edits were reverted after the successful build.
- Dependency installation in the worktree ran out of disk; removed only the partial installs created in the worktree and linked to the original checkout's installed dependencies. Build and checks used the installed dependency tree; no dependency or lockfile changes were made.
- A web `npm exec prettier` attempt tried to download Prettier because it is not declared in the web package; stopped it and used the backend's existing Prettier executable. No dependency or lockfile change was made.
- The card visually labels inferred intent on phone and desktop, and its SVG is decorative with empty alt text. Expiry uses backend `daysUntilDeadline` when available; date-only deadlines remain valid through the local calendar date.
