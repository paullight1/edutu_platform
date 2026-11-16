# Edutu Mobile - Implementation Roadmap

## Quick Summary

Your current architecture has **three separate systems** that need integration:

1. **Opportunities** (External API + Supabase fallback) - No user filtering
2. **Marketplace** (`community_stories` table) - Creator roadmaps
3. **Creator Listings** (Separate concept) - Monetizable content

## Current Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CURRENT STATE                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  External API (n8n/Admin)                                            │
│     ↓ GET /opportunities (no filtering)                              │
│  Mobile App                                                          │
│     ↓ Client-side match scoring                                      │
│  Dashboard shows personalized opportunities                          │
│                                                                       │
│  ─────────────────────────────────────────────────────────────       │
│                                                                       │
│  Creator Dashboard                                                     │
│     ↓ POST /marketplace/listings                                     │
│  Admin Panel (Web)                                                   │
│     ↓ Manual approval                                                │
│  Separate from opportunities flow                                    │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Three Implementation Plans Created

### 📄 PLAN-architecture-overview.md
**What**: Complete system diagram and data flow  
**Why**: Understand how everything connects  
**Read first**: ✅ Yes - gives you the big picture

### 📄 PLAN-opportunities-filtering.md  
**What**: API filtering by user profile  
**Why**: Currently ALL opportunities fetched, filtered client-side  
**Priority**: 🔴 HIGH - improves performance & relevance  
**Effort**: Medium (requires API changes)

### 📄 PLAN-marketplace-unification.md
**What**: Merge community stories + creator listings  
**Why**: Currently two separate tables/systems  
**Priority**: 🟡 MEDIUM - improves UX, reduces tech debt  
**Effort**: High (database migration + API changes)

### 📄 PLAN-user-preferences-sync.md
**What**: Sync Clerk user data to Supabase  
**Why**: Enable SQL filtering, API access to preferences  
**Priority**: 🔴 HIGH - required for opportunities filtering  
**Effort**: Medium (new table + sync service)

## Recommended Implementation Order

### Phase 1: Foundation (Week 1-2)
**Goal**: Enable user profile filtering

1. **Create `user_profiles` table** in Supabase
   - Sync Clerk metadata (interests, country, education)
   - RLS policies for security
   - Realtime subscriptions

2. **Create sync service** 
   - Webhook from Clerk → Supabase
   - Client-side sync as backup
   - Hook: `useUserProfile()`

3. **Update Dashboard**
   - Use Supabase profile instead of Clerk metadata
   - No visible change to users

**Result**: User preferences now in Supabase ✅

### Phase 2: Opportunities Filtering (Week 3-4)
**Goal**: Personalized opportunities from API

1. **Update API to accept query params**
   - `GET /opportunities?interests=tech&country=Kenya`
   - Server-side match scoring

2. **Update mobile app**
   - Send user profile in API calls
   - Remove client-side match calculation

3. **Add Supabase fallback filtering**
   - If API fails, filter in database

**Result**: Faster, more relevant opportunities ✅

### Phase 3: Marketplace Unification (Week 5-8)
**Goal**: Single marketplace for all user content

1. **Database migration**
   - Extend `community_stories` table
   - Migrate creator listings data
   - Update indexes

2. **Unified API**
   - `/marketplace` - all content types
   - `/marketplace/featured` - curated
   - Admin moderation endpoints

3. **Update mobile screens**
   - Marketplace tab shows all types
   - Creator dashboard unified
   - Type badges on cards

**Result**: One marketplace, one creator flow ✅

## Key Questions for You

### 1. External API Control
**Q**: Do you control the opportunities API (n8n/workflow)?
- **Yes**: Can add query param filtering → Use Option A from opportunities plan
- **No**: Must use client-side filtering → Use Option C (Supabase-only)

### 2. Marketplace Priority
**Q**: Is marketplace actively used by creators?
- **Yes**: Prioritize unification plan
- **No**: Can defer to Phase 3

### 3. User Data Sensitivity
**Q**: Can we store user preferences in Supabase?
- **Yes**: Proceed with user_profiles table
- **Concerns**: Can encrypt PII fields

## Quick Wins (No API Changes)

If external API can't be modified:

1. **Sync user profiles to Supabase** - Enables future filtering
2. **Improve client-side matching** - Better algorithms
3. **Cache opportunities** - Reduce API calls
4. **Add loading states** - Better perceived performance

## Files Changed Summary

After implementing all plans:

```
packages/core/src/
  services/
    opportunities.ts      ← Modified (add userProfile param)
    userProfile.ts        ← NEW (sync service)
    marketplace.ts        ← NEW (unified API)
  hooks/
    useOpportunities.ts   ← Modified (pass profile)
    useUserProfile.ts     ← NEW (profile sync)
    useMarketplace.ts     ← NEW (unified marketplace)
  types/
    opportunity.ts        ← Minor updates
    user.ts               ← NEW (UserProfile type)
    marketplace.ts        ← NEW (unified types)

app/
  (app)/
    index.tsx             ← Use useUserProfile hook
    explore.tsx           ← Pass profile to API
    marketplace.tsx       ← Major refactor (unified)
  creator-dashboard.tsx   ← Major refactor (unified)

supabase/
  migrations/
    001_user_profiles.sql ← NEW table
    002_marketplace.sql   ← Extend community_stories
  functions/
    clerk-webhook/        ← NEW Edge Function
```

## Next Steps

1. **Review the four plan documents**
2. **Decide on external API control**
3. **Prioritize which phase to start with**
4. **I can implement Phase 1 (user profiles) immediately**

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| External API doesn't support filtering | High | Fallback to client-side |
| Database migration issues | Medium | Test with backup, rollback plan |
| Clerk webhook failures | Low | Client-side sync as backup |
| Performance degradation | Medium | Add indexes, caching |

## Success Metrics

- **Phase 1**: User profiles sync successfully (< 1s delay)
- **Phase 2**: API response includes match scores (if API supports)
- **Phase 3**: Marketplace shows unified content, creator UX simplified

---

**Ready to start?** I can begin with Phase 1 (user profile sync) right now. Just confirm and I'll create the migration and sync service.
