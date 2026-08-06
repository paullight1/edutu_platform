# Edutu Mobile - RevenueCat Payment Setup Guide

## Overview
This guide walks you through setting up RevenueCat for in-app purchases and subscriptions in the Edutu mobile app.

---

## ⚠️ CURRENT STATE (verified 2026-08-03) — IAP IS NOT LIVE

Checked against the RevenueCat account and the EAS `production` environment:

- The `edutu` project has **exactly one app: "Test Store"** (`appe18594bb71`). There is **no App Store app and no Play Store app**.
- Its 4 products (`monthly`, `yearly`, `weekly`, `lifetime`) are **Test Store SKUs**, not real store products.
- EAS `production` ships `EXPO_PUBLIC_REVENUECAT_API_KEY_IOS/ANDROID = test_…`.
- `packages/core/src/services/payments.ts` **deliberately blanks any `test_` key when `!__DEV__`**, so a release build behaves as "RevenueCat not configured".

**Consequence:** a production build renders the paywall with a permanently disabled CTA and the line
*"Subscriptions are temporarily unavailable."* — no crash, but nothing is purchasable. That is an
App Store Guideline 2.1 rejection risk and zero revenue on either platform.

### The exact sequence to make it real

Steps 1–5 need your Apple Developer and Google Play accounts; nothing in the repo can do them.

1. **App Store Connect** — create the app under bundle id `com.tegm.edutuios`. Note the numeric
   Apple ID it issues; it is also the value for `EXPO_PUBLIC_IOS_APP_STORE_ID` (used by "Rate Edutu").
2. **Play Console** — create the app under package `com.edutu.com`.
3. **Create the subscription products in BOTH consoles.** The paywall offers **three** plans —
   weekly, monthly, yearly — so create all three, not just the two in the Phase 2 tables below.
4. **RevenueCat → Project Settings → Apps** — add an **App Store** app (bundle id above, upload the
   App Store Connect API key / shared secret) and a **Play Store** app (package above, upload the
   Play service-account JSON). This is what actually creates the `appl_` and `goog_` API keys.
5. **RevenueCat → Products** — register the real store product ids for each app, attach them to the
   `pro` entitlement, and add them to the `default` offering as packages.

   **Package identifiers matter more than product ids here.** `app/(app)/paywall.tsx` picks a
   package by substring: `week` → Weekly card, `month` → Monthly, `year` **or** `annual` → Yearly.
   RevenueCat's standard `$rc_weekly` / `$rc_monthly` / `$rc_annual` all satisfy this. A custom
   identifier that contains none of those substrings leaves that card unbuyable.

6. **Move the keys into EAS** (not just `.env` — the build reads EAS):
   ```bash
   npx eas env:delete --variable-name EXPO_PUBLIC_REVENUECAT_API_KEY_IOS --environment production
   npx eas env:delete --variable-name EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID --environment production
   npx eas env:create --environment production --name EXPO_PUBLIC_REVENUECAT_API_KEY_IOS --value appl_… --visibility sensitive
   npx eas env:create --environment production --name EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID --value goog_… --visibility sensitive
   npx eas env:create --environment production --name EXPO_PUBLIC_IOS_APP_STORE_ID --value 1234567890
   ```
7. **Verify before submitting.** Build the `production-apk` profile, install it on a real device
   with a Play licence-tester account, and confirm the paywall shows real prices and the CTA reads
   *"Start Monthly — …"* rather than the unavailable line. A `test_` key still in place shows up
   exactly as that unavailable line.

Keep the Test Store app: it is what makes local development work without store setup.

---

## Prerequisites

1. **RevenueCat Account** — Free at https://app.revenuecat.com
2. **Apple Developer Account** ($99/year) — For iOS App Store products
3. **Google Play Console Account** ($25 one-time) — For Android Play Store products
4. **Supabase Project** — Already configured

---

## Phase 1: RevenueCat Project Setup

### 1. Create Project
1. Go to https://app.revenuecat.com
2. Click **New Project**
3. Name it: `Edutu Mobile`
4. Select platform: **iOS** and **Android**

### 2. Add Apps
1. Go to **Project Settings** → **Apps**
2. Add iOS app with Bundle ID: `com.tegm.edutuios` (from app.config.js)
3. Add Android app with Package Name: `com.edutu.com` (from app.config.js)

### 3. Get API Keys
1. Go to **Project Settings** → **API Keys**
2. Copy the **Apple API Key** → Set as `EXPO_PUBLIC_REVENUECAT_API_KEY_IOS` in `.env`
3. Copy the **Google Play API Key** → Set as `EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID` in `.env`

---

## Phase 2: App Store Configuration

### iOS (App Store Connect)

1. **Enable In-App Purchase Capability**
   - Go to https://developer.apple.com/account
   - Select your app → Signing & Capabilities → Add "In-App Purchase"

2. **Create Subscription Group**
   - Go to https://appstoreconnect.apple.com
   - Select your app → **Subscriptions** → **Subscription Groups**
   - Create group: `Edutu Pro`

3. **Create Products**

   | Product ID | Type | Price | Description |
   |------------|------|-------|-------------|
   | `pro_monthly` | Auto-Renewable | $9.99 | Monthly Pro subscription |
   | `pro_yearly` | Auto-Renewable | $71.99 | Yearly Pro subscription (save 40%) |

4. **Create Non-Renewing Products (Credits)**

   | Product ID | Type | Price | Credits |
   |------------|------|-------|---------|
   | `credits_small` | Non-Renewing | $4.99 | 50 credits |
   | `credits_medium` | Non-Renewing | $14.99 | 200 credits |
   | `credits_large` | Non-Renewing | $29.99 | 500 credits |
   | `credits_xlarge` | Non-Renewing | $49.99 | 1000 credits |

5. **Submit for Review** — Products must be approved before they work in production

### Android (Google Play Console)

1. **Go to Google Play Console**
   - https://play.google.com/console

2. **Create Subscriptions**

   | Product ID | Base Plan | Price |
   |------------|-----------|-------|
   | `pro_monthly` | Monthly | $9.99 |
   | `pro_yearly` | Yearly | $71.99 |

3. **Create One-Time Products (Credits)**

   | Product ID | Price | Credits |
   |------------|-------|---------|
   | `credits_small` | $4.99 | 50 |
   | `credits_medium` | $14.99 | 200 |
   | `credits_large` | $29.99 | 500 |
   | `credits_xlarge` | $49.99 | 1000 |

---

## Phase 3: RevenueCat Dashboard Configuration

### 1. Create Entitlements
1. Go to **Entitlements** in RevenueCat dashboard
2. Create:
   - `pro` — For Pro subscription access
   - `credits` — For credit purchases

### 2. Configure Offerings
1. Go to **Offerings** → Create `default` offering
2. Add subscription packages:
   - `pro_monthly` → Link to iOS/Android product
   - `pro_yearly` → Link to iOS/Android product
3. Add non-subscription packages:
   - `credits_small`, `credits_medium`, `credits_large`, `credits_xlarge`

### 3. Test in Sandbox
1. Add your Apple ID as a **Sandbox Tester** in App Store Connect
2. Add your Google account as a **License Tester** in Play Console
3. Build the app in development mode — purchases will use sandbox environment

---

## Phase 4: Deploy Webhook

### 1. Deploy Edge Function
```bash
supabase functions deploy revenuecat-webhook
```

### 2. Set Environment Variables
```bash
supabase secrets set REVENUECAT_WEBHOOK_SECRET=your-generated-secret
```

### 3. Configure Webhook in RevenueCat
1. Go to **Project Settings** → **Webhooks**
2. Add new webhook:
   - **URL**: `https://<your-project-ref>.supabase.co/functions/v1/revenuecat-webhook`
   - **Secret**: The same secret you set above
   - **Events**: Check all events (INITIAL_PURCHASE, RENEWAL, CANCELLATION, EXPIRATION, NON_RENEWING_PURCHASE)

---

## Phase 5: Testing

### 1. Test Subscription Flow
1. Open the app → Navigate to Wallet → Tap "Upgrade to Pro"
2. Select monthly or yearly plan
3. Complete sandbox purchase
4. Verify Pro status appears in UI
5. Check Supabase `subscriptions` table for new record

### 2. Test Credit Purchase Flow
1. Navigate to Wallet → Tap "Buy Credits"
2. Select a credit package
3. Complete sandbox purchase
4. Verify credits balance increases
5. Check `payment_transactions` table for new record

### 3. Test AI Roadmap Gating
1. Ensure you have fewer than 10 credits and are not Pro
2. Open any opportunity → Tap "Win This Opportunity"
3. Should see "Insufficient Credits" alert with "Get Credits" button
4. Buy credits → Try again → Should work and deduct 10 credits

### 4. Test Restore Purchases
1. Make a purchase on one device
2. Install app on another device with same account
3. Tap refresh icon in paywall → Should restore subscription

---

## Phase 6: Production Deployment

### 1. iOS App Store
- Submit app for review with notes about in-app purchases
- Ensure products are approved in App Store Connect

### 2. Google Play Store
- Submit app for review
- Ensure subscriptions are active in Play Console

### 3. Switch to Production
- RevenueCat automatically detects environment based on app store receipts
- No code changes needed

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Products not showing | Check product IDs match exactly in RevenueCat and stores |
| Purchase fails in sandbox | Ensure sandbox tester account is added correctly |
| Webhook not firing | Check Supabase function logs: `supabase functions log revenuecat-webhook` |
| Credits not added | Check `payment_transactions` table for failed status |
| Pro status not syncing | Run `supabase db reset` and re-run migrations |

---

## Environment Variables Reference

```env
# RevenueCat API Keys (from Project Settings → API Keys)
EXPO_PUBLIC_REVENUECAT_API_KEY_IOS=appl_xxxxxxxxxxxxxxxx
EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID=goog_xxxxxxxxxxxxxxxx

# Webhook Secret (generated by you, must match RevenueCat webhook config)
REVENUECAT_WEBHOOK_SECRET=your-generated-webhook-secret
```

---

## Product ID Reference

Update these in `packages/core/src/services/payments.ts` if you change product IDs:

```typescript
export const PRODUCTS = {
  PRO_MONTHLY: 'pro_monthly',
  PRO_YEARLY: 'pro_yearly',
  CREDITS_SMALL: 'credits_small',
  CREDITS_MEDIUM: 'credits_medium',
  CREDITS_LARGE: 'credits_large',
  CREDITS_XLARGE: 'credits_xlarge',
} as const;
```
