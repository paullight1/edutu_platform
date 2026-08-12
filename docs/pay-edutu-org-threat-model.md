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

## Threat model table

| Threat ID | Threat source | Prerequisites | Threat action | Impact | Impacted assets | Existing controls (evidence) | Gaps | Recommended mitigations | Detection ideas | Likelihood | Impact severity | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TM-001 | Deployment/configuration failure | Bachs checkout enabled before webhook cutover | Successful events hit a `404` or an acknowledge-only handler | Paid users receive no product; event retries may stop | Endpoint availability, grants, support trust | Signature code and tests exist locally | Live pay and backend Bachs routes both returned `404`; local handler ignores events | Keep Bachs disabled until a durable processor is deployed; return non-2xx on unprocessed events; add synthetic signed canary and Bachs delivery alert | Alert on any webhook non-2xx, zero events after checkout, and events stuck `received` | High | High | high |
| TM-002 | Authenticated or anonymous caller | Public checkout accepts caller identity/context | Caller creates checkout for arbitrary `uid`, races sessions, or relies on untrusted metadata | Wrong-account fulfillment, abuse, duplicate charges | Checkout intent, identity mapping, ledger | Amount is re-resolved server-side | No authenticated binding, no intent row, no one-request idempotency | Authenticated API `POST`; derive raw auth subject from Clerk; server product catalog; durable intent; Bachs `reference` and `Idempotency-Key` | Multiple open intents per user/product, mismatched user/provider customer, velocity alerts | High | High | high |
| TM-003 | Provider retries, concurrency, transient DB failure | Any success event with a failure between writes | Partial state is committed; retry dedupe prevents completion or concurrent grants overwrite each other | Money paid without access, lost paid time, duplicate credits | Ledger, grants, credits | Unique provider references and event IDs | Claims and side effects are not one transaction; read-then-upsert extension races | Transactional event processor; immutable provider-specific grants; row locks; resumable event status; idempotent credit RPC | Payment without active grant, event `failed`, ledger/grant count mismatch | High | High | high |
| TM-004 | Normal cross-platform use | Same user purchases through Bachs and RevenueCat | One provider's cancel/expiry/refund overwrites aggregate entitlement from another | Incorrect downgrade or over-entitlement | Grants, subscription status | Mobile checks RevenueCat plus DB | Single `(user_id, feature_key)` row cannot encode independent sources | `billing_entitlement_grants` per provider/source; derive effective Pro with `exists(active grant)`; projection only for compatibility | Alert when projection differs from derived grants | High | High | high |
| TM-005 | Internal identity inconsistency | Raw Clerk subject and derived UUID both exist | Writes and reads attach to different logical identities | Wrong status, orphaned purchases, support cannot reconcile | User mapping, all billing records | Dual-key helper exists in monetization service | Billing controller uses derived `id`; mobile/pay app use raw subject; no explicit provider-account mapping | Make raw `authId` canonical for billing; migrate aliases; add `billing_identities`; prohibit client UID | Orphan provider customers, duplicate identity rows, unmatched profile report | High | High | high |
| TM-006 | Schema/configuration drift | Old checks remain in live DB | Valid Bachs/weekly/credit writes fail or are silently ignored | Incomplete subscriptions, missing revenue, wrong entitlements | Database integrity, reporting | Some callers inspect errors | Migration excludes Bachs and weekly; several Supabase writes ignore errors | One canonical migration directory; provider-neutral checks or lookup tables; fail every critical write; schema contract tests against staging | Postgres constraint-error alerts, migration checksum dashboard | Medium | High | high |
| TM-007 | Payer, issuer, or provider lifecycle | Refund, dispute, underpayment, or failed renewal occurs | Unhandled state leaves access or revenue incorrect | Service after reversal, unfair revocation, support loss | Revenue, grants, subscriptions | Paystack failed charge logging; Bachs dunning exists provider-side | No Bachs event state machine; no refund/dispute processing or reconciliation | Explicit event mapping; grant-by-source revocation; partial-refund review; dunning statuses; daily reconciliation | Refund/dispute without matching local state, past-due aging, negative settlement alerts | High | High | high |
| TM-008 | Credential theft or developer mistake | Secret placed in tracked/public-prefixed configuration or static admin token leaks | Attacker calls privileged webhook/admin/provider operations | Fraudulent grants, PII disclosure, provider abuse | Secrets, grants, PII | Gitignored runtime envs; constant-time token compare | Credential-like values exist in example files; mobile mock uses `EXPO_PUBLIC` webhook secret; admin is one shared secret | Remove/rotate exposed values; delete shipped mock path; secret scanning; scoped keys; Clerk admin RBAC and MFA; audited actions | Secret-scanner CI, admin anomaly alerts, key-usage logs | Medium | High | high |
| TM-009 | Config compromise, browser history, referrers | Remote URL changed or Clerk token put in query | User redirected to phishing origin or token appears in logs/history | Account takeover or payment phishing | Auth token, PII, trust | `Referrer-Policy: no-referrer` on pay app; token converted to cookie | Initial URL still carries token; arbitrary HTTPS checkout origin accepted | Exact origin allowlist; backend-issued one-time start code; POST exchange; never place Clerk JWT in URL | Redirect-origin change audit, token-pattern log redaction, CSP/reporting | Medium | High | high |
| TM-010 | Internet attacker or buggy client | Public routes and serverless instances | Brute-force admin, spam checkout sessions, replay returns, or exhaust provider/API limits | Availability loss and provider cost | Endpoints, API quota, support | Global Nest throttler; best-effort pay-app limiter; webhook timestamp check | Limiter is per instance and trusts forwarded header; checkout has no hard limit; provider calls lack bounded timeout | Vercel/Redis rate limit; trusted IP extraction; per-user checkout cooldown; provider timeout/backoff/circuit breaker; body limits | 429 rate, checkout/session ratio, provider latency/error alerts | Medium | Medium | medium |
| TM-011 | Operator/developer logging and storage | Raw provider objects retained and errors logged | PII and financial metadata persist or leak beyond need | Privacy incident, broad breach impact | PII, logs, raw payloads | RLS denies client ledger reads | Raw payload stored indefinitely; logs include IDs/email; no retention/redaction standard | Minimize normalized fields; encrypt/restrict raw event store; retention job; redact logs; access audit | PII scanner, raw-event age metric, service-role access audit | Medium | Medium | medium |
| TM-012 | Release/configuration process | Stale docs, diverged branch/config, protected webhook deployment | Team follows inaccurate route/idempotency/store-policy claims | Regression, failed deployment, unsafe cutover | Availability, system integrity | Builds and selected tests pass | Docs claim weekly support and atomic idempotency that code lacks; local root Vercel config is stale relative to remote | Architecture decision record; deployment smoke tests; route contract tests; required review owners; reconcile local branch before payment work | CI checks for route presence/config schema and drift | Medium | Medium | medium |
| TM-013 | Product/provider capability mismatch | Buyer selects a non-card local method for a product presented as recurring | The product cannot auto-renew as presented, or fulfillment models it as recurring anyway | Misleading billing promise, unexpected expiry, churn, support disputes | Product catalog, subscriptions, user trust | Bachs hosted checkout selects supported methods | Current Edutu plan model conflates cadence with automatic renewal; Bachs documents recurring products as USD-card-only | Store `renewal_mode` and supported methods per product; offer bounded one-time passes for non-card rails; show “renews automatically” only after a recurring-capable method/session is confirmed | Checkout abandonment by method, pass-expiry churn, complaints tagged payment-method mismatch | High | Medium | high |

## Criticality calibration

- Critical: likely unauthorized movement of live funds, compromise of live provider/service-role credentials, or mass cross-user entitlement/admin takeover. Examples: leaked live Bachs key with write scope; public service-role key; unauthenticated admin grant endpoint.
- High: likely paid-without-access, wrong-user fulfillment, broad incorrect access, or unhandled chargebacks/refunds at production scale. Examples: partial event processing, identifier split, single-row cross-provider revocation.
- Medium: bounded availability, privacy, abuse, or operational risks with recovery paths. Examples: checkout-session spam, excessive raw payload retention, stale deployment documentation.
- Low: defense-in-depth or low-impact information issues requiring unlikely preconditions. Examples: non-sensitive health metadata or harmless duplicate UI analytics.

No currently verified critical issue is claimed because Bachs is still sandbox/not actively fulfilling live payments. Several high risks become critical operational incidents if live traffic is enabled before remediation.

## Focus paths for security review

| Path | Why it matters | Related Threat IDs |
| --- | --- | --- |
| `pay-edutu-org/src/app/checkout/route.ts` | Public identity-bearing checkout creation and duplicate-session behavior | TM-002, TM-010 |
| `pay-edutu-org/src/app/return/page.tsx` | Browser-triggered fulfillment and partial-write race | TM-003, TM-007 |
| `pay-edutu-org/src/app/api/webhook/route.ts` | Current Paystack authoritative handler and retry assumptions | TM-003, TM-007 |
| `pay-edutu-org/src/lib/entitlements.ts` | Aggregate entitlement mutation, ledger idempotency, ignored DB errors | TM-003, TM-004, TM-006 |
| `pay-edutu-org/src/lib/auth.ts` | Clerk verification, signed cookies, and static admin authority | TM-008, TM-009 |
| `pay-edutu-org/sql/schema.sql` | Divergent payment schema and one-row entitlement model | TM-004, TM-006 |
| `backend/services/services/api/src/billing/` | Intended canonical Bachs ingress and current duplicate payment authority | TM-001 through TM-007 |
| `backend/services/services/api/src/auth/clerk-auth.guard.ts` | Raw subject versus derived UUID boundary | TM-005 |
| `backend/services/services/api/src/common/user-id.ts` | One-way identifier derivation and dual-key compatibility | TM-005 |
| `backend/services/services/api/src/monetization/monetization.service.ts` | Server-side Pro authorization and profile fallback | TM-004, TM-005 |
| `edutumobile/supabase/functions/revenuecat-webhook/index.ts` | Native payment authority and partial-failure/idempotency behavior | TM-003, TM-004, TM-008 |
| `edutumobile/supabase/migrations/009_billing_entitlements.sql` | Provider/plan/type constraints incompatible with current code and Bachs | TM-006 |
| `edutu-web-app/src/services/billing.ts` | Direct URL checkout routing and false dedupe assumptions | TM-002, TM-012 |
| `edutu-web-app/src/lib/proPricing.ts` | Remote checkout origin and user data in query strings | TM-002, TM-009 |
| `edutumobile/lib/pricing.ts` | Mobile web checkout URL construction and remote origin trust | TM-002, TM-009 |
| `edutumobile/lib/devMockPurchase.ts` | Public-prefixed webhook secret and arbitrary dev grant path | TM-008 |
| `vercel.json` | Deployment configuration drift can make payment endpoints unreachable | TM-001, TM-012 |

## Quality check

- Covered public checkout, return, Paystack webhook, planned Bachs webhook, RevenueCat webhook, status, account, portal, admin, database, and provider outbound calls.
- Represented every identified trust boundary in at least one threat.
- Separated production runtime from local uncommitted code, examples, and development mock tooling.
- Incorporated the confirmed Bachs-all-web, RevenueCat-native, multi-provider coexistence, and refund/dunning policies.
- Redacted all discovered credential values and treated their presence, not their contents, as evidence.
