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

