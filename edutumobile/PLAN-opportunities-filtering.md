# Plan: Opportunities API Filtering by User Profile

## Current State
- **API Endpoint**: `GET /opportunities?limit=50`
- **Response**: All active opportunities (no filtering)
- **Client Filtering**: Dashboard calculates match scores client-side
- **User Profile**: Stored in Clerk `unsafeMetadata` (interests, country, education_level)

## Goal
Enable server-side filtering so the API returns opportunities relevant to the user's profile.

## Implementation Options

### Option A: Query Parameter Filtering (Recommended)
Send user preferences as query params, API filters response.

**Mobile App Changes:**
```typescript
// services/opportunities.ts
export async function fetchOpportunities(options: FetchOptions): Promise<Opportunity[]> {
  const { supabase, userId, userProfile } = options;
  
  // Build query with user preferences
  const queryParams = new URLSearchParams({
    limit: '50',
    ...(userProfile?.interests?.length && { 
      interests: userProfile.interests.join(',') 
    }),
    ...(userProfile?.country && { 
      country: userProfile.country 
    }),
    ...(userProfile?.educationLevel && { 
      education: userProfile.educationLevel 
    }),
  });

  const response = await fetch(
    `${API_BASE_URL}/opportunities?${queryParams}`,
    { headers: { 'x-user-id': userId || '' } }
  );
  
  return response.json();
}
```

**API Expected Behavior:**
```
GET /opportunities?limit=50&interests=technology,engineering&country=Kenya&education=undergraduate

Response: Opportunities matching:
  - Category contains "technology" OR "engineering"
  - Location is "Kenya" OR "Remote" OR "Africa"
  - Difficulty appropriate for undergraduate level
```

### Option B: POST with User Context (Alternative)
Send full user profile in request body.

```typescript
const response = await fetch(`${API_BASE_URL}/opportunities/personalized`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId,
    profile: userProfile,
    limit: 50
  })
});
```

### Option C: Supabase RLS + Views (Fallback)
If API doesn't support filtering, use Supabase directly.

```sql
-- Create view for personalized opportunities
CREATE VIEW personalized_opportunities AS
SELECT 
  o.*,
  CASE 
    WHEN o.category ILIKE ANY(u.interests) THEN 50
    ELSE 0
  END +
  CASE 
    WHEN o.location ILIKE '%' || u.country || '%' THEN 30
    WHEN o.is_remote THEN 20
    ELSE 0
  END as match_score
FROM opportunities o
JOIN user_profiles u ON u.id = current_user_id();
```

## Recommended Implementation

### Phase 1: Add Query Params Support (Mobile)
Update `packages/core/src/services/opportunities.ts`:

```typescript
interface FetchOptions {
  supabase: SupabaseClient;
  userId?: string;
  userProfile?: {
    interests?: string[];
    country?: string;
    educationLevel?: string;
    ageRange?: string;
  };
  signal?: AbortSignal;
  force?: boolean;
}

export async function fetchOpportunities(options: FetchOptions): Promise<Opportunity[]> {
  const { supabase, userId, userProfile, force } = options;

  if (!force && cachedOpportunities) {
    return filterByProfile(cachedOpportunities, userProfile);
  }

  try {
    const queryParams = new URLSearchParams({ limit: '50' });
    
    if (userProfile?.interests?.length) {
      queryParams.append('interests', userProfile.interests.join(','));
    }
    if (userProfile?.country) {
      queryParams.append('country', userProfile.country);
    }
    if (userProfile?.educationLevel) {
      queryParams.append('education', userProfile.educationLevel);
    }

    const response = await fetch(
      `${API_BASE_URL}/opportunities?${queryParams}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId || '',
        },
      }
    );

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    
    const data = await response.json();
    cachedOpportunities = data.map(normaliseOpportunity);
    
    return cachedOpportunities;
  } catch (error) {
    console.error('API fetch failed, falling back to Supabase:', error);
    return fetchFromSupabaseWithFilter(supabase, userProfile);
  }
}

// Client-side fallback filtering
function filterByProfile(
  opportunities: Opportunity[], 
  profile?: FetchOptions['userProfile']
): Opportunity[] {
  if (!profile) return opportunities;
  
  return opportunities.map(opp => {
    let matchScore = 0;
    
    if (profile.interests?.some(i => 
      opp.category.toLowerCase().includes(i.toLowerCase())
    )) matchScore += 50;
    
    if (profile.country && 
        opp.location.toLowerCase().includes(profile.country.toLowerCase())) {
      matchScore += 30;
    }
    
    if (opp.location.toLowerCase().includes('remote')) matchScore += 20;
    
    return { ...opp, match: matchScore };
  }).sort((a, b) => b.match - a.match);
}
```

### Phase 2: Update Hook
Update `packages/core/src/hooks/useOpportunities.ts`:

```typescript
interface UseOpportunitiesOptions {
  supabase: SupabaseClient;
  userId?: string;
  userProfile?: {
    interests?: string[];
    country?: string;
    educationLevel?: string;
  };
  // ... rest
}

export function useOpportunities(options: UseOpportunitiesOptions) {
  const { supabase, userId, userProfile } = options;
  // ... existing state
  
  useEffect(() => {
    fetchOpportunities({ 
      supabase, 
      userId,
      userProfile, // Pass profile to service
      force: refreshIndex > 0 
    })
    // ... rest
  }, [refreshIndex, supabase, userId, JSON.stringify(userProfile)]);
  
  // ... rest
}
```

### Phase 3: Update Dashboard
Update `app/(app)/index.tsx`:

```typescript
export default function Dashboard() {
  const { user } = useUser();
  
  // Extract user profile from Clerk
  const userProfile = useMemo(() => ({
    interests: user?.unsafeMetadata?.interests as string[] || [],
    country: user?.unsafeMetadata?.country as string || '',
    educationLevel: user?.unsafeMetadata?.educationLevel as string || '',
  }), [user?.unsafeMetadata]);

  const { data: opportunities, loading } = useOpportunities({
    supabase,
    userId: user?.id,
    userProfile, // Now passed to hook
  });

  // Remove client-side match calculation - now done by API
  // opportunities already have match scores from server
}
```

## API Requirements (for Backend Team)

The external API needs to support these query parameters:

```
GET /opportunities

Query Parameters:
  - limit: number (max results)
  - interests: comma-separated string (e.g., "technology,engineering")
  - country: string (e.g., "Kenya")
  - education: string (e.g., "undergraduate")
  - remote: boolean (filter for remote-only)
  - featured: boolean (featured opportunities only)

Response should include:
  - match: number (calculated relevance score)
  - matchedFields: string[] (which criteria matched)
```

## Success Criteria

- [ ] API returns fewer, more relevant opportunities when user profile provided
- [ ] Match scores calculated server-side (not client-side)
- [ ] Response time < 500ms with filtering
- [ ] Graceful fallback to Supabase if API unavailable
- [ ] Works offline with cached data + local filtering

## Testing Checklist

1. **Without profile**: Returns all opportunities, no match scores
2. **With interests**: Filters to matching categories
3. **With country**: Prioritizes location matches + remote
4. **Combined**: Multiple filters work together
5. **Empty results**: Shows "No matches" state
6. **API failure**: Falls back to Supabase + client filtering
