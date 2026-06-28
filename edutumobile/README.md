# Edutu Mobile

This repository boundary owns the Edutu Expo mobile app. It is intentionally separate from the `edutu-platform` repository.

## Repository Boundary

`edutumobile` owns:

- Expo Router mobile screens
- Mobile UI components and context providers
- Mobile core package under `packages/core`
- Native widgets and Android widget plugin
- Mobile-specific Supabase functions and migrations
- Mobile docs and tests

The backend API, web app, standalone admin, waitlist site, platform scraper, and shared platform docs are owned by the separate `edutu-platform` repository boundary. Do not treat the parent workspace as a monorepo.

## Tech Stack

- Expo SDK 55
- React Native 0.83
- Expo Router
- Clerk Expo SDK
- Supabase JS with Clerk token bridging
- NativeWind and StyleSheet
- React Context and hooks
- Expo notifications, secure storage, widgets, haptics, speech, document/image picker

## Project Structure

```text
edutumobile/
├── app/                         # Expo Router routes
│   ├── (auth)/                  # Sign in, sign up, reset password
│   ├── (app)/                   # Authenticated user app
│   ├── admin/                   # Mobile admin screens
│   ├── _data/                   # Onboarding data
│   └── _layout.tsx              # Root provider layout
├── components/                  # UI, branding, context, chat, goals, mobile-control, auth, CV
├── constants/                   # App constants and color/config tokens
├── docs/                        # Mobile documentation
├── hooks/                       # Deep link, voice, speech, animation hooks
├── lib/                         # Mobile app service utilities
├── packages/core/               # Shared mobile domain services, hooks, and types
├── plugins/                     # Native config plugins
├── supabase/                    # Mobile-specific migrations and edge functions
├── widgets/                     # Native opportunity widget registration
└── __tests__/                   # Mobile tests
```

## Getting Started

```bash
npm install
npm run dev
```

Native targets:

```bash
npm run android
npm run ios
npm run web
```

Verification:

```bash
npm run typecheck
npm run test
```

## Environment

Create `.env` in this repository:

```env
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_API_URL=https://edutu-platform.onrender.com
```

## Runtime Architecture

The root layout wraps the app with:

- `ClerkProvider`
- secure token cache
- theme provider
- offline provider and offline banner
- gesture handler root view
- error boundary
- status bar configuration
- deep-link handling
- in-app update prompt
- mobile campaign host
- opportunity widget sync

Clerk is the primary mobile identity provider. The mobile Supabase client receives Clerk tokens through `setSupabaseAccessTokenGetter`, allowing Supabase calls to participate in the same authenticated session model where RLS is configured.

## Data Access Rules

Use the platform backend API for privileged business logic and server-owned workflows.

Use Supabase directly only when:

- the table/function is mobile-owned or explicitly shared
- RLS policies are designed for the operation
- Clerk token bridging is active
- the operation is not privileged admin/business logic

Current mobile access paths include:

- `lib/api.ts` for backend HTTP calls with retries and offline cache fallback
- `lib/supabase.ts` and `packages/core/src/services/supabase.ts` for Supabase clients
- `packages/core/src/services/*` for opportunities, chat, CV, payments, notifications, bookmarks, applications, community, and storage
- `supabase/functions/*` for mobile-specific edge functions such as chat proxy, Clerk webhook, RevenueCat webhook, and account deletion

## Documentation

- `docs/MOBILE_ARCHITECTURE.md` - mobile architecture and process documentation
- `docs/android-widget-plan.md` - Android widget plan

## Development Rules

- Keep this repository independently runnable.
- Do not add platform-only services or web/admin code here.
- Coordinate backend API contract changes with `edutu-platform`.
- Document any mobile-specific Supabase migration or edge function before release.
- Test both iOS and Android for native feature changes.
