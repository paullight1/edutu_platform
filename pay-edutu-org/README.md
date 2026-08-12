# pay.edutu.org

This Next.js app is the Edutu payment shell. It does not collect payments,
write money records, grant entitlements, call Paystack, or host an admin
console. The canonical Nest billing API owns all of those operations.

## Required server-only environment

Copy `.env.example` for local development and use deployment secrets/config
instead of committing a local env file.

- `EDUTU_BILLING_API_URL`: canonical HTTPS Nest API origin, with no path.
- `PAY_SHELL_ORIGIN`: this exact public HTTPS origin for same-origin POST checks.
- `BACHS_CHECKOUT_ENABLED=false`: remains false by default. The shell only
  displays a controlled availability message; checkout creation remains on the
  canonical API.

No Bachs key, provider secret, Supabase service-role value, admin token, user
identifier, email, amount, currency, or Clerk token belongs in this app's URLs
or client bundle.

## Authentication boundary

Clerk is not installed in this package. The Edutu authenticated client must
request a short-lived, single-use code from the canonical API and submit that
code by POST to `/api/auth/exchange`; it must never be put in a URL. The API
must atomically consume the code and return an opaque, short-lived pay-shell
session for the same authenticated subject. This app stores it only in a
secure, httpOnly, same-site cookie and passes it server-to-server to:

- `GET /billing/intent-status` for `/result` polling;
- `GET /billing/account` for account display;
- `POST /billing/portal-session` for a fresh Bachs hosted portal URL.

The API must reject the opaque session when expired/revoked, resolve the user
server-side, and return no raw provider payloads. `/result` does not grant
access; it only displays the backend's confirmed status. `/return` always
redirects to `/result` without a write.

## Bachs portal response contract

`POST /billing/portal-session` returns only `{ "url": "https://portal.bachs.io/..." }`
for the authenticated Bachs customer in the active environment. The shell
rejects every other origin and never persists portal URLs.

## Legacy cutover dependency

The legacy Paystack webhook route is intentionally removed from this shell.
During cutover, the canonical Nest billing API must keep its legacy Paystack
webhook/reconciliation route live until all previously created transactions are
settled and reconciled. Removing that backend route is a separate operational
decision and is not part of this shell release.

## Commands

```bash
npm test
npm run typecheck
npm run build
```
