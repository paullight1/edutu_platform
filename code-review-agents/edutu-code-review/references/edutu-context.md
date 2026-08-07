# Edutu review context

Edutu helps primarily African users aged 17–28 discover scholarships, internships, and fellowships, assess fit, plan applications, and receive AI coaching. It favors speed, clarity, credibility, and short task-driven sessions; unstable connections and mid-range devices are normal.

## Workspace map

- `edutumobile/`: Expo Router React Native app, Clerk Expo, Supabase token bridge, offline cache, RevenueCat, native widgets.
- `edutu-web-app/`: React/Vite/Capacitor/PWA user app, Clerk React, browser routing, web Paystack checkout.
- `backend/services/services/api/`: NestJS API, auth verification, business logic, AI routing, billing, admin, and scraper controls.
- `supabase/` and `edutumobile/supabase/`: migrations and edge functions; verify ownership before changing either.
- `admin/`: operational React/Vite dashboard, also subject to the backend-boundary rule.

## Trust model

Clients authenticate with Clerk. The backend verifies tokens, attaches database identity, and owns privileged Supabase service-role work. Direct client Supabase access is allowed only where RLS and token bridging are deliberate.

Billing has two rails: web Paystack and mobile RevenueCat. Server-side webhooks are authoritative for grants, entitlements, credits, and ledger records; client SDK state is a UX signal and must not self-grant access.

## Quality bar

Protect user ownership, privacy, AI spend, opportunity accuracy, deadlines, and billing integrity. Preserve theme tokens, 4.5:1 contrast, accessible labels, reduced motion, nine-language i18n, Arabic RTL, and graceful offline/error states.
