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

