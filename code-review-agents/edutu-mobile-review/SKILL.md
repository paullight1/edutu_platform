---
name: edutu-mobile-review
description: Review Edutu’s Expo React Native mobile changes for auth, offline behavior, native integrations, performance, accessibility, privacy, and release safety.
---

# Edutu Mobile Review

Use with the shared rules in `../edutu-code-review/references/edutu-context.md`. Review mobile-relevant findings, escalating backend or billing issues when the mobile change depends on them.

## Focused checks

- Trace Expo Router protection, Clerk session/token refresh, Supabase token bridging, deep links, sign-out, and account deletion. Never trust a route param or cached identity for ownership.
- Check network flows for bounded timeouts, cancellation, retry safety, stale-cache labeling, offline queue duplication, and safe failure. Cached data must not authorize mutations or payments.
- Check AsyncStorage and logs for tokens, PII, CV contents, payment details, or unbounded sensitive data. Prefer SecureStore for secrets.
- Audit RevenueCat initialization, user identity, restore/purchase errors, test-key release guards, entitlement refresh, and the rule that only server webhooks grant durable access.
- Check push tokens, widgets, notifications, background tasks, file/document access, audio, WebViews, and native permissions for least privilege, cleanup, privacy, and platform differences.
- Check React Native performance on mid-range devices: virtualized lists, bounded images, cleaned-up effects/subscriptions, stable render inputs, and reduced-motion support.
- Check ThemeContext tokens, dark mode, high contrast, icon labels, Dynamic Type/text clipping, safe areas, keyboard behavior, localization, and Arabic RTL.
- Check release configuration (`app.config.*`, `eas.json`, entitlements, bundle IDs, OTA channels, public env vars) for secrets, debug behavior, and store rejection risks.

## Verification

Prefer narrow commands from `edutumobile/`: `npm run typecheck`, `npm run lint`, and the relevant Jest test. A passing typecheck does not prove auth, RLS, native, store, or offline correctness.
