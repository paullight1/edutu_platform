# pay.edutu.org and Edutu Billing Threat Model

## Executive summary

Edutu's payment system is not ready for Bachs production traffic. The live Bachs webhook URL returns `404`, while the only local Bachs handler verifies a signature and then acknowledges every event without fulfillment. The larger structural risk is that Paystack, RevenueCat, the Next.js pay app, the NestJS backend, and three partially overlapping ledgers can each mutate subscription state. Their writes are not atomic, they use inconsistent user identifiers, and a single aggregate entitlement row cannot safely represent simultaneous Bachs and native-store purchases. The target state should make the NestJS billing module the only payment authority, use Bachs-hosted checkout and customer portal for web payments, retain RevenueCat for native IAP, and derive Pro from immutable provider-specific grants.

## Scope and assumptions

In scope:

- `pay-edutu-org/` Next.js checkout, return, account, admin, provider, and database code.
- `backend/services/services/api/src/billing/`, backend authentication identity mapping, and server-side Pro checks.
- `edutu-web-app/` and `edutumobile/` payment initiation and status consumption.
- `edutumobile/supabase/functions/revenuecat-webhook/` and billing-related Supabase migrations.
- The public deployments at `pay.edutu.org` and `edutu-platform.onrender.com`.
- Bachs checkout, webhooks, subscriptions, recovery, refunds, disputes, and customer portal integration boundaries.

Confirmed product assumptions:

- Bachs will own all web/PWA payments: Pro subscriptions, season passes, and credit packs.
- RevenueCat remains the native App Store and Play Store payment rail.
- A user may have active purchases from more than one rail; Pro remains active while any valid grant is active. Recurring plans coexist and do not stack artificial extra days.
- Bachs failed-renewal recovery is honored. Full refunds and chargebacks suspend the affected grant; partial refunds require review.
- Edutu UI remains on `pay.edutu.org`; card, bank, mobile-money, crypto, and customer-portal payment UI remains Bachs-hosted.
- Bachs currently documents recurring products as USD-card-only. Local non-card methods therefore buy clearly labeled bounded access passes and do not promise automatic renewal unless Bachs expands recurring-method support.

Out of scope:

- Bachs, Paystack, RevenueCat, Apple, Google, Clerk, Vercel, Render, and Supabase internal platform security.
- Cardholder-data processing inside Bachs or native stores; Edutu should never receive card numbers.
- Tax, accounting, and jurisdiction-specific legal advice.

Open questions that do not block the architecture but affect later policy configuration:

- Exact grace access during Bachs `past_due`: current-period end only, or an additional Edutu grace period.
- Whether chargebacks suspend only the disputed grant or the entire account pending fraud review. This model assumes the disputed grant only unless coordinated fraud is detected.
- The final stable API hostname. The recommendation is `api.edutu.org`; the current Render hostname can be used temporarily.

## System model

### Primary components

- Edutu web/PWA and mobile web initiate web purchases.
- Native iOS/Android uses RevenueCat and the platform stores.
- `pay.edutu.org` presents Edutu-owned purchase status, return, support, and account-management UI.
- The NestJS billing module should authenticate users, create provider sessions, receive webhooks, and own ledger/entitlement mutations.
- Bachs hosts checkout and customer-portal UI and sends at-least-once signed webhooks.
- RevenueCat sends native purchase lifecycle webhooks.
- Supabase/PostgreSQL stores checkout intents, provider events, transactions, subscriptions, grants, and the compatibility entitlement projection.

### Data flows and trust boundaries

- Browser/mobile web → NestJS API: product key, return context, and an idempotency key over HTTPS. Clerk bearer authentication must determine the raw auth subject; client `uid`, amount, currency, email, and provider IDs are not authoritative. The current direct URL flow does not meet this requirement (`edutu-web-app/src/services/billing.ts:createCheckout`, `edutumobile/lib/pricing.ts:buildCheckoutUrl`).
- NestJS API → Bachs API: server-owned product IDs, customer identity, unique Edutu checkout reference, return URLs, and metadata over HTTPS with a server-only scoped API key and `Idempotency-Key`.
- User agent → Bachs hosted checkout: a short-lived Bachs checkout URL. Bachs owns payment data collection; Edutu receives only provider references and lifecycle state.
- Bachs → NestJS webhook: exact raw JSON body plus `X-Bachs-Timestamp` and `X-Bachs-Signature`. Verification is HMAC-SHA256 over `timestamp.raw_body`, with a five-minute freshness window and constant-time comparison (`backend/services/services/api/src/billing/billing.service.ts:verifyBachsSignature`).
- RevenueCat → webhook processor: native purchase events authenticated by a configured authorization secret. The current Supabase function performs static-secret validation and environment checks (`edutumobile/supabase/functions/revenuecat-webhook/index.ts:87-161`).
- Billing processor → PostgreSQL: integrity-critical writes. Event claim, transaction, subscription, grant, and projection updates must be one transaction or a durable inbox plus retryable worker. Current Paystack and RevenueCat flows contain partial-write gaps.
- Browser → `pay.edutu.org`: return/status and account-management UI. A browser redirect is never proof of payment and must not grant Pro.
- Admin → billing operations: refunds, manual grants, reconciliation, and support actions. Clerk admin RBAC, MFA, CSRF protection, and immutable audit records are required; the current pay app uses one static bearer token.

#### Diagram

```mermaid
flowchart LR
  U["Edutu user"] --> W["Web and PWA"]
  U --> N["Native app"]
  W --> A["NestJS billing API"]
  W --> P["Edutu payment site"]
  P --> A
  A --> B["Bachs API"]
  U --> B
  B --> A
  N --> R["RevenueCat and stores"]
  R --> A
  A --> D["Supabase Postgres"]
  P --> A
  O["Edutu operator"] --> A
```

## Assets and security objectives

| Asset | Why it matters | Security objective |
| --- | --- | --- |
| Bachs, Paystack, RevenueCat, Supabase, and admin secrets | Compromise enables forged operations, data access, or payment abuse | Confidentiality, integrity |
| Checkout intent | Binds one authenticated user to one product, amount, currency, environment, and provider session | Integrity |
| Provider event inbox | Proves what was received and whether it was processed exactly once | Integrity, availability |
| Payment ledger | Financial and support record; must preserve amounts, currencies, refunds, and environment | Integrity, availability |
| Provider subscriptions | Controls renewal, cancellation, dunning, and customer-portal access | Integrity, availability |
| Entitlement grants | Determines access users paid for; must survive retries and overlapping providers | Integrity, availability |
| Clerk auth subject mapping | Prevents payments and entitlements from attaching to the wrong account | Integrity |
| Customer PII and provider payloads | Includes email, name, payment metadata, and support references | Confidentiality |
| Revenue and reconciliation reports | Used for operational and financial decisions | Integrity, availability |
| Public payment and webhook endpoints | Downtime can lose checkouts or delay fulfillment | Availability |

## Attacker model

### Capabilities

- An unauthenticated internet user can call public checkout, return, health, and webhook URLs and alter query strings, headers, JSON, and request frequency.
- An authenticated user can alter client code, replay requests, choose arbitrary client-supplied identifiers, open multiple tabs, and race checkout creation.
- A malicious payer can abandon, underpay, overpay, dispute, refund, or retry using supported provider flows.
- Anyone who obtains a sandbox or static admin/webhook secret can exercise the privileges of that credential until it is rotated.
- Provider webhooks can be duplicated, delayed, replayed, or delivered out of order without malicious intent.
- Operators can make configuration mistakes, including wrong product IDs, wrong environment keys, stale webhook URLs, or open redirects.

### Non-capabilities

- A normal remote attacker cannot forge a correctly implemented Bachs or Paystack HMAC without the endpoint secret.
- A normal remote attacker cannot directly write service-role-protected billing tables unless a credential or privileged endpoint is compromised.
- Edutu does not process raw card details when using Bachs-hosted checkout or native IAP.
- This model does not assume compromise of Bachs, Clerk, Supabase, Vercel, Render, Apple, or Google.

## Entry points and attack surfaces

| Surface | How reached | Trust boundary | Notes | Evidence |
| --- | --- | --- | --- | --- |
| Legacy hosted checkout | Public `GET /checkout` | Internet → pay app | Accepts caller-supplied `uid`, plan, email, ref, and platform; no authenticated owner binding or durable intent | `pay-edutu-org/src/app/checkout/route.ts:29-105` |
| Browser payment return | Public `GET /return` | Provider/browser → pay app | Verifies provider reference but also performs fulfillment; browser return must be display-only | `pay-edutu-org/src/app/return/page.tsx:83-173` |
| Paystack webhook | Public `POST /api/webhook` | Paystack → pay app | Raw-body HMAC exists, but payment insert and grant are separate operations | `pay-edutu-org/src/app/api/webhook/route.ts:22-164` |
| Planned Bachs webhook | Public `POST /billing/webhooks/bachs` | Bachs → backend | Signature verifier is correct; handler returns success while ignoring the event and is not deployed | `backend/services/services/api/src/billing/billing.controller.ts:73-91`, `billing.service.ts:545-574` |
| Account start | Public `GET /account/start` | App/browser → pay app | Clerk token is passed in URL before conversion to a cookie | `pay-edutu-org/src/app/account/start/route.ts:8-42` |
| Account cancellation | Authenticated cookie `POST` | Browser → pay app → Paystack | Fails closed when session secret is absent, but only supports Paystack records | `pay-edutu-org/src/app/api/account/cancel/route.ts:9-57` |
| Pay app admin | Static-token login and cookie | Operator/browser → pay app | Grants or revokes Pro and reads PII/revenue; no named identity, MFA, or RBAC | `pay-edutu-org/src/lib/auth.ts:67-118`, `src/app/api/admin/grant/route.ts` |
| Backend billing checkout/status | Clerk bearer API | Client → backend | Uses derived `CurrentUser("id")`, while the pay app/mobile entitlement path uses raw Clerk subjects | `backend/services/services/api/src/billing/billing.controller.ts:21-32`, `src/auth/clerk-auth.guard.ts:159-170` |
| RevenueCat webhook | Public Supabase function | RevenueCat → Supabase function | Auth and environment checks exist; event processing is multi-write and only partly retry-safe | `edutumobile/supabase/functions/revenuecat-webhook/index.ts:87-209` |
| Remote pricing URLs | Admin setting consumed by clients | Operator config → user agent | Any valid HTTPS origin is accepted, enabling accidental or compromised redirect to a lookalike checkout | `edutu-web-app/src/lib/proPricing.ts:182-221`, `edutumobile/app/admin/pricing.tsx:184-203` |
| Bachs customer portal session | Future authenticated POST | Client → API → Bachs | Must mint fresh short-lived URL for the authenticated user's mapped Bachs customer | Bachs integration requirement; current route absent |

## Top abuse paths

1. Paid-without-access: a provider success is inserted into the payment ledger, the entitlement write fails, and the retry sees the payment as duplicate and skips fulfillment forever.
2. Cross-rail revocation: a user has active RevenueCat and Bachs grants; one provider expires or refunds, and its handler overwrites the single aggregate entitlement row, removing access still funded by the other provider.
3. Identity split: checkout metadata stores a raw Clerk subject, the NestJS status path queries a derived UUID, and different clients disagree about whether the same account is Pro.
4. Acknowledged loss: Bachs sends a valid event to the local handler; the handler returns `2xx` with `ignored: true`, so Bachs records delivery success and no grant is created.
5. Configuration-induced fraud: an admin-controlled checkout origin is changed to a lookalike HTTPS site; clients redirect signed-in users there and expose account/email context.
6. Secret-assisted self-grant: a public mobile build contains the RevenueCat webhook authorization secret used by the development mock; an attacker sends arbitrary sandbox/accepted events to grant Pro.
7. Schema rejection: Bachs, weekly, season-pass, or credit transaction values violate old database checks; unchecked Supabase errors make the handler appear successful while data is missing.
8. Refund/chargeback retention: a successful payment grants Pro, but refund or dispute events are ignored, leaving access active after funds reverse.
9. Duplicate checkout: repeated taps or request retries create fresh provider sessions because the public GET route always creates a random reference; a user can complete more than one session.
10. Operational replay/outage: Vercel protection, wrong DNS, a sleeping backend, or a route rename causes webhook failures; without reconciliation and alerting, paid users remain unresolved until support complaints arrive.
11. Payment-method promise mismatch: Edutu advertises a recurring weekly/monthly/yearly subscription to a mobile-money or transfer payer, but Bachs currently supports recurring products only on USD cards; checkout either hides the method or the user receives a non-renewing purchase that the UI incorrectly calls a subscription.

