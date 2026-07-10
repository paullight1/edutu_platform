# pay.edutu.org — Edutu hosted checkout

Standalone Next.js app that powers **pay.edutu.org**. The Edutu mobile app opens
this site with the signed-in user's context; it charges via **Paystack** and, on
success, grants **Edutu Pro** by writing the entitlement into Supabase (which the
app reads). Card details never touch Edutu's own servers.

```
Edutu app ──▶ pay.edutu.org/checkout?uid&email&plan&currency&amount&ref&platform
                 │  looks up the REAL price (admin config), inits Paystack
                 ▼
           Paystack hosted card page ──pays──▶ Paystack
                 │                                  │ webhook (verified)
        callback ▼                                  ▼
        /return  ──grants Pro (instant)      /api/webhook ──grants Pro (authoritative)
                 │                                  │  service-role write
                 ▼                                  ▼
         edutu://paywall?status=success      Supabase: billing_entitlements + profiles
```

## Routes

| Route | Purpose |
| --- | --- |
| `GET /checkout` | Validates the price server-side, creates a Paystack transaction, redirects to the card page. |
| `GET /return` | Paystack callback. Verifies the payment, grants Pro instantly, deep-links back to the app. |
| `POST /api/webhook` | Paystack webhook (HMAC-verified). **Authoritative** grant/revoke; idempotent. |
| `GET /account?uid=` | User self-service: subscription status + cancel auto-renew. |
| `GET /admin?token=` | See users/payments, **award free Pro / bonanzas**, revoke. |
| `POST /api/admin/grant` · `/revoke` | Bearer-token admin actions. |
| `GET /api/health` | Health check. |

## 1. Install & run locally

```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev                  # http://localhost:3001
```

## 2. Database

Run [`sql/schema.sql`](./sql/schema.sql) once in the Supabase SQL editor. It
creates `billing_entitlements` (the row the app reads), `payments` (your ledger),
and `billing_subscriptions`. Safe to re-run.

> The mobile app already reads `billing_entitlements` keyed by the **raw Clerk
> user id** and even subscribes to realtime changes on it — so a grant unlocks
> Pro almost instantly.

## 3. Paystack setup

1. Create a Paystack account → **Settings → API Keys & Webhooks**.
2. Put `PAYSTACK_SECRET_KEY` / `PAYSTACK_PUBLIC_KEY` in your env (test keys first).
3. Set the **Webhook URL** to `https://pay.edutu.org/api/webhook`.
4. **Recurring (optional):** create Plans in Paystack for monthly/yearly, and set
   `PAYSTACK_PLAN_MONTHLY` / `PAYSTACK_PLAN_YEARLY` to their plan codes. When a
   plan code is set the checkout becomes an auto-renewing subscription and
   **Paystack charges the plan's amount** — keep the plan amount equal to the
   admin price. Leave blank for one-time charges (monthly = 31 days of Pro,
   yearly = 366 days).

## 4. Prices come from the Edutu admin

Prices/currency/promos are set in the Edutu app's **Admin → Pricing & Promos**
screen and served on `GET {EDUTU_API_URL}/mobile-control/config`. This site
fetches that same source, so the amount charged always equals what the user saw.
The `amount` in the checkout URL is **display-only and never trusted**.
`FALLBACK_*` env values are used only if the Edutu API is unreachable.

## 5. Deploy (Vercel)

1. Push this folder to its own Git repo.
2. Import it in Vercel; add every var from `.env.example` in **Project → Settings
   → Environment Variables**.
3. Add the domain **pay.edutu.org** (Vercel → Domains) and point DNS at Vercel.
4. Set `BASE_URL=https://pay.edutu.org`.
5. Update the Paystack webhook URL to the production domain.

Any Node host (Render, Fly, a container) works too — it's a standard Next.js app
(`npm run build && npm run start`, port 3001).

## 6. How grants reach the app

`useProStatus` in the app treats **`billing_entitlements`** (feature_key `pro`,
status `active`, not past `expires_at`) as authoritative and also mirrors onto
`profiles.is_pro`. This app writes both with the **service-role key** — the
client can never self-grant. After returning from checkout the app re-checks
status on foreground, and the realtime subscription flips Pro on immediately.

## Security notes / before launch

- **/account cancel** currently trusts the `uid` in the request. Add app-signed
  verification (pass a Clerk JWT and verify it) so a user can only cancel their
  own plan. See the `SECURITY TODO` in `src/app/api/account/cancel/route.ts`.
- **/admin** is guarded by `ADMIN_DASHBOARD_TOKEN` (Bearer). Use a long random
  value and prefer accessing it over a trusted network; consider putting it
  behind Vercel password protection or your SSO.
- Webhook signature is verified (HMAC-SHA512). Never disable that check.
- **App Store note:** iOS may reject redirecting to external payment for digital
  goods. This flow was chosen deliberately (Android + web + NGN pricing/promos);
  plan an Apple-IAP fallback if the iOS build gets flagged.
