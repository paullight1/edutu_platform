# RevenueCat Backend Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the NestJS billing module the sole durable authority for RevenueCat subscription lifecycle events and authenticated mobile billing status.

**Architecture:** Authenticated, environment-isolated webhook endpoints verify raw deliveries and durably insert them into the existing provider-event inbox. A retryable processor normalizes each lifecycle event into canonical subscription/source-grant state through one SQL transaction, while `/billing/status` returns the authoritative customer-facing projection.

**Tech Stack:** NestJS, TypeScript, Jest, Drizzle raw SQL, Supabase PostgreSQL, RevenueCat webhook API v1

**Spec:** `docs/superpowers/specs/2026-08-30-revenuecat-iap-and-store-pricing-design.md`

## Global Constraints

- Work in `backend/services/services/api`, not the outer `backend/` directory.
- Preserve `main.ts` raw-body bootstrap; all verification uses the exact `request.rawBody`.
- Clerk `sub`/`authId` is the canonical user ID; never identify a customer by email.
- Sandbox events may update sandbox rows but may never create live grants.
- A provider event is acknowledged only after durable inbox insertion; duplicate event IDs have no duplicate effect.
- A RevenueCat event can mutate only its own `revenuecat` source grants. It must not revoke Bachs or Paystack access.
- Unknown event types are stored and moved to review, not interpreted as expiration.

---

### Task 1: Add the canonical RevenueCat catalog and lifecycle SQL

**Files:**
- Create: `supabase/migrations/20260830120000_revenuecat_subscription_authority.sql`
- Modify: `backend/services/services/api/src/billing/billing-schema.contract.spec.ts`

**Interfaces:**

```sql
create or replace function public.billing_apply_revenuecat_subscription_event(
  p_environment text,
  p_event_id text,
  p_event_type text,
  p_app_user_id text,
  p_product_id text,
  p_subscription_lineage_id text,
  p_transaction_id text,
  p_occurred_at timestamptz,
  p_expires_at timestamptz,
  p_payload jsonb
) returns jsonb;
```

- [ ] Write failing contract assertions for nine native `billing_products`, all Apple/Google provider mappings, the apply function, a RevenueCat event uniqueness constraint, live-only derived grants, transfer handling, and source-scoped revocation.
- [ ] Run `npm test -- --runInBand src/billing/billing-schema.contract.spec.ts` and confirm the new assertions fail because the migration is absent.
- [ ] Create the migration: seed `lite|pro|scholar` × `weekly|monthly|yearly`, add exact store bindings, and implement `billing_apply_revenuecat_subscription_event` with `SECURITY DEFINER`, `SET search_path = ''`, explicit input validation, and service-role-only execution.
- [ ] Make the function lock the `(revenuecat, environment, lineage)` subscription row, reject an event older than `provider_updated_at` from overwriting newer state, upsert the provider subscription, and update only grants whose source matches that lineage.
- [ ] Map `INITIAL_PURCHASE`, `RENEWAL`, `UNCANCELLATION`, `SUBSCRIPTION_EXTENDED`, `REFUND_REVERSED`, and allowed temporary grants to active state; retain access through paid-through on `CANCELLATION`; map `BILLING_ISSUE` to grace when `grace_period_expiration_at_ms` is future; revoke on `EXPIRATION` and `REFUND`.
- [ ] Handle `PRODUCT_CHANGE` with current and scheduled product fields; handle `TRANSFER` by locking both owners in deterministic order, revoking the old owner's matching source grants, creating the new owner's grants, and refreshing both projections.
- [ ] Derive tier hierarchy in the status projection (`scholar` implies Pro/Lite capabilities; `pro` implies Lite) without duplicating RevenueCat entitlement attachments.
- [ ] Run the contract test and confirm it passes.
- [ ] Commit: `git add supabase/migrations/20260830120000_revenuecat_subscription_authority.sql backend/services/services/api/src/billing/billing-schema.contract.spec.ts && git commit -m "feat(billing): add RevenueCat subscription authority schema"`.

### Task 2: Prove transaction idempotency, ordering, isolation, and transfer

**Files:**
- Create: `backend/services/services/api/test/task-revenuecat/revenuecat-lifecycle-pglite-runner.ts`
- Create: `backend/services/services/api/src/billing/revenuecat-lifecycle.integration.spec.ts`

**Interfaces:**

```ts
type ApplyResult = {
  outcome: "applied" | "duplicate" | "stale" | "review";
  userId: string;
  tier: "lite" | "pro" | "scholar" | null;
};
```

- [ ] Write an integration harness that loads prerequisite billing migrations plus `20260830120000_revenuecat_subscription_authority.sql` into PGlite and invokes the function concurrently.
- [ ] Add failing tests for duplicate initial purchase, renewal-before-initial reorder, stale cancellation after newer renewal, paid-through cancellation, refund, refund reversal, sandbox/live separation, overlapping Bachs and RevenueCat grants, transfer, and unknown product/event review.
- [ ] Run `npm test -- --runInBand src/billing/revenuecat-lifecycle.integration.spec.ts` and capture the expected failures.
- [ ] Tighten the migration until every scenario produces exactly one subscription effect and only the intended source grant changes.
- [ ] Run the integration and schema contract suites together.
- [ ] Commit: `git add backend/services/services/api/test/task-revenuecat backend/services/services/api/src/billing/revenuecat-lifecycle.integration.spec.ts supabase/migrations/20260830120000_revenuecat_subscription_authority.sql && git commit -m "test(billing): prove RevenueCat lifecycle semantics"`.

### Task 3: Add environment-specific RevenueCat configuration

**Files:**
- Create: `backend/services/services/api/src/billing/providers/revenuecat/revenuecat.config.ts`
- Create: `backend/services/services/api/src/billing/providers/revenuecat/revenuecat.config.spec.ts`
- Modify: `backend/services/services/api/src/billing/providers/revenuecat/revenuecat-webhook.types.ts`
- Modify: `backend/services/services/api/src/billing/providers/revenuecat/revenuecat-webhook.verifier.ts`
- Modify: `backend/services/services/api/src/billing/providers/revenuecat/revenuecat-webhook.verifier.spec.ts`
- Modify: `backend/services/services/api/src/main.ts`
- Modify: `backend/services/services/api/.env.example`

**Interfaces:**

```ts
export type RevenueCatDeliveryConfig = {
  enabled: boolean;
  environment: "sandbox" | "production";
  authorizationSecret: string;
  hmacSecret: string;
  allowedAppIds: readonly string[];
  allowedStores: readonly ("APP_STORE" | "PLAY_STORE")[];
};

export function loadRevenueCatDeliveryConfig(
  environment: "sandbox" | "production",
): RevenueCatDeliveryConfig;
```

- [ ] Write failing configuration tests for missing secrets, secret reuse across environments, malformed allowlists, missing app IDs, disabled integrations, and production startup validation.
- [ ] Change verifier configuration from one `expectedAppId` to `allowedAppIds`; add tests for either approved Apple/Google app and rejection of missing/wrong IDs.
- [ ] Implement strict config loading from `REVENUECAT_{SANDBOX|PRODUCTION}_*`; require both Authorization and HMAC when enabled and compare secrets to prevent accidental sandbox/production reuse.
- [ ] Extend `validateEnvironment()` so production refuses to start when an enabled integration is incomplete, but webhook receipt can remain enabled while `NATIVE_IAP_PURCHASES_ENABLED=false`.
- [ ] Update `.env.example` with names and safe comments only.
- [ ] Run `npm test -- --runInBand src/billing/providers/revenuecat/revenuecat.config.spec.ts src/billing/providers/revenuecat/revenuecat-webhook.verifier.spec.ts src/main.spec.ts`.
- [ ] Commit: `git add backend/services/services/api/src/billing/providers/revenuecat backend/services/services/api/src/main.ts backend/services/services/api/.env.example && git commit -m "feat(billing): isolate RevenueCat delivery configuration"`.

### Task 4: Implement durable inbox persistence and webhook acceptance

**Files:**
- Create: `backend/services/services/api/src/billing/billing-events.persistence.ts`
- Create: `backend/services/services/api/src/billing/billing-events.persistence.spec.ts`
- Create: `backend/services/services/api/src/billing/revenuecat-webhook.service.ts`
- Create: `backend/services/services/api/src/billing/revenuecat-webhook.service.spec.ts`
- Modify: `backend/services/services/api/src/billing/billing.controller.ts`
- Modify: `backend/services/services/api/src/billing/billing.module.ts`
- Modify: `backend/services/services/api/src/billing/billing-events.repository.ts`

**Interfaces:**

```ts
@Public()
@Post("webhooks/revenuecat/:environment")
@HttpCode(HttpStatus.ACCEPTED)
handleRevenueCatWebhook(
  @Param("environment") environment: "sandbox" | "production",
  @Headers("authorization") authorization: string | undefined,
  @Headers("x-revenuecat-webhook-signature") signature: string | undefined,
  @Req() request: RawBodyRequest<Request>,
): Promise<{ accepted: true; eventId: string; duplicate: boolean }>;
```

- [ ] Write failing persistence tests for insert/duplicate/hash-conflict, `FOR UPDATE SKIP LOCKED` leasing, completion, exponential retry, review, and dead-letter transition.
- [ ] Implement the Drizzle/Postgres persistence for the existing `BillingEventsPersistence` interface without logging raw customer payloads.
- [ ] Write failing service/controller tests for missing raw body, wrong route environment, wrong auth/HMAC/app/store/payload environment, durable insertion before 202 response, exact duplicate, and same-ID/different-hash conflict.
- [ ] Implement `RevenueCatWebhookService` using the existing parser/verifier and `BillingEventsRepository`; translate verifier errors to fixed 400/401/413 responses without secret details.
- [ ] Register both configured services, shared persistence, and routes in `BillingModule`/`BillingController`.
- [ ] Run `npm test -- --runInBand src/billing/billing-events.persistence.spec.ts src/billing/revenuecat-webhook.service.spec.ts src/billing/billing.controller.spec.ts`.
- [ ] Commit: `git add backend/services/services/api/src/billing && git commit -m "feat(billing): accept RevenueCat webhooks durably"`.

### Task 5: Process and reconcile RevenueCat lifecycle events

**Files:**
- Create: `backend/services/services/api/src/billing/revenuecat-event.processor.ts`
- Create: `backend/services/services/api/src/billing/revenuecat-event.processor.spec.ts`
- Create: `backend/services/services/api/src/billing/providers/revenuecat/revenuecat.client.ts`
- Create: `backend/services/services/api/src/billing/providers/revenuecat/revenuecat.client.spec.ts`
- Modify: `backend/services/services/api/src/billing/billing-reconciliation.providers.ts`
- Modify: `backend/services/services/api/src/billing/billing.module.ts`

**Interfaces:**

```ts
export class RevenueCatEventProcessor {
  processBatch(limit?: number): Promise<{
    processed: number;
    retried: number;
    reviewed: number;
  }>;
}

export interface RevenueCatSubscriberSnapshot {
  appUserId: string;
  activeEntitlements: Array<{ id: string; productId: string; expiresAt: Date | null }>;
}
```

- [ ] Write failing processor tests for all lifecycle types in the approved spec, including `PRICE_INCREASE_CONSENT_REQUIRED` and `PRICE_INCREASE_CONSENT_APPROVED`, plus retryable database/provider errors, permanent product/identity mismatch review, unknown additive fields, unknown event type review, and sanitized logging.
- [ ] Normalize the flat v1 event into the SQL function arguments; refuse anonymous RevenueCat IDs and identity candidates that do not resolve to an authenticated Clerk subject.
- [ ] Schedule batch processing using the repository lease/complete/retry/review contract. Do not make the HTTP delivery wait for fulfillment.
- [ ] Implement a timeout-bound, secret-key-only RevenueCat client for subscriber reconciliation and redact URLs/headers from errors.
- [ ] Add a RevenueCat reconciliation adapter that detects paid-without-grant, grant-without-provider-access, stale scheduled changes, and product mismatches; repairs only safe source-scoped drift and creates review cases otherwise.
- [ ] Run the processor, reconciliation, and redaction test suites.
- [ ] Commit: `git add backend/services/services/api/src/billing && git commit -m "feat(billing): process and reconcile RevenueCat subscriptions"`.

### Task 6: Make `/billing/status` authoritative and state-complete

**Files:**
- Modify: `backend/services/services/api/src/billing/dto/billing.dto.ts`
- Modify: `backend/services/services/api/src/billing/billing.service.ts`
- Modify: `backend/services/services/api/src/billing/billing.service.spec.ts`
- Modify: `backend/services/services/api/src/billing/billing.controller.spec.ts`

**Interfaces:**

```ts
export interface NativeSubscriptionStatus {
  state: "none" | "active" | "canceled" | "grace_period" | "account_hold" | "paused" | "expired" | "refunded" | "price_consent_required";
  tier: SubscriptionTier;
  cadence: BillingInterval | null;
  store: "APP_STORE" | "PLAY_STORE" | null;
  renewsAt: string | null;
  accessUntil: string | null;
  cancelAtPeriodEnd: boolean;
  scheduledChange: { tier: SubscriptionTier; cadence: BillingInterval; effectiveAt: string } | null;
  supportReference: string | null;
}
```

- [ ] Write failing tests showing that canonical `billing_provider_subscriptions` and derived grants outrank legacy `profiles`/`billing_subscriptions`, Scholar/Pro/Lite hierarchy is correct, grace retains access, account hold does not, cancellation retains paid-through access, and scheduled changes are returned.
- [ ] Replace the legacy subscription read in `getStatus()` with one canonical query/RPC by Clerk subject; retain legacy profile fields only as a temporary display fallback when no canonical rows exist.
- [ ] Return `nativeSubscription` alongside existing compatibility fields so older consumers do not break during rollout.
- [ ] Ensure the endpoint returns no raw provider payload, secret identifier, email, or another user's state.
- [ ] Run `npm test -- --runInBand src/billing/billing.service.spec.ts src/billing/billing.controller.spec.ts`.
- [ ] Commit: `git add backend/services/services/api/src/billing && git commit -m "feat(billing): expose authoritative subscription status"`.

### Task 7: Cut over safely and retire the legacy Supabase webhook

**Files:**
- Modify: `edutumobile/supabase/functions/revenuecat-webhook/index.ts`
- Create: `docs/operations/revenuecat-webhook-runbook.md`
- Modify: `docs/verification/revenuecat-iap-launch-evidence.md`

**Interfaces:**

```text
Cutover order: deploy NestJS disabled → migrate → enable sandbox → reconcile → enable production → disable legacy function
Rollback: disable new purchases; keep NestJS webhook receipt and reconciliation enabled
```

- [ ] Write the runbook with deploy order, feature flags, TEST delivery, queue-depth/dead-letter/product-mismatch alerts, replay command, support lookup keys, and rollback behavior.
- [ ] Deploy migrations and backend with webhook routes present but native purchase initiation disabled.
- [ ] Enable sandbox delivery, replay lifecycle fixtures, and reconcile to zero unexplained drift.
- [ ] Enable production delivery and verify at least one durable TEST event plus a controlled store transaction before disabling the old endpoint.
- [ ] Change the legacy Supabase function to return `410 Gone` with no mutation path, and remove its RevenueCat webhook registration only after the production endpoint is observed healthy.
- [ ] Verify `rg -n "billing_entitlements|profiles.*is_pro" edutumobile/supabase/functions/revenuecat-webhook` finds no active mutation statement.
- [ ] Record the cutover timestamps and event IDs, then commit: `git add edutumobile/supabase/functions/revenuecat-webhook/index.ts docs/operations/revenuecat-webhook-runbook.md docs/verification/revenuecat-iap-launch-evidence.md && git commit -m "chore(billing): retire legacy RevenueCat webhook"`.

### Task 8: Run the backend release gate

**Files:**
- Modify: `docs/verification/revenuecat-iap-launch-evidence.md`

- [ ] Run `cd backend/services/services/api && npm run lint`.
- [ ] Run `cd backend/services/services/api && npm run build`.
- [ ] Run `cd backend/services/services/api && npm test -- --runInBand`.
- [ ] Run the production-focused e2e suite with a test database and verify invalid/duplicate/reordered deliveries plus authenticated status isolation.
- [ ] Exercise the purchase kill switch and confirm webhook receipt, renewals, restores, event processing, and reconciliation continue.
- [ ] Record outputs and commit the evidence: `git add docs/verification/revenuecat-iap-launch-evidence.md && git commit -m "test(billing): record RevenueCat backend release gate"`.

## Completion Gate

- [ ] NestJS is the only enabled RevenueCat entitlement writer.
- [ ] Every accepted delivery is durably deduplicated before HTTP 202.
- [ ] Lifecycle state, source isolation, ordering, and transfer semantics pass integration tests.
- [ ] `/billing/status` is authoritative, authenticated, and state-complete.
- [ ] Reconciliation, replay, dead-letter alerts, and the purchase kill switch are operational.
