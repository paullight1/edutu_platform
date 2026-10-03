# pay.edutu.org

This Next.js shell opens Bachs hosted checkout, reads canonical purchase status,
and offers account management. The Nest API owns catalog pricing, identity,
fulfillment, and the credit ledger.

## Required server configuration

- `EDUTU_BILLING_API_URL`: canonical HTTPS Nest API origin without a path.
- `PAY_SHELL_ORIGIN=https://pay.edutu.org`: exact Origin used for browser POST checks.
- `BILLING_PAY_SHELL_API_KEY`: a dedicated server secret of at least 32 characters,
  identical to the canonical API setting. Never use a `NEXT_PUBLIC` name.
- `BACHS_CHECKOUT_ENABLED`: shell availability copy only; off by default. The
  canonical API separately controls whether a checkout can be created.

The canonical API requires its existing validated Bachs configuration, signed
webhook ingress, `BILLING_PAY_SHELL_ENABLED=true`, and the additive migration
`supabase/migrations/20261002090000_billing_pay_shell_sessions.sql`. Its catalog
reports checkout disabled until the protocol schema can be read. Configure
sandbox first; implementing the protocol does not enable a deployment.

## Checkout and authentication

The Clerk-authenticated Edutu client posts a server-owned product key and
`returnSurface` to `/billing/consumer-checkout`, with a stable `Idempotency-Key`.
The response includes `checkoutUrl=https://pay.edutu.org/start#code=...`,
`intentId`, provider `expiresAt`, short `handoffExpiresAt`, `renewalMode`, and
`validityDays`. Developer clients keep using `/billing/checkout` and receive the
same shell handoff format. Only fulfillable one-time catalog rows are released.

The code expires after two minutes and can be exchanged once. `/start` reads
its fragment, removes it from browser history immediately, and posts it to
`/api/auth/exchange`. The fragment is not sent in the page request or referrer.
The client must never persist or log this URL. If exchange fails, Edutu can
repeat checkout with the same idempotency key to receive a fresh handoff for
the same open provider intent.

The shell server exchanges the code over `/billing/pay-shell/exchange` using
both a bearer code and `X-Edutu-Pay-Shell-Key`. The API atomically consumes the
hashed code and inserts a hashed 15-minute opaque session in PostgreSQL. The
server places the session only in a Secure, HTTP-only, SameSite=Lax cookie.
Neither the session nor a Clerk token is placed in any URL or browser storage.

After the cookie is established, the browser opens the checked Bachs checkout
URL. Bachs returns to `/result`; redirect parameters never establish payment
success. The shell uses cookie authority and its server secret for:

- `GET /billing/intent-status`: the intent bound to this session; `active` only
  after canonical `fulfilled`. Provider `paid` remains `processing`.
- `GET /billing/account`: owner-scoped recurring purchases, one-time grants,
  and fulfilled credit purchases. Native stores retain native management.
- `POST /billing/pay-shell/portal-session`: a fresh Bachs portal URL for this
  owner's existing Bachs provider-customer mapping. Missing mappings return 404.

The Clerk route `POST /billing/pay-shell/handoff` accepts
`{destination:'account'}` or `{destination:'result',intentId}` and returns
`{url,expiresAt}` for fresh access or an expired shell cookie. Another owner's
intent returns 404. It accepts no caller-provided destination URL.

Expired/revoked sessions and sessions from another provider environment cannot
be used. `/return` redirects to `/result` without a billing write. Result and
error pages link to `https://app.edutu.org/app/wallet`, where the authenticated
app rechecks the stored owner intent and canonical entitlements.

## Operational prerequisites

Enable only configured server catalog products and verified provider mappings;
no prices or quantities are introduced by this protocol. Recurring Bachs and
season-pass products remain excluded from new hosted collection until their
canonical webhook lifecycle is supported. Native RevenueCat semantics are
unchanged. Existing legacy Paystack webhook and reconciliation routes must
remain available for already-created transactions.

The existing canonical billing migrations, including RevenueCat's
`provider_store` column, are prerequisites for account display. Database code
and session rows have expiry indexes; deployment maintenance should delete
expired rows after its chosen audit retention. No migration, deployment,
provider request, or transaction was executed for this change.

## Commands

```bash
npm test
npm run typecheck
npm run build
```
