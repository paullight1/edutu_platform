# Web App Monetization Wire-Up — Design

**Date:** 2026-07-18
**App:** `edutu-web-app` (Vite + React + react-router + Clerk)
**Status:** Approved, implementing

## Problem

The web app already ships ~80% of a paywall but it is **disconnected**. Present:
`services/billing.ts` (`getBillingStatus`, `createCheckout` → backend `/billing/checkout`),
`hooks/useBillingStatus.ts`, `components/ui/UpgradeModal.tsx` (fully functional — accepts
`reason`, `returnTo`; reads admin pricing from `/mobile-control/config`; redirects to Paystack),
`UpgradeRequiredError` (402 `insufficient_credits`) thrown by `services/productApi.ts` and
`services/roadmapApi.ts`, and backend `/billing/*` metering shared with mobile.

**Missing wiring:** `UpgradeModal` is never mounted or triggered; `UpgradeRequiredError` is thrown
but nothing catches it to open the paywall; no Pro badges / lock affordances; no standalone
purchase page. A free user hitting a gate gets a generic error, not the paywall.

**Why it matters:** Web checkout via Paystack costs ~1.5–3% vs 15–30% on app stores. Web should be
the primary, fee-free purchase surface. Billing is already platform-agnostic (entitlements keyed by
raw Clerk id), so a Pro user is Pro on web and mobile automatically.

## Decisions (approved)

- **Gating:** soft meter (honor backend 402 → open paywall) **+** hard-lock a few Pro-only features.
- **Surfaces:** in-context `UpgradeModal` **+** standalone public `/upgrade` (alias `/pro`) page.
- **Visibility:** `PRO` badge for subscribers, Pro lock affordances on hard-locked features, a
  persistent "Upgrade" entry point in the app nav for free users.

## Architecture

### 1. `hooks/usePaywall.tsx` — new global context (the hub)
Mounted once in `main.tsx` inside `AuthProvider`. Owns the single `UpgradeModal` instance and the
shared billing status (wraps `useBillingStatus` so the whole app shares one fetch).
- Exposes: `openPaywall({ reason?, feature?, returnTo? })`, `closePaywall()`, `isPro`, `billing`,
  `refreshBilling()`.
- Renders `<UpgradeModal>` internally, driven by context state.
- `handleUpgradeError(error)` helper: if `isUpgradeRequiredError(error)` → `openPaywall({ reason })`
  and returns true; else returns false so callers rethrow.

### 2. Gate wiring (soft meter)
Call sites that invoke metered AI/roadmap/CV endpoints wrap their catch with the hub's
`handleUpgradeError`. The **backend stays the source of truth** for the free-tier count — no client
counters. Files: `RoadmapsPage.tsx` (roadmap generation/enroll), plus any AI/product call site that
can 402.

### 3. `components/ProGate.tsx` — hard-lock (new, self-contained)
- `<ProGate feature="advanced-filters">…children…</ProGate>`: if `isPro`, render children; else render
  children visually with a Pro lock overlay/affordance whose click calls `openPaywall({ feature })`.
- `useProFeature(feature): { isPro, requirePro(): boolean }` hook for imperative guards —
  `requirePro()` returns true if allowed, else opens the paywall and returns false.

### 4. `components/UpgradePage.tsx` — public `/upgrade` (new, self-contained)
Full pricing (reads the same `/mobile-control/config` pricing helper the modal uses; same
`effectivePrice`/`formatMoney` logic — extract shared helper if clean, else mirror), outcome-based
benefit list, short FAQ, "Continue to secure checkout" → `createCheckout` → Paystack redirect.
Works logged-out (CTA routes to sign-in first, preserving intent). Already-Pro users see a
"You're on Pro" state. Routes `/upgrade` and `/pro` (alias) added in `App.tsx`.

### 5. Pro visibility in `AppWorkspaceShell.tsx`
- `PRO` badge near the workspace header/profile when `isPro`.
- A persistent "Upgrade" nav entry (secondary nav or header CTA) for non-Pro users → routes to
  `/upgrade` (or opens the modal).

### 6. Checkout return
`useBillingStatus` already refetches on `visibilitychange`; returning from Paystack re-checks Pro.
`/upgrade` additionally calls `refreshBilling()` on mount so a fresh grant reflects immediately.

## Non-goals (YAGNI)
- No new backend endpoints — reuse `/billing/status`, `/billing/checkout`, metering, entitlements.
- No new pricing source — reuse admin `/mobile-control/config`.
- No client-side free-tier counters — backend 402 is authoritative.
- No changes to mobile or `pay-edutu-org`.

## Files
**New:** `hooks/usePaywall.tsx`, `components/ProGate.tsx`, `components/UpgradePage.tsx`.
**Edited:** `main.tsx` (mount provider), `App.tsx` (routes + lazy import), `AppWorkspaceShell.tsx`
(badge + Upgrade CTA), `RoadmapsPage.tsx` + AI call sites (catch → openPaywall). `UpgradeModal.tsx`
already supports `reason`/`returnTo` — no change expected.

## Testing / verification
- Type-check (`tsc`) and the web lint gate (`--max-warnings 0`) must pass.
- Existing vitest suite green; add a focused test that `usePaywall.openPaywall` mounts the modal and
  that `handleUpgradeError` opens it on an `UpgradeRequiredError`.
- Manual: free user hits a metered gate → modal opens; `/upgrade` renders pricing from config and a
  Pro user sees the "already Pro" state.

## Execution (parallel)
1. **Foundation (sequential, first):** `usePaywall.tsx` + mount in `main.tsx`.
2. **Parallel agents (disjoint files):** (A) `UpgradePage.tsx`; (B) `ProGate.tsx` + `useProFeature`;
   (C) gate wiring in `RoadmapsPage.tsx`/AI call sites.
3. **Integration (sequential, last):** `App.tsx` routes + `AppWorkspaceShell.tsx` badge/CTA (shared
   files kept single-writer to avoid conflicts), then tsc + lint + tests.
