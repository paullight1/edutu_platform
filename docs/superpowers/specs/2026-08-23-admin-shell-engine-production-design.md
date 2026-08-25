# Edutu Admin Shell and Engine Production Refactor Design

**Status:** Scope approved; implementation has not started.

**Branch:** `refactor/admin-shell-engine-production`

**Base:** `main` at `e5f6b66163f34722fcc63bc58c0e670708ce9471`

## Goal

Refactor the Edutu admin panel end to end, make the Edutu Engine work consistently in deployed web environments, and improve maintainability, responsiveness, accessibility, diagnostics, and operational clarity without removing, renaming, or changing the meaning of any existing route or workflow.

The work must preserve current product behavior first. Visual and architectural improvements are allowed only when the existing capability remains available through the same URL and keeps the same backend contract unless a separately tested compatibility layer is required.

## Approved scope contract

The approved option is a route-compatible replacement.

### Non-negotiable invariants

1. Preserve every existing admin URL.
2. Preserve every existing redirect.
3. Preserve authentication and authorization semantics.
4. Preserve all current Engine source, run, status, review, import, enhancement, retention, pause, resume, stop, and background-run workflows.
5. Preserve backend API paths unless an additive diagnostics endpoint is required.
6. Do not combine this work with unrelated web, mobile, billing, community, or database redesign.
7. Do not hide failed production calls behind empty arrays, zero values, or misleading empty states.
8. Do not depend on the local admin bypass in production.
9. Every phase must be independently testable and revertible.
10. No route is removed after the refactor, including compatibility redirects.

## Problem statement

The current admin panel works but has accumulated several tightly coupled responsibilities:

- `admin/src/components/Layout.tsx` owns authentication-facing user state, theme state, desktop navigation, the collapsed rail, section flyouts, mobile navigation, responsive layout behavior, logout, route interpretation, and a large inline stylesheet.
- `admin/src/pages/Scraper.tsx` owns API access, Engine data loading, run control, Server-Sent Events parsing, polling, source management, source grouping, job inspection, AI enhancement, retention, bulk import, modal state, notifications, and most of the Engine presentation.
- Engine navigation is duplicated between the section sidebar and page-level tabs.
- Fixed sidebar and flyout widths make the usable content area fragile on smaller desktop screens and tablets.
- Several backend failures are converted into empty lists or zero totals, causing a production outage or configuration failure to resemble a valid empty installation.
- The local and deployed admin can resolve different backend origins.
- Production deployment ownership is unclear enough that the UI can be deployed successfully while calling an outdated, differently configured, or wrong backend service.

## Evidence behind the production Engine diagnosis

The implementation phase must verify the root cause before changing behavior, but the repository already shows a strong configuration-drift hypothesis.

### Conflicting backend defaults

- `admin/vite.config.ts` uses `https://edutu-api.onrender.com` as its development proxy default.
- `admin/src/lib/backend.ts` uses `https://edutu-platform.onrender.com` as its browser runtime fallback.
- The canonical Render manifest names the NestJS service `edutu-api`.

This permits local development and deployed browser code to reach different Render services even when the same source revision is used.

### Deployment and secret drift

The canonical Render service:

- is configured with `autoDeploy: false`;
- requires manually provisioned `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, admin, and AI secrets;
- declares `SCRAPER_SCHEDULER_ENABLED=true` in repository configuration.

The deployed screenshot reports database configuration missing, AI key missing, scheduler disabled, zero active sources, and zero opportunities. That state does not match the repository deployment intent and strongly indicates one or more of these conditions:

1. the admin build points to the wrong backend origin;
2. the intended Render service is running stale code;
3. the intended Render service is missing required environment variables;
4. the production admin build is missing or overriding `VITE_BACKEND_URL`;
5. authentication reaches the UI but the deployed API rejects or cannot resolve privileged Engine dependencies.

### Local-only masking risk

The local admin bypass is deliberately disabled in production builds. Local success can therefore mask either:

- missing production authentication configuration;
- missing production admin role configuration;
- missing production backend credentials;
- a local proxy target that differs from the deployed browser target.

## Root-cause investigation contract

No production fix may be merged until the following evidence identifies the failing boundary.

1. Record the effective admin API origin, its source (`VITE_BACKEND_URL`, legacy alias, or development proxy), and build environment without exposing secrets.
2. Probe `/health/live` and `/health/ready` on the same origin used by the browser.
3. Call authenticated `/api/scraper/engine-status` and record request ID, HTTP status, safe response body, and timing.
4. Compare the deployed API version/commit identifier with the repository commit expected for the environment.
5. Verify whether `admin.edutu.org` is deployed from the repository root service or the dedicated `admin/` Vercel project.
6. Verify the effective production `VITE_BACKEND_URL` for the actual admin deployment.
7. Verify the canonical Render service deployment revision and required secret presence using presence-only diagnostics.
8. Confirm CORS allows the exact admin origin.
9. Compare the successful local request path and headers with the failing deployed request path and headers.
10. Form and test one root-cause hypothesis at a time; do not bundle speculative configuration fixes.

## Route preservation matrix

The following routes and redirects must continue to resolve with their current meaning.

### Authentication and account

- `/login`
- `/signup`
- `/reset-password`
- `/profile`

### Dashboard and content

- `/`
- `/dashboard` → `/`
- `/opportunities`
- `/submissions`
- `/events`
- `/users`
- `/creators`
- `/roadmaps`
- `/marketplace`
- `/blog`
- `/impact-stories`

### Engine

- `/engine`
- `/engine/runs`
- `/engine/status`
- `/edutu-engine` → `/engine`

### App and engagement

- `/app/home`
- `/app/campaigns`
- `/app/flags`
- `/app/widgets`
- `/app/control`
- `/mobile-control` → `/app/home`
- `/notifications`

### Monetization

- `/monetization`
- `/monetization/pricing`
- `/monetization/transactions`
- `/monetization/usage`

### Platform settings

- `/settings`

The refactor may introduce internal nested route modules, but public path strings and redirect targets remain unchanged.

## Workflow preservation matrix

### Global admin workflows

- Supabase session initialization and recovery.
- Admin-email and role checks.
- Unauthorized and sign-out flows.
- Dark and light themes.
- Desktop and mobile navigation.
- Existing content, user, creator, app-control, notification, monetization, and settings pages.

### Engine source workflows

- List, filter, enable, disable, create, group, bulk-add, inspect, run, and delete sources.
- Preserve source category, tier, priority, parent/group, totals, and last-run metadata.
- Preserve single-source and all-enabled-source runs.
- Preserve group review before running a source group.

### Engine run workflows

- Start a live run.
- Stream opportunities through authenticated SSE-over-fetch.
- Minimize a run while it continues.
- Reopen the run progress view.
- Pause, resume, gracefully stop, or abort a run.
- Reconnect to a server-side run after refresh or navigation.
- Inspect a completed or failed job.
- Delete a job and its associated opportunities.
- View source results, warnings, errors, skipped items, durations, and saved counts.

### Engine opportunity workflows

- Preview scraped opportunities.
- Search and select results.
- Improve one or many items with AI.
- Compare before and after values.
- Save selected or inspected opportunities through the existing bulk-import contract.
- View recent opportunities and site/batch attribution.
- Delete one batch or all opportunities from a site.
- Apply retention settings and purge old opportunities.

### Engine automation workflows

- Read and update auto-run intent.
- Read and update cron schedule.
- Read and update recheck interval and data-retention settings.
- Distinguish stored scheduler intent from an actually armed cron job.

## Design principles

1. **One navigation model:** route metadata must be the single source of truth for desktop, compact desktop, and mobile navigation.
2. **Pages orchestrate; features own behavior:** route files connect feature controllers to views but do not contain API parsing or business rules.
3. **Errors remain visible:** unavailable data is not the same as empty data.
4. **Responsive by construction:** use layout primitives and CSS grid/flex behavior rather than sibling selectors tied to fixed widths.
5. **Accessible by default:** keyboard navigation, focus visibility, meaningful labels, reduced-motion support, and touch-size requirements are part of component contracts.
6. **Production configuration is explicit:** production builds must not silently choose a legacy hostname.
7. **Diagnostics are safe:** expose provider/configuration presence and version information, never secret values.
8. **Behavior before polish:** characterization tests precede structural extraction.

## Target admin architecture

```text
admin/src/
├── app/
│   ├── AdminApp.tsx
│   ├── AdminRoutes.tsx
│   └── route-manifest.tsx
├── shell/
│   ├── AdminShell.tsx
│   ├── PrimaryRail.tsx
│   ├── SectionNavigation.tsx
│   ├── AdminTopbar.tsx
│   ├── MobileNavigation.tsx
│   ├── ShellContext.tsx
│   └── shell.css
├── features/
│   ├── engine/
│   │   ├── api/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── model/
│   │   ├── pages/
│   │   └── index.ts
│   └── ...existing feature areas migrate incrementally
├── shared/
│   ├── api/
│   ├── components/
│   ├── hooks/
│   └── state/
└── pages/
    └── compatibility route exports during migration
```

This design does not require moving every existing page in one change. The shell and Engine are the first controlled slices. Other pages remain mounted through the same route manifest and can be decomposed separately.

## Admin shell design

### Route manifest

A typed route manifest replaces duplicated navigation and route interpretation. Each entry includes:

- route path;
- display label;
- icon;
- navigation group;
- exact or prefix matching rule;
- breadcrumb title;
- mobile title;
- optional permission metadata;
- compatibility redirect metadata where applicable.

React Router definitions and navigation menus consume the same manifest or strongly related typed exports so route drift is detectable in tests.

### Desktop behavior

- A compact primary rail contains top-level sections.
- A section panel displays the active section's children only when useful.
- The content canvas uses CSS grid columns rather than sibling selectors.
- Collapsing or opening navigation cannot overlay or crop page content at supported desktop widths.
- The active destination remains visible and understandable without relying only on color.
- Every icon-only control has an accessible name and dependable tooltip.

### Tablet behavior

- The persistent secondary panel collapses before the content width becomes unusable.
- Section destinations move into a controlled popover or drawer.
- Tables and cards use responsive containers instead of forcing the entire page wider than the viewport.

### Mobile behavior

- A compact top bar opens a full navigation drawer.
- Groups expand as accessible accordions.
- The active route and section are announced in the top bar.
- The drawer closes after navigation, Escape, scrim activation, or route change.
- Focus is trapped while the drawer is open and restored to its trigger when closed.

### Visual system

The refactor keeps Edutu's current visual identity while introducing consistent tokens for:

- surfaces and elevation;
- borders and dividers;
- text hierarchy;
- status colors;
- spacing and density;
- control heights;
- radii;
- focus rings;
- motion duration;
- responsive breakpoints.

Page-specific hardcoded colors should be replaced only where the token mapping is behaviorally safe and visually verified in both themes.

## Engine feature architecture

### Pages

The three existing routes become distinct page components:

- `EngineSourcesPage` for source inventory, source groups, run entry points, catalogue totals, and recent opportunity/site summaries.
- `EngineRunsPage` for active run state, run history, job inspection, progress, errors, warnings, and run controls.
- `EngineStatusPage` for runtime configuration, readiness, provider health, scheduler state, data-quality and deployment diagnostics.

A compatibility export may remain at `admin/src/pages/Scraper.tsx` while route imports transition, but the file must no longer contain the feature implementation.

### Model and types

Canonical Engine types move into `features/engine/model/`:

- sources and source groups;
- jobs and source results;
- run status and stream events;
- engine health and configuration;
- scraped opportunity previews;
- site and batch attribution;
- automation settings;
- load/error state models.

The feature must not redefine the same response shapes independently across components.

### API adapter

`features/engine/api/engineApi.ts` owns all Engine HTTP calls. It uses the shared authenticated backend client and exposes typed functions such as:

- `getEngineOverview()`;
- `listSources()`;
- `createSource()`;
- `updateSource()`;
- `deleteSource()`;
- `listJobs()`;
- `getJobOpportunities()`;
- `deleteJob()`;
- `getRunStatus()`;
- `pauseRun()`;
- `resumeRun()`;
- `stopRun()`;
- `openRunStream()`;
- `getAutomationSettings()`;
- `updateAutomationSettings()`;
- `enhancePreview()`;
- `listOpportunitySites()`.

The adapter owns URL construction, auth headers, safe JSON parsing, correlation IDs, timeout behavior, and normalized errors. Components do not call `fetch` directly.

### Controllers and hooks

Focused hooks/controllers own separate concerns:

- `useEngineOverview`;
- `useEngineSources`;
- `useEngineRuns`;
- `useEngineRunStream`;
- `useEngineAutomation`;
- `useEngineOpportunityReview`;
- `useEngineDiagnostics`.

No single hook should reproduce the current page-wide state surface. Each hook has one clear loading, success, empty, partial, and failure contract.

### Presentation components

Components are split by operational responsibility rather than arbitrary line count:

- configuration banner;
- engine summary metrics;
- source inventory and source group;
- add/edit source dialog;
- run launcher;
- live run panel;
- background run indicator;
- run history and job details;
- opportunity review table/cards;
- site and batch explorer;
- automation settings;
- diagnostics checks;
- empty, unavailable, and partial-data states.

## Production API configuration design

### Canonical resolution

A new runtime configuration module will:

1. Prefer `VITE_BACKEND_URL`.
2. Temporarily support `VITE_API_URL` as a legacy alias with a non-secret diagnostic warning.
3. Use the Vite proxy only in development.
4. Refuse to silently use a hardcoded production hostname in a production build.
5. Normalize trailing slashes and validate `https:` for production.
6. expose safe metadata: effective origin, source, build mode, and whether configuration is explicit.

A missing production API origin should fail the admin build or render a blocking configuration screen, depending on what the deployment platform can verify most reliably. It must not quietly call an unrelated service.

### Authentication

The existing Supabase session and admin-role model is preserved. The shared client continues to send:

- `Authorization: Bearer <access token>`;
- `X-Edutu-Admin-Email` for compatibility with the existing guard contract.

The local bypass remains development-only. Tests must prove that production mode cannot activate it.

### Request diagnostics

Every admin API request should capture or generate a request correlation identifier and surface it in safe error details. Diagnostic UI may show:

- request ID;
- target origin;
- HTTP status;
- elapsed time;
- API version/commit;
- failure category.

It must not display tokens, secret values, raw database errors, or sensitive response bodies.

## Engine Status page design

The status route becomes an operational console rather than a second copy of the Sources page.

### Runtime checks

- Admin build environment and configured API target.
- API liveness.
- API readiness.
- Authenticated Engine endpoint reachability.
- Database configured and reachable.
- AI route enabled, selected provider/model, and provider-key presence.
- Scheduler environment switch.
- Stored auto-run intent.
- Cron actually armed.
- Next scheduled run and timezone.
- Scraper egress mode.
- Quality threshold, page cap, concurrency, retention, and recheck settings.

### Drift detection

The page must highlight contradictions such as:

- stored auto-run enabled but cron not armed;
- repository-intended backend differs from browser target;
- API live but not ready;
- database configured but unreachable;
- AI route enabled with no usable provider key;
- admin build calling an API revision older than its own expected revision.

### Remediation guidance

Each failed check provides a concise, safe next action, for example:

- set the production `VITE_BACKEND_URL` on the actual admin project;
- deploy the canonical `edutu-api` service revision;
- restore the missing secret in Render;
- add `https://admin.edutu.org` to CORS;
- arm the scheduler after confirming its stored configuration.

The UI does not claim a remediation has been completed until a fresh check passes.

## Data-loading and error-state design

### Explicit states

Each remote panel uses an explicit state model:

- idle;
- loading;
- refreshing;
- success with data;
- success with genuinely empty data;
- partial success;
- unauthorized;
- misconfigured;
- unavailable;
- retrying;
- failed.

### Partial loading

The Engine overview may continue to load independent resources concurrently, but each rejected request remains visible. For example, a successful sources response and failed jobs response renders sources plus a Jobs unavailable panel; it does not replace failed jobs with an apparently valid empty history.

### Mutation handling

- Mutations disable only the affected control or row when possible.
- Optimistic updates are used only when reversal is reliable.
- Destructive operations use the shared confirm dialog rather than browser `confirm` after characterization tests are in place.
- All mutation errors remain actionable and include a safe request ID.
- Retry does not duplicate a run, source, job deletion, or bulk import.

## SSE and background-run design

The existing authenticated `fetch` plus `ReadableStream` strategy is preserved because native `EventSource` cannot send the current bearer headers.

The extracted stream controller must:

- own the `AbortController` lifecycle;
- parse fragmented SSE frames correctly;
- ignore malformed individual events without corrupting the stream;
- support `start`, `source-start`, `source-skip`, `control`, `opportunity`, `source-done`, `done`, and `error` events;
- prevent duplicate run starts;
- reconnect through `/run/status` after refresh;
- poll only while rehydrated;
- clear readers, timers, and controllers on completion or unmount;
- preserve minimize-to-background behavior;
- surface connection loss separately from server-declared run failure.

## Accessibility requirements

- All navigation and controls are keyboard reachable.
- Focus states meet contrast requirements in both themes.
- Icon-only buttons have accessible names.
- Drawer, dialogs, popovers, and confirmation surfaces manage focus correctly.
- Active navigation does not rely on color alone.
- Status is communicated through text as well as color/icon.
- Live run updates use a controlled live region and do not announce every scraped item.
- Reduced-motion preferences disable decorative motion.
- Touch targets are at least 44 by 44 CSS pixels where practical.
- Tables preserve header relationships and provide a usable narrow-screen alternative.

## Responsive requirements

Verification widths include at least:

- 320px;
- 375px;
- 768px;
- 1024px;
- 1280px;
- 1440px and above.

At each width:

- no inaccessible horizontal page overflow;
- no navigation/content overlap;
- no clipped primary actions;
- modals remain within the viewport;
- data tables have an explicit responsive strategy;
- the Engine can start, monitor, inspect, and stop a run.

## Testing strategy

### Characterization tests first

Before extraction, tests must capture:

- every route and redirect in the preservation matrix;
- navigation group and active-route behavior;
- desktop collapse and section navigation;
- mobile drawer and accordion behavior;
- theme persistence;
- auth, unauthorized, and local-bypass restrictions;
- Engine source CRUD and toggling;
- single, group, and all-source launch guards;
- stream parsing and progress updates;
- pause, resume, stop, abort, minimize, restore, and rehydration;
- job inspection and deletion;
- opportunity enhancement, selection, and bulk save;
- automation settings and retention;
- partial request failure without fake zeros or empty arrays.

### New configuration tests

- production build with no backend origin fails closed;
- `VITE_BACKEND_URL` wins over the legacy alias;
- the legacy alias remains temporarily compatible;
- development proxy behavior remains available locally;
- production cannot enable local bypass;
- target-origin diagnostics never expose credentials;
- API-version mismatch produces a visible warning.

### Verification gates

- admin tests;
- admin lint;
- admin TypeScript build;
- production Vite build;
- architecture boundary checks;
- backend tests for additive diagnostics changes;
- complete repository CI;
- preview smoke test against the intended API;
- production smoke test after controlled deployment.

## Deep-dive review roles

Independent specialist passes review the work after each major phase.

1. **Runtime and deployment reviewer:** environment propagation, Vercel service ownership, Render revision, CORS, readiness, and production smoke evidence.
2. **Admin architecture reviewer:** route manifest, dependency direction, state ownership, component boundaries, and avoidance of new God files.
3. **Frontend UX reviewer:** information hierarchy, responsive behavior, density, navigation clarity, empty/error states, and theme consistency.
4. **Accessibility reviewer:** keyboard, focus, semantic navigation, dialogs, live regions, contrast, reduced motion, and touch targets.
5. **Engine reviewer:** source management, SSE behavior, rehydration, run controls, automation, persistence, and data-review workflows.
6. **Security reviewer:** auth headers, local bypass boundaries, admin guard behavior, safe diagnostics, destructive actions, and secret handling.
7. **Test and release reviewer:** characterization coverage, regression risk, CI evidence, preview verification, rollback, and production sign-off.

Findings are ranked `P0` through `P3`. Every `P0` and `P1` introduced by the branch must be resolved before merge.

## Implementation phases

### Phase 0 — Production evidence and root cause

- add safe client diagnostics;
- capture the actual admin deployment target and API boundary;
- compare local and production requests;
- confirm the single root cause or root-cause chain;
- add a failing regression test before applying the minimal production fix.

Exit gate: production failure is reproducible and the broken boundary is evidenced.

### Phase 1 — Characterization safety net

- freeze route and redirect behavior;
- freeze shell navigation and theme behavior;
- freeze Engine source, run, review, automation, and background-run behavior.

Exit gate: tests fail when any approved workflow is intentionally removed in a controlled local mutation.

### Phase 2 — Canonical API configuration

- replace conflicting defaults with explicit environment resolution;
- preserve the legacy environment-name alias temporarily;
- add version and request diagnostics;
- verify the deployed admin reaches the canonical current API.

Exit gate: local and web use the intended backend, and production fails visibly rather than silently drifting.

### Phase 3 — Admin shell replacement

- introduce the typed route manifest;
- implement desktop, tablet, and mobile shell components;
- preserve all route elements and redirects;
- migrate theme, profile, health, and sign-out controls;
- remove duplicated inline shell CSS after parity is verified.

Exit gate: route, navigation, responsive, theme, auth, lint, test, and build gates are green.

### Phase 4 — Engine decomposition

- extract Engine model and API adapter;
- extract source, run, automation, review, and diagnostics controllers;
- split the three existing routes into focused pages;
- preserve the compatibility page export until imports are stable.

Exit gate: `Scraper.tsx` is a thin compatibility/orchestration layer or removed from route ownership without changing routes.

### Phase 5 — Operational UX and diagnostics

- implement truthful empty, partial, unavailable, and misconfigured states;
- complete the Status operational console;
- standardize confirmations and notifications;
- expose safe request and deployment evidence.

Exit gate: a missing database, missing AI key, wrong API origin, unauthorized session, stale API revision, and scheduler drift are each distinguishable in the UI.

### Phase 6 — Full-system review

- run every specialist review;
- resolve branch-introduced `P0` and `P1` findings;
- run all repository and production-build gates;
- review the final diff for route or workflow loss.

Exit gate: complete CI green and no unresolved branch-introduced `P0` or `P1` finding.

### Phase 7 — Controlled deployment verification

- deploy the API first when API diagnostics changed;
- deploy the admin preview against the exact intended API;
- execute the route and Engine smoke suite;
- deploy production;
- re-run production checks and verify the Engine can read sources, start a bounded run, receive progress, and inspect the result;
- retain the prior deployment for immediate rollback.

Exit gate: live production evidence, not repository configuration alone, proves the Engine works.

## Rollback strategy

- Use focused commits by phase.
- Do not mix unrelated product changes.
- Keep the existing route manifest available until the replacement route tests pass.
- Revert the latest phase if it cannot return to green without unrelated changes.
- Preserve the prior Vercel deployment and Render revision during rollout.
- A frontend rollback must remain compatible with the deployed API; additive diagnostics endpoints cannot replace existing endpoints.

## Success criteria

The refactor is complete only when all of the following are true:

1. Every route and redirect in this design still works.
2. Every listed Engine workflow is preserved.
3. Local and deployed admin builds resolve the intended canonical API explicitly.
4. The production Engine can read its database, sources, jobs, and settings.
5. A bounded production scrape can start, stream progress, finish, and be inspected.
6. Missing configuration and backend failures are visibly distinct from genuine empty data.
7. The desktop, tablet, and mobile shell is usable at the required widths.
8. Keyboard and screen-reader-critical navigation paths are verified.
9. `Layout.tsx` and `Scraper.tsx` no longer own unrelated large responsibility sets.
10. Admin tests, lint, build, architecture governance, backend affected tests, and complete CI are green.
11. Production smoke evidence identifies the deployed admin and API revisions.
12. No branch-introduced `P0` or `P1` finding remains unresolved.

## Recommended improvements after the preserved-baseline refactor

These are deliberately deferred so they cannot expand the approved compatibility scope.

### P1 candidates

- Role-based navigation and action permissions beyond a binary admin check.
- Immutable audit history for destructive admin actions and configuration changes.
- A dedicated opportunity-quality review queue with ownership, SLA, and resolution state.
- Source health scoring based on recency, success rate, robots policy, latency, and extraction quality.
- Production alerts for scheduler drift, repeated source failures, empty successful runs, and high rejection rates.

### P2 candidates

- Global command palette and route search.
- Saved admin filters and table views.
- Bulk source import validation with dry-run reporting.
- Run comparison and trend analytics.
- AI cost, token, provider latency, and fallback reporting.
- Scheduled maintenance windows and run concurrency controls.
- Configurable admin density modes.

### P3 candidates

- Guided onboarding for new administrators.
- Contextual documentation links inside complex panels.
- Custom dashboard widgets per admin role.
- Keyboard shortcut discovery and command history.

Each deferred improvement requires its own approval and must preserve the compatibility contract unless a later migration is explicitly approved.
