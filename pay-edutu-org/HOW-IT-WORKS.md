# How Edutu payments work

End-to-end reference for the Edutu Pro billing system: the mobile app, the
`pay.edutu.org` checkout, Paystack, and Supabase.

---

## 1. The pieces

| Piece | Where | Job |
| --- | --- | --- |
| **Paywall** | Edutu mobile app (`app/(app)/paywall.tsx`) | Shows admin-set price/promo; opens the hosted checkout. |
| **Admin → Pricing & Promos** | Edutu mobile app (`app/admin/pricing.tsx`) | Sets currency, prices, bonanzas; links to the revenue dashboard. |
| **Pricing config** | Edutu backend (`admin_settings.pricing` → `GET /mobile-control/config`) | One source of truth for prices, read by both the paywall and `pay.edutu.org`. |
| **pay.edutu.org** | This repo (Next.js) | Charges via Paystack; grants Pro; self-service account page; admin revenue dashboard. |
| **Paystack** | External | Processes cards, runs subscriptions, sends webhooks. |
| **Supabase** | Edutu database | `billing_entitlements` (what the app reads), `payments` (ledger), `billing_subscriptions`. |

---

## 2. The purchase flow

```
1. User taps “Upgrade” in the app.
2. Paywall reads the admin price from /mobile-control/config and opens:
      https://pay.edutu.org/checkout?uid&email&plan&currency&amount&ref&platform
3. /checkout RE-READS the real price from the same admin config (never trusts the
   URL amount), creates a Paystack transaction, and redirects to Paystack’s card page.
4. User pays on Paystack’s hosted page (3-D Secure, bank apps, etc.).
5. Two things happen in parallel:
      a) Paystack redirects the browser to /return → verify → GRANT Pro (instant UX)
      b) Paystack calls /api/webhook (signed) → verify → GRANT Pro (authoritative)
   Both are idempotent (deduped on the payment reference), so a double grant is a no-op.
6. Pro is written to billing_entitlements (+ profiles mirror) via the service role.
7. /return deep-links back: edutu://paywall?status=success
8. The app re-checks Pro on foreground; its realtime subscription on
   billing_entitlements flips Pro on immediately.
```

**Why grant in two places?** `/return` gives the paying user an instant unlock;
the webhook guarantees the grant even if the user closes the browser before the
redirect. Idempotency keeps them from conflicting.

**Why the amount is safe:** `/checkout` ignores the `amount` in the URL and
recomputes it from the admin config server-side, so a tampered link can’t buy Pro
for ₦1.

---

## 3. How a grant reaches the app

`useProStatus` (mobile) considers a user Pro if **any** of these is true:

- `billing_entitlements` has a row: `feature_key='pro'`, `status='active'`, and
  `expires_at` in the future — **keyed by the raw Clerk user id**. ← primary
- `profiles.is_pro = true` (and not past `pro_expires_at`). ← mirror
- RevenueCat says so (only relevant if you keep native IAP).

`pay.edutu.org` writes the first two with the **service-role key**. The mobile
client can never write them — a patched client cannot self-grant Pro.

---

## 4. Subscriptions vs one-time

- **One-time (default):** no Paystack Plan configured → a successful charge grants
  a fixed period (monthly = 31 days, yearly = 366 days). No auto-renew.
- **Recurring:** set `PAYSTACK_PLAN_MONTHLY` / `PAYSTACK_PLAN_YEARLY` to Paystack
  Plan codes. Checkout then creates a subscription; the webhook stores the
  subscription (`billing_subscriptions`) and re-grants on each renewal. Keep the
  Paystack Plan amount equal to the admin price.

Cancellation: `/account` → **Cancel auto-renew** → `/api/account/cancel` disables
the Paystack subscription; Pro stays active until `expires_at`.

---

## 5. Security model

- **Webhook** is verified with Paystack’s HMAC-SHA512 signature over the raw body.
- **Grants** are service-role only (server-to-server); never from the app.
- **Account self-service** proves ownership: the app passes a Clerk token to
  `/account/start`, which verifies it against Clerk’s JWKS and sets a short-lived,
  HMAC-signed session cookie. `/api/account/cancel` requires that cookie.
  *(If Clerk/session env is unset, it falls back to trusting the uid so the flow
  works before you wire it up — configure `CLERK_JWKS_URL` +
  `ACCOUNT_SESSION_SECRET` before launch.)*
- **Admin** (`/admin`, `/api/admin/*`) is gated by `ADMIN_DASHBOARD_TOKEN`.

---

## 6. Admin: seeing money & awarding users

- **In the app:** Admin → Pricing & Promos → **Revenue & payments** opens
  `pay.edutu.org/admin`.
- **`/admin` dashboard:** active-Pro count, revenue by currency, recent payments,
  and a form to **grant free Pro / bonanzas** or **revoke** for any user id.
- **`GET /api/admin/stats`** (Bearer token): machine-readable revenue snapshot —
  `{ activePro, payments: { total, last30Days }, revenue: { allTime, last30Days } }`.
- **Bonanza options:** run a promo price for everyone (admin Pricing screen), or
  grant specific users free Pro for N days (`/admin` grant form).

---

## 7. Data model (`sql/schema.sql`)

- **`billing_entitlements`** — the authoritative Pro flag the app reads. Unique on
  `(user_id, feature_key)` so grants upsert.
- **`payments`** — one row per successful charge (and admin grant). Unique on
  `(provider, reference)` → idempotent webhooks. This is your revenue ledger.
- **`billing_subscriptions`** — recurring subscriptions, for cancel/renewal.

---

## 8. Deploy checklist

1. `sql/schema.sql` → run in Supabase.
2. Deploy this repo (Vercel), add all env vars, point `pay.edutu.org` DNS at it.
3. Paystack: set keys + webhook `https://pay.edutu.org/api/webhook` (+ Plan codes
   if recurring).
4. Redeploy the Edutu backend so `admin_settings.pricing` is served.
5. Set prices in the app: Admin → Pricing & Promos.
6. Configure `CLERK_JWKS_URL` + `ACCOUNT_SESSION_SECRET` to lock down cancel.
7. Test end-to-end with Paystack test cards, then switch to live keys.

---

## 9. Env quick reference

See [`.env.example`](./.env.example). Never commit real secrets; the
`SUPABASE_SERVICE_ROLE_KEY` and `PAYSTACK_SECRET_KEY` are server-only.
