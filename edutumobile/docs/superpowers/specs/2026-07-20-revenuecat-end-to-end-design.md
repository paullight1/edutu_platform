# RevenueCat End-to-End for edutumobile — Design

Date: 2026-07-20

## Problem

The mobile paywall (`app/(app)/paywall.tsx`) shows "Subscriptions are temporarily
unavailable." The app code is already fully wired for RevenueCat IAP on device and
Paystack web checkout on web. The paywall is dead only because
`EXPO_PUBLIC_REVENUECAT_API_KEY_IOS/ANDROID` are empty → `initRevenueCat` returns
false → `getOfferings()` yields nothing → the "unavailable" branch renders.

The RevenueCat project (`edutu`, `projdb794563`) is an untouched demo: a single
**Test Store** app (`appe18594bb71`), a stray `edutu Pro` entitlement whose lookup
key has a space, and demo `weekly`/`monthly`/`yearly`/`lifetime` products.

No App Store Connect / Play Console products exist yet. So we make the system work
today against RevenueCat's **Test Store**; real store products + production keys are
a later, code-free key swap.

## Decisions

- **Products:** Weekly / Monthly / Yearly subscriptions only. Drop `lifetime`.
- **Prices (NGN, matching the live paywall screenshot):** ₦2,000 weekly,
  ₦6,500 monthly, ₦60,000 yearly.
- **Server:** wire the RevenueCat → Supabase webhook so Pro is granted server-side
  (`profiles.is_pro`, `billing_entitlements`), not just on-device.
- **Key safety:** commit the Test Store key to `.env`, and add a guard in
  `payments.ts` that refuses a `test_`-prefixed key in production/release builds
  (so a test key can never ship to the stores; falls back to web checkout).

## Part 1 — RevenueCat configuration (via MCP)

1. **Entitlement `pro`** — create with `lookup_key: pro` (the SDK keys
   `entitlements.active['pro']` and the webhook checks `entitlement_ids.includes('pro')`;
   the existing `edutu Pro` key does not match). Attach the three subscription products.
2. **Prices** — set NGN prices on the Test Store `weekly`/`monthly`/`yearly` products
   via `create-product-prices` (Test-Store-only capability).
3. **Offering `default`** — keep `$rc_weekly` / `$rc_monthly` / `$rc_annual`; remove the
   `$rc_lifetime` package (subs-only).

## Part 2 — Mobile code

4. **Yearly-match bug** — `paywall.tsx` `iapPackageForPlan` matches yearly with
   `pkg.identifier.includes('year')`, but the standard annual package identifier is
   `$rc_annual`, which does NOT contain "year" → Yearly card is unbuyable. Fix: match
   `year` OR `annual`.
5. **Test Store key** — set `EXPO_PUBLIC_REVENUECAT_API_KEY_IOS` and
   `EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID` to `test_kWdHxFDhIIfWPIlBwKzEgnzvqeT`
   (Test Store uses one key cross-platform). Document the production swap in
   `.env.example`.
6. **Production guard** — in `payments.ts`, if the resolved key starts with `test_`
   and the build is a production/release build, treat RevenueCat as unconfigured
   (paywall behaves as it does today rather than shipping a test key live).

## Part 3 — Server (webhook)

7. **Deploy** `supabase/functions/revenuecat-webhook` to project `sioxocmrjmdevsdlzjns`.
8. **Secret** — generate `REVENUECAT_WEBHOOK_SECRET`; the user sets it via
   `supabase secrets set` (no MCP tool for secrets). The webhook validates the static
   `Authorization` header timing-safely.
9. **Register webhook** in RevenueCat (MCP) → URL
   `https://sioxocmrjmdevsdlzjns.supabase.co/functions/v1/revenuecat-webhook`,
   `Authorization: <same secret>`, all subscription + non-renewing events.

## Verification

- `npm run typecheck` (mobile).
- Existing paywall test in `__tests__/mobileEngagementRoutes.test.tsx`.
- Live Test Store purchase: offerings load, each card (incl. Yearly) is buyable, and
  the webhook flips `profiles.is_pro` true.

## Out of scope (handoff checklist)

- App Store Connect / Play Console product creation.
- Sandbox / license tester accounts.
- Production `appl_` / `goog_` key swap once real store products approve.
- Setting the Supabase secret (one user-run CLI command).
