# Edutu Platform Roadmap

## Vision

**One sentence**: An AI-powered education platform connecting learners to opportunities, scholarships, courses, and mentorship globally.

**Who**: Students and professionals seeking educational opportunities; Creators selling courses/mentorship; Admins managing the platform.

**Why**: Existing platforms are fragmented — learners juggle multiple apps for scholarships, courses, and goals. Edutu unifies discovery, tracking, and achievement.

**Constraint**: React ecosystem (Vite, React Native/Expo), Supabase for auth/storage, NestJS API for core business logic, Vercel hosting.

**Not building**: Real-time collaboration, native mobile apps (PWA + Expo is sufficient), offline-first architecture.

---

## Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend (Web) | Vite + React + Clerk + Tailwind | Fast dev, PWA support, modern auth |
| Frontend (Mobile) | Expo + React Native + Clerk | Cross-platform, shared code with web |
| Admin Panel | Vite + React + Tailwind | Separate admin dashboard |
| Backend API | NestJS + Drizzle ORM | Structured, scalable, TypeScript-native |
| Database | PostgreSQL (Supabase + self-hosted) | Supabase for auth/storage, NestJS owns business data |
| Auth | Clerk | Modern auth with social logins, user management |
| Storage | Supabase Storage | File uploads, CVs, profile images |
| Hosting | Vercel (apps) + Railway/Render (API) | Simple deployment, good free tiers |

---

## Data Model

### Core Entities (Already Implemented)

```
profiles
  user_id (PK, UUID)
  full_name, email, role, country
  skills (array)
  credits_balance
  creator_status ('none', 'pending', 'approved', 'rejected')
  created_at, updated_at

goals
  id (PK), user_id (FK)
  title, description, category
  progress, status, target_date
  created_at, updated_at

milestones
  id (PK), goal_id (FK)
  title, completed, order
  created_at

opportunities
  id (PK)
  title, provider_id, category, type
  description, eligibility_criteria
  funding_type, target_region, deadline
  source_url, apply_url, image_url
  is_remote, status
  created_at, updated_at

creator_applications
  id (PK), user_id (FK)
  display_name, bio, content_type
  experience, sample_content_url
  status, admin_note, reviewed_by
  submitted_at, updated_at

marketplace_listings
  id (PK), seller_id (FK)
  title, description, category, type
  price, image_url, preview_url
  event_date, event_location, capacity
  tags, rating, review_count, enrollment_count
  is_featured, status
  created_at, updated_at

marketplace_enrollments
  id (PK), user_id, listing_id (FK)
  status, credits_spent
  enrolled_at, completed_at

tickets
  id (PK), user_id
  subject, description
  priority, status
  created_at, updated_at

transactions
  id (PK), user_id
  amount, type, status
  reference_id, description
  created_at
```

### Relationships
- profiles has many goals via user_id
- goals has many milestones via goal_id
- profiles has many creator_applications via user_id
- profiles has many marketplace_listings as seller_id
- marketplace_listings has many marketplace_enrollments via listing_id
- profiles has many tickets via user_id
- profiles has many transactions via user_id

---

## Phase Overview

| Phase | Goal | New Tables | New Routes | Sessions |
|-------|------|-----------|-----------|----------|
| 1 | MVP Production Deploy | 0 | Auth polish, env setup | 1-2 |
| 2 | API Unification | +2 | 12+ | 2-3 |
| 3 | Mobile Feature Parity | 0 | Mobile screens | 2-3 |
| 4 | Creator Marketplace | +1 (reviews) | 8+ | 2-3 |
| 5 | AI Coaching | +1 (chat_history) | 6+ | 2-3 |
| 6 | Payments & Credits | +2 | 10+ | 2-3 |
| 7 | Admin Polish & Analytics | 0 | Admin features | 1-2 |

---

## Phase 1 — MVP Production Deploy
*Goal: Deploy all apps to production with proper environment configuration*
*Depends on: None*
*Estimated effort: 1-2 sessions*

### What's New
- All apps deployed to production URLs
- Environment variables properly configured
- Basic monitoring and error tracking
- CI/CD pipeline for deployments

### Database Changes
None — use existing schema

### API Routes
None — verify existing routes work

### Frontend
- Configure production environment variables
- Update Clerk production keys
- Configure Supabase production instance
- Set up Vercel deployments for all apps

### Infrastructure
- Vercel project for web app
- Vercel project for admin panel
- Vercel project for landing page
- EAS project for mobile app builds
- Railway/Render deployment for NestJS API
- Environment variable management

### Task Checklist

#### Setup
- [ ] Create production Clerk application
- [ ] Create production Supabase project
- [ ] Set up PostgreSQL database for NestJS API (Railway/Render/Neon)
- [ ] Configure Vercel projects for web, admin, landing

#### Environment
- [ ] Create `.env.production` for each app
- [ ] Configure VITE_CLERK_PUBLISHABLE_KEY
- [ ] Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
- [ ] Configure API URL for backend calls
- [ ] Set up CORS in NestJS for production domains

#### API Deployment
- [ ] Configure DATABASE_URL for NestJS API
- [ ] Run Drizzle migrations on production DB
- [ ] Deploy NestJS API to Railway/Render
- [ ] Configure API environment variables

#### Mobile
- [ ] Configure EAS build for iOS/Android
- [ ] Update app.json with production bundle ID
- [ ] Set up Clerk production keys in mobile app

#### Monitoring
- [ ] Add Sentry DSN for error tracking (web/admin already has it)
- [ ] Set up basic uptime monitoring
- [ ] Configure Vercel analytics

### Definition of Done
- [ ] Web app accessible at production URL
- [ ] Admin panel accessible at admin subdomain
- [ ] Landing page accessible at root domain
- [ ] API health check returns 200
- [ ] User can sign up, log in, and access dashboard
- [ ] No console errors in production

---

## Phase 2 — API Unification
*Goal: Consolidate data access through NestJS API, remove direct Supabase calls from frontend*
*Depends on: Phase 1*
*Estimated effort: 2-3 sessions*

### What's New
- All data operations go through NestJS API
- Consistent error handling and validation
- API documentation with Swagger
- Rate limiting and security middleware

### Database Changes
```
api_keys
  id (PK), user_id (FK)
  key_hash, name, scopes
  last_used_at, expires_at
  created_at

audit_logs
  id (PK), user_id, action
  entity_type, entity_id
  metadata (JSON)
  ip_address, user_agent
  created_at
```

### API Routes
```
POST   /api/auth/session         - Get current session
GET    /api/profiles/:id         - Get user profile
PATCH  /api/profiles/:id         - Update profile
GET    /api/goals                - List user goals
POST   /api/goals                - Create goal
GET    /api/goals/:id            - Get goal details
PATCH  /api/goals/:id            - Update goal
DELETE /api/goals/:id            - Delete goal
POST   /api/goals/:id/milestones - Add milestone
GET    /api/opportunities        - List opportunities
GET    /api/opportunities/:id    - Get opportunity
POST   /api/opportunities        - Create opportunity (admin)
GET    /api/creators/applications - List applications
POST   /api/creators/apply       - Submit application
PATCH  /api/creators/applications/:id - Review application (admin)
```

### Frontend
- Replace Supabase client calls with API calls
- Update all data fetching hooks
- Add API error handling
- Implement optimistic updates

### Infrastructure
- API documentation endpoint
- Rate limiting middleware
- Request validation with Zod

### Task Checklist

#### Data Layer
- [ ] Create database connection in NestJS
- [ ] Implement profiles service with full CRUD
- [ ] Implement goals service with milestones
- [ ] Implement opportunities service
- [ ] Implement creator applications service

#### API
- [ ] Create profiles controller with routes
- [ ] Create goals controller with routes
- [ ] Create opportunities controller with routes
- [ ] Add validation DTOs with Zod
- [ ] Implement error handling middleware
- [ ] Add Swagger documentation
- [ ] Implement rate limiting

#### Frontend Migration
- [ ] Create API client library in packages/core
- [ ] Migrate useGoals hook to use API
- [ ] Migrate useOpportunities hook to use API
- [ ] Migrate profile service to use API
- [ ] Migrate creator application service to use API
- [ ] Update admin panel to use API

#### Testing
- [ ] Add integration tests for API routes
- [ ] Test all CRUD operations
- [ ] Verify error handling

### Definition of Done
- [ ] No direct Supabase calls from frontend (except auth)
- [ ] All data operations go through NestJS API
- [ ] API documentation available at /api/docs
- [ ] Rate limiting prevents abuse
- [ ] All existing features work end-to-end

---

## Phase 3 — Mobile Feature Parity
*Goal: Mobile app has all core features of web app*
*Depends on: Phase 2*
*Estimated effort: 2-3 sessions*

### What's New
- Full authentication flow on mobile
- Goals management on mobile
- Opportunities browsing on mobile
- Profile management on mobile
- Push notifications

### Database Changes
None

### API Routes
```
POST /api/notifications/register - Register push token
GET  /api/notifications/settings - Get notification preferences
POST /api/notifications/settings - Update preferences
```

### Frontend (Mobile)
- Complete auth screens
- Dashboard/home screen
- Goals list and detail screens
- Opportunity list and detail screens
- Profile and settings screens
- Push notification handling

### Infrastructure
- Expo push notifications setup
- Deep linking configuration

### Task Checklist

#### Auth Flow
- [ ] Implement login screen
- [ ] Implement signup screen
- [ ] Implement forgot password screen
- [ ] Add OAuth sign-in (Google, Apple)
- [ ] Handle auth state persistence

#### Core Screens
- [ ] Build dashboard/home screen
- [ ] Build goals list screen
- [ ] Build goal detail screen with milestones
- [ ] Build opportunities list screen
- [ ] Build opportunity detail screen
- [ ] Build profile screen
- [ ] Build settings screen

#### Navigation
- [ ] Set up tab navigation
- [ ] Implement deep linking
- [ ] Add navigation animations

#### Notifications
- [ ] Configure Expo push notifications
- [ ] Create notification service
- [ ] Handle notification taps
- [ ] Add notification preferences

#### Polish
- [ ] Implement dark mode
- [ ] Add loading states
- [ ] Add error states
- [ ] Implement pull-to-refresh

### Definition of Done
- [ ] User can sign up and log in on mobile
- [ ] User can view and manage goals
- [ ] User can browse opportunities
- [ ] User can edit profile
- [ ] Push notifications work
- [ ] Deep links open correct screens

---

## Phase 4 — Creator Marketplace
*Goal: Full marketplace functionality for creators to sell courses and services*
*Depends on: Phase 2*
*Estimated effort: 2-3 sessions*

### What's New
- Creator dashboard for managing listings
- Listing creation and editing
- Student enrollment tracking
- Reviews and ratings
- Featured listings

### Database Changes
```
marketplace_reviews
  id (PK), listing_id (FK), user_id (FK)
  rating (1-5), comment
  created_at, updated_at
```

### API Routes
```
GET    /api/marketplace                 - Browse listings
GET    /api/marketplace/:id             - Get listing details
POST   /api/marketplace                 - Create listing (creator)
PATCH  /api/marketplace/:id             - Update listing
DELETE /api/marketplace/:id             - Delete listing
POST   /api/marketplace/:id/enroll      - Enroll in listing
GET    /api/marketplace/my/listings     - Creator's listings
GET    /api/marketplace/my/enrollments  - User's enrollments
POST   /api/marketplace/:id/reviews     - Add review
GET    /api/marketplace/:id/reviews     - Get reviews
```

### Frontend
- Creator dashboard with analytics
- Listing creation form
- Enrollment management
- Review submission UI
- Featured listings showcase

### Task Checklist

#### API
- [ ] Create marketplace service
- [ ] Implement listing CRUD
- [ ] Implement enrollment logic
- [ ] Implement reviews system
- [ ] Add rating aggregation

#### Web - Creator
- [ ] Build creator dashboard
- [ ] Build listing creation form
- [ ] Build listing editor
- [ ] Build enrollment management view
- [ ] Add analytics cards

#### Web - Student
- [ ] Build marketplace browse page
- [ ] Build listing detail page
- [ ] Build enrollment confirmation
- [ ] Build review submission form
- [ ] Add to community/marketplace section

#### Mobile
- [ ] Build marketplace browse screen
- [ ] Build listing detail screen
- [ ] Build enrollment flow
- [ ] Add reviews display

#### Admin
- [ ] Build marketplace moderation view
- [ ] Add listing approval workflow
- [ ] Add featured listing management

### Definition of Done
- [ ] Creators can create and manage listings
- [ ] Users can browse and enroll in listings
- [ ] Reviews and ratings display correctly
- [ ] Admin can moderate marketplace
- [ ] Featured listings appear prominently

---

## Phase 5 — AI Coaching
*Goal: AI-powered goal planning and opportunity matching*
*Depends on: Phase 2*
*Estimated effort: 2-3 sessions*

### What's New
- AI chat interface for goal planning
- Personalized opportunity recommendations
- Roadmap generation from goals
- Smart milestone suggestions

### Database Changes
```
chat_conversations
  id (PK), user_id (FK)
  title, context_type
  created_at, updated_at

chat_messages
  id (PK), conversation_id (FK)
  role ('user', 'assistant')
  content
  created_at

recommendations
  id (PK), user_id (FK)
  opportunity_id (FK)
  score, reason
  dismissed, clicked
  created_at
```

### API Routes
```
POST /api/chat/conversations        - Create conversation
GET  /api/chat/conversations        - List conversations
POST /api/chat/conversations/:id    - Send message
GET  /api/recommendations           - Get personalized recommendations
POST /api/recommendations/:id/dismiss - Dismiss recommendation
POST /api/goals/:id/roadmap/generate - Generate AI roadmap
```

### Frontend
- Chat interface component
- Conversation history
- Recommendation cards
- Roadmap generation UI

### Infrastructure
- Google Gemini API integration (already in dependencies)
- Message context management
- Rate limiting for AI endpoints

### Task Checklist

#### API
- [ ] Create chat service with Gemini integration
- [ ] Implement conversation management
- [ ] Create recommendation engine
- [ ] Implement roadmap generation
- [ ] Add rate limiting for AI endpoints

#### Web
- [ ] Build chat interface
- [ ] Build conversation list
- [ ] Add recommendation cards to dashboard
- [ ] Build roadmap generation UI
- [ ] Add AI suggestions to goal creation

#### Mobile
- [ ] Build chat screen
- [ ] Add recommendations to home
- [ ] Implement roadmap view

#### AI Features
- [ ] Implement goal analysis prompt
- [ ] Implement opportunity matching algorithm
- [ ] Implement milestone generation
- [ ] Add context awareness

### Definition of Done
- [ ] Users can chat with AI coach
- [ ] Recommendations appear based on profile
- [ ] Roadmaps generate from goals
- [ ] AI suggests relevant milestones

---

## Phase 6 — Payments & Credits
*Goal: Full credits system with payment processing*
*Depends on: Phase 4*
*Estimated effort: 2-3 sessions*

### What's New
- Credit packages for purchase
- Payment processing (Stripe)
- Wallet management
- Transaction history
- Payouts for creators

### Database Changes
```
credit_packages
  id (PK)
  name, credits, price_cents
  is_popular, is_active
  created_at

payouts
  id (PK), seller_id (FK)
  amount_cents, status
  stripe_transfer_id
  created_at, processed_at
```

### API Routes
```
GET    /api/credits/packages       - List credit packages
POST   /api/credits/purchase       - Purchase credits
GET    /api/credits/balance        - Get credit balance
GET    /api/credits/transactions   - Transaction history
POST   /api/payments/create-session - Create Stripe session
POST   /api/payments/webhook       - Stripe webhook
GET    /api/payouts                - Creator payouts
POST   /api/payouts/request        - Request payout
```

### Frontend
- Credit purchase modal
- Wallet page with balance
- Transaction history view
- Payout request form (creators)

### Infrastructure
- Stripe account setup
- Webhook endpoint
- Payment flow testing

### Task Checklist

#### API
- [ ] Create Stripe integration
- [ ] Implement credit purchase flow
- [ ] Implement webhook handling
- [ ] Create transaction service
- [ ] Implement payout logic

#### Database
- [ ] Create credit packages seed data
- [ ] Add transaction type for purchases
- [ ] Create payout tracking

#### Web
- [ ] Build credit purchase modal
- [ ] Build wallet page
- [ ] Build transaction history
- [ ] Build payout request form
- [ ] Add Stripe checkout redirect

#### Mobile
- [ ] Build wallet screen
- [ ] Build purchase flow
- [ ] Display transaction history

#### Admin
- [ ] Add credit package management
- [ ] Add payout approval workflow
- [ ] Add transaction monitoring

### Definition of Done
- [ ] Users can purchase credits
- [ ] Credits deducted on enrollment
- [ ] Transaction history is accurate
- [ ] Creators can request payouts

---

## Phase 7 — Admin Polish & Analytics
*Goal: Complete admin experience with analytics and moderation tools*
*Depends on: All previous phases*
*Estimated effort: 1-2 sessions*

### What's New
- Complete admin dashboard
- User management tools
- Content moderation queue
- Platform analytics
- Announcement system

### Database Changes
None

### API Routes
```
GET  /api/admin/analytics        - Platform stats
GET  /api/admin/users            - User list with filters
PATCH /api/admin/users/:id       - Update user (ban, role change)
GET  /api/admin/reports          - Content reports
POST /api/admin/announcements    - Create announcement
GET  /api/admin/announcements    - List announcements
```

### Frontend (Admin)
- Dashboard with key metrics
- User management table
- Content moderation queue
- Analytics charts
- Announcement editor

### Task Checklist

#### API
- [ ] Create admin analytics endpoint
- [ ] Implement user management endpoints
- [ ] Create moderation endpoints
- [ ] Add announcement endpoints

#### Admin Dashboard
- [ ] Build metrics cards
- [ ] Build user management table
- [ ] Build moderation queue
- [ ] Add analytics charts
- [ ] Build announcement system

#### Polish
- [ ] Add proper admin authentication
- [ ] Implement role-based access
- [ ] Add audit logging
- [ ] Improve mobile responsiveness

### Definition of Done
- [ ] Admin can view platform metrics
- [ ] Admin can manage users
- [ ] Admin can moderate content
- [ ] Admin can send announcements
- [ ] All admin pages are responsive

---

## Deliberately Not Building (v1)

- **Real-time collaborative editing** — Too complex, not core to MVP
- **Native mobile apps** — PWA + Expo is sufficient for v1
- **Offline-first architecture** — We're cloud-native, users have connectivity
- **Video hosting** — Embed from YouTube/Vimeo instead
- **Complex permission system** — Simple role-based is enough
- **Multi-language content** — i18n exists, but content translation is out of scope
- **Mobile payments** — Web-first for payments, mobile can use web checkout

---

## Schema Evolution Map

| Table | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 | Phase 6 | Phase 7 |
|-------|---------|---------|---------|---------|---------|---------|---------|
| profiles | ✓ | | | | | | |
| goals | ✓ | | | | | | |
| milestones | ✓ | | | | | | |
| opportunities | ✓ | | | | | | |
| creator_applications | ✓ | | | | | | |
| marketplace_listings | ✓ | | | | | | |
| marketplace_enrollments | ✓ | | | | | | |
| tickets | ✓ | | | | | | |
| transactions | ✓ | | | | | | |
| api_keys | | ✓ | | | | | |
| audit_logs | | ✓ | | | | | |
| marketplace_reviews | | | | ✓ | | | |
| chat_conversations | | | | | ✓ | | |
| chat_messages | | | | | ✓ | | |
| recommendations | | | | | ✓ | | |
| credit_packages | | | | | | ✓ | |
| payouts | | | | | | ✓ | |

---

## API Surface Map

| Route | Phase | Auth | Purpose |
|-------|-------|------|---------|
| POST /api/auth/session | 2 | Clerk | Session validation |
| GET/PATCH /api/profiles/:id | 2 | Yes | Profile management |
| GET/POST/PATCH/DELETE /api/goals/* | 2 | Yes | Goals CRUD |
| GET/POST /api/opportunities/* | 2 | Yes/Admin | Opportunities |
| GET/POST/PATCH /api/creators/* | 2 | Yes/Admin | Creator apps |
| POST /api/notifications/* | 3 | Yes | Push notifications |
| GET/POST/PATCH/DELETE /api/marketplace/* | 4 | Yes | Marketplace |
| POST /api/chat/* | 5 | Yes | AI chat |
| GET /api/recommendations | 5 | Yes | AI recommendations |
| POST /api/credits/* | 6 | Yes | Credit management |
| POST /api/payments/* | 6 | Yes | Stripe integration |
| GET/PATCH /api/admin/* | 7 | Admin | Admin operations |

---

## Current Status

**Sprint 0 — Mobile Deployment Polish** (ACTIVE - 1 week timeline)
*Goal: Production-ready mobile app with secure API, notifications, and app store deployment*

---

## Sprint 0 — Mobile Deployment Polish
*Goal: Production-ready mobile app within 1 week*
*Focus: API Auth, Notifications, App Store Deployment, UX Polish*
*Status: In Progress*

### Phase S0.1 — API Auth Security
*Goal: Replace insecure x-user-id headers with proper JWT validation*
*Estimated effort: 1 session*

#### Backend
- [ ] Install `@clerk/clerk-sdk-node` in `services/api`
- [ ] Create `ClerkAuthGuard` using Clerk's session verification
- [ ] Create `@CurrentUser()` decorator to extract userId from JWT
- [ ] Update `GoalsController` to use guard + decorator
- [ ] Update `CreatorController` to use guard + decorator
- [ ] Remove all `@Headers('x-user-id')` patterns
- [ ] Add global auth guard with public route decorator

#### Mobile
- [ ] Update API calls to include Clerk session token in Authorization header
- [ ] Create `apiClient.ts` with automatic token injection
- [ ] Update all fetch calls to use authenticated client

#### Definition of Done
- [ ] All protected routes reject unauthenticated requests
- [ ] userId extracted from JWT, not headers
- [ ] Mobile app passes auth tokens correctly
- [ ] Manual test: call API without token = 401

---

### Phase S0.2 — Push Notifications
*Goal: Enable push notifications for key user events*
*Estimated effort: 1-2 sessions*

#### Mobile
- [ ] Install `expo-notifications`
- [ ] Create `usePushNotifications` hook
- [ ] Request permissions on app launch (after onboarding)
- [ ] Register token with backend after sign-in
- [ ] Handle incoming notifications (foreground/background)
- [ ] Handle notification taps -> navigate to relevant screen

#### Backend
- [ ] Create `NotificationsModule` in NestJS
- [ ] `POST /notifications/register-token` endpoint
- [ ] Create `NotificationService` for sending pushes
- [ ] Integrate with opportunity deadlines (reminders)
- [ ] Integrate with goal progress (motivation)
- [ ] Integrate with marketplace (enrollment confirmations)

#### Definition of Done
- [ ] User grants notification permission
- [ ] Token stored in database
- [ ] Test notification sent from backend arrives on device
- [ ] Tapping notification opens correct screen

---

### Phase S0.3 — UX Polish
*Goal: Smooth, professional user experience*
*Estimated effort: 1-2 sessions*

#### Loading States
- [ ] Create `Skeleton` component
- [ ] Add skeletons to Dashboard
- [ ] Add skeletons to Opportunities list
- [ ] Add skeletons to Marketplace

#### Error Handling
- [ ] Create `ErrorBoundary` component
- [ ] Create `ErrorMessage` component with retry
- [ ] Add try/catch with retry to all API calls
- [ ] Add toast notifications for errors

#### Empty States
- [ ] Create `EmptyState` component
- [ ] Empty state for Opportunities (no matches)
- [ ] Empty state for Marketplace (no listings)
- [ ] Empty state for Wallet (no transactions)

#### Interactions
- [ ] Add `expo-haptics` for tactile feedback
- [ ] Pull-to-refresh on all lists
- [ ] Optimistic updates for enrollments
- [ ] Success toasts for actions

#### Offline
- [ ] Add network status indicator
- [ ] Cache opportunities locally (AsyncStorage)
- [ ] Show offline banner when disconnected

#### Definition of Done
- [ ] No white flash during loading
- [ ] All errors show user-friendly message
- [ ] All empty states have illustrations
- [ ] Pull-to-refresh works on all lists
- [ ] Offline state is visible

---

### Phase S0.4 — App Store Deployment
*Goal: Deploy to iOS App Store and Google Play*
*Estimated effort: 1-2 sessions*

#### Configuration
- [ ] Install EAS CLI: `npm install -g eas-cli`
- [ ] Run `eas build:configure`
- [ ] Configure `eas.json` for production builds
- [ ] Set app.json bundle identifiers

#### Assets
- [ ] Create app icon (1024x1024)
- [ ] Create adaptive icon for Android
- [ ] Create splash screen
- [ ] Create store screenshots (6.7", 6.5", 5.5" for iOS)
- [ ] Create store screenshots for Android

#### Apple App Store
- [ ] Create App Store Connect app
- [ ] `eas build --platform ios --profile production`
- [ ] `eas submit --platform ios`
- [ ] Fill App Store listing (title, description, keywords)
- [ ] Upload screenshots
- [ ] Submit for review

#### Google Play
- [ ] Create Google Play Console app
- [ ] `eas build --platform android --profile production`
- [ ] `eas submit --platform android`
- [ ] Fill Play Store listing
- [ ] Upload screenshots
- [ ] Submit for review

#### Definition of Done
- [ ] iOS app builds successfully via EAS
- [ ] Android app builds successfully via EAS
- [ ] Apps submitted to both stores
- [ ] Store listings complete with screenshots

---

## Future Phases

**Phase 1 — MVP Production Deploy** (Complete infrastructure deployment)