# Plan: Marketplace & Creator Listings Unification

## Current State

Two separate systems for user-generated content:

### 1. Community Stories (`community_stories` table)
**Purpose**: User-shared success stories, roadmaps
**Current Usage**: Marketplace tab shows roadmaps

```typescript
// Current community_stories fields
type: 'roadmap' | 'marketplace' | 'story'
category: string
status: 'pending' | 'approved' | 'rejected'
creator_id: string
roadmap: JSON[] // For roadmap type
```

### 2. Creator Listings (separate concept)
**Purpose**: Monetizable content (courses, events, mentorship)
**Current Usage**: Creator dashboard creates listings

```typescript
// Current creator_listings fields
category: 'course' | 'event' | 'mentorship' | 'template' | 'resource'
price: number (credits)
status: 'pending' | 'active' | 'rejected'
creator_id: string
```

## Problems

1. **Split Data**: Users can't see all creator content in one place
2. **Different Approval Flows**: Two separate moderation queues
3. **Confusing UX**: "Marketplace" shows roadmaps, but creator makes "listings"
4. **Missing Link**: No connection between opportunities and user-created paths

## Goal

Unify into single "Marketplace" experience where:
- Users discover ALL user-generated content (roadmaps + listings)
- Creators publish any type of content from one dashboard
- Admin moderation is centralized
- Content can reference official opportunities

## Proposed Unified Schema

### Option A: Single Table Extension (Recommended)

Extend `community_stories` to support all content types:

```sql
-- Modify existing community_stories table
ALTER TABLE community_stories 
  ADD COLUMN IF NOT EXISTS content_type VARCHAR(50) DEFAULT 'story',
  ADD COLUMN IF NOT EXISTS price INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'credits',
  ADD COLUMN IF NOT EXISTS enrolled_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS earnings INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS related_opportunity_ids UUID[],
  ADD COLUMN IF NOT EXISTS duration VARCHAR(50),
  ADD COLUMN IF NOT EXISTS difficulty VARCHAR(20),
  ADD COLUMN IF NOT EXISTS outcomes TEXT[];

-- Update type enum
-- Old: type: 'roadmap' | 'marketplace' | 'story'
-- New: content_type: 
--   'roadmap'       (success stories with steps)
--   'course'        (structured learning)
--   'event'         (live/recorded events)
--   'mentorship'    (1:1 guidance)
--   'template'      (downloadable resources)
--   'guide'         (how-to content)
```

**Migration Plan:**
```sql
-- Migrate existing data
UPDATE community_stories 
SET content_type = CASE 
  WHEN type = 'marketplace' THEN 'course'
  ELSE type
END;

-- Drop old column, rename new
ALTER TABLE community_stories DROP COLUMN type;
ALTER TABLE community_stories RENAME COLUMN content_type TO type;
```

### Option B: Separate Tables with Union View

Keep tables separate but create unified view:

```sql
-- Create view that combines both sources
CREATE VIEW marketplace_items AS
SELECT 
  id,
  title,
  summary as description,
  category,
  creator_id,
  'roadmap' as type,
  0 as price,
  status,
  created_at,
  updated_at
FROM community_stories
WHERE type IN ('roadmap', 'story')

UNION ALL

SELECT 
  id,
  title,
  description,
  category,
  creator_id,
  category as type, -- course, event, etc.
  price,
  status,
  created_at,
  updated_at
FROM creator_listings;
```

## Recommended: Option A

### Updated TypeScript Types

```typescript
// packages/core/src/types/marketplace.ts

export type MarketplaceItemType = 
  | 'roadmap'      // Career journeys with steps
  | 'course'       // Structured learning content
  | 'event'        // Live or recorded events
  | 'mentorship'   // 1:1 guidance sessions
  | 'template'     // Downloadable resources
  | 'guide'        // How-to articles/videos
  | 'opportunity'; // User-discovered opportunities;

export type MarketplaceItemStatus = 
  | 'draft'
  | 'pending_review' 
  | 'approved' 
  | 'rejected'
  | 'archived';

export interface MarketplaceItem {
  id: string;
  title: string;
  summary: string;
  description?: string;
  type: MarketplaceItemType;
  category: string;
  
  // Creator info
  creatorId: string;
  creatorName?: string;
  creatorAvatar?: string;
  
  // Pricing
  price: number;
  currency: 'credits' | 'usd';
  
  // Status & moderation
  status: MarketplaceItemStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  
  // Content
  coverImage?: string;
  content?: any; // Type-specific content
  roadmap?: RoadmapStage[];
  
  // For opportunities
  relatedOpportunityIds?: string[];
  
  // Stats
  enrolledCount: number;
  rating: number;
  reviewCount: number;
  earnings?: number;
  viewCount: number;
  
  // Metadata
  duration?: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  outcomes?: string[];
  
  createdAt: string;
  updatedAt: string;
}

export interface RoadmapStage {
  id: string;
  title: string;
  description?: string;
  duration?: string;
  order: number;
  resources?: Resource[];
}

export interface Resource {
  title: string;
  url?: string;
  type: 'article' | 'video' | 'document' | 'tool';
}
```

### API Endpoints

```typescript
// Unified marketplace API

// Discovery
GET   /marketplace                    → List items (with filters)
GET   /marketplace/:id                → Single item details
GET   /marketplace/featured           → Curated featured items
GET   /marketplace/by-creator/:id     → All items by creator
GET   /marketplace/related/:oppId     → Items related to opportunity

// Creator management
POST  /marketplace                    → Create new item (goes to pending)
PUT   /marketplace/:id                → Update item
DELETE /marketplace/:id               → Archive item
POST  /marketplace/:id/publish        → Submit for review

// Admin moderation
GET   /admin/marketplace/pending      → Queue for review
POST  /admin/marketplace/:id/approve  → Approve item
POST  /admin/marketplace/:id/reject   → Reject with reason

// User actions
POST  /marketplace/:id/enroll         → Enroll (deducts credits)
POST  /marketplace/:id/rate           → Add rating/review
POST  /marketplace/:id/bookmark       → Save for later
```

### Frontend Changes

#### 1. Update Marketplace Tab (`app/(app)/marketplace.tsx`)

```typescript
export default function Marketplace() {
  const [filter, setFilter] = useState<{
    type?: MarketplaceItemType[];
    category?: string;
    priceRange?: 'free' | 'paid' | 'all';
    sortBy?: 'popular' | 'newest' | 'rating';
  }>({});

  const { data: items, loading } = useMarketplace({
    supabase,
    filters: filter,
  });

  // Show unified grid of all content types
  // Cards show type badge (Roadmap, Course, Event, etc.)
  // Filter chips for types
}
```

#### 2. Update Creator Dashboard (`app/creator-dashboard.tsx`)

```typescript
// Single "Create" flow with type selector
const contentTypes = [
  { id: 'roadmap', label: 'Career Roadmap', icon: Route },
  { id: 'course', label: 'Course', icon: BookOpen },
  { id: 'event', label: 'Event', icon: Calendar },
  { id: 'mentorship', label: 'Mentorship', icon: Users },
  { id: 'template', label: 'Template', icon: FileText },
];

// Unified form that adapts based on selected type
// All submissions go to /marketplace endpoint
```

#### 3. New Hook: `useMarketplace`

```typescript
// packages/core/src/hooks/useMarketplace.ts

export function useMarketplace(options: {
  supabase: SupabaseClient;
  filters?: MarketplaceFilters;
}) {
  // Fetch from unified endpoint
  // Return typed MarketplaceItem[]
}

export function useCreatorMarketplace(options: {
  supabase: SupabaseClient;
  creatorId: string;
}) {
  // Fetch creator's items with stats
}
```

### Migration Steps

1. **Database Migration**
   ```sql
   -- 1. Add new columns to community_stories
   -- 2. Migrate existing data
   -- 3. Update RLS policies
   -- 4. Create indexes for performance
   ```

2. **API Migration**
   ```
   -- 1. Update existing endpoints to use new schema
   -- 2. Add new marketplace endpoints
   -- 3. Deprecate old creator_listings endpoints
   ```

3. **Frontend Migration**
   ```
   -- 1. Update types
   -- 2. Create useMarketplace hook
   -- 3. Update Marketplace screen
   -- 4. Update Creator Dashboard
   -- 5. Test all flows
   ```

## Benefits

1. **Single Source of Truth**: One table for all user content
2. **Unified Discovery**: Users find everything in Marketplace
3. **Simpler Creator UX**: One place to create, one dashboard to manage
4. **Better Moderation**: Single review queue for admins
5. **Cross-Referencing**: Roadmaps can link to official opportunities
6. **Easier Analytics**: Single table for all marketplace metrics

## Success Criteria

- [ ] All existing community_stories migrated
- [ ] All existing creator_listings migrated
- [ ] Marketplace shows unified list with type badges
- [ ] Creator can publish all content types from one dashboard
- [ ] Admin moderation works for all types
- [ ] No data loss during migration
- [ ] Search/filter works across all types
