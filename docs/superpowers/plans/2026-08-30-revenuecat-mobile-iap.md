# RevenueCat Mobile IAP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a native Lite, Pro, and Scholar subscription experience that selects RevenueCat packages correctly on both stores, displays store-authoritative prices, and waits for server-authoritative access.

**Architecture:** The Expo app initializes RevenueCat with the authenticated Clerk subject, selects products only by custom package ID, purchases through the native store sheet, and reads durable lifecycle state from NestJS. RevenueCat customer info is a responsive hint; the NestJS projection decides access and completion.

**Tech Stack:** Expo 56, React Native, TypeScript, `react-native-purchases`, Clerk, Jest, React Native Testing Library

**Spec:** `docs/superpowers/specs/2026-08-30-revenuecat-iap-and-store-pricing-design.md`

## Global Constraints

- Work in `edutumobile/`; do not create a parallel `edutu_mobile/` directory.
- Native iOS/Android purchases use RevenueCat; web/PWA remains on the Bachs checkout rail.
- Render the chosen package's store `priceString`; admin anchors are not a native chargeable-price fallback.
- The client never writes entitlement, profile-Pro, subscription, payment-ledger, or provider-event state.
- A successful purchase SDK response enters `confirming`; only authenticated NestJS status can enter `active`.
- Require a signed-in Clerk subject before configuring or purchasing.
- Test Store keys are development-only; store builds use `appl_…` or `goog_…` public keys.

---

### Task 1: Replace product-ID matching with package-ID matching

**Files:**
- Modify: `edutumobile/lib/billingRouting.ts`
- Create: `edutumobile/lib/__tests__/billingRouting.test.ts`

**Interfaces:**

```ts
export const NATIVE_PACKAGE_IDS = {
  lite: { weekly: "lite_weekly", monthly: "lite_monthly", yearly: "lite_yearly" },
  pro: { weekly: "pro_weekly", monthly: "pro_monthly", yearly: "pro_yearly" },
  scholar: { weekly: "scholar_weekly", monthly: "scholar_monthly", yearly: "scholar_yearly" },
} as const;

export function nativePackageForPlan<T extends { identifier?: string }>(
  plan: BillingPlan,
  packages: T[],
  tier: SubscriptionTier,
): T | undefined;
```

- [ ] Write failing tests using iOS product `edutu_pro_monthly_v1`, Google product `edutu_pro_v1:monthly-auto`, and package identifier `pro_monthly`; prove both stores resolve the same package and an iOS product-ID collision cannot select it.
- [ ] Run `npm test -- --runInBand lib/__tests__/billingRouting.test.ts` and confirm the Google case fails under the current product-ID matcher.
- [ ] Export the nine package-ID map and match only `pkg.identifier`; remove `NATIVE_PRODUCT_IDS` from routing.
- [ ] Keep `visibleBillingPlans()` driven by package availability and preserve web-product mapping unchanged.
- [ ] Run the focused test and `npm run typecheck`.
- [ ] Commit: `git add edutumobile/lib/billingRouting.ts edutumobile/lib/__tests__/billingRouting.test.ts && git commit -m "fix(mobile): select RevenueCat packages by package ID"`.

### Task 2: Make RevenueCat identity lifecycle safe

**Files:**
- Modify: `edutumobile/packages/core/src/services/payments.ts`
- Modify: `edutumobile/__tests__/paymentsIdentity.test.ts`
- Modify: `edutumobile/app/(app)/profile/index.tsx`
- Modify: `edutumobile/app/(app)/profile/settings.tsx`

**Interfaces:**

```ts
export async function initRevenueCat(appUserId: string): Promise<boolean>;
export async function resetRevenueCatIdentity(): Promise<void>;
export function subscribeToCustomerInfo(
  listener: (customerInfo: CustomerInfo) => void,
): () => void;
```

- [ ] Extend identity tests to require first configuration with `{ apiKey, appUserID: "user_clerk_first" }`, no anonymous configuration, no redundant login for the same subject, explicit `logIn` only when switching an already configured session, and `logOut` plus cache clearing at Edutu logout.
- [ ] Add a failing test that signs out user A, signs in user B, and proves no cached customer info/tier from A is visible to B.
- [ ] Run `npm test -- --runInBand __tests__/paymentsIdentity.test.ts` and confirm failures.
- [ ] Configure with the authenticated subject on first initialization; implement listener registration/removal and `resetRevenueCatIdentity()` with `Purchases.logOut()`.
- [ ] Wire Edutu logout to await/reset RevenueCat before allowing the next account to populate billing UI.
- [ ] Keep missing-key behavior recoverable and block `test_` keys in non-development builds.
- [ ] Run the focused test, typecheck, and lint for touched files.
- [ ] Commit: `git add edutumobile/packages/core/src/services/payments.ts edutumobile/__tests__/paymentsIdentity.test.ts 'edutumobile/app/(app)/profile/index.tsx' 'edutumobile/app/(app)/profile/settings.tsx' && git commit -m "fix(mobile): isolate RevenueCat customer identity"`.

### Task 3: Add the authenticated NestJS billing-status client

**Files:**
- Create: `edutumobile/packages/core/src/services/billingStatus.ts`
- Create: `edutumobile/__tests__/billingStatus.test.ts`

**Interfaces:**

```ts
export type NativeSubscriptionStatus = {
  state: "none" | "active" | "canceled" | "grace_period" | "account_hold" | "paused" | "expired" | "refunded" | "price_consent_required";
  tier: "none" | "lite" | "pro" | "scholar";
  cadence: "weekly" | "monthly" | "yearly" | null;
  store: "APP_STORE" | "PLAY_STORE" | null;
  renewsAt: string | null;
  accessUntil: string | null;
  cancelAtPeriodEnd: boolean;
  scheduledChange: { tier: "lite" | "pro" | "scholar"; cadence: "weekly" | "monthly" | "yearly"; effectiveAt: string } | null;
  supportReference: string | null;
};

export function fetchBillingStatus(input: {
  getToken: () => Promise<string | null>;
  signal?: AbortSignal;
}): Promise<BillingStatusResponse>;
```

- [ ] Write failing tests for bearer-token requirement, `/billing/status`, timeout/abort, 401, non-JSON failure, schema validation, and response redaction.
- [ ] Run `npm test -- --runInBand __tests__/billingStatus.test.ts` and confirm the module is missing.
- [ ] Implement a small client using `EXPO_PUBLIC_API_URL`, a fresh Clerk token, bounded timeout, explicit response parsing, and no Supabase dependency.
- [ ] Reject invalid tier/cadence/state combinations rather than defaulting them to active.
- [ ] Run the focused test and typecheck.
- [ ] Commit: `git add edutumobile/packages/core/src/services/billingStatus.ts edutumobile/__tests__/billingStatus.test.ts && git commit -m "feat(mobile): add authoritative billing status client"`.

### Task 4: Move `useProStatus` behind NestJS

**Files:**
- Modify: `edutumobile/packages/core/src/hooks/useProStatus.ts`
- Modify: `edutumobile/__tests__/proStatusFulfillment.test.ts`
- Modify: `edutumobile/app/(app)/chat.tsx`
- Modify: `edutumobile/app/(app)/cv/index.tsx`
- Modify: `edutumobile/app/(app)/_layout.tsx`
- Modify: `edutumobile/components/chat/VoiceModeOverlay.tsx`
- Modify: `edutumobile/app/(app)/profile/view.tsx`
- Modify: `edutumobile/components/mobile-control/ModuleLockOverlay.tsx`
- Modify: `edutumobile/app/(app)/profile/index.tsx`
- Modify: `edutumobile/app/(app)/paywall.tsx`
- Modify: `edutumobile/app/(app)/opportunities/[id].tsx`
- Modify: `edutumobile/app/(app)/copilot/[id].tsx`
- Modify: `edutumobile/components/ui/LoginOfferModal.tsx`
- Modify: `edutumobile/app/(app)/wallet.tsx`

**Interfaces:**

```ts
export function useProStatus(
  userId: string | null,
  getToken: () => Promise<string | null>,
): UseProStatusReturn;
```

- [ ] Rewrite the fulfillment tests so Supabase is absent, NestJS status is the only confirmation source, a RevenueCat-active/server-pending result remains `confirming`, and server Scholar/Pro/Lite determines tier hierarchy.
- [ ] Add tests for signed-out reset, user switch, abort on unmount, grace access, account-hold suspension, canceled paid-through access, and delayed webhook polling.
- [ ] Run `npm test -- --runInBand __tests__/proStatusFulfillment.test.ts` and confirm the old Supabase signature fails expectations.
- [ ] Replace `readServerProStatus()` and Supabase realtime subscriptions with authenticated status fetch/polling. RevenueCat customer info may trigger a refresh but must not grant durable access.
- [ ] Return the complete `nativeSubscription` object and a `refreshServerStatus(expectedTier?)` result suitable for confirmation UI.
- [ ] Update every call site to supply Clerk `getToken`; remove only billing-related direct Supabase reads, preserving unrelated Supabase uses.
- [ ] Run focused tests, `npm run typecheck`, and `npm run lint`.
- [ ] Stage the hook, test, and only the twelve call-site files listed above with explicit paths; verify `git diff --cached --name-only` contains no unrelated work, then commit with `git commit -m "refactor(mobile): read subscription access from NestJS"`.

### Task 5: Model purchase, recovery, and lifecycle UI states

**Files:**
- Create: `edutumobile/lib/subscriptionPresentation.ts`
- Create: `edutumobile/lib/__tests__/subscriptionPresentation.test.ts`
- Modify: `edutumobile/app/(app)/paywall.tsx`
- Modify: `edutumobile/lib/i18n/locales/en/home.json`
- Modify: `edutumobile/lib/i18n/locales/ar/home.json`
- Modify: `edutumobile/lib/i18n/locales/es/home.json`
- Modify: `edutumobile/lib/i18n/locales/fr/home.json`
- Modify: `edutumobile/lib/i18n/locales/ha/home.json`
- Modify: `edutumobile/lib/i18n/locales/hi/home.json`
- Modify: `edutumobile/lib/i18n/locales/pt/home.json`
- Modify: `edutumobile/lib/i18n/locales/sw/home.json`
- Modify: `edutumobile/lib/i18n/locales/zh/home.json`

**Interfaces:**

```ts
export type PaywallState =
  | { kind: "loading" }
  | { kind: "unavailable"; canRetry: true; canRestore: true }
  | { kind: "ready" }
  | { kind: "purchasing" }
  | { kind: "confirming"; supportReference: string }
  | { kind: "active" | "canceled" | "grace_period" | "account_hold" | "paused" | "expired" | "refunded" | "price_consent_required"; status: NativeSubscriptionStatus };
```

- [ ] Write failing pure presentation tests for every state in the spec, action visibility, paid-through dates, scheduled changes, and tier hierarchy.
- [ ] Run `npm test -- --runInBand lib/__tests__/subscriptionPresentation.test.ts` and confirm the module is missing.
- [ ] Implement a pure reducer/presenter so lifecycle state is not spread across ad hoc component booleans.
- [ ] Update the paywall to disable duplicate taps, keep a successful SDK result in confirming until NestJS reports expected access, show a stable support reference on timeout, and never suggest repurchasing while confirmation is pending.
- [ ] For active/canceled/grace/hold/paused/expired/refunded/consent states, render the exact required recovery action and current/scheduled tier/cadence/effective date.
- [ ] Keep Retry and Restore in unavailable state, Restore on the paywall, Manage Subscription for store-owned plans, and visible Terms/Privacy/renewal/cancellation disclosure.
- [ ] Add localized strings and accessibility labels without interpolating hardcoded prices.
- [ ] Run the focused test, existing paywall tests, typecheck, and lint.
- [ ] Commit: `git add 'edutumobile/app/(app)/paywall.tsx' edutumobile/lib/subscriptionPresentation.ts edutumobile/lib/__tests__/subscriptionPresentation.test.ts edutumobile/lib/i18n/locales/*/home.json && git commit -m "feat(mobile): render subscription lifecycle states"`.

### Task 6: Render only store-authoritative package prices

**Files:**
- Modify: `edutumobile/app/(app)/paywall.tsx`
- Create: `edutumobile/__tests__/paywallStorePricing.test.tsx`

**Interfaces:**

```ts
function nativePriceText(pkg: PurchasesPackage | undefined): string | null {
  return pkg?.product?.priceString ?? null;
}
```

- [ ] Write failing tests that inject `$15.00`, `₦24,500`, and `€13,99` package price strings and require those exact values; prove native UI does not fall back to `pricing[tier]` when a package is absent.
- [ ] Add tests that an unavailable package disables its tier/cadence purchase action and exposes Retry/Restore instead of a guessed charge.
- [ ] Run `npm test -- --runInBand __tests__/paywallStorePricing.test.tsx` and confirm the current formatting fallback fails.
- [ ] Separate native display from web `effectivePrice()`: native uses `selectedPackage.product.priceString`, while web retains server-owned Bachs pricing.
- [ ] Keep native promos hidden/disabled until real store offers exist.
- [ ] Run the focused test and typecheck.
- [ ] Commit: `git add 'edutumobile/app/(app)/paywall.tsx' edutumobile/__tests__/paywallStorePricing.test.tsx && git commit -m "fix(mobile): display store-authoritative IAP prices"`.

### Task 7: Implement native plan changes

**Files:**
- Modify: `edutumobile/packages/core/src/services/payments.ts`
- Create: `edutumobile/__tests__/subscriptionChanges.test.ts`
- Modify: `edutumobile/app/(app)/paywall.tsx`

**Interfaces:**

```ts
export async function changeSubscription(input: {
  current: PurchasesStoreTransaction;
  nextPackage: PurchasesPackage;
  direction: "upgrade" | "downgrade" | "crossgrade";
}): Promise<PurchaseResult>;
```

- [ ] Write failing tests that Apple uses the subscription-group purchase flow, Google passes the current product and `IMMEDIATE_WITH_TIME_PRORATION` for upgrades, and uses `DEFERRED` for downgrades or same-tier cadence changes.
- [ ] Add tests that no replacement is attempted without an active current subscription and that a user cancellation is not reported as failure.
- [ ] Run `npm test -- --runInBand __tests__/subscriptionChanges.test.ts` and confirm the API is missing.
- [ ] Implement the SDK-version-appropriate replacement call, keeping platform-specific replacement modes inside the payments service.
- [ ] Show a confirmation summary before the store sheet and, after server confirmation, display any deferred scheduled change returned by NestJS.
- [ ] Run focused tests, typecheck, and lint.
- [ ] Commit: `git add edutumobile/packages/core/src/services/payments.ts edutumobile/__tests__/subscriptionChanges.test.ts 'edutumobile/app/(app)/paywall.tsx' && git commit -m "feat(mobile): support native subscription changes"`.

### Task 8: Add Settings recovery and the purchase kill switch

**Files:**
- Modify: `edutumobile/app/(app)/profile/settings.tsx`
- Modify: `edutumobile/lib/config.ts`
- Modify: `edutumobile/.env.example`
- Create: `edutumobile/__tests__/billingRecovery.test.tsx`
- Modify: `edutumobile/lib/i18n/locales/en/settings.json`
- Modify: `edutumobile/lib/i18n/locales/ar/settings.json`
- Modify: `edutumobile/lib/i18n/locales/es/settings.json`
- Modify: `edutumobile/lib/i18n/locales/fr/settings.json`
- Modify: `edutumobile/lib/i18n/locales/ha/settings.json`
- Modify: `edutumobile/lib/i18n/locales/hi/settings.json`
- Modify: `edutumobile/lib/i18n/locales/pt/settings.json`
- Modify: `edutumobile/lib/i18n/locales/sw/settings.json`
- Modify: `edutumobile/lib/i18n/locales/zh/settings.json`

**Interfaces:**

```text
EXPO_PUBLIC_NATIVE_IAP_PURCHASES_ENABLED=true|false
Disabled: hide/disable new purchase initiation
Unaffected: status, restore, manage, webhook processing, reconciliation
```

- [ ] Write failing UI tests for Restore Purchases and Manage Subscription in Settings, signed-out behavior, and the kill switch disabling only new purchase actions.
- [ ] Run `npm test -- --runInBand __tests__/billingRecovery.test.tsx` and confirm the controls/flag are missing.
- [ ] Add the flag to typed config with a safe default of false for production when unset.
- [ ] Add Settings recovery actions and reuse the same confirmation/status refresh flow after restore.
- [ ] Ensure the paywall can still load status and expose Restore/Manage while initiation is disabled.
- [ ] Run focused tests, typecheck, and lint.
- [ ] Commit: `git add edutumobile/lib/config.ts edutumobile/.env.example 'edutumobile/app/(app)/profile/settings.tsx' edutumobile/__tests__/billingRecovery.test.tsx edutumobile/lib/i18n/locales/*/settings.json && git commit -m "feat(mobile): add IAP recovery controls"`.

### Task 9: Run mobile release verification

**Files:**
- Modify: `docs/verification/revenuecat-iap-launch-evidence.md`

- [ ] Run `cd edutumobile && npm test -- --runInBand`.
- [ ] Run `cd edutumobile && npm run typecheck`.
- [ ] Run `cd edutumobile && npm run lint`.
- [ ] Create signed iOS and Android internal builds with production public keys and confirm no `test_` key appears in exported config.
- [ ] On physical devices, verify all nine package selections, localized display/charged price match, confirmation delay, restore, transfer, manage, disclosures, upgrades, deferred changes, grace/hold recovery, and kill switch behavior.
- [ ] Record app build IDs, device/OS, event IDs, and PASS/FAIL without customer data.
- [ ] Commit: `git add docs/verification/revenuecat-iap-launch-evidence.md && git commit -m "test(mobile): record native IAP release gate"`.

## Completion Gate

- [ ] Both platforms select all nine products by RevenueCat package ID.
- [ ] Account switches cannot leak customer or entitlement state.
- [ ] Native chargeable prices come only from store products.
- [ ] NestJS status, not the SDK response or Supabase, authorizes access.
- [ ] Every lifecycle/recovery state and store-managed plan change has tested UI.
- [ ] Signed physical-device builds pass the launch evidence matrix.
