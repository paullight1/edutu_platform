---
name: edutu-mobile-engineering
description: Build, debug, or review Edutu's Expo and React Native app, including Expo Router screens, native capabilities, offline behavior, notifications, widgets, and mobile releases.
---

# Edutu Mobile Engineering

Mobile code is in `edutumobile/`, a separate repository boundary. Read its `AGENTS.md` if present, `README.md`, relevant route/service, and package manifest. The official Expo plugin is installed in Codex; consult its Expo skills and current Expo docs for version-sensitive APIs.

## Edutu constraints

- Use Expo Router's file routes and existing shared/core packages; keep platform-specific code explicit.
- Preserve Clerk auth and the existing token bridge. Use the NestJS API for privileged operations; direct Supabase access must be mobile-owned or explicitly shared, RLS-protected, and authenticated with the configured Clerk token bridge.
- Respect offline/cache freshness, bounded retries, cancellation, idempotency, low/mid-range device performance, secure storage, deep links, push permissions, and accessible native controls.
- Verify the actual installed Expo/React Native versions in `edutumobile/package.json` before relying on guides or SDK assumptions. Do not trust stale version numbers in historical docs.
- For native modules, config plugins, widgets, or push/voice changes, identify platform-specific build and runtime requirements before editing. Coordinate backend contract changes with the API owner.
- Keep mobile-specific migrations and edge functions within the mobile boundary and document cross-repository contract effects.

## Verification

Use `edutumobile/package.json` scripts. For native changes, identify which iOS/Android device or build checks are necessary and clearly state if they could not be run.

## References

- `edutumobile/README.md`
- `edutumobile/docs/MOBILE_ARCHITECTURE.md`
- `docs/ARCHITECTURE.md`
