# Edutu Database & Implementation Status

**Date**: April 12, 2026  
**Source**: `supabase_schema.sql` + codebase analysis

---

## ✅ WHAT'S ALREADY BUILT

### Database Schema (Complete)
The Supabase schema file shows all tables already exist:

| Table | Status | Purpose |
|-------|--------|---------|
| `profiles` | ✅ Ready | User profiles with interests, country, education_level |
| `opportunities` | ✅ Ready | Opportunity listings with featured, category, difficulty |
| `marketplace_items` | ✅ Ready | Creator listings (course, mentorship, template, resource) |
| `community_stories` | ✅ Ready | Community content (stories, roadmaps) |
| `goals` | ✅ Ready | User goals tracking |
| `chat_threads/messages` | ✅ Ready | AI chat |
| `notifications` | ✅ Ready | User notifications |
| `user_purchases` | ✅ Ready | Marketplace purchase tracking |

### RLS Policies (Complete)
All tables have Row Level Security configured:
- Users can only access their own data
- Opportunities/marketplace items are publicly readable
- Creators can manage their own content

### Indexes (Complete)
Performance indexes exist for all foreign keys and common queries.

---

## ❌ WHAT'S MISSING / NOT CONNECTED

### 1. Clerk → Supabase Sync (CRITICAL GAP)

**Current State**:
- User data stored in Clerk `unsafeMetadata`
- Supabase `profiles` table exists but is NOT populated from Clerk
- App reads from Clerk directly

**Evidence**:
```typescript
// app/(app)/index.tsx - Line 239-240
const userInterests = (user?.unsafeMetadata?.interests as string[]) || [];
const userCountry = (user?.unsafeMetadata?.country as string) || '';
```

**Problem**:
- External API can't access Clerk metadata
- No SQL querying possible by user preferences
- Data exists in TWO places (Clerk + empty Supabase table)

### 2. Opportunities Filtering (CLIENT-SIDE ONLY)

**Current State**:
- API returns ALL opportunities (`GET /opportunities?limit=50`)
- Filtering happens in Dashboard component
- No server-side personalization

**Evidence**:
```typescript
// packages/core/src/services/opportunities.ts - Line 66
const response = await fetch(`${API_BASE_URL}/opportunities?limit=50`)
// No user profile params sent!
```

**Problem**:
- Wasteful: ALL opportunities fetched every time
- Slow client-side processing
- Can't filter at database level

### 3. Marketplace Split (ARCHITECTURE DEBT)

**Current State**:
- `marketplace_items` - Creator monetizable content
- `community_stories` - User stories/roadmaps
- Both shown in different places

**Problem**:
- Two tables for similar content
- Creator dashboard creates "listings"
- Marketplace tab shows "stories"
- Confusing UX

---

## 🔍 CURRENT DATA FLOW

```
┌─────────────────────────────────────────────────────────────────┐
│                        CURRENT REALITY                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐                                               │
│  │    CLERK     │ ←── User auth + metadata storage             │
│  │  (metadata)  │      • interests[]                           │
│  └──────┬───────┘      • country                               │
│         │              • educationLevel                        │
│         │              • onboardingComplete                    │
│         │                                                      │
│         │ (NOT synced!)                                        │
│         ▼                                                      │
│  ┌──────────────┐     ┌──────────────────┐                    │
│  │   SUPABASE   │     │   External API   │                    │
│  │   (empty!)   │     │  /opportunities  │                    │
│  │ profiles table│     │   (no filters)   │                    │
│  └──────────────┘     └────────┬─────────┘                    │
│                                 │                               │
│                                 ▼                               │
│                         Mobile App receives                    │
│                         ALL opportunities                      │
│                                 │                               │
│                                 ▼                               │
│  ┌─────────────────────────────────────────────────────┐       │
│  │                 CLIENT-SIDE FILTERING                │       │
│  │  Dashboard calculates match scores manually          │       │
│  │  using Clerk.unsafeMetadata                          │       │
│  └─────────────────────────────────────────────────────┘       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 PHASE RECOMMENDATION

### Start with: **PHASE 1 - User Profile Sync**

**Why this first?**
1. ✅ Database table already exists (`profiles`)
2. ✅ Required for ALL other improvements
3. ✅ Unblocks API filtering (Phase 2)
4. ✅ Low risk - additive change only

**What to build:**
1. **Sync Service** - Copy Clerk metadata to Supabase on:
   - App startup
   - After onboarding completion
   - Profile updates

2. **Hook** - `useUserProfile()` that:
   - Reads from Supabase (not Clerk)
   - Subscribes to realtime updates
   - Falls back to Clerk if no data

3. **Migration** - Backfill existing users

**Code changes:**
```typescript
// BEFORE (current)
const userInterests = user?.unsafeMetadata?.interests;

// AFTER (Phase 1)
const { profile } = useUserProfile();
const userInterests = profile?.interests;
```

---

## 📊 IMPLEMENTATION CHECKLIST

### Phase 1: Profile Sync (Week 1) 🎯 START HERE
- [ ] Create `syncUserProfile()` service
- [ ] Create `useUserProfile()` hook
- [ ] Update onboarding to sync on completion
- [ ] Backfill existing users
- [ ] Update Dashboard to use Supabase profile

### Phase 2: API Filtering (Week 2-3)
- [ ] Modify API to accept query params (you control it)
- [ ] Update `fetchOpportunities()` to send profile
- [ ] Remove client-side match calculation
- [ ] Test with various user profiles

### Phase 3: Marketplace Unification (Week 4-6)
- [ ] Merge `community_stories` into `marketplace_items`
- [ ] Add content type enum (roadmap, guide, story)
- [ ] Update creator dashboard
- [ ] Update marketplace tab
- [ ] Migration script for existing data

---

## ❓ DECISIONS NEEDED

### Q1: Profile Sync Trigger
When should we sync Clerk → Supabase?
- **Option A**: Webhook from Clerk (automatic)
- **Option B**: Client-side on app load (manual)
- **Option C**: Both (recommended)

### Q2: Existing Users
How to backfill current users?
- **Option A**: One-time migration script
- **Option B**: Lazy sync (on app open)
- **Option C**: Both

### Q3: Source of Truth
If conflict between Clerk and Supabase, which wins?
- **Option A**: Clerk always wins (source of truth)
- **Option B**: Last updated wins
- **Option C**: Supabase wins (after initial sync)

---

## 🚀 READY TO START?

**I can implement Phase 1 right now:**

1. Create `packages/core/src/services/userProfile.ts`
2. Create `packages/core/src/hooks/useUserProfile.ts`
3. Update onboarding flow to sync
4. Update Dashboard to use new hook

**Estimated time**: 2-3 hours  
**Risk**: Low (additive, no breaking changes)  
**Value**: Unlocks all future improvements

**Confirm to proceed with Phase 1?**
