# Safe payment-shell model

`pay.edutu.org` is a presentation and account-management surface only.

1. The authenticated Edutu client asks the canonical Nest billing API to
   create an allowed Bachs checkout session from a server-owned product key.
2. Bachs hosts collection. Browser redirects and client-side callbacks never
   grant an entitlement.
3. Bachs webhooks reach the canonical Nest API, which durably processes and
   confirms billing status.
4. This shell polls that authenticated API for `/result` and starts a fresh
   hosted Bachs customer portal session for web subscription management.

The browser never gets provider keys, Supabase service-role credentials, a
static admin token, a Clerk JWT in a URL, a user id, email, amount, currency,
or a provider fulfillment endpoint. Native App Store and Play Store purchases
remain provider-managed by RevenueCat; the web portal cannot cancel them.

The standalone legacy Paystack webhook is absent from this shell. The canonical
Nest billing API must retain its legacy Paystack webhook and reconciliation path
during cutover so already-created transactions can finish safely.
