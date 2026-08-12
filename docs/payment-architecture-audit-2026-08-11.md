# Edutu payment architecture and Bachs readiness audit

Date: 2026-08-11  
Scope: `pay.edutu.org`, NestJS billing, Paystack, planned Bachs checkout/UI, RevenueCat native purchases, Supabase billing records, entitlement projection, refunds/failures, UUID ownership, admin controls, and customer UX.

## Executive verdict

**Do not enable live Bachs payments yet.** The current production site is a Paystack application, not a Bachs integration. Its Bachs route is absent in production, the local NestJS Bachs handler authenticates events but acknowledges every valid event without processing it, and the current Content Security Policy would block Bachs overlay checkout.

The existing Paystack and RevenueCat paths also have several ways to produce “money moved, access did not” or to overwrite access granted by another rail. Refunds, disputes, underpayments, and failed-renewal recovery are not modeled end to end. The recommended repair is to make the NestJS API the single payment authority, retain Bachs-hosted UI for web payment details, retain RevenueCat for native store purchases, and derive one entitlement projection from immutable per-source grants.

No P0 finding was demonstrated because Bachs is not live and no real transaction was initiated during this review. There are eight P1 launch blockers.

## Production evidence

Observed against production on 2026-08-11:

- `https://pay.edutu.org/` returns 200 and identifies the processor as **Paystack**, not Bachs.
- A browser visit to a weekly checkout follows a 303 to `http://localhost:3001/return?...` and ends in `ERR_CONNECTION_REFUSED`. A bare `/checkout` returns the same localhost redirect. The source uses the same `BASE_URL` for the successful provider callback, so a successfully initialized checkout is also at risk of returning to localhost.
- `POST https://pay.edutu.org/api/webhooks/bachs` returns 404.
- `POST https://edutu-platform.onrender.com/billing/webhooks/bachs` returns 404.
- The deployed CSP allows Paystack form submission but permits only same-origin scripts, frames, and connections. It cannot load the Bachs overlay SDK/iframe.
- The live site has HSTS, `nosniff`, `frame-ancestors 'none'`, and `Referrer-Policy: no-referrer`; these are positive controls.

The probes intentionally used an invalid/test account and did not initialize a real payment.

## Current architecture

| Purchase surface | Current provider/authority | Main write path | Main risk |
|---|---|---|---|
| `pay.edutu.org` Pro/season | Paystack; Next.js also fulfills | `payments` then `billing_entitlements` | Non-atomic, public identity in URL, callback misconfigured |
| NestJS checkout/credits | Deprecated Paystack path; NestJS fulfills | `billing_transactions`, subscriptions, entitlement, profile | Duplicate authority and ignored DB errors |
| iOS/Android | RevenueCat/App Store/Play | Supabase Edge Function | Partial writes and incomplete event lifecycle |
| Planned web Bachs | Not implemented | Bachs handler returns `ignored: true` | Signed payments would be acknowledged without fulfillment |
| Access reads | Aggregate `billing_entitlements` plus profile mirrors | One row per user/feature | One provider can overwrite/revoke another provider's paid time |

## P1 findings — launch blockers

### PAY-P1-01 — Bachs is absent in production and valid Bachs events are discarded locally

**Evidence.** Both likely production Bachs webhook routes return 404. The local controller exposes the route at [`billing.controller.ts:73`](../backend/services/services/api/src/billing/billing.controller.ts#L73), but the service only validates metadata, logs, and returns `{ received: true, ignored: true }` at [`billing.service.ts:543`](../backend/services/services/api/src/billing/billing.service.ts#L543). The repository has no Bachs checkout-session client, product mapping, portal-session client, or refund client. The hosted pay app still describes itself as Paystack in [`package.json`](../pay-edutu-org/package.json).

**Impact.** If the local route is deployed as-is, Bachs receives 2xx for real signed events and stops retrying while Edutu grants nothing. If it remains undeployed, every payment event misses Edutu entirely.

**Fix.** Keep Bachs disabled. Implement a durable webhook inbox keyed by `(provider, event_id)`, store the authenticated raw event first, return 2xx only after the event is durably accepted, and process `collection.succeeded`, `collection.failed`, `collection.underpaid`, subscription events, and all `refund.*` events. Bachs documents at-least-once delivery and event-ID deduplication in its [webhook guide](https://docs.bachs.io/guides/webhooks/overview.md).

**Missing verification.** No tests assert stale timestamp rejection, same-event replay, same-checkout/different-event handling, worker retry, or any grant/refund result. The present test merely expects a valid signed event to return `ignored: true`.

### PAY-P1-02 — `pay.edutu.org` has a production localhost callback and rejects the advertised weekly plan

**Evidence.** `BASE_URL` falls back to localhost at [`env.ts:18`](../pay-edutu-org/src/lib/env.ts#L18), and `/checkout` uses it for the provider callback at [`checkout/route.ts:85`](../pay-edutu-org/src/app/checkout/route.ts#L85). Production redirects bad/weekly requests to localhost. The hosted app accepts only `monthly | yearly | season` at [`money.ts:44`](../pay-edutu-org/src/lib/money.ts#L44), while web and mobile explicitly advertise and send `weekly` at [`proPricing.ts:202`](../edutu-web-app/src/lib/proPricing.ts#L202) and [`pricing.ts:291`](../edutumobile/lib/pricing.ts#L291).

**Impact.** Weekly buyers cannot pay. Other buyers can complete provider checkout but fail to return to Edutu, producing fear, retries, duplicate attempts, and support cases.

**Fix.** Make `BASE_URL=https://pay.edutu.org` required in production and fail deployment health checks if it is missing or non-HTTPS. Either remove weekly everywhere or implement it end to end with a server catalog. For Bachs, note that recurring subscriptions currently support **USD cards only**; local-currency/mobile-money weekly access must be a clearly labeled one-time pass until the rail supports recurrence. See [Bachs subscriptions](https://docs.bachs.io/guides/subscriptions/overview.md).

**Missing verification.** No production smoke test checks the `Location` origin or validates every enabled product/cadence against the checkout service.

### PAY-P1-03 — Idempotency ordering can permanently record payment without granting access

**Evidence.** Paystack inserts the unique payment first and grants only when that insert is new at [`api/webhook/route.ts:62`](../pay-edutu-org/src/app/api/webhook/route.ts#L62) and repeats the same pattern in the browser return handler at [`return/page.tsx:126`](../pay-edutu-org/src/app/return/page.tsx#L126). If the insert succeeds and `grantPro` fails, the retry sees a duplicate and skips the grant forever. RevenueCat season pass similarly inserts its unique ledger row before the entitlement at [`revenuecat-webhook/index.ts:529`](../edutumobile/supabase/functions/revenuecat-webhook/index.ts#L529). RevenueCat credit purchase can grant credits and then fail to mark the purchase complete; the retry treats the pending duplicate as an error at [`revenuecat-webhook/index.ts:470`](../edutumobile/supabase/functions/revenuecat-webhook/index.ts#L470).

**Impact.** A transient DB or process failure at the wrong instruction produces paid users with no Pro/credits, or granted credits stuck in an unreconcilable retry loop.

**Fix.** Use one database transaction/RPC per event: claim event, validate stored intent/catalog, append transaction, create/update source grant, update subscription/refund state, recompute entitlement projection, and mark event processed. If remote side effects are required, use an outbox/state machine with resumable steps rather than a boolean “already seen.”

**Missing verification.** No fault-injection tests fail after each write and prove that redelivery converges to exactly one grant.

### PAY-P1-04 — A single aggregate entitlement row lets one rail destroy another rail's valid access

**Evidence.** The schema enforces one row per `(user_id, feature_key)` at [`009_billing_entitlements.sql:24`](../edutumobile/supabase/migrations/009_billing_entitlements.sql#L24). Paystack and RevenueCat both upsert and replace that row. `revokePro` revokes the aggregate row at [`entitlements.ts:84`](../pay-edutu-org/src/lib/entitlements.ts#L84). RevenueCat expiration checks only other RevenueCat subscriptions, not Paystack/Bachs/manual grants, at [`revenuecat-webhook/index.ts:358`](../edutumobile/supabase/functions/revenuecat-webhook/index.ts#L358).

**Impact.** A late RevenueCat expiration/refund can remove a still-valid Bachs/Paystack season pass. A shorter new grant can overwrite a longer existing grant. Two simultaneous purchases race on read-then-upsert expiry math.

**Fix.** Store immutable/provider-scoped `entitlement_grants` with unique `(provider, provider_reference, feature_key)`. Compute `billing_entitlements` as a projection: active if any non-revoked grant is active, with `expires_at = max(active grant expiry)` or unlimited if any active grant is unlimited. Refund/revoke the matching grant, never the aggregate projection directly.

**Missing verification.** There are no cross-rail overlap tests: RC + Bachs, pass + subscription, partial refund, late expiration, simultaneous renewal, or manual grant.

### PAY-P1-05 — Payment ownership uses two incompatible user IDs

**Evidence.** The auth guard exposes a derived pseudo-UUID as `user.id` and raw Clerk subject as `authId` at [`clerk-auth.guard.ts:159`](../backend/services/services/api/src/auth/clerk-auth.guard.ts#L159). Billing controllers use the derived `id` at [`billing.controller.ts:21`](../backend/services/services/api/src/billing/billing.controller.ts#L21), while `pay.edutu.org` and RevenueCat store raw Clerk IDs. The conversion is a non-cryptographic derived UUID at [`user-id.ts:15`](../backend/services/services/api/src/common/user-id.ts#L15).

**Impact.** A user can pay under `user_...` but the backend status endpoint queries a different UUID record, making the UI show free/no credits. Historic duplicate rows can split subscriptions, refunds, and audit history.

**Fix.** Canonicalize payment ownership to the raw authentication subject stored as text. Keep internal row IDs as random database UUIDs. Add an explicit `user_identity_aliases(auth_provider, external_subject, user_id)` migration for legacy mapping; do not invent a UUID from the Clerk subject for billing ownership. Run a collision/duplicate/orphan report before merging old rows.

**Missing verification.** No contract test starts from one Clerk token and proves checkout intent, webhook grant, status read, refund, and admin view all resolve the same canonical user.

### PAY-P1-06 — Checkout trusts public identity parameters and lacks a durable checkout intent/idempotency key

**Evidence.** `GET /checkout` accepts any syntactically valid `uid` and optional email from the query string at [`checkout/route.ts:32`](../pay-edutu-org/src/app/checkout/route.ts#L32), then places the UID in provider metadata. Every request creates a fresh random reference at lines 62/66. Both clients put UID/email into URLs at [`proPricing.ts:211`](../edutu-web-app/src/lib/proPricing.ts#L211) and [`pricing.ts:306`](../edutumobile/lib/pricing.ts#L306). Remote admin config can replace the checkout origin without an exact allowlist at [`proPricing.ts:186`](../edutu-web-app/src/lib/proPricing.ts#L186) and [`pricing.ts:142`](../edutumobile/lib/pricing.ts#L142).

**Impact.** Anyone can create a payment intended to grant another account, double taps create parallel checkouts, and identity/PII lands in browser history, proxies, and provider logs. A compromised pricing config can exfiltrate signed-in IDs/emails to a lookalike checkout.

**Fix.** Use authenticated `POST /billing/checkout` with no client-supplied owner; resolve the raw subject from the Clerk token. Accept only a server catalog `productKey` and an `Idempotency-Key`. Store a checkout intent before calling Bachs, and pass only an opaque intent ID in provider metadata/URLs. Pin Bachs/Edutu origins exactly.

**Missing verification.** No authorization test attempts cross-user ownership; no same-key/same-result or double-click concurrency test exists.

### PAY-P1-07 — Refund, dispute, underpayment, and failed-renewal state changes are not implemented end to end

**Evidence.** The Bachs handler processes none of its event families. Paystack records charge/invoice failure but does not model recovery; it ignores refunds/disputes/chargebacks. RevenueCat handles only initial purchase, renewal, cancellation, expiration, and non-renewing purchase at [`revenuecat-webhook/index.ts:163`](../edutumobile/supabase/functions/revenuecat-webhook/index.ts#L163). There is no customer/admin payment-refund command, no provider refund ID, no partial-refund record, no reason/audit trail, and no reconciliation worker.

**Impact.** Refunded or disputed users may keep access; a failed refund may be represented as completed; failed renewals lack grace/recovery UX; support cannot safely retry a refund; underpayments could be treated inconsistently.

**Fix.** Model refunds as asynchronous records with unique request reference/idempotency key and states `requested -> processing -> paid | failed`. Bind each refund to the original charge and affected grant; only revoke according to the written product policy and provider-confirmed event. Bachs explicitly says refunds are asynchronous, some rails are not refundable, and `refund.created`, `refund.paid`, and `refund.failed` are authoritative; see [Bachs refunds](https://docs.bachs.io/guides/refunds.md). Model `collection.underpaid` separately and never grant the full product automatically.

**Missing verification.** Full/partial/non-refundable/duplicate/failed refunds, disputes, underpayment, past-due recovery, cancellation-at-period-end, and reversal-after-refund are untested.

### PAY-P1-08 — Credential material is present in public/example paths

**Evidence.** `edutumobile/.env.example` contains an actual-looking Bachs sandbox secret. `pay-edutu-org/.env.example` contains a credential-like admin dashboard token. In addition, the mobile dev helper reads `EXPO_PUBLIC_RC_WEBHOOK_SECRET_DEV` at [`devMockPurchase.ts:15`](../edutumobile/lib/devMockPurchase.ts#L15) and calls the real RevenueCat webhook to grant Pro. Every `EXPO_PUBLIC_*` value is client-visible.

**Impact.** A leaked webhook authorization value can forge sandbox purchase events; if sandbox events are accepted by a reachable grant path, attackers can self-grant Pro. A reused admin token could allow grant/revoke/admin data access.

**Fix.** Rotate both observed values now, even if believed sandbox-only. Replace examples with unmistakable placeholders. Delete the client-side webhook secret and dev self-grant path; use a local mock server or authenticated server-side test endpoint disabled in production. Replace the shared admin token with named Clerk admin identities, MFA/RBAC, and immutable action audit records.

**Missing verification.** Secret history, Bachs dashboard scopes, Supabase function environment acceptance, and whether the admin value was deployed could not be verified without provider/deployment access.

## P2 findings — material weaknesses

### PAY-P2-01 — Repository schema contracts reject states the code writes

The shared migration excludes provider `bachs`, excludes weekly/season plans, and excludes `credit_topup`/`season_pass_purchase` transaction types at [`009_billing_entitlements.sql:4`](../edutumobile/supabase/migrations/009_billing_entitlements.sql#L4). Several write sites ignore Supabase's returned `error`, notably the duplicate NestJS Paystack handler at [`billing.service.ts:486`](../backend/services/services/api/src/billing/billing.service.ts#L486). Multiple migration directories and a separate hosted-pay SQL schema make the live schema owner unclear.

**Fix.** Establish one canonical migration chain, inventory the production catalog/constraints, add Bachs and every supported product/state, and make all money-path DB errors fatal/retryable. Add a CI schema test that applies migrations from empty and runs event fixtures.

### PAY-P2-02 — Bachs UI is not integrated and the CSP blocks the overlay

The current CSP permits only same-origin scripts/connects and no Bachs frame origin at [`next.config.mjs:19`](../pay-edutu-org/next.config.mjs#L19). There is no `@bachs/js` dependency. Bachs' overlay is a Bachs-hosted iframe; browser `checkout.completed` is UI-only and fulfillment must come from `collection.succeeded`. See [Bachs overlay checkout](https://docs.bachs.io/guides/checkout/overlay-checkout.md).

**Fix.** Keep the Edutu shell, but let the Bachs SDK/hosted page own the payment form. If overlay is chosen, allow the exact Bachs checkout script/frame/connect origins in CSP, keep `frame-ancestors 'none'` for Edutu itself, and never use overlay events to grant. Hosted redirect is operationally simpler for the first safe launch.

### PAY-P2-03 — Browser return is a second fulfillment authority and can show false certainty

The return page verifies and writes grants at [`return/page.tsx:105`](../pay-edutu-org/src/app/return/page.tsx#L105), duplicating the webhook authority. It does not compare amount/currency/product to a stored intent. Any non-success verification result is rendered as “You weren't charged” at [`return/page.tsx:223`](../pay-edutu-org/src/app/return/page.tsx#L223), while an initialization timeout is also declared “Nothing was charged” even though the provider may have accepted the request.

**Fix.** Make return UI read-only: show/poll the opaque checkout intent. Use `processing` for uncertainty, `failed` only for provider-confirmed failure, and “not charged” only where Edutu has definitive evidence. Display support reference, product, currency, amount, and next recovery action.

### PAY-P2-04 — Account and admin authentication are not production-grade

The account page fails open for arbitrary UIDs when the session secret is absent at [`account/page.tsx:51`](../pay-edutu-org/src/app/account/page.tsx#L51). The Clerk token is transported in the query string at [`account/start/route.ts:8`](../pay-edutu-org/src/app/account/start/route.ts#L8). It queries `.maybeSingle()` for one active subscription, which fails when multiple rails are active. Admin access is one shared static token and has no named actor/RBAC/MFA audit.

**Fix.** Fail closed for all account reads/actions; exchange Clerk tokens by POST or use normal Clerk middleware; query provider-scoped subscriptions; use fresh Bachs customer-portal sessions created server-side; and use named admin identities plus append-only refund/grant/revoke audit. Treat portal URLs as short-lived credentials.

### PAY-P2-05 — Provider calls have no bounded timeout/retry strategy or reconciliation loop

Paystack calls in both apps use unbounded `fetch`; the deprecated backend path creates the provider transaction before inserting its local pending transaction at [`billing.service.ts:367`](../backend/services/services/api/src/billing/billing.service.ts#L367). A timeout can leave an orphan provider checkout, and an error response is logged wholesale. There is no scheduled reconciliation for pending intents, paid-no-grant, refund processing, or webhook age.

**Fix.** Add abort timeouts, idempotency keys, safe retry classifications, redacted structured logs, an outbox/inbox worker, and a reconciliation job that compares provider state to local intents/grants/refunds. Alert on oldest unprocessed event, paid-without-grant count, refund age, signature failures, and event-processing failures.

### PAY-P2-06 — The hosted-pay production dependency set has known high-severity advisories

`pay-edutu-org` resolves Next.js 14.2.35. `npm audit --omit=dev` reports three high-severity vulnerable packages: direct `next`, and transitive `postcss` and `nanoid`. The Next findings include denial of service and, in affected configurations, SSRF/cache issues. The application uses App Router/server functionality, so this should not be accepted without upgrading and retesting.

**Fix.** Upgrade to a currently supported, fixed Next.js release and refresh transitive dependencies. Re-run typecheck, build, audit, webhook raw-body tests, CSP/browser checks, and authenticated route tests. Do not rely only on a major-version automated fix.

## P3 findings — cleanup and hardening

### PAY-P3-01 — Raw provider payload/PII retention is unbounded

Full Paystack and RevenueCat payloads, including email and provider metadata, are stored in multiple tables and sometimes logged. Define a minimal normalized audit schema, encrypt/restrict raw payload access, redact logs, and set a retention schedule.

### PAY-P3-02 — The pay homepage has a missing favicon and outdated provider promises

The live browser reports a 404 for `/favicon.ico`. More importantly, the homepage promises Paystack methods and instant unlock, neither of which matches the intended Bachs architecture or current failure modes. Update provider/method/recurrence/refund copy from the server product catalog and actual Bachs capability by currency/rail.

## Required target architecture

1. **One authority:** all web checkout/refund/status commands go through authenticated NestJS. `pay.edutu.org` is a presentation shell only.
2. **Two deliberate rails:** Bachs for web/PWA; RevenueCat for iOS/Android native purchases. Paystack remains read/reconciliation-only during migration, then is retired.
3. **Server catalog:** `products(product_key, provider, provider_product_id, kind, currency, amount, duration, recurrence, enabled)`; clients send only `productKey`.
4. **Checkout intents:** durable record before provider call, canonical raw auth subject, expected money/product, idempotency key, provider session/checkout IDs, and finite state.
5. **Webhook inbox:** exact raw body + signature metadata, unique `(provider,event_id)`, `received/processing/processed/failed`, attempts, last error, and dead-letter/replay tooling.
6. **Immutable money ledger:** provider references and amounts never rewritten; corrections are new refund/reversal entries.
7. **Source grants:** one row per purchased/refunded/revoked source; aggregate entitlement is a derived projection.
8. **Provider-aware subscriptions/refunds:** preserve provider customer/subscription/charge/refund IDs as text. Internal database primary keys may be random UUIDs; external IDs must never be forced into UUID columns.

### Bachs checkout flow using Bachs UI

1. Edutu client calls authenticated `POST /billing/checkout` with `productKey` and `Idempotency-Key`.
2. NestJS resolves raw Clerk subject, creates a pending intent, and calls `POST /v1/checkout-sessions` with the Bachs product cart and an opaque `intent_id` in metadata.
3. NestJS returns `checkout_url`/client-safe session details. `pay.edutu.org` opens the Bachs hosted page or overlay. Card/bank details never touch Edutu.
4. Browser overlay events update only presentation (`opened`, `closed`, `completed/processing`). They never grant access.
5. Signed `collection.succeeded` enters the durable inbox, validates event organization, checkout/product, expected amount/currency, and canonical owner, then atomically appends transaction + grant and projects access.
6. The result page polls `GET /billing/intents/:opaqueId` and renders `processing`, `active`, or a precise recovery state.

Bachs' API boundary uses currency-precision decimal strings rather than minor-unit integers. Internally Edutu may use integer minor units with an explicit currency exponent, but conversion must be centralized and float-free. See the [Bachs integration reference](https://docs.bachs.io/llms.txt).

## State and UX contract

### Checkout/payment

`created -> session_created -> customer_opened -> processing -> succeeded | failed | underpaid | expired`

- `processing`: “We're confirming your payment. Do not pay again.” Poll and provide the intent reference.
- `succeeded`, grant pending: “Payment confirmed; we're activating Pro.” This state must alert if it exceeds a short SLO.
- `failed`: show provider-confirmed reason when safe, alternate method, and a new idempotent attempt.
- `underpaid`: do not grant full access; show support/top-up/refund path according to policy.
- Never claim “you weren't charged” from a redirect/verification timeout alone.

### Subscription

`trialing | active | past_due | unpaid | cancel_at_period_end | canceled | expired`

Show provider, product, renewal/paid-through date, payment method constraints, and where management occurs. Bachs past-due recovery and native-store management remain provider-specific.

### Refund

`requested -> processing -> paid | failed`

Show requested/refunded amount, original charge, method/rail, ETA disclaimer, reference, and whether access is retained/reduced/revoked under the product policy. A failed refund must restore the actionable state rather than silently ending the workflow.

## Launch gates

Bachs production must remain disabled until all gates pass:

- Production homepage and code identify Bachs, and the actual webhook route exists.
- Unsigned/invalid/stale Bachs webhooks return non-2xx; valid events are durably stored before 2xx.
- Sandbox `collection.succeeded` grants exactly once under duplicate and reordered delivery.
- Fault injection after every DB step converges on retry without double grant or paid-no-access.
- Amount, currency, organization, product, checkout intent, and owner are validated server-side.
- Full, partial, duplicate, non-refundable, paid, and failed refunds reconcile correctly.
- Failed renewal, underpayment, cancellation-at-period-end, expiration, and recovery are represented in UI and access policy.
- Cross-rail overlap tests prove one provider cannot revoke another valid grant.
- All product/currency/rail combinations in admin config are tested; unsupported recurring methods are not advertised.
- Secrets are rotated; no payment/webhook secret is present in client bundles or examples.
- Hosted pay dependencies have no unaccepted high/critical production advisories.
- Reconciliation dashboard and alerts are operating for at least a sandbox soak period.
- Support has a documented, audited replay/refund/manual-grant runbook.

## Verification performed

- Live HTTP and browser checks of `pay.edutu.org`, weekly/error redirect, response headers, and likely Bachs webhook endpoints.
- `pay-edutu-org`: `npm run typecheck` — pass.
- `pay-edutu-org`: `npm run build` — pass.
- NestJS: focused `billing.service.spec.ts` — 11/11 pass, with an open-handle warning after Jest completion.
- `edutu-web-app`: `npm run typecheck` — pass.
- `edutumobile`: `npm run typecheck` — pass.
- `pay-edutu-org`: `npm audit --omit=dev` — 3 high-severity vulnerable production packages.

These checks demonstrate compilation and the current signature test only; they do not demonstrate safe financial behavior.

## Review limitations and residual risk

This was a repository and black-box production review. It did not access the Bachs, Paystack, RevenueCat, Vercel, Render, Clerk, or Supabase dashboards; inspect real customer rows; initiate/refund real money; or verify deployed environment values. Before launch, export provider product/webhook configuration and run a production-schema inventory plus sandbox end-to-end reconciliation. Existing uncommitted worktree changes were preserved and no payment implementation was changed by this audit.
