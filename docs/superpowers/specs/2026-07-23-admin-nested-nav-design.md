# Admin Nested Navigation — Design

**Date:** 2026-07-23
**Status:** Approved (brainstorming), pending spec review
**Area:** `admin/` (Edutu admin dashboard)

## Problem

The admin sidebar is a flat list of **13 top-level items** and is still growing as
features broaden. The list is approaching "endless scroll" territory, and several
individual pages (Monetization, the Edutu Engine) are single, very long scrolling
pages that pack many distinct functions into one route. This hurts navigation and
discoverability.

## Goal

Introduce a **two-level (nested) navigation system**:

1. Collapse the 13 flat items into **2 top-level items + 6 parent groups**.
2. Split the heavy single-page routes (Monetization, Engine, App Content) into
   **real child routes**, so each function is its own focused screen instead of a
   section buried in a long scroll.
3. Deliver an app-like interaction: opening a group collapses the sidebar to an
   **icon rail** and slides out a **flyout panel** of that group's children.

## Non-Goals

- No changes to page business logic, data fetching, or backend endpoints.
- No visual redesign of the pages themselves — only *which* section renders and how
  the nav looks/behaves.
- No new dependencies (no Tailwind, no animation libs — reuse existing CSS-var
  system and CSS transitions).

## Current State (as-is)

| Concern | File |
|---|---|
| Sidebar + `navItems` array | `admin/src/components/Layout.tsx` (array ~L119–133, render ~L162–178, inline `<style>` ~L278–614) |
| Routes | `admin/src/App.tsx` (`<Route path="/" element={<Layout/>}>` + lazy pages) |
| Theme tokens | `admin/src/index.css` (CSS vars, `[data-theme="dark"]`) |
| Pages | `admin/src/pages/*.tsx` |

- **Styling:** plain CSS with custom properties ("Apple Design System"); sidebar
  styles are an inline `<style>` block in `Layout.tsx`. **No Tailwind.**
- **Routing:** react-router-dom v6; `Layout` renders `<Outlet/>`; pages `lazy()`-loaded.
- **Collapse already exists:** `isSidebarCollapsed` (localStorage `"sidebar"`),
  260px ↔ 72px, label fade, CSS `:hover::after` tooltips, width transition
  `0.3s cubic-bezier(0.4,0,0.2,1)`.
- **Mobile (<768px):** off-canvas drawer (`isMobileMenuOpen`, `mobile-open`).
- **Active state:** `NavLink` `isActive` → `.nav-link.active` (blue pill). Parent
  groups will need `useLocation()` prefix matching (NavLink only tracks leaves).
- **Heavy pages:**
  - `Monetization.tsx` — long stack of `mz-section` cards, no internal tabs.
  - `Scraper.tsx` (route `/edutu-engine`) — ~4,700 lines, discrete panels (sources,
    live runs, engine/DB status), a `viewMode` grid/list toggle.
  - `MobileControl.tsx` (route `/mobile-control`) — **already** has internal
    `activeTab: 'campaigns'|'flags'|'widgets'|'serverUi'|'appControl'`.
- Bottom-of-sidebar utilities (BackendHealthChip, Profile, theme toggle, Sign Out)
  are outside `navItems` and stay untouched.

## Information Architecture (approved)

```
📊 Dashboard                    /                         (top-level)

📁 Content            (FolderOpen)
   ├ Opportunities              /opportunities
   ├ Submissions                /submissions
   ├ Events                     /events
   ├ Roadmaps                   /roadmaps               (folded in; was standalone)
   └ Blog                       /blog

👥 People             (Users)
   ├ Users                      /users
   └ Creators                   /creators

📱 App & Engagement   (Smartphone)
   ├ Home Blocks                /app/home               (was MobileControl serverUi tab)
   ├ Campaigns                  /app/campaigns          (MobileControl campaigns tab)
   ├ Feature Flags              /app/flags              (MobileControl flags tab)
   ├ Widgets                    /app/widgets            (MobileControl widgets tab)
   ├ App Control                /app/control            (MobileControl appControl tab)
   └ Notifications              /notifications

💰 Monetization       (Banknote)
   ├ Overview                   /monetization           (hero stats + subs-by-plan)
   ├ Pricing                    /monetization/pricing   (plans + credit packs + AI costs)
   ├ Transactions               /monetization/transactions
   └ Usage (Voice AI)           /monetization/usage

⚙️ Engine             (Cpu)                              (route base renamed → /engine*)
   ├ Sources                    /engine                 (sources table + run panels)
   ├ Live Runs                  /engine/runs            (SSE logs / progress)
   └ Status                     /engine/status          (engine + DB health)

🔧 Settings                     /settings                (top-level)
```

Decisions baked in:
- Roadmaps folded into **Content** (no one-item group).
- App Content's 5 internal tabs + Notifications merge into **App & Engagement**.
- Engine icon changes from `Settings` → `Cpu` (was colliding with Settings item).

## Interaction & Animation (approved)

- **Default:** full sidebar (260px), 8 entries; parents show a `▸` chevron.
- **Open a group:** clicking a parent collapses the sidebar to the existing **72px
  icon rail** and slides a **~220px flyout** out to its right
  (`translateX` + opacity, ~0.22s). Flyout header = group name with a `‹` to close.
  Children fade in with a subtle stagger. Active parent's rail icon highlighted.
- **Switch:** clicking another parent icon swaps the flyout's children in place.
- **Close / navigate away:** clicking `‹`, or a top-level leaf (Dashboard/Settings),
  restores the full sidebar.
- **Context persistence:** on load/route change, if the path is inside a group
  (e.g. `/monetization/pricing`), that group's flyout auto-opens and the matching
  child is marked active via `useLocation()` prefix match.
- **Manual collapse toggle:** existing collapse button still works; in collapsed
  state, parent icons open the flyout on click (tooltips as today).
- **Mobile (<768px):** flyout doesn't fit → nesting degrades to an **inline
  accordion** inside the existing drawer (tap parent → children expand beneath).

## Implementation Approach (approved)

### 1. `Layout.tsx`
- Replace flat `navItems` with nested shape:
  `{ label, icon, to?, children?: { label, icon?, to }[] }`.
- Render loop handles two cases (leaf `NavLink` vs. parent button).
- Add `openGroup` state (which parent's flyout is shown), derived from
  `useLocation()` on mount and route change.
- Add a `<Flyout>` sub-panel (new markup + CSS in the existing inline `<style>`
  block, using current CSS vars). Add rail/flyout classes; reuse collapse width.
- Change Engine icon to `Cpu`.
- Desktop: rail+flyout. Mobile: accordion branch of the same nested data.

### 2. Heavy-page split — low-churn technique
Each child route mounts the **same existing page component**, which reads the active
section from the URL and renders **only that section's block**. The section blocks
are already discrete JSX; they get wrapped in conditionals. **Data-loading effects
stay as-is** (page still loads all its data on mount — only rendering is gated), so
there is no logic churn and no risk to fetch behavior.

- **`Monetization.tsx`** — derive `section` from `useLocation()`:
  `overview` (default `/monetization`), `pricing`, `transactions`, `usage`.
  Wrap the existing `mz-section` / card blocks so only the active section renders.
  The page header (title + Refresh/Save) stays shared across sections.
- **`Scraper.tsx`** — derive `section`: `sources` (default `/engine`), `runs`,
  `status`. Wrap the corresponding panels in conditionals. The component stays
  mounted across sections, so live-run SSE streams and polling are never
  interrupted by switching sections — hidden sections' effects keep running, which
  matches today's single-page behavior. Only the *rendering* is gated.
- **`MobileControl.tsx`** — initialize `activeTab` from the route (`/app/home` →
  `serverUi`, `/app/campaigns` → `campaigns`, etc.) and keep it synced to the URL.
  **Remove the in-page `.mc-tabs` bar** — the submenu now owns switching (approved:
  single switcher, no duplication).

### 3. `App.tsx`
- Add nested child routes under the existing `<Route path="/" element={<Layout/>}>`.
- Keep all pages `lazy()`-loaded. Add redirects for old paths where they change:
  - `/mobile-control` → `/app/home`
  - `/edutu-engine` → `/engine`
  (Preserve any inbound links / bookmarks.)

## Route Change Map

| Old | New |
|---|---|
| `/mobile-control` | `/app/home` (+ `/app/campaigns`, `/app/flags`, `/app/widgets`, `/app/control`) |
| `/edutu-engine` | `/engine` (+ `/engine/runs`, `/engine/status`) |
| `/monetization` | `/monetization` (unchanged base) + `/monetization/pricing`, `/transactions`, `/usage` |
| all others | unchanged |

## Testing / Guardrails

- Admin CI runs **Lint (`--max-warnings 0`)** and **TypeCheck** — both must stay green.
- Manual verification checklist:
  - Full sidebar renders 8 entries; parents show chevron.
  - Clicking a parent collapses to rail + flyout; children listed; active highlight.
  - Deep-linking `/monetization/pricing` (etc.) auto-opens the group and renders the
    right section only.
  - Old paths (`/mobile-control`, `/edutu-engine`) redirect correctly.
  - Mobile drawer shows accordion nesting.
  - Dark + light themes both correct.
- No unit tests exist for `Layout`; keep it that way unless trivially addable.

## Risks

- **Scraper.tsx size** — the split is the riskiest edit. Mitigation: gate rendering
  by wrapping existing panels in `section === '…'` conditionals rather than
  extracting components; verify the file still type-checks after each panel wrap.
- **Broken bookmarks** — mitigated by redirects for the two renamed base routes.
- **Flyout z-index / overlap** with page content and the mobile drawer — handle in CSS
  with explicit stacking; verify no overlap in collapsed + mobile states.

## Out of Scope / Future

- A "Learning" group if more learning features arrive (Roadmaps currently lives in
  Content).
- Splitting Monetization further (Credits, Payouts) or Engine (Batches) into more
  children — trivial to add later given the section-by-URL pattern.
- Wiring `useKeyboardShortcuts.ts` to nav (exists but unused).
