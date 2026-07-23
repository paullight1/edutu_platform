# Admin Nested Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the admin's flat 13-item sidebar with a two-level nested menu (6 groups + Dashboard/Settings), where opening a group collapses the sidebar to an icon rail and slides out a flyout of children; heavy pages (Monetization, Engine, App Content) split into real child routes.

**Architecture:** Nested `navItems` data in `Layout.tsx` drives a rail+flyout on desktop and an inline accordion on mobile. Child routes reuse the existing page components, which read the active section from the URL and render only that section — no page-logic changes.

**Tech Stack:** React + react-router-dom v6, plain CSS with CSS custom properties (no Tailwind), lucide-react icons.

## Global Constraints

- No new dependencies. Use existing CSS-var tokens (`--bg-secondary`, `--text-secondary`, `--border-light`, `--apple-blue`, etc.) and CSS transitions only.
- Admin CI gates must stay green: `npm run lint` (`--max-warnings 0`) and `npm run typecheck`/`tsc`. Run from `admin/`.
- No changes to data fetching, backend calls, or business logic — only nav structure and which section renders.
- Preserve dark + light themes and the existing mobile drawer behavior.
- Working tree is shared with other sessions: `git add` only the specific files each task touches; never `git add -A`.

---

## File Structure

- `admin/src/components/nav-items.tsx` — **new**: the nested nav data (`NAV`, types, helpers). Extracted so Layout stays focused.
- `admin/src/components/Layout.tsx` — **modify**: consume `NAV`, render rail + flyout + mobile accordion, add flyout state + CSS.
- `admin/src/App.tsx` — **modify**: add child routes + redirects.
- `admin/src/pages/MobileControl.tsx` — **modify**: drive `activeTab` from route, remove in-page tab bar.
- `admin/src/pages/Monetization.tsx` — **modify**: gate section blocks by URL.
- `admin/src/pages/Scraper.tsx` — **modify**: gate top-level blocks by URL section.

---

### Task 1: Nested nav data module

**Files:**
- Create: `admin/src/components/nav-items.tsx`

**Interfaces:**
- Produces:
  - `type NavLeaf = { label: string; to: string; icon?: LucideIcon }`
  - `type NavGroup = { id: string; label: string; icon: LucideIcon; children: NavLeaf[] }`
  - `type NavEntry = ({ kind: 'leaf' } & NavLeaf) | ({ kind: 'group' } & NavGroup)`
  - `const NAV: NavEntry[]`
  - `function groupForPath(pathname: string): string | null` — returns the group `id` whose child route prefix-matches `pathname`, else null.

- [ ] **Step 1: Create the module**

```tsx
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, Target, Inbox, CalendarDays, BookOpen, FileText,
  Users, ShieldCheck, Smartphone, Megaphone, Flag, LayoutTemplate,
  ShieldAlert, BellRing, Banknote, Receipt, Tag, Mic, Cpu, Radio,
  Activity, SlidersHorizontal, FolderOpen,
} from "lucide-react";

export type NavLeaf = { label: string; to: string; icon?: LucideIcon };
export type NavGroup = { id: string; label: string; icon: LucideIcon; children: NavLeaf[] };
export type NavEntry =
  | ({ kind: "leaf" } & NavLeaf & { icon: LucideIcon })
  | ({ kind: "group" } & NavGroup);

export const NAV: NavEntry[] = [
  { kind: "leaf", label: "Dashboard", to: "/", icon: LayoutDashboard },
  {
    kind: "group", id: "content", label: "Content", icon: FolderOpen,
    children: [
      { label: "Opportunities", to: "/opportunities", icon: Target },
      { label: "Submissions", to: "/submissions", icon: Inbox },
      { label: "Events", to: "/events", icon: CalendarDays },
      { label: "Roadmaps", to: "/roadmaps", icon: BookOpen },
      { label: "Blog", to: "/blog", icon: FileText },
    ],
  },
  {
    kind: "group", id: "people", label: "People", icon: Users,
    children: [
      { label: "Users", to: "/users", icon: Users },
      { label: "Creators", to: "/creators", icon: ShieldCheck },
    ],
  },
  {
    kind: "group", id: "app", label: "App & Engagement", icon: Smartphone,
    children: [
      { label: "Home Blocks", to: "/app/home", icon: LayoutTemplate },
      { label: "Campaigns", to: "/app/campaigns", icon: Megaphone },
      { label: "Feature Flags", to: "/app/flags", icon: Flag },
      { label: "Widgets", to: "/app/widgets", icon: Radio },
      { label: "App Control", to: "/app/control", icon: ShieldAlert },
      { label: "Notifications", to: "/notifications", icon: BellRing },
    ],
  },
  {
    kind: "group", id: "money", label: "Monetization", icon: Banknote,
    children: [
      { label: "Overview", to: "/monetization", icon: Banknote },
      { label: "Pricing", to: "/monetization/pricing", icon: Tag },
      { label: "Transactions", to: "/monetization/transactions", icon: Receipt },
      { label: "Usage (Voice AI)", to: "/monetization/usage", icon: Mic },
    ],
  },
  {
    kind: "group", id: "engine", label: "Engine", icon: Cpu,
    children: [
      { label: "Sources", to: "/engine", icon: Cpu },
      { label: "Live Runs", to: "/engine/runs", icon: Radio },
      { label: "Status", to: "/engine/status", icon: Activity },
    ],
  },
  { kind: "leaf", label: "Settings", to: "/settings", icon: SlidersHorizontal },
];

// Longest-prefix match so "/monetization/pricing" beats "/monetization".
export function groupForPath(pathname: string): string | null {
  let best: { id: string; len: number } | null = null;
  for (const entry of NAV) {
    if (entry.kind !== "group") continue;
    for (const child of entry.children) {
      const hit = child.to === "/" ? pathname === "/" : pathname === child.to || pathname.startsWith(child.to + "/");
      if (hit && (!best || child.to.length > best.len)) best = { id: entry.id, len: child.to.length };
    }
  }
  return best?.id ?? null;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd admin && npx tsc -p tsconfig.app.json --noEmit`
Expected: no errors referencing `nav-items.tsx` (unused-import lint comes later once consumed).

- [ ] **Step 3: Commit**

```bash
git add admin/src/components/nav-items.tsx
git commit -m "feat(admin): nested nav data model"
```

---

### Task 2: Layout — rail + flyout + mobile accordion

**Files:**
- Modify: `admin/src/components/Layout.tsx`

**Interfaces:**
- Consumes: `NAV`, `NavEntry`, `groupForPath` from Task 1.

Replace the flat `navItems` array (L119–133) and the `.sidebar-nav` render (L161–179) with group-aware rendering, and add flyout state + styles.

- [ ] **Step 1: Imports + state**

At top, add:
```tsx
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { NAV, type NavEntry, groupForPath } from "./nav-items";
import { ChevronRight as ChevronRightIcon } from "lucide-react";
```
Remove now-unused page-icon imports from the lucide import block (keep `LayoutDashboard`… only if still used elsewhere; the icons now live in `nav-items.tsx`). Keep `Sun, Moon, Menu, X, ChevronLeft, ChevronRight, User, LogOut`.

Inside the component, after existing state:
```tsx
const location = useLocation();
// Which group's flyout is open (desktop). Null = full sidebar.
const [openGroup, setOpenGroup] = useState<string | null>(null);
// Which groups are expanded in the mobile accordion.
const [expanded, setExpanded] = useState<Set<string>>(new Set());

// When the route lands inside a group, open that group's flyout for context.
useEffect(() => {
  const g = groupForPath(location.pathname);
  if (g) setOpenGroup(g);
}, [location.pathname]);

const activeGroup = NAV.find((e) => e.kind === "group" && e.id === openGroup) as
  | Extract<NavEntry, { kind: "group" }>
  | undefined;
const railMode = openGroup !== null;
```

- [ ] **Step 2: Replace the `<nav className="sidebar-nav">` block**

Replace L161–179 with:
```tsx
<nav className="sidebar-nav" aria-label="Primary">
  {NAV.map((entry) => {
    if (entry.kind === "leaf") {
      return (
        <NavLink
          key={entry.to}
          to={entry.to}
          end={entry.to === "/"}
          className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
          onClick={() => {
            setOpenGroup(null);
            setIsMobileMenuOpen(false);
            if (window.innerWidth <= 768) setIsSidebarCollapsed(true);
          }}
          title={entry.label}
        >
          <entry.icon size={18} strokeWidth={1.5} />
          <span className="nav-label">{entry.label}</span>
        </NavLink>
      );
    }
    const isOpen = openGroup === entry.id;
    const isExpanded = expanded.has(entry.id);
    const groupActive = groupForPath(location.pathname) === entry.id;
    return (
      <div key={entry.id} className="nav-group">
        <button
          type="button"
          className={`nav-link nav-parent ${isOpen || groupActive ? "active-parent" : ""}`}
          title={entry.label}
          aria-expanded={isOpen || isExpanded}
          onClick={() => {
            if (window.innerWidth <= 768) {
              setExpanded((prev) => {
                const next = new Set(prev);
                next.has(entry.id) ? next.delete(entry.id) : next.add(entry.id);
                return next;
              });
            } else {
              setOpenGroup((prev) => (prev === entry.id ? null : entry.id));
            }
          }}
        >
          <entry.icon size={18} strokeWidth={1.5} />
          <span className="nav-label">{entry.label}</span>
          <ChevronRightIcon size={15} className="nav-caret" />
        </button>
        {/* Mobile accordion children */}
        {isExpanded && (
          <div className="nav-accordion">
            {entry.children.map((c) => (
              <NavLink
                key={c.to}
                to={c.to}
                end={c.to === "/engine" || c.to === "/monetization"}
                className={({ isActive }) => `nav-link nav-child ${isActive ? "active" : ""}`}
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  if (window.innerWidth <= 768) setIsSidebarCollapsed(true);
                }}
              >
                {c.icon ? <c.icon size={16} strokeWidth={1.5} /> : <span className="nav-dot" />}
                <span className="nav-label">{c.label}</span>
              </NavLink>
            ))}
          </div>
        )}
      </div>
    );
  })}
</nav>
```

- [ ] **Step 3: Add the desktop flyout panel** (render right after the `</aside>`, before `<div className="main-content">`)

```tsx
{railMode && activeGroup && (
  <div className="nav-flyout" role="menu" aria-label={activeGroup.label}>
    <div className="nav-flyout-head">
      <button
        type="button"
        className="nav-flyout-back"
        onClick={() => setOpenGroup(null)}
        title="Close section"
      >
        <ChevronLeft size={16} />
      </button>
      <span>{activeGroup.label}</span>
    </div>
    <div className="nav-flyout-list">
      {activeGroup.children.map((c) => (
        <NavLink
          key={c.to}
          to={c.to}
          end={c.to === "/engine" || c.to === "/monetization"}
          className={({ isActive }) => `nav-flyout-link ${isActive ? "active" : ""}`}
          onClick={() => {
            setIsMobileMenuOpen(false);
            if (window.innerWidth <= 768) setIsSidebarCollapsed(true);
          }}
        >
          {c.icon ? <c.icon size={16} strokeWidth={1.5} /> : <span className="nav-dot" />}
          <span>{c.label}</span>
        </NavLink>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 4: Force the icon-rail when a flyout is open**

Change the `<aside>` className to include rail mode:
```tsx
className={`sidebar ${isSidebarCollapsed || railMode ? "collapsed" : ""} ${railMode ? "rail" : ""} ${isMobileMenuOpen ? "mobile-open" : ""}`}
```

- [ ] **Step 5: Add CSS** (append inside the existing `<style>` block, before the closing backtick)

```css
/* Nested nav */
.nav-parent { width: 100%; justify-content: flex-start; }
.nav-parent .nav-caret { margin-left: auto; opacity: .6; transition: transform .2s, opacity .2s; }
.sidebar.collapsed .nav-parent .nav-caret { opacity: 0; }
.nav-parent.active-parent { color: var(--text-primary); background: var(--bg-tertiary); }
.nav-parent.active-parent .nav-caret { transform: rotate(90deg); }

.nav-accordion { display: flex; flex-direction: column; gap: 2px; margin: 2px 0 4px 0; }
.nav-child { padding-left: 34px; font-size: 13px; }
.nav-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--text-tertiary); flex-shrink: 0; margin: 0 5px; }

/* Desktop flyout sitting flush to the 72px rail */
.nav-flyout {
  position: fixed; top: 0; left: 72px; height: 100vh; width: 220px; z-index: 49;
  background: var(--bg-secondary); border-right: 1px solid var(--border-light);
  box-shadow: 8px 0 24px rgba(0,0,0,0.06);
  display: flex; flex-direction: column; padding: 12px;
  animation: flyoutIn .22s cubic-bezier(0.4,0,0.2,1);
}
[data-theme="dark"] .nav-flyout { box-shadow: 8px 0 24px rgba(0,0,0,0.4); }
@keyframes flyoutIn { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }
.nav-flyout-head {
  display: flex; align-items: center; gap: 8px; padding: 8px 8px 12px;
  font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
  color: var(--text-tertiary); border-bottom: 1px solid var(--border-light); margin-bottom: 8px;
}
.nav-flyout-back {
  display: flex; align-items: center; justify-content: center; width: 26px; height: 26px;
  border: none; background: transparent; color: var(--text-secondary); border-radius: 8px; cursor: pointer;
}
.nav-flyout-back:hover { background: var(--bg-tertiary); color: var(--text-primary); }
.nav-flyout-list { display: flex; flex-direction: column; gap: 4px; overflow-y: auto; }
.nav-flyout-link {
  display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 10px;
  color: var(--text-secondary); text-decoration: none; font-size: 14px; font-weight: 500;
  animation: flyoutChild .28s both;
}
.nav-flyout-link:hover { background: var(--bg-tertiary); color: var(--text-primary); }
.nav-flyout-link.active { background: var(--apple-blue); color: #fff; }
.nav-flyout-link:nth-child(1) { animation-delay: .02s; }
.nav-flyout-link:nth-child(2) { animation-delay: .05s; }
.nav-flyout-link:nth-child(3) { animation-delay: .08s; }
.nav-flyout-link:nth-child(4) { animation-delay: .11s; }
.nav-flyout-link:nth-child(5) { animation-delay: .14s; }
.nav-flyout-link:nth-child(6) { animation-delay: .17s; }
@keyframes flyoutChild { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: translateX(0); } }

/* When the flyout is open, push main content past rail+flyout on desktop */
.sidebar.rail ~ .main-content { margin-left: 292px; }
@media (max-width: 768px) {
  .nav-flyout { display: none; }
  .sidebar.rail ~ .main-content { margin-left: 0; }
  .sidebar.rail { width: 280px; }            /* on mobile, rail mode stays full drawer */
  .sidebar.rail .nav-label { opacity: 1; width: auto; }
  .sidebar.rail .nav-caret { opacity: .6; }
}
```

Note the mobile override: in the drawer we never enter icon-rail; `.sidebar.rail` on mobile keeps labels via the media query above.

- [ ] **Step 6: Typecheck + lint**

Run: `cd admin && npx tsc -p tsconfig.app.json --noEmit && npm run lint`
Expected: PASS, 0 warnings. Fix any unused imports (remove leftover page icons from Layout's lucide import).

- [ ] **Step 7: Commit**

```bash
git add admin/src/components/Layout.tsx
git commit -m "feat(admin): rail + flyout nested sidebar with mobile accordion"
```

---

### Task 3: App.tsx routes + redirects

**Files:**
- Modify: `admin/src/App.tsx:377-393`

**Interfaces:**
- Consumes: existing lazy `Scraper`, `MobileControl`, `Monetization` components (reused for all child routes).

- [ ] **Step 1: Replace the nested `<Route path="/">` children**

```tsx
<Route path="/" element={<Layout />}>
  <Route index element={<Dashboard />} />
  <Route path="dashboard" element={<Navigate to="/" replace />} />
  <Route path="opportunities" element={<Opportunities />} />
  <Route path="submissions" element={<Submissions />} />
  <Route path="events" element={<Events />} />
  <Route path="users" element={<Users />} />
  <Route path="creators" element={<Creators />} />
  <Route path="roadmaps" element={<Roadmaps />} />
  <Route path="blog" element={<Blog />} />
  <Route path="settings" element={<Settings />} />

  {/* Engine (was /edutu-engine) — one component, section by path */}
  <Route path="engine" element={<Scraper />} />
  <Route path="engine/runs" element={<Scraper />} />
  <Route path="engine/status" element={<Scraper />} />
  <Route path="edutu-engine" element={<Navigate to="/engine" replace />} />

  {/* App & Engagement (was /mobile-control) */}
  <Route path="app/home" element={<MobileControl />} />
  <Route path="app/campaigns" element={<MobileControl />} />
  <Route path="app/flags" element={<MobileControl />} />
  <Route path="app/widgets" element={<MobileControl />} />
  <Route path="app/control" element={<MobileControl />} />
  <Route path="mobile-control" element={<Navigate to="/app/home" replace />} />

  {/* Monetization — section by path */}
  <Route path="monetization" element={<Monetization />} />
  <Route path="monetization/pricing" element={<Monetization />} />
  <Route path="monetization/transactions" element={<Monetization />} />
  <Route path="monetization/usage" element={<Monetization />} />

  <Route path="notifications" element={<Notifications />} />
  <Route path="profile" element={<Profile />} />
</Route>
```

- [ ] **Step 2: Typecheck**

Run: `cd admin && npx tsc -p tsconfig.app.json --noEmit`
Expected: PASS. (Pages don't yet read the section — they'll render their full selves until Tasks 4–6. That's fine, non-breaking.)

- [ ] **Step 3: Commit**

```bash
git add admin/src/App.tsx
git commit -m "feat(admin): child routes + legacy redirects for nested nav"
```

---

### Task 4: MobileControl — route-driven tabs, remove in-page tab bar

**Files:**
- Modify: `admin/src/pages/MobileControl.tsx`

**Interfaces:**
- Consumes: route paths `/app/home|campaigns|flags|widgets|control`.

Map path → existing `Tab` union (`'campaigns'|'flags'|'widgets'|'serverUi'|'appControl'`):
`/app/home → serverUi`, `/app/campaigns → campaigns`, `/app/flags → flags`, `/app/widgets → widgets`, `/app/control → appControl`.

- [ ] **Step 1: Derive activeTab from the route**

Add import `import { useLocation } from "react-router-dom";`. Replace the `useState<Tab>('campaigns')` initialization so the tab follows the URL:
```tsx
const location = useLocation();
const tabFromPath = ((): Tab => {
  const p = location.pathname;
  if (p.endsWith("/campaigns")) return "campaigns";
  if (p.endsWith("/flags")) return "flags";
  if (p.endsWith("/widgets")) return "widgets";
  if (p.endsWith("/control")) return "appControl";
  return "serverUi"; // /app/home + fallback
})();
const [activeTab, setActiveTab] = useState<Tab>(tabFromPath);
useEffect(() => { setActiveTab(tabFromPath); }, [tabFromPath]);
```
(Keep `setActiveTab` for any in-page use; ensure `useEffect` is imported.)

- [ ] **Step 2: Remove the in-page `.mc-tabs` nav** (the `<nav className="mc-tabs">…</nav>` block and its `<p className="mc-tab-hint">`). Leave the section panels (`{activeTab === '…' && (…)}`) untouched.

- [ ] **Step 3: Typecheck + lint**

Run: `cd admin && npx tsc -p tsconfig.app.json --noEmit && npm run lint`
Expected: PASS, 0 warnings. Remove any now-unused imports (e.g. `TabButton`, tab-only icons, `TAB_META` if unused).

- [ ] **Step 4: Commit**

```bash
git add admin/src/pages/MobileControl.tsx
git commit -m "feat(admin): route-drive App & Engagement sections"
```

---

### Task 5: Monetization — section by URL

**Files:**
- Modify: `admin/src/pages/Monetization.tsx`

**Interfaces:**
- Consumes: `/monetization` (overview), `/monetization/pricing`, `/transactions`, `/usage`.

Section→blocks (from current render): **overview** = hero stats grid + insights + subs-by-plan; **usage** = the "Usage — Voice AI" `<section>`; **transactions** = the transactions table `<section>` + credits table `<section>`; **pricing** = the pricing header + Subscription plans + Credit packs + AI-costs `EditorCard`s.

- [ ] **Step 1: Derive section**

Add `import { useLocation } from "react-router-dom";` and inside the component:
```tsx
const location = useLocation();
const section: "overview" | "pricing" | "transactions" | "usage" =
  location.pathname.endsWith("/pricing") ? "pricing"
  : location.pathname.endsWith("/transactions") ? "transactions"
  : location.pathname.endsWith("/usage") ? "usage"
  : "overview";
```

- [ ] **Step 2: Gate the blocks** — wrap each top-level block inside the `{overview && (<>…</>)}` fragment with `{section === "…" && (…)}`. Keep the shared page header (title + Refresh/Save) always visible. The hero/insights grid → `overview`; the `Usage — Voice AI` section → `usage`; transactions + credits sections → `transactions`; pricing header + `EditorCard`s → `pricing`.

- [ ] **Step 3: Typecheck + lint**

Run: `cd admin && npx tsc -p tsconfig.app.json --noEmit && npm run lint`
Expected: PASS, 0 warnings.

- [ ] **Step 4: Commit**

```bash
git add admin/src/pages/Monetization.tsx
git commit -m "feat(admin): split Monetization into Overview/Pricing/Transactions/Usage routes"
```

---

### Task 6: Scraper (Engine) — section by URL

**Files:**
- Modify: `admin/src/pages/Scraper.tsx` (render root `<div>` starts L1835; flat sibling blocks marked by `{/* … */}` comments).

**Interfaces:**
- Consumes: `/engine` (sources, default), `/engine/runs`, `/engine/status`.

Block→section mapping (confirm each block's exact bounds while editing; the Header stays always-on):
- **sources** (`/engine`): Header (always) + Scrape Result + Sources Table + Add Source Modal + Run-all review panel.
- **runs** (`/engine/runs`): Recent Jobs + Recent Opportunities + Harvested opportunities.
- **status** (`/engine/status`): the two Stats Grids (engine + DB health) + Automation Settings + Data Retention.

- [ ] **Step 1: Derive section** (inside `ScraperDashboard`, before `return (`)

```tsx
const location = useLocation();
const engineSection: "sources" | "runs" | "status" =
  location.pathname.endsWith("/runs") ? "runs"
  : location.pathname.endsWith("/status") ? "status"
  : "sources";
```
Add `useLocation` to the `react-router-dom` import.

- [ ] **Step 2: Add a tiny sub-nav under the Header** so users see the three views even before opening the flyout (and to keep parity with the mobile drawer):

```tsx
<div className="engine-subnav">
  {(["sources", "runs", "status"] as const).map((s) => (
    <button
      key={s}
      className={engineSection === s ? "active" : ""}
      onClick={() => navigate(s === "sources" ? "/engine" : `/engine/${s}`)}
    >
      {s === "sources" ? "Sources" : s === "runs" ? "Live Runs" : "Status"}
    </button>
  ))}
</div>
```
Add `useNavigate` import and `const navigate = useNavigate();`. Add minimal CSS for `.engine-subnav` in the page's existing `<style>` (pill row using `--bg-tertiary`, `--apple-blue`). Modals (`engineSection`-independent) stay always mounted.

- [ ] **Step 3: Gate blocks** — wrap each contiguous top-level block group with `{engineSection === "…" && (<>…</>)}` per the mapping above. Wrap precisely at the `{/* Comment */}` sibling boundaries; keep the two modal blocks (Run-all review panel, Add Source Modal) outside the gates so they can open from any section.

- [ ] **Step 4: Typecheck + lint**

Run: `cd admin && npx tsc -p tsconfig.app.json --noEmit && npm run lint`
Expected: PASS, 0 warnings.

- [ ] **Step 5: Commit**

```bash
git add admin/src/pages/Scraper.tsx
git commit -m "feat(admin): split Engine into Sources/Live Runs/Status routes"
```

---

### Task 7: Build + manual verification

- [ ] **Step 1: Full build**

Run: `cd admin && npm run build`
Expected: build succeeds.

- [ ] **Step 2: Manual checklist** (dev server `npm run dev`)
  - Full sidebar shows 8 entries; groups show a caret.
  - Clicking a group collapses to the icon rail + flyout with children + stagger; active parent highlighted.
  - Clicking another group swaps the flyout; `‹` restores full sidebar.
  - Deep-link `/monetization/pricing`, `/engine/status`, `/app/flags` → group auto-opens, correct child active, only that section renders.
  - `/mobile-control` → `/app/home`; `/edutu-engine` → `/engine` redirect.
  - Mobile (<768px, drawer): groups expand inline as accordion; children navigate + close drawer.
  - Dark + light both correct; no horizontal overflow; flyout doesn't overlap content.

- [ ] **Step 3: Final commit** (if any checklist fixes)

```bash
git add -p admin/src
git commit -m "fix(admin): nested nav polish from manual QA"
```

---

## Self-Review Notes

- **Spec coverage:** IA (Task 1), rail+flyout+accordion animation (Task 2), routes+redirects (Task 3), heavy-page splits (Tasks 4–6), guardrails/QA (Task 7). All spec sections covered.
- **Engine-icon collision** fixed via `Cpu` in `nav-items.tsx` (Task 1).
- **Context persistence** via `groupForPath` + `useEffect` on `location.pathname` (Task 2).
- **Route rename risk** mitigated by redirects (Task 3).
- **Type consistency:** `Tab` union values reused verbatim in Task 4; `section` string unions local to each page.
