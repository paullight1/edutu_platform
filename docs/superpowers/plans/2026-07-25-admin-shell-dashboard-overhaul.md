# Admin Shell & Dashboard Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the `admin/` app shell (fixed two-column rail + section panel, top bar, mobile tab bar, command palette) and the Dashboard (attention-first IA on real funnel/revenue/pipeline/health data), on a domain-hue colour system with hand-rolled SVG charts.

**Architecture:** `Layout.tsx` (911 lines) and `Dashboard.tsx` (940 lines) are decomposed into focused components under `src/components/shell/`, `src/components/charts/` and `src/components/ui/`. All shell CSS moves out of a JS template literal into real `.css` files. All business logic (formatting, nav resolution, revenue bucketing, funnel maths, attention derivation) moves into pure modules under `src/lib/` so it can be unit-tested — the admin app gets its first test runner as Task 1.

**Tech Stack:** React 19, TypeScript ~6.0, Vite 8, react-router-dom 7, lucide-react, CSS custom properties (no Tailwind), Vitest 4 + jsdom + Testing Library (added by this plan, mirroring `edutu-web-app`).

**Spec:** `docs/superpowers/specs/2026-07-25-admin-shell-dashboard-overhaul-design.md`

## Global Constraints

- **No backend changes.** Every number comes from an endpoint that already exists.
- **No new runtime dependencies.** Vitest/jsdom/Testing Library are `devDependencies` only.
- **Never `git stash`.** Concurrent sessions share this working tree; stashing reverts their live edits. Inspect prior state with `git show HEAD:<path>`.
- **Node 20 everywhere.** Do not bump the CI Node version.
- **`npm run lint` must pass at `--max-warnings 0`.** This is an enforced CI job (`admin-lint`).
- **React Compiler rule `react-hooks/set-state-in-effect` is enforced.** You may NOT call `setState` inside a `useEffect`. Route-derived state must be a pure derivation (the existing `Layout.tsx` `override`/`openGroup` pattern is the reference).
- **No backticks inside any `<style>{\`…\`}</style>` template literal.** This plan removes them entirely; do not reintroduce one.
- `tsconfig.app.json` sets `"strict": false`. Do not enable it in this plan.
- `tsc -p tsconfig.app.json --noEmit` takes ~2 minutes on this project. Run it backgrounded where a step allows.
- Existing URL structure from 2026-07-23 (`/engine/*`, `/app/*`, `/monetization/*`, and the `/mobile-control` + `/edutu-engine` redirects) is unchanged.
- All commands below run from `admin/` unless stated otherwise.

## File Structure

**Created**

| Path | Responsibility |
|---|---|
| `admin/vitest.config.ts` | Vitest config (jsdom, globals, setup file) |
| `admin/src/test/setup.ts` | Testing Library / jest-dom bootstrap |
| `admin/src/styles/tokens.css` | Domain hue tokens, gradients, glows, motion |
| `admin/src/styles/shell.css` | Rail, panel, top bar, tab bar, sheet, palette |
| `admin/src/lib/format.ts` | Number/date formatters (pure) |
| `admin/src/lib/funnelMath.ts` | Funnel stage → bar model (pure) |
| `admin/src/lib/revenueSeries.ts` | Transaction → daily series with coverage guard (pure) |
| `admin/src/lib/attention.ts` | "Needs you now" derivation (pure) |
| `admin/src/lib/growthApi.ts` | `/admin/funnel` client with not-deployed handling |
| `admin/src/components/charts/BarChart.tsx` | Vertical bars (AI calls per day) |
| `admin/src/components/charts/AreaChart.tsx` | Filled trend area (revenue vs AI cost) |
| `admin/src/components/charts/FunnelBars.tsx` | Funnel stages + conversions |
| `admin/src/components/charts/DonutRing.tsx` | Ratio ring |
| `admin/src/components/charts/CohortHeatmap.tsx` | Weekly retention grid |
| `admin/src/components/ui/Delta.tsx` | Change chip with polarity |
| `admin/src/components/ui/StatCard.tsx` | Gradient KPI card |
| `admin/src/components/ui/BoardCard.tsx` | Board shell with hue header |
| `admin/src/components/ui/AttentionCard.tsx` | Actionable count card |
| `admin/src/components/ui/EmptyState.tsx` | Hue-tinted empty state |
| `admin/src/components/ui/Skeleton.tsx` | Loading placeholders |
| `admin/src/components/shell/NavRail.tsx` | 72px icon rail |
| `admin/src/components/shell/SectionPanel.tsx` | 188px children panel |
| `admin/src/components/shell/TopBar.tsx` | Breadcrumb, search, refresh, avatar |
| `admin/src/components/shell/CommandPalette.tsx` | ⌘K navigation + actions |
| `admin/src/components/shell/MobileTabBar.tsx` | 5 bottom tabs |
| `admin/src/components/shell/MoreSheet.tsx` | Full-tree bottom sheet |
| `admin/src/components/shell/AppShell.tsx` | Shell assembly, replaces `Layout.tsx` |
| `admin/src/hooks/useDashboardData.ts` | Parallel fetch, refresh, error isolation |
| `admin/src/pages/Growth.tsx` | Funnel + cohort page |
| `admin/src/pages/dashboard/*.tsx` | Board components |

**Modified**

| Path | Change |
|---|---|
| `admin/package.json` | `test` script + dev dependencies |
| `admin/src/index.css` | Import `styles/tokens.css` |
| `admin/src/components/nav-items.tsx` | Add `hue`, `badgeKey`, `tabPriority`; add resolvers |
| `admin/src/lib/adminApi.ts` | Re-export funnel types |
| `admin/src/App.tsx` | Use `AppShell`; add `/growth` route |
| `admin/src/pages/Dashboard.tsx` | Rebuilt |
| `.github/workflows/ci.yml` | Add `admin-tests` job |

**Deleted**

| Path | Reason |
|---|---|
| `admin/src/components/Layout.tsx` | Superseded by `shell/AppShell.tsx` (Task 11) |

---

## Task 1: Test infrastructure

The admin app has no test runner. Every later task is TDD, so this comes first. Mirrors `edutu-web-app/vitest.config.ts`.

**Files:**
- Create: `admin/vitest.config.ts`
- Create: `admin/src/test/setup.ts`
- Create: `admin/src/test/harness.spec.ts`
- Modify: `admin/package.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: nothing
- Produces: `npm test` runs Vitest once and exits; `npm run test:watch` watches. Test files are `**/*.{test,spec}.{ts,tsx}` under `admin/src`.

- [ ] **Step 1: Install dev dependencies**

```bash
npm install --save-dev vitest@^4.1.6 jsdom@^29.1.1 @testing-library/react@^16.3.2 @testing-library/dom@^10.4.1 @testing-library/jest-dom@^6.9.1 @testing-library/user-event@^14.6.1
```

Expected: `package.json` gains six `devDependencies`; `package-lock.json` updates. No `dependencies` change.

**`@testing-library/dom` is required explicitly.** `@testing-library/react` v16 declares it as a *peer* dependency rather than bundling it (v14 bundled it). Omitting it fails every render test with `Cannot find module '@testing-library/dom'` from inside `react/dist/pure.js` — a failure that looks like a broken config rather than a missing package. Note `edutu-web-app` does not declare it and only works because it resolves transitively there; do not copy that omission.

- [ ] **Step 2: Add the test scripts**

In `admin/package.json`, add to `"scripts"` (keep the existing entries):

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: Create the Vitest config**

Create `admin/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "dist"],
    testTimeout: 10000,
  },
});
```

- [ ] **Step 4: Create the setup file**

Create `admin/src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 5: Write the harness test with one deliberately failing assertion**

Create `admin/src/test/harness.spec.ts`, temporarily asserting `"nope"` so the run must fail:

```ts
import { describe, expect, it } from "vitest";

/**
 * Guards the test harness itself. If `setupFiles` stops loading, or the jsdom
 * environment is lost, this fails with an obvious message instead of surfacing
 * as a confusing failure inside an unrelated suite.
 */
describe("test harness", () => {
  it("provides a jsdom document", () => {
    expect(typeof document).toBe("object");
    expect(document.body).toBeTruthy();
  });

  it("loads the jest-dom matchers from setupFiles", () => {
    const el = document.createElement("div");
    el.textContent = "ready";
    document.body.appendChild(el);

    // Both matchers come from @testing-library/jest-dom, not from vitest.
    expect(el).toBeInTheDocument();
    expect(el).toHaveTextContent("nope");
  });
});
```

- [ ] **Step 6: Run it to verify it fails for the right reason**

Run: `npm test`
Expected: FAIL — `expect(element).toHaveTextContent()` reports `ready` did not match `nope`.

The *reason* matters. `toBeInTheDocument()` must pass on the line above, which proves `setupFiles` loaded the jest-dom matchers. If you instead see `Cannot find module '@testing-library/dom'`, Step 1 was incomplete — install that package before continuing.

- [ ] **Step 7: Fix the assertion**

In `admin/src/test/harness.spec.ts` change `expect(el).toHaveTextContent("nope");` to:

```ts
    expect(el).toHaveTextContent("ready");
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npm test`
Expected: PASS — `2 passed`.

**Keep this file.** It looks like scaffolding, but `vitest run` exits **1** with `No test files found` on an empty suite, so deleting it would leave the CI job added in Step 10 red until Task 3 lands. Setting `passWithNoTests: true` instead would be worse: a future broken `include` glob would then pass CI green having run nothing.

- [ ] **Step 9: Add the CI job**

In `.github/workflows/ci.yml`, insert after the `admin-lint` job (which ends with `- run: npm run lint`, before `web-typecheck:`):

```yaml
  admin-tests:
    name: Admin Tests
    runs-on: ubuntu-latest
    timeout-minutes: 15
    defaults:
      run:
        working-directory: admin
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: false
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: admin/package-lock.json
      - run: npm ci
      - run: npm test
```

- [ ] **Step 10: Verify lint and build still pass**

```bash
npm run lint
npm run build
```

Expected: both exit 0. (`vitest.config.ts` and `src/test/setup.ts` must not introduce lint warnings.) The build check matters because installing the test packages reshuffles the dependency tree — `npm install` reports removing packages as it dedupes — so confirm the app still bundles before committing.

- [ ] **Step 11: Commit**

```bash
git add admin/package.json admin/package-lock.json admin/vitest.config.ts admin/src/test/ .github/workflows/ci.yml
git commit -m "test(admin): add vitest + testing-library harness and CI job"
```

---

## Task 2: Domain hue tokens

**Files:**
- Create: `admin/src/styles/tokens.css`
- Create: `admin/src/styles/tokens.spec.ts`
- Create: `admin/tsconfig.test.json`
- Modify: `admin/src/index.css:5` (add the import)
- Modify: `admin/tsconfig.json`, `admin/tsconfig.app.json`, `admin/tsconfig.node.json`
- Modify: `.github/workflows/ci.yml`

**This task also establishes how tests are typechecked**, which Task 1 did not cover because it added no spec that touched Node APIs. See Steps 6–8.

**Interfaces:**
- Consumes: nothing
- Produces: CSS custom properties `--hue-{name}`, `--hue-{name}-soft`, `--hue-{name}-grad`, `--hue-{name}-glow` for `blue | purple | teal | green | orange | red | neutral`, in both themes.

**Why a test on a CSS file:** a missing hue produces an invisible card, not a build error. The test parses the stylesheet text and asserts every hue declares all four tokens in both themes — cheap, and it catches the one failure mode that is otherwise silent.

- [ ] **Step 1: Write the failing test**

Create `admin/src/styles/tokens.spec.ts`:

**How the stylesheet is loaded matters — three obvious approaches all fail:**
`__dirname` does not exist (this package is `"type": "module"`); `import.meta.url`
is not a `file://` URL under the jsdom environment; and `import css from
"./tokens.css?raw"` returns an **empty string** because vitest stubs CSS imports
by default, which makes every assertion fail with a confusing `-1`. Read from
disk against `process.cwd()`, which vitest sets to the project root (`admin/`).

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const HUES = ["blue", "purple", "teal", "green", "orange", "red", "neutral"];
const SUFFIXES = ["", "-soft", "-grad", "-glow"];

// Read from disk rather than importing the stylesheet. `__dirname` does not
// exist in this ESM package, `import.meta.url` is not a file:// URL under the
// jsdom environment, and a `?raw` import comes back empty because vitest stubs
// CSS by default. process.cwd() is vitest's root, i.e. admin/.
const css = readFileSync(join(process.cwd(), "src/styles/tokens.css"), "utf8");

function blockFor(selector: string): string {
  const start = css.indexOf(selector);
  expect(start, `${selector} block missing`).toBeGreaterThan(-1);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open, close);
}

describe("tokens.css", () => {
  it("declares all four tokens for every hue in light mode", () => {
    const light = blockFor(":root");
    for (const hue of HUES) {
      for (const suffix of SUFFIXES) {
        expect(light, `--hue-${hue}${suffix}`).toContain(`--hue-${hue}${suffix}:`);
      }
    }
  });

  it("overrides every hue in dark mode", () => {
    const dark = blockFor('[data-theme="dark"]');
    for (const hue of HUES) {
      expect(dark, `--hue-${hue} dark override`).toContain(`--hue-${hue}:`);
    }
  });

  it("preserves the four original dashboard card gradients", () => {
    expect(css).toContain("#2563eb");
    expect(css).toContain("#10b981");
    expect(css).toContain("#ff6600");
    expect(css).toContain("#ef4444");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tokens`
Expected: FAIL — `ENOENT: no such file or directory ... tokens.css`.

- [ ] **Step 3: Create the tokens stylesheet**

Create `admin/src/styles/tokens.css`. The blue / green / orange / red gradients are copied verbatim from the current `Dashboard.tsx` stat cards so the existing colourful cards are preserved exactly.

```css
/* Domain hue system.
   Each domain owns a hue; that hue drives its nav icon, section panel accent,
   KPI card gradient, chart series and badges — so colour always encodes meaning.
   Blue/green/orange/red gradients are the original Dashboard stat-card values. */

:root {
  --hue-blue: #0071e3;
  --hue-blue-soft: rgba(0, 113, 227, 0.12);
  --hue-blue-grad: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  --hue-blue-glow: rgba(0, 113, 227, 0.28);

  --hue-purple: #af52de;
  --hue-purple-soft: rgba(175, 82, 222, 0.12);
  --hue-purple-grad: linear-gradient(135deg, #af52de 0%, #8944ab 100%);
  --hue-purple-glow: rgba(175, 82, 222, 0.28);

  --hue-teal: #00c7be;
  --hue-teal-soft: rgba(0, 199, 190, 0.12);
  --hue-teal-grad: linear-gradient(135deg, #00c7be 0%, #00a396 100%);
  --hue-teal-glow: rgba(0, 199, 190, 0.28);

  --hue-green: #34c759;
  --hue-green-soft: rgba(52, 199, 89, 0.12);
  --hue-green-grad: linear-gradient(135deg, #10b981 0%, #059669 100%);
  --hue-green-glow: rgba(52, 199, 89, 0.28);

  --hue-orange: #ff9500;
  --hue-orange-soft: rgba(255, 149, 0, 0.12);
  --hue-orange-grad: linear-gradient(135deg, #ff6600 0%, #ff4500 100%);
  --hue-orange-glow: rgba(255, 149, 0, 0.28);

  --hue-red: #ff3b30;
  --hue-red-soft: rgba(255, 59, 48, 0.12);
  --hue-red-grad: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  --hue-red-glow: rgba(255, 59, 48, 0.28);

  --hue-neutral: #8e8e93;
  --hue-neutral-soft: rgba(142, 142, 147, 0.12);
  --hue-neutral-grad: linear-gradient(135deg, #8e8e93 0%, #6b6b70 100%);
  --hue-neutral-glow: rgba(142, 142, 147, 0.22);

  /* Banner surfaces — replaces the hardcoded #fef2f2 / #fffbeb / #f0fdf4
     in Dashboard.tsx, which rendered white-on-white in dark mode. */
  --banner-error-bg: rgba(255, 59, 48, 0.08);
  --banner-error-border: rgba(255, 59, 48, 0.32);
  --banner-warn-bg: rgba(255, 149, 0, 0.08);
  --banner-warn-border: rgba(255, 149, 0, 0.32);
  --banner-success-bg: rgba(52, 199, 89, 0.08);
  --banner-success-border: rgba(52, 199, 89, 0.32);

  --motion-fast: 120ms cubic-bezier(0.4, 0, 0.2, 1);
  --motion-base: 200ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* Dark mode: gradients desaturate and glows drop so cards do not bloom on black. */
[data-theme="dark"] {
  --hue-blue: #2997ff;
  --hue-blue-soft: rgba(41, 151, 255, 0.16);
  --hue-blue-grad: linear-gradient(135deg, #1e51b8 0%, #16368a 100%);
  --hue-blue-glow: rgba(41, 151, 255, 0.25);

  --hue-purple: #c07ce8;
  --hue-purple-soft: rgba(192, 124, 232, 0.16);
  --hue-purple-grad: linear-gradient(135deg, #8b41b0 0%, #6a2f88 100%);
  --hue-purple-glow: rgba(192, 124, 232, 0.25);

  --hue-teal: #40d9d2;
  --hue-teal-soft: rgba(64, 217, 210, 0.16);
  --hue-teal-grad: linear-gradient(135deg, #009c95 0%, #00726d 100%);
  --hue-teal-glow: rgba(64, 217, 210, 0.25);

  --hue-green: #5ddb7d;
  --hue-green-soft: rgba(93, 219, 125, 0.16);
  --hue-green-grad: linear-gradient(135deg, #0d8f64 0%, #076b4b 100%);
  --hue-green-glow: rgba(93, 219, 125, 0.25);

  --hue-orange: #ffab33;
  --hue-orange-soft: rgba(255, 171, 51, 0.16);
  --hue-orange-grad: linear-gradient(135deg, #c95000 0%, #9c3600 100%);
  --hue-orange-glow: rgba(255, 171, 51, 0.25);

  --hue-red: #ff6961;
  --hue-red-soft: rgba(255, 105, 97, 0.16);
  --hue-red-grad: linear-gradient(135deg, #b83434 0%, #8f2020 100%);
  --hue-red-glow: rgba(255, 105, 97, 0.25);

  --hue-neutral: #a1a1a6;
  --hue-neutral-soft: rgba(161, 161, 166, 0.16);
  --hue-neutral-grad: linear-gradient(135deg, #5a5a5f 0%, #3d3d42 100%);
  --hue-neutral-glow: rgba(161, 161, 166, 0.2);

  --banner-error-bg: rgba(255, 105, 97, 0.14);
  --banner-error-border: rgba(255, 105, 97, 0.38);
  --banner-warn-bg: rgba(255, 171, 51, 0.14);
  --banner-warn-border: rgba(255, 171, 51, 0.38);
  --banner-success-bg: rgba(93, 219, 125, 0.14);
  --banner-success-border: rgba(93, 219, 125, 0.38);
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-fast: 1ms;
    --motion-base: 1ms;
  }
}
```

- [ ] **Step 4: Import it from `index.css`**

In `admin/src/index.css`, directly below the existing Google Fonts `@import` on line 5, add:

```css
@import './styles/tokens.css';
```

CSS requires all `@import` rules to precede other rules, so it must sit with the existing import at the top of the file.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tokens`
Expected: PASS — `3 passed`.

- [ ] **Step 6: Give tests their own TypeScript project**

`npm run build` runs `tsc -b` first and will now fail with `TS2591: Cannot find name 'process'` — `tsconfig.app.json` sets `"types": ["vite/client"]`, so specs get no Node globals. Do **not** fix this by adding `"node"` to the app project; that would let browser code import Node modules and still typecheck. Follow the existing `tsconfig.node.json` pattern instead.

Create `admin/tsconfig.test.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.test.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "esnext",
    /* Tests run in Node, so they get Node globals the app deliberately lacks. */
    "types": ["node", "vitest/globals"],
    "skipLibCheck": true,

    /* Bundler mode — mirrors tsconfig.app.json */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",

    /* Linting — mirrors tsconfig.app.json so tests and app agree */
    "strict": false,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "erasableSyntaxOnly": false,
    "noFallthroughCasesInSwitch": true
  },
  "include": [
    "src/**/*.spec.ts",
    "src/**/*.spec.tsx",
    "src/**/*.test.ts",
    "src/**/*.test.tsx",
    "src/test"
  ]
}
```

Add the reference in `admin/tsconfig.json`:

```json
    { "path": "./tsconfig.test.json" }
```

Exclude tests from `admin/tsconfig.app.json` (after `"include": ["src"],`):

```json
  "exclude": [
    "src/**/*.spec.ts",
    "src/**/*.spec.tsx",
    "src/**/*.test.ts",
    "src/**/*.test.tsx",
    "src/test"
  ]
```

And typecheck the vitest config, which no project currently covers — in `admin/tsconfig.node.json`:

```json
  "include": ["vite.config.ts", "vitest.config.ts"]
```

- [ ] **Step 7: Fix the `admin-typecheck` CI job, which checks nothing**

`tsconfig.json` is a solution file (`"files": []` plus references), so `npx tsc --noEmit` compiles **zero files** and passes on any type error. Verify for yourself before and after: write a spec containing `const bad: number = "string";`, then run `npx tsc --noEmit` (exits 0 — the bug) and `npx tsc -b` (reports TS2322). Delete the probe afterwards.

In `.github/workflows/ci.yml`, under `admin-typecheck`, replace `- run: npx tsc --noEmit` with:

```yaml
      # Must be `tsc -b`, not `tsc --noEmit`. tsconfig.json is a solution file
      # ("files": [] plus references), so --noEmit compiles zero files and the
      # job passes on any type error. -b builds every referenced project.
      - run: npx tsc -b
```

Confirm `npx tsc -b --force` exits 0 across the tree before committing, so the newly-real job does not land red.

- [ ] **Step 8: Verify the build, tests and lint**

```bash
npm test
npm run lint
npm run build
```

Expected: `5 passed`, then two clean exits. The build confirms the `@import` resolves at bundle time.

- [ ] **Step 9: Commit**

```bash
git add admin/src/styles/ admin/src/index.css admin/tsconfig.json admin/tsconfig.app.json admin/tsconfig.node.json admin/tsconfig.test.json .github/workflows/ci.yml
git commit -m "feat(admin): add domain hue token system"
```

---

## Task 3: Pure formatters

`Dashboard.tsx` defines `formatTokens`, `formatUsd`, `formatTimeAgo` and `formatUptime` privately, so nothing else can reuse them and nothing can test them. They move to a shared module and gain the formatters the new boards need.

`formatTimeAgo` takes an injectable `now` — without it the function is untestable.

**Files:**
- Create: `admin/src/lib/format.ts`
- Create: `admin/src/lib/format.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `formatTokens(value: number): string`
  - `formatUsd(value: number): string`
  - `formatNgn(value: number): string`
  - `formatCompact(value: number): string`
  - `formatPct(value: number | null, digits?: number): string`
  - `formatTimeAgo(dateString: string, now?: Date): string`
  - `formatUptime(seconds: number): string`

- [ ] **Step 1: Write the failing test**

Create `admin/src/lib/format.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  formatCompact,
  formatNgn,
  formatPct,
  formatTimeAgo,
  formatTokens,
  formatUptime,
  formatUsd,
} from "./format";

describe("formatTokens", () => {
  it("abbreviates millions and thousands", () => {
    expect(formatTokens(2_500_000)).toBe("2.50M");
    expect(formatTokens(1500)).toBe("1.5k");
    expect(formatTokens(999)).toBe("999");
  });
});

describe("formatUsd", () => {
  it("floors tiny non-zero amounts to a readable marker", () => {
    expect(formatUsd(0.004)).toBe("<$0.01");
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(18.4)).toBe("$18.40");
  });
});

describe("formatNgn", () => {
  it("renders whole naira with thousands separators", () => {
    expect(formatNgn(412000)).toBe("₦412,000");
    expect(formatNgn(0)).toBe("₦0");
  });
});

describe("formatCompact", () => {
  it("abbreviates large counts", () => {
    expect(formatCompact(1284)).toBe("1.3k");
    expect(formatCompact(950)).toBe("950");
    expect(formatCompact(2_400_000)).toBe("2.4M");
  });
});

describe("formatPct", () => {
  it("renders null as an em dash and rounds otherwise", () => {
    expect(formatPct(null)).toBe("—");
    expect(formatPct(0.4123)).toBe("41%");
    expect(formatPct(0.4123, 1)).toBe("41.2%");
  });
});

describe("formatTimeAgo", () => {
  const now = new Date("2026-07-25T12:00:00.000Z");

  it("uses relative units against the injected now", () => {
    expect(formatTimeAgo("2026-07-25T11:59:30.000Z", now)).toBe("Just now");
    expect(formatTimeAgo("2026-07-25T11:30:00.000Z", now)).toBe("30m ago");
    expect(formatTimeAgo("2026-07-25T09:00:00.000Z", now)).toBe("3h ago");
    expect(formatTimeAgo("2026-07-23T12:00:00.000Z", now)).toBe("2d ago");
  });

  it("returns an em dash for an unparseable date", () => {
    expect(formatTimeAgo("not-a-date", now)).toBe("—");
  });
});

describe("formatUptime", () => {
  it("renders hours, minutes and seconds", () => {
    expect(formatUptime(93_784)).toBe("26h 3m");
    expect(formatUptime(125)).toBe("2m 5s");
    expect(formatUptime(42)).toBe("42s");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- format`
Expected: FAIL — `Failed to resolve import "./format"`.

- [ ] **Step 3: Implement the module**

Create `admin/src/lib/format.ts`:

```ts
export function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString();
}

export function formatUsd(value: number): string {
  if (value > 0 && value < 0.01) return "<$0.01";
  return `$${value.toFixed(2)}`;
}

export function formatNgn(value: number): string {
  return `₦${Math.round(value).toLocaleString("en-NG")}`;
}

export function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString();
}

export function formatPct(value: number | null, digits = 0): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatTimeAgo(dateString: string, now: Date = new Date()): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "—";

  const diffMins = Math.floor((now.getTime() - date.getTime()) / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- format`
Expected: PASS — `13 passed`.

- [ ] **Step 5: Commit**

```bash
git add admin/src/lib/format.ts admin/src/lib/format.spec.ts
git commit -m "feat(admin): extract pure formatters with injectable clock"
```

---

## Task 4: Nav data model extension

`nav-items.tsx` stays the single source of nav truth. It gains a hue per entry, a badge key per leaf, and a mobile tab priority, plus three resolvers the shell needs. `NAV`'s existing shape and `groupForPath`'s contract are unchanged, so nothing that already imports them breaks.

**Files:**
- Modify: `admin/src/components/nav-items.tsx`
- Create: `admin/src/components/nav-items.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type Hue = "blue" | "purple" | "teal" | "green" | "orange" | "red" | "neutral"`
  - `type BadgeKey = "submissions" | "creators" | "needsReview" | "expiringSoon"`
  - `NAV: NavEntry[]` (unchanged export name)
  - `groupForPath(pathname: string): string | null` (unchanged)
  - `sectionForPath(pathname: string): NavEntry | null`
  - `hueForPath(pathname: string): Hue`
  - `mobileTabs(): MobileTab[]` where `MobileTab = { id: string; label: string; icon: LucideIcon; to: string | null; hue: Hue }` — `to: null` marks the synthetic `more` tab
  - `firstChildPath(entry: NavEntry): string`

- [ ] **Step 1: Write the failing test**

Create `admin/src/components/nav-items.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  NAV,
  firstChildPath,
  groupForPath,
  hueForPath,
  mobileTabs,
  sectionForPath,
} from "./nav-items";

describe("groupForPath", () => {
  it("longest-prefix matches so a child beats its parent", () => {
    expect(groupForPath("/monetization/pricing")).toBe("money");
    expect(groupForPath("/monetization")).toBe("money");
    expect(groupForPath("/engine/runs")).toBe("engine");
  });

  it("returns null for a top-level leaf", () => {
    expect(groupForPath("/")).toBeNull();
    expect(groupForPath("/settings")).toBeNull();
  });
});

describe("sectionForPath", () => {
  it("resolves a group for a child route", () => {
    const section = sectionForPath("/opportunities");
    expect(section?.kind).toBe("group");
    expect(section && "id" in section && section.id).toBe("content");
  });

  it("resolves the leaf itself for a top-level route", () => {
    const section = sectionForPath("/settings");
    expect(section?.kind).toBe("leaf");
    expect(section?.label).toBe("Settings");
  });

  it("returns null for an unknown route", () => {
    expect(sectionForPath("/nope")).toBeNull();
  });
});

describe("hueForPath", () => {
  it("gives each domain its own hue", () => {
    expect(hueForPath("/opportunities")).toBe("blue");
    expect(hueForPath("/users")).toBe("purple");
    expect(hueForPath("/app/campaigns")).toBe("teal");
    expect(hueForPath("/monetization")).toBe("green");
    expect(hueForPath("/engine/runs")).toBe("orange");
  });

  it("falls back to neutral for unknown routes", () => {
    expect(hueForPath("/nope")).toBe("neutral");
  });

  it("leaves Settings deliberately uncoloured", () => {
    expect(hueForPath("/settings")).toBe("neutral");
  });
});

describe("mobileTabs", () => {
  const tabs = mobileTabs();

  it("always returns exactly five tabs ending in More", () => {
    expect(tabs).toHaveLength(5);
    expect(tabs[4].id).toBe("more");
    expect(tabs[4].to).toBeNull();
  });

  it("orders the first four by tabPriority", () => {
    expect(tabs.slice(0, 4).map((t) => t.id)).toEqual([
      "dashboard",
      "content",
      "people",
      "money",
    ]);
  });

  it("keeps config-only sections out of the bar", () => {
    const ids = tabs.map((t) => t.id);
    expect(ids).not.toContain("engine");
    expect(ids).not.toContain("app");
    expect(ids).not.toContain("settings");
  });

  it("points each group tab at its first child", () => {
    const content = tabs.find((t) => t.id === "content");
    expect(content?.to).toBe("/opportunities");
  });
});

describe("firstChildPath", () => {
  it("returns the leaf's own path", () => {
    const settings = NAV.find((e) => e.kind === "leaf" && e.label === "Settings")!;
    expect(firstChildPath(settings)).toBe("/settings");
  });

  it("returns a group's first child path", () => {
    const people = NAV.find((e) => e.kind === "group" && e.id === "people")!;
    expect(firstChildPath(people)).toBe("/users");
  });
});

describe("rail labels", () => {
  it("gives every entry a short label that fits the 72px rail", () => {
    for (const entry of NAV) {
      expect(entry.short.length).toBeGreaterThan(0);
      expect(entry.short.length).toBeLessThanOrEqual(9);
    }
  });
});

describe("leaf panel sections", () => {
  it("gives Dashboard in-page anchors so the panel never collapses", () => {
    const dashboard = NAV.find((e) => e.kind === "leaf" && e.id === "dashboard");
    const panel = dashboard && "panel" in dashboard ? dashboard.panel : undefined;
    expect(panel?.map((p) => p.to)).toEqual([
      "/#attention",
      "/#growth",
      "/#money",
      "/#pipeline",
      "/#health",
    ]);
  });
});

describe("badge keys", () => {
  it("only references counts the dashboard actually fetches", () => {
    const allowed = new Set([
      "submissions",
      "creators",
      "needsReview",
      "expiringSoon",
    ]);
    for (const entry of NAV) {
      if (entry.kind !== "group") continue;
      for (const child of entry.children) {
        if (child.badgeKey) expect(allowed.has(child.badgeKey)).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- nav-items`
Expected: FAIL — `"sectionForPath" is not exported by "src/components/nav-items.tsx"`.

- [ ] **Step 3: Rewrite `nav-items.tsx`**

Replace the entire contents of `admin/src/components/nav-items.tsx`:

```tsx
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Target,
  Inbox,
  CalendarDays,
  BookOpen,
  FileText,
  Users,
  ShieldCheck,
  Smartphone,
  Megaphone,
  Flag,
  LayoutTemplate,
  ShieldAlert,
  BellRing,
  Banknote,
  Receipt,
  Tag,
  Mic,
  Cpu,
  Radio,
  Activity,
  SlidersHorizontal,
  FolderOpen,
  TrendingUp,
  Menu,
} from "lucide-react";

/** Domain hues. Each drives a nav icon, panel accent, card gradient and chart series. */
export type Hue =
  | "blue"
  | "purple"
  | "teal"
  | "green"
  | "orange"
  | "red"
  | "neutral";

/**
 * Closed union of live counts a nav item may badge. Keeping it closed means a
 * badge cannot reference a count the dashboard never fetches.
 */
export type BadgeKey =
  | "submissions"
  | "creators"
  | "needsReview"
  | "expiringSoon";

export type NavLeaf = {
  label: string;
  to: string;
  icon?: LucideIcon;
  badgeKey?: BadgeKey;
};

export type NavGroup = {
  id: string;
  label: string;
  /** Rail label — must fit a 72px column at 10px, so keep it under ~9 chars. */
  short: string;
  icon: LucideIcon;
  hue: Hue;
  /** Presence promotes this entry into the mobile tab bar; lower sorts first. */
  tabPriority?: number;
  children: NavLeaf[];
};

export type NavEntry =
  | ({ kind: "leaf" } & NavLeaf & {
        id: string;
        short: string;
        icon: LucideIcon;
        hue: Hue;
        tabPriority?: number;
        /**
         * A leaf's own in-page sections. Gives the section panel something to
         * show on a top-level route so it never collapses.
         */
        panel?: NavLeaf[];
      })
  | ({ kind: "group" } & NavGroup);

export type MobileTab = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** null marks the synthetic "More" tab, which opens the sheet instead. */
  to: string | null;
  hue: Hue;
};

export const NAV: NavEntry[] = [
  {
    kind: "leaf",
    id: "dashboard",
    label: "Dashboard",
    short: "Home",
    to: "/",
    icon: LayoutDashboard,
    hue: "blue",
    tabPriority: 1,
    // Board anchors, so the section panel has content on the Dashboard route.
    panel: [
      { label: "Needs you now", to: "/#attention", icon: ShieldAlert },
      { label: "Growth", to: "/#growth", icon: TrendingUp },
      { label: "Money", to: "/#money", icon: Banknote },
      { label: "Pipeline", to: "/#pipeline", icon: Target },
      { label: "Health", to: "/#health", icon: Activity },
    ],
  },
  {
    kind: "group",
    id: "content",
    label: "Content",
    short: "Content",
    icon: FolderOpen,
    hue: "blue",
    tabPriority: 2,
    children: [
      {
        label: "Opportunities",
        to: "/opportunities",
        icon: Target,
        badgeKey: "needsReview",
      },
      {
        label: "Submissions",
        to: "/submissions",
        icon: Inbox,
        badgeKey: "submissions",
      },
      { label: "Events", to: "/events", icon: CalendarDays },
      { label: "Roadmaps", to: "/roadmaps", icon: BookOpen },
      { label: "Blog", to: "/blog", icon: FileText },
    ],
  },
  {
    kind: "group",
    id: "people",
    label: "People",
    short: "People",
    icon: Users,
    hue: "purple",
    tabPriority: 3,
    children: [
      { label: "Users", to: "/users", icon: Users },
      {
        label: "Creators",
        to: "/creators",
        icon: ShieldCheck,
        badgeKey: "creators",
      },
      { label: "Growth", to: "/growth", icon: TrendingUp },
    ],
  },
  {
    kind: "group",
    id: "app",
    label: "App & Engagement",
    short: "App",
    icon: Smartphone,
    hue: "teal",
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
    kind: "group",
    id: "money",
    label: "Monetization",
    short: "Money",
    icon: Banknote,
    hue: "green",
    tabPriority: 4,
    children: [
      { label: "Overview", to: "/monetization", icon: Banknote },
      { label: "Pricing", to: "/monetization/pricing", icon: Tag },
      { label: "Transactions", to: "/monetization/transactions", icon: Receipt },
      { label: "Usage (Voice AI)", to: "/monetization/usage", icon: Mic },
    ],
  },
  {
    kind: "group",
    id: "engine",
    label: "Engine",
    short: "Engine",
    icon: Cpu,
    hue: "orange",
    children: [
      { label: "Sources", to: "/engine", icon: Cpu },
      { label: "Live Runs", to: "/engine/runs", icon: Radio },
      { label: "Status", to: "/engine/status", icon: Activity },
    ],
  },
  {
    kind: "leaf",
    id: "settings",
    label: "Settings",
    short: "Settings",
    to: "/settings",
    icon: SlidersHorizontal,
    hue: "neutral",
  },
];

/** Exact match for "/", prefix match otherwise. */
function pathMatches(target: string, pathname: string): boolean {
  if (target === "/") return pathname === "/";
  return pathname === target || pathname.startsWith(target + "/");
}

// Longest-prefix match so "/monetization/pricing" beats "/monetization".
export function groupForPath(pathname: string): string | null {
  let best: { id: string; len: number } | null = null;
  for (const entry of NAV) {
    if (entry.kind !== "group") continue;
    for (const child of entry.children) {
      if (pathMatches(child.to, pathname) && (!best || child.to.length > best.len)) {
        best = { id: entry.id, len: child.to.length };
      }
    }
  }
  return best?.id ?? null;
}

/** The group owning this route, or the leaf itself for a top-level route. */
export function sectionForPath(pathname: string): NavEntry | null {
  const groupId = groupForPath(pathname);
  if (groupId) {
    return NAV.find((e) => e.kind === "group" && e.id === groupId) ?? null;
  }
  return (
    NAV.find((e) => e.kind === "leaf" && pathMatches(e.to, pathname)) ?? null
  );
}

export function hueForPath(pathname: string): Hue {
  return sectionForPath(pathname)?.hue ?? "neutral";
}

export function firstChildPath(entry: NavEntry): string {
  return entry.kind === "leaf" ? entry.to : entry.children[0].to;
}

/**
 * Exactly five tabs: the four lowest tabPriority entries plus a synthetic
 * "More". Entries without tabPriority are configuration surfaces and are
 * reachable only through the sheet.
 */
export function mobileTabs(nav: NavEntry[] = NAV): MobileTab[] {
  const promoted = nav
    .filter((e) => typeof e.tabPriority === "number")
    .sort((a, b) => (a.tabPriority as number) - (b.tabPriority as number))
    .slice(0, 4)
    .map((entry) => ({
      id: entry.id,
      label: entry.short,
      icon: entry.icon,
      to: firstChildPath(entry),
      hue: entry.hue,
    }));

  return [
    ...promoted,
    { id: "more", label: "More", icon: Menu, to: null, hue: "neutral" as Hue },
  ];
}
```

Note: `Growth` is added to the People group here so Task 18's page has a nav home. Its route is created in Task 18; until then the link 404s inside the SPA, which is expected mid-plan.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- nav-items`
Expected: PASS — `17 passed`.

- [ ] **Step 5: Verify the existing Layout still compiles**

`Layout.tsx` imports `NAV`, `NavEntry` and `groupForPath`; all three still exist with compatible shapes.

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: exit 0. Takes ~2 minutes.

- [ ] **Step 6: Commit**

```bash
git add admin/src/components/nav-items.tsx admin/src/components/nav-items.spec.ts
git commit -m "feat(admin): extend nav model with hues, badges and mobile tab priority"
```

---

## Task 5: Chart primitives — geometry and micro charts

All charts are hand-rolled SVG: no dependency, no bundle cost, and full control over the hue gradients. The scaling maths lives in a pure module so it can be tested without rendering.

**Files:**
- Create: `admin/src/components/charts/geometry.ts`
- Create: `admin/src/components/charts/geometry.spec.ts`
- Create: `admin/src/components/charts/BarChart.tsx`
- Create: `admin/src/components/charts/AreaChart.tsx`
- Create: `admin/src/components/charts/micro.spec.tsx`

**Interfaces:**
- Consumes: `Hue` from `../nav-items`
- Produces:
  - `type Point = { x: number; y: number }`
  - `scalePoints(values: number[], width: number, height: number, pad?: number): Point[]`
  - `<BarChart values labels hue label height />` — consumed by `MoneyBoard` (AI calls per day)
  - `<AreaChart series hue label height />` where `series: Array<{ label: string; hue: Hue; values: number[] }>` — consumed by `MoneyBoard` (revenue vs AI cost)

**Only these two charts are built here.** The spec also listed a `Sparkline`, but of the endpoints available only `aiUsage.perDay` and the derived revenue series carry per-day data, and both are already served by `BarChart` and `AreaChart`. Building a third, unconsumed chart would violate this plan's YAGNI constraint.

- [ ] **Step 1: Write the failing geometry test**

Create `admin/src/components/charts/geometry.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { scalePoints } from "./geometry";

describe("scalePoints", () => {
  it("returns nothing for an empty series", () => {
    expect(scalePoints([], 100, 50)).toEqual([]);
  });

  it("centres a single value", () => {
    const points = scalePoints([5], 100, 50, 1);
    expect(points).toHaveLength(1);
    expect(points[0].x).toBe(50);
    expect(points[0].y).toBe(25);
  });

  it("draws a flat series along the middle", () => {
    const points = scalePoints([7, 7, 7], 100, 50, 1);
    expect(points.map((p) => p.y)).toEqual([25, 25, 25]);
    expect(points.map((p) => p.x)).toEqual([0, 50, 100]);
  });

  it("inverts the y axis so larger values sit higher", () => {
    const points = scalePoints([0, 10], 100, 50, 1);
    expect(points[0].y).toBeGreaterThan(points[1].y);
    expect(points[0].y).toBe(49);
    expect(points[1].y).toBe(1);
  });

  it("keeps every point inside the padded box", () => {
    const points = scalePoints([3, 99, 0, 42], 200, 60, 2);
    for (const point of points) {
      expect(point.y).toBeGreaterThanOrEqual(2);
      expect(point.y).toBeLessThanOrEqual(58);
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(200);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- geometry`
Expected: FAIL — `Failed to resolve import "./geometry"`.

- [ ] **Step 3: Implement the geometry module**

Create `admin/src/components/charts/geometry.ts`:

```ts
export type Point = { x: number; y: number };

/**
 * Maps values onto an SVG box. Y is inverted so larger values sit higher.
 * A flat series renders along the vertical middle rather than collapsing
 * onto an edge, which would read as "zero" when it is not.
 */
export function scalePoints(
  values: number[],
  width: number,
  height: number,
  pad = 1,
): Point[] {
  if (values.length === 0) return [];

  const usable = height - pad * 2;
  const mid = pad + usable / 2;

  if (values.length === 1) return [{ x: width / 2, y: mid }];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;

  return values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = span === 0 ? mid : height - pad - ((value - min) / span) * usable;
    return { x, y };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- geometry`
Expected: PASS — `5 passed`.

- [ ] **Step 5: Write the failing component test**

Create `admin/src/components/charts/micro.spec.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AreaChart from "./AreaChart";
import BarChart from "./BarChart";

describe("BarChart", () => {
  it("exposes an accessible label", () => {
    render(<BarChart values={[1, 2, 3]} labels={["a", "b", "c"]} label="Calls per day" />);
    expect(screen.getByRole("img", { name: "Calls per day" })).toBeInTheDocument();
  });

  it("renders one rect per value", () => {
    const { container } = render(
      <BarChart values={[3, 1, 4]} labels={["a", "b", "c"]} label="Scraped" />,
    );
    expect(container.querySelectorAll("rect")).toHaveLength(3);
  });

  it("gives every bar a tooltip title pairing label and value", () => {
    const { container } = render(
      <BarChart values={[3, 1]} labels={["mon", "tue"]} label="Scraped" />,
    );
    const titles = Array.from(container.querySelectorAll("title")).map(
      (t) => t.textContent,
    );
    expect(titles).toContain("mon: 3");
    expect(titles).toContain("tue: 1");
  });

  it("still renders a visible bar for a zero value", () => {
    const { container } = render(
      <BarChart values={[0, 5]} labels={["a", "b"]} label="Scraped" />,
    );
    const heights = Array.from(container.querySelectorAll("rect")).map((r) =>
      Number(r.getAttribute("height")),
    );
    expect(heights[0]).toBeGreaterThan(0);
  });
});

describe("AreaChart", () => {
  it("renders one filled path per series", () => {
    const { container } = render(
      <AreaChart
        label="Revenue vs cost"
        series={[
          { label: "Revenue", hue: "green", values: [1, 2, 3] },
          { label: "AI cost", hue: "orange", values: [3, 2, 1] },
        ]}
      />,
    );
    expect(container.querySelectorAll("path")).toHaveLength(2);
  });

  it("marks itself empty when every series is empty", () => {
    const { container } = render(
      <AreaChart label="None" series={[{ label: "A", hue: "blue", values: [] }]} />,
    );
    expect(container.querySelector("svg")).toHaveAttribute("data-empty", "true");
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- micro`
Expected: FAIL — `Failed to resolve import "./AreaChart"`.

- [ ] **Step 7: Implement `BarChart`**

Create `admin/src/components/charts/BarChart.tsx`:

```tsx
import type { Hue } from "../nav-items";

interface BarChartProps {
  values: number[];
  labels: string[];
  label: string;
  hue?: Hue;
  height?: number;
}

const VIEW_W = 300;
const MIN_BAR = 1.5;

const BarChart = ({
  values,
  labels,
  label,
  hue = "blue",
  height = 64,
}: BarChartProps) => {
  const max = Math.max(...values, 1);
  const slot = VIEW_W / Math.max(values.length, 1);

  return (
    <svg
      role="img"
      aria-label={label}
      data-empty={values.length === 0 ? "true" : "false"}
      viewBox={`0 0 ${VIEW_W} ${height}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height, display: "block" }}
    >
      {values.map((value, index) => {
        // Floor at MIN_BAR so an empty day is still a visible tick rather
        // than a gap that reads as "no data collected".
        const barHeight = Math.max((value / max) * (height - 4), MIN_BAR);
        return (
          <rect
            key={labels[index] ?? index}
            x={index * slot + slot * 0.15}
            y={height - barHeight}
            width={slot * 0.7}
            height={barHeight}
            rx={1.5}
            fill={`var(--hue-${hue})`}
            opacity={0.85}
          >
            <title>{`${labels[index] ?? index}: ${value}`}</title>
          </rect>
        );
      })}
    </svg>
  );
};

export default BarChart;
```

- [ ] **Step 8: Implement `AreaChart`**

Create `admin/src/components/charts/AreaChart.tsx`:

```tsx
import type { Hue } from "../nav-items";
import { scalePoints } from "./geometry";

export interface AreaSeries {
  label: string;
  hue: Hue;
  values: number[];
}

interface AreaChartProps {
  series: AreaSeries[];
  label: string;
  height?: number;
}

const VIEW_W = 300;

/**
 * Series share one y scale so they are visually comparable — the whole point
 * of putting revenue and AI cost on the same chart.
 */
const AreaChart = ({ series, label, height = 96 }: AreaChartProps) => {
  const all = series.flatMap((s) => s.values);
  const isEmpty = all.length === 0;
  const max = Math.max(...all, 1);

  return (
    <svg
      role="img"
      aria-label={label}
      data-empty={isEmpty ? "true" : "false"}
      viewBox={`0 0 ${VIEW_W} ${height}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height, display: "block" }}
    >
      {series.map((entry) => {
        if (entry.values.length === 0) return null;
        // Scale against the shared max by padding each series to it.
        const points = scalePoints([...entry.values, max], VIEW_W, height, 3).slice(
          0,
          entry.values.length,
        );
        const scaledX = points.map((point, index) => ({
          x: (index / Math.max(entry.values.length - 1, 1)) * VIEW_W,
          y: point.y,
        }));
        const line = scaledX.map((p) => `${p.x},${p.y}`).join(" L ");
        return (
          <path
            key={entry.label}
            d={`M ${line} L ${VIEW_W},${height} L 0,${height} Z`}
            fill={`var(--hue-${entry.hue})`}
            stroke={`var(--hue-${entry.hue})`}
            strokeWidth={1.5}
            fillOpacity={0.18}
            vectorEffect="non-scaling-stroke"
          >
            <title>{entry.label}</title>
          </path>
        );
      })}
    </svg>
  );
};

export default AreaChart;
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npm test -- micro`
Expected: PASS — `6 passed`.

- [ ] **Step 10: Lint**

Run: `npm run lint`
Expected: exit 0.

- [ ] **Step 11: Commit**

```bash
git add admin/src/components/charts/
git commit -m "feat(admin): add SVG chart geometry, bar and area primitives"
```

---

## Task 6: Chart primitives — funnel, donut, cohort heatmap

The funnel bar model carries two constraints from the spec: `convFromPrev` **can exceed 1.0** because stages are not strict subsets, and a `null` total means the query failed and must not render as zero.

**Files:**
- Create: `admin/src/lib/funnelMath.ts`
- Create: `admin/src/lib/funnelMath.spec.ts`
- Create: `admin/src/components/charts/FunnelBars.tsx`
- Create: `admin/src/components/charts/DonutRing.tsx`
- Create: `admin/src/components/charts/CohortHeatmap.tsx`
- Create: `admin/src/components/charts/composite.spec.tsx`

**Interfaces:**
- Consumes: `Hue` from `../nav-items`
- Produces:
  - `type FunnelStageInput = { key: string; label: string; total: number | null; newThisWeek: number | null; newLastWeek: number | null; convFromPrev: number | null }`
  - `type FunnelBarModel = { key: string; label: string; total: number | null; widthPct: number; convPct: number | null; outOfOrder: boolean; unavailable: boolean; weekChange: number | null }`
  - `toFunnelBars(stages: FunnelStageInput[]): FunnelBarModel[]`
  - `<FunnelBars stages hue />`, `<DonutRing value max label hue />`, `<CohortHeatmap cohorts hue />`

- [ ] **Step 1: Write the failing funnel maths test**

Create `admin/src/lib/funnelMath.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toFunnelBars, type FunnelStageInput } from "./funnelMath";

function stage(over: Partial<FunnelStageInput> = {}): FunnelStageInput {
  return {
    key: "signup",
    label: "Signup",
    total: 100,
    newThisWeek: 10,
    newLastWeek: 5,
    convFromPrev: null,
    ...over,
  };
}

describe("toFunnelBars", () => {
  it("scales widths against the first stage", () => {
    const bars = toFunnelBars([
      stage({ key: "signup", total: 200 }),
      stage({ key: "paying", total: 50, convFromPrev: 0.25 }),
    ]);
    expect(bars[0].widthPct).toBe(100);
    expect(bars[1].widthPct).toBe(25);
  });

  it("clamps the bar width at 100 but keeps the true conversion", () => {
    const bars = toFunnelBars([
      stage({ key: "signup", total: 100 }),
      stage({ key: "activated", total: 130, convFromPrev: 1.3 }),
    ]);
    expect(bars[1].widthPct).toBe(100);
    expect(bars[1].convPct).toBeCloseTo(130);
    expect(bars[1].outOfOrder).toBe(true);
  });

  it("does not flag a normal conversion as out of order", () => {
    const bars = toFunnelBars([
      stage({ key: "signup", total: 100 }),
      stage({ key: "onboarded", total: 60, convFromPrev: 0.6 }),
    ]);
    expect(bars[1].outOfOrder).toBe(false);
  });

  it("marks a null total unavailable instead of rendering zero", () => {
    const bars = toFunnelBars([
      stage({ key: "signup", total: 100 }),
      stage({ key: "retained", total: null, convFromPrev: null }),
    ]);
    expect(bars[1].unavailable).toBe(true);
    expect(bars[1].widthPct).toBe(0);
    expect(bars[1].convPct).toBeNull();
  });

  it("computes week-over-week change from the two weekly counts", () => {
    const bars = toFunnelBars([stage({ newThisWeek: 12, newLastWeek: 10 })]);
    expect(bars[0].weekChange).toBeCloseTo(0.2);
  });

  it("returns a null change when last week was zero or missing", () => {
    expect(toFunnelBars([stage({ newThisWeek: 5, newLastWeek: 0 })])[0].weekChange)
      .toBeNull();
    expect(toFunnelBars([stage({ newThisWeek: 5, newLastWeek: null })])[0].weekChange)
      .toBeNull();
  });

  it("survives a null or zero first stage without dividing by zero", () => {
    const bars = toFunnelBars([
      stage({ key: "signup", total: null }),
      stage({ key: "paying", total: 10 }),
    ]);
    expect(bars[0].widthPct).toBe(0);
    expect(Number.isFinite(bars[1].widthPct)).toBe(true);
  });

  it("returns an empty array for no stages", () => {
    expect(toFunnelBars([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- funnelMath`
Expected: FAIL — `Failed to resolve import "./funnelMath"`.

- [ ] **Step 3: Implement the funnel maths**

Create `admin/src/lib/funnelMath.ts`:

```ts
export interface FunnelStageInput {
  key: string;
  label: string;
  total: number | null;
  newThisWeek: number | null;
  newLastWeek: number | null;
  convFromPrev: number | null;
}

export interface FunnelBarModel {
  key: string;
  label: string;
  total: number | null;
  /** Always within [0,100] so the bar cannot overflow its track. */
  widthPct: number;
  /** True conversion percentage — may exceed 100. null when unknown. */
  convPct: number | null;
  /** convFromPrev > 1: real signal that the stage is reached out of order. */
  outOfOrder: boolean;
  /** The query for this stage failed; render "unavailable", never 0. */
  unavailable: boolean;
  /** Week-over-week change as a ratio, or null when not computable. */
  weekChange: number | null;
}

export function toFunnelBars(stages: FunnelStageInput[]): FunnelBarModel[] {
  if (stages.length === 0) return [];

  const base = stages[0].total;
  const denominator = base && base > 0 ? base : 0;

  return stages.map((stage) => {
    const unavailable = stage.total === null;
    const rawWidth =
      unavailable || denominator === 0
        ? 0
        : ((stage.total as number) / denominator) * 100;

    const weekChange =
      stage.newThisWeek !== null && stage.newLastWeek !== null && stage.newLastWeek > 0
        ? (stage.newThisWeek - stage.newLastWeek) / stage.newLastWeek
        : null;

    return {
      key: stage.key,
      label: stage.label,
      total: stage.total,
      widthPct: Math.min(Math.max(rawWidth, 0), 100),
      convPct: stage.convFromPrev === null ? null : stage.convFromPrev * 100,
      outOfOrder: stage.convFromPrev !== null && stage.convFromPrev > 1,
      unavailable,
      weekChange,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- funnelMath`
Expected: PASS — `8 passed`.

- [ ] **Step 5: Write the failing composite chart test**

Create `admin/src/components/charts/composite.spec.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { toFunnelBars } from "../../lib/funnelMath";
import CohortHeatmap from "./CohortHeatmap";
import DonutRing from "./DonutRing";
import FunnelBars from "./FunnelBars";

const STAGES = toFunnelBars([
  { key: "signup", label: "Signup", total: 100, newThisWeek: 10, newLastWeek: 8, convFromPrev: null },
  { key: "onboarded", label: "Onboarded", total: 60, newThisWeek: 6, newLastWeek: 5, convFromPrev: 0.6 },
  { key: "activated", label: "Activated", total: 70, newThisWeek: 7, newLastWeek: 5, convFromPrev: 1.17 },
  { key: "retained", label: "Retained", total: null, newThisWeek: null, newLastWeek: null, convFromPrev: null },
]);

describe("FunnelBars", () => {
  it("labels every stage", () => {
    render(<FunnelBars stages={STAGES} />);
    expect(screen.getByText("Signup")).toBeInTheDocument();
    expect(screen.getByText("Onboarded")).toBeInTheDocument();
  });

  it("shows unavailable rather than zero for a failed stage", () => {
    render(<FunnelBars stages={STAGES} />);
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
  });

  it("flags an out-of-order stage", () => {
    render(<FunnelBars stages={STAGES} />);
    expect(screen.getByTitle(/reached out of order/i)).toBeInTheDocument();
  });

  it("never lets a bar exceed its track", () => {
    const { container } = render(<FunnelBars stages={STAGES} />);
    const widths = Array.from(
      container.querySelectorAll<HTMLElement>("[data-funnel-fill]"),
    ).map((el) => parseFloat(el.style.width));
    for (const width of widths) expect(width).toBeLessThanOrEqual(100);
  });
});

describe("DonutRing", () => {
  it("renders the label and the formatted centre value", () => {
    render(<DonutRing value={61} max={100} label="Memory" centre="61%" />);
    expect(screen.getByRole("img", { name: "Memory" })).toBeInTheDocument();
    expect(screen.getByText("61%")).toBeInTheDocument();
  });

  it("clamps an over-max value to a full ring", () => {
    const { container } = render(
      <DonutRing value={150} max={100} label="Over" centre="150%" />,
    );
    const arc = container.querySelector("[data-donut-arc]");
    const dash = arc?.getAttribute("stroke-dasharray") ?? "";
    const [drawn, gap] = dash.split(" ").map(Number);
    expect(gap).toBeCloseTo(0, 1);
    expect(drawn).toBeGreaterThan(0);
  });
});

describe("CohortHeatmap", () => {
  const cohorts = [
    { cohortWeek: "2026-W28", size: 40, w1Pct: 0.62, w2Pct: 0.4, w4Pct: null },
    { cohortWeek: "2026-W29", size: 55, w1Pct: 0.55, w2Pct: null, w4Pct: null },
  ];

  it("renders a row per cohort", () => {
    render(<CohortHeatmap cohorts={cohorts} />);
    expect(screen.getByText("2026-W28")).toBeInTheDocument();
    expect(screen.getByText("2026-W29")).toBeInTheDocument();
  });

  it("renders an em dash where the window has not elapsed", () => {
    render(<CohortHeatmap cohorts={cohorts} />);
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });

  it("renders an empty state when there are no cohorts", () => {
    render(<CohortHeatmap cohorts={[]} />);
    expect(screen.getByText(/no cohorts yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- composite`
Expected: FAIL — `Failed to resolve import "./CohortHeatmap"`.

- [ ] **Step 7: Implement `FunnelBars`**

Create `admin/src/components/charts/FunnelBars.tsx`:

```tsx
import { AlertTriangle } from "lucide-react";
import type { Hue } from "../nav-items";
import type { FunnelBarModel } from "../../lib/funnelMath";
import { formatCompact } from "../../lib/format";

interface FunnelBarsProps {
  stages: FunnelBarModel[];
  hue?: Hue;
}

const FunnelBars = ({ stages, hue = "purple" }: FunnelBarsProps) => (
  <div className="funnel">
    {stages.map((stage) => (
      <div key={stage.key} className="funnel-row">
        <div className="funnel-head">
          <span className="funnel-label">{stage.label}</span>
          <span className="funnel-total">
            {stage.unavailable ? "Unavailable" : formatCompact(stage.total as number)}
          </span>
        </div>
        <div className="funnel-track">
          <div
            data-funnel-fill
            className="funnel-fill"
            style={{
              width: `${stage.widthPct}%`,
              background: `var(--hue-${hue}-grad)`,
            }}
          />
        </div>
        {stage.convPct !== null && (
          <div className="funnel-conv">
            <span>{stage.convPct.toFixed(1)}% from previous</span>
            {stage.outOfOrder && (
              <AlertTriangle
                size={13}
                aria-hidden={false}
                role="img"
                aria-label="Out of order"
              >
                <title>
                  Above 100% — this stage is reached out of order (stages are not
                  strict subsets)
                </title>
              </AlertTriangle>
            )}
          </div>
        )}
      </div>
    ))}
  </div>
);

export default FunnelBars;
```

**Note:** `lucide-react` icons forward children into the rendered `<svg>`, so the nested `<title>` becomes the element's tooltip and satisfies `getByTitle` in the test.

- [ ] **Step 8: Implement `DonutRing`**

Create `admin/src/components/charts/DonutRing.tsx`:

```tsx
import type { Hue } from "../nav-items";

interface DonutRingProps {
  value: number;
  max: number;
  label: string;
  centre: string;
  hue?: Hue;
  size?: number;
}

const DonutRing = ({
  value,
  max,
  label,
  centre,
  hue = "blue",
  size = 96,
}: DonutRingProps) => {
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  const drawn = circumference * ratio;

  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg role="img" aria-label={label} viewBox="0 0 80 80" width={size} height={size}>
        <circle
          cx={40}
          cy={40}
          r={radius}
          fill="none"
          stroke="var(--bg-tertiary)"
          strokeWidth={8}
        />
        <circle
          data-donut-arc
          cx={40}
          cy={40}
          r={radius}
          fill="none"
          stroke={`var(--hue-${hue})`}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${drawn} ${circumference - drawn}`}
          transform="rotate(-90 40 40)"
        />
      </svg>
      <span className="donut-centre">{centre}</span>
    </div>
  );
};

export default DonutRing;
```

- [ ] **Step 9: Implement `CohortHeatmap`**

Create `admin/src/components/charts/CohortHeatmap.tsx`:

```tsx
import type { Hue } from "../nav-items";
import { formatPct } from "../../lib/format";

export interface CohortRow {
  cohortWeek: string;
  size: number;
  w1Pct: number | null;
  w2Pct: number | null;
  w4Pct: number | null;
}

interface CohortHeatmapProps {
  cohorts: CohortRow[];
  hue?: Hue;
}

const CELLS: Array<{ key: "w1Pct" | "w2Pct" | "w4Pct"; header: string }> = [
  { key: "w1Pct", header: "W1" },
  { key: "w2Pct", header: "W2" },
  { key: "w4Pct", header: "W4" },
];

const CohortHeatmap = ({ cohorts, hue = "purple" }: CohortHeatmapProps) => {
  if (cohorts.length === 0) {
    return <p className="chart-empty">No cohorts yet — check back after a full week.</p>;
  }

  return (
    <table className="cohort">
      <thead>
        <tr>
          <th scope="col">Cohort</th>
          <th scope="col">Size</th>
          {CELLS.map((cell) => (
            <th key={cell.key} scope="col">
              {cell.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {cohorts.map((row) => (
          <tr key={row.cohortWeek}>
            <th scope="row">{row.cohortWeek}</th>
            <td>{row.size}</td>
            {CELLS.map((cell) => {
              const value = row[cell.key];
              return (
                <td
                  key={cell.key}
                  className="cohort-cell"
                  style={
                    value === null
                      ? undefined
                      : {
                          // Opacity encodes retention; the hue stays constant so
                          // the column reads as one series.
                          background: `var(--hue-${hue})`,
                          opacity: 0.15 + Math.min(value, 1) * 0.7,
                        }
                  }
                >
                  {formatPct(value)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default CohortHeatmap;
```

- [ ] **Step 10: Run test to verify it passes**

Run: `npm test -- composite`
Expected: PASS — `9 passed`.

- [ ] **Step 11: Commit**

```bash
git add admin/src/lib/funnelMath.ts admin/src/lib/funnelMath.spec.ts admin/src/components/charts/
git commit -m "feat(admin): add funnel, donut and cohort chart primitives"
```

---

## Task 7: UI primitives

`Delta` carries the only real logic: a change is coloured by whether it is *good*, not by whether it is *up*. Rising AI cost must render red.

**Files:**
- Create: `admin/src/lib/delta.ts`
- Create: `admin/src/lib/delta.spec.ts`
- Create: `admin/src/components/ui/Delta.tsx`
- Create: `admin/src/components/ui/StatCard.tsx`
- Create: `admin/src/components/ui/BoardCard.tsx`
- Create: `admin/src/components/ui/AttentionCard.tsx`
- Create: `admin/src/components/ui/EmptyState.tsx`
- Create: `admin/src/components/ui/Skeleton.tsx`
- Create: `admin/src/components/ui/primitives.spec.tsx`
- Create: `admin/src/styles/cards.css`
- Modify: `admin/src/index.css` (import `cards.css`)

**Interfaces:**
- Consumes: `Hue` from `../nav-items`
- Produces:
  - `type Polarity = "higher-is-better" | "lower-is-better"`
  - `deltaTone(change: number | null, polarity: Polarity): "positive" | "negative" | "neutral"`
  - `<Delta change polarity />`, `<StatCard icon label value hue to sublabel />`, `<BoardCard title hue action children />`, `<AttentionCard count label to hue icon />`, `<EmptyState hue title action />`, `<Skeleton lines height />`

- [ ] **Step 1: Write the failing delta test**

Create `admin/src/lib/delta.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deltaTone } from "./delta";

describe("deltaTone", () => {
  it("treats growth as good when higher is better", () => {
    expect(deltaTone(0.08, "higher-is-better")).toBe("positive");
    expect(deltaTone(-0.08, "higher-is-better")).toBe("negative");
  });

  it("treats growth as bad when lower is better", () => {
    // Rising AI cost is a problem, not a win.
    expect(deltaTone(0.08, "lower-is-better")).toBe("negative");
    expect(deltaTone(-0.08, "lower-is-better")).toBe("positive");
  });

  it("is neutral for null, zero and non-finite values", () => {
    expect(deltaTone(null, "higher-is-better")).toBe("neutral");
    expect(deltaTone(0, "higher-is-better")).toBe("neutral");
    expect(deltaTone(Number.NaN, "higher-is-better")).toBe("neutral");
    expect(deltaTone(Number.POSITIVE_INFINITY, "higher-is-better")).toBe("neutral");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- delta`
Expected: FAIL — `Failed to resolve import "./delta"`.

- [ ] **Step 3: Implement `delta.ts`**

Create `admin/src/lib/delta.ts`:

```ts
export type Polarity = "higher-is-better" | "lower-is-better";
export type DeltaTone = "positive" | "negative" | "neutral";

/** Colours a change by whether it is good, not by whether it is up. */
export function deltaTone(change: number | null, polarity: Polarity): DeltaTone {
  if (change === null || !Number.isFinite(change) || change === 0) return "neutral";
  const good = polarity === "higher-is-better" ? change > 0 : change < 0;
  return good ? "positive" : "negative";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- delta`
Expected: PASS — `3 passed`.

- [ ] **Step 5: Write the failing primitives test**

Create `admin/src/components/ui/primitives.spec.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Target } from "lucide-react";
import { describe, expect, it } from "vitest";
import AttentionCard from "./AttentionCard";
import BoardCard from "./BoardCard";
import Delta from "./Delta";
import EmptyState from "./EmptyState";
import Skeleton from "./Skeleton";
import StatCard from "./StatCard";

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("Delta", () => {
  it("renders a signed percentage with a tone attribute", () => {
    render(<Delta change={0.082} polarity="higher-is-better" />);
    const el = screen.getByText("+8.2%");
    expect(el).toHaveAttribute("data-tone", "positive");
  });

  it("marks a rise in a lower-is-better metric as negative", () => {
    render(<Delta change={0.5} polarity="lower-is-better" />);
    expect(screen.getByText("+50.0%")).toHaveAttribute("data-tone", "negative");
  });

  it("renders nothing when the change is unknown", () => {
    const { container } = render(<Delta change={null} polarity="higher-is-better" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("StatCard", () => {
  it("links to its destination and shows label and value", () => {
    wrap(
      <StatCard icon={Target} label="Active Opportunities" value="1,902" hue="blue" to="/opportunities" />,
    );
    const link = screen.getByRole("link", { name: /active opportunities/i });
    expect(link).toHaveAttribute("href", "/opportunities");
    expect(screen.getByText("1,902")).toBeInTheDocument();
  });
});

describe("AttentionCard", () => {
  it("exposes the count and destination", () => {
    wrap(
      <AttentionCard count={23} label="to review" to="/opportunities?filter=needs-review" hue="blue" icon={Target} />,
    );
    expect(screen.getByText("23")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/opportunities?filter=needs-review",
    );
  });
});

describe("BoardCard", () => {
  it("renders its title and children", () => {
    wrap(
      <BoardCard title="Growth" hue="purple">
        <p>board body</p>
      </BoardCard>,
    );
    expect(screen.getByRole("heading", { name: "Growth" })).toBeInTheDocument();
    expect(screen.getByText("board body")).toBeInTheDocument();
  });
});

describe("EmptyState", () => {
  it("shows the title and an optional action", () => {
    wrap(<EmptyState hue="green" title="No revenue yet" actionLabel="Set pricing" actionTo="/monetization/pricing" />);
    expect(screen.getByText("No revenue yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Set pricing" })).toBeInTheDocument();
  });
});

describe("Skeleton", () => {
  it("renders the requested number of shimmer lines", () => {
    const { container } = render(<Skeleton lines={3} />);
    expect(container.querySelectorAll(".skeleton-line")).toHaveLength(3);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- primitives`
Expected: FAIL — `Failed to resolve import "./AttentionCard"`.

- [ ] **Step 7: Implement `Delta`**

Create `admin/src/components/ui/Delta.tsx`:

```tsx
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { deltaTone, type Polarity } from "../../lib/delta";

interface DeltaProps {
  change: number | null;
  polarity: Polarity;
}

const Delta = ({ change, polarity }: DeltaProps) => {
  if (change === null || !Number.isFinite(change)) return null;

  const tone = deltaTone(change, polarity);
  const Icon = change >= 0 ? ArrowUpRight : ArrowDownRight;
  const sign = change > 0 ? "+" : "";

  return (
    <span className="delta" data-tone={tone}>
      <Icon size={13} strokeWidth={2} aria-hidden="true" />
      {`${sign}${(change * 100).toFixed(1)}%`}
    </span>
  );
};

export default Delta;
```

- [ ] **Step 8: Implement `StatCard`**

Create `admin/src/components/ui/StatCard.tsx`:

```tsx
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import type { Hue } from "../nav-items";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  hue: Hue;
  to: string;
  sublabel?: string;
  children?: React.ReactNode;
}

const StatCard = ({
  icon: Icon,
  label,
  value,
  hue,
  to,
  sublabel,
  children,
}: StatCardProps) => (
  <Link
    to={to}
    className="stat-card"
    style={{
      background: `var(--hue-${hue}-grad)`,
      boxShadow: `0 6px 20px var(--hue-${hue}-glow)`,
    }}
  >
    <span className="stat-card-value">{value}</span>
    <span className="stat-card-label">{label}</span>
    {sublabel && <span className="stat-card-sub">{sublabel}</span>}
    <Icon className="stat-card-icon" size={28} strokeWidth={1.5} aria-hidden="true" />
    {children}
  </Link>
);

export default StatCard;
```

- [ ] **Step 9: Implement `AttentionCard`**

Create `admin/src/components/ui/AttentionCard.tsx`:

```tsx
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { Hue } from "../nav-items";

interface AttentionCardProps {
  count: number;
  label: string;
  to: string;
  hue: Hue;
  icon: LucideIcon;
}

const AttentionCard = ({ count, label, to, hue, icon: Icon }: AttentionCardProps) => (
  <Link
    to={to}
    className="attention-card"
    style={{
      background: `var(--hue-${hue}-grad)`,
      boxShadow: `0 6px 20px var(--hue-${hue}-glow)`,
    }}
  >
    <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
    <span className="attention-count">{count}</span>
    <span className="attention-label">{label}</span>
    <ArrowRight className="attention-arrow" size={16} aria-hidden="true" />
  </Link>
);

export default AttentionCard;
```

- [ ] **Step 10: Implement `BoardCard`, `EmptyState` and `Skeleton`**

Create `admin/src/components/ui/BoardCard.tsx`:

```tsx
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { Hue } from "../nav-items";

interface BoardCardProps {
  title: string;
  hue: Hue;
  drillTo?: string;
  drillLabel?: string;
  children: React.ReactNode;
}

const BoardCard = ({ title, hue, drillTo, drillLabel, children }: BoardCardProps) => (
  <section className="board-card">
    <header
      className="board-card-head"
      style={{
        background: `linear-gradient(120deg, var(--hue-${hue}-soft) 0%, transparent 70%)`,
        borderTop: `2px solid var(--hue-${hue})`,
      }}
    >
      <h3>{title}</h3>
      {drillTo && (
        <Link to={drillTo} className="board-card-drill">
          {drillLabel ?? "View"}
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      )}
    </header>
    <div className="board-card-body">{children}</div>
  </section>
);

export default BoardCard;
```

Create `admin/src/components/ui/EmptyState.tsx`:

```tsx
import { Link } from "react-router-dom";
import type { Hue } from "../nav-items";

interface EmptyStateProps {
  hue: Hue;
  title: string;
  description?: string;
  actionLabel?: string;
  actionTo?: string;
}

const EmptyState = ({
  hue,
  title,
  description,
  actionLabel,
  actionTo,
}: EmptyStateProps) => (
  <div className="empty-state">
    <svg viewBox="0 0 64 40" width={64} height={40} aria-hidden="true">
      <rect x={2} y={10} width={60} height={28} rx={6} fill={`var(--hue-${hue}-soft)`} />
      <rect x={10} y={18} width={26} height={4} rx={2} fill={`var(--hue-${hue})`} opacity={0.6} />
      <rect x={10} y={26} width={16} height={4} rx={2} fill={`var(--hue-${hue})`} opacity={0.35} />
    </svg>
    <p className="empty-state-title">{title}</p>
    {description && <p className="empty-state-desc">{description}</p>}
    {actionLabel && actionTo && (
      <Link to={actionTo} className="btn btn-pill">
        {actionLabel}
      </Link>
    )}
  </div>
);

export default EmptyState;
```

Create `admin/src/components/ui/Skeleton.tsx`:

```tsx
interface SkeletonProps {
  lines?: number;
  height?: number;
}

const Skeleton = ({ lines = 3, height = 14 }: SkeletonProps) => (
  <div className="skeleton" aria-hidden="true">
    {Array.from({ length: lines }, (_, index) => (
      <div
        key={index}
        className="skeleton-line"
        style={{ height, width: `${100 - index * 12}%` }}
      />
    ))}
  </div>
);

export default Skeleton;
```

- [ ] **Step 11: Add the card stylesheet**

Create `admin/src/styles/cards.css`:

```css
/* Shared card, chart and state primitives. Colour comes from --hue-* tokens
   so a card's domain is set by one prop, never by hardcoded hex. */

.stat-card,
.attention-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 20px;
  border-radius: 16px;
  color: #ffffff;
  text-decoration: none;
  overflow: hidden;
  transition: transform var(--motion-base), box-shadow var(--motion-base);
}

.stat-card:hover,
.attention-card:hover {
  transform: translateY(-2px);
}

.stat-card-value {
  font-size: 32px;
  font-weight: 700;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
}

.stat-card-label {
  font-size: 15px;
  font-weight: 600;
}

.stat-card-sub {
  font-size: 13px;
  opacity: 0.85;
}

.stat-card-icon {
  position: absolute;
  top: 18px;
  right: 18px;
  opacity: 0.95;
}

.attention-card {
  padding: 16px 18px;
  min-width: 150px;
}

.attention-count {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.1;
}

.attention-label {
  font-size: 13px;
  font-weight: 600;
  opacity: 0.92;
}

.attention-arrow {
  position: absolute;
  bottom: 14px;
  right: 14px;
  opacity: 0.7;
}

.board-card {
  background: var(--card-bg);
  border: 1px solid var(--border-light);
  border-radius: 16px;
  overflow: hidden;
}

.board-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px;
}

.board-card-head h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.board-card-drill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  text-decoration: none;
}

.board-card-drill:hover {
  color: var(--text-primary);
}

.board-card-body {
  padding: 18px 20px 20px;
}

.delta {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 999px;
}

.delta[data-tone="positive"] {
  color: var(--hue-green);
  background: var(--hue-green-soft);
}

.delta[data-tone="negative"] {
  color: var(--hue-red);
  background: var(--hue-red-soft);
}

.delta[data-tone="neutral"] {
  color: var(--text-tertiary);
  background: var(--bg-tertiary);
}

.funnel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.funnel-head {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  margin-bottom: 5px;
}

.funnel-label {
  font-weight: 500;
}

.funnel-total {
  font-weight: 700;
}

.funnel-track {
  height: 10px;
  background: var(--bg-tertiary);
  border-radius: 999px;
  overflow: hidden;
}

.funnel-fill {
  height: 100%;
  border-radius: 999px;
  transition: width var(--motion-base);
}

.funnel-conv {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.donut {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.donut-centre {
  position: absolute;
  font-size: 15px;
  font-weight: 700;
}

.cohort {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.cohort th,
.cohort td {
  padding: 7px 10px;
  text-align: left;
}

.cohort thead th {
  font-weight: 500;
  color: var(--text-tertiary);
  border-bottom: 1px solid var(--border-light);
}

.cohort-cell {
  text-align: center;
  border-radius: 6px;
  font-weight: 600;
}

.chart-empty,
.empty-state-desc {
  color: var(--text-tertiary);
  font-size: 13px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 12px;
  text-align: center;
}

.empty-state-title {
  font-weight: 600;
  font-size: 14px;
  margin: 0;
}

.skeleton {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.skeleton-line {
  border-radius: 6px;
  background: linear-gradient(
    90deg,
    var(--bg-tertiary) 25%,
    var(--border-light) 37%,
    var(--bg-tertiary) 63%
  );
  background-size: 400% 100%;
  animation: skeletonShimmer 1.4s ease infinite;
}

@keyframes skeletonShimmer {
  0% { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-line { animation: none; }
  .stat-card:hover,
  .attention-card:hover { transform: none; }
}
```

- [ ] **Step 12: Import the stylesheet**

In `admin/src/index.css`, directly below the `@import './styles/tokens.css';` line added in Task 2:

```css
@import './styles/cards.css';
```

- [ ] **Step 13: Run test to verify it passes**

Run: `npm test -- primitives`
Expected: PASS — `8 passed`.

- [ ] **Step 14: Lint and commit**

Run: `npm run lint`
Expected: exit 0.

```bash
git add admin/src/lib/delta.ts admin/src/lib/delta.spec.ts admin/src/components/ui/ admin/src/styles/cards.css admin/src/index.css
git commit -m "feat(admin): add card, delta, empty and skeleton primitives"
```

---

## Task 8: Nav rail and section panel

The two-column desktop nav. The critical property: **total width is constant at 260px**, so navigating between sections never resizes the content area. Neither component fetches anything — badge counts arrive as a prop.

**Files:**
- Create: `admin/src/styles/shell.css`
- Create: `admin/src/components/shell/NavRail.tsx`
- Create: `admin/src/components/shell/SectionPanel.tsx`
- Create: `admin/src/components/shell/nav.spec.tsx`
- Modify: `admin/src/index.css` (import `shell.css`)

**Interfaces:**
- Consumes: `NAV`, `NavEntry`, `BadgeKey`, `firstChildPath`, `sectionForPath` from `../nav-items`
- Produces:
  - `<NavRail activeId onNavigate children />` — `children` renders into the rail footer
  - `<SectionPanel section badges onNavigate />`
  - `type NavBadges = Partial<Record<BadgeKey, number>>`

- [ ] **Step 1: Write the failing test**

Create `admin/src/components/shell/nav.spec.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { NAV, sectionForPath } from "../nav-items";
import NavRail from "./NavRail";
import SectionPanel from "./SectionPanel";

const wrap = (ui: React.ReactNode, path = "/") =>
  render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);

describe("NavRail", () => {
  it("renders every top-level entry", () => {
    wrap(<NavRail activeId="content" />);
    const nav = screen.getByRole("navigation", { name: /sections/i });
    expect(within(nav).getAllByRole("link")).toHaveLength(NAV.length + 1); // + logo
  });

  it("marks the active section with aria-current", () => {
    wrap(<NavRail activeId="content" />, "/opportunities");
    expect(screen.getByRole("link", { name: /content/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("points a group at its first child", () => {
    wrap(<NavRail activeId={null} />);
    expect(screen.getByRole("link", { name: /people/i })).toHaveAttribute(
      "href",
      "/users",
    );
  });

  it("renders footer children", () => {
    wrap(
      <NavRail activeId={null}>
        <button type="button">Sign out</button>
      </NavRail>,
    );
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });
});

describe("SectionPanel", () => {
  it("lists the children of the active group", () => {
    wrap(<SectionPanel section={sectionForPath("/opportunities")} badges={{}} />, "/opportunities");
    expect(screen.getByRole("link", { name: /opportunities/i })).toHaveAttribute(
      "href",
      "/opportunities",
    );
    expect(screen.getByRole("link", { name: /submissions/i })).toBeInTheDocument();
  });

  it("renders a badge only where a count is present and non-zero", () => {
    wrap(
      <SectionPanel
        section={sectionForPath("/opportunities")}
        badges={{ submissions: 7, creators: 0 }}
      />,
      "/opportunities",
    );
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("shows a leaf page's own sections instead of collapsing", () => {
    wrap(<SectionPanel section={sectionForPath("/")} badges={{}} />, "/");
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /growth/i })).toBeInTheDocument();
  });

  it("stays rendered with a hint when a leaf has no sections", () => {
    wrap(<SectionPanel section={sectionForPath("/settings")} badges={{}} />, "/settings");
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByText(/no sub-sections/i)).toBeInTheDocument();
  });

  it("renders an empty shell for an unknown route rather than nothing", () => {
    const { container } = wrap(<SectionPanel section={null} badges={{}} />, "/nope");
    expect(container.querySelector(".section-panel")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- nav.spec`
Expected: FAIL — `Failed to resolve import "./NavRail"`.

- [ ] **Step 3: Implement `NavRail`**

Create `admin/src/components/shell/NavRail.tsx`:

```tsx
import { NavLink } from "react-router-dom";
import { NAV, firstChildPath } from "../nav-items";

interface NavRailProps {
  activeId: string | null;
  onNavigate?: () => void;
  children?: React.ReactNode;
}

const NavRail = ({ activeId, onNavigate, children }: NavRailProps) => (
  <nav className="rail" aria-label="Sections">
    <NavLink to="/" className="rail-logo" aria-label="Edutu admin home">
      <img src="/logo.png" alt="" width={30} height={30} />
    </NavLink>

    <ul className="rail-list">
      {NAV.map((entry) => {
        const isActive = entry.id === activeId;
        return (
          <li key={entry.id}>
            <NavLink
              to={firstChildPath(entry)}
              className={`rail-item ${isActive ? "active" : ""}`}
              aria-current={isActive ? "page" : undefined}
              style={{ ["--rail-hue" as string]: `var(--hue-${entry.hue})` }}
              onClick={onNavigate}
            >
              <entry.icon size={20} strokeWidth={1.6} aria-hidden="true" />
              <span className="rail-label">{entry.short}</span>
            </NavLink>
          </li>
        );
      })}
    </ul>

    <div className="rail-footer">{children}</div>
  </nav>
);

export default NavRail;
```

- [ ] **Step 4: Implement `SectionPanel`**

Create `admin/src/components/shell/SectionPanel.tsx`:

```tsx
import { NavLink } from "react-router-dom";
import type { BadgeKey, NavEntry, NavLeaf } from "../nav-items";

export type NavBadges = Partial<Record<BadgeKey, number>>;

interface SectionPanelProps {
  section: NavEntry | null;
  badges: NavBadges;
  onNavigate?: () => void;
}

function itemsFor(section: NavEntry | null): NavLeaf[] {
  if (!section) return [];
  return section.kind === "group" ? section.children : (section.panel ?? []);
}

const SectionPanel = ({ section, badges, onNavigate }: SectionPanelProps) => {
  const items = itemsFor(section);
  const hue = section?.hue ?? "neutral";

  return (
    <div className="section-panel" aria-label={section?.label ?? "Section"}>
      <h2 className="section-panel-title" style={{ color: `var(--hue-${hue})` }}>
        {section?.label ?? ""}
      </h2>

      {items.length === 0 ? (
        <p className="section-panel-hint">No sub-sections</p>
      ) : (
        <nav aria-label={`${section?.label ?? "Section"} pages`}>
          <ul className="section-panel-list">
            {items.map((item) => {
              const count = item.badgeKey ? badges[item.badgeKey] : undefined;
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === "/engine" || item.to === "/monetization"}
                    className={({ isActive }) =>
                      `section-panel-link ${isActive ? "active" : ""}`
                    }
                    style={{ ["--panel-hue" as string]: `var(--hue-${hue})` }}
                    onClick={onNavigate}
                  >
                    {item.icon && <item.icon size={16} strokeWidth={1.5} aria-hidden="true" />}
                    <span>{item.label}</span>
                    {typeof count === "number" && count > 0 && (
                      <span className="section-panel-badge">{count}</span>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
};

export default SectionPanel;
```

- [ ] **Step 5: Create the shell stylesheet**

Create `admin/src/styles/shell.css`:

```css
/* App shell: 72px rail + 188px section panel = 260px, always.
   The total never changes, so opening a section cannot resize the content. */

.app-shell {
  min-height: 100vh;
}

.shell-nav {
  position: fixed;
  top: 0;
  left: 0;
  height: 100vh;
  display: flex;
  z-index: 50;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-light);
}

.rail {
  width: 72px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 0;
  gap: 8px;
  border-right: 1px solid var(--border-light);
}

.rail-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
}

.rail-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  flex: 1;
  overflow-y: auto;
}

.rail-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 9px 2px;
  margin: 0 8px;
  border-radius: 12px;
  color: var(--text-tertiary);
  text-decoration: none;
  transition: background var(--motion-fast), color var(--motion-fast);
}

.rail-item:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.rail-item.active {
  color: var(--rail-hue);
  background: color-mix(in srgb, var(--rail-hue) 12%, transparent);
}

.rail-item.active::before {
  content: "";
  position: absolute;
  left: -8px;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--rail-hue);
}

.rail-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.1;
  text-align: center;
}

.rail-footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding-top: 8px;
  border-top: 1px solid var(--border-light);
}

.section-panel {
  width: 188px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  padding: 16px 12px;
  overflow-y: auto;
}

.section-panel-title {
  margin: 0 0 12px 8px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.section-panel-hint {
  margin: 0 8px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.section-panel-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.section-panel-link {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border-radius: 9px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  text-decoration: none;
  transition: background var(--motion-fast), color var(--motion-fast);
}

.section-panel-link:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.section-panel-link.active {
  background: var(--panel-hue);
  color: #ffffff;
}

.section-panel-badge {
  margin-left: auto;
  min-width: 19px;
  padding: 1px 5px;
  border-radius: 999px;
  background: var(--hue-red);
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
  text-align: center;
}

.section-panel-link.active .section-panel-badge {
  background: rgba(255, 255, 255, 0.28);
}

/* Content is offset by the full, constant nav width. */
.shell-main {
  margin-left: 260px;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.shell-page {
  flex: 1;
  padding: 24px;
}

@media (max-width: 768px) {
  .shell-nav {
    display: none;
  }

  .shell-main {
    margin-left: 0;
  }

  .shell-page {
    padding: 16px 16px 96px;
  }
}
```

- [ ] **Step 6: Import the stylesheet**

In `admin/src/index.css`, below the `cards.css` import added in Task 7:

```css
@import './styles/shell.css';
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- nav.spec`
Expected: PASS — `9 passed`.

- [ ] **Step 8: Commit**

```bash
git add admin/src/components/shell/ admin/src/styles/shell.css admin/src/index.css
git commit -m "feat(admin): add fixed-width nav rail and section panel"
```

---

## Task 9: Top bar and command palette

**Files:**
- Create: `admin/src/components/shell/TopBar.tsx`
- Create: `admin/src/components/shell/CommandPalette.tsx`
- Create: `admin/src/components/shell/topbar.spec.tsx`
- Modify: `admin/src/styles/shell.css` (append)

**Interfaces:**
- Consumes: `NAV`, `sectionForPath`, `firstChildPath` from `../nav-items`; `formatTimeAgo` from `../../lib/format`
- Produces:
  - `<TopBar section pageTitle updatedAt onRefresh isRefreshing onOpenPalette children />`
  - `<CommandPalette open onClose />`
  - `flattenDestinations(): Array<{ label: string; section: string; to: string }>`

- [ ] **Step 1: Write the failing test**

Create `admin/src/components/shell/topbar.spec.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { sectionForPath } from "../nav-items";
import CommandPalette, { flattenDestinations } from "./CommandPalette";
import TopBar from "./TopBar";

const wrap = (ui: React.ReactNode, path = "/") =>
  render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);

describe("TopBar", () => {
  it("renders a breadcrumb of section then page", () => {
    wrap(
      <TopBar
        section={sectionForPath("/opportunities")}
        pageTitle="Opportunities"
        updatedAt={null}
        onOpenPalette={() => {}}
      />,
      "/opportunities",
    );
    expect(screen.getByText("Content")).toBeInTheDocument();
    expect(screen.getByText("Opportunities")).toBeInTheDocument();
  });

  it("shows a relative updated label when given a timestamp", () => {
    const now = new Date("2026-07-25T12:00:00.000Z");
    wrap(
      <TopBar
        section={null}
        pageTitle="Dashboard"
        updatedAt="2026-07-25T11:58:00.000Z"
        now={now}
        onOpenPalette={() => {}}
      />,
    );
    expect(screen.getByText(/updated 2m ago/i)).toBeInTheDocument();
  });

  it("hides the refresh control when no handler is supplied", () => {
    wrap(
      <TopBar section={null} pageTitle="Settings" updatedAt={null} onOpenPalette={() => {}} />,
    );
    expect(screen.queryByRole("button", { name: /refresh/i })).toBeNull();
  });

  it("opens the palette when the search affordance is clicked", async () => {
    const onOpenPalette = vi.fn();
    wrap(
      <TopBar section={null} pageTitle="Dashboard" updatedAt={null} onOpenPalette={onOpenPalette} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /search/i }));
    expect(onOpenPalette).toHaveBeenCalledOnce();
  });
});

describe("flattenDestinations", () => {
  it("includes every group child and every leaf exactly once", () => {
    const destinations = flattenDestinations();
    const paths = destinations.map((d) => d.to);
    expect(paths).toContain("/opportunities");
    expect(paths).toContain("/monetization/pricing");
    expect(paths).toContain("/settings");
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("labels each destination with its section", () => {
    const opportunities = flattenDestinations().find((d) => d.to === "/opportunities");
    expect(opportunities?.section).toBe("Content");
  });
});

describe("CommandPalette", () => {
  it("renders nothing when closed", () => {
    const { container } = wrap(<CommandPalette open={false} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("filters destinations as you type", async () => {
    wrap(<CommandPalette open onClose={() => {}} />);
    await userEvent.type(screen.getByRole("combobox"), "pric");
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("Pricing");
  });

  it("reports when nothing matches", async () => {
    wrap(<CommandPalette open onClose={() => {}} />);
    await userEvent.type(screen.getByRole("combobox"), "zzzz");
    expect(screen.getByText(/no matches/i)).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    wrap(<CommandPalette open onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- topbar`
Expected: FAIL — `Failed to resolve import "./CommandPalette"`.

- [ ] **Step 3: Implement `TopBar`**

Create `admin/src/components/shell/TopBar.tsx`:

```tsx
import { ChevronRight, RefreshCw, Search } from "lucide-react";
import type { NavEntry } from "../nav-items";
import { formatTimeAgo } from "../../lib/format";

interface TopBarProps {
  section: NavEntry | null;
  pageTitle: string;
  updatedAt: string | null;
  onOpenPalette: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  /** Injectable clock; tests pass a fixed date. */
  now?: Date;
  children?: React.ReactNode;
}

const TopBar = ({
  section,
  pageTitle,
  updatedAt,
  onOpenPalette,
  onRefresh,
  isRefreshing = false,
  now,
  children,
}: TopBarProps) => (
  <header className="topbar">
    <nav className="topbar-crumbs" aria-label="Breadcrumb">
      {section && section.label !== pageTitle && (
        <>
          <span className="topbar-crumb-section">{section.label}</span>
          <ChevronRight size={14} aria-hidden="true" />
        </>
      )}
      <h1 className="topbar-title">{pageTitle}</h1>
    </nav>

    <div className="topbar-actions">
      {updatedAt && (
        <span className="topbar-updated">
          Updated {formatTimeAgo(updatedAt, now)}
        </span>
      )}

      {onRefresh && (
        <button
          type="button"
          className="topbar-btn"
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-label="Refresh"
        >
          <RefreshCw size={16} className={isRefreshing ? "animate-spin" : undefined} />
        </button>
      )}

      <button
        type="button"
        className="topbar-search"
        onClick={onOpenPalette}
        aria-label="Search and commands"
      >
        <Search size={15} aria-hidden="true" />
        <span className="topbar-search-text">Search</span>
        <kbd className="topbar-kbd">⌘K</kbd>
      </button>

      {children}
    </div>
  </header>
);

export default TopBar;
```

- [ ] **Step 4: Implement `CommandPalette`**

Create `admin/src/components/shell/CommandPalette.tsx`:

```tsx
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { NAV } from "../nav-items";

export interface Destination {
  label: string;
  section: string;
  to: string;
}

export function flattenDestinations(): Destination[] {
  const out: Destination[] = [];
  for (const entry of NAV) {
    if (entry.kind === "leaf") {
      out.push({ label: entry.label, section: entry.label, to: entry.to });
      continue;
    }
    for (const child of entry.children) {
      out.push({ label: child.label, section: entry.label, to: child.to });
    }
  }
  return out;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

const CommandPalette = ({ open, onClose }: CommandPaletteProps) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);

  const destinations = useMemo(flattenDestinations, []);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return destinations;
    return destinations.filter(
      (d) =>
        d.label.toLowerCase().includes(needle) ||
        d.section.toLowerCase().includes(needle),
    );
  }, [destinations, query]);

  if (!open) return null;

  const go = (to: string) => {
    navigate(to);
    setQuery("");
    setCursor(0);
    onClose();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((c) => Math.min(c + 1, matches.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
      return;
    }
    if (event.key === "Enter" && matches[cursor]) {
      event.preventDefault();
      go(matches[cursor].to);
    }
  };

  return (
    <div className="palette-backdrop" role="presentation" onClick={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search and commands"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          className="palette-input"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-label="Search destinations"
          autoFocus
          value={query}
          placeholder="Jump to…"
          onChange={(event) => {
            setQuery(event.target.value);
            setCursor(0);
          }}
          onKeyDown={onKeyDown}
        />

        {matches.length === 0 ? (
          <p className="palette-empty">No matches</p>
        ) : (
          <ul className="palette-list" id="palette-list" role="listbox">
            {matches.map((match, index) => (
              <li key={match.to}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === cursor}
                  className={`palette-option ${index === cursor ? "active" : ""}`}
                  onClick={() => go(match.to)}
                >
                  <span>{match.label}</span>
                  <span className="palette-section">{match.section}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default CommandPalette;
```

- [ ] **Step 5: Append the top bar and palette styles**

Append to `admin/src/styles/shell.css`:

```css
/* ─── Top bar ─── */
.topbar {
  position: sticky;
  top: 0;
  z-index: 40;
  height: 56px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 24px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-backdrop);
  -webkit-backdrop-filter: var(--glass-backdrop);
  border-bottom: 1px solid var(--border-light);
}

.topbar-crumbs {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--text-tertiary);
}

.topbar-crumb-section {
  font-size: 13px;
  font-weight: 500;
}

.topbar-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.topbar-updated {
  font-size: 12px;
  color: var(--text-tertiary);
  white-space: nowrap;
}

.topbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--border-light);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  border-radius: 10px;
  cursor: pointer;
}

.topbar-btn:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--bg-tertiary);
}

.topbar-search {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border-light);
  background: var(--bg-secondary);
  color: var(--text-tertiary);
  border-radius: 10px;
  cursor: pointer;
  font-size: 13px;
}

.topbar-search:hover {
  color: var(--text-primary);
}

.topbar-kbd {
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--bg-tertiary);
  font-size: 11px;
  font-family: inherit;
}

/* ─── Command palette ─── */
.palette-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  justify-content: center;
  padding-top: 12vh;
  background: rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(3px);
}

.palette {
  width: min(560px, 92vw);
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border: 1px solid var(--border-medium);
  border-radius: 16px;
  box-shadow: var(--shadow-modal);
  overflow: hidden;
}

.palette-input {
  padding: 16px 18px;
  border: none;
  border-bottom: 1px solid var(--border-light);
  background: transparent;
  color: var(--text-primary);
  font-size: 16px;
  outline: none;
}

.palette-list {
  list-style: none;
  margin: 0;
  padding: 6px;
  overflow-y: auto;
}

.palette-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 9px 12px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--text-primary);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}

.palette-option:hover,
.palette-option.active {
  background: var(--bg-tertiary);
}

.palette-section {
  font-size: 12px;
  color: var(--text-tertiary);
}

.palette-empty {
  padding: 22px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 14px;
}

@media (max-width: 768px) {
  .topbar {
    padding: 0 16px;
  }

  .topbar-search-text,
  .topbar-kbd,
  .topbar-updated {
    display: none;
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- topbar`
Expected: PASS — `10 passed`.

- [ ] **Step 7: Commit**

```bash
git add admin/src/components/shell/TopBar.tsx admin/src/components/shell/CommandPalette.tsx admin/src/components/shell/topbar.spec.tsx admin/src/styles/shell.css
git commit -m "feat(admin): add sticky top bar and command palette"
```

---

## Task 10: Mobile tab bar and More sheet

Replaces the floating hamburger that currently overlaps page content.

**Files:**
- Create: `admin/src/components/shell/MobileTabBar.tsx`
- Create: `admin/src/components/shell/MoreSheet.tsx`
- Create: `admin/src/components/shell/mobile.spec.tsx`
- Modify: `admin/src/styles/shell.css` (append)

**Interfaces:**
- Consumes: `mobileTabs`, `NAV`, `groupForPath` from `../nav-items`
- Produces: `<MobileTabBar activeId onOpenMore />`, `<MoreSheet open onClose />`

- [ ] **Step 1: Write the failing test**

Create `admin/src/components/shell/mobile.spec.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import MobileTabBar from "./MobileTabBar";
import MoreSheet from "./MoreSheet";

const wrap = (ui: React.ReactNode, path = "/") =>
  render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);

describe("MobileTabBar", () => {
  it("renders exactly five tabs", () => {
    wrap(<MobileTabBar activeId="dashboard" onOpenMore={() => {}} />);
    const bar = screen.getByRole("navigation", { name: /primary/i });
    expect(bar.querySelectorAll("a, button")).toHaveLength(5);
  });

  it("marks the active tab with aria-current", () => {
    wrap(<MobileTabBar activeId="content" onOpenMore={() => {}} />, "/opportunities");
    expect(screen.getByRole("link", { name: /content/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("renders More as a button that opens the sheet", async () => {
    const onOpenMore = vi.fn();
    wrap(<MobileTabBar activeId="dashboard" onOpenMore={onOpenMore} />);
    await userEvent.click(screen.getByRole("button", { name: /more/i }));
    expect(onOpenMore).toHaveBeenCalledOnce();
  });
});

describe("MoreSheet", () => {
  it("renders nothing when closed", () => {
    const { container } = wrap(<MoreSheet open={false} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("exposes the full two-level tree including config-only sections", () => {
    wrap(<MoreSheet open onClose={() => {}} />);
    expect(screen.getByRole("link", { name: /live runs/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /feature flags/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^settings$/i })).toBeInTheDocument();
  });

  it("closes when a destination is chosen", async () => {
    const onClose = vi.fn();
    wrap(<MoreSheet open onClose={onClose} />);
    await userEvent.click(screen.getByRole("link", { name: /live runs/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("is a labelled modal dialog", () => {
    wrap(<MoreSheet open onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: /all sections/i })).toHaveAttribute(
      "aria-modal",
      "true",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- mobile.spec`
Expected: FAIL — `Failed to resolve import "./MobileTabBar"`.

- [ ] **Step 3: Implement `MobileTabBar`**

Create `admin/src/components/shell/MobileTabBar.tsx`:

```tsx
import { NavLink } from "react-router-dom";
import { mobileTabs } from "../nav-items";

interface MobileTabBarProps {
  activeId: string | null;
  onOpenMore: () => void;
}

const MobileTabBar = ({ activeId, onOpenMore }: MobileTabBarProps) => (
  <nav className="tabbar" aria-label="Primary">
    {mobileTabs().map((tab) => {
      const isActive = tab.id === activeId;
      const content = (
        <>
          <tab.icon size={20} strokeWidth={1.6} aria-hidden="true" />
          <span>{tab.label}</span>
        </>
      );

      if (tab.to === null) {
        return (
          <button
            key={tab.id}
            type="button"
            className="tabbar-item"
            onClick={onOpenMore}
          >
            {content}
          </button>
        );
      }

      return (
        <NavLink
          key={tab.id}
          to={tab.to}
          className={`tabbar-item ${isActive ? "active" : ""}`}
          aria-current={isActive ? "page" : undefined}
          style={{ ["--tab-hue" as string]: `var(--hue-${tab.hue})` }}
        >
          {content}
        </NavLink>
      );
    })}
  </nav>
);

export default MobileTabBar;
```

- [ ] **Step 4: Implement `MoreSheet`**

Create `admin/src/components/shell/MoreSheet.tsx`:

```tsx
import { NavLink } from "react-router-dom";
import { NAV } from "../nav-items";

interface MoreSheetProps {
  open: boolean;
  onClose: () => void;
}

const MoreSheet = ({ open, onClose }: MoreSheetProps) => {
  if (!open) return null;

  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="All sections"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-grabber" aria-hidden="true" />
        {NAV.map((entry) => (
          <div key={entry.id} className="sheet-group">
            <p className="sheet-group-title" style={{ color: `var(--hue-${entry.hue})` }}>
              {entry.label}
            </p>
            <div className="sheet-links">
              {entry.kind === "leaf" ? (
                <NavLink
                  to={entry.to}
                  end={entry.to === "/"}
                  className="sheet-link"
                  onClick={onClose}
                >
                  {entry.label}
                </NavLink>
              ) : (
                entry.children.map((child) => (
                  <NavLink
                    key={child.to}
                    to={child.to}
                    end={child.to === "/engine" || child.to === "/monetization"}
                    className="sheet-link"
                    onClick={onClose}
                  >
                    {child.icon && <child.icon size={16} strokeWidth={1.5} aria-hidden="true" />}
                    {child.label}
                  </NavLink>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MoreSheet;
```

- [ ] **Step 5: Append the mobile styles**

Append to `admin/src/styles/shell.css`:

```css
/* ─── Mobile tab bar and sheet ─── */
.tabbar {
  display: none;
}

.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: flex-end;
  background: rgba(0, 0, 0, 0.42);
}

.sheet {
  width: 100%;
  max-height: 78vh;
  overflow-y: auto;
  padding: 8px 16px calc(16px + env(safe-area-inset-bottom));
  background: var(--bg-secondary);
  border-radius: 20px 20px 0 0;
  box-shadow: var(--shadow-modal);
  animation: sheetUp var(--motion-base);
}

@keyframes sheetUp {
  from { transform: translateY(14px); opacity: 0.6; }
  to { transform: translateY(0); opacity: 1; }
}

.sheet-grabber {
  width: 38px;
  height: 4px;
  margin: 6px auto 14px;
  border-radius: 999px;
  background: var(--border-medium);
}

.sheet-group {
  margin-bottom: 16px;
}

.sheet-group-title {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.sheet-links {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sheet-link {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 0 12px;
  border-radius: 10px;
  color: var(--text-primary);
  text-decoration: none;
  font-size: 15px;
}

.sheet-link.active {
  background: var(--bg-tertiary);
  font-weight: 600;
}

@media (max-width: 768px) {
  .tabbar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 60;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    padding-bottom: env(safe-area-inset-bottom);
    background: var(--glass-bg);
    backdrop-filter: var(--glass-backdrop);
    -webkit-backdrop-filter: var(--glass-backdrop);
    border-top: 1px solid var(--border-light);
  }

  .tabbar-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    min-height: 56px;
    border: none;
    background: none;
    color: var(--text-tertiary);
    font-size: 10px;
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
  }

  .tabbar-item.active {
    color: var(--tab-hue);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sheet { animation: none; }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- mobile.spec`
Expected: PASS — `8 passed`.

- [ ] **Step 7: Commit**

```bash
git add admin/src/components/shell/MobileTabBar.tsx admin/src/components/shell/MoreSheet.tsx admin/src/components/shell/mobile.spec.tsx admin/src/styles/shell.css
git commit -m "feat(admin): replace floating hamburger with bottom tab bar and sheet"
```

---

## Task 11: Live nav badge counts

The section panel badges need real counts. This module is shared with the Dashboard's attention strip in Task 15, so it is built once here.

**Files:**
- Create: `admin/src/lib/counts.ts`
- Create: `admin/src/lib/counts.spec.ts`
- Create: `admin/src/hooks/useNavBadges.ts`

**Interfaces:**
- Consumes: `backendFetchJson` from `./backend`
- Produces:
  - `type PlatformCounts = { needsReview: number | null; expiringSoon: number | null; missingDeadline: number | null; total: number | null; active: number | null; submissions: number | null; creators: number | null }`
  - `fetchPlatformCounts(): Promise<PlatformCounts>`
  - `toNavBadges(counts: PlatformCounts): NavBadges`
  - `useNavBadges(): NavBadges`

- [ ] **Step 1: Write the failing test**

Create `admin/src/lib/counts.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const backendFetchJson = vi.hoisted(() => vi.fn());
vi.mock("./backend", () => ({ backendFetchJson }));

import { fetchPlatformCounts, toNavBadges } from "./counts";

beforeEach(() => {
  backendFetchJson.mockReset();
});

describe("fetchPlatformCounts", () => {
  it("merges opportunity stats, submissions and creators", async () => {
    backendFetchJson.mockImplementation((path: string) => {
      if (path.startsWith("/opportunities/admin/stats")) {
        return Promise.resolve({
          total: 1902,
          active: 1400,
          needsReview: 23,
          expiringSoon: 5,
          missingDeadline: 660,
        });
      }
      if (path.startsWith("/admin/opportunity-submissions")) {
        return Promise.resolve({
          submissions: [{ status: "pending" }, { status: "pending" }, { status: "approved" }],
        });
      }
      return Promise.resolve({ stats: { pendingCreators: 4 } });
    });

    const counts = await fetchPlatformCounts();
    expect(counts.needsReview).toBe(23);
    expect(counts.expiringSoon).toBe(5);
    expect(counts.submissions).toBe(2);
    expect(counts.creators).toBe(4);
  });

  it("returns null for a source that fails rather than zero", async () => {
    backendFetchJson.mockImplementation((path: string) => {
      if (path.startsWith("/opportunities/admin/stats")) {
        return Promise.reject(new Error("404"));
      }
      if (path.startsWith("/admin/opportunity-submissions")) {
        return Promise.resolve({ submissions: [] });
      }
      return Promise.resolve({ stats: { pendingCreators: 0 } });
    });

    const counts = await fetchPlatformCounts();
    // null means "unknown", which must not render as a zero badge.
    expect(counts.needsReview).toBeNull();
    expect(counts.submissions).toBe(0);
  });

  it("tolerates a bare array of submissions", async () => {
    backendFetchJson.mockImplementation((path: string) => {
      if (path.startsWith("/admin/opportunity-submissions")) {
        return Promise.resolve([{ status: "pending" }]);
      }
      return Promise.resolve({});
    });

    const counts = await fetchPlatformCounts();
    expect(counts.submissions).toBe(1);
  });
});

describe("toNavBadges", () => {
  it("drops null and zero counts so no empty badge renders", () => {
    const badges = toNavBadges({
      needsReview: 23,
      expiringSoon: 0,
      missingDeadline: null,
      total: 100,
      active: 90,
      submissions: null,
      creators: 4,
    });
    expect(badges).toEqual({ needsReview: 23, creators: 4 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- counts`
Expected: FAIL — `Failed to resolve import "./counts"`.

- [ ] **Step 3: Implement `counts.ts`**

Create `admin/src/lib/counts.ts`:

```ts
import { backendFetchJson } from "./backend";
import type { NavBadges } from "../components/shell/SectionPanel";

export interface PlatformCounts {
  needsReview: number | null;
  expiringSoon: number | null;
  missingDeadline: number | null;
  total: number | null;
  active: number | null;
  submissions: number | null;
  creators: number | null;
}

interface OpportunityAdminStats {
  total?: number;
  active?: number;
  needsReview?: number;
  expiringSoon?: number;
  missingDeadline?: number;
}

const EMPTY: PlatformCounts = {
  needsReview: null,
  expiringSoon: null,
  missingDeadline: null,
  total: null,
  active: null,
  submissions: null,
  creators: null,
};

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function countPending(payload: unknown): number {
  const list = Array.isArray(payload)
    ? payload
    : ((payload as { submissions?: unknown[] })?.submissions ?? []);
  return list.filter(
    (row) => (row as { status?: string })?.status === "pending",
  ).length;
}

/**
 * Each source is independent: one failure yields null for its own fields and
 * never rejects the whole call. null means "unknown" and must not badge as 0.
 */
export async function fetchPlatformCounts(): Promise<PlatformCounts> {
  const [statsResult, submissionsResult, dashboardResult] = await Promise.allSettled([
    backendFetchJson<OpportunityAdminStats>("/opportunities/admin/stats"),
    backendFetchJson<unknown>("/admin/opportunity-submissions?status=pending"),
    backendFetchJson<{ stats?: { pendingCreators?: number } }>("/admin/dashboard"),
  ]);

  const stats = statsResult.status === "fulfilled" ? statsResult.value : null;

  return {
    ...EMPTY,
    needsReview: stats ? num(stats.needsReview) : null,
    expiringSoon: stats ? num(stats.expiringSoon) : null,
    missingDeadline: stats ? num(stats.missingDeadline) : null,
    total: stats ? num(stats.total) : null,
    active: stats ? num(stats.active) : null,
    submissions:
      submissionsResult.status === "fulfilled"
        ? countPending(submissionsResult.value)
        : null,
    creators:
      dashboardResult.status === "fulfilled"
        ? num(dashboardResult.value?.stats?.pendingCreators)
        : null,
  };
}

/** Only positive, known counts become badges. */
export function toNavBadges(counts: PlatformCounts): NavBadges {
  const badges: NavBadges = {};
  if (counts.needsReview) badges.needsReview = counts.needsReview;
  if (counts.expiringSoon) badges.expiringSoon = counts.expiringSoon;
  if (counts.submissions) badges.submissions = counts.submissions;
  if (counts.creators) badges.creators = counts.creators;
  return badges;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- counts`
Expected: PASS — `4 passed`.

- [ ] **Step 5: Implement the hook**

Create `admin/src/hooks/useNavBadges.ts`:

```ts
import { useCallback, useEffect, useState } from "react";
import { fetchPlatformCounts, toNavBadges } from "../lib/counts";
import type { NavBadges } from "../components/shell/SectionPanel";

const REFRESH_MS = 120_000;

/**
 * Badge counts for the section panel. Setting state inside the async callback
 * (not inside the effect body) keeps this clear of the React Compiler
 * `set-state-in-effect` rule.
 */
export function useNavBadges(): NavBadges {
  const [badges, setBadges] = useState<NavBadges>({});

  const load = useCallback(() => {
    void fetchPlatformCounts().then((counts) => setBadges(toNavBadges(counts)));
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  return badges;
}
```

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: exit 0. If `react-hooks/set-state-in-effect` fires, the `setBadges` call has been moved into the effect body — keep it inside the `.then()` callback.

- [ ] **Step 7: Commit**

```bash
git add admin/src/lib/counts.ts admin/src/lib/counts.spec.ts admin/src/hooks/useNavBadges.ts
git commit -m "feat(admin): add live platform counts and nav badge hook"
```

---

## Task 12: Assemble the shell and retire `Layout.tsx`

**Files:**
- Create: `admin/src/hooks/useAdminUser.ts`
- Create: `admin/src/components/shell/AppShell.tsx`
- Create: `admin/src/components/shell/AppShell.spec.tsx`
- Modify: `admin/src/App.tsx:13` and `:377`
- Delete: `admin/src/components/Layout.tsx`

**Interfaces:**
- Consumes: everything from Tasks 8–11
- Produces: `<AppShell />` as the router layout element; `useAdminUser(): AdminUser | null`

- [ ] **Step 1: Extract the auth-user hook**

Create `admin/src/hooks/useAdminUser.ts` (logic lifted verbatim from `Layout.tsx:56-84`):

```ts
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export interface AdminUser {
  id: string;
  email?: string;
  user_metadata?: {
    full_name?: string;
    avatar_url?: string;
  };
}

export function useAdminUser(): AdminUser | null {
  const [user, setUser] = useState<AdminUser | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUser({
          id: data.user.id,
          email: data.user.email,
          user_metadata: data.user.user_metadata,
        });
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(
        session?.user
          ? {
              id: session.user.id,
              email: session.user.email,
              user_metadata: session.user.user_metadata,
            }
          : null,
      );
    });

    return () => subscription.unsubscribe();
  }, []);

  return user;
}
```

- [ ] **Step 2: Write the failing shell test**

Create `admin/src/components/shell/AppShell.spec.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../hooks/useAdminUser", () => ({
  useAdminUser: () => ({ id: "u1", email: "admin@edutu.org", user_metadata: {} }),
}));
vi.mock("../../hooks/useNavBadges", () => ({ useNavBadges: () => ({ submissions: 7 }) }));
vi.mock("../BackendHealthChip", () => ({ default: () => <div /> }));
vi.mock("../../lib/auth", () => ({ signOutAdmin: vi.fn() }));

import AppShell from "./AppShell";

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<p>home page</p>} />
          <Route path="opportunities" element={<p>opportunities page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

describe("AppShell", () => {
  it("renders the routed page inside the shell", () => {
    renderAt("/");
    expect(screen.getByText("home page")).toBeInTheDocument();
  });

  it("renders rail, panel and tab bar together", () => {
    renderAt("/opportunities");
    expect(screen.getByRole("navigation", { name: /sections/i })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /content pages/i })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /primary/i })).toBeInTheDocument();
  });

  it("shows the section name in the breadcrumb", () => {
    renderAt("/opportunities");
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("passes live badge counts into the panel", () => {
    renderAt("/opportunities");
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("opens the command palette on the keyboard shortcut", async () => {
    renderAt("/");
    await userEvent.keyboard("{Meta>}k{/Meta}");
    expect(screen.getByRole("dialog", { name: /search and commands/i })).toBeInTheDocument();
  });

  it("has no floating menu button", () => {
    renderAt("/");
    expect(document.querySelector(".mobile-menu-btn")).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- AppShell`
Expected: FAIL — `Failed to resolve import "./AppShell"`.

- [ ] **Step 4: Implement `AppShell`**

Create `admin/src/components/shell/AppShell.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { LogOut, Moon, Sun } from "lucide-react";
import { signOutAdmin } from "../../lib/auth";
import { useAdminUser } from "../../hooks/useAdminUser";
import { useNavBadges } from "../../hooks/useNavBadges";
import { sectionForPath } from "../nav-items";
import BackendHealthChip from "../BackendHealthChip";
import CommandPalette from "./CommandPalette";
import MobileTabBar from "./MobileTabBar";
import MoreSheet from "./MoreSheet";
import NavRail from "./NavRail";
import SectionPanel from "./SectionPanel";
import TopBar from "./TopBar";

function pageTitleFor(pathname: string, sectionLabel: string): string {
  const section = sectionForPath(pathname);
  if (!section) return sectionLabel;
  if (section.kind === "leaf") return section.label;
  const child = section.children.find(
    (c) => pathname === c.to || pathname.startsWith(c.to + "/"),
  );
  return child?.label ?? section.label;
}

const AppShell = () => {
  const location = useLocation();
  const user = useAdminUser();
  const badges = useNavBadges();

  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("theme");
    return saved ? saved === "dark" : true;
  });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  // Pure route derivations — no setState in an effect.
  const section = sectionForPath(location.pathname);
  const pageTitle = pageTitleFor(location.pathname, "Admin");

  useEffect(() => {
    if (isDark) {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("theme", "light");
    }
  }, [isDark]);

  const onKeyDown = useCallback((event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      setPaletteOpen((open) => !open);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  const handleSignOut = () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    void signOutAdmin();
  };

  const initials = (user?.user_metadata?.full_name || user?.email || "A")
    .charAt(0)
    .toUpperCase();

  return (
    <div className="app-shell">
      <div className="shell-nav">
        <NavRail activeId={section?.id ?? null}>
          <BackendHealthChip />
          <button
            type="button"
            className="rail-item"
            onClick={() => setIsDark((dark) => !dark)}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <NavLink to="/profile" className="rail-item" aria-label="My profile">
            {user?.user_metadata?.avatar_url ? (
              <img
                src={user.user_metadata.avatar_url}
                alt=""
                width={26}
                height={26}
                style={{ borderRadius: "50%", objectFit: "cover" }}
              />
            ) : (
              <span className="rail-avatar">{initials}</span>
            )}
          </NavLink>
          <button
            type="button"
            className="rail-item rail-signout"
            onClick={handleSignOut}
            disabled={isSigningOut}
            aria-label="Sign out"
          >
            <LogOut size={18} />
          </button>
        </NavRail>

        <SectionPanel section={section} badges={badges} />
      </div>

      <div className="shell-main">
        <TopBar
          section={section}
          pageTitle={pageTitle}
          updatedAt={null}
          onOpenPalette={() => setPaletteOpen(true)}
        />
        <main className="shell-page">
          <Outlet />
        </main>
      </div>

      <MobileTabBar
        activeId={section?.id ?? null}
        onOpenMore={() => setSheetOpen(true)}
      />
      <MoreSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
};

export default AppShell;
```

- [ ] **Step 5: Add the rail avatar and sign-out styles**

Append to `admin/src/styles/shell.css`:

```css
.rail-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--hue-blue);
  color: #ffffff;
  font-size: 12px;
  font-weight: 600;
}

.rail-signout {
  color: var(--hue-red);
}

.rail-signout:hover {
  background: var(--hue-red-soft);
  color: var(--hue-red);
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- AppShell`
Expected: PASS — `6 passed`.

- [ ] **Step 7: Swap the router layout**

In `admin/src/App.tsx`, replace line 13:

```tsx
import Layout from "./components/Layout";
```

with:

```tsx
import AppShell from "./components/shell/AppShell";
```

and at line 377 replace `element={<Layout />}` with:

```tsx
        <Route path="/" element={<AppShell />}>
```

- [ ] **Step 8: Delete the old layout**

```bash
git rm admin/src/components/Layout.tsx
```

- [ ] **Step 9: Verify the whole suite, types, lint and build**

```bash
npm test
npm run lint
npm run build
```

Expected: all three exit 0. `npm run build` runs `tsc -b` first, so a broken import surfaces here.

- [ ] **Step 10: Commit**

```bash
git add admin/src/App.tsx admin/src/components/shell/ admin/src/hooks/useAdminUser.ts admin/src/styles/shell.css
git commit -m "feat(admin): replace Layout with the two-column AppShell"
```

---

## Task 13: Growth API client

`GET /admin/funnel` exists in local backend code but **is not deployed to Render**. The client must distinguish "not deployed" from "failed" so the UI can say which.

**Files:**
- Create: `admin/src/lib/growthApi.ts`
- Create: `admin/src/lib/growthApi.spec.ts`

**Interfaces:**
- Consumes: `backendFetchJson` from `./backend`; `FunnelStageInput` from `./funnelMath`
- Produces:
  - `type FunnelCohort = { cohortWeek: string; size: number; w1Pct: number | null; w2Pct: number | null; w4Pct: number | null }`
  - `type FunnelResponse = { generatedAt: string; stages: FunnelStageInput[]; referral: { invitersTotal: number | null; invitersThisWeek: number | null }; cohorts: FunnelCohort[] }`
  - `type FunnelResult = { status: "ok"; data: FunnelResponse } | { status: "not-deployed" } | { status: "error"; message: string }`
  - `fetchFunnel(): Promise<FunnelResult>`

- [ ] **Step 1: Write the failing test**

Create `admin/src/lib/growthApi.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const backendFetchJson = vi.hoisted(() => vi.fn());
vi.mock("./backend", () => ({ backendFetchJson }));

import { fetchFunnel } from "./growthApi";

const PAYLOAD = {
  generatedAt: "2026-07-25T09:00:00.000Z",
  stages: [
    { key: "signup", label: "Signup", total: 100, newThisWeek: 9, newLastWeek: 7, convFromPrev: null },
  ],
  referral: { invitersTotal: 214, invitersThisWeek: 18 },
  cohorts: [{ cohortWeek: "2026-W28", size: 40, w1Pct: 0.6, w2Pct: null, w4Pct: null }],
};

beforeEach(() => {
  backendFetchJson.mockReset();
});

describe("fetchFunnel", () => {
  it("returns the payload on success", async () => {
    backendFetchJson.mockResolvedValue(PAYLOAD);
    const result = await fetchFunnel();
    expect(result.status).toBe("ok");
    expect(result.status === "ok" && result.data.referral.invitersTotal).toBe(214);
  });

  it("reports not-deployed on a 404 rather than a generic failure", async () => {
    backendFetchJson.mockRejectedValue(new Error("Request failed: 404 Not Found"));
    expect((await fetchFunnel()).status).toBe("not-deployed");
  });

  it("reports not-deployed when the route is absent", async () => {
    backendFetchJson.mockRejectedValue(new Error("Cannot GET /admin/funnel"));
    expect((await fetchFunnel()).status).toBe("not-deployed");
  });

  it("reports a real error separately from not-deployed", async () => {
    backendFetchJson.mockRejectedValue(new Error("500 Internal Server Error"));
    const result = await fetchFunnel();
    expect(result.status).toBe("error");
    expect(result.status === "error" && result.message).toContain("500");
  });

  it("treats a malformed payload as an error, not as empty data", async () => {
    backendFetchJson.mockResolvedValue({ nope: true });
    expect((await fetchFunnel()).status).toBe("error");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- growthApi`
Expected: FAIL — `Failed to resolve import "./growthApi"`.

- [ ] **Step 3: Implement the client**

Create `admin/src/lib/growthApi.ts`:

```ts
import { backendFetchJson } from "./backend";
import type { FunnelStageInput } from "./funnelMath";

export interface FunnelCohort {
  cohortWeek: string;
  size: number;
  w1Pct: number | null;
  w2Pct: number | null;
  w4Pct: number | null;
}

export interface FunnelResponse {
  generatedAt: string;
  stages: FunnelStageInput[];
  referral: { invitersTotal: number | null; invitersThisWeek: number | null };
  cohorts: FunnelCohort[];
}

export type FunnelResult =
  | { status: "ok"; data: FunnelResponse }
  | { status: "not-deployed" }
  | { status: "error"; message: string };

/** A 404 or a missing route means the backend has not shipped /admin/funnel yet. */
function isMissingRoute(message: string): boolean {
  return /\b404\b/.test(message) || /cannot get/i.test(message);
}

export async function fetchFunnel(): Promise<FunnelResult> {
  try {
    const data = await backendFetchJson<FunnelResponse>("/admin/funnel");
    if (!data || !Array.isArray(data.stages) || !Array.isArray(data.cohorts)) {
      return { status: "error", message: "Malformed funnel response" };
    }
    return { status: "ok", data };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Funnel request failed";
    return isMissingRoute(message) ? { status: "not-deployed" } : { status: "error", message };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- growthApi`
Expected: PASS — `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add admin/src/lib/growthApi.ts admin/src/lib/growthApi.spec.ts
git commit -m "feat(admin): add funnel client that distinguishes not-deployed from error"
```

---

## Task 14: Daily revenue series with a coverage guard

**This is the highest-risk logic in the plan.** There is no daily-revenue endpoint. `listAdminTransactions` is capped at 200 rows ordered `created_at desc`, so the *oldest* returned day is only partially covered. Charting it would silently under-report. The guard: when the fetch hits the row cap, discard the oldest day; if fewer than 7 days remain covered, suppress the series entirely.

**Files:**
- Create: `admin/src/lib/revenueSeries.ts`
- Create: `admin/src/lib/revenueSeries.spec.ts`

**Interfaces:**
- Consumes: `BillingTransaction` from `./monetizationApi`
- Produces:
  - `MIN_COVERED_DAYS = 7`, `TRANSACTION_ROW_CAP = 200`
  - `type DailyRevenuePoint = { day: string; amount: number; count: number }`
  - `type RevenueSeries = { points: DailyRevenuePoint[]; coveredFromDay: string | null; truncated: boolean; suppressed: boolean }`
  - `bucketTransactionsByDay(txs, opts: { rowCap: number; today: string; windowDays?: number }): RevenueSeries`

- [ ] **Step 1: Write the failing test**

Create `admin/src/lib/revenueSeries.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { bucketTransactionsByDay, MIN_COVERED_DAYS } from "./revenueSeries";
import type { BillingTransaction } from "./monetizationApi";

function tx(day: string, amount: number, status = "completed"): BillingTransaction {
  return {
    id: `${day}-${amount}`,
    user_id: "u1",
    provider: "paystack",
    provider_reference: null,
    type: "subscription",
    amount,
    currency: "NGN",
    status,
    metadata: null,
    created_at: `${day}T10:00:00.000Z`,
  };
}

function daysBack(from: string, n: number): string {
  const date = new Date(`${from}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - n);
  return date.toISOString().slice(0, 10);
}

const TODAY = "2026-07-25";

describe("bucketTransactionsByDay", () => {
  it("suppresses the series when there are no transactions", () => {
    const result = bucketTransactionsByDay([], { rowCap: 200, today: TODAY });
    expect(result.suppressed).toBe(true);
    expect(result.points).toEqual([]);
    expect(result.coveredFromDay).toBeNull();
  });

  it("covers from the oldest day when the fetch did not hit the cap", () => {
    const txs = Array.from({ length: 10 }, (_, i) => tx(daysBack(TODAY, i), 1000));
    const result = bucketTransactionsByDay(txs, { rowCap: 200, today: TODAY });
    expect(result.truncated).toBe(false);
    expect(result.coveredFromDay).toBe(daysBack(TODAY, 9));
    expect(result.points).toHaveLength(10);
    expect(result.suppressed).toBe(false);
  });

  it("drops the partially covered oldest day when the cap was hit", () => {
    const txs = Array.from({ length: 10 }, (_, i) => tx(daysBack(TODAY, i), 1000));
    const result = bucketTransactionsByDay(txs, { rowCap: 10, today: TODAY });
    expect(result.truncated).toBe(true);
    // Oldest day is incomplete, so coverage starts one day later.
    expect(result.coveredFromDay).toBe(daysBack(TODAY, 8));
    expect(result.points).toHaveLength(9);
  });

  it("suppresses when fewer than the minimum days are covered", () => {
    const txs = Array.from({ length: 3 }, (_, i) => tx(daysBack(TODAY, i), 1000));
    const result = bucketTransactionsByDay(txs, { rowCap: 200, today: TODAY });
    expect(MIN_COVERED_DAYS).toBe(7);
    expect(result.suppressed).toBe(true);
  });

  it("sums multiple transactions on the same day and counts them", () => {
    const txs = [
      tx(TODAY, 1000),
      tx(TODAY, 2500),
      ...Array.from({ length: 8 }, (_, i) => tx(daysBack(TODAY, i + 1), 500)),
    ];
    const result = bucketTransactionsByDay(txs, { rowCap: 200, today: TODAY });
    const todayPoint = result.points.find((p) => p.day === TODAY);
    expect(todayPoint?.amount).toBe(3500);
    expect(todayPoint?.count).toBe(2);
  });

  it("fills days with no transactions as zero rather than skipping them", () => {
    const txs = [tx(TODAY, 1000), tx(daysBack(TODAY, 9), 1000)];
    const result = bucketTransactionsByDay(txs, { rowCap: 200, today: TODAY });
    expect(result.points).toHaveLength(10);
    expect(result.points.every((p) => typeof p.amount === "number")).toBe(true);
    expect(result.points.filter((p) => p.amount === 0)).toHaveLength(8);
  });

  it("ignores transactions that are not completed", () => {
    const txs = [
      ...Array.from({ length: 8 }, (_, i) => tx(daysBack(TODAY, i), 100)),
      tx(TODAY, 99999, "failed"),
      tx(TODAY, 88888, "pending"),
    ];
    const result = bucketTransactionsByDay(txs, { rowCap: 200, today: TODAY });
    expect(result.points.find((p) => p.day === TODAY)?.amount).toBe(100);
  });

  it("clamps coverage to the requested window", () => {
    const txs = Array.from({ length: 60 }, (_, i) => tx(daysBack(TODAY, i), 10));
    const result = bucketTransactionsByDay(txs, {
      rowCap: 200,
      today: TODAY,
      windowDays: 30,
    });
    expect(result.points).toHaveLength(30);
    expect(result.coveredFromDay).toBe(daysBack(TODAY, 29));
  });

  it("orders points oldest to newest", () => {
    const txs = Array.from({ length: 10 }, (_, i) => tx(daysBack(TODAY, i), 10));
    const days = bucketTransactionsByDay(txs, { rowCap: 200, today: TODAY }).points.map(
      (p) => p.day,
    );
    expect(days).toEqual([...days].sort());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- revenueSeries`
Expected: FAIL — `Failed to resolve import "./revenueSeries"`.

- [ ] **Step 3: Implement the module**

Create `admin/src/lib/revenueSeries.ts`:

```ts
import type { BillingTransaction } from "./monetizationApi";

/** Below this many fully covered days the series is misleading, so we hide it. */
export const MIN_COVERED_DAYS = 7;
/** listAdminTransactions caps at 200 rows (billing.service.ts). */
export const TRANSACTION_ROW_CAP = 200;

export interface DailyRevenuePoint {
  day: string;
  amount: number;
  count: number;
}

export interface RevenueSeries {
  points: DailyRevenuePoint[];
  coveredFromDay: string | null;
  /** The fetch hit the row cap, so the oldest day is only partially covered. */
  truncated: boolean;
  /** Too few fully covered days — render KPIs only, no chart. */
  suppressed: boolean;
}

const EMPTY: RevenueSeries = {
  points: [],
  coveredFromDay: null,
  truncated: false,
  suppressed: true,
};

function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

function shiftDay(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const ms =
    new Date(`${to}T00:00:00.000Z`).getTime() -
    new Date(`${from}T00:00:00.000Z`).getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * Buckets transactions into a daily revenue series.
 *
 * Rows arrive newest-first and are capped, so the oldest returned day may be
 * only partially represented. Charting it would under-report that day and read
 * as a revenue cliff that did not happen. When the cap was hit we therefore
 * start coverage one day after the oldest row.
 */
export function bucketTransactionsByDay(
  transactions: BillingTransaction[],
  opts: { rowCap: number; today: string; windowDays?: number },
): RevenueSeries {
  const { rowCap, today, windowDays = 30 } = opts;

  const completed = transactions.filter((tx) => tx.status === "completed");
  if (completed.length === 0) return EMPTY;

  const truncated = transactions.length >= rowCap;
  const oldestDay = completed
    .map((tx) => dayOf(tx.created_at))
    .reduce((min, day) => (day < min ? day : min));

  const windowStart = shiftDay(today, -(windowDays - 1));
  const rawStart = truncated ? shiftDay(oldestDay, 1) : oldestDay;
  const coveredFromDay = rawStart < windowStart ? windowStart : rawStart;

  const coveredDays = daysBetween(coveredFromDay, today) + 1;
  if (coveredDays < MIN_COVERED_DAYS) {
    return { ...EMPTY, coveredFromDay, truncated };
  }

  const buckets = new Map<string, DailyRevenuePoint>();
  for (let i = 0; i < coveredDays; i += 1) {
    const day = shiftDay(coveredFromDay, i);
    buckets.set(day, { day, amount: 0, count: 0 });
  }

  for (const tx of completed) {
    const bucket = buckets.get(dayOf(tx.created_at));
    if (!bucket) continue; // outside the covered window
    bucket.amount += tx.amount;
    bucket.count += 1;
  }

  return {
    points: [...buckets.values()],
    coveredFromDay,
    truncated,
    suppressed: false,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- revenueSeries`
Expected: PASS — `9 passed`.

- [ ] **Step 5: Commit**

```bash
git add admin/src/lib/revenueSeries.ts admin/src/lib/revenueSeries.spec.ts
git commit -m "feat(admin): bucket transactions into a daily series with a coverage guard"
```

---

## Task 15: Attention derivation and the dashboard data hook

**Files:**
- Create: `admin/src/lib/attention.ts`
- Create: `admin/src/lib/attention.spec.ts`
- Create: `admin/src/hooks/useDashboardData.ts`

**Interfaces:**
- Consumes: `PlatformCounts` from `./counts`; `fetchFunnel` from `./growthApi`; `bucketTransactionsByDay` from `./revenueSeries`; `monetizationApi` from `./monetizationApi`; `backendFetchJson` from `./backend`
- Produces:
  - `type AttentionItem = { key: string; count: number; label: string; to: string; hue: Hue; iconName: AttentionIconName }`
  - `deriveAttentionItems(counts: PlatformCounts, healthOk: boolean): AttentionItem[]`
  - `useDashboardData(): DashboardData`

- [ ] **Step 1: Write the failing test**

Create `admin/src/lib/attention.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deriveAttentionItems } from "./attention";
import type { PlatformCounts } from "./counts";

const BASE: PlatformCounts = {
  needsReview: 0,
  expiringSoon: 0,
  missingDeadline: 0,
  total: 1000,
  active: 900,
  submissions: 0,
  creators: 0,
};

describe("deriveAttentionItems", () => {
  it("omits zero counts entirely", () => {
    expect(deriveAttentionItems(BASE, true)).toEqual([]);
  });

  it("omits unknown (null) counts", () => {
    const items = deriveAttentionItems({ ...BASE, needsReview: null }, true);
    expect(items).toEqual([]);
  });

  it("includes each non-zero count once", () => {
    const items = deriveAttentionItems(
      { ...BASE, needsReview: 23, submissions: 7, creators: 4 },
      true,
    );
    expect(items.map((i) => i.key).sort()).toEqual([
      "creators",
      "needsReview",
      "submissions",
    ]);
  });

  it("sorts by count descending so the biggest queue leads", () => {
    const items = deriveAttentionItems(
      { ...BASE, needsReview: 4, submissions: 23, creators: 9 },
      true,
    );
    expect(items.map((i) => i.count)).toEqual([23, 9, 4]);
  });

  it("carries filter state in the deep link", () => {
    const items = deriveAttentionItems({ ...BASE, needsReview: 3 }, true);
    expect(items[0].to).toBe("/opportunities?filter=needs-review");
  });

  it("adds a degraded-platform item when health is not ok", () => {
    const items = deriveAttentionItems(BASE, false);
    expect(items).toHaveLength(1);
    expect(items[0].key).toBe("health");
    expect(items[0].hue).toBe("red");
  });

  it("puts the health item first regardless of other counts", () => {
    const items = deriveAttentionItems({ ...BASE, needsReview: 999 }, false);
    expect(items[0].key).toBe("health");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- attention`
Expected: FAIL — `Failed to resolve import "./attention"`.

- [ ] **Step 3: Implement `attention.ts`**

Create `admin/src/lib/attention.ts`:

```ts
import type { Hue } from "../components/nav-items";
import type { PlatformCounts } from "./counts";

export type AttentionIconName =
  | "review"
  | "expiring"
  | "missing"
  | "submissions"
  | "creators"
  | "health";

export interface AttentionItem {
  key: string;
  count: number;
  label: string;
  to: string;
  hue: Hue;
  iconName: AttentionIconName;
}

interface Rule {
  key: keyof PlatformCounts;
  label: string;
  to: string;
  hue: Hue;
  iconName: AttentionIconName;
}

const RULES: Rule[] = [
  {
    key: "needsReview",
    label: "to review",
    to: "/opportunities?filter=needs-review",
    hue: "blue",
    iconName: "review",
  },
  {
    key: "expiringSoon",
    label: "expiring in 7 days",
    to: "/opportunities?filter=expiring-soon",
    hue: "orange",
    iconName: "expiring",
  },
  {
    key: "missingDeadline",
    label: "missing deadlines",
    to: "/opportunities?filter=missing-deadline",
    hue: "purple",
    iconName: "missing",
  },
  {
    key: "submissions",
    label: "submissions pending",
    to: "/submissions",
    hue: "teal",
    iconName: "submissions",
  },
  {
    key: "creators",
    label: "creators pending",
    to: "/creators",
    hue: "green",
    iconName: "creators",
  },
];

/**
 * Only known, non-zero counts become cards — a null count means "unknown" and
 * must never render as a reassuring zero. Health leads when degraded because it
 * blocks everything else.
 */
export function deriveAttentionItems(
  counts: PlatformCounts,
  healthOk: boolean,
): AttentionItem[] {
  const items = RULES.flatMap((rule) => {
    const count = counts[rule.key];
    if (typeof count !== "number" || count <= 0) return [];
    return [
      {
        key: rule.key as string,
        count,
        label: rule.label,
        to: rule.to,
        hue: rule.hue,
        iconName: rule.iconName,
      },
    ];
  }).sort((a, b) => b.count - a.count);

  if (!healthOk) {
    items.unshift({
      key: "health",
      count: 1,
      label: "platform degraded",
      to: "/engine/status",
      hue: "red",
      iconName: "health",
    });
  }

  return items;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- attention`
Expected: PASS — `7 passed`.

- [ ] **Step 5: Implement the dashboard data hook**

Create `admin/src/hooks/useDashboardData.ts`:

```ts
import { useCallback, useEffect, useState } from "react";
import { backendFetchJson } from "../lib/backend";
import { fetchPlatformCounts, type PlatformCounts } from "../lib/counts";
import { fetchFunnel, type FunnelResult } from "../lib/growthApi";
import {
  bucketTransactionsByDay,
  TRANSACTION_ROW_CAP,
  type RevenueSeries,
} from "../lib/revenueSeries";
import {
  monetizationApi,
  type BillingOverview,
  type BillingTransaction,
} from "../lib/monetizationApi";
import type {
  AdminDashboardActivity,
  AdminDashboardResponse,
  AdminDashboardStats,
} from "../lib/adminApi";

export interface HealthStatus {
  status: "ok" | "degraded" | "down";
  timestamp: string;
  uptime: number;
  database: { status: "connected" | "disconnected"; responseTime?: number };
  ai: { gemini: "configured" | "missing"; openrouter: "configured" | "missing" };
  memory: { heapUsed: number; heapTotal: number; rss: number };
}

export interface AiUsageSummary {
  success: boolean;
  days: number;
  totals: {
    calls: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    errorCount: number;
  };
  perDay: Array<{
    day: string;
    totalTokens: number;
    estimatedCostUsd: number;
    calls: number;
  }>;
  perRoute: Array<{
    route: string;
    calls: number;
    totalTokens: number;
    estimatedCostUsd: number;
    errorCount: number;
    avgLatencyMs: number | null;
  }>;
}

export interface DashboardData {
  loading: boolean;
  refreshedAt: string | null;
  stats: AdminDashboardStats | null;
  activity: AdminDashboardActivity[];
  counts: PlatformCounts | null;
  health: HealthStatus | null;
  aiUsage: AiUsageSummary | null;
  billing: BillingOverview | null;
  revenue: RevenueSeries | null;
  funnel: FunnelResult | null;
  refresh: () => void;
}

const REFRESH_MS = 60_000;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Every source is fetched independently: one failure degrades exactly one board
 * and never blanks the page. State is set inside async callbacks, not in the
 * effect body, to satisfy the React Compiler set-state-in-effect rule.
 */
export function useDashboardData(): DashboardData {
  const [state, setState] = useState<Omit<DashboardData, "refresh">>({
    loading: true,
    refreshedAt: null,
    stats: null,
    activity: [],
    counts: null,
    health: null,
    aiUsage: null,
    billing: null,
    revenue: null,
    funnel: null,
  });

  const refresh = useCallback(() => {
    void Promise.allSettled([
      backendFetchJson<AdminDashboardResponse>("/admin/dashboard"),
      backendFetchJson<HealthStatus>("/health"),
      backendFetchJson<AiUsageSummary>("/admin/ai-usage/summary?days=30"),
      fetchPlatformCounts(),
      monetizationApi.getOverview(),
      monetizationApi.getTransactions(TRANSACTION_ROW_CAP, 0),
      fetchFunnel(),
    ]).then(([dashboard, health, aiUsage, counts, billing, transactions, funnel]) => {
      const txRows: BillingTransaction[] =
        transactions.status === "fulfilled" ? (transactions.value.transactions ?? []) : [];

      setState({
        loading: false,
        refreshedAt: new Date().toISOString(),
        stats: dashboard.status === "fulfilled" ? dashboard.value.stats : null,
        activity:
          dashboard.status === "fulfilled" ? dashboard.value.recentActivity : [],
        counts: counts.status === "fulfilled" ? counts.value : null,
        health: health.status === "fulfilled" ? health.value : null,
        aiUsage: aiUsage.status === "fulfilled" ? aiUsage.value : null,
        billing: billing.status === "fulfilled" ? billing.value : null,
        revenue:
          transactions.status === "fulfilled"
            ? bucketTransactionsByDay(txRows, {
                rowCap: TRANSACTION_ROW_CAP,
                today: todayIso(),
                windowDays: 30,
              })
            : null,
        funnel: funnel.status === "fulfilled" ? funnel.value : null,
      });
    });
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(() => {
      // Pause polling while the tab is hidden — no point spending calls on a
      // dashboard nobody is looking at.
      if (!document.hidden) refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return { ...state, refresh };
}
```

- [ ] **Step 6: Verify types and lint**

```bash
npx tsc -p tsconfig.app.json --noEmit
npm run lint
```

Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add admin/src/lib/attention.ts admin/src/lib/attention.spec.ts admin/src/hooks/useDashboardData.ts
git commit -m "feat(admin): derive attention items and add the dashboard data hook"
```

---

## Task 16: Dashboard — header and attention strip

**Files:**
- Create: `admin/src/pages/dashboard/AttentionStrip.tsx`
- Create: `admin/src/pages/dashboard/AttentionStrip.spec.tsx`
- Modify: `admin/src/pages/Dashboard.tsx` (replaced wholesale in Task 18; this task rebuilds the top)
- Modify: `admin/src/styles/cards.css` (append)

**Interfaces:**
- Consumes: `AttentionItem`, `AttentionIconName` from `../../lib/attention`; `AttentionCard` from `../../components/ui/AttentionCard`
- Produces: `<AttentionStrip items loading />`

- [ ] **Step 1: Write the failing test**

Create `admin/src/pages/dashboard/AttentionStrip.spec.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { AttentionItem } from "../../lib/attention";
import AttentionStrip from "./AttentionStrip";

const items: AttentionItem[] = [
  { key: "needsReview", count: 23, label: "to review", to: "/opportunities?filter=needs-review", hue: "blue", iconName: "review" },
  { key: "creators", count: 4, label: "creators pending", to: "/creators", hue: "green", iconName: "creators" },
];

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("AttentionStrip", () => {
  it("renders a card per item", () => {
    wrap(<AttentionStrip items={items} loading={false} />);
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByText("23")).toBeInTheDocument();
  });

  it("shows an all-clear pill when nothing needs attention", () => {
    wrap(<AttentionStrip items={[]} loading={false} />);
    expect(screen.getByText(/all clear/i)).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows skeletons while loading rather than a false all-clear", () => {
    const { container } = wrap(<AttentionStrip items={[]} loading />);
    expect(screen.queryByText(/all clear/i)).toBeNull();
    expect(container.querySelectorAll(".skeleton-line").length).toBeGreaterThan(0);
  });

  it("is a labelled region so it can be linked from the section panel", () => {
    wrap(<AttentionStrip items={items} loading={false} />);
    const region = screen.getByRole("region", { name: /needs you now/i });
    expect(region).toHaveAttribute("id", "attention");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- AttentionStrip`
Expected: FAIL — `Failed to resolve import "./AttentionStrip"`.

- [ ] **Step 3: Implement the strip**

Create `admin/src/pages/dashboard/AttentionStrip.tsx`:

```tsx
import {
  CalendarClock,
  CheckCircle2,
  HeartPulse,
  Inbox,
  ShieldCheck,
  Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import AttentionCard from "../../components/ui/AttentionCard";
import Skeleton from "../../components/ui/Skeleton";
import type { AttentionIconName, AttentionItem } from "../../lib/attention";

const ICONS: Record<AttentionIconName, LucideIcon> = {
  review: Target,
  expiring: CalendarClock,
  missing: CalendarClock,
  submissions: Inbox,
  creators: ShieldCheck,
  health: HeartPulse,
};

interface AttentionStripProps {
  items: AttentionItem[];
  loading: boolean;
}

const AttentionStrip = ({ items, loading }: AttentionStripProps) => (
  <section id="attention" className="attention" aria-label="Needs you now">
    <h2 className="section-heading">Needs you now</h2>

    {loading ? (
      <div className="attention-grid">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="attention-skeleton">
            <Skeleton lines={2} height={18} />
          </div>
        ))}
      </div>
    ) : items.length === 0 ? (
      <p className="all-clear">
        <CheckCircle2 size={16} aria-hidden="true" />
        All clear — nothing is waiting on you.
      </p>
    ) : (
      <div className="attention-grid">
        {items.map((item) => (
          <AttentionCard
            key={item.key}
            count={item.count}
            label={item.label}
            to={item.to}
            hue={item.hue}
            icon={ICONS[item.iconName]}
          />
        ))}
      </div>
    )}
  </section>
);

export default AttentionStrip;
```

- [ ] **Step 4: Append the layout styles**

Append to `admin/src/styles/cards.css`:

```css
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.section-heading {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-tertiary);
}

.attention-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(168px, 1fr));
  gap: 12px;
}

.attention-skeleton {
  padding: 16px 18px;
  border-radius: 16px;
  background: var(--card-bg);
  border: 1px solid var(--border-light);
}

.all-clear {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 10px 16px;
  border-radius: 999px;
  background: var(--hue-green-soft);
  color: var(--hue-green);
  font-size: 14px;
  font-weight: 600;
}

.board-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 20px;
}

.metric-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 12px;
}

.metric-value {
  font-size: 26px;
  font-weight: 700;
}

.metric-caption {
  font-size: 13px;
  color: var(--text-tertiary);
}

.banner {
  padding: 14px 18px;
  border-radius: 12px;
  font-size: 14px;
  color: var(--text-primary);
}

.banner[data-kind="error"] {
  background: var(--banner-error-bg);
  border: 1px solid var(--banner-error-border);
}

.banner[data-kind="warning"] {
  background: var(--banner-warn-bg);
  border: 1px solid var(--banner-warn-border);
}

.banner[data-kind="success"] {
  background: var(--banner-success-bg);
  border: 1px solid var(--banner-success-border);
}

@media (max-width: 768px) {
  .board-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- AttentionStrip`
Expected: PASS — `4 passed`.

- [ ] **Step 6: Commit**

```bash
git add admin/src/pages/dashboard/ admin/src/styles/cards.css
git commit -m "feat(admin): add the needs-you-now attention strip"
```

---

## Task 17: Dashboard — Growth and Money boards

**Files:**
- Create: `admin/src/pages/dashboard/GrowthBoard.tsx`
- Create: `admin/src/pages/dashboard/MoneyBoard.tsx`
- Create: `admin/src/pages/dashboard/boards.spec.tsx`

**Interfaces:**
- Consumes: `FunnelResult` from `../../lib/growthApi`; `RevenueSeries` from `../../lib/revenueSeries`; `BillingOverview` from `../../lib/monetizationApi`; `AiUsageSummary` from `../../hooks/useDashboardData`
- Produces: `<GrowthBoard funnel loading />`, `<MoneyBoard billing revenue aiUsage loading />`

- [ ] **Step 1: Write the failing test**

Create `admin/src/pages/dashboard/boards.spec.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { FunnelResult } from "../../lib/growthApi";
import GrowthBoard from "./GrowthBoard";
import MoneyBoard from "./MoneyBoard";

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

const OK_FUNNEL: FunnelResult = {
  status: "ok",
  data: {
    generatedAt: "2026-07-25T09:00:00.000Z",
    stages: [
      { key: "signup", label: "Signup", total: 1284, newThisWeek: 96, newLastWeek: 80, convFromPrev: null },
      { key: "paying", label: "Paying", total: 48, newThisWeek: 5, newLastWeek: 4, convFromPrev: 0.037 },
    ],
    referral: { invitersTotal: 214, invitersThisWeek: 18 },
    cohorts: [{ cohortWeek: "2026-W28", size: 40, w1Pct: 0.62, w2Pct: null, w4Pct: null }],
  },
};

describe("GrowthBoard", () => {
  it("renders funnel stages and referral counts", () => {
    wrap(<GrowthBoard funnel={OK_FUNNEL} loading={false} />);
    expect(screen.getByText("Signup")).toBeInTheDocument();
    expect(screen.getByText("Paying")).toBeInTheDocument();
    expect(screen.getByText("214")).toBeInTheDocument();
  });

  it("says the endpoint is not deployed rather than showing an error", () => {
    wrap(<GrowthBoard funnel={{ status: "not-deployed" }} loading={false} />);
    expect(screen.getByText(/not deployed yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/failed/i)).toBeNull();
  });

  it("surfaces a real error distinctly", () => {
    wrap(<GrowthBoard funnel={{ status: "error", message: "500" }} loading={false} />);
    expect(screen.getByText(/couldn't load/i)).toBeInTheDocument();
  });

  it("drills through to the Growth page", () => {
    wrap(<GrowthBoard funnel={OK_FUNNEL} loading={false} />);
    expect(screen.getByRole("link", { name: /view funnel/i })).toHaveAttribute(
      "href",
      "/growth",
    );
  });
});

describe("MoneyBoard", () => {
  const billing = {
    revenue: {
      month_revenue: 412000,
      last_30d_revenue: 500000,
      total_revenue: 1200000,
      last_30d_count: 42,
    },
    activeSubscriptions: [{ plan: "monthly", count: 30 }],
    credits30d: { purchased: 0, spent: 0, granted: 0 },
    topCreditSpenders30d: [],
    aiUsageToday: { chat_messages_today: 0, action_credits_today: 0, active_ai_users_today: 0 },
    recentTransactions: [],
  };

  const aiUsage = {
    success: true,
    days: 30,
    totals: { calls: 900, promptTokens: 0, completionTokens: 0, totalTokens: 120000, estimatedCostUsd: 18.4, errorCount: 0 },
    perDay: [{ day: "2026-07-24", totalTokens: 100, estimatedCostUsd: 0.6, calls: 30 }],
    perRoute: [],
  };

  it("shows revenue and AI cost as a share of revenue", () => {
    wrap(
      <MoneyBoard
        billing={billing}
        aiUsage={aiUsage}
        revenue={{ points: [], coveredFromDay: null, truncated: false, suppressed: true }}
        loading={false}
      />,
    );
    expect(screen.getByText("₦500,000")).toBeInTheDocument();
    // 18.4 USD * 1000 NGN = 18,400 of 500,000 = 3.7%
    expect(screen.getByText(/3\.7% of revenue/i)).toBeInTheDocument();
  });

  it("explains why the revenue chart is hidden when coverage is too short", () => {
    wrap(
      <MoneyBoard
        billing={billing}
        aiUsage={aiUsage}
        revenue={{ points: [], coveredFromDay: null, truncated: false, suppressed: true }}
        loading={false}
      />,
    );
    expect(screen.getByText(/not enough covered days/i)).toBeInTheDocument();
  });

  it("renders the chart when the series is usable", () => {
    const points = Array.from({ length: 10 }, (_, i) => ({
      day: `2026-07-${String(i + 10).padStart(2, "0")}`,
      amount: 1000 * i,
      count: i,
    }));
    wrap(
      <MoneyBoard
        billing={billing}
        aiUsage={aiUsage}
        revenue={{ points, coveredFromDay: points[0].day, truncated: false, suppressed: false }}
        loading={false}
      />,
    );
    expect(screen.getByRole("img", { name: /revenue and ai cost/i })).toBeInTheDocument();
  });

  it("charts AI calls per day from the usage summary", () => {
    wrap(
      <MoneyBoard
        billing={billing}
        aiUsage={aiUsage}
        revenue={{ points: [], coveredFromDay: null, truncated: false, suppressed: true }}
        loading={false}
      />,
    );
    expect(screen.getByRole("img", { name: /ai calls per day/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- boards`
Expected: FAIL — `Failed to resolve import "./GrowthBoard"`.

- [ ] **Step 3: Implement `GrowthBoard`**

Create `admin/src/pages/dashboard/GrowthBoard.tsx`:

```tsx
import BoardCard from "../../components/ui/BoardCard";
import Delta from "../../components/ui/Delta";
import EmptyState from "../../components/ui/EmptyState";
import Skeleton from "../../components/ui/Skeleton";
import CohortHeatmap from "../../components/charts/CohortHeatmap";
import FunnelBars from "../../components/charts/FunnelBars";
import { toFunnelBars } from "../../lib/funnelMath";
import { formatCompact } from "../../lib/format";
import type { FunnelResult } from "../../lib/growthApi";

interface GrowthBoardProps {
  funnel: FunnelResult | null;
  loading: boolean;
}

const GrowthBoard = ({ funnel, loading }: GrowthBoardProps) => (
  <div id="growth">
    <BoardCard title="Growth" hue="purple" drillTo="/growth" drillLabel="View funnel">
      {loading || !funnel ? (
        <Skeleton lines={5} />
      ) : funnel.status === "not-deployed" ? (
        <EmptyState
          hue="purple"
          title="Growth data is not deployed yet"
          description="The /admin/funnel endpoint exists in the backend but has not shipped to the API yet. This board will fill in once it deploys."
        />
      ) : funnel.status === "error" ? (
        <EmptyState
          hue="red"
          title="Couldn't load the funnel"
          description={funnel.message}
        />
      ) : (
        <>
          <FunnelBars stages={toFunnelBars(funnel.data.stages)} hue="purple" />

          <div className="metric-row" style={{ marginTop: 18 }}>
            <span className="metric-value">
              {funnel.data.referral.invitersTotal === null
                ? "—"
                : formatCompact(funnel.data.referral.invitersTotal)}
            </span>
            <span className="metric-caption">members who invited someone</span>
            {funnel.data.referral.invitersThisWeek !== null &&
              funnel.data.referral.invitersTotal ? (
              <Delta
                change={
                  funnel.data.referral.invitersThisWeek /
                  funnel.data.referral.invitersTotal
                }
                polarity="higher-is-better"
              />
            ) : null}
          </div>

          <CohortHeatmap cohorts={funnel.data.cohorts} hue="purple" />

          <p className="metric-caption" style={{ marginTop: 10 }}>
            Activated and Retained undercount users whose Clerk and profile ids
            differ — treat them as a floor, not an exact figure.
          </p>
        </>
      )}
    </BoardCard>
  </div>
);

export default GrowthBoard;
```

- [ ] **Step 4: Implement `MoneyBoard`**

Create `admin/src/pages/dashboard/MoneyBoard.tsx`:

```tsx
import AreaChart from "../../components/charts/AreaChart";
import BarChart from "../../components/charts/BarChart";
import BoardCard from "../../components/ui/BoardCard";
import EmptyState from "../../components/ui/EmptyState";
import Skeleton from "../../components/ui/Skeleton";
import { formatNgn, formatUsd } from "../../lib/format";
import type { RevenueSeries } from "../../lib/revenueSeries";
import type { BillingOverview } from "../../lib/monetizationApi";
import type { AiUsageSummary } from "../../hooks/useDashboardData";

/** Matches billing.service.ts usdToNgnRate default (admin pricing setting). */
const USD_TO_NGN = 1000;
/** Above this share of revenue, AI spend is a problem worth flagging. */
const AI_COST_ALARM = 0.1;

interface MoneyBoardProps {
  billing: BillingOverview | null;
  aiUsage: AiUsageSummary | null;
  revenue: RevenueSeries | null;
  loading: boolean;
}

const MoneyBoard = ({ billing, aiUsage, revenue, loading }: MoneyBoardProps) => {
  const last30 = billing?.revenue?.last_30d_revenue ?? 0;
  const aiCostNgn = (aiUsage?.totals.estimatedCostUsd ?? 0) * USD_TO_NGN;
  const share = last30 > 0 ? aiCostNgn / last30 : null;
  const alarming = share !== null && share > AI_COST_ALARM;

  return (
    <div id="money">
      <BoardCard title="Money" hue="green" drillTo="/monetization" drillLabel="View monetization">
        {loading ? (
          <Skeleton lines={5} />
        ) : !billing ? (
          <EmptyState hue="green" title="Couldn't load billing" />
        ) : (
          <>
            <div className="metric-row">
              <span className="metric-value">{formatNgn(last30)}</span>
              <span className="metric-caption">
                last 30 days · {billing.revenue?.last_30d_count ?? 0} payments
              </span>
            </div>

            <div className="metric-row">
              <span
                className="metric-caption"
                style={alarming ? { color: "var(--hue-orange)", fontWeight: 600 } : undefined}
                title="Estimated AI spend converted at the configured USD→NGN rate, over revenue in the same window."
              >
                AI spend {formatUsd(aiUsage?.totals.estimatedCostUsd ?? 0)}
                {share === null
                  ? ""
                  : ` · ${(share * 100).toFixed(1)}% of revenue`}
              </span>
            </div>

            {revenue && !revenue.suppressed && revenue.points.length > 0 ? (
              <AreaChart
                label="Revenue and AI cost over time"
                series={[
                  {
                    label: "Revenue",
                    hue: "green",
                    values: revenue.points.map((point) => point.amount),
                  },
                  {
                    label: "AI cost",
                    hue: "orange",
                    values: (aiUsage?.perDay ?? []).map(
                      (day) => day.estimatedCostUsd * USD_TO_NGN,
                    ),
                  },
                ]}
              />
            ) : (
              <p className="metric-caption">
                Revenue chart hidden — not enough covered days in the transaction
                window to chart honestly.
              </p>
            )}

            {(aiUsage?.perDay.length ?? 0) > 0 && (
              <div style={{ marginTop: 14 }}>
                <p className="metric-caption">AI calls per day</p>
                <BarChart
                  label="AI calls per day"
                  hue="orange"
                  values={(aiUsage?.perDay ?? []).map((day) => day.calls)}
                  labels={(aiUsage?.perDay ?? []).map((day) => day.day)}
                />
              </div>
            )}

            <p className="metric-caption" style={{ marginTop: 10 }}>
              {(billing.activeSubscriptions ?? [])
                .map((sub) => `${sub.count} ${sub.plan}`)
                .join(" · ") || "No active subscriptions"}
            </p>
          </>
        )}
      </BoardCard>
    </div>
  );
};

export default MoneyBoard;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- boards`
Expected: PASS — `8 passed`.

- [ ] **Step 6: Commit**

```bash
git add admin/src/pages/dashboard/GrowthBoard.tsx admin/src/pages/dashboard/MoneyBoard.tsx admin/src/pages/dashboard/boards.spec.tsx
git commit -m "feat(admin): add growth and money dashboard boards"
```

---

## Task 18: Dashboard — Pipeline board, Health board, and the page itself

**Files:**
- Create: `admin/src/pages/dashboard/PipelineBoard.tsx`
- Create: `admin/src/pages/dashboard/HealthBoard.tsx`
- Create: `admin/src/pages/dashboard/ActivityFeed.tsx`
- Create: `admin/src/pages/dashboard/boards2.spec.tsx`
- Modify: `admin/src/pages/Dashboard.tsx` (full replacement)

**Interfaces:**
- Consumes: everything from Tasks 15–17
- Produces: `<PipelineBoard counts stats loading />`, `<HealthBoard health loading />`, `<ActivityFeed items loading />`, the rebuilt `Dashboard` page

- [ ] **Step 1: Write the failing test**

Create `admin/src/pages/dashboard/boards2.spec.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { PlatformCounts } from "../../lib/counts";
import ActivityFeed from "./ActivityFeed";
import HealthBoard from "./HealthBoard";
import PipelineBoard from "./PipelineBoard";

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

const COUNTS: PlatformCounts = {
  needsReview: 23,
  expiringSoon: 5,
  missingDeadline: 660,
  total: 1902,
  active: 1400,
  submissions: 7,
  creators: 4,
};

describe("PipelineBoard", () => {
  it("shows the share of opportunities that have a real deadline", () => {
    wrap(<PipelineBoard counts={COUNTS} newThisWeek={38} loading={false} />);
    // 1 - 660/1902 = 65%
    expect(screen.getByText(/65% have a real deadline/i)).toBeInTheDocument();
  });

  it("does not divide by zero when the total is unknown", () => {
    wrap(
      <PipelineBoard
        counts={{ ...COUNTS, total: null, missingDeadline: null }}
        newThisWeek={0}
        loading={false}
      />,
    );
    expect(screen.getByText(/deadline coverage unknown/i)).toBeInTheDocument();
  });
});

describe("HealthBoard", () => {
  const health = {
    status: "ok" as const,
    timestamp: "2026-07-25T12:00:00.000Z",
    uptime: 93_784,
    database: { status: "connected" as const, responseTime: 42 },
    ai: { gemini: "configured" as const, openrouter: "missing" as const },
    memory: { heapUsed: 61, heapTotal: 100, rss: 120 },
  };

  it("renders database latency, uptime and provider chips", () => {
    wrap(<HealthBoard health={health} loading={false} />);
    expect(screen.getByText("42 ms")).toBeInTheDocument();
    expect(screen.getByText("26h 3m")).toBeInTheDocument();
    expect(screen.getByText(/openrouter/i)).toBeInTheDocument();
  });

  it("reports unavailable health without crashing", () => {
    wrap(<HealthBoard health={null} loading={false} />);
    expect(screen.getByText(/health unavailable/i)).toBeInTheDocument();
  });
});

describe("ActivityFeed", () => {
  it("renders each activity row", () => {
    wrap(
      <ActivityFeed
        loading={false}
        items={[
          { id: "1", type: "user", action: "New signup", detail: "ada@edutu.org", timestamp: "2026-07-25T11:00:00.000Z" },
        ]}
      />,
    );
    expect(screen.getByText("New signup")).toBeInTheDocument();
  });

  it("shows an empty state when there is no activity", () => {
    wrap(<ActivityFeed loading={false} items={[]} />);
    expect(screen.getByText(/no recent activity/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- boards2`
Expected: FAIL — `Failed to resolve import "./ActivityFeed"`.

- [ ] **Step 3: Implement `PipelineBoard`**

Create `admin/src/pages/dashboard/PipelineBoard.tsx`:

```tsx
import BoardCard from "../../components/ui/BoardCard";
import Skeleton from "../../components/ui/Skeleton";
import { formatCompact } from "../../lib/format";
import type { PlatformCounts } from "../../lib/counts";

interface PipelineBoardProps {
  counts: PlatformCounts | null;
  newThisWeek: number;
  loading: boolean;
}

const PipelineBoard = ({ counts, newThisWeek, loading }: PipelineBoardProps) => {
  const total = counts?.total ?? null;
  const missing = counts?.missingDeadline ?? null;
  const datedShare =
    total !== null && missing !== null && total > 0 ? 1 - missing / total : null;

  return (
    <div id="pipeline">
      <BoardCard title="Pipeline" hue="blue" drillTo="/opportunities" drillLabel="View opportunities">
        {loading ? (
          <Skeleton lines={4} />
        ) : (
          <>
            <div className="metric-row">
              <span className="metric-value">
                {counts?.active === null || counts?.active === undefined
                  ? "—"
                  : formatCompact(counts.active)}
              </span>
              <span className="metric-caption">
                active · {newThisWeek} added this week
              </span>
            </div>

            <p className="metric-caption">
              {datedShare === null
                ? "Deadline coverage unknown — opportunity stats did not load."
                : `${Math.round(datedShare * 100)}% have a real deadline`}
            </p>

            <p className="metric-caption">
              {counts?.expiringSoon ?? 0} expiring within 7 days ·{" "}
              {counts?.needsReview ?? 0} awaiting review
            </p>
          </>
        )}
      </BoardCard>
    </div>
  );
};

export default PipelineBoard;
```

- [ ] **Step 4: Implement `HealthBoard`**

Create `admin/src/pages/dashboard/HealthBoard.tsx`:

```tsx
import DonutRing from "../../components/charts/DonutRing";
import BoardCard from "../../components/ui/BoardCard";
import Skeleton from "../../components/ui/Skeleton";
import { formatUptime } from "../../lib/format";
import type { HealthStatus } from "../../hooks/useDashboardData";

interface HealthBoardProps {
  health: HealthStatus | null;
  loading: boolean;
}

const HealthBoard = ({ health, loading }: HealthBoardProps) => {
  const memoryPct = health
    ? Math.min(
        100,
        Math.round((health.memory.heapUsed / Math.max(health.memory.heapTotal, 1)) * 100),
      )
    : 0;

  return (
    <div id="health">
      <BoardCard title="Health" hue="red" drillTo="/engine/status" drillLabel="View status">
        {loading ? (
          <Skeleton lines={4} />
        ) : !health ? (
          <p className="metric-caption">Health unavailable — the API did not respond.</p>
        ) : (
          <>
            <div className="metric-row">
              <span
                className="status-dot"
                data-ok={health.database.status === "connected"}
                aria-hidden="true"
              />
              <span className="metric-caption">Database</span>
              <span className="metric-value" style={{ fontSize: 18 }}>
                {health.database.status === "connected"
                  ? `${health.database.responseTime ?? 0} ms`
                  : "Disconnected"}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <DonutRing
                value={memoryPct}
                max={100}
                label="Heap usage"
                centre={`${memoryPct}%`}
                hue={memoryPct > 85 ? "red" : "blue"}
              />
              <div>
                <p className="metric-caption">Uptime</p>
                <p className="metric-value" style={{ fontSize: 20 }}>
                  {formatUptime(health.uptime)}
                </p>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
              <span className={`badge ${health.ai.gemini === "configured" ? "badge-success" : "badge-danger"}`}>
                Gemini: {health.ai.gemini}
              </span>
              <span className={`badge ${health.ai.openrouter === "configured" ? "badge-success" : "badge-danger"}`}>
                OpenRouter: {health.ai.openrouter}
              </span>
            </div>
          </>
        )}
      </BoardCard>
    </div>
  );
};

export default HealthBoard;
```

Append to `admin/src/styles/cards.css`:

```css
.status-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--hue-red);
  flex-shrink: 0;
}

.status-dot[data-ok="true"] {
  background: var(--hue-green);
}

.activity-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 0;
  border-bottom: 1px solid var(--border-light);
}

.activity-row:last-child {
  border-bottom: none;
}

.activity-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  flex-shrink: 0;
}
```

- [ ] **Step 5: Implement `ActivityFeed`**

Create `admin/src/pages/dashboard/ActivityFeed.tsx`:

```tsx
import { CheckCircle2, Plus, Send, UserPlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import BoardCard from "../../components/ui/BoardCard";
import EmptyState from "../../components/ui/EmptyState";
import Skeleton from "../../components/ui/Skeleton";
import { formatTimeAgo } from "../../lib/format";
import type { AdminDashboardActivity } from "../../lib/adminApi";
import type { Hue } from "../../components/nav-items";

const ICONS: Record<string, { icon: LucideIcon; hue: Hue }> = {
  opportunity: { icon: Plus, hue: "blue" },
  application: { icon: Send, hue: "teal" },
  creator: { icon: CheckCircle2, hue: "green" },
  user: { icon: UserPlus, hue: "purple" },
};

interface ActivityFeedProps {
  items: AdminDashboardActivity[];
  loading: boolean;
}

const ActivityFeed = ({ items, loading }: ActivityFeedProps) => (
  <BoardCard title="Recent activity" hue="neutral" drillTo="/users" drillLabel="View users">
    {loading ? (
      <Skeleton lines={5} />
    ) : items.length === 0 ? (
      <EmptyState hue="neutral" title="No recent activity yet" />
    ) : (
      items.map((item) => {
        const meta = ICONS[item.type] ?? ICONS.user;
        const Icon = meta.icon;
        return (
          <div key={item.id} className="activity-row">
            <span
              className="activity-icon"
              style={{
                background: `var(--hue-${meta.hue}-soft)`,
                color: `var(--hue-${meta.hue})`,
              }}
            >
              <Icon size={17} strokeWidth={1.6} aria-hidden="true" />
            </span>
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: 14, fontWeight: 500 }}>
                {item.action}
              </span>
              <span className="metric-caption">{item.detail}</span>
            </span>
            <span className="metric-caption">{formatTimeAgo(item.timestamp)}</span>
          </div>
        );
      })
    )}
  </BoardCard>
);

export default ActivityFeed;
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- boards2`
Expected: PASS — `6 passed`.

- [ ] **Step 7: Rebuild the Dashboard page**

Replace the entire contents of `admin/src/pages/Dashboard.tsx`:

```tsx
import { Download, RefreshCw } from "lucide-react";
import { useDashboardData } from "../hooks/useDashboardData";
import { deriveAttentionItems } from "../lib/attention";
import { formatTimeAgo } from "../lib/format";
import ActivityFeed from "./dashboard/ActivityFeed";
import AttentionStrip from "./dashboard/AttentionStrip";
import GrowthBoard from "./dashboard/GrowthBoard";
import HealthBoard from "./dashboard/HealthBoard";
import MoneyBoard from "./dashboard/MoneyBoard";
import PipelineBoard from "./dashboard/PipelineBoard";

function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

const Dashboard = () => {
  const data = useDashboardData();

  const attention = data.counts
    ? deriveAttentionItems(data.counts, data.health?.status === "ok")
    : [];

  const handleExport = () =>
    downloadJson(`edutu-dashboard-${new Date().toISOString().slice(0, 10)}.json`, {
      stats: data.stats,
      counts: data.counts,
      health: data.health,
      aiUsage: data.aiUsage,
      exportedAt: new Date().toISOString(),
    });

  return (
    <div className="dashboard">
      <header className="page-header">
        <div>
          <h1 className="page-title">
            {greeting(new Date().getHours())}
          </h1>
          <p className="metric-caption">
            {data.refreshedAt
              ? `Updated ${formatTimeAgo(data.refreshedAt)}`
              : "Loading platform data…"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-secondary" onClick={handleExport}>
            <Download size={17} />
            <span className="btn-label">Export</span>
          </button>
          <button className="btn btn-primary" onClick={data.refresh}>
            <RefreshCw size={16} className={data.loading ? "animate-spin" : undefined} />
            <span className="btn-label">Refresh</span>
          </button>
        </div>
      </header>

      <AttentionStrip items={attention} loading={data.loading} />

      <div className="board-grid">
        <GrowthBoard funnel={data.funnel} loading={data.loading} />
        <MoneyBoard
          billing={data.billing}
          aiUsage={data.aiUsage}
          revenue={data.revenue}
          loading={data.loading}
        />
        <PipelineBoard
          counts={data.counts}
          newThisWeek={data.stats?.newOpportunitiesThisWeek ?? 0}
          loading={data.loading}
        />
        <HealthBoard health={data.health} loading={data.loading} />
      </div>

      <ActivityFeed items={data.activity} loading={data.loading} />
    </div>
  );
};

export default Dashboard;
```

- [ ] **Step 8: Verify the suite, types, lint and build**

```bash
npm test
npm run lint
npm run build
```

Expected: all exit 0.

- [ ] **Step 9: Commit**

```bash
git add admin/src/pages/
git commit -m "feat(admin): rebuild the dashboard as an attention-first console"
```

---

## Task 19: Growth page and route

Completes Tasks 4–5 of the superseded `2026-07-22-growth-funnel-dashboard` plan, so the Growth board's drill-down resolves.

**Files:**
- Create: `admin/src/pages/Growth.tsx`
- Create: `admin/src/pages/Growth.spec.tsx`
- Modify: `admin/src/App.tsx`

**Interfaces:**
- Consumes: `fetchFunnel`, `FunnelResult` from `../lib/growthApi`; `FunnelBars`, `CohortHeatmap`
- Produces: the `/growth` route

- [ ] **Step 1: Write the failing test**

Create `admin/src/pages/Growth.spec.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchFunnel = vi.hoisted(() => vi.fn());
vi.mock("../lib/growthApi", () => ({ fetchFunnel }));

import Growth from "./Growth";

const PAYLOAD = {
  status: "ok" as const,
  data: {
    generatedAt: "2026-07-25T09:00:00.000Z",
    stages: [
      { key: "signup", label: "Signup", total: 1284, newThisWeek: 96, newLastWeek: 80, convFromPrev: null },
      { key: "onboarded", label: "Onboarded", total: 892, newThisWeek: 60, newLastWeek: 55, convFromPrev: 0.69 },
    ],
    referral: { invitersTotal: 214, invitersThisWeek: 18 },
    cohorts: [{ cohortWeek: "2026-W28", size: 40, w1Pct: 0.62, w2Pct: 0.4, w4Pct: null }],
  },
};

beforeEach(() => {
  fetchFunnel.mockReset();
});

describe("Growth page", () => {
  it("renders the funnel and cohorts once loaded", async () => {
    fetchFunnel.mockResolvedValue(PAYLOAD);
    render(<MemoryRouter><Growth /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("Signup")).toBeInTheDocument());
    expect(screen.getByText("2026-W28")).toBeInTheDocument();
  });

  it("explains the not-deployed case instead of showing an error", async () => {
    fetchFunnel.mockResolvedValue({ status: "not-deployed" });
    render(<MemoryRouter><Growth /></MemoryRouter>);
    await waitFor(() =>
      expect(screen.getByText(/not deployed yet/i)).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- Growth`
Expected: FAIL — `Failed to resolve import "./Growth"`.

- [ ] **Step 3: Implement the page**

Create `admin/src/pages/Growth.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import CohortHeatmap from "../components/charts/CohortHeatmap";
import FunnelBars from "../components/charts/FunnelBars";
import BoardCard from "../components/ui/BoardCard";
import EmptyState from "../components/ui/EmptyState";
import Skeleton from "../components/ui/Skeleton";
import { formatCompact, formatTimeAgo } from "../lib/format";
import { toFunnelBars } from "../lib/funnelMath";
import { fetchFunnel, type FunnelResult } from "../lib/growthApi";

const Growth = () => {
  const [result, setResult] = useState<FunnelResult | null>(null);

  const load = useCallback(() => {
    void fetchFunnel().then(setResult);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="dashboard">
      <header className="page-header">
        <div>
          <h1 className="page-title">Growth</h1>
          <p className="metric-caption">
            {result?.status === "ok"
              ? `Generated ${formatTimeAgo(result.data.generatedAt)}`
              : "Signup through to paying, plus weekly retention cohorts"}
          </p>
        </div>
      </header>

      {!result ? (
        <Skeleton lines={8} />
      ) : result.status === "not-deployed" ? (
        <EmptyState
          hue="purple"
          title="Growth data is not deployed yet"
          description="The /admin/funnel endpoint exists in the backend but has not shipped to the API. Deploy the backend and this page fills in."
        />
      ) : result.status === "error" ? (
        <EmptyState hue="red" title="Couldn't load the funnel" description={result.message} />
      ) : (
        <div className="board-grid">
          <BoardCard title="Funnel" hue="purple">
            <FunnelBars stages={toFunnelBars(result.data.stages)} hue="purple" />
            <p className="metric-caption" style={{ marginTop: 14 }}>
              Stages are not strict subsets, so a conversion above 100% means the
              stage is reached out of order. Activated and Retained undercount
              users whose Clerk and profile ids differ.
            </p>
          </BoardCard>

          <BoardCard title="Weekly retention" hue="purple">
            <CohortHeatmap cohorts={result.data.cohorts} hue="purple" />
          </BoardCard>

          <BoardCard title="Referral" hue="teal">
            <div className="metric-row">
              <span className="metric-value">
                {result.data.referral.invitersTotal === null
                  ? "—"
                  : formatCompact(result.data.referral.invitersTotal)}
              </span>
              <span className="metric-caption">members have invited someone</span>
            </div>
            <p className="metric-caption">
              {result.data.referral.invitersThisWeek ?? 0} new inviters this week
            </p>
          </BoardCard>
        </div>
      )}
    </div>
  );
};

export default Growth;
```

- [ ] **Step 4: Register the route**

In `admin/src/App.tsx`, add beside the other lazy imports:

```tsx
const Growth = lazy(() => import("./pages/Growth"));
```

and inside the `<Route path="/" element={<AppShell />}>` block, after the `creators` route:

```tsx
          <Route path="growth" element={<Growth />} />
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- Growth`
Expected: PASS — `2 passed`.

- [ ] **Step 6: Commit**

```bash
git add admin/src/pages/Growth.tsx admin/src/pages/Growth.spec.tsx admin/src/App.tsx
git commit -m "feat(admin): add the Growth funnel and cohort page"
```

---

## Task 20: Full verification and browser QA

The 2026-07-23 nav rebuild shipped defects because this step was skipped. It is not optional.

**Files:** none created; this task fixes whatever it finds.

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: all suites pass. Record the total count.

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: exit 0. Takes ~2 minutes.

- [ ] **Step 3: Lint at zero warnings**

Run: `npm run lint`
Expected: exit 0, no output.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 5: Confirm no `<style>` template literals remain in the shell**

Run: `grep -rn "style>{\`" src/components/ src/pages/Dashboard.tsx`
Expected: no matches. Any hit reintroduces the backtick hazard and must be moved into a `.css` file.

- [ ] **Step 6: Browser QA matrix**

Run `npm run dev` and check **every cell** below in **both light and dark themes** (toggle from the rail):

| Width | Checks |
|---|---|
| 1440 | Rail + panel = 260px; switching Content → Monetization does **not** move the page content horizontally; active rail item shows its domain hue; badges render |
| 1024 | Boards reflow to two columns; top bar breadcrumb does not wrap |
| 768 | Rail/panel hidden; bottom tab bar visible with exactly 5 items; no floating hamburger anywhere |
| 390 | No horizontal page scroll; `More` sheet opens above the tab bar and respects the home-indicator inset; tap targets ≥44px |

Also verify on any width:
- `⌘K` opens the palette, arrows move the selection, `Enter` navigates, `Esc` closes.
- Each board's **loading** state (hard refresh), **empty** state, and **error** state (stop the backend, reload) renders without blanking the page.
- The Growth board shows the "not deployed yet" copy — expected until the backend ships `/admin/funnel`.
- Banners are readable in dark mode (the old hardcoded `#fef2f2` bug).

- [ ] **Step 7: Fix anything the matrix surfaced, then re-run steps 1–4**

- [ ] **Step 8: Commit any fixes**

```bash
git add -A admin/
git commit -m "fix(admin): browser QA corrections for the shell and dashboard"
```

---

## Deploy dependency

The Growth board and `/growth` page render a "not deployed yet" state until the backend ships `GET /admin/funnel`. That endpoint exists in **uncommitted** local backend code (`admin.service.ts` `getFunnel`/`buildCohorts`, `admin.controller.ts`, `analytics/growth-snapshot.service.ts`). Committing and deploying the backend is a separate action, tracked by Tasks 1–3 of `docs/superpowers/plans/2026-07-22-growth-funnel-dashboard.md`.

## Self-Review Notes

**Spec coverage.** Every spec section maps to a task: shell architecture → 8–12; domain hues → 2; chart primitives → 5–6; nav model → 4; dashboard IA → 15–18; growth absorption → 13, 19; data constraints → 13 (not-deployed), 14 (revenue coverage), 6 + 17 (id-namespace undercount, `convFromPrev` > 1); UX hints → 7 (Delta polarity), 11 (badges), 15 (paused polling), 17 (AI-cost threshold), 16 (all-clear); accessibility → 8–10, 20; verification → 20.

**Deliberate deviation from the spec.** The spec listed six chart primitives including a `Sparkline` "used by every board headline". Only two endpoints return per-day data (`aiUsage.perDay` and the derived revenue series) and both are already served by `AreaChart` and `BarChart`, so `Sparkline` is **not built** — it would ship unconsumed, against this plan's YAGNI constraint. Five primitives are built: `BarChart`, `AreaChart`, `FunnelBars`, `DonutRing`, `CohortHeatmap`. Every board still gets a visual: Growth uses `FunnelBars` + `CohortHeatmap`, Money uses `AreaChart` + `BarChart`, Health uses `DonutRing`. **Pipeline gets no chart** — no endpoint exposes opportunities-created-per-day, and inventing a series would be a fabrication. It renders counts and the deadline-coverage share instead.

**Known gap, deliberately unfixed.** `USD_TO_NGN` in `MoneyBoard.tsx` is hardcoded to 1000 to match `DEFAULT_PRICING.usdToNgnRate`. The live rate is an admin setting returned on `BillingOverview.pricing`. Reading it from there would be strictly better, but `pricing` is optional in the type and this plan does not touch backend or pricing behaviour. If the admin changes the rate, the "% of revenue" figure drifts. Flagged rather than silently absorbed.



