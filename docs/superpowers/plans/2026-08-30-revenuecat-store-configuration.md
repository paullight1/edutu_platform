# RevenueCat Store Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the Apple, Google Play, and RevenueCat subscription catalogs for Lite, Pro, and Scholar without placing credentials in the repository.

**Architecture:** Apple has one nine-product subscription group; Google has three subscriptions with three base plans each; RevenueCat exposes one current offering with nine cross-platform custom packages. A sanitized inventory and evidence log are the handoff contract for backend, mobile, and release work.

**Tech Stack:** App Store Connect, Google Play Console, RevenueCat, Expo EAS, Markdown operational records

**Spec:** `docs/superpowers/specs/2026-08-30-revenuecat-iap-and-store-pricing-design.md`

## Global Constraints

- Complete Tasks 1–6 before enabling either NestJS production webhook.
- Never commit private keys, service-account JSON, RevenueCat secret keys, webhook secrets, recovery codes, banking records, tax records, or screenshots containing them.
- Permanent app identifiers are `com.tegm.edutuios` and `com.edutu.com`.
- Product IDs and package IDs must match this plan exactly; correct mismatches in the console before writing compatibility code.
- There are no trials, introductory offers, season passes, or native credit packs in this launch.
- Record every console object ID that downstream code needs in the sanitized inventory.

---

### Task 1: Create the sanitized configuration and evidence records

**Files:**
- Create: `docs/operations/revenuecat-iap-config-inventory.md`
- Create: `docs/verification/revenuecat-iap-launch-evidence.md`

**Interfaces:**

```md
| Environment | Platform | App ID | Public SDK key variable | Status |
| --- | --- | --- | --- | --- |
| production | Apple | rc_app_… | EXPO_PUBLIC_REVENUECAT_API_KEY_IOS | pending |
| production | Google | rc_app_… | EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID | pending |

| Package | Entitlement | Apple product | Google product | Test Store product |
| --- | --- | --- | --- | --- |
| lite_weekly | lite | edutu_lite_weekly_v1 | edutu_lite_v1:weekly-auto | edutu_lite_weekly_test_v1 |
```

- [ ] Create the inventory with rows for all nine package mappings, the App Store subscription-group ID, the three Play subscription IDs, RevenueCat project/app/offering IDs, and sandbox/production webhook integration IDs. Store masked public-key prefixes only.
- [ ] Create the evidence document with sections for owner, date, device/build, expected result, actual result, sanitized evidence link, defect link, and approval for every gate in Task 7.
- [ ] Run `rg -n "PRIVATE KEY|service_account|secret|Bearer |test_[A-Za-z0-9]{8}|appl_[A-Za-z0-9]{8}|goog_[A-Za-z0-9]{8}" docs/operations/revenuecat-iap-config-inventory.md docs/verification/revenuecat-iap-launch-evidence.md` and confirm it prints no credential material.
- [ ] Commit only these files: `git add docs/operations/revenuecat-iap-config-inventory.md docs/verification/revenuecat-iap-launch-evidence.md && git commit -m "docs: add IAP configuration records"`.

### Task 2: Enroll the organization and create both app records

**Files:**
- Modify: `docs/operations/revenuecat-iap-config-inventory.md`
- Modify: `docs/verification/revenuecat-iap-launch-evidence.md`

**Interfaces:**

```text
Apple bundle ID: com.tegm.edutuios
Google package name: com.edutu.com
Account owner: Edutu registered organization
```

- [ ] Complete Apple Developer organization enrollment using Edutu's legal name and D-U-N-S identity; record the non-secret Team ID and the verified agreements/tax/banking status.
- [ ] Complete Google Play organization verification, payments profile, developer contact, recovery owners, and administrator access; record the public Developer Account ID.
- [ ] Create the App Store Connect app named `Edutu` with bundle ID `com.tegm.edutuios`; do not create a substitute bundle ID if the record is unavailable—resolve ownership first.
- [ ] Create the Google Play app named `Edutu` with package `com.edutu.com`; upload an internal-track AAB from the actual Expo project so Play activates subscription tooling.
- [ ] Add at least two named administrators and verify recovery access without recording recovery codes.
- [ ] Record sanitized screenshots/links and set the two app-record rows to `verified`.
- [ ] Commit the records: `git add docs/operations/revenuecat-iap-config-inventory.md docs/verification/revenuecat-iap-launch-evidence.md && git commit -m "docs: verify IAP organization accounts"`.

### Task 3: Build the App Store subscription catalog

**Files:**
- Modify: `docs/operations/revenuecat-iap-config-inventory.md`
- Modify: `docs/verification/revenuecat-iap-launch-evidence.md`

**Interfaces:**

| Level | Tier | Products |
| ---: | --- | --- |
| 1 | Scholar | `edutu_scholar_weekly_v1`, `edutu_scholar_monthly_v1`, `edutu_scholar_yearly_v1` |
| 2 | Pro | `edutu_pro_weekly_v1`, `edutu_pro_monthly_v1`, `edutu_pro_yearly_v1` |
| 3 | Lite | `edutu_lite_weekly_v1`, `edutu_lite_monthly_v1`, `edutu_lite_yearly_v1` |

- [ ] Create the `Edutu Membership` auto-renewable subscription group and record its App Store Connect ID.
- [ ] Create all nine products with the exact identifiers above and weekly, one-month, or one-year duration; add review names, localized display names, descriptions, and required review metadata.
- [ ] Assign Scholar to level 1, Pro to level 2, and Lite to level 3; keep all cadences for a tier at the same level.
- [ ] Set US price points nearest to the approved anchors and record both the requested anchor and exact Apple price point. If no exact match exists, stop that row in `needs_decision`; do not silently round.
- [ ] Confirm no free trial, introductory offer, promotional offer, or win-back offer is attached.
- [ ] Enable billing grace period for production and sandbox, selecting 16 days and all paid-to-paid renewals; record that weekly renewals are store-limited to six days.
- [ ] Confirm all nine product states are at least `Ready to Submit`, then record the state and price-point ID for each row.
- [ ] Commit the sanitized catalog record: `git add docs/operations/revenuecat-iap-config-inventory.md docs/verification/revenuecat-iap-launch-evidence.md && git commit -m "docs: record App Store subscription catalog"`.

### Task 4: Build the Google Play subscription catalog and credentials

**Files:**
- Modify: `docs/operations/revenuecat-iap-config-inventory.md`
- Modify: `docs/verification/revenuecat-iap-launch-evidence.md`

**Interfaces:**

```text
edutu_lite_v1:{weekly-auto,monthly-auto,yearly-auto}
edutu_pro_v1:{weekly-auto,monthly-auto,yearly-auto}
edutu_scholar_v1:{weekly-auto,monthly-auto,yearly-auto}
```

- [ ] Create the three subscriptions and nine auto-renewing base plans with the exact identifiers above.
- [ ] Configure the base-plan periods as `P1W`, `P1M`, and `P1Y`, set the approved USD anchors, and accept/store-review the resulting regional price equalization.
- [ ] Enable grace period on every base plan and leave Play's automatic account hold enabled; do not hardcode its calculated duration in Edutu records.
- [ ] Confirm no free trial or offer tags are attached and all base plans are active.
- [ ] Create a least-privileged service account for RevenueCat subscription validation and a separate least-privileged publisher identity for the later price-publisher backend. Grant only the documented app-scoped permissions.
- [ ] Store credentials in the approved secret manager, never the repository, and start the RevenueCat credential-propagation wait immediately.
- [ ] Configure license testers and the internal test track, then record non-secret service-account emails, role names, and base-plan states.
- [ ] Commit the sanitized catalog record: `git add docs/operations/revenuecat-iap-config-inventory.md docs/verification/revenuecat-iap-launch-evidence.md && git commit -m "docs: record Play subscription catalog"`.

### Task 5: Configure RevenueCat apps, entitlements, packages, and identity

**Files:**
- Modify: `docs/operations/revenuecat-iap-config-inventory.md`
- Modify: `docs/verification/revenuecat-iap-launch-evidence.md`

**Interfaces:**

```text
Offering: edutu_mobile_v1 (current)
Entitlements: lite, pro, scholar
Packages: {lite,pro,scholar}_{weekly,monthly,yearly}
Restore behavior: Transfer to new App User ID
```

- [ ] Add the Apple app `com.tegm.edutuios` and Google app `com.edutu.com` to the existing Edutu RevenueCat project; retain the Test Store app.
- [ ] Import all real store products and create nine Test Store subscription products with the same cadences and tier entitlement mapping.
- [ ] Create or verify the exact entitlements `lite`, `pro`, and `scholar`; attach each product only to its own tier.
- [ ] Create `edutu_mobile_v1`, mark it current, and create the nine exact custom package identifiers. Attach one Apple, one Play, and one Test Store product to every package.
- [ ] Set restore behavior to `Transfer to new App User ID` and record the policy in the inventory.
- [ ] Use RevenueCat's product diagnostics to verify that all 27 package-product associations resolve and that Google product identifiers include the base-plan suffix.
- [ ] Record RevenueCat project, app, offering, entitlement, and package IDs plus masked `appl_…`, `goog_…`, and `test_…` key prefixes.
- [ ] Commit the sanitized record: `git add docs/operations/revenuecat-iap-config-inventory.md docs/verification/revenuecat-iap-launch-evidence.md && git commit -m "docs: record RevenueCat catalog"`.

### Task 6: Configure isolated webhooks and EAS public keys

**Files:**
- Modify: `edutumobile/eas.json`
- Modify: `edutumobile/.env.example`
- Modify: `backend/services/services/api/.env.example`
- Modify: `docs/operations/revenuecat-iap-config-inventory.md`

**Interfaces:**

```text
POST /billing/webhooks/revenuecat/sandbox
POST /billing/webhooks/revenuecat/production
EXPO_PUBLIC_REVENUECAT_API_KEY_IOS=appl_…
EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID=goog_…
```

- [ ] First run `npm test -- --runInBand src/billing/providers/revenuecat/revenuecat-webhook.verifier.spec.ts` from `backend/services/services/api` and confirm the existing verifier suite passes before console cutover.
- [ ] After the backend plan deploys, create distinct sandbox and production RevenueCat webhook integrations using separate high-entropy Authorization and HMAC secrets stored only in the deployment secret manager.
- [ ] Configure environment filters, explicit app allowlists, and the environment-specific endpoint; send a RevenueCat `TEST` event and record its inbox event ID.
- [ ] Put `test_…` only in EAS development/test profiles and `appl_…`/`goog_…` only in store-signed preview/production profiles. Do not store the actual values in `eas.json` or `.env.example`; reference EAS secret names.
- [ ] Add example variable names and comments that distinguish public SDK keys from server secrets.
- [ ] Run `cd edutumobile && npx expo config --type public` and confirm the bundle/package identifiers and absence of server credentials.
- [ ] Commit only example/configuration references: `git add edutumobile/eas.json edutumobile/.env.example backend/services/services/api/.env.example docs/operations/revenuecat-iap-config-inventory.md && git commit -m "chore: document RevenueCat runtime configuration"`.

### Task 7: Execute store-side prelaunch verification

**Files:**
- Modify: `docs/verification/revenuecat-iap-launch-evidence.md`

**Interfaces:**

```text
Gate result: PASS | FAIL | BLOCKED
Required dimensions: platform × tier × cadence × lifecycle
```

- [ ] Buy all nine packages in RevenueCat Test Store and confirm the package, entitlement, and app-user identity recorded by RevenueCat.
- [ ] On a physical iOS sandbox/TestFlight device, buy Lite/Pro/Scholar across weekly/monthly/yearly test cases; repeat on a Play license-tester device using an internal-track signed AAB.
- [ ] Exercise upgrade, deferred downgrade, cadence change, cancellation, uncancellation, renewal, grace, account hold/pause where supported, expiration, refund, refund reversal, restore, and cross-account transfer.
- [ ] Verify the platform purchase sheet amount exactly matches the app's displayed localized `priceString` for every purchase.
- [ ] Record PASS/FAIL evidence for every case, link defects, and leave production launch `BLOCKED` while any required case is unverified.
- [ ] Commit the evidence without secrets or customer data: `git add docs/verification/revenuecat-iap-launch-evidence.md && git commit -m "test: record native subscription verification"`.

## Completion Gate

- [ ] Both organization accounts and all agreements are active.
- [ ] All nine Apple products and nine Google base plans exist with exact identifiers.
- [ ] All nine RevenueCat packages resolve across Apple, Google, and Test Store.
- [ ] Sandbox and production webhooks have isolated secrets and recorded TEST deliveries.
- [ ] Public SDK keys are injected by EAS environment; no secret credential is bundled or committed.
- [ ] The sanitized inventory is complete and every launch-evidence row has an owner.
