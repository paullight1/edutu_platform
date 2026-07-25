# Admin Shell & Dashboard Overhaul — Design

**Date:** 2026-07-25
**Status:** Approved (design)
**Branch:** `feat/ai-copilot-and-fit-fixes`
**App:** `admin/` (standalone Vite + React 19 + TS, CSS-variable design system, no Tailwind)

## Why

The admin app is the operator surface for a platform that runs live scraping, live money,
and live push notifications — but its shell and dashboard have not kept up with what the
backend can now answer.

Three concrete problems:

1. **The nav rebuild from 2026-07-23 was never validated.** It shipped a rail+flyout with
   measurable UX defects (below) and was explicitly recorded as "not visually QA'd."
2. **There is no top-level chrome at all.** No top bar, no breadcrumbs, no global search,
   no command palette. On mobile a floating hamburger sits *on top of* page content.
3. **The dashboard shows less than the backend knows.** `GET /admin/funnel` returns a full
   signup→paying funnel plus weekly cohorts and referral counts. The admin frontend has
   never called it. Meanwhile the dashboard's own warning banners hardcode light-mode hex
   values (`#fef2f2`, `#fffbeb`) and are unreadable in dark mode — which is the default.

### Measured defects in the current nav

| Defect | Evidence |
|---|---|
| Opening a group hides the top level | `Layout.tsx` sets `railMode` → sidebar gets `.collapsed`, all `.nav-label` go to `opacity: 0; width: 0` |
| Opening a group *narrows* the workspace | `.main-content` `margin-left` goes 260px → 292px (`.sidebar.rail ~ .main-content`) |
| Children feel laggy | `.nav-flyout-link:nth-child(n)` staggered `animation-delay` 0.02s → 0.17s |
| Mobile content is occluded | `.mobile-menu-btn.floating` is `position: fixed` over `.page-content` |
| Fragile to edit | ~540 lines of CSS inside a `<style>{\`…\`}</style>` template literal; one backtick anywhere breaks the build |

## Scope

**In scope**

- Full app-shell rebuild: nav rail, section panel, top bar, mobile tab bar + sheet,
  command palette.
- Full Dashboard rebuild on an attention-first information architecture.
- A domain-hue colour system extending the existing CSS-variable tokens.
- Six hand-rolled SVG chart primitives (no new dependencies).
- Extraction of shell CSS out of the JS template literal into real `.css` files.
- The growth API client and a `/growth` page (see "Relationship to prior work").

**Out of scope — explicitly not touched**

- Internals of `Opportunities.tsx` (5,209 lines), `Scraper.tsx` (4,849), `Creators.tsx`
  (1,824), `Users.tsx` (1,175), `Notifications.tsx`, `Settings.tsx`, `Monetization.tsx`,
  `MobileControl.tsx`, `Submissions.tsx`, `Events.tsx`, `Roadmaps.tsx`, `Blog.tsx`.
  They inherit the new shell and tokens automatically and are otherwise left alone. This
  boundary is what keeps the change verifiable.
- **Any backend change.** Every number on the new dashboard comes from an endpoint that
  already exists.
- Page decomposition / refactoring of the large pages.

## Relationship to prior work

Two existing artefacts overlap and their boundaries are settled here.

**`docs/superpowers/specs|plans/2026-07-23-admin-nested-nav-*`** — introduced `nav-items.tsx`
(NAV data + `groupForPath`) and the rail+flyout `Layout.tsx`. This design **keeps
`nav-items.tsx` as the single source of nav truth** and extends it. It **replaces** the
rail+flyout interaction model in `Layout.tsx`. The URL structure that plan established
(`/engine/*`, `/app/*`, `/monetization/*`, plus the `/mobile-control` and `/edutu-engine`
redirects) is unchanged.

**`docs/superpowers/specs|plans/2026-07-22-growth-funnel-dashboard-*`** — Tasks 1–3
(backend funnel aggregation, cohort retention, daily snapshot cron) are **implemented but
uncommitted** on this branch (`admin.service.ts` `getFunnel`/`buildCohorts`,
`admin.controller.ts` `@Get("funnel")`, `analytics/growth-snapshot.service.ts`). Tasks 4–5
(frontend growth API client, admin Growth page) are **not started**.

**Decision:** this design absorbs Tasks 4 and 5. Rationale — the Dashboard's Growth board
needs the same API client, the `FunnelBars` and `CohortHeatmap` primitives specified here
are exactly what the Growth page requires, and shipping a Growth board whose drill-down
link 404s would be a defect. Tasks 4 and 5 of the 2026-07-22 plan are therefore
**superseded**; its Tasks 1–3 remain the source of truth for the backend.

## Architecture

`Layout.tsx` (911 lines) and `Dashboard.tsx` (940 lines) are decomposed. All shell CSS
moves into real stylesheets, permanently removing the backtick hazard.

```
admin/src/
  styles/
    tokens.css                 domain hues, gradients, elevation, motion (imported by index.css)
    shell.css                  rail, panel, topbar, tabbar, sheet, palette
  components/
    shell/
      AppShell.tsx             replaces Layout.tsx  (~170 lines)
      NavRail.tsx              72px icon rail
      SectionPanel.tsx         188px children panel
      TopBar.tsx               breadcrumb · search · refresh · bell · avatar
      MobileTabBar.tsx         5 bottom tabs
      MoreSheet.tsx            full-tree bottom sheet
      CommandPalette.tsx       ⌘K / Ctrl-K
    charts/
      Sparkline.tsx  AreaChart.tsx  BarChart.tsx
      FunnelBars.tsx DonutRing.tsx  CohortHeatmap.tsx
    ui/
      StatCard.tsx  BoardCard.tsx  AttentionCard.tsx
      Delta.tsx  EmptyState.tsx  Skeleton.tsx
    nav-items.tsx              EXTENDED (not replaced)
  hooks/
    useDashboardData.ts        parallel fetch, 60s refresh, per-source error isolation
  lib/
    growthApi.ts               NEW — funnel client (absorbed Task 4)
    adminApi.ts                EXTENDED — funnel types re-exported
  pages/
    Dashboard.tsx              rebuilt (~220 lines, boards extracted)
    Growth.tsx                 NEW (absorbed Task 5)
```

### `nav-items.tsx` extension

`NavLeaf` and `NavGroup` gain three optional fields. `NAV` and `groupForPath` keep their
current contracts, so adding or moving a menu item remains a one-line change.

```ts
type Hue = "blue" | "purple" | "teal" | "green" | "orange" | "red";

type NavLeaf = {
  label: string; to: string; icon?: LucideIcon;
  badgeKey?: BadgeKey;      // which live count renders beside this item
};
type NavGroup = {
  id: string; label: string; icon: LucideIcon; children: NavLeaf[];
  hue: Hue;                 // drives icon, panel accent, board colour
  tabPriority?: number;     // presence + order in the mobile bottom tab bar
};
```

`BadgeKey` is a closed union (`"submissions" | "creators" | "needsReview" | "deadlineRisk"`)
resolved from one shared counts hook, so a badge cannot reference a count that is not
fetched.

## Nav specification

### Desktop (≥769px) — fixed two-column, zero content shift

**Rail — 72px, always present.** Logo, then the eight NAV entries as a vertical stack of
icon + 10px label. The active entry gets a 3px left bar and a soft tint **in its own domain
hue**. Bottom of the rail: theme toggle, avatar, sign out.

**Section panel — 188px, always present.** Header shows the current section name. Below it,
that section's children, each with a **live badge count** where `badgeKey` is set
(`Submissions 7`, `Creators 4`, `Opportunities 23`). For leaf routes (Dashboard, Settings,
Profile) the panel lists *that page's own* in-page sections instead, so it is never empty
and never collapses.

**Total 260px, constant.** Navigating between sections swaps panel content in place;
`margin-left` never changes. The staggered per-child animation is deleted — the panel
cross-fades once at 120ms.

One collapse control drops to rail-only (72px), persisted to `localStorage` under the
existing `sidebar` key.

**Top bar — 56px, sticky.** Breadcrumb (`Content › Opportunities`), ⌘K search trigger,
refresh control with a relative "updated 2m ago" label, notification bell, avatar menu.
Nothing floats over content.

### Mobile (≤768px)

Rail and section panel are not rendered. The top bar becomes an app bar (page title, search,
overflow). Navigation is a **bottom tab bar** of five thumb-reachable destinations, ordered
by `tabPriority`: **Home · Content · People · Money · More**. Under the app bar, a
horizontal chip scroller exposes the current section's children. `More` opens a bottom
sheet with the full two-level tree, respecting `env(safe-area-inset-bottom)`.

**Engine, App & Engagement, and Settings are reachable only through `More`** — they are
configuration surfaces rather than phone-triage surfaces. This is a one-line change:
`tabPriority` on the NAV entry. Any group given a `tabPriority` is promoted into the tab bar
and the lowest-priority entry falls back into `More`, so the bar is always exactly five
items including `More`.

There is no hamburger and no floating button anywhere.

### Command palette

`⌘K` / `Ctrl-K` opens a palette that navigates to any of the ~20 destinations and runs
actions (new opportunity, run engine, export dashboard). Fuzzy match over label + section
name. `Esc` closes, arrows move, `Enter` activates.

### Accessibility

`aria-current="page"` on the active nav item; the section panel is a labelled `<nav>`;
the mobile sheet is a focus-trapped dialog with `Esc` to dismiss; all interactive targets
≥44px on touch; visible focus rings on every control; **every animation is wrapped in
`prefers-reduced-motion: no-preference`.**

## Colour system — domain hues

Six hues, each exposing four tokens in both themes, defined in `tokens.css`:

```
--hue-{n}         base
--hue-{n}-soft    12% tint for surfaces
--hue-{n}-grad    135deg two-stop gradient
--hue-{n}-glow    shadow colour for elevated cards
```

| Domain | Hue | Drives |
|---|---|---|
| Dashboard | `#0071e3` blue | rail icon, KPI gradients |
| Content | `#0071e3` blue | panel accent, pipeline board, chart series |
| People | `#af52de` purple | user metrics, cohort heatmap |
| App & Engagement | `#00c7be` teal | campaigns, widgets, flags |
| Monetization | `#34c759` green | revenue cards, MRR chart |
| Engine | `#ff9500` orange | scrape charts, run status |
| Health / alerts | `#ff3b30` red | failures, error counts (semantic only — not a nav group) |
| Settings / Profile | neutral graphite | deliberately uncoloured, so chrome never competes with data |

**The existing four gradient stat cards survive unchanged and become the template.** Every
currently-flat surface — quick actions, activity rows, health meters, badges, empty states,
chart series, nav icons — takes its domain hue. Colour therefore always encodes meaning
rather than decoration.

Dark-mode variants are defined per hue under `[data-theme="dark"]`; gradients desaturate
~12% and glows drop to 0.25 alpha so cards do not bloom on black.

**Bug fixed by this work:** the dashboard's `dataBanner` / `actionBanner` hardcode
`#fef2f2` / `#fffbeb` / `#f0fdf4` backgrounds with `var(--text-primary)` text — white text
on near-white in dark mode. They become token-driven and correct in both themes.

## Chart primitives

Six components in `components/charts/`, hand-rolled SVG, no dependencies, each accepting a
`hue` prop and rendering a `<title>` for the accessible name.

| Component | Used by |
|---|---|
| `Sparkline` | every board headline |
| `AreaChart` | AI cost over time, revenue over time |
| `BarChart` | opportunities scraped per day |
| `FunnelBars` | growth board + Growth page |
| `DonutRing` | revenue by source, memory usage |
| `CohortHeatmap` | growth board + Growth page |

All are `viewBox`-based with `preserveAspectRatio="none"` on the plot area only (labels stay
un-stretched), responsive to container width, and render an `EmptyState` when given no
points rather than a degenerate axis.

## Dashboard specification

### Verified endpoint inventory

| Endpoint | Shape | Status |
|---|---|---|
| `GET /admin/dashboard` | `stats{totalUsers, activeOpportunities, applications, approvedCreators, pendingCreators, newUsersThisWeek, newOpportunitiesThisWeek}`, `recentActivity[]` | live |
| `GET /admin/funnel` | `stages[{key,label,total,newThisWeek,newLastWeek,convFromPrev}]`, `referral{invitersTotal,invitersThisWeek}`, `cohorts[{cohortWeek,size,w1Pct,w2Pct,w4Pct}]` | **code exists, NOT deployed** |
| `GET /admin/ai-usage/summary?days=30` | `totals{...}`, `perDay[{day,totalTokens,estimatedCostUsd,calls}]`, `perRoute[]` | live |
| `GET /admin/ai-usage/voice` | `VoiceUsageSummary` | live |
| `GET /health` | `status, uptime, database{status,responseTime}, ai{gemini,openrouter}, memory{heapUsed,heapTotal,rss}` | live |
| `GET /opportunities/admin/stats` | `{total, active, expired, missingDeadline, featured, needsReview, expiringSoon}` | live |
| `GET /opportunities/admin/verification/stats` | verification counters | live |
| `GET /admin/opportunity-submissions` | submission list | live |
| `monetizationApi.getBillingOverview()` | `revenue{month_revenue,last_30d_revenue,total_revenue,last_30d_count}`, `activeSubscriptions[]`, `credits30d`, `aiUsageToday`, `recentTransactions[20]` | live |
| `monetizationApi.listAdminTransactions(limit≤200)` | transaction page | live |

### Layout

**Header.** Greeting + date, "updated Nm ago", refresh, Export.

**Needs you now.** Gradient attention cards, each a deep link that carries filter state:

| Card | Source field |
|---|---|
| Opportunities to review | `/opportunities/admin/stats` → `needsReview` |
| Expiring within 7 days | `/opportunities/admin/stats` → `expiringSoon` |
| Missing deadlines | `/opportunities/admin/stats` → `missingDeadline` |
| Submissions pending | `/admin/opportunity-submissions` filtered count |
| Creators pending | `/admin/dashboard` → `stats.pendingCreators` |
| Engine / API degraded | `/health` → `status !== "ok"` |

Cards whose count is 0 are omitted. If every count is 0 the strip renders a single
"All clear" pill rather than an empty row.

**Growth board** (purple) — `FunnelBars` for signup → onboarded → activated → retained →
paying with `convFromPrev` rendered between stages, `newThisWeek` vs `newLastWeek` as a
`Delta`, referral inviters, and a compact `CohortHeatmap`. Drills to `/growth`.

**Money board** (green) — month / last-30d revenue with `Delta`, active subscriptions by
plan, `AreaChart` of AI cost per day, **AI spend as a percentage of last-30d revenue** as
the headline unit-economics number, `DonutRing` of revenue by provider. Drills to
`/monetization`. The per-route AI table moves here as a collapsible.

**Pipeline board** (blue) — `active` opportunities and `newOpportunitiesThisWeek`,
`BarChart` of opportunities created per day, **percentage with a real deadline**
(`1 - missingDeadline/total`), `expired` and `expiringSoon` counts. Drills to
`/opportunities`.

**Health board** (red/orange) — status dots for API / DB / AI with response times,
`DonutRing` for heap usage, uptime, AI provider chips, last engine run outcome. Drills to
`/engine/status`.

**Recent activity** — retained, restyled with hue-coded icons, opportunity thumbnails and
user avatars where available.

### Loading, error and empty states

Every board renders a `Skeleton` matching its final layout — never a `-` placeholder.
`useDashboardData` uses `Promise.allSettled` (as the current code already does), so a
single failing source degrades exactly one board to an inline error with a retry, and never
blanks the page.

## Data constraints — stated honestly

**1. `/admin/funnel` is not deployed.** The endpoint exists only in uncommitted local
backend code; the admin app talks to `edutu-platform.onrender.com`. Until the backend is
deployed, the Growth board and `/growth` page **must** render a labelled "not yet
available" state on a 404 — the same best-effort pattern `Dashboard.tsx` already uses for
AI usage. This is a deploy dependency, not a bug, and the UI must say which.

**2. There is no daily-revenue endpoint.** `getAdminOverview` returns revenue only as
month / last-30d / total scalars, and `recentTransactions` is hard-capped at
`limit 20` — far too few to bucket into a 30-day series.

Resolution without touching the backend: fetch `listAdminTransactions(200)` and bucket by
day, then **chart only days strictly newer than the oldest returned transaction's day.**
Ordered `created_at desc`, the 200 most recent rows fully cover the most recent N days and
only partially cover the boundary day, so charting past that boundary would silently
under-report. If the covered window is under 7 days, the revenue series is suppressed
entirely and only the scalar KPIs render.

**3. Funnel stage counts undercount across id namespaces.** Recorded in
`AdminFunnelResponse`'s own doc comment: stage matching is `user_id` string equality across
tables that use different id namespaces (Clerk vs profile), so `activated` and `retained`
are undercounted. The Growth board surfaces this as a tooltip on those two stages rather
than presenting the numbers as exact.

**4. `convFromPrev` can exceed 1.0.** Stages are not strict subsets — a user can activate
without completing onboarding. `FunnelBars` must clamp the *bar width* to 100% while
displaying the true percentage, and flag >100% as out-of-order signal rather than
rendering a broken bar.

## UX hints

- `Delta` chips coloured by **good/bad**, not up/down — rising AI cost renders red.
- Live badge counts in the section panel, so waiting work is visible without navigating.
- "Updated Nm ago" plus manual refresh; 60s auto-refresh while the Dashboard is focused,
  paused when the tab is hidden.
- Metric tooltips stating how each number is computed (e.g. "Activated = saved or applied
  to at least one opportunity").
- Threshold colouring: AI spend above 10% of last-30d revenue turns the Money card amber.
- Deep links preserve filter state (review card → `/opportunities?filter=needs-review`).
- Empty states offer an action, not just "No data".
- Keyboard hint (`⌘K`) rendered in the top bar search affordance.

## Images

- Opportunity thumbnails in Recent Activity and the Pipeline board, via the existing
  `metadata.source_image_url` with the established share-card-as-image fallback.
- User avatars in activity rows (`user_metadata.avatar_url`, initials fallback — the
  pattern already in `Layout.tsx`).
- Domain-hue gradient mesh headers on board cards — pure CSS, no assets.
- Inline hue-tinted SVG empty-state illustrations — no asset files, no network requests.

## Verification

1. `npm run lint` — must pass at `--max-warnings 0`.
2. `tsc -p tsconfig.app.json --noEmit` — run backgrounded, takes ~2 minutes on this project.
3. `npm run build`.
4. **Browser QA at 1440 / 1024 / 768 / 390 in both light and dark themes** — the step that
   was skipped on the 2026-07-23 nav rebuild and the reason its defects shipped. Explicitly
   check: no horizontal overflow, no content shift when changing section, mobile sheet
   above the tab bar, safe-area padding, and every board's loading / empty / error state.

## Risks

| Risk | Mitigation |
|---|---|
| Backtick in a `<style>` template literal breaks the build | Eliminated — all shell CSS moves to `.css` files |
| React Compiler `react-hooks/set-state-in-effect` lint failure | Route→panel state stays a pure derivation, as the current code already does. No `setState` in any `useEffect`. |
| Growth board dead on arrival | Explicit 404 state; backend deploy called out as a dependency |
| Revenue chart silently under-reporting | Coverage-boundary guard specified above; series suppressed below a 7-day window |
| Concurrent sessions share this working tree | **Never `git stash`.** Inspect prior state with `git show HEAD:<path>`. |
| Regression in untouched pages | Scope boundary: no page internals edited; shell and tokens only |

## Not doing

- No backend changes.
- No page decomposition.
- No new runtime dependencies.
- No changes to the URL structure established on 2026-07-23.
- No pre-signup / landing-page analytics (out of scope in the 2026-07-22 spec and still).
