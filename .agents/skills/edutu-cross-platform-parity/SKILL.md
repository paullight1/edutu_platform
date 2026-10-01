---
name: edutu-cross-platform-parity
description: "Use when Edutu changes cross web, Expo mobile, admin, shared packages, API contracts, deep links, or offline and loading-state behavior."
---

# Edutu Cross-Platform Parity

## Workflow

1. Read `agent-system/README.md` and affected manifests. Web is anchored at
   `edutu-web-app/`, Expo mobile at `edutumobile/`, and admin at `admin/`.
   Verify current dependencies; do not assume the clients share React versions,
   routing APIs, test commands, or native capabilities.
2. Read `code-review-agents/edutu-web-review/SKILL.md` for web changes and
   `code-review-agents/edutu-mobile-review/SKILL.md` for mobile changes. Use
   the shared reviewer for admin. Reuse the design system instead of restyling.
3. Map API fields, state transitions, errors, pagination, permissions, deep
   links, caches, and feature flags across affected clients and shared packages.
   Find actual shared modules before importing a guessed package or symbol.
4. Preserve existing shell/navigation and platform-appropriate interactions.
   Cover loading, empty, partial, error, retry, cancelled, unauthenticated,
   offline, and successful states. Never display success before confirmation.
5. Test stale auth, sign-out cache clearing, interrupted requests, retries,
   low-bandwidth behavior, accessibility, reduced motion, and localization.
   Browser verification does not establish native-device correctness.
6. Run each affected package's declared checks separately. Record a device or
   browser verification gap when that environment is unavailable.

## Evidence

Return a surface-by-surface contract matrix, files changed, shared dependencies,
verified states, screenshots or execution artifacts where available, and gaps.

## Stop conditions

Do not silently remove mobile behavior to match web, invent native test results,
rewrite the UI system, or move privileged business writes into a client.
An unavailable platform is NOT_RUN/BLOCKED, not a passing parity check.
