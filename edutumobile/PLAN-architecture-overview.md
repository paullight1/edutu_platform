# Edutu Mobile - Architecture Plan

## Current Data Flow Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATA SOURCES                                   │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌──────────────────┐        ┌──────────────────┐                     │
│  │   External API   │        │    Supabase      │                     │
│  │  (n8n/Admin Feed)│        │   (PostgreSQL)   │                     │
│  └────────┬─────────┘        └────────┬─────────┘                     │
│           │                           │                                │
│           ▼                           ▼                                │
│  ┌──────────────────┐        ┌──────────────────┐                     │
│  │   Opportunities  │        │ Community Stories│                     │
│  │   (Read-only)    │        │  (Creator-made)  │                     │
│  │                  │        │                  │                     │
│  │ • Scholarships   │        │ • Roadmaps       │                     │
│  │ • Internships    │        │ • Courses        │                     │
│  │ • Fellowships    │        │ • Templates      │                     │
│  │ • Grants         │        │ • Events         │                     │
│  │ • Programs       │        │ • Resources      │                     │
│  └────────┬─────────┘        └────────┬─────────┘                     │
│           │                           │                                │
└───────────┼───────────────────────────┼────────────────────────────────┘
            │                           │
            ▼                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         MOBILE APP                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐           │
│  │   Explore    │    │  Dashboard   │    │ Marketplace  │           │
│  │    Tab       │    │   (Home)     │    │     Tab      │           │
│  └──────────────┘    └──────────────┘    └──────────────┘           │
│         │                   │                   │                    │
│         │                   │                   │                    │
│         ▼                   ▼                   ▼                    │
│  ┌──────────────────────────────────────────────────────┐           │
│  │              CLIENT-SIDE FILTERING                    │           │
│  │  • Category filters                                   │           │
│  │  • Search text                                        │           │
│  │  • Location (planned)                                 │           │
│  │  • User interests matching (partial)                  │           │
│  └──────────────────────────────────────────────────────┘           │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Table Structures

### opportunities (from API + Supabase fallback)
```typescript
{
  id: string
  title: string
  organization: string
  category: string
  location: string
  description: string
  requirements: string[]
  benefits: string[]
  deadline?: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  featured: boolean
  applyUrl: string
  image?: string
  // ... metadata
}
```

### community_stories (marketplace - Supabase)
```typescript
{
  id: string
  title: string
  summary: string
  category: string
  type: 'roadmap' | 'marketplace' | 'story'
  status: 'pending' | 'approved' | 'rejected'
  price: string
  creator_id: string
  roadmap: JSON[]
  stats: { users: number, rating: number }
  // ... content
}
```

### creator_listings (marketplace listings)
```typescript
{
  id: string
  title: string
  description: string
  category: 'course' | 'event' | 'mentorship' | 'template' | 'resource'
  price: number (credits)
  status: 'pending' | 'active' | 'rejected'
  creator_id: string
  enrollment_count: number
  // ... earnings tracking
}
```

## API Routes

### Opportunities API
```
GET  /opportunities?limit=50        → Returns all active opportunities
GET  /opportunities/:id             → Returns single opportunity
```

**⚠️ CURRENT LIMITATION**: No user profile filtering on API level

### Creator API
```
GET   /creator/dashboard            → Creator stats & listings
POST  /marketplace/listings         → Create new listing (pending approval)
```

## Current Filtering Logic (Client-Side)

### Dashboard Home (`app/(app)/index.tsx`)
```typescript
// Personalization based on user.unsafeMetadata
const userInterests = user?.unsafeMetadata?.interests || []
const userCountry = user?.unsafeMetadata?.country || ''

// Match score calculation (CLIENT-SIDE ONLY)
const personalizedOpportunities = opportunities.map(opp => {
  let matchScore = 0
  
  // Check category matches user interests
  if (userInterests.some(interest => 
    opp.category.toLowerCase().includes(interest.toLowerCase())
  )) matchScore += 50
  
  // Check location matches user country
  if (userCountry && opp.location.toLowerCase().includes(userCountry.toLowerCase()))
    matchScore += 30
  
  // Check if remote
  if (opp.location.toLowerCase().includes('remote'))
    matchScore += 20
  
  return { ...opp, match: matchScore }
}).sort((a, b) => b.match - a.match)
```

### Explore Tab (`app/(app)/explore.tsx`)
```typescript
// Simple category + search filtering (NO user profile)
const filteredOpportunities = opportunities.filter(opp => {
  if (selectedCategory !== 'All' && opp.category !== selectedCategory) return false
  if (searchTerm && !matchesSearch(opp, searchTerm)) return false
  return true
})
```

## Key Issues & Gaps

1. **No API-Level Filtering**: The external API returns ALL opportunities; filtering happens client-side
2. **Duplicate Data Sources**: Opportunities come from API, but fallback to Supabase
3. **No Server-Side Personalization**: Match scores calculated on device
4. **Creator Listings Separate**: Marketplace uses different table (`community_stories` vs `creator_listings`)
5. **No User Preference Sync**: Interests stored in Clerk metadata, not synced to Supabase

## Improvement Opportunities

See companion docs:
- `plan-opportunities-filtering.md` - API filtering implementation
- `plan-marketplace-unification.md` - Consolidate marketplace tables
- `plan-user-preferences-sync.md` - Sync Clerk metadata to Supabase
