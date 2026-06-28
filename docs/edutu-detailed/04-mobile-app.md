# 04. Mobile App Documentation

## Path and Commands

Path:

```bash
edutumobile
```

Commands:

```bash
npm run dev
npm run start
npm run android
npm run ios
npm run web
npm run test
npm run typecheck
npm run migrate
npm run deploy:webhook
```

## Runtime Architecture

The mobile app uses:

- Expo Router.
- React Native 0.83.
- React 19.
- Clerk Expo auth.
- Supabase JS with Clerk token bridge.
- Local package `@edutu/core` from `packages/core`.
- Expo Notifications.
- RevenueCat client keys.
- Native widgets through `expo-widgets`.
- Offline cache through AsyncStorage.

## Root App Shell

`app/_layout.tsx`:

1. Reads `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`.
2. Wraps app in `ClerkProvider`.
3. Loads theme and offline providers.
4. Registers Supabase access token getter using Clerk token.
5. Runs deep-link and update-prompt hooks.
6. Syncs opportunity widget snapshot.
7. Renders `OfflineBanner` and `MobileCampaignHost`.

## Route Map

### Auth and Onboarding

| Route | Purpose |
| --- | --- |
| `/` | App index/entry. |
| `/onboarding-welcome` | Onboarding intro. |
| `/onboarding` | Onboarding flow. |
| `/(auth)/sign-in` | Sign in. |
| `/(auth)/sign-up` | Sign up. |
| `/(auth)/reset-password` | Password reset. |

### App Routes

| Route | Purpose |
| --- | --- |
| `/(app)` | Main tab shell. |
| `/(app)/index` | Home. |
| `/(app)/opportunities` | Opportunity list. |
| `/(app)/opportunities/[id]` | Opportunity detail. |
| `/(app)/my-opportunities` | User opportunity state. |
| `/(app)/saved` | Saved opportunities. |
| `/(app)/applied` | Applied opportunities. |
| `/(app)/goals` | Goals root. |
| `/(app)/goals/[id]` | Goal detail. |
| `/(app)/goals/add` | Add goal. |
| `/(app)/goals/all-roadmaps` | Roadmap library. |
| `/(app)/goals/my-list` | User goal list. |
| `/(app)/roadmaps` | Roadmaps. |
| `/(app)/roadmap-templates` | Roadmap templates. |
| `/(app)/deadlines` | Deadlines. |
| `/(app)/chat` | AI chat. |
| `/(app)/cv` | CV builder/manager. |
| `/(app)/wallet` | Wallet/credits. |
| `/(app)/paywall` | Subscription/paywall. |
| `/(app)/notifications` | Notifications. |
| `/(app)/profile` | Profile. |
| `/(app)/profile/edit` | Edit profile. |
| `/(app)/profile/settings` | Settings. |
| `/(app)/creator-apply` | Creator application. |
| `/(app)/creator-dashboard` | Creator dashboard. |
| `/(app)/mentor-apply` | Mentor application. |
| `/(app)/privacy` | Privacy. |
| `/(app)/help` | Help. |

### Admin Routes

| Route | Purpose |
| --- | --- |
| `/admin/creator-applications` | Mobile admin creator applications. |
| `/admin/premium-features` | Premium feature admin. |
| `/admin/testimonials` | Testimonial admin. |
| `/admin/roadmap/create` | Roadmap creation admin. |

## Navigation Shell

`app/(app)/_layout.tsx` provides the protected app shell:

- Stack protection and redirect behavior.
- Shared header.
- Bottom navigation with main tabs.
- Push token registration.
- Voice AI button.
- Notification badge.

## Shared Core Package

Path:

```bash
edutumobile/packages/core/src
```

| Area | Files | Purpose |
| --- | --- | --- |
| Hooks | `useOpportunities`, `useGoals`, `useChat`, `useCommunity`, `useCredits`, `useProStatus`, `useFeatureFlags`, `useNotifications`, `useProfileCompleteness`, `useCreatorAccess` | Reusable data and feature state. |
| Services | opportunities, opportunity signals, chat, CV, community, payments, bookmarks, storage, offline actions, analytics, deep linking, notifications | Business/data calls shared across screens. |
| Types | opportunity, user, notification, chat, community, CV, feature flags | Shared contracts. |
| Utils | `auth.ts` | User/auth ID helpers. |

## Mobile Data Flow

1. Clerk authenticates user and provides tokens.
2. `setSupabaseAccessTokenGetter` injects Clerk token into Supabase client access.
3. API client reads `EXPO_PUBLIC_API_URL`, defaults to `http://localhost:3000`.
4. Opportunity recommendations try backend `POST /opportunities/recommendations`, then backend query fallback, then direct Supabase query/local scoring.
5. GET requests can fall back to AsyncStorage cache.
6. Opportunity services normalize Supabase/backend opportunity rows into mobile `Opportunity` type.
7. Signals post to `POST /opportunities/signals`.
8. Chat calls Supabase function `chat-proxy`; voice recording can call transcription mode before chat.
9. Push tokens are sent to `POST /notifications/push-token` if API URL and auth token are available.
10. Mobile control config is fetched from `/mobile-control/config`.
11. Opportunity widget snapshot is built from mobile-control feed, cached opportunities, or latest opportunities.

## Mobile Environment Variables

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk Expo auth. |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key. |
| `EXPO_PUBLIC_API_URL` | NestJS backend API URL. |
| `EXPO_PUBLIC_REVENUECAT_API_KEY_IOS` | RevenueCat iOS key. |
| `EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID` | RevenueCat Android key. |
| `GOOGLE_SERVICES_JSON` | Android Firebase config path override. |

## Mobile Supabase Functions

| Function | Purpose |
| --- | --- |
| `chat-proxy` | AI chat proxy and chat persistence. |
| `clerk-webhook` | Clerk identity synchronization. |
| `delete-account` | Account deletion. |
| `revenuecat-webhook` | RevenueCat subscription event processing. |

## Native/Device Features

| Feature | Implementation |
| --- | --- |
| Push notifications | `expo-notifications`, `lib/notifications.ts`. |
| Haptics | `expo-haptics`, notification service and UI interactions. |
| Voice recording | `hooks/useVoiceRecording.ts`, chat/AI button flows. |
| Text to speech | `hooks/useTextToSpeech.ts`. |
| Widgets | `widgets/OpportunityWidget`, `lib/mobileControl.ts`. |
| Offline | `OfflineProvider`, API cache, AsyncStorage snapshots. |
| Deep links | `hooks/useDeepLink.ts`, opportunity widget deep links. |

## Mobile Risks

1. Mobile uses both backend API and direct Supabase, so auth/RLS contracts must be clear.
2. Migration `005_convert_user_id_to_text.sql` changes many user IDs to text, while backend Drizzle uses UUID columns.
3. `EXPO_PUBLIC_API_URL` fallback must match actual backend port; old docs mention 3001 in some places and active Nest defaults to 3000.
4. RevenueCat and Paystack billing paths need a single product entitlement source.
5. Push project ID is hardcoded in notification registration and should be documented for release ownership.
6. Deep-link parsing expects `edutu://opportunity/:id`, while widget/mobile-control emits `edutu://opportunities/:id`; universal link domains also need alignment.
7. `delete-account` should be reviewed against chat table relationships to ensure messages are not orphaned.
8. Offline action queue exists but is not wired through every save/apply/goal path.
9. RevenueCat webhook signature format should be confirmed before production enablement.
