# Edutu Web App — Feature Parity Roadmap

**Goal**: Bring `edutu-web-app` to feature parity with `edutu_mobile` while keeping Supabase Auth, dark/light themes only, and skipping voice features.

**Decision Matrix**:
| Feature | Mobile | Web (current) | Action |
|---------|--------|---------------|--------|
| Auth | Clerk | Supabase Auth | **Keep Supabase Auth** |
| Themes | Dark/Light/System | Dark/Light | **Keep dark/light only** |
| Voice | TTS + Recording | Not present | **Skip for now** |
| Saved/Bookmarks | Yes | No | **Build** |
| Applied Tracker | Yes | No | **Build** |
| Deadlines | Yes | No | **Build** |
| AI Roadmap Wizard | 5-step | Partial | **Build full wizard** |
| Wallet/Credits | Yes | No | **Build** |
| Paywall/Pro | RevenueCat | No | **Build (web payments)** |
| Creator System | Yes | No | **Build** |
| Calendar Strip | Yes | No | **Build** |
| Profile Completeness | Yes | Partial | **Enhance** |

---

## 1. Data Model — New Tables & Columns

### 1.1 New Tables

#### `bookmarks`
| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `uuid` | PK, default gen_random_uuid() | Bookmark ID |
| `user_id` | `uuid` | NOT NULL, FK → profiles.user_id | User who bookmarked |
| `opportunity_id` | `uuid` | NOT NULL, FK → opportunities.id | Bookmarked opportunity |
| `created_at` | `timestamptz` | DEFAULT now() | Bookmark timestamp |

**Indexes**: `idx_bookmarks_user_id`, `idx_bookmarks_opportunity_id`, unique(`user_id`, `opportunity_id`)

#### `applications`
| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `uuid` | PK | Application ID |
| `user_id` | `uuid` | NOT NULL, FK → profiles.user_id | User who applied |
| `opportunity_id` | `uuid` | NOT NULL, FK → opportunities.id | Applied opportunity |
| `status` | `text` | DEFAULT 'applied' | 'applied', 'under_review', 'accepted', 'rejected', 'withdrawn' |
| `applied_at` | `timestamptz` | DEFAULT now() | Application timestamp |
| `cover_letter` | `text` | NULLABLE | Optional cover letter |
| `documents` | `jsonb` | NULLABLE | Array of uploaded doc URLs |
| `notes` | `text` | NULLABLE | User's personal notes |

**Indexes**: `idx_applications_user_id`, `idx_applications_status`

#### `credit_transactions`
| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `uuid` | PK | Transaction ID |
| `user_id` | `uuid` | NOT NULL, FK → profiles.user_id | User |
| `type` | `text` | NOT NULL | 'purchase', 'spend', 'refund', 'reward', 'creator_earning' |
| `amount` | `integer` | NOT NULL | Positive = credit, negative = debit |
| `balance_after` | `integer` | NOT NULL | Snapshot of balance after tx |
| `description` | `text` | NULLABLE | Human-readable description |
| `reference_id` | `text` | NULLABLE | External payment reference |
| `metadata` | `jsonb` | NULLABLE | Additional context |
| `created_at` | `timestamptz` | DEFAULT now() | Timestamp |

**Indexes**: `idx_credit_transactions_user_id`, `idx_credit_transactions_type`

#### `payment_transactions`
| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `uuid` | PK | Payment ID |
| `user_id` | `uuid` | NOT NULL | User who paid |
| `type` | `text` | NOT NULL | 'credit_purchase', 'pro_subscription', 'creator_payout' |
| `amount` | `integer` | NOT NULL | Amount in smallest currency unit (cents) |
| `currency` | `text` | DEFAULT 'usd' | ISO currency code |
| `status` | `text` | DEFAULT 'pending' | 'pending', 'completed', 'failed', 'refunded' |
| `provider` | `text` | NULLABLE | 'stripe', 'flutterwave', 'paystack' |
| `provider_ref` | `text` | NULLABLE | External provider reference |
| `credits_granted` | `integer` | NULLABLE | Credits added if applicable |
| `metadata` | `jsonb` | NULLABLE | Provider response data |
| `created_at` | `timestamptz` | DEFAULT now() | Timestamp |
| `updated_at` | `timestamptz` | DEFAULT now() | Updated timestamp |

#### `creator_applications_web`
| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `uuid` | PK | Application ID |
| `user_id` | `uuid` | NOT NULL, FK → profiles.user_id | Applicant |
| `motivation` | `text` | NOT NULL | Why they want to be a creator |
| `opportunity_type` | `text` | NOT NULL | Type of opportunity they won |
| `opportunity_title` | `text` | NOT NULL | Name of the opportunity |
| `linkedin_url` | `text` | NULLABLE | LinkedIn profile |
| `proof_url` | `text` | NULLABLE | Proof of achievement |
| `portfolio_url` | `text` | NULLABLE | Portfolio link |
| `bio` | `text` | NOT NULL | Creator bio |
| `social_links` | `text` | NULLABLE | Comma-separated social links |
| `kyc_image_url` | `text` | NULLABLE | KYC document URL |
| `status` | `text` | DEFAULT 'pending' | 'pending', 'approved', 'rejected' |
| `admin_note` | `text` | NULLABLE | Admin review notes |
| `reviewed_by` | `uuid` | NULLABLE | Admin who reviewed |
| `reviewed_at` | `timestamptz` | NULLABLE | Review timestamp |
| `applied_at` | `timestamptz` | DEFAULT now() | Submission timestamp |

#### `roadmap_intents` (renamed from `user_roadmap_intents` for web)
Already exists as `user_roadmap_intents` in schema. Add web-specific UI layer.

#### `user_calendar_events`
| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `uuid` | PK | Event ID |
| `user_id` | `uuid` | NOT NULL | User |
| `title` | `text` | NOT NULL | Event title |
| `description` | `text` | NULLABLE | Event description |
| `event_date` | `date` | NOT NULL | Event date |
| `event_type` | `text` | NOT NULL | 'deadline', 'reminder', 'custom', 'roadmap_milestone' |
| `source_id` | `text` | NULLABLE | Reference to originating entity |
| `color` | `text` | DEFAULT '#6366F1' | Calendar color |
| `is_all_day` | `boolean` | DEFAULT true | All-day event flag |
| `created_at` | `timestamptz` | DEFAULT now() | Timestamp |

### 1.2 Columns to Add to Existing Tables

#### `profiles` (additions)
| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `is_pro` | `boolean` | `false` | Pro subscription status |
| `pro_since` | `timestamptz` | NULL | When pro started |
| `subscription_id` | `text` | NULL | External subscription ID |
| `subscription_ends` | `timestamptz` | NULL | Subscription expiry |
| `credits_balance` | `integer` | `0` | **Already exists** — verify |
| `creator_status` | `text` | `'none'` | **Already exists** — verify |
| `interests` | `text[]` | `{}` | User interests for matching |
| `ambitions` | `text[]` | `{}` | Career goals |
| `education` | `text` | NULL | Education level |
| `field_of_study` | `text` | NULL | Major/field |

> **Note**: Check if `credits_balance`, `creator_status` already exist in Supabase. The Drizzle schema shows them, but Supabase may differ.

---

## 2. API Routes Needed

All routes go through the NestJS backend at `backend/services/services/api/`.

### 2.1 Bookmarks
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET` | `/bookmarks` | Yes | List user's bookmarked opportunities |
| `POST` | `/bookmarks/:opportunityId` | Yes | Bookmark an opportunity |
| `DELETE` | `/bookmarks/:opportunityId` | Yes | Remove bookmark |
| `GET` | `/bookmarks/:opportunityId/status` | Yes | Check if opportunity is bookmarked |

### 2.2 Applications
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET` | `/applications` | Yes | List user's applications |
| `POST` | `/applications` | Yes | Create application for opportunity |
| `PATCH` | `/applications/:id` | Yes | Update application status/notes |
| `DELETE` | `/applications/:id` | Yes | Withdraw application |
| `GET` | `/applications/stats` | Yes | Get application statistics |

### 2.3 Deadlines
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET` | `/deadlines` | Yes | Aggregated deadlines from bookmarks + applications |
| `GET` | `/deadlines/upcoming` | Yes | Upcoming deadlines (next 30 days) |
| `POST` | `/deadlines/custom` | Yes | Add custom deadline reminder |

### 2.4 Wallet & Credits
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET` | `/wallet/balance` | Yes | Get credit balance |
| `GET` | `/wallet/transactions` | Yes | List credit transactions |
| `POST` | `/wallet/spend` | Yes | Spend credits (RPC or service) |
| `POST` | `/wallet/purchase-intent` | Yes | Create Stripe checkout session |
| `POST` | `/wallet/webhook/stripe` | No | Stripe webhook handler |

### 2.5 Pro Subscription
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET` | `/pro/status` | Yes | Check pro subscription status |
| `POST` | `/pro/subscribe` | Yes | Create Stripe subscription checkout |
| `POST` | `/pro/cancel` | Yes | Cancel subscription |
| `POST` | `/pro/webhook/stripe` | No | Stripe subscription webhook |

### 2.6 Creator System
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `POST` | `/creator/apply` | Yes | Submit creator application |
| `GET` | `/creator/status` | Yes | Get creator application status |
| `GET` | `/creator/dashboard` | Yes (approved) | Creator dashboard data |
| `POST` | `/creator/listings` | Yes (approved) | Create roadmap listing |
| `GET` | `/creator/listings` | Yes (approved) | List creator's roadmaps |
| `PATCH` | `/creator/listings/:id` | Yes (approved) | Update listing |
| `GET` | `/admin/creator-applications` | Yes (admin) | List all creator applications |
| `PATCH` | `/admin/creator-applications/:id` | Yes (admin) | Review application |

### 2.7 AI Roadmap Wizard
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `POST` | `/roadmaps/ai/assist` | Yes | Generate AI questions for intent |
| `POST` | `/roadmaps/intent` | Yes | Submit user intent answers |
| `GET` | `/roadmaps/intent` | Yes | Check if user has submitted intent |
| `GET` | `/roadmaps/recommended` | Yes | Get personalized roadmap recommendations |
| `POST` | `/roadmaps/enroll/:id` | Yes | Enroll in a roadmap |
| `POST` | `/roadmaps/feedback` | Yes | Submit roadmap feedback |

### 2.8 Profile Completeness
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET` | `/profile/completeness` | Yes | Get profile completeness score |
| `GET` | `/profile/preferences` | Yes | Get user opportunity preferences |
| `PATCH` | `/profile/preferences` | Yes | Update preferences |

---

## 3. Frontend Components to Build

### Phase 1 Components

#### `src/components/SavedOpportunities.tsx`
- Grid/list view of bookmarked opportunities
- Filter tabs: All, Urgent (≤7 days), Upcoming
- Deadline countdown badges with color coding
- Remove bookmark action
- Empty state with CTA to browse opportunities
- Profile completeness banner integration

#### `src/components/AppliedTracker.tsx`
- List of applied opportunities/roadmaps
- Status badges: Applied, Under Review, Accepted, Rejected
- Filter by status and category
- Application date tracking
- Empty state

#### `src/components/DeadlinesAggregator.tsx`
- Grouped deadline view: This Week, Next Week, This Month, Later
- Deadline urgency indicators (red/amber/green)
- Type badges: Applied vs Bookmarked
- Quick navigation to opportunity detail
- Stats header: total count + urgent count

#### `src/services/bookmarks.ts`
- `fetchSavedOpportunities(userId)`
- `saveOpportunity(userId, opportunityId)`
- `unsaveOpportunity(userId, bookmarkId)`
- `isOpportunitySaved(userId, opportunityId)`
- `toggleSavedOpportunity(userId, opportunityId)`

#### `src/services/applications.ts`
- `fetchApplications(userId)`
- `applyToOpportunity(userId, opportunityId, data)`
- `updateApplication(id, updates)`
- `withdrawApplication(id)`

#### `src/hooks/useBookmarks.ts`
- React hook wrapping bookmark service
- Optimistic updates
- Cache invalidation

#### `src/hooks/useApplications.ts`
- React hook for application state
- Stats aggregation

### Phase 2 Components

#### `src/components/AIRoadmapWizard.tsx`
- 5-step wizard modal:
  1. **Goals & Objectives** — What do you want to achieve?
  2. **Experience Level** — Beginner/Intermediate/Advanced
  3. **Time Commitment** — Hours per week
  4. **Learning Style** — Visual/Audio/Hands-on
  5. **Additional Context** — Free text
- AI-powered question generation (via `/roadmaps/ai/assist`)
- Progress indicator
- Skip option
- Results: recommended roadmaps list

#### `src/components/OpportunityDetailEnhanced.tsx`
- Extended opportunity detail with:
  - Bookmark button (save/unsave)
  - Apply button → opens application form
  - AI-generated summary section
  - Match score breakdown (reasons + risks)
  - Related roadmaps
  - Deadline countdown

#### `src/components/RoadmapDetailModal.tsx`
- Full roadmap detail (mirrors mobile modal):
  - Cover image
  - Stats grid (difficulty, duration, steps, enrolled)
  - Learning path (steps)
  - Resources
  - Enroll button
  - Feedback/rating modal

#### `src/services/roadmapIntent.ts`
- `submitIntent(userId, answers)`
- `checkIntent(userId)`
- `getRecommendedRoadmaps(userId)`
- `enrollInRoadmap(userId, roadmapId)`
- `submitFeedback(userId, roadmapId, feedback)`

### Phase 3 Components

#### `src/components/WalletScreen.tsx`
- Balance card with gradient background
- Credit balance display
- Quick actions: Buy Credits, Pro Upgrade
- Transaction history list
- Empty state

#### `src/components/PaywallModal.tsx`
- Pro subscription tiers (monthly/yearly)
- Credit packages (50, 200, 500, 1000)
- Feature comparison table
- Stripe Checkout integration
- Restore purchases

#### `src/components/CreditBalanceBadge.tsx`
- Small badge showing current credits (for header/nav)
- Clickable → opens wallet

#### `src/components/ProGuard.tsx`
- Wrapper component that gates content behind Pro
- Shows upgrade prompt if not Pro

#### `src/services/wallet.ts`
- `getBalance(userId)`
- `getTransactions(userId)`
- `createPurchaseIntent(userId, amount, type)`
- `handleStripeWebhook(data)`

#### `src/services/payments.ts`
- `createCheckoutSession(userId, productId)`
- `getSubscriptionStatus(userId)`
- `cancelSubscription(userId)`

#### `src/hooks/useCredits.ts`
- Credit balance hook
- Transaction history
- Spend credits function

#### `src/hooks/useProStatus.ts`
- Pro subscription status hook
- Auto-refresh on mount

### Phase 4 Components

#### `src/components/CreatorApplyWizard.tsx`
- 5-step application wizard:
  1. **Intro** — Benefits & stats
  2. **Motivation** — Select motivation
  3. **Achievement** — Opportunity type, name, LinkedIn
  4. **Verification** — KYC upload, bio
  5. **Review** — Summary & submit

#### `src/components/CreatorDashboard.tsx`
- Stats cards: Total Credits, Total Students, Roadmaps
- My Roadmaps list with status badges
- Create Roadmap button → opens wizard
- Rewards banner (85% revenue share)

#### `src/components/CreateRoadmapWizard.tsx`
- 4-step listing creation:
  1. **Basics** — Title, description, category, thumbnail, price
  2. **Curriculum** — Add stages (title, description, duration)
  3. **Resources** — Upload files/links
  4. **Review** — Preview & submit

#### `src/components/CreatorAccessGuard.tsx`
- Shows different UI based on creator status:
  - `none` → Apply CTA
  - `pending` → Waiting message
  - `rejected` → Reapply CTA
  - `approved` → Render children

#### `src/services/creator.ts`
- `applyToBeCreator(userId, application)`
- `getCreatorStatus(userId)`
- `getCreatorDashboard(userId)`
- `createListing(userId, listing)`
- `updateListing(id, updates)`

### Phase 5 Components

#### `src/components/CalendarStrip.tsx`
- Horizontal 7-day calendar strip
- Date selection
- Event dots for deadlines/reminders
- Navigate prev/next week
- Integration with `user_calendar_events`

#### `src/components/ProfileCompletenessBar.tsx`
- Progress bar showing completeness %
- Lists missing fields
- Clickable → navigates to profile edit
- Threshold-based prompts (>80% = complete)

#### `src/components/ProfileCompletenessBanner.tsx`
- Dismissible banner prompting profile completion
- Shows in relevant screens (Saved, Opportunities)
- Auto-dismiss for 7 days

#### `src/services/profileCompleteness.ts`
- `calculateCompleteness(profile)`
- `getMissingFields(profile)`
- `needsUpdate(profile)` — returns true if missing ≥ 2 fields

#### `src/hooks/useProfileCompleteness.ts`
- Combined hook: loads profile + preferences
- Calculates score
- Exposes missing fields, needsUpdate flag

### Phase 6 Components

#### `src/components/BottomNavigation.tsx`
- Responsive bottom nav for web (or top nav sidebar)
- Tabs: Home, Opportunities, Saved, Applied, Profile
- Badge counts on Saved/Applied

#### `src/components/OpportunityCard.tsx`
- Standardized opportunity card component
- Bookmark button
- Match score badge
- Deadline indicator
- Consistent across all screens

#### `src/components/EmptyState.tsx`
- Reusable empty state with icon, title, description, CTA
- Variants for different contexts

#### `src/components/DeadlineBadge.tsx`
- Reusable deadline countdown component
- Color coding by urgency

---

## 4. Database Migrations

### Migration 1: `001_create_bookmarks_table.sql`
```sql
CREATE TABLE IF NOT EXISTS bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, opportunity_id)
);

CREATE INDEX idx_bookmarks_user_id ON bookmarks(user_id);
CREATE INDEX idx_bookmarks_opportunity_id ON bookmarks(opportunity_id);

ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bookmarks" ON bookmarks
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create own bookmarks" ON bookmarks
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own bookmarks" ON bookmarks
  FOR DELETE USING (user_id = auth.uid());
```

### Migration 2: `002_create_applications_table.sql`
```sql
CREATE TABLE IF NOT EXISTS applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  status text DEFAULT 'applied',
  applied_at timestamptz DEFAULT now(),
  cover_letter text,
  documents jsonb,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_applications_user_id ON applications(user_id);
CREATE INDEX idx_applications_status ON applications(status);

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own applications" ON applications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create own applications" ON applications
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own applications" ON applications
  FOR UPDATE USING (user_id = auth.uid());
```

### Migration 3: `003_create_credit_transactions_table.sql`
```sql
CREATE TABLE IF NOT EXISTS credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  amount integer NOT NULL,
  balance_after integer NOT NULL,
  description text,
  reference_id text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX idx_credit_transactions_type ON credit_transactions(type);

ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions" ON credit_transactions
  FOR SELECT USING (user_id = auth.uid());
```

### Migration 4: `004_create_payment_transactions_table.sql`
```sql
CREATE TABLE IF NOT EXISTS payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  amount integer NOT NULL,
  currency text DEFAULT 'usd',
  status text DEFAULT 'pending',
  provider text,
  provider_ref text,
  credits_granted integer,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_payment_transactions_user_id ON payment_transactions(user_id);
CREATE INDEX idx_payment_transactions_status ON payment_transactions(status);

ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payments" ON payment_transactions
  FOR SELECT USING (user_id = auth.uid());
```

### Migration 5: `005_alter_profiles_add_columns.sql`
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_pro boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pro_since timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_id text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_ends timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS interests text[] DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ambitions text[] DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS education text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS field_of_study text;
```

### Migration 6: `006_create_user_calendar_events.sql`
```sql
CREATE TABLE IF NOT EXISTS user_calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  event_date date NOT NULL,
  event_type text NOT NULL,
  source_id text,
  color text DEFAULT '#6366F1',
  is_all_day boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_calendar_events_user_id ON user_calendar_events(user_id);
CREATE INDEX idx_calendar_events_date ON user_calendar_events(event_date);

ALTER TABLE user_calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own calendar events" ON user_calendar_events
  FOR ALL USING (user_id = auth.uid());
```

### Migration 7: `007_create_deduct_credits_function.sql`
```sql
CREATE OR REPLACE FUNCTION deduct_credits(
  user_uuid uuid,
  amount integer,
  reason text
)
RETURNS boolean AS $$
DECLARE
  current_balance integer;
BEGIN
  SELECT credits_balance INTO current_balance
  FROM profiles
  WHERE user_id = user_uuid;

  IF current_balance IS NULL OR current_balance < amount THEN
    RETURN false;
  END IF;

  UPDATE profiles
  SET credits_balance = credits_balance - amount
  WHERE user_id = user_uuid;

  INSERT INTO credit_transactions (user_id, type, amount, balance_after, description)
  VALUES (
    user_uuid,
    'spend',
    -amount,
    current_balance - amount,
    reason
  );

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Migration 8: `008_create_add_credits_function.sql`
```sql
CREATE OR REPLACE FUNCTION add_credits(
  user_uuid uuid,
  amount integer,
  reason text
)
RETURNS boolean AS $$
DECLARE
  current_balance integer;
BEGIN
  SELECT credits_balance INTO current_balance
  FROM profiles
  WHERE user_id = user_uuid;

  IF current_balance IS NULL THEN
    RETURN false;
  END IF;

  UPDATE profiles
  SET credits_balance = credits_balance + amount
  WHERE user_id = user_uuid;

  INSERT INTO credit_transactions (user_id, type, amount, balance_after, description)
  VALUES (
    user_uuid,
    'purchase',
    amount,
    current_balance + amount,
    reason
  );

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 5. Dependencies to Add

### 5.1 New npm Packages

| Package | Version | Purpose | Phase |
|---------|---------|---------|-------|
| `@stripe/stripe-js` | `^3.0.0` | Stripe.js for web checkout | 3 |
| `@stripe/react-stripe-js` | `^2.4.0` | React Stripe components | 3 |
| `date-fns` | Already installed | Date utilities | 1 |
| `react-big-calendar` | `^1.11.0` | Calendar component (for calendar strip base) | 5 |
| `recharts` | Already installed | Charts for wallet/creator analytics | 3 |

### 5.2 Backend Dependencies (NestJS)

| Package | Purpose | Phase |
|---------|---------|-------|
| `@nestjs/passport` | Auth guards for new routes | 1 |
| `@nestjs/jwt` | JWT token handling | 1 |
| `stripe` | Stripe SDK for payments | 3 |
| `drizzle-orm` | Already installed | All |

---

## 6. Phased Delivery Plan

### Phase 1: Core Missing Screens (Weeks 1-2)
**Goal**: Users can save, track applications, and see deadlines

**Deliverables**:
- [ ] Database migrations 1, 2 (bookmarks, applications)
- [ ] Backend: Bookmark API routes (GET, POST, DELETE, status)
- [ ] Backend: Application API routes (GET, POST, PATCH, DELETE, stats)
- [ ] Frontend: `SavedOpportunities.tsx` screen
- [ ] Frontend: `AppliedTracker.tsx` screen
- [ ] Frontend: `DeadlinesAggregator.tsx` screen
- [ ] Frontend: `useBookmarks.ts` hook
- [ ] Frontend: `useApplications.ts` hook
- [ ] Frontend: Add routes in `App.tsx` for `/app/saved`, `/app/applied`, `/app/deadlines`
- [ ] Frontend: Add bookmark button to `OpportunityDetail`
- [ ] Frontend: Add navigation links in `AppLayout` sidebar/nav

**Acceptance Criteria**:
- User can bookmark/unbookmark opportunities from detail view
- Saved screen shows all bookmarks with filter tabs
- Applied screen shows application history
- Deadlines screen aggregates from bookmarks + applications with time grouping
- RLS policies prevent cross-user data access

### Phase 2: Enhanced Opportunity Detail + AI Roadmap Wizard (Weeks 3-4)
**Goal**: Richer opportunity experience and personalized roadmap discovery

**Deliverables**:
- [ ] Backend: Roadmap intent API routes (POST assist, POST intent, GET intent, GET recommended, POST enroll, POST feedback)
- [ ] Frontend: `AIRoadmapWizard.tsx` — 5-step modal
- [ ] Frontend: `OpportunityDetailEnhanced.tsx` — bookmark, apply, match breakdown
- [ ] Frontend: `RoadmapDetailModal.tsx` — full roadmap detail view
- [ ] Frontend: `roadmapIntent.ts` service
- [ ] Frontend: Route `/app/roadmaps` for roadmap browsing
- [ ] Frontend: Route `/app/opportunity/:id` enhanced with save/apply
- [ ] Frontend: Route `/app/roadmap/:id` for individual roadmap

**Acceptance Criteria**:
- Wizard collects intent and saves to `user_roadmap_intents`
- Recommended roadmaps appear after intent submission
- Opportunity detail has bookmark toggle and apply button
- Roadmap detail shows steps, resources, enroll button
- Feedback modal works post-enrollment

### Phase 3: Wallet + Credits System (Weeks 5-6)
**Goal**: Users can buy credits and subscribe to Pro

**Deliverables**:
- [ ] Database migrations 3, 4, 7, 8 (credit_transactions, payment_transactions, RPC functions)
- [ ] Database migration 5 (profile columns: is_pro, pro_since, subscription_id)
- [ ] Backend: Stripe integration (checkout sessions, webhooks)
- [ ] Backend: Wallet API routes (balance, transactions, spend, purchase-intent)
- [ ] Backend: Pro API routes (status, subscribe, cancel, webhook)
- [ ] Backend: Install `stripe` package
- [ ] Frontend: Install `@stripe/stripe-js`, `@stripe/react-stripe-js`
- [ ] Frontend: `WalletScreen.tsx`
- [ ] Frontend: `PaywallModal.tsx`
- [ ] Frontend: `CreditBalanceBadge.tsx`
- [ ] Frontend: `ProGuard.tsx`
- [ ] Frontend: `useCredits.ts` hook
- [ ] Frontend: `useProStatus.ts` hook
- [ ] Frontend: `wallet.ts` service
- [ ] Frontend: `payments.ts` service
- [ ] Frontend: Route `/app/wallet`

**Acceptance Criteria**:
- Wallet screen shows balance and transaction history
- Paywall modal offers credit packages and Pro subscription
- Stripe Checkout opens and redirects back on completion
- Webhook handler credits user account automatically
- `deduct_credits` RPC works for spending
- Pro status gates premium features

### Phase 4: Creator System (Weeks 7-8)
**Goal**: Users can apply to become creators and submit roadmaps

**Deliverables**:
- [ ] Backend: Creator API routes (already partially exists — verify and extend)
- [ ] Backend: Admin creator application review routes
- [ ] Frontend: `CreatorApplyWizard.tsx` — 5-step application
- [ ] Frontend: `CreatorDashboard.tsx` — stats + listings
- [ ] Frontend: `CreateRoadmapWizard.tsx` — 4-step listing creation
- [ ] Frontend: `CreatorAccessGuard.tsx` — status-based rendering
- [ ] Frontend: `creator.ts` service
- [ ] Frontend: Route `/app/creator/apply`
- [ ] Frontend: Route `/app/creator/dashboard`
- [ ] Frontend: Route `/app/creator/create`
- [ ] Frontend: Route `/admin/creators` (admin review panel)
- [ ] Frontend: Add "Become a Creator" link in profile/roadmaps

**Acceptance Criteria**:
- Non-creators see application wizard
- Pending creators see waiting state
- Approved creators see dashboard with create button
- Creator can submit roadmap listings with stages and resources
- Admin can review and approve/reject applications
- Approved listings appear in community marketplace

### Phase 5: Calendar Strip + Profile Completeness (Weeks 9-10)
**Goal**: Visual deadline calendar and profile completion prompts

**Deliverables**:
- [ ] Database migration 6 (user_calendar_events)
- [ ] Backend: Calendar events API routes (CRUD)
- [ ] Backend: Profile completeness API route
- [ ] Frontend: `CalendarStrip.tsx` — 7-day horizontal strip
- [ ] Frontend: `ProfileCompletenessBar.tsx`
- [ ] Frontend: `ProfileCompletenessBanner.tsx`
- [ ] Frontend: `useProfileCompleteness.ts` hook
- [ ] Frontend: `profileCompleteness.ts` service
- [ ] Frontend: Integrate calendar into Deadlines screen
- [ ] Frontend: Integrate completeness banner into Saved, Opportunities screens
- [ ] Frontend: Auto-generate calendar events from bookmarks/applications deadlines

**Acceptance Criteria**:
- Calendar strip shows current week with event dots
- Clicking a date shows deadlines for that day
- Profile completeness calculates from 6 key fields
- Banner dismisses for 7 days
- Completeness > 80% triggers "complete" state
- Calendar auto-populates from opportunity deadlines

### Phase 6: Polish + Integration (Weeks 11-12)
**Goal**: Unified UX, consistent components, testing, and performance

**Deliverables**:
- [ ] Frontend: `BottomNavigation.tsx` / enhanced sidebar with all routes
- [ ] Frontend: `OpportunityCard.tsx` — standardized reusable card
- [ ] Frontend: `EmptyState.tsx` — reusable empty state
- [ ] Frontend: `DeadlineBadge.tsx` — reusable deadline component
- [ ] Frontend: Audit all screens for consistent design tokens
- [ ] Frontend: Add loading skeletons for all new screens
- [ ] Frontend: Error boundaries for new features
- [ ] Frontend: PWA offline support for saved opportunities (cache)
- [ ] Frontend: TypeCheck pass (`npm run typecheck`)
- [ ] Frontend: Lint pass (`npm run lint`)
- [ ] Integration: Test full user flow: signup → onboarding → browse → save → apply → wallet → creator
- [ ] Integration: Test admin flow: review creator applications
- [ ] Documentation: Update `CLAUDE.md` with new routes and components
- [ ] Documentation: Write component usage examples in `docs/`

**Acceptance Criteria**:
- All new screens use consistent design system tokens
- Loading states present on all async operations
- Empty states with CTAs for all list views
- No TypeScript errors
- No ESLint warnings
- PWA caches saved opportunities for offline viewing
- Full end-to-end user journey works without errors

---

## 7. Route Map (Final State)

| Route | Component | Phase |
|-------|-----------|-------|
| `/` | LandingPageV3 | Existing |
| `/auth` | AuthScreen | Existing |
| `/app/home` | Dashboard | Existing |
| `/app/opportunities` | AllOpportunities | Existing |
| `/app/opportunity/:id` | OpportunityDetailEnhanced | 2 |
| `/app/chat` | ChatInterface | Existing |
| `/app/profile` | Profile | Existing |
| `/app/goals` | AllGoals | Existing |
| `/app/community` | CommunityMarketplace | Existing |
| `/app/cv` | CVManagement | Existing |
| `/app/achievements` | AchievementsScreen | Existing |
| `/app/saved` | SavedOpportunities | **1** |
| `/app/applied` | AppliedTracker | **1** |
| `/app/deadlines` | DeadlinesAggregator | **1** |
| `/app/roadmaps` | RoadmapsScreen (browse + wizard) | **2** |
| `/app/roadmap/:id` | RoadmapDetail | **2** |
| `/app/wallet` | WalletScreen | **3** |
| `/app/creator/apply` | CreatorApplyWizard | **4** |
| `/app/creator/dashboard` | CreatorDashboard | **4** |
| `/app/creator/create` | CreateRoadmapWizard | **4** |
| `/app/personalization` | PersonalizationProfileScreen | Existing |
| `/app/settings` | SettingsMenu | Existing |
| `/admin/*` | AdminRoot + new creator review | **4** |

---

## 8. Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Stripe not available in target markets | High | Support Flutterwave/Paystack as fallback providers |
| Supabase RLS complexity | Medium | Test all policies with multiple user scenarios |
| Mobile-web data inconsistency | Medium | Use shared backend API for all data operations |
| Creator content quality | Medium | Admin review gate before public listing |
| Payment webhook failures | High | Idempotent webhook handling + retry queue |
| Calendar performance with many events | Low | Virtualized rendering + date-range queries |
| Profile completeness false positives | Low | Field validation on save + merge with preferences table |

---

## 9. Estimated Timeline

| Phase | Duration | Effort | Dependencies |
|-------|----------|--------|--------------|
| Phase 1 | 2 weeks | 80 hours | Database setup |
| Phase 2 | 2 weeks | 80 hours | Phase 1 complete |
| Phase 3 | 2 weeks | 100 hours | Stripe account setup |
| Phase 4 | 2 weeks | 80 hours | Phase 2 complete |
| Phase 5 | 2 weeks | 60 hours | Phase 1 complete |
| Phase 6 | 2 weeks | 80 hours | Phases 1-5 complete |
| **Total** | **12 weeks** | **~480 hours** | |

---

*Last updated: 2026-05-08*
*Author: AI Assistant*
