# Edutu Mobile Architecture

Generated from the local mobile workspace on 2026-05-23.

## Repository Model

`edutumobile` is a separate repository boundary from `edutu-platform`.

This repository owns the mobile app, mobile core package, mobile-specific Supabase functions/migrations, native widget code, and mobile documentation. The platform backend and web/admin surfaces are owned elsewhere.

## Runtime Stack

| Area | Technology |
| --- | --- |
| App runtime | Expo SDK 55, React Native 0.83 |
| Routing | Expo Router |
| Auth | Clerk Expo SDK |
| Data | Supabase JS, backend HTTP API |
| UI | NativeWind, StyleSheet, Lucide React Native, Expo UI pieces |
| Native capabilities | Notifications, haptics, speech, document picker, image picker, widgets, secure store |
| Tests | Jest / Jest Expo |

## App Shell

`app/_layout.tsx` is the root shell. It provides:

- `ClerkProvider` with secure token cache
- `ThemeProvider`
- `OfflineProvider`
- `GestureHandlerRootView`
- status bar styling
- deep-link handling
- in-app update prompt
- Supabase access token bridge
- opportunity widget sync
- `OfflineBanner`
- `MobileCampaignHost`
- top-level error boundary

## Route Groups

| Route group | Purpose |
| --- | --- |
| `app/(auth)` | Sign in, sign up, reset password |
| `app/(app)` | Authenticated app routes such as home, roadmaps, deadlines, opportunities, wallet, notifications, privacy, help, chat, creator flows, paywall |
| `app/admin` | Mobile admin screens for creator applications, testimonials, premium features, and roadmap admin |
| `app/_data` | Local onboarding data |

## Core Package

`packages/core/src` contains reusable mobile domain code:

- `services` for opportunities, chat, CV, payments, notifications, bookmarks, applications, community, analytics, storage, and offline actions
- `hooks` for credits, chat, pro status, opportunities, notifications, profile completeness, community, feature flags, goals, and creator access
- `types` for opportunity, CV, chat, notification, user, community, and feature flag models
- `utils/auth.ts` for auth-related helpers

## Data Access

### Backend HTTP

`lib/api.ts` provides a centralized API client with:

- JSON request/response handling
- authorization header support
- user ID header support
- timeout handling
- retry with exponential delay
- GET response caching through AsyncStorage
- offline fallback for cached GET responses

`EXPO_PUBLIC_API_URL` points to the platform backend API.

### Supabase

`packages/core/src/services/supabase.ts` creates Supabase clients and accepts an access token getter. The root layout sets that getter from Clerk:

```text
Clerk getToken()
  -> setSupabaseAccessTokenGetter()
  -> Supabase client accessToken option
  -> RLS-aware Supabase calls
```

Direct Supabase access should stay limited to operations with explicit RLS and mobile ownership.

### Edge Functions

Observed mobile Supabase functions:

- `delete-account`
- `clerk-webhook`
- `chat-proxy`
- `revenuecat-webhook`

Each function should document auth expectations, payload shape, and retry behavior before production changes.

## Main Process Flows

### App Startup

1. Expo loads root layout.
2. Clerk initializes with secure token cache.
3. Theme and offline providers mount.
4. Supabase token getter is wired to Clerk.
5. Deep links and update prompts initialize.
6. Opportunity widget snapshot sync runs for the current user.
7. Authenticated or auth routes render through Expo Router.

### Authenticated Data Fetch

1. User signs in with Clerk.
2. Mobile feature requests a Clerk token.
3. Backend calls use `Authorization: Bearer <token>`.
4. Supabase calls use the bridged token getter.
5. GET requests can fall back to AsyncStorage cache when offline.

### Mobile Campaigns

1. App loads mobile control config from backend.
2. Active campaigns and feature flags are evaluated.
3. `MobileCampaignHost` renders eligible UI.
4. Campaign events are posted back to the backend.

### Opportunity Widget Sync

1. App starts or user changes.
2. Opportunity snapshot sync loads relevant opportunities.
3. Snapshot is written for native widget rendering.
4. Failures should not block normal app startup.

## Operational Commands

```bash
npm install
npm run dev
npm run android
npm run ios
npm run web
npm run typecheck
npm run test
```

Supabase commands in this repo:

```bash
npm run migrate
npm run deploy:webhook
```

## Release Checklist

- `npm run typecheck`
- `npm run test`
- manual iOS smoke test
- manual Android smoke test
- auth sign-in/sign-out test
- offline cache test for key read flows
- push notification registration test
- mobile campaign display/dismiss/event test
- Supabase function deploy notes if functions changed
- migration ownership note if `supabase/migrations` changed

## Risks and Follow-Ups

- Direct Supabase access must be kept aligned with RLS and Clerk token bridging.
- Mobile-specific migrations should not silently conflict with platform migrations.
- Native widgets and notifications need device-level QA, not only web simulator checks.
- Backend API contract changes should be versioned or coordinated with mobile releases.
