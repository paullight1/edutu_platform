# Edutu Web App Launch Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `edutu-web-app` launch-ready by resolving build/typecheck blockers, removing stale pre-launch code from the active type surface, and verifying the production app in a browser.

**Architecture:** Keep the existing Vite/React/Clerk/Supabase architecture intact. Prioritize live routes under `src/App.tsx` and `src/admin/AdminRoot.tsx`; quarantine unused Firebase-era admin files that are not imported by the production bundle.

**Tech Stack:** React 18, Vite 5, TypeScript 5, Clerk React, Supabase JS v2, Vitest, ESLint, Vite PWA.

---

### Task 1: Baseline Launch Gates

**Files:**
- Read: `edutu-platform/edutu-web-app/package.json`
- Read: `edutu-platform/edutu-web-app/src/App.tsx`
- Read: `edutu-platform/edutu-web-app/src/admin/AdminRoot.tsx`

- [x] **Step 1: Run current checks**

Run:
```powershell
npm run typecheck
npm run lint
npm run test
npm run build
```

Observed:
```text
typecheck: fails on stale admin modules, missing types, and live route prop/type mismatches.
lint: fails on many pre-existing unused/no-explicit-any rules.
test: exits 0 with 12 tests passing, but logs an intentional ErrorBoundary stack trace.
build: exits 0 and emits production assets.
```

### Task 2: Quarantine Dead Pre-Launch Admin Code

**Files:**
- Modify: `edutu-platform/edutu-web-app/tsconfig.app.json`
- Keep active: `edutu-platform/edutu-web-app/src/admin/AdminRoot.tsx`
- Quarantine from typecheck: unused Firebase-era admin feature files and legacy `src/admin/AdminApp.tsx`

- [ ] **Step 1: Exclude unused legacy files from `tsc -b`**

Add an `exclude` list for files that are not imported by the production route graph but still pull missing Firebase/mock modules into typecheck:
```json
"exclude": [
  "src/admin/AdminApp.tsx",
  "src/components/admin",
  "src/services/admin/opportunities.ts",
  "src/services/admin/opportunitiesSupabase.ts",
  "src/services/admin/opportunitiesWebhook.ts"
]
```

- [ ] **Step 2: Re-run `npm run typecheck`**

Expected: remaining errors should only be from live app/admin routes.

### Task 3: Fix Live Route Type Errors

**Files:**
- Modify: `edutu-platform/edutu-web-app/src/App.tsx`
- Modify: live component/service/type files identified by `npm run typecheck`

- [ ] **Step 1: Fix route prop mismatches**

Add required handlers for `SavedOpportunities` and `DeadlinesScreen`, and type route callbacks without `any`.

- [ ] **Step 2: Fix strict null and async result mismatches**

Address `user` null handling, missing imports, incorrect async goal creation, and component props that would break under strict TypeScript.

- [ ] **Step 3: Re-run `npm run typecheck`**

Expected: exit 0 or a smaller, justified list of non-launch blockers.

### Task 4: Security and Runtime Audit

**Files:**
- Read: `edutu-platform/edutu-web-app/src/lib/supabaseClient.ts`
- Read: `edutu-platform/edutu-web-app/src/main.tsx`
- Read: `edutu-platform/edutu-web-app/src/components/AdminGuard.tsx`
- Read: `edutu-platform/edutu-web-app/src/components/LandingPageV3.tsx`

- [ ] **Step 1: Search for exposed secrets and unsafe DOM writes**

Run:
```powershell
rg -n "SERVICE_ROLE|SECRET|PRIVATE|OPENROUTER|GEMINI|SUPABASE_SERVICE|service_role|sk_|CLERK_SECRET|VITE_.*KEY|dangerouslySetInnerHTML|innerHTML|eval\(" src .env.example package.json vite.config.ts index.html public supabase
```

- [ ] **Step 2: Fix launch-critical issues**

Remove unsafe client-side secret usage and replace avoidable `innerHTML` writes with safe DOM text APIs when they touch runtime UI.

### Task 5: Browser Verification

**Files:**
- Runtime: local Vite dev server

- [ ] **Step 1: Start the app locally**

Run:
```powershell
npm run dev -- --host 127.0.0.1
```

- [ ] **Step 2: Open the app in a browser**

Verify `/`, `/about`, `/opportunities`, `/auth`, and a protected app redirect path load without blank screens or console crashes.

### Task 6: Final Gate

**Files:**
- Run commands only.

- [ ] **Step 1: Run final verification**

Run:
```powershell
npm run typecheck
npm run test
npm run build
```

- [ ] **Step 2: Report launch status**

Report exact pass/fail evidence and any remaining launch risks.
