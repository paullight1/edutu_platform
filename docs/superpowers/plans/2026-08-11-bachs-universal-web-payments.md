# Bachs Universal Web Payments Hardening Plan

> **For agentic workers:** Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to implement this plan task by task. Track progress with the checkboxes and do not enable live Bachs collection until the launch gate passes.

**Goal:** Make Bachs the safe universal web/PWA payment rail for Pro subscriptions, season passes, and credit packs while RevenueCat remains the native App Store/Play Store rail.

**Architecture:** The NestJS billing module is the only payment authority. Authenticated clients ask it to create a checkout from a server-owned product key; the API stores a durable intent and creates a Bachs session with an idempotency key. Bachs hosts the payment UI. Browser returns display status only. Signed Bachs and RevenueCat events enter one durable event inbox and are processed transactionally into provider-specific transactions, subscriptions, and entitlement grants. `billing_entitlements` and `profiles.is_pro` become compatibility projections, never independent authorities.

**Provider/UI ownership:**

- Edutu owns pricing presentation, sign-in, purchase status, receipts/history links, support, and account entry at `pay.edutu.org`.
- Bachs owns hosted checkout, card/bank/mobile-money/crypto collection, card updates, dunning links, and the hosted customer portal.
- RevenueCat and Apple/Google own native purchase and native subscription management.
- The webhook does not need to live on the checkout hostname. Register one stable canonical API URL, preferably `https://api.edutu.org/billing/webhooks/bachs`. Until that hostname exists, use the deployed Render API URL only after route verification.
- Bachs currently documents recurring products as USD-card-only. Edutu must treat non-card weekly/monthly/yearly purchases as bounded one-time access passes unless Bachs confirms broader recurring support; the UI must not call them auto-renewing subscriptions.

**Tech stack:** NestJS, TypeScript, Clerk, PostgreSQL/Supabase, Drizzle/raw transactional SQL, Next.js 14, React/Vite, Expo/React Native, Bachs REST API and hosted checkout, RevenueCat native IAP.

## Non-negotiable billing invariants

- A browser redirect, overlay event, mobile callback, or client claim never grants money, credits, or Pro.
- The authenticated Clerk/Supabase auth subject is resolved server-side. Clients never choose the billing `user_id`.
- Billing uses the raw auth subject (`request.user.authId`) as its canonical text key. Internal row IDs may be UUIDs, but Clerk subjects are not reinterpreted as UUIDs.
- A checkout request names only an Edutu product key. Product ID, amount, currency, cadence, environment, and fulfillment type are server-owned.
- Every provider `POST` uses an Edutu idempotency key and every provider event is unique by `(provider, environment, event_id)`.
- An event is acknowledged only after durable receipt. Fulfillment is atomic or safely resumable.
- Recurring access follows provider `current_period_end`; it is not extended by a hard-coded number of days on each webhook.
- Cadence and renewal mode are separate catalog fields. “Monthly” can mean a monthly auto-renewing card subscription or a 30/31-day one-time pass; the checkout and receipt must state which one the user is buying.
- One-time passes create one immutable bounded grant. Credit packs create one immutable credit-ledger entry.
- Pro is true while any non-revoked, unexpired grant is active. One provider cannot revoke another provider's grant.
- Amounts are integer minor units plus uppercase ISO currency. Never mix major/minor units or use floating point for ledger money.
- Sandbox and live products, customers, keys, webhook secrets, rows, and reports remain explicitly separated.
- Full refund or chargeback suspends only the affected grant by default. Partial refunds create a review case. Failed/underpaid payments never fulfill.
- Every manual grant, refund, replay, override, and reconciliation repair has a named operator, reason, timestamp, and immutable audit row.

## Phase 0 — Stop unsafe activation and clean credentials

### Task 0.1: Keep Bachs collection disabled until the ingress is real

**Operational actions:**

- [ ] Disable or unpublish any customer-facing Bachs payment links. Sandbox test links may remain accessible only to testers.
- [ ] In Bachs sandbox, disable the webhook destination pointed at the Edutu homepage.
- [ ] Do not register `https://pay.edutu.org/api/webhooks/bachs` until that route exists. The current live response is `404`.
- [ ] Do not deploy the current local acknowledge-only handler as the final implementation. It returns `2xx` with `ignored: true` for every valid event.
- [ ] Decide and provision the stable API domain `api.edutu.org`; ensure it does not have Vercel/Render interactive authentication or bot protection on the webhook path.
- [ ] Add a temporary launch flag `BACHS_CHECKOUT_ENABLED=false` in backend and all client environments. Default false when missing.

**Verification:**

- [ ] A public probe to the disabled checkout endpoint returns a controlled `503 payments_not_ready`, not a Bachs URL.
- [ ] A public unsigned webhook probe returns `401`, not `404` or `2xx`.
- [ ] Bachs Events shows no enabled destination pointing to a homepage or protected preview deployment.

### Task 0.2: Remove and rotate exposed/test credentials

**Files:**

- Modify: `edutumobile/.env.example`
- Modify: `pay-edutu-org/.env.example`
- Modify: `edutumobile/lib/devMockPurchase.ts`
- Modify: `.gitignore` if any local payment env file is not already ignored
- Add CI secret scanning in the existing GitHub workflow location

- [ ] Remove the standalone Bachs sandbox key from `edutumobile/.env.example`.
- [ ] Restore every example variable to an obvious placeholder; no credential-like value belongs in a tracked example.
- [ ] Delete the client-side dev mock purchase path or move it to a server-only development endpoint that is compiled out and disabled outside local development.
- [ ] Remove `EXPO_PUBLIC_RC_WEBHOOK_SECRET_DEV`; a webhook secret must never use an `EXPO_PUBLIC_` variable.
- [ ] Rotate the disclosed Bachs sandbox key and any static admin/webhook value that may have been copied into an active environment.
- [ ] Add secret scanning for Bachs, Paystack, Supabase service-role, RevenueCat webhook, and generic high-entropy bearer values.
- [ ] Document key owner, scopes, environment, creation date, and rotation date without recording the value.

**Verification:**

- [ ] `rg -l "sk_(sandbox|live)_" . -g '!**/.git/**' -g '!**/node_modules/**'` returns only intentionally redacted test fixtures, ideally none.
- [ ] A release mobile bundle contains no RevenueCat webhook authorization value.
- [ ] The old Bachs sandbox key receives `401` after rotation.

## Phase 1 — Establish one canonical billing schema and identity

### Task 1.1: Inventory the live database before migration

**Files:**

- Create: `backend/services/services/api/scripts/audit-billing-schema.mjs`
- Create: `docs/operations/billing-schema-cutover.md`

- [ ] Query `pg_catalog` for actual columns, checks, unique indexes, RLS policies, triggers, and row counts on `payments`, `payment_transactions`, `billing_transactions`, `billing_subscriptions`, `subscriptions`, `billing_entitlements`, `processed_webhook_events`, `credit_purchases`, and `credit_transactions`.
- [ ] Report rows using raw Clerk subjects versus derived UUIDs without printing email or raw provider payloads.
- [ ] Report provider/type/plan/status values that would violate the desired schema.
- [ ] Take a database backup or verified point-in-time recovery checkpoint before migration.
- [ ] Declare root `supabase/migrations/` the canonical migration directory for new billing changes; do not add a fourth divergent schema file.

### Task 1.2: Add provider-neutral durable billing tables

**Files:**

- Create: `supabase/migrations/20260811120000_bachs_unified_billing_core.sql`
- Modify: `backend/services/services/api/src/db/schema.ts` only after confirming live text column types
- Test: `backend/services/services/api/src/billing/billing-schema.contract.spec.ts`

Create these canonical structures:

- `billing_products`: `product_key`, fulfillment kind, `renewal_mode` (`recurring` or `one_time`), supported payment-method policy, provider/environment product IDs, expected amount minor, currency, cadence, enabled flag, and catalog version.
- `billing_checkout_intents`: UUID primary key, opaque public token hash, raw `user_id`, provider/environment, product snapshot, expected money, provider checkout/reference, status, expiry, idempotency key, and timestamps.
- `billing_provider_customers`: `(provider, environment, user_id)` and unique provider customer ID mapping.
- `billing_provider_events`: unique `(provider, environment, event_id)`, event type, organization/account ID, received/processed timestamps, status, attempt count, last error, payload hash, encrypted/restricted raw payload, and next retry time.
- `billing_payment_ledger`: append-only provider charge/invoice/refund/dispute records with unique provider resource IDs, checkout intent, raw user ID, signed integer minor amount, currency, status, and environment.
- `billing_provider_subscriptions`: unique provider/environment/subscription ID, user, customer, product, status, cadence, period boundaries, cancellation flags, and last provider update timestamp.
- `billing_entitlement_grants`: one row per provider source/resource with `valid_from`, `valid_until`, `status`, `revoked_at`, reason, and unique source identity.
- `billing_review_cases`: underpayment, partial refund, chargeback, identity mismatch, amount mismatch, orphan event, and reconciliation mismatch queue.
- `billing_admin_audit`: append-only named operator action log.

Constraints and indexes:

- [ ] Store all money in `bigint` minor units and `char(3)`/validated uppercase currency.
- [ ] Permit `bachs`, `revenuecat`, `paystack`, and `manual` through a lookup table or provider-neutral text plus foreign key; do not hard-code a stale check list in multiple migrations.
- [ ] Permit weekly, monthly, yearly, one-time season pass, and credit-pack products through catalog rows rather than scattered checks.
- [ ] Index events by status/next retry, intents by user/status/created time, subscriptions by user/status, and grants by user/feature/status/validity.
- [ ] RLS: clients may read only their own derived billing summary view; all canonical tables remain service-role/server only.
- [ ] Raw event payload retention defaults to 90 days, while normalized financial ledger rows follow the accounting retention policy.

### Task 1.3: Make raw auth subject canonical for billing

**Files:**

- Modify: `backend/services/services/api/src/billing/billing.controller.ts`
- Modify: `backend/services/services/api/src/billing/billing.service.ts`
- Create: `supabase/migrations/20260811121000_billing_identity_aliases.sql`
- Test: `backend/services/services/api/src/billing/billing-identity.spec.ts`

- [ ] Change billing endpoints from `@CurrentUser("id")` to `@CurrentUser("authId")`.
- [ ] Add `billing_identity_aliases` mapping raw subject to any legacy derived UUID and provider customer IDs.
- [ ] Backfill billing rows to the canonical raw subject using known profile/identity mappings. Quarantine ambiguous rows; never guess by email alone.
- [ ] Reject checkout if the authenticated subject has no canonical profile/account mapping that can be created safely.
- [ ] Remove client `uid` from every checkout request and URL.
- [ ] Add tests proving one Clerk user receives one status across pay app, backend, web, mobile, Bachs, and RevenueCat records.

## Phase 2 — Build the server-owned Bachs checkout and portal client

### Task 2.1: Add a strict Bachs API client

**Files:**

- Create: `backend/services/services/api/src/billing/providers/bachs/bachs.client.ts`
- Create: `backend/services/services/api/src/billing/providers/bachs/bachs.types.ts`
- Create: `backend/services/services/api/src/billing/providers/bachs/bachs.config.ts`
- Test: `backend/services/services/api/src/billing/providers/bachs/bachs.client.spec.ts`
- Modify: `backend/services/services/api/.env.example`
- Modify: `backend/services/services/api/src/main.ts`

Configuration:

- `BACHS_API_BASE_URL=https://sandbox-api.bachs.io` in sandbox and the documented live API origin in live.
- `BACHS_API_KEY` server-only and least scoped.
- `BACHS_WEBHOOK_SECRET`, `BACHS_EXPECTED_ORGANIZATION_ID`, and `BACHS_ENVIRONMENT` required when Bachs is enabled.
- Server-owned product mappings for recurring-card weekly/monthly/yearly, one-time local-method weekly/monthly/yearly passes, season pass, and every credit pack, or rows in `billing_products` populated from deployment configuration.

- [ ] Fail application readiness when `BACHS_CHECKOUT_ENABLED=true` and any required value/product mapping is absent.
- [ ] Add 10-second request timeout, bounded retry for safe failures, structured provider errors, and no secret/body logging.
- [ ] Send `Idempotency-Key` for checkout/session, customer, portal-session, refund, and other retryable Bachs `POST` operations.
- [ ] Validate every Bachs response with a runtime schema; reject unknown/malformed critical fields.
- [ ] Restrict returned checkout URLs to Bachs' documented checkout origin.

### Task 2.2: Replace public GET checkout creation with authenticated POST

**Files:**

- Create: `backend/services/services/api/src/billing/dto/create-checkout.dto.ts`
- Modify: `backend/services/services/api/src/billing/billing.controller.ts`
- Refactor: `backend/services/services/api/src/billing/billing.service.ts`
- Create: `backend/services/services/api/src/billing/billing.repository.ts`
- Test: `backend/services/services/api/src/billing/billing-checkout.spec.ts`

Interface:

```ts
POST /billing/checkout
Authorization: Bearer <Clerk token>
Idempotency-Key: <client-generated UUID>
{ "productKey": "pro_monthly", "returnSurface": "web" }

200 { "intentId": "...", "checkoutUrl": "https://checkout.bachs.io/...", "expiresAt": "..." }
```

- [ ] Derive raw user ID and canonical email from verified server identity/profile.
- [ ] Resolve product, provider product ID, expected amount, currency, cadence, and fulfillment from `billing_products`.
- [ ] Resolve and return the product's renewal mode. Never infer auto-renewal from the cadence label alone.
- [ ] Reuse the same open intent for the same user and idempotency key; never mint a new checkout on network retry or double tap.
- [ ] Persist intent before calling Bachs; then atomically attach returned checkout ID/reference and mark `open`.
- [ ] Send Edutu intent ID as Bachs `reference` and minimal metadata; metadata is correlation, not authority.
- [ ] Use `success_url=https://pay.edutu.org/result` and `cancel_url=https://pay.edutu.org/result?state=cancelled`; do not put user ID, email, Clerk token, or amount in either URL.
- [ ] Reject disabled products, zero/negative amounts except explicitly free products, wrong environment product IDs, stale catalog versions, and unsupported return surfaces.
- [ ] Apply distributed per-user/IP checkout limits and a short cooldown while allowing safe idempotent retries.

### Task 2.3: Add authenticated Bachs customer portal sessions

**Files:**

- Modify: `backend/services/services/api/src/billing/billing.controller.ts`
- Modify: `backend/services/services/api/src/billing/billing.service.ts`
- Test: `backend/services/services/api/src/billing/bachs-portal.spec.ts`

Interface:

```ts
POST /billing/portal-session
Authorization: Bearer <Clerk token>
200 { "url": "https://portal.bachs.io/..." }
```

- [ ] Resolve the Bachs customer ID only from `billing_provider_customers` for the authenticated raw subject and current environment.
- [ ] Mint a fresh short-lived Bachs portal session on every request; never store or pre-generate the URL.
- [ ] Restrict the returned URL to Bachs' portal origin and return `404` when the user has no Bachs customer.
- [ ] Keep RevenueCat/native manage actions routed to Apple/Google on native devices.

## Phase 3 — Implement durable, atomic Bachs webhook processing

### Task 3.1: Harden webhook ingress

**Files:**

- Create: `backend/services/services/api/src/billing/providers/bachs/bachs-webhook.verifier.ts`
- Create: `backend/services/services/api/src/billing/providers/bachs/bachs-webhook.types.ts`
- Modify: `backend/services/services/api/src/billing/billing.controller.ts`
- Modify: `backend/services/services/api/src/main.ts`
- Test: `backend/services/services/api/src/billing/providers/bachs/bachs-webhook.verifier.spec.ts`

- [ ] Keep exact raw-body HMAC-SHA256 verification over `timestamp.raw_body`, constant-time comparison, and five-minute timestamp tolerance.
- [ ] Reject malformed timestamp/signature encodings without throwing buffer parsing errors.
- [ ] Validate top-level event `id`, `type`, `created_at`, `organization_id`, and `data` before durable insert.
- [ ] Require the expected Bachs organization/account. Bind environment to the configured ingress secret/route; Bachs does not include environment in its webhook envelope.
- [ ] Require critical documented envelope/data fields while allowing additive provider fields.
- [ ] Cap body size and parse depth; return `401` for bad signature, `400` for invalid envelope, and non-2xx for any failure to durably store the event.
- [ ] Insert the event inbox row before returning success. A duplicate event ID returns `200 duplicate` without re-running side effects.
- [ ] Return `202` only after durable receipt when a worker will process asynchronously; never return success with `ignored: true` for a subscribed event.

### Task 3.2: Implement event state machine and transactional processor

**Files:**

- Create: `backend/services/services/api/src/billing/providers/bachs/bachs-event.processor.ts`
- Create: `backend/services/services/api/src/billing/billing-grants.repository.ts`
- Create: `backend/services/services/api/src/billing/billing-events.worker.ts`
- Modify: `backend/services/services/api/src/billing/billing.module.ts`
- Test: `backend/services/services/api/src/billing/providers/bachs/bachs-event.processor.spec.ts`
- Integration test: `backend/services/services/api/test/bachs-webhook.e2e-spec.ts`

Subscribe to and handle:

- `checkout.completed`: update checkout UI state only; never fulfill.
- `checkout.expired`: expire open intent; no grant.
- `collection.succeeded`: verify intent/reference, product, checkout ID, organization, and configured ingress environment. Retrieve the checkout/payment when needed to validate catalog price because collection currency may differ from settlement/catalog currency. Fulfill one-time season/credit products; record recurring collection but let `invoice.paid` own the recurring period grant.
- `collection.failed`: mark attempt failed, preserve retry option, no grant.
- `collection.underpaid`: no grant; create review case with amount paid/remaining.
- `customer.subscription.created`: upsert provider subscription and customer mapping; do not double-grant the initial invoice.
- `customer.subscription.updated`: apply only if event/provider timestamp is newer; sync `active`, `past_due`, `unpaid`, `paused`, cancellation schedule, and period boundary.
- `customer.subscription.deleted`: close that provider subscription and end only its grant at the correct period boundary or immediately according to event state.
- `invoice.paid`: append one ledger row keyed by `invoice_id` and set that subscription grant's exact provider period; a paid invoice may have no charge ID.
- `invoice.payment_failed`: mark invoice/subscription `past_due`; retain access only under the configured paid-through/grace policy.
- `refund.created`, `refund.paid`, `refund.failed`: track asynchronous refund state. Retrieve the refund and original payment before classifying full versus partial. On confirmed full `refund.paid`, revoke/suspend the affected grant; on partial or ambiguous refund create a review case. Keep repeated partial refunds disabled until Bachs' one-refund-per-charge contract is confirmed in sandbox.
- `dispute.created`, `dispute.updated`: place the affected grant/account into the configured fraud state and alert operators.
- `customer.created`, `customer.updated`: maintain provider customer mapping without using email as identity authority.

Atomic processing transaction:

- [ ] Lock the inbox event row and transition `received/failed → processing`.
- [ ] Load and lock checkout intent/subscription/grant rows by provider IDs.
- [ ] Validate expected values before side effects; quarantine mismatches.
- [ ] Append ledger row, upsert subscription, create/update the provider-specific grant, recompute projection, and mark event `processed` in one transaction.
- [ ] On exception, roll back all side effects and mark the event retryable in a separate safe transaction with bounded exponential backoff.
- [ ] After repeated failures, mark `dead_letter`, alert, and permit an audited operator replay.
- [ ] Process out-of-order events by envelope `created_at`, stored watermarks, and current resource retrieval; Bachs subscription resources do not expose an update version.

### Task 3.3: Add atomic credit and one-time fulfillment

**Files:**

- Create migration RPC in `supabase/migrations/20260811122000_atomic_billing_fulfillment.sql`
- Modify: `backend/services/services/api/src/billing/billing-grants.repository.ts`
- Test: `backend/services/services/api/src/billing/billing-fulfillment.concurrency.spec.ts`

- [ ] Season pass: create exactly one immutable grant keyed by charge/resource; set bounded validity without read-then-upsert races.
- [ ] Credit pack: one transaction inserts provider ledger + credit ledger and increments balance only when the unique provider resource was newly inserted.
- [ ] Verify the product's server-owned credit quantity, not metadata or paid amount arithmetic.
- [ ] Include concurrency tests with 20 duplicate deliveries and injected failure after every statement boundary.

## Phase 4 — Refactor `pay.edutu.org` into a safe Edutu shell

### Task 4.1: Remove provider fulfillment from browser routes

**Files:**

- Replace: `pay-edutu-org/src/app/return/page.tsx`
- Deprecate: `pay-edutu-org/src/app/checkout/route.ts`
- Remove Supabase/provider mutation imports from browser-facing pages
- Create: `pay-edutu-org/src/app/result/page.tsx`
- Create: `pay-edutu-org/src/app/api/billing/status/route.ts` only if a same-origin proxy is required
- Test: `pay-edutu-org/src/app/result/result.test.tsx`

- [ ] `/return` redirects to `/result` and never writes a payment or entitlement.
- [ ] `/result` shows `Processing`, `Active`, `Failed`, `Cancelled`, `Underpaid`, or `Needs review` by polling an authenticated backend intent-status endpoint.
- [ ] Never say “you were not charged” from a browser failure alone. Use “not confirmed” and provide support/retry guidance.
- [ ] Do not expose Clerk subject, email, raw provider payload, or long-lived token in query strings.
- [ ] Keep only an opaque intent/check-out identifier needed to retrieve the authenticated user's status.
- [ ] Remove Paystack/Bachs service-role secrets from the pay Vercel project once all mutation routes move to NestJS.

### Task 4.2: Build account and management UX around provider ownership

**Files:**

- Refactor: `pay-edutu-org/src/app/account/page.tsx`
- Replace: `pay-edutu-org/src/app/account/start/route.ts`
- Replace: `pay-edutu-org/src/app/api/account/cancel/route.ts`
- Modify: `pay-edutu-org/src/lib/auth.ts`
- Test: `pay-edutu-org/src/app/account/account.test.tsx`

- [ ] Authenticate the pay site using Clerk directly or exchange a backend-issued one-time code via POST. Never place a Clerk JWT in `?t=`.
- [ ] Show each active provider separately: Bachs web subscription, RevenueCat/App Store, RevenueCat/Play Store, one-time pass, and credits.
- [ ] Label recurring-capable Bachs card purchases “renews automatically” and local-method bounded purchases “access until DATE; renew manually.”
- [ ] “Manage Bachs subscription” calls the authenticated backend portal-session endpoint and redirects to Bachs' hosted portal.
- [ ] Native subscriptions show store-specific management instructions/links; the web portal must not attempt to cancel them.
- [ ] Display paid-through date, renewal state, past-due recovery state, and support reference without exposing provider secrets.

### Task 4.3: Replace static pay-admin token with Clerk admin RBAC

**Files:**

- Remove: static-token branches in `pay-edutu-org/src/lib/auth.ts`
- Remove/refactor: `pay-edutu-org/src/app/api/admin/*`
- Move payment operations to the existing authenticated admin app/backend billing admin routes
- Add immutable audit writes for every mutation

- [ ] Require Clerk admin role and MFA policy for payment operations.
- [ ] Require CSRF-safe same-site flow and step-up confirmation for refunds, revokes, and manual grants.
- [ ] Require a reason and show a confirmation containing user, provider, amount/grant, and consequence.
- [ ] Prevent direct manual edits to canonical ledger rows; repairs are compensating entries.

## Phase 5 — Update all clients and make destinations non-configurable by untrusted data

### Task 5.1: Web/PWA checkout client

**Files:**

- Modify: `edutu-web-app/src/services/billing.ts`
- Modify: `edutu-web-app/src/lib/proPricing.ts`
- Modify: `edutu-web-app/src/components/ui/UpgradeModal.tsx`
- Modify: standalone upgrade page callers
- Test: `edutu-web-app/src/services/billing.test.ts`

- [ ] Replace direct `pay.edutu.org/checkout?uid=...` construction with authenticated `POST /billing/checkout`.
- [ ] Generate/reuse one client idempotency UUID per user action until a terminal response.
- [ ] Redirect only to a validated Bachs checkout URL returned by the API.
- [ ] Display the server-returned renewal mode before redirect and on return; do not promise local-method auto-renewal.
- [ ] Remove `uid`, email, amount, currency, promo, and arbitrary checkout origin from URLs.
- [ ] Make `https://pay.edutu.org` and the Bachs allowed origins compile/deploy-time allowlists, not editable pricing fields.
- [ ] Disable buttons during request, but preserve retry with the same idempotency key after timeout.

### Task 5.2: Mobile web and native routing

**Files:**

- Modify: `edutumobile/lib/pricing.ts`
- Modify: `edutumobile/app/(app)/paywall.tsx`
- Modify: `edutumobile/packages/core/src/services/payments.ts`
- Test: `edutumobile/__tests__/billingRouting.test.tsx`

- [ ] Web build uses authenticated Bachs checkout API for every web product.
- [ ] iOS/Android Pro, pass, and credit digital goods remain RevenueCat/store purchases.
- [ ] Native “Manage” always opens store management; web “Manage” opens Bachs portal session.
- [ ] Remove remote editable `checkoutBaseUrl`/`manageUrl` or enforce exact Edutu origin allowlists server and client side.
- [ ] Add/validate weekly native RevenueCat product if weekly remains offered on device; otherwise hide weekly on native until store products exist.

## Phase 6 — Unify RevenueCat and entitlement derivation

### Task 6.1: Move RevenueCat onto the durable inbox model

**Files:**

- Refactor or replace: `edutumobile/supabase/functions/revenuecat-webhook/index.ts`
- Preferred new endpoint: `backend/services/services/api/src/billing/providers/revenuecat/revenuecat-webhook.controller.ts`
- Create processor/tests beside Bachs processor
- Update RevenueCat dashboard only after the new endpoint is deployed and verified

- [ ] Authenticate the static Authorization secret in constant time and enforce expected environment/project/app.
- [ ] Claim RevenueCat event ID in `billing_provider_events` and process transactionally.
- [ ] Fix season-pass failure ordering: a ledger duplicate cannot skip an uncreated grant.
- [ ] Fix credit partial failure: provider transaction claim, credit ledger insert, and balance increment occur atomically.
- [ ] Check every Supabase/DB result; no best-effort silent financial write.
- [ ] Store original transaction/subscription IDs separately from renewal transaction IDs.

### Task 6.2: Derive effective Pro from grants

**Files:**

- Add SQL function/view in `supabase/migrations/20260811123000_derived_entitlements.sql`
- Modify: `backend/services/services/api/src/billing/billing.service.ts`
- Modify: `backend/services/services/api/src/monetization/monetization.service.ts`
- Modify: `edutumobile/packages/core/src/hooks/useProStatus.ts`
- Modify web Pro status consumer
- Test: backend, mobile, and web entitlement matrix tests

- [ ] Effective Pro query is `exists` over active, non-expired grants, independent of provider.
- [ ] `billing_entitlements` is updated transactionally as a compatibility projection or replaced by a read view after clients migrate.
- [ ] `profiles.is_pro` is a non-authoritative cache with explicit expiry; remove the backend's independent `profile OR entitlement` grant behavior.
- [ ] Expiring one RevenueCat subscription cannot revoke an active Bachs grant, and vice versa.
- [ ] A full refund revokes only the matching source grant.
- [ ] Tests cover Bachs-only, RevenueCat-only, both active, one expired, one refunded, manual grant, season pass, past due, and all inactive.

## Phase 7 — Recovery, reconciliation, observability, and support

### Task 7.1: Implement lifecycle policy

- [ ] Bachs `past_due`: retain access through paid `current_period_end`; optionally add a clearly configured grace timestamp.
- [ ] Bachs `unpaid`: no new period is granted; follow configured recovery policy.
- [ ] Bachs `canceled`: retain only through paid-through date for scheduled cancellation; immediate cancellation ends the provider grant immediately unless an independent grant exists.
- [ ] Full `refund.paid`: revoke affected one-time grant or reduce recurring paid-through grant according to documented refund policy.
- [ ] Partial refund: no automatic entitlement change; open a review case.
- [ ] `dispute.created`: suspend affected grant, flag account/risk case, and notify operator; restore only on a provider event/operator action with audit.
- [ ] `UNDERPAID`: never grant; show customer an actionable status and review/payment completion path.
- [ ] `OVERPAID`: grant only purchased product and record excess for refund/review; never infer a larger product.

### Task 7.2: Add reconciliation worker

**Files:**

- Create: `backend/services/services/api/src/billing/billing-reconciliation.service.ts`
- Create: `backend/services/services/api/src/billing/billing-reconciliation.scheduler.ts`
- Test: `backend/services/services/api/src/billing/billing-reconciliation.spec.ts`

- [ ] Every 15 minutes reconcile recent open/pending/failed intents and events.
- [ ] Daily compare Bachs payments, refunds, subscriptions, and current periods against local state using paginated APIs.
- [ ] Daily compare RevenueCat active entitlements/subscriptions against local grants.
- [ ] Never auto-repair ambiguous identity, amount, environment, or product mismatch; create review cases.
- [ ] Safe deterministic missing-event repairs use the same processor/idempotency constraints and write an audit trail.

### Task 7.3: Add payment observability and runbooks

**Files:**

- Create: `docs/operations/bachs-payments-runbook.md`
- Create: `docs/operations/payment-incident-runbook.md`
- Update admin monetization dashboard

Metrics/alerts:

- [ ] Checkout creation success/error/latency by provider/environment/product.
- [ ] Checkout-to-success conversion and duplicate open intents.
- [ ] Webhook signature failures, non-2xx responses, event lag, retries, and dead letters.
- [ ] Successful payment without active matching grant after two minutes.
- [ ] Active grant without successful provider payment/manual audit source.
- [ ] Refund/dispute without local lifecycle action.
- [ ] Projection mismatch and raw/derived identity split.
- [ ] Bachs/RevenueCat reconciliation drift and provider API errors.
- [ ] Redact email, tokens, signatures, secrets, full payloads, and customer portal URLs from logs.

Runbooks must include:

- Paid but not Pro.
- Pro but no payment.
- Duplicate payment.
- Underpaid/overpaid transfer.
- Failed renewal and recovery.
- Refund and dispute.
- Wrong-account purchase.
- Missing/delayed webhook.
- Provider outage.
- Key rotation and webhook secret rotation.
- Rollback to disabled checkout without losing webhook processing.

## Phase 8 — Test matrix, staged cutover, and rollback

### Task 8.1: Automated verification gates

Backend unit/integration tests:

- [ ] Signature: valid, invalid, malformed hex, wrong body, stale/future timestamp, wrong secret.
- [ ] Envelope: missing ID/type/org/data, wrong organization/environment, unsupported event.
- [ ] Checkout: auth required, UID ignored/not accepted, server amount/product, duplicate idempotency key, rate limit, provider timeout, malformed provider URL.
- [ ] Event duplicate and replay: 20 identical deliveries yield one ledger effect.
- [ ] Failure injection after each SQL mutation rolls back or resumes safely.
- [ ] Concurrency: simultaneous Bachs and RevenueCat events preserve both grants.
- [ ] Ordering: deleted-before-created, old updated-after-new, refund-before-late success, invoice retry sequence.
- [ ] Money: USD/NGN minor units, decimal parsing, under/overpayment, partial/full refund.
- [ ] Identity: raw Clerk, legacy derived UUID, Supabase UUID, unknown/ambiguous mapping.
- [ ] Credits: duplicate and partial-failure behavior.

Client tests:

- [ ] No payment URL contains `uid`, email, Clerk token, amount, or currency.
- [ ] Native always selects RevenueCat; web always selects authenticated Bachs API.
- [ ] Result UI never grants and does not claim “not charged” from uncertain state.
- [ ] Manage routing is provider-aware.
- [ ] Exact checkout/portal origin validation blocks a malicious remote-config URL.

Build gates:

- [ ] `cd pay-edutu-org && npm run typecheck && npm run build`
- [ ] `cd backend/services/services/api && npm run lint && npm run test && npm run test:e2e`
- [ ] `cd edutu-web-app && npm run typecheck && npm run build`
- [ ] `cd edutumobile && npx tsc --noEmit && npm test -- --maxWorkers=2`
- [ ] Database migration contract test against a fresh database and a sanitized production-schema clone.

### Task 8.2: Sandbox end-to-end matrix

Run each product through success, cancel, failed, expired, duplicate event, delayed event, and network retry:

- [ ] Weekly, monthly, and yearly recurring Bachs subscriptions.
- [ ] Weekly, monthly, and yearly bounded one-time passes using each supported non-card local method; verify the UI never calls them auto-renewing.
- [ ] Season pass one-time purchase.
- [ ] Every web credit pack.
- [ ] Card, bank transfer, mobile money, and crypto where Bachs sandbox supports the lifecycle.
- [ ] `SUCCEEDED` and `ACCEPTED` terminal success states if exposed by the corresponding event/resource.
- [ ] Underpaid and overpaid paths.
- [ ] Renewal success, three-step dunning sequence, recovery, unpaid, and terminal cancellation.
- [ ] Scheduled and immediate cancellation through Bachs customer portal.
- [ ] Full and partial refund.
- [ ] Dispute created/updated using replay fixtures if sandbox cannot generate one.
- [ ] RevenueCat initial purchase, renewal, cancellation, expiration, refund/revocation, restore, and simultaneous active Bachs subscription.

For every test, assert provider dashboard, event inbox, ledger, subscription, grant, projection, profile cache, web UI, mobile UI, and backend authorization agree.

### Task 8.3: Staged rollout

- [ ] Deploy schema first with no behavior change.
- [ ] Deploy event ingress/processor with `BACHS_CHECKOUT_ENABLED=false`.
- [ ] Register only the canonical sandbox webhook URL and subscribe to all required payment/subscription/invoice/refund/dispute events.
- [ ] Replay fixtures and confirm duplicate-safe processing.
- [ ] Enable Bachs checkout for internal admin/test accounts only.
- [ ] Run sandbox matrix and a 24-hour synthetic monitoring period.
- [ ] Migrate web clients behind a server feature flag; keep old Paystack webhook processing for already in-flight legacy transactions but stop creating new Paystack subscriptions.
- [ ] Enable 5%, 25%, then 100% of web accounts with automatic rollback thresholds.
- [ ] Keep RevenueCat native unchanged throughout web rollout.
- [ ] After no legacy Paystack renewals remain, archive Paystack checkout creation and retain read/reconciliation history.

Launch gate — all must be true:

- [ ] Canonical webhook URL returns `401` unsigned and `2xx` only after durable receipt when correctly signed.
- [ ] No Vercel/Render protection, redirect, or cold-start timeout blocks Bachs.
- [ ] Zero event types return success with `ignored: true` unless explicitly unsubscribed/documented as no-op.
- [ ] Successful payment-to-grant alert is green for seven sandbox days.
- [ ] Reconciliation reports zero unexplained drift.
- [ ] Credentials are rotated, scoped, environment-separated, and absent from repository/mobile bundle.
- [ ] Support and incident runbooks are exercised.
- [ ] A named owner is on call for the first live transactions.

Rollback:

- [ ] Set `BACHS_CHECKOUT_ENABLED=false` to stop new sessions immediately.
- [ ] Keep webhook ingestion and reconciliation running so in-flight payments still fulfill.
- [ ] Never roll back the database migration destructively; old clients read the compatibility projection.
- [ ] Display a controlled payment-unavailable message instead of falling back to an unverified provider route.
- [ ] Roll forward event processor fixes and replay failed Bachs events from the durable inbox/dashboard.

## Completion definition

The migration is complete only when all web payment buttons create authenticated server-owned Bachs sessions, Bachs hosts payment and portal UI, RevenueCat remains native-only, one canonical event processor drives all money and grants transactionally, simultaneous provider grants cannot revoke one another, every lifecycle state is reconciled and observable, and the launch gate has passed in sandbox before any live key or live product is enabled.
