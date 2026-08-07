---
name: edutu-web-review
description: Review Edutu’s React Vite web app changes for security, authorization, routing, data boundaries, performance, accessibility, PWA/Capacitor behavior, and conversion-critical correctness.
---

# Edutu Web Review

Use with `../edutu-code-review/references/edutu-context.md`. The target is `edutu-web-app/`, not the separate `edutu-web/` waitlist site unless the change crosses that boundary.

## Focused checks

- Trace Clerk auth, protected routes, redirects, token acquisition, refresh, logout, and user ownership. UI gates are not authorization.
- Treat all `VITE_*` values, localStorage, sessionStorage, URL parameters, and client bundles as public/untrusted. Flag exposed AI keys, webhook URLs, service credentials, source-map secrets, and unsafe HTML/markdown/editor rendering.
- Check data operations against the backend API boundary. If direct Supabase is retained, verify the reason, RLS assumptions, selected columns, user scoping, and mutation authorization.
- Check React effects and state for stale closures, duplicate fetches, races after navigation, abort handling, optimistic rollback, and cross-tab/visibility billing refresh.
- Check route metadata, canonical URLs, sitemap/OG generation, public/private separation, 404s, deep links, PWA cache invalidation, and Capacitor Android back/deep-link behavior.
- Check bundle growth, route code splitting, provider work, expensive lists, image dimensions, third-party scripts, and unnecessary Supabase queries.
- Check responsive behavior, keyboard focus, semantic controls, screen-reader names, contrast, reduced motion, localization, RTL, loading/empty/error states, and safe checkout return flows.
- Do not weaken the established indigo/navy design tokens or introduce generic dashboard patterns as a fix.

## Verification

Prefer `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build` from `edutu-web-app/`, choosing the narrowest useful subset first. Inspect generated artifacts only when SEO, PWA, or bundle behavior changes.
