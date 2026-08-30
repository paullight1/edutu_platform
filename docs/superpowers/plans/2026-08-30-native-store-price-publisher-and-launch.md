# Native Store Price Publisher and Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a freshly authenticated administrator edit nine native USD anchors, preview their exact Apple/Google effects, publish both stores with one action, and verify partial or complete outcomes safely.

**Architecture:** A dedicated NestJS price-publisher domain owns immutable product bindings, expiring previews, durable batches/items, official Apple/Google adapters, retries, and read-back verification. The admin route renders that domain separately from web/Bachs prices; “one click” means one approved publish action, not a false claim of cross-store atomicity.

**Tech Stack:** NestJS, PostgreSQL/Supabase, App Store Connect API, Google Play Android Publisher API, React/Vite, Vitest/Testing Library

**Spec:** `docs/superpowers/specs/2026-08-30-revenuecat-iap-and-store-pricing-design.md`

## Global Constraints

- Complete the backend authority schema before this plan; reuse its exact nine store bindings.
- Apple/Google credentials remain server-only and least-privileged.
- Preview is mandatory, immutable, actor-bound, and expires; publishing accepts a preview ID, not arbitrary client prices.
- An Apple non-exact price-point match requires explicit admin selection before publish.
- Publishing defaults to new subscribers. Existing-subscriber cohort migration/consent is a separate future workflow.
- Successful items are idempotent and are not republished on retry; a batch is `verified` only after both stores read back the approved state.
- Web/Bachs pricing, promos, credits, and usage costs remain separate.

---

### Task 1: Add durable product bindings and price batches

**Files:**
- Create: `supabase/migrations/20260830130000_native_store_price_publisher.sql`
- Modify: `backend/services/services/api/src/billing/billing-schema.contract.spec.ts`

**Interfaces:**

```sql
create table public.store_product_bindings (...);
create table public.store_price_previews (... expires_at timestamptz not null ...);
create table public.store_price_change_batches (... state text not null ...);
create table public.store_price_change_items (... state text not null ...);

-- batch: draft|publishing|partially_published|published|verified|failed
-- item: pending|published|verified|failed
```

- [ ] Write failing contract assertions for all four tables, nine live bindings per store, foreign keys to canonical billing products, state checks, unique provider operation keys, immutable approved proposal, append-only audit, RLS, and service-role-only mutation.
- [ ] Run `cd backend/services/services/api && npm test -- --runInBand src/billing/billing-schema.contract.spec.ts` and confirm failure.
- [ ] Create the migration with separate Apple product and Google subscription/base-plan columns, actor-bound preview hash/expiry, batch idempotency key, item territory/price-point/provider response references, attempts, errors, and verification timestamps.
- [ ] Seed the exact identifiers from the approved catalog. Do not store credentials or full provider responses; persist safe references and normalized observations.
- [ ] Add a transaction function that consumes one unexpired preview once, verifies actor/proposal hash, creates batch/items, and writes `billing_admin_audit`.
- [ ] Run the contract suite and commit: `git add supabase/migrations/20260830130000_native_store_price_publisher.sql backend/services/services/api/src/billing/billing-schema.contract.spec.ts && git commit -m "feat(billing): add native price publication schema"`.

### Task 2: Create provider-neutral price contracts and validation

**Files:**
- Create: `backend/services/services/api/src/billing/store-pricing/store-pricing.types.ts`
- Create: `backend/services/services/api/src/billing/store-pricing/store-pricing.dto.ts`
- Create: `backend/services/services/api/src/billing/store-pricing/store-pricing.validation.ts`
- Create: `backend/services/services/api/src/billing/store-pricing/store-pricing.validation.spec.ts`

**Interfaces:**

```ts
export type NativePriceDraft = Record<
  "lite_weekly" | "lite_monthly" | "lite_yearly" |
  "pro_weekly" | "pro_monthly" | "pro_yearly" |
  "scholar_weekly" | "scholar_monthly" | "scholar_yearly",
  { usdAnchor: string }
>;

export type StorePricePreview = {
  previewId: string;
  expiresAt: string;
  items: Array<{
    packageId: keyof NativePriceDraft;
    provider: "apple" | "google";
    current: StoreObservedPrice;
    proposed: StoreProposedPrice;
    exactAnchorMatch: boolean;
    requiresSelection: boolean;
    existingSubscriberImpact: "new_subscribers_only";
  }>;
};
```

- [ ] Write failing tests for exactly nine required package keys, decimal-string parsing without binary-float money arithmetic, positive bounds, max precision, duplicate/unknown keys, unsupported currency, and effective-date policy.
- [ ] Run the focused spec and confirm failure because contracts are absent.
- [ ] Implement DTO validation and integer micros/minor-unit conversions; keep USD anchors as decimal strings at API boundaries.
- [ ] Encode `new_subscribers_only` as the only launch policy and reject hidden existing-cohort migration fields.
- [ ] Run the focused spec and commit: `git add backend/services/services/api/src/billing/store-pricing && git commit -m "feat(billing): define native store price contracts"`.

### Task 3: Implement and test the Apple pricing adapter

**Files:**
- Create: `backend/services/services/api/src/billing/store-pricing/apple-store-pricing.client.ts`
- Create: `backend/services/services/api/src/billing/store-pricing/apple-store-pricing.client.spec.ts`

**Interfaces:**

```ts
export interface AppleStorePricingClient {
  listPricePointOptions(productId: string, territory: "USA"): Promise<ApplePricePoint[]>;
  publishPrice(input: { productId: string; pricePointId: string; startDate: string }): Promise<{ providerReference: string }>;
  readCurrentPrice(productId: string, territory: "USA"): Promise<AppleObservedPrice>;
}
```

- [ ] Write failing HTTP-contract tests for ES256 App Store Connect JWT claims (`iss`, `aud=appstoreconnect-v1`, short `exp`, `kid`), timeout, pagination, 401/403, 429 retry hints, exact and non-exact price-point options, publish idempotency, and redacted errors.
- [ ] Run the focused spec and confirm failure.
- [ ] Implement the official App Store Connect API calls using injected HTTP/JWT/clock dependencies; load issuer ID, key ID, and private key only from the server secret environment.
- [ ] Return all nearest choices for a non-exact anchor; never round inside the adapter.
- [ ] Create future-dated subscription-price records for the selected price point and read back the actual scheduled/current record.
- [ ] Run the spec and commit: `git add backend/services/services/api/src/billing/store-pricing/apple-store-pricing.client* && git commit -m "feat(billing): add App Store price adapter"`.

### Task 4: Implement and test the Google Play pricing adapter

**Files:**
- Create: `backend/services/services/api/src/billing/store-pricing/google-play-pricing.client.ts`
- Create: `backend/services/services/api/src/billing/store-pricing/google-play-pricing.client.spec.ts`

**Interfaces:**

```ts
export interface GooglePlayPricingClient {
  previewRegionalPrices(input: { subscriptionId: string; basePlanId: string; usdMicros: string }): Promise<GoogleRegionalPrice[]>;
  publishBasePlanPrices(input: { subscriptionId: string; basePlanId: string; regionsVersion: string; regionalPrices: GoogleRegionalPrice[] }): Promise<{ providerReference: string }>;
  readBasePlanPrices(subscriptionId: string, basePlanId: string): Promise<GoogleObservedPrice[]>;
}
```

- [ ] Write failing HTTP-contract tests for OAuth service-account exchange, app/package scope, `monetization.convertRegionPrices`, subscription/base-plan update semantics, regions-version drift, timeouts, 401/403, 409/429, idempotent retry, and redacted errors.
- [ ] Run the focused spec and confirm failure.
- [ ] Implement token exchange and official Android Publisher endpoints with injected HTTP/clock credentials; never accept service-account material from the admin client.
- [ ] Preview complete regional values from the approved USD anchor and publish only the targeted base plan while preserving unrelated fields returned by Play.
- [ ] Read back all normalized regional prices and expose drift rather than overwriting it silently.
- [ ] Run the spec and commit: `git add backend/services/services/api/src/billing/store-pricing/google-play-pricing.client* && git commit -m "feat(billing): add Google Play price adapter"`.

### Task 5: Build preview, publish, retry, and verification services

**Files:**
- Create: `backend/services/services/api/src/billing/store-pricing/store-pricing.repository.ts`
- Create: `backend/services/services/api/src/billing/store-pricing/store-pricing.service.ts`
- Create: `backend/services/services/api/src/billing/store-pricing/store-pricing.service.spec.ts`
- Create: `backend/services/services/api/src/billing/store-pricing/store-pricing.worker.ts`
- Create: `backend/services/services/api/src/billing/store-pricing/store-pricing.worker.spec.ts`

**Interfaces:**

```ts
preview(actorId: string, draft: NativePriceDraft): Promise<StorePricePreview>;
publish(actorId: string, input: { previewId: string; appleSelections: Record<string, string>; idempotencyKey: string }): Promise<{ batchId: string }>;
retryFailed(actorId: string, batchId: string): Promise<void>;
verify(batchId: string): Promise<PriceBatch>;
```

- [ ] Write failing service tests for actor-bound expiring preview, provider preview aggregation, required Apple choice, proposal tampering, one-time consumption, fresh-auth requirement, and one idempotent batch.
- [ ] Write failing worker tests for all success, Apple-only failure, Google-only failure, safe retry of failed items, no republish of successful items, read-back match, drift, rate limit, and terminal failure.
- [ ] Implement repository and service transactions against the migration; hash canonical proposal JSON and store only normalized safe provider observations.
- [ ] Implement per-item worker leases, state aggregation, exponential retry, and immutable admin audit records.
- [ ] Mark `published` after all provider writes and `verified` only after every item reads back equal to its proposal; otherwise expose `partially_published`/`failed` and drift details.
- [ ] Run both focused suites and commit: `git add backend/services/services/api/src/billing/store-pricing && git commit -m "feat(billing): orchestrate native store price publishing"`.

### Task 6: Expose fresh-authenticated admin endpoints

**Files:**
- Create: `backend/services/services/api/src/auth/fresh-admin.guard.ts`
- Create: `backend/services/services/api/src/auth/fresh-admin.guard.spec.ts`
- Create: `backend/services/services/api/src/billing/store-pricing/store-pricing.controller.ts`
- Create: `backend/services/services/api/src/billing/store-pricing/store-pricing.controller.spec.ts`
- Modify: `backend/services/services/api/src/billing/billing.module.ts`

**Interfaces:**

```text
GET  /billing/admin/store-prices
POST /billing/admin/store-prices/preview
POST /billing/admin/store-prices/publish
GET  /billing/admin/store-prices/batches/:batchId
POST /billing/admin/store-prices/batches/:batchId/retry
```

- [ ] Write guard tests that require `AdminGuard`, an allowed publishing role (`admin` or `super_admin`), and a Clerk token `iat` no older than five minutes for publish/retry; read/preview may use normal admin auth.
- [ ] Write controller tests for DTO validation, actor scoping, idempotency key, stale preview, inaccessible batch, fixed error shapes, and 202 responses for asynchronous publish/retry.
- [ ] Run the focused specs and confirm failure.
- [ ] Implement `FreshAdminGuard` without trusting a client-supplied timestamp and expose the five routes from a dedicated controller.
- [ ] Register the controller, services, adapters, and worker in `BillingModule`; keep credentials optional only when the publisher feature flag is disabled.
- [ ] Run controller/guard tests and commit: `git add backend/services/services/api/src/auth/fresh-admin.guard* backend/services/services/api/src/billing/store-pricing backend/services/services/api/src/billing/billing.module.ts && git commit -m "feat(billing): expose native price publisher API"`.

### Task 7: Add typed admin API support

**Files:**
- Create: `admin/src/lib/storePricingApi.ts`
- Create: `admin/src/lib/storePricingApi.spec.ts`

**Interfaces:**

```ts
export const storePricingApi = {
  getCurrent(): Promise<StorePriceSnapshot>,
  preview(draft: NativePriceDraft): Promise<StorePricePreview>,
  publish(previewId: string, appleSelections: Record<string, string>, idempotencyKey: string): Promise<{ batchId: string }>,
  getBatch(batchId: string): Promise<PriceBatch>,
  retry(batchId: string): Promise<void>,
};
```

- [ ] Write failing Vitest cases for all paths, JSON bodies, idempotency header, encoded batch IDs, 202 parsing, partial-failure payload, and error sanitization.
- [ ] Run `cd admin && npm test -- src/lib/storePricingApi.spec.ts` and confirm the module is absent.
- [ ] Implement the client on top of `backendFetchJson`, reusing backend auth handling and exact shared response shapes.
- [ ] Run the focused spec and build.
- [ ] Commit: `git add admin/src/lib/storePricingApi.ts admin/src/lib/storePricingApi.spec.ts && git commit -m "feat(admin): add native store pricing API"`.

### Task 8: Build the separate Native IAP prices panel

**Files:**
- Create: `admin/src/features/monetization/NativeIapPricesPanel.tsx`
- Create: `admin/src/features/monetization/NativeIapPricesPanel.spec.tsx`
- Modify: `admin/src/pages/Monetization.tsx`
- Modify: `admin/src/lib/monetizationApi.ts`

**Interfaces:**

```text
Edit nine anchors → Preview store prices → resolve Apple choices → reauthenticate → Publish to Apple & Google → poll/read batch → retry failed items
```

- [ ] Write failing UI tests for nine fields, dirty state, validation, current-vs-proposed values, Apple non-exact choice, preview expiry, reauthentication prompt, single publish action, disabled duplicate submit, partial status, safe retry, verified state, and accessible live announcements.
- [ ] Add a regression test proving existing `savePricing()` updates only web/Bachs/admin settings and no longer claims “live for all apps.”
- [ ] Run `cd admin && npm test -- src/features/monetization/NativeIapPricesPanel.spec.tsx` and confirm failure.
- [ ] Build the panel as a separate component with Lite/Pro/Scholar rows and weekly/monthly/yearly columns; use decimal text inputs and show current store observations.
- [ ] Require Preview before Publish, make mismatched Apple mappings explicit, request Clerk reauthentication at publish, and poll the durable batch until verified/partial/failed.
- [ ] Show per-store/per-product outcomes and retry only failed items; never describe the two-store operation as atomic.
- [ ] Change the existing toast to `Web pricing settings saved.` and label promos as web/merchandising-only.
- [ ] Run focused tests, `npm run build`, and `npm run lint`.
- [ ] Commit: `git add admin/src/features/monetization admin/src/pages/Monetization.tsx admin/src/lib/monetizationApi.ts && git commit -m "feat(admin): add one-click native price publisher"`.

### Task 9: Add publisher operations, alerts, and launch gates

**Files:**
- Create: `docs/operations/native-store-price-publisher-runbook.md`
- Modify: `docs/verification/revenuecat-iap-launch-evidence.md`

**Interfaces:**

```text
Alerts: stuck publishing, partial batch, verification drift, credential/auth failure, provider rate limit
Recovery: stop new batches → preserve successful items → rotate credential if needed → retry failed items → read back
```

- [ ] Document credential ownership/rotation, preview expiry, effective-date conventions, partial failure, safe retry, provider status links, existing-subscriber limitations, and emergency disablement.
- [ ] Configure alerts for oldest publishing batch, partial/failed item count, verification drift, repeated provider auth failure, and throttling.
- [ ] In sandbox/test provider fixtures, verify exact anchor, non-exact Apple selection, proposal expiry, tampering, successful dual publish, each one-store failure, repeated retry, and read-back drift.
- [ ] In real consoles, publish a controlled future price for designated test products, verify both providers' observed state, and roll to approved launch values through a new batch.
- [ ] Confirm mobile continues to show RevenueCat/store `priceString`; admin draft and batch state cannot directly alter the app display.
- [ ] Record approvals and commit: `git add docs/operations/native-store-price-publisher-runbook.md docs/verification/revenuecat-iap-launch-evidence.md && git commit -m "docs: add native price publisher operations"`.

### Task 10: Run the combined production readiness review

**Files:**
- Modify: `docs/verification/revenuecat-iap-launch-evidence.md`

- [ ] Run `cd backend/services/services/api && npm run lint && npm run build && npm test -- --runInBand` as separate commands if shell policy forbids chaining.
- [ ] Run `cd admin && npm run lint`, `npm run build`, and `npm test`.
- [ ] Re-run the backend and mobile plan completion gates against the same catalog inventory and production build IDs.
- [ ] Confirm all store agreements/products are approved, all nine package purchases pass per platform, webhook/reconciliation queues are healthy, support procedures work, and the kill switch has been rehearsed.
- [ ] Require named product, engineering, finance, support, and release approvals in the evidence file. Any missing approval keeps launch blocked.
- [ ] Release to internal users, then a staged production cohort while monitoring purchases, paid-without-grant, webhook age, restore/transfer, refunds, and price drift.
- [ ] Commit the final evidence: `git add docs/verification/revenuecat-iap-launch-evidence.md && git commit -m "test: approve native subscription launch"`.

## Completion Gate

- [ ] One admin publish action creates an auditable, idempotent dual-store batch.
- [ ] Preview is mandatory, current, actor-bound, and explicit about non-exact Apple mappings.
- [ ] Partial publication is visible, safe to retry, and never republishes completed items.
- [ ] Both stores read back the approved prices before a batch becomes verified.
- [ ] Web pricing and native pricing are clearly separated in API, UI, copy, and operations.
- [ ] Production remains blocked until the complete store/backend/mobile/admin evidence matrix is approved.
