# Edutu Admin Shell and Engine Production Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve every existing Edutu admin route and workflow while replacing the brittle admin shell, making the deployed Engine use one explicit production API target, decomposing the Engine into maintainable feature modules, and adding truthful production diagnostics.

**Architecture:** Introduce a fail-closed runtime-configuration boundary and a shared authenticated API client first, then add safe API diagnostics, a typed route manifest, and a responsive `AdminShell`. Decompose the current `Scraper.tsx` behind compatibility exports into Sources, Runs, and Status pages with focused adapters/hooks/components; preserve all public paths and backend contracts throughout.

**Tech Stack:** React 19, React Router 7, TypeScript 6, Vite 8, Vitest 4, Testing Library, Supabase Auth, NestJS, Jest, Server-Sent Events over authenticated `fetch`, CSS Grid/Flexbox, GitHub Actions, Vercel, Render.

**Spec:** `docs/superpowers/specs/2026-08-23-admin-shell-engine-production-design.md`

## Global Constraints

- Preserve every existing admin URL and redirect.
- Preserve authentication and authorization semantics.
- Preserve all current Engine source, run, status, review, import, enhancement, retention, pause, resume, stop, abort, background-run, and rehydration workflows.
- Preserve existing backend API paths unless an additive safe diagnostics field is required.
- Do not combine this work with unrelated web, mobile, billing, community, or database redesign.
- Do not convert failed production calls into empty arrays, zero values, or misleading empty states.
- Do not depend on the local admin bypass in production.
- Production must require an explicit `VITE_BACKEND_URL`; `VITE_API_URL` is a temporary compatibility alias only.
- Development may use the Vite `/api` proxy; production may not silently select a hardcoded Render hostname.
- No secret values, tokens, raw database errors, or sensitive response bodies may appear in diagnostics.
- Each task must begin with a failing test and end with independently passing verification.
- Keep PR #60 draft until the complete admin test, lint, build, backend affected tests, architecture checks, and deployment evidence are green.

---

## File and Responsibility Map

### Runtime and shared API boundary

- `admin/src/lib/runtimeConfig.ts` — pure runtime API-origin resolution and safe metadata.
- `admin/src/lib/runtimeConfig.spec.ts` — development, production, alias, HTTPS, and missing-config contracts.
- `admin/src/lib/apiClient.ts` — authenticated JSON requests, timeouts, request IDs, and normalized errors.
- `admin/src/lib/apiClient.spec.ts` — auth, request-ID, timeout, parse, and HTTP-error contracts.
- `admin/src/lib/backend.ts` — compatibility facade delegating to the new shared client.
- `admin/vite.config.ts` — development proxy and fail-closed production build validation.
- `admin/.env.example` — canonical production variable and explicit legacy alias note.

### Application routing and shell

- `admin/src/app/route-manifest.tsx` — canonical route/navigation/redirect metadata.
- `admin/src/app/route-manifest.spec.tsx` — exact route preservation and matching rules.
- `admin/src/app/AdminRoutes.tsx` — React Router definitions generated from the manifest-compatible exports.
- `admin/src/shell/AdminShell.tsx` — shell orchestration and `<Outlet />`.
- `admin/src/shell/PrimaryRail.tsx` — top-level sections and icon tooltips.
- `admin/src/shell/SectionNavigation.tsx` — active section destinations.
- `admin/src/shell/MobileNavigation.tsx` — accessible drawer/accordion behavior.
- `admin/src/shell/AdminTopbar.tsx` — mobile/tablet title, menu, and theme controls.
- `admin/src/shell/ShellContext.tsx` — theme, collapse, drawer, and section state.
- `admin/src/shell/shell.css` — responsive grid, focus, motion, and navigation tokens.
- `admin/src/components/Layout.tsx` — compatibility export only after migration.
- `admin/src/App.tsx` — auth boundary plus `AdminRoutes`; route strings move out.

### Engine feature

- `admin/src/features/engine/model/types.ts` — canonical sources, jobs, stream events, diagnostics, sites, settings, and preview types.
- `admin/src/features/engine/model/errors.ts` — Engine load-state and failure-category helpers.
- `admin/src/features/engine/api/engineApi.ts` — all Engine HTTP and stream calls.
- `admin/src/features/engine/api/engineApi.spec.ts` — URL, auth, streaming, parsing, and error contracts.
- `admin/src/features/engine/hooks/useEngineOverview.ts` — partial-data-safe summary loading.
- `admin/src/features/engine/hooks/useEngineSources.ts` — source CRUD, filtering, grouping, and run launch state.
- `admin/src/features/engine/hooks/useEngineRuns.ts` — run history, inspection, deletion, and rehydration.
- `admin/src/features/engine/hooks/useEngineRunStream.ts` — authenticated SSE parsing and lifecycle control.
- `admin/src/features/engine/hooks/useEngineAutomation.ts` — scheduler/retention settings.
- `admin/src/features/engine/hooks/useEngineDiagnostics.ts` — liveness/readiness/Engine drift checks.
- `admin/src/features/engine/pages/EngineSourcesPage.tsx` — `/engine`.
- `admin/src/features/engine/pages/EngineRunsPage.tsx` — `/engine/runs`.
- `admin/src/features/engine/pages/EngineStatusPage.tsx` — `/engine/status`.
- `admin/src/features/engine/components/*` — focused source, run, diagnostics, settings, review, and state components.
- `admin/src/pages/Scraper.tsx` — compatibility re-export only after all three pages are routed directly.

### Backend safe diagnostics

- `backend/services/services/api/src/scraper/scraper.service.ts` — additive runtime/version fields in `getEngineStatus()`.
- `backend/services/services/api/src/scraper/scraper.service.spec.ts` — safe diagnostics and no-secret-leak tests.
- `backend/services/services/api/src/scraper/scraper.types.ts` — exported typed diagnostics contract when needed by backend tests.

### Governance and documentation

- `scripts/check-admin-runtime-config.mjs` — ensure production fallback hostnames cannot return.
- `scripts/check-admin-runtime-config.test.mjs` — pure policy tests.
- `.github/workflows/ci.yml` — explicit CI build API origin and policy check.
- `scripts/check-large-file-budgets.mjs` — lower `Layout.tsx`/`Scraper.tsx` debt ceilings after extraction.
- `admin/ARCHITECTURE.md` — current NestJS backend and deployment ownership.
- `admin/README.md` — canonical local/production setup and troubleshooting.

---

### Task 1: Lock Production Runtime Configuration with Failing Tests

**Files:**
- Create: `admin/src/lib/runtimeConfig.spec.ts`
- Create: `scripts/check-admin-runtime-config.test.mjs`
- Read: `admin/src/lib/backend.ts`
- Read: `admin/vite.config.ts`
- Read: `admin/.env.example`

**Interfaces:**
- Produces test expectations for `resolveAdminRuntimeConfig(env, mode)` and `inspectAdminRuntimeConfigSources(files)`.
- Later tasks must implement exactly those names.

- [ ] **Step 1: Write the failing browser-runtime tests**

```ts
import { describe, expect, it } from "vitest";
import {
  AdminRuntimeConfigError,
  resolveAdminRuntimeConfig,
} from "./runtimeConfig";

describe("resolveAdminRuntimeConfig", () => {
  it("uses the explicit canonical production origin", () => {
    expect(
      resolveAdminRuntimeConfig(
        { VITE_BACKEND_URL: "https://edutu-api.onrender.com/" },
        "production",
      ),
    ).toEqual({
      apiOrigin: "https://edutu-api.onrender.com",
      source: "VITE_BACKEND_URL",
      explicit: true,
      mode: "production",
    });
  });

  it("accepts VITE_API_URL only as a marked compatibility alias", () => {
    expect(
      resolveAdminRuntimeConfig(
        { VITE_API_URL: "https://legacy-api.example.com" },
        "production",
      ),
    ).toMatchObject({
      apiOrigin: "https://legacy-api.example.com",
      source: "VITE_API_URL",
      explicit: true,
      legacyAlias: true,
    });
  });

  it("uses the development proxy only outside production", () => {
    expect(resolveAdminRuntimeConfig({}, "development")).toMatchObject({
      apiOrigin: "",
      source: "development-proxy",
      explicit: false,
    });
  });

  it("fails closed when production has no explicit API origin", () => {
    expect(() => resolveAdminRuntimeConfig({}, "production")).toThrow(
      AdminRuntimeConfigError,
    );
  });

  it("rejects insecure production origins", () => {
    expect(() =>
      resolveAdminRuntimeConfig(
        { VITE_BACKEND_URL: "http://api.example.com" },
        "production",
      ),
    ).toThrow(/https/i);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd admin
npm test -- src/lib/runtimeConfig.spec.ts
```

Expected: FAIL because `./runtimeConfig` does not exist.

- [ ] **Step 3: Write the failing repository-policy test**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { inspectAdminRuntimeConfigSources } from "./check-admin-runtime-config.mjs";

test("rejects hardcoded browser production fallbacks", () => {
  const failures = inspectAdminRuntimeConfigSources({
    "admin/src/lib/backend.ts":
      "const DEFAULT_BACKEND_URL = 'https://edutu-platform.onrender.com'",
    "admin/vite.config.ts": "const BACKEND_URL = process.env.VITE_BACKEND_URL",
  });

  assert.deepEqual(failures, [
    "admin/src/lib/backend.ts contains a forbidden hardcoded production API fallback",
  ]);
});

test("allows an explicit development proxy target", () => {
  assert.deepEqual(
    inspectAdminRuntimeConfigSources({
      "admin/vite.config.ts":
        "const DEV_PROXY_TARGET = process.env.VITE_BACKEND_URL || 'https://edutu-api.onrender.com'",
    }),
    [],
  );
});
```

- [ ] **Step 4: Run the policy test and verify RED**

Run:

```bash
node --test scripts/check-admin-runtime-config.test.mjs
```

Expected: FAIL because `inspectAdminRuntimeConfigSources` is not exported.

- [ ] **Step 5: Commit the red tests**

```bash
git add admin/src/lib/runtimeConfig.spec.ts scripts/check-admin-runtime-config.test.mjs
git commit -m "test(admin): lock production API configuration contract"
```

---

### Task 2: Implement Fail-Closed Runtime Configuration

**Files:**
- Create: `admin/src/lib/runtimeConfig.ts`
- Create: `scripts/check-admin-runtime-config.mjs`
- Modify: `admin/src/lib/backend.ts`
- Modify: `admin/vite.config.ts`
- Modify: `admin/.env.example`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces:

```ts
export type AdminRuntimeMode = "development" | "test" | "production";
export type ApiOriginSource =
  | "VITE_BACKEND_URL"
  | "VITE_API_URL"
  | "development-proxy";

export interface AdminRuntimeConfig {
  apiOrigin: string;
  source: ApiOriginSource;
  explicit: boolean;
  legacyAlias?: boolean;
  mode: AdminRuntimeMode;
}

export class AdminRuntimeConfigError extends Error {}

export function resolveAdminRuntimeConfig(
  env: Record<string, string | boolean | undefined>,
  mode: AdminRuntimeMode,
): AdminRuntimeConfig;

export function getAdminRuntimeConfig(): AdminRuntimeConfig;
```

- `getBackendBaseUrl()` remains available and delegates to `getAdminRuntimeConfig()`.

- [ ] **Step 1: Implement the pure resolver**

```ts
export function resolveAdminRuntimeConfig(
  env: Record<string, string | boolean | undefined>,
  mode: AdminRuntimeMode,
): AdminRuntimeConfig {
  const canonical = String(env.VITE_BACKEND_URL || "").trim();
  const legacy = String(env.VITE_API_URL || "").trim();
  const selected = canonical || legacy;

  if (!selected) {
    if (mode === "production") {
      throw new AdminRuntimeConfigError(
        "VITE_BACKEND_URL is required for production admin builds",
      );
    }
    return {
      apiOrigin: "",
      source: "development-proxy",
      explicit: false,
      mode,
    };
  }

  const url = new URL(selected);
  if (mode === "production" && url.protocol !== "https:") {
    throw new AdminRuntimeConfigError(
      "The production admin API origin must use HTTPS",
    );
  }

  return {
    apiOrigin: selected.replace(/\/+$/u, ""),
    source: canonical ? "VITE_BACKEND_URL" : "VITE_API_URL",
    explicit: true,
    legacyAlias: canonical ? undefined : true,
    mode,
  };
}
```

- [ ] **Step 2: Replace the browser hardcoded fallback**

`admin/src/lib/backend.ts` must no longer contain either Render hostname. Preserve its public exports and replace URL resolution with:

```ts
import { getAdminRuntimeConfig } from "./runtimeConfig";

export function getBackendBaseUrl(): string {
  return getAdminRuntimeConfig().apiOrigin;
}
```

In development, an empty origin intentionally makes `/api/...` same-origin so Vite handles it through the proxy.

- [ ] **Step 3: Make the Vite build validate production configuration**

```ts
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolveAdminRuntimeConfig } from "./src/lib/runtimeConfig";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const runtimeMode = mode === "production" ? "production" : "development";
  resolveAdminRuntimeConfig(env, runtimeMode);

  const devProxyTarget =
    env.VITE_BACKEND_URL ||
    env.VITE_API_URL ||
    "https://edutu-api.onrender.com";

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api": { target: devProxyTarget, changeOrigin: true },
        "/health": { target: devProxyTarget, changeOrigin: true },
      },
    },
  };
});
```

Only the development proxy may retain the canonical default.

- [ ] **Step 4: Implement and wire the repository policy**

`inspectAdminRuntimeConfigSources(files)` must report a failure when browser runtime files contain a hardcoded `onrender.com` fallback, but allow the explicit `DEV_PROXY_TARGET` default in `vite.config.ts`.

Add to Repository Governance:

```yaml
- run: node --test scripts/check-admin-runtime-config.test.mjs
- run: node scripts/check-admin-runtime-config.mjs
```

Set the Admin Build job environment so CI remains explicit:

```yaml
env:
  VITE_BACKEND_URL: https://api.invalid.example
```

- [ ] **Step 5: Update the environment template**

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_BACKEND_URL=https://edutu-api.onrender.com
# Temporary compatibility alias only; remove after every deployment uses VITE_BACKEND_URL.
# VITE_API_URL=https://edutu-api.onrender.com
VITE_WEB_APP_URL=https://edutu.org
```

- [ ] **Step 6: Run focused and build verification**

```bash
cd admin
npm test -- src/lib/runtimeConfig.spec.ts
VITE_BACKEND_URL=https://api.invalid.example npm run build
cd ..
node --test scripts/check-admin-runtime-config.test.mjs
node scripts/check-admin-runtime-config.mjs
```

Expected: all PASS. Also run a negative build:

```bash
cd admin
env -u VITE_BACKEND_URL -u VITE_API_URL npm run build
```

Expected: FAIL with `VITE_BACKEND_URL is required for production admin builds`.

- [ ] **Step 7: Commit**

```bash
git add admin/src/lib/runtimeConfig.ts admin/src/lib/backend.ts admin/vite.config.ts admin/.env.example scripts/check-admin-runtime-config.mjs .github/workflows/ci.yml
git commit -m "fix(admin): require an explicit production API origin"
```

---

### Task 3: Add a Shared Authenticated API Client with Safe Diagnostics

**Files:**
- Create: `admin/src/lib/apiClient.spec.ts`
- Create: `admin/src/lib/apiClient.ts`
- Modify: `admin/src/lib/backend.ts`

**Interfaces:**
- Produces:

```ts
export type AdminApiFailureCategory =
  | "configuration"
  | "authentication"
  | "authorization"
  | "timeout"
  | "network"
  | "http"
  | "invalid-response";

export class AdminApiError extends Error {
  readonly category: AdminApiFailureCategory;
  readonly status?: number;
  readonly requestId: string;
  readonly targetOrigin: string;
  readonly elapsedMs: number;
}

export async function adminApiJson<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T>;
```

- `backendFetchJson<T>` remains as a compatibility alias to `adminApiJson<T>`.

- [ ] **Step 1: Write failing API-client tests** covering:
  - bearer token and `X-Edutu-Admin-Email` headers;
  - generated `X-Request-Id`;
  - preservation of a backend-returned request ID;
  - timeout classification;
  - 401, 403, 500 categorization;
  - invalid JSON on success;
  - no token or secret text in `AdminApiError.message`.

Representative test:

```ts
it("normalizes an unavailable backend without leaking its body", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response('{"message":"database password secret"}', {
      status: 503,
      headers: { "x-request-id": "req-503" },
    }),
  );

  await expect(adminApiJson("/api/scraper/engine-status")).rejects.toMatchObject({
    category: "http",
    status: 503,
    requestId: "req-503",
  });

  try {
    await adminApiJson("/api/scraper/engine-status");
  } catch (error) {
    expect(String(error)).not.toContain("database password secret");
  }
});
```

- [ ] **Step 2: Run and verify RED**

```bash
cd admin
npm test -- src/lib/apiClient.spec.ts
```

Expected: FAIL because `apiClient.ts` does not exist.

- [ ] **Step 3: Implement `AdminApiError` and request execution**

Use `AbortSignal.timeout(timeoutMs)` when available and a local `AbortController` fallback. Read only safe response fields (`message` and `error`) for internal logging; expose a generic user message plus request ID.

- [ ] **Step 4: Convert `backend.ts` into a compatibility facade**

```ts
export { getAdminAuthHeaders } from "./apiClient";
export { adminApiJson as backendFetchJson } from "./apiClient";
export { getBackendBaseUrl } from "./runtimeConfig";
```

Keep `getBackendBaseUrl()` exported from one stable location so existing imports compile during migration.

- [ ] **Step 5: Run tests, typecheck, and build**

```bash
cd admin
npm test -- src/lib/apiClient.spec.ts src/lib/runtimeConfig.spec.ts
npx tsc -b
VITE_BACKEND_URL=https://api.invalid.example npm run build
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add admin/src/lib/apiClient.ts admin/src/lib/apiClient.spec.ts admin/src/lib/backend.ts
git commit -m "feat(admin): centralize authenticated API requests"
```

---

### Task 4: Add Safe Backend Runtime Diagnostics to Engine Status

**Files:**
- Modify: `backend/services/services/api/src/scraper/scraper.service.spec.ts`
- Modify: `backend/services/services/api/src/scraper/scraper.service.ts`

**Interfaces:**
- Extends `GET /api/scraper/engine-status` additively with:

```ts
runtime: {
  service: "edutu-api";
  environment: string;
  version: string;
  commit: string | null;
  startedAt: string;
};
```

- `version` comes from `APP_VERSION` or package version.
- `commit` comes from `RENDER_GIT_COMMIT`, `VERCEL_GIT_COMMIT_SHA`, or `GITHUB_SHA`, truncated to 12 characters.
- No environment-variable values other than the explicit safe allowlist above are returned.

- [ ] **Step 1: Add failing diagnostics tests**

```ts
it("returns safe runtime identity without exposing secrets", async () => {
  process.env.APP_VERSION = "2026.8.23";
  process.env.RENDER_GIT_COMMIT = "1234567890abcdef";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "must-not-leak";

  const result = await service.getEngineStatus();

  expect(result.runtime).toEqual({
    service: "edutu-api",
    environment: expect.any(String),
    version: "2026.8.23",
    commit: "1234567890ab",
    startedAt: expect.any(String),
  });
  expect(JSON.stringify(result)).not.toContain("must-not-leak");
});
```

- [ ] **Step 2: Run and verify RED**

```bash
cd backend/services/services/api
npm test -- --runInBand src/scraper/scraper.service.spec.ts
```

Expected: FAIL because `runtime` is absent.

- [ ] **Step 3: Implement additive safe fields**

Store `private readonly startedAt = new Date().toISOString();` on the service. Add a private `runtimeIdentity()` helper that reads only the allowlisted values.

- [ ] **Step 4: Run affected backend gates**

```bash
cd backend/services/services/api
npm test -- --runInBand src/scraper/scraper.service.spec.ts
npm run lint
npm run build
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/services/services/api/src/scraper/scraper.service.ts backend/services/services/api/src/scraper/scraper.service.spec.ts
git commit -m "feat(engine): expose safe runtime deployment identity"
```

---

### Task 5: Create a Typed Route Manifest and Preserve Every Route

**Files:**
- Create: `admin/src/app/route-manifest.spec.tsx`
- Create: `admin/src/app/route-manifest.tsx`
- Create: `admin/src/app/AdminRoutes.tsx`
- Modify: `admin/src/App.tsx`
- Modify: `admin/src/components/nav-items.tsx`

**Interfaces:**
- Produces:

```ts
export type AdminNavGroupId = "content" | "people" | "app" | "money" | "engine";

export interface AdminRouteDefinition {
  path: string;
  label: string;
  title: string;
  groupId: AdminNavGroupId | null;
  icon: LucideIcon;
  exact?: boolean;
}

export const ADMIN_ROUTES: readonly AdminRouteDefinition[];
export const ADMIN_REDIRECTS: readonly { from: string; to: string }[];
export function routeForPath(pathname: string): AdminRouteDefinition | null;
export function groupForPath(pathname: string): AdminNavGroupId | null;
```

- [ ] **Step 1: Write the exact route-preservation test**

Assert that the route set contains every path listed in the design, and that redirects equal exactly:

```ts
[
  { from: "/dashboard", to: "/" },
  { from: "/edutu-engine", to: "/engine" },
  { from: "/mobile-control", to: "/app/home" },
]
```

Also test longest-prefix matching so `/monetization/pricing` does not resolve to `/monetization` and `/engine/runs` does not resolve to `/engine`.

- [ ] **Step 2: Run and verify RED**

```bash
cd admin
npm test -- src/app/route-manifest.spec.tsx
```

Expected: FAIL because the manifest does not exist.

- [ ] **Step 3: Implement the manifest from the current routes**

Do not rename labels or paths in this task. Reuse the existing lazy page imports in `AdminRoutes.tsx` and preserve the auth boundary in `App.tsx`.

- [ ] **Step 4: Make `nav-items.tsx` a compatibility projection**

Generate its `NAV` export from `ADMIN_ROUTES`, or re-export manifest navigation selectors. Do not retain a second manually maintained route list.

- [ ] **Step 5: Run route, auth, type, and build checks**

```bash
cd admin
npm test -- src/app/route-manifest.spec.tsx src/test/harness.spec.ts
npx tsc -b
VITE_BACKEND_URL=https://api.invalid.example npm run build
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add admin/src/app/route-manifest.tsx admin/src/app/route-manifest.spec.tsx admin/src/app/AdminRoutes.tsx admin/src/App.tsx admin/src/components/nav-items.tsx
git commit -m "refactor(admin): centralize routes and navigation metadata"
```

---

### Task 6: Build the Responsive Admin Shell Behind the Existing Layout Export

**Files:**
- Create: `admin/src/shell/ShellContext.tsx`
- Create: `admin/src/shell/PrimaryRail.tsx`
- Create: `admin/src/shell/SectionNavigation.tsx`
- Create: `admin/src/shell/AdminTopbar.tsx`
- Create: `admin/src/shell/MobileNavigation.tsx`
- Create: `admin/src/shell/AdminShell.tsx`
- Create: `admin/src/shell/AdminShell.spec.tsx`
- Create: `admin/src/shell/shell.css`
- Modify: `admin/src/components/Layout.tsx`

**Interfaces:**
- `Layout.tsx` becomes:

```ts
export { default } from "../shell/AdminShell";
```

- `AdminShell` continues to render `<Outlet />`.
- Existing `theme` and `sidebar` local-storage keys remain supported.

- [ ] **Step 1: Write failing shell tests** for:
  - active top-level section and destination at `/engine/runs`;
  - icon-only rail buttons having accessible names;
  - section panel destinations preserving links;
  - mobile drawer opens, traps focus, closes on Escape, and restores trigger focus;
  - theme and collapse preferences initialize from existing local-storage keys;
  - profile, backend health, theme, and sign-out controls remain present.

- [ ] **Step 2: Run and verify RED**

```bash
cd admin
npm test -- src/shell/AdminShell.spec.tsx
```

Expected: FAIL because shell files do not exist.

- [ ] **Step 3: Implement shell state and components**

Use semantic `<nav>`, `<aside>`, and `<main>` elements. The desktop layout root must use CSS Grid:

```css
.admin-shell {
  --rail-width: 72px;
  --section-width: 232px;
  display: grid;
  grid-template-columns: var(--rail-width) minmax(0, var(--section-width)) minmax(0, 1fr);
  min-height: 100dvh;
}

.admin-shell[data-section-open="false"] {
  grid-template-columns: var(--rail-width) minmax(0, 1fr);
}
```

Do not use sibling selectors such as `.sidebar.rail ~ .main-content` for layout ownership.

- [ ] **Step 4: Implement responsive behavior**

- At `<= 1100px`, hide the persistent section panel and expose it through a controlled popover/drawer.
- At `<= 768px`, show the compact top bar and full mobile drawer.
- Use `@media (prefers-reduced-motion: reduce)` to disable navigation animations.
- Every interactive target must be at least 40px high/wide, with 44px preferred for mobile controls.
- Active destinations must use text/icon/indicator, not color alone.

- [ ] **Step 5: Replace `Layout.tsx` with the compatibility export**

Delete the old inline stylesheet only after all shell tests pass. The route tree must still import `Layout` from the old path.

- [ ] **Step 6: Verify shell and all admin gates**

```bash
cd admin
npm test -- src/shell/AdminShell.spec.tsx src/app/route-manifest.spec.tsx
npm test
npm run lint
VITE_BACKEND_URL=https://api.invalid.example npm run build
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add admin/src/shell admin/src/components/Layout.tsx
git commit -m "refactor(admin): replace fixed sidebars with responsive shell"
```

---

### Task 7: Extract Canonical Engine Types and API Adapter

**Files:**
- Create: `admin/src/features/engine/model/types.ts`
- Create: `admin/src/features/engine/model/errors.ts`
- Create: `admin/src/features/engine/api/engineApi.spec.ts`
- Create: `admin/src/features/engine/api/engineApi.ts`
- Modify: `admin/src/types/scraper.ts` only as a compatibility re-export when required.

**Interfaces:**
- Produces typed API functions listed in the design.
- `openRunStream(options, handlers, signal)` must parse authenticated SSE-over-fetch and return the final result.

```ts
export interface EngineApi {
  getStatus(): Promise<EngineStatus>;
  listSources(): Promise<ScrapeSource[]>;
  listJobs(limit?: number): Promise<ScrapeJob[]>;
  getStats(): Promise<EngineStats>;
  listSites(): Promise<OpportunitySite[]>;
  getRunStatus(): Promise<RunStatus>;
  pauseRun(): Promise<void>;
  resumeRun(): Promise<void>;
  stopRun(): Promise<void>;
}
```

- [ ] **Step 1: Write failing API tests** for all current paths, especially:
  - `/api/scraper/engine-status`;
  - `/api/scraper/sources`;
  - `/api/scraper/jobs?limit=100`;
  - `/api/scraper/stats`;
  - `/api/scraper/sites`;
  - `/api/scraper/run/status`;
  - `/api/scraper/run/stream?...`;
  - source CRUD, job deletion, settings, enhancement, and bulk import.

Include an SSE test with chunks split across arbitrary byte boundaries. The parser must handle multiple `data:` events per chunk and a final partial buffer.

- [ ] **Step 2: Run and verify RED**

```bash
cd admin
npm test -- src/features/engine/api/engineApi.spec.ts
```

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement typed models and the API adapter**

All calls use `adminApiJson`; no component or hook in the new Engine feature may call `fetch` directly except the internal stream reader owned by `engineApi.ts`.

- [ ] **Step 4: Preserve existing scraper type imports**

Where current components still import `admin/src/types/scraper.ts`, re-export the canonical types temporarily:

```ts
export type {
  ScrapeJob,
  ScrapedOpportunity,
} from "../features/engine/model/types";
```

- [ ] **Step 5: Verify**

```bash
cd admin
npm test -- src/features/engine/api/engineApi.spec.ts
npx tsc -b
npm run lint
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add admin/src/features/engine/model admin/src/features/engine/api admin/src/types/scraper.ts
git commit -m "refactor(engine): centralize types and API contracts"
```

---

### Task 8: Extract Truthful Engine Overview and Diagnostics Hooks

**Files:**
- Create: `admin/src/features/engine/hooks/useEngineOverview.spec.tsx`
- Create: `admin/src/features/engine/hooks/useEngineOverview.ts`
- Create: `admin/src/features/engine/hooks/useEngineDiagnostics.spec.tsx`
- Create: `admin/src/features/engine/hooks/useEngineDiagnostics.ts`
- Create: `admin/src/features/engine/components/EngineUnavailableState.tsx`
- Create: `admin/src/features/engine/components/EnginePartialDataBanner.tsx`
- Create: `admin/src/features/engine/components/RuntimeConfigurationCard.tsx`

**Interfaces:**
- `useEngineOverview()` returns independent resource states, never one fabricated zero object:

```ts
interface ResourceState<T> {
  status: "idle" | "loading" | "success" | "error";
  data: T | null;
  error: AdminApiError | null;
}

interface EngineOverviewState {
  status: ResourceState<EngineStatus>;
  sources: ResourceState<ScrapeSource[]>;
  jobs: ResourceState<ScrapeJob[]>;
  stats: ResourceState<EngineStats>;
  sites: ResourceState<OpportunitySite[]>;
  refresh(): Promise<void>;
}
```

- [ ] **Step 1: Write failing partial-failure tests**

Test that sources can render while stats fails, and that a total of zero is shown only when the stats request succeeded with zero—not when it failed.

- [ ] **Step 2: Run and verify RED**

```bash
cd admin
npm test -- src/features/engine/hooks/useEngineOverview.spec.tsx src/features/engine/hooks/useEngineDiagnostics.spec.tsx
```

- [ ] **Step 3: Implement concurrent independent loading**

Use `Promise.allSettled`, but retain the rejection as `AdminApiError` in the relevant resource state. Do not collapse errors into `[]`, `{ total: 0 }`, or `null` without an error marker.

- [ ] **Step 4: Implement diagnostics probes**

`useEngineDiagnostics` performs:

1. safe runtime-config inspection in-browser;
2. `GET /health/live`;
3. `GET /health/ready`;
4. authenticated Engine status;
5. drift derivation.

Drift rules include:

```ts
if (status.scraper.autoRunEnabled && !status.scraper.cronArmed) {
  checks.push({ severity: "error", code: "scheduler-intent-not-armed" });
}
if (status.ai.enabled && !status.ai.deepseekConfigured && !status.ai.geminiConfigured) {
  checks.push({ severity: "error", code: "ai-route-without-key" });
}
```

- [ ] **Step 5: Verify**

```bash
cd admin
npm test -- src/features/engine/hooks/useEngineOverview.spec.tsx src/features/engine/hooks/useEngineDiagnostics.spec.tsx
npm run lint
npx tsc -b
```

- [ ] **Step 6: Commit**

```bash
git add admin/src/features/engine/hooks admin/src/features/engine/components/EngineUnavailableState.tsx admin/src/features/engine/components/EnginePartialDataBanner.tsx admin/src/features/engine/components/RuntimeConfigurationCard.tsx
git commit -m "feat(engine): distinguish empty data from unavailable services"
```

---

### Task 9: Build `/engine/status` as the Production Diagnostics Console

**Files:**
- Create: `admin/src/features/engine/pages/EngineStatusPage.spec.tsx`
- Create: `admin/src/features/engine/pages/EngineStatusPage.tsx`
- Create: `admin/src/features/engine/components/DiagnosticCheck.tsx`
- Create: `admin/src/features/engine/components/SchedulerStatusCard.tsx`
- Create: `admin/src/features/engine/components/AiProviderStatusCard.tsx`
- Create: `admin/src/features/engine/components/EnginePolicyCard.tsx`
- Modify: `admin/src/app/AdminRoutes.tsx`

**Interfaces:**
- `/engine/status` renders `EngineStatusPage` directly.
- No Sources tab is rendered inside the page; the shell section navigation remains the only page navigation.

- [ ] **Step 1: Write failing page tests** asserting:
  - effective API target and configuration source are visible;
  - API live-but-not-ready is displayed as degraded/error, not empty;
  - database configured/reachable are distinct;
  - selected AI provider/model and key presence are visible without key values;
  - auto-run intent and cron armed state are distinct;
  - runtime version/commit are visible;
  - a request ID is shown for failed probes;
  - remediation text is specific to the failing check.

- [ ] **Step 2: Run and verify RED**

```bash
cd admin
npm test -- src/features/engine/pages/EngineStatusPage.spec.tsx
```

- [ ] **Step 3: Implement the diagnostics console**

Use reusable cards and status indicators. Never display `engineStatus.database.error` raw; map it to `Database probe failed` plus request ID.

- [ ] **Step 4: Route `/engine/status` directly to the new page**

Leave `/engine` and `/engine/runs` on the compatibility component until their tasks complete.

- [ ] **Step 5: Verify**

```bash
cd admin
npm test -- src/features/engine/pages/EngineStatusPage.spec.tsx src/app/route-manifest.spec.tsx
npm run lint
VITE_BACKEND_URL=https://api.invalid.example npm run build
```

- [ ] **Step 6: Commit**

```bash
git add admin/src/features/engine/pages/EngineStatusPage.tsx admin/src/features/engine/pages/EngineStatusPage.spec.tsx admin/src/features/engine/components/DiagnosticCheck.tsx admin/src/features/engine/components/SchedulerStatusCard.tsx admin/src/features/engine/components/AiProviderStatusCard.tsx admin/src/features/engine/components/EnginePolicyCard.tsx admin/src/app/AdminRoutes.tsx
git commit -m "feat(engine): turn status route into deployment diagnostics"
```

---

### Task 10: Extract Sources Inventory and Source Management

**Files:**
- Create: `admin/src/features/engine/hooks/useEngineSources.spec.tsx`
- Create: `admin/src/features/engine/hooks/useEngineSources.ts`
- Create: `admin/src/features/engine/pages/EngineSourcesPage.spec.tsx`
- Create: `admin/src/features/engine/pages/EngineSourcesPage.tsx`
- Create: `admin/src/features/engine/components/EngineSummaryMetrics.tsx`
- Create: `admin/src/features/engine/components/SourceInventory.tsx`
- Create: `admin/src/features/engine/components/SourceGroupCard.tsx`
- Create: `admin/src/features/engine/components/SourceRow.tsx`
- Create: `admin/src/features/engine/components/AddSourceDialog.tsx`
- Create: `admin/src/features/engine/components/RunLauncher.tsx`
- Create: `admin/src/features/engine/components/SiteBatchExplorer.tsx`
- Modify: `admin/src/app/AdminRoutes.tsx`

**Interfaces:**
- Preserve source CRUD payloads and current bulk-line grammar: `Name | URL` or bare URL.
- Preserve group creation, parent attachment, duplicate skipping, enabling/disabling, source run, group review/run, source delete, batch delete, and site delete.

- [ ] **Step 1: Write characterization tests** for every source workflow before moving code.

Include tests proving:

- a failed sources request renders an unavailable state rather than “No sources found”;
- successful empty data renders the true empty state;
- disabled sources cannot start a run;
- bulk duplicates are skipped without aborting valid additions;
- group review lists only the group’s sources and preserves editable max pages;
- destructive actions require confirmation.

- [ ] **Step 2: Run and verify RED**

```bash
cd admin
npm test -- src/features/engine/hooks/useEngineSources.spec.tsx src/features/engine/pages/EngineSourcesPage.spec.tsx
```

- [ ] **Step 3: Implement `useEngineSources` using `engineApi`**

Move source parsing, duplicate normalization, grouping, filtering, CRUD, and notifications out of the page. The hook returns actions with explicit `pending` operation IDs so one source action does not block unrelated rows.

- [ ] **Step 4: Implement presentational source components**

Replace inline style objects with feature CSS modules or a single `engine.css` token layer. Keep light/dark theme behavior.

- [ ] **Step 5: Route `/engine` directly to `EngineSourcesPage`**

Do not add a duplicate page-level Sources/Runs/Status tab bar.

- [ ] **Step 6: Verify**

```bash
cd admin
npm test -- src/features/engine/hooks/useEngineSources.spec.tsx src/features/engine/pages/EngineSourcesPage.spec.tsx
npm run lint
VITE_BACKEND_URL=https://api.invalid.example npm run build
```

- [ ] **Step 7: Commit**

```bash
git add admin/src/features/engine/hooks/useEngineSources.ts admin/src/features/engine/hooks/useEngineSources.spec.tsx admin/src/features/engine/pages/EngineSourcesPage.tsx admin/src/features/engine/pages/EngineSourcesPage.spec.tsx admin/src/features/engine/components admin/src/app/AdminRoutes.tsx
git commit -m "refactor(engine): extract source inventory and management"
```

---

### Task 11: Extract Live Runs, SSE Lifecycle, Rehydration, and Job Inspection

**Files:**
- Create: `admin/src/features/engine/hooks/useEngineRunStream.spec.tsx`
- Create: `admin/src/features/engine/hooks/useEngineRunStream.ts`
- Create: `admin/src/features/engine/hooks/useEngineRuns.spec.tsx`
- Create: `admin/src/features/engine/hooks/useEngineRuns.ts`
- Create: `admin/src/features/engine/pages/EngineRunsPage.spec.tsx`
- Create: `admin/src/features/engine/pages/EngineRunsPage.tsx`
- Create: `admin/src/features/engine/components/LiveRunPanel.tsx`
- Create: `admin/src/features/engine/components/BackgroundRunIndicator.tsx`
- Create: `admin/src/features/engine/components/RunHistory.tsx`
- Create: `admin/src/features/engine/components/RunGroup.tsx`
- Create: `admin/src/features/engine/components/JobDetailsDialog.tsx`
- Create: `admin/src/features/engine/components/OpportunityReview.tsx`
- Modify: `admin/src/components/scraper/ScrapeJobDetailsModal.tsx` as a compatibility export or delete after callers migrate.
- Modify: `admin/src/app/AdminRoutes.tsx`

**Interfaces:**
- Preserve exactly one server-side crawl at a time.
- Preserve stream events: `start`, `source-start`, `source-skip`, `control`, `opportunity`, `source-done`, `done`, `error`.
- Preserve refresh rehydration through `/api/scraper/run/status` polling.

- [ ] **Step 1: Write failing stream lifecycle tests** covering:
  - no duplicate run when server reports `running`;
  - reconnect state after mount;
  - five-second non-overlapping polling;
  - pause/resume/stop calls update state only after success;
  - abort closes the reader and resets local state;
  - minimize keeps the request alive;
  - restore reopens progress;
  - server completion refreshes jobs and summaries;
  - an SSE error becomes a visible run error with request ID.

- [ ] **Step 2: Run and verify RED**

```bash
cd admin
npm test -- src/features/engine/hooks/useEngineRunStream.spec.tsx src/features/engine/hooks/useEngineRuns.spec.tsx src/features/engine/pages/EngineRunsPage.spec.tsx
```

- [ ] **Step 3: Implement `useEngineRunStream` as a state machine**

Use explicit states:

```ts
type EngineRunPhase =
  | "idle"
  | "starting"
  | "streaming"
  | "paused"
  | "stopping"
  | "completed"
  | "failed"
  | "aborted"
  | "rehydrated";
```

Do not retain dozens of loosely coupled booleans where one phase can contradict another.

- [ ] **Step 4: Implement job inspection and review**

Preserve AI improvement, before/after comparison, selection, bulk save, job deletion, warning/error display, and empty-state distinctions.

- [ ] **Step 5: Route `/engine/runs` directly to `EngineRunsPage`**

- [ ] **Step 6: Verify**

```bash
cd admin
npm test -- src/features/engine/hooks/useEngineRunStream.spec.tsx src/features/engine/hooks/useEngineRuns.spec.tsx src/features/engine/pages/EngineRunsPage.spec.tsx src/components/scraper/ScrapeJobDetailsModal.spec.tsx
npm run lint
VITE_BACKEND_URL=https://api.invalid.example npm run build
```

- [ ] **Step 7: Commit**

```bash
git add admin/src/features/engine/hooks/useEngineRunStream.ts admin/src/features/engine/hooks/useEngineRunStream.spec.tsx admin/src/features/engine/hooks/useEngineRuns.ts admin/src/features/engine/hooks/useEngineRuns.spec.tsx admin/src/features/engine/pages/EngineRunsPage.tsx admin/src/features/engine/pages/EngineRunsPage.spec.tsx admin/src/features/engine/components admin/src/components/scraper/ScrapeJobDetailsModal.tsx admin/src/app/AdminRoutes.tsx
git commit -m "refactor(engine): isolate live runs and job review"
```

---

### Task 12: Extract Automation, Retention, and Opportunity Review Actions

**Files:**
- Create: `admin/src/features/engine/hooks/useEngineAutomation.spec.tsx`
- Create: `admin/src/features/engine/hooks/useEngineAutomation.ts`
- Create: `admin/src/features/engine/hooks/useEngineOpportunityReview.spec.tsx`
- Create: `admin/src/features/engine/hooks/useEngineOpportunityReview.ts`
- Create: `admin/src/features/engine/components/AutomationSettings.tsx`
- Create: `admin/src/features/engine/components/RetentionSettings.tsx`
- Modify: Engine Sources/Runs/Status pages to consume the focused hooks.

**Interfaces:**
- Preserve settings payload fields:

```ts
{
  auto_run_enabled?: boolean;
  cron_schedule?: string;
  data_retention_days?: number | null;
  recheck_after_days?: number | null;
}
```

- Preserve `/opportunities/admin/purge`, `/opportunities/admin/bulk-import`, and `/api/scraper/enhance-preview` contracts.

- [ ] **Step 1: Write failing settings and review tests**

Test optimistic controls do not claim success until the API succeeds; failed saves restore prior values and show a request ID. Test purge confirmation, bulk-import batching at 100 items, parallel batch accounting, and AI enhancement concurrency caps.

- [ ] **Step 2: Run and verify RED**

```bash
cd admin
npm test -- src/features/engine/hooks/useEngineAutomation.spec.tsx src/features/engine/hooks/useEngineOpportunityReview.spec.tsx
```

- [ ] **Step 3: Implement focused hooks and components**

Use one source of truth for settings; eliminate duplicated `fetchSettings` and direct settings calls from page components.

- [ ] **Step 4: Verify**

```bash
cd admin
npm test -- src/features/engine/hooks/useEngineAutomation.spec.tsx src/features/engine/hooks/useEngineOpportunityReview.spec.tsx
npm run lint
npx tsc -b
```

- [ ] **Step 5: Commit**

```bash
git add admin/src/features/engine/hooks/useEngineAutomation.ts admin/src/features/engine/hooks/useEngineAutomation.spec.tsx admin/src/features/engine/hooks/useEngineOpportunityReview.ts admin/src/features/engine/hooks/useEngineOpportunityReview.spec.tsx admin/src/features/engine/components/AutomationSettings.tsx admin/src/features/engine/components/RetentionSettings.tsx admin/src/features/engine/pages
git commit -m "refactor(engine): isolate automation and review actions"
```

---

### Task 13: Retire the `Scraper.tsx` God Component Without Breaking Imports

**Files:**
- Modify: `admin/src/pages/Scraper.tsx`
- Modify: `admin/src/App.tsx` or `admin/src/app/AdminRoutes.tsx`
- Modify: `scripts/check-large-file-budgets.mjs`
- Test: `admin/src/app/route-manifest.spec.tsx`

**Interfaces:**
- `Scraper.tsx` becomes a compatibility route dispatcher or re-export under 80 lines.
- `/engine`, `/engine/runs`, and `/engine/status` resolve directly to their new pages.

- [ ] **Step 1: Add a failing architecture assertion**

Extend route/architecture tests to assert `Scraper.tsx` does not contain `fetch(`, `useState(`, SSE parsing, or inline modal implementation and is below 80 lines.

- [ ] **Step 2: Run and verify RED**

```bash
cd admin
npm test -- src/app/route-manifest.spec.tsx
```

- [ ] **Step 3: Replace `Scraper.tsx` with compatibility exports**

```ts
export { default } from "../features/engine/pages/EngineSourcesPage";
export { EngineRunsPage } from "../features/engine/pages/EngineRunsPage";
export { EngineStatusPage } from "../features/engine/pages/EngineStatusPage";
```

Use default/named exports matching actual route imports.

- [ ] **Step 4: Lower the architecture budget**

Change the Scraper debt ceiling from `4653` to the exact measured new line count plus no more than five lines of formatting tolerance. Add `admin/src/components/Layout.tsx` to the budget at its compatibility-export size if not already governed.

- [ ] **Step 5: Run all admin and architecture gates**

```bash
cd admin
npm test
npm run lint
VITE_BACKEND_URL=https://api.invalid.example npm run build
cd ..
node scripts/check-large-file-budgets.mjs
node scripts/check-architecture-boundaries.mjs
```

- [ ] **Step 6: Commit**

```bash
git add admin/src/pages/Scraper.tsx admin/src/app/AdminRoutes.tsx scripts/check-large-file-budgets.mjs
git commit -m "refactor(engine): retire the monolithic scraper page"
```

---

### Task 14: Accessibility, Responsive, and Visual Regression Hardening

**Files:**
- Modify: `admin/src/shell/*.tsx`
- Modify: `admin/src/shell/shell.css`
- Modify: `admin/src/features/engine/components/*.tsx`
- Create: `admin/src/test/accessibility-contracts.spec.tsx`
- Create: `admin/src/test/responsive-contracts.spec.tsx`

**Interfaces:**
- No new dependency is required unless an accessibility test library is already compatible with the lockfile; prefer semantic Testing Library assertions first.

- [ ] **Step 1: Write failing accessibility contracts**

Assert:

- no unlabeled icon button;
- one primary navigation landmark and one section navigation landmark;
- drawer uses `aria-modal`, labelled title, Escape handling, and focus restoration;
- active navigation uses `aria-current="page"`;
- form errors are connected with `aria-describedby`;
- destructive confirmations move focus to the safe action first;
- status is not communicated by color alone.

- [ ] **Step 2: Write failing responsive contracts**

Render shell/components under mocked `matchMedia` states for desktop, tablet, and mobile. Assert persistent section navigation is absent at tablet width and the mobile trigger appears at mobile width.

- [ ] **Step 3: Implement the smallest accessibility/responsive corrections**

Do not redesign workflows in this task. Keep visual tokens centralized and remove inline hardcoded colors only where their semantic token replacement is exact.

- [ ] **Step 4: Verify full admin gates**

```bash
cd admin
npm test
npm run lint
VITE_BACKEND_URL=https://api.invalid.example npm run build
```

- [ ] **Step 5: Commit**

```bash
git add admin/src/shell admin/src/features/engine/components admin/src/test/accessibility-contracts.spec.tsx admin/src/test/responsive-contracts.spec.tsx
git commit -m "fix(admin): harden responsive and accessible navigation"
```

---

### Task 15: Production Deployment Evidence and Documentation

**Files:**
- Modify: `admin/ARCHITECTURE.md`
- Modify: `admin/README.md`
- Modify: `docs/superpowers/specs/2026-08-23-admin-shell-engine-production-decisions.md`
- Modify: PR #60 body/comment with evidence.

**Interfaces:**
- Documentation must identify one canonical admin deployment and one canonical API deployment.
- No secret value is recorded; only variable presence and service revision are evidence.

- [ ] **Step 1: Update architecture documentation**

Replace the obsolete Express-backend description with:

```text
Admin browser -> canonical NestJS API (`backend/services/services/api`) -> PostgreSQL/Supabase/external providers
```

Document:

- local development proxy;
- required production `VITE_BACKEND_URL`;
- temporary `VITE_API_URL` alias;
- `/health/live`, `/health/ready`, and authenticated `/api/scraper/engine-status` checks;
- admin and API deployment ownership;
- safe request-ID troubleshooting.

- [ ] **Step 2: Gather live boundary evidence**

From the actual deployed admin session, record:

- effective API origin and source;
- API runtime version and commit;
- liveness and readiness status;
- authenticated Engine status;
- database configured/reachable;
- AI key presence and selected provider;
- scheduler enabled/intent/armed/next run;
- exact admin origin accepted by CORS.

Do not claim production fixed until the actual deployed admin uses the expected API commit and the checks pass.

- [ ] **Step 3: Correct external configuration one variable at a time**

Apply only the confirmed root cause. Expected likely actions, each independently verified, are:

1. set `VITE_BACKEND_URL=https://edutu-api.onrender.com` on the canonical admin project;
2. redeploy the admin;
3. deploy the expected API commit to canonical Render `edutu-api` because `autoDeploy` is disabled;
4. restore missing required API secret presence on that service;
5. verify CORS includes `https://admin.edutu.org`.

Do not perform all five speculatively. Re-probe after each confirmed correction.

- [ ] **Step 4: Add evidence to PR #60**

Include commit SHAs, workflow run IDs, deployment revision, and safe probe outcomes. Explicitly list any remaining external blocker.

- [ ] **Step 5: Commit docs**

```bash
git add admin/ARCHITECTURE.md admin/README.md docs/superpowers/specs/2026-08-23-admin-shell-engine-production-decisions.md
git commit -m "docs(admin): document canonical deployment and diagnostics"
```

---

### Task 16: Final Verification, Deep Review, and Release Gate

**Files:**
- Review all files changed in PR #60.
- Modify only files required to fix evidenced regressions.

**Interfaces:**
- PR remains draft until all software gates below are green and live evidence is truthful.

- [ ] **Step 1: Run the complete local-equivalent verification matrix**

```bash
node --test scripts/check-admin-runtime-config.test.mjs
node scripts/check-admin-runtime-config.mjs
node --test scripts/architecture-boundaries.test.mjs
node scripts/check-architecture-boundaries.mjs
node scripts/check-large-file-budgets.mjs

cd admin
npm ci
npm test
npm run lint
VITE_BACKEND_URL=https://api.invalid.example npm run build

cd ../backend/services/services/api
npm ci
npm test -- --runInBand src/scraper/scraper.service.spec.ts
npm run lint
npm run build
```

Expected: every command exits 0.

- [ ] **Step 2: Run exact-head GitHub Actions**

Require green:

- Repository Governance;
- Architecture Governance;
- Admin Tests;
- Admin Lint;
- Admin Build;
- Backend Tests + Build;
- Backend Lint;
- Security Audit.

- [ ] **Step 3: Perform severity-ranked review**

Review for:

- P0: auth bypass, secret leakage, destructive action without confirmation, wrong production API origin;
- P1: route/workflow regression, SSE leak/duplicate run, failed calls shown as zero, inaccessible navigation;
- P2: responsive overflow, inconsistent status, unnecessary re-rendering, weak error recovery;
- P3: copy, spacing, animation, or maintainability polish.

Resolve every P0/P1 before release. Record P2/P3 follow-ups only when they are genuinely outside the approved scope.

- [ ] **Step 4: Verify live admin end to end**

Using a real authorized admin account:

1. open every preserved route;
2. create, edit, enable, disable, group, run, and delete a disposable source;
3. start a bounded scrape and observe live streaming;
4. minimize/restore, pause/resume, and gracefully stop;
5. refresh during a run and verify rehydration;
6. inspect a job, improve an item, and save a disposable result;
7. inspect Status and verify deployment identity;
8. verify mobile/tablet/desktop navigation and both themes.

- [ ] **Step 5: Mark PR ready only with evidence**

Update PR #60 from draft to ready after software gates and available external checks pass. Do not merge when the canonical production admin is still pointed at an unknown or stale backend.
