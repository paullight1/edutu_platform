# Edutu iOS — TestFlight Deployment Guide

Project-specific guide for shipping the Edutu mobile app to TestFlight via EAS.

## Current config (verified)

- **EAS CLI:** 20.5.1, logged in as `edutu` (owner), account email `my.edutu@gmail.com`
- **Slug:** `hanaedutu` · **Owner:** `edutu` · **EAS projectId:** `97c7d577-7e08-4f3c-a199-d1ca149ebee9`
- **iOS bundle identifier:** `com.tegm.edutuios`
- **Version:** `1.0.0` · **buildNumber:** `1`
- **`appVersionSource`:** `local` (version/build come from `app.config.js`)
- **`production` profile:** real-device build (no simulator flag), `autoIncrement: true`

---

## Prerequisites (one-time)

1. **Apple Developer Program membership** — $99/yr, must be active: https://developer.apple.com/account
2. **App record in App Store Connect** — https://appstoreconnect.apple.com → Apps → **+** → New App:
   - Platform: iOS
   - Bundle ID: **`com.tegm.edutuios`** (register it first at developer.apple.com → Certificates, IDs & Profiles → Identifiers if needed)
   - SKU: anything unique (e.g. `edutu-ios`)
   - Note the generated **Apple ID (ascAppId)** number — used in `eas.json`.

---

## Step 1 — Build the iOS production binary

EAS manages signing certs and provisioning profiles for you.

```bash
cd edutumobile
eas build --platform ios --profile production
```

- Produces a real-device `.ipa` (correct for TestFlight).
- When prompted to generate an Apple Distribution Certificate / Provisioning Profile → **Yes** (let EAS manage them). Sign in with the Apple ID once.
- `autoIncrement: true` bumps the build number so it's unique.

> ⚠️ `appVersionSource` is `local`. TestFlight rejects a build number it has already seen. If a re-upload errors with "build number already used", bump `buildNumber` in `app.config.js` (`"1"` → `"2"`) and rebuild.

---

## Step 2 — Submit the build to TestFlight

After the build finishes:

```bash
eas submit --platform ios --profile production --latest
```

First run asks for your Apple ID, app-specific password (or App Store Connect API key), and the ascAppId.

Make it repeatable by filling in `eas.json` under `submit.production` (currently `{}`):

```json
"submit": {
  "production": {
    "ios": {
      "appleId": "my.edutu@gmail.com",
      "ascAppId": "PASTE_THE_APP_STORE_CONNECT_APP_ID",
      "appleTeamId": "YOUR_TEAM_ID"
    }
  }
}
```

**Recommended alternative:** an **App Store Connect API key** (no password, works in CI). `eas submit` can guide you through creating one.

**One-shot** build + submit:

```bash
eas build --platform ios --profile production --auto-submit
```

---

## Step 3 — In App Store Connect (TestFlight tab)

1. Build appears under **TestFlight** in ~5–15 min (initially "Processing").
2. Fill in **Export Compliance** (encryption question — a standard HTTPS app is typically "No" to non-exempt encryption; verify for your case).
3. **Internal testing** (≤100 team testers, no review): add testers by Apple ID email → delivered immediately.
4. **External testing** (≤10,000): requires a quick Beta App Review + test details/contact info. Usually fast.

Testers install the **TestFlight** app from the App Store, accept the invite, and receive the build.

---

## Ties into the force-update / App Control feature

- Once live on the App Store, set the **iOS store URL** in admin **App Control** to `https://apps.apple.com/app/id<ascAppId>`.
- For **TestFlight** builds, the "Update now" button should ideally point testers to the TestFlight app.
- During beta, lean on **OTA-first** (`expo-updates` on the `production` channel) so `eas update` pushes JS fixes to testers **without a new TestFlight build**.

---

## Quick reference

| Task | Command |
|------|---------|
| Build production iOS | `eas build --platform ios --profile production` |
| Submit latest build | `eas submit --platform ios --profile production --latest` |
| Build + submit | `eas build --platform ios --profile production --auto-submit` |
| Push OTA JS update | `eas update --channel production` |
| Who am I | `eas whoami` |
