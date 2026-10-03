---
name: edutu-web-engineering
description: Build or change Edutu's React/Vite learner web app, PWA/Capacitor shell, or React/Vite admin dashboard. Use for web UI, routing, state, accessibility, and client API integration.
---

# Edutu Web Engineering

Identify whether the task belongs to `edutu-web-app/` or `admin/`; they are separate Vite applications with separate package scripts. Read the current component, route, service, styles, tests, and package manifest before editing.

## Edutu constraints

- The web learner app includes public opportunity discovery and an authenticated workspace for coach, CV, documents, saved searches, goals, copilot, wallet, community, events, profiles, and billing. Confirm a route and feature's current state in code instead of inferring from a marketing page.
- Use the API for privileged business logic. Direct Supabase calls require an explicit user-owned/RLS-safe access path. Never place service credentials in browser code; `VITE_*` configuration is public.
- Preserve shared design tokens and patterns, responsive behavior, keyboard/screen-reader access, localization/RTL, reduced motion, and clear loading/error/empty states.
- Treat PWA and Capacitor behavior as related but distinct runtimes. Verify native-only assumptions before changing plugin or platform behavior.
- Keep API contracts typed and coordinate breaking/behavioral changes with backend and mobile owners.
- Follow existing product voice and visual patterns unless redesign is requested. Avoid adding dependencies when current app primitives suffice.

## Verification

Use scripts in the relevant package manifest. Typical web app checks are `npm run typecheck`, `npm run test`, and `npm run build`; admin has its own `npm run build` and `npm run test`. Report only checks actually executed.

## References

- `docs/ARCHITECTURE.md`
- `docs/API.md`
- `edutu-web-app/package.json`
- `admin/package.json`
