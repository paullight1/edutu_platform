# 03. Web, Admin, and Waitlist Documentation

## Standalone Admin Dashboard

Path:

```bash
edutu-platform/admin
```

Commands:

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

### Admin Auth Flow

`src/App.tsx` implements auth locally:

1. Reads Supabase session.
2. If no session, routes to `/login` or `/signup`.
3. Reads `profiles.role` for the session user.
4. Allows access only if `role === "admin"`.
5. Renders `Layout` with admin pages.

This differs from the NestJS backend Clerk guard and should be documented as an exception or migrated.

### Admin Routes

| Route | Component | Purpose |
| --- | --- | --- |
| `/` | `Dashboard` | Admin overview. |
| `/opportunities` | `Opportunities` | Review/manage opportunities; also references old scraper API and Nest API. |
| `/users` | `Users` | User management. |
| `/creators` | `Creators` | Creator applications/management. |
| `/roadmaps` | `Roadmaps` | Roadmap admin. |
| `/blog` | `Blog` | Blog content admin. |
| `/settings` | `Settings` | Admin configuration. |
| `/edutu-engine` | `Scraper` | Scraper dashboard at admin URL. |
| `/mobile-control` | `MobileControl` | Campaigns, feature flags, widget feeds. |
| `/profile` | `Profile` | Admin profile. |

### Direct Tables Observed

Standalone admin directly reads or writes:

- `profiles`
- `opportunities`
- `opportunity_applications`
- `scraping_sources`
- `scrape_logs`
- `blog_posts`
- `blog-images`
- `admin_users`
- `user_notifications`

### Admin Integrations

| File | Role |
| --- | --- |
| `src/lib/supabase.ts` | Supabase client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. |
| `src/lib/mobileControlApi.ts` | Calls NestJS mobile-control backend using `VITE_BACKEND_URL`. |
| `src/pages/Scraper.tsx` | Calls `${VITE_BACKEND_URL || http://localhost:3000}/api/scraper`. |
| `src/pages/Opportunities.tsx` | Uses both `VITE_API_URL` and `VITE_BACKEND_URL` paths. |
| `src/pages/Settings.tsx` | Reads `VITE_OPENROUTER_API_KEY` and `VITE_WEBHOOK_URL`. |

## Main Web App

Path:

```bash
edutu-platform/edutu-web-app
```

Commands:

```bash
npm run dev
npm run build
npm run test
npm run typecheck
npm run android
npm run android:build
npm run android:run
```

### Web App Runtime

- React 18, Vite, TypeScript.
- React Router.
- Clerk auth through `@clerk/clerk-react`.
- Supabase client with optional Clerk JWT injection.
- Capacitor Android project in `android/`.
- PWA assets in `public/`.

### Public Routes

| Route | Component | Notes |
| --- | --- | --- |
| `/` | `LandingPageV3` | Marketing/app entry. |
| `/about` | `AboutPage` | Public information. |
| `/opportunities` | `OpportunitiesPage` | Public opportunities page. |
| `/blog` | `BlogPage` | Public content. |
| `/mentor` | `MentorPage` | Mentor marketing/application surface. |
| `/auth` | `AuthScreen` | Clerk auth screen. |
| `/auth/callback` | `AuthCallback` | Auth completion route. |
| `/billing` | `BillingPage` behind `AuthGuard` | Billing management. |
| `/billing/success` | `BillingSuccessPage` behind `AuthGuard` | Checkout success. |
| `/admin/*` | Embedded admin behind `AdminGuard` | Lazy-loaded admin root. |

### Authenticated App Routes

All routes below are nested under `/app` and wrapped by `AuthGuard` and `AppLayout`.

| Route | Purpose |
| --- | --- |
| `/app/home` | Dashboard, personalized summary, opportunity entry point. |
| `/app/opportunities` | All opportunities. |
| `/app/profile` | Profile. |
| `/app/goals` | All goals. |
| `/app/community` | Community marketplace. |
| `/app/achievements` | Achievements. |
| `/app/saved` | Saved opportunities. |
| `/app/applied` | Applied opportunities. |
| `/app/add-goal` | Create goal. |
| `/app/roadmap-templates` | Template-started goal creation. |
| `/app/opportunity/:id` | Opportunity detail. |
| `/app/opportunity/:id/roadmap` | Roadmap generated from opportunity. |
| `/app/opportunity/:id/ai-roadmap` | AI roadmap behind premium gate. |
| `/app/goal/:id/roadmap` | Goal roadmap. |
| `/app/package/:id` | Marketplace package behind premium gate. |
| `/app/settings` | Settings. |
| `/app/profile-edit` | Edit profile. |
| `/app/notifications` | Notifications. |
| `/app/privacy` | Privacy. |
| `/app/help` | Help/support. |
| `/app/cv` | CV management behind premium gate. |
| `/app/personalization` | Onboarding/personalization profile. |
| `/app/creator/apply` | Creator application. |
| `/app/creator/dashboard` | Creator dashboard. |
| `/app/creator/create` | Creator roadmap wizard behind premium gate. |

### Web App Service Modules

| Service | Responsibility |
| --- | --- |
| `profile.ts`, `profileCompleteness.ts`, `userSettings.ts` | User profile, onboarding, settings. |
| `opportunities.ts`, `personalizedRecommendations.ts`, `personalizationService.ts` | Opportunity reads, matching, personalization. |
| `bookmarks.ts`, `applications.ts`, `deadlines.ts` | User opportunity state and deadline rollups. |
| `roadmapApi.ts`, `aiRoadmapGenerator.ts`, `taskTrackingService.ts` | Roadmap and goal-related services. |
| `billing.ts`, `credits.ts` | Payments, credits, entitlements. |
| `cvService.ts`, `cvService.supabase.ts` | CV storage and AI/backend flows. |
| `creator.ts`, `packageService.ts`, `packageServiceSupabase.ts`, `communityMarketplaceSupabase.ts` | Creator and marketplace features. |
| `chat.ts`, `n8nIntegration.ts` | AI chat and external workflow integration. |
| `notifications.ts`, `supportTickets.ts`, `supportTicketsSupabase.ts` | Notifications and support. |
| `analyticsAggregator.ts` | Analytics summaries. |
| `admin/*` | Embedded admin service layer. |

### Important Web App Flows

- First-time users can be routed through onboarding; onboarding saves to Clerk metadata and Supabase `profiles.preferences.onboarding`.
- Dashboard combines recommendations, profile completeness, saved/applied counts, goals, and quick navigation.
- Opportunity detail supports bookmark, share, application tracking, and a roadmap conversion flow.
- Premium gates protect AI roadmaps, CV builder, premium marketplace resources, and creator tools.
- PWA configuration includes auto-update service worker, manifest/icons, and Google font runtime caching.
- Capacitor initialization handles native back button, deep links, and status bar behavior.

### Embedded Admin

The main web app also contains an embedded admin under `src/admin`:

- `AdminRoot.tsx`
- `AdminLayout.tsx`
- `AdminApp.tsx`
- `pages/AdminDashboard.tsx`
- `pages/UsersPage.tsx`
- `pages/PaymentsPage.tsx`
- `pages/NotificationsPage.tsx`
- `pages/PlaceholderPages.tsx`

It overlaps with the standalone admin dashboard and should be documented as a second admin surface until consolidated.

### Embedded Admin Roles

The embedded admin checks Clerk public metadata, Supabase `profiles.role`, and configured admin emails. Roles observed:

- `super_admin`
- `admin`
- `moderator`
- `support_agent`

## Waitlist Site

Path:

```bash
edutu-platform/edutu-web
```

Commands:

```bash
npm run dev
npm run build
npm run start
npm run lint
```

### Waitlist Structure

| Path | Purpose |
| --- | --- |
| `app/page.tsx` | Landing page with animated hero text and waitlist form. |
| `app/api/waitlist/route.ts` | Waitlist API route. |
| `components/waitlist-form.tsx` | User email/name capture. |
| `scripts/01-create-waitlist-table.sql` | Create waitlist table. |
| `scripts/02-seed-waitlist-data.sql` | Seed data. |
| `scripts/03-add-name-column.sql` | Add name column. |

### Waitlist Data Path

- Uses Neon serverless Postgres through `@neondatabase/serverless`.
- Requires `DATABASE_URL`.
- API route inserts `{ name, email }` into `waitlist`.
- Handles missing name, invalid email, duplicate email, and generic server errors.
- `NEXT_PUBLIC_SITE_URL` controls metadata base for SEO/OpenGraph.

## Web/Admin Risks

1. There are two admin implementations: standalone admin and embedded app admin.
2. Environment variable naming differs: `VITE_API_URL` and `VITE_BACKEND_URL` both appear.
3. Web app services combine backend API and Supabase direct access.
4. Admin auth differs from backend auth.
5. Capacitor Android release docs should stay synchronized with Vite/PWA behavior.
