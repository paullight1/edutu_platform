# Plan: User Preferences Sync (Clerk → Supabase)

## Current State

### User Profile Data in Clerk
```typescript
// Stored in user.unsafeMetadata
{
  onboardingComplete: boolean;
  interests: string[];           // ['technology', 'business', 'engineering']
  country: string;               // 'Kenya'
  educationLevel: string;        // 'undergraduate'
  ageRange: string;              // '18-24'
  goals: string[];               // ['get scholarship', 'find internship']
  preferredLocations: string[];  // ['Remote', 'Kenya', 'Africa']
}
```

### Problems

1. **No SQL Access**: Can't query/filter by preferences in Supabase
2. **No Analytics**: Can't run reports on user preferences
3. **API Limitation**: External opportunities API can't access Clerk data
4. **Sync Issues**: Clerk and Supabase can get out of sync
5. **Cross-Device**: Changes on one device don't reflect immediately

## Goal

Sync Clerk user metadata to Supabase `user_profiles` table for:
- SQL querying and filtering
- API access to user preferences
- Analytics and reporting
- Real-time cross-device sync

## Proposed Schema

```sql
-- user_profiles table (extends auth.users)
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Clerk sync fields
  clerk_id TEXT UNIQUE,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  avatar_url TEXT,
  
  -- Onboarding preferences (synced from Clerk)
  onboarding_complete BOOLEAN DEFAULT FALSE,
  interests TEXT[] DEFAULT '{}',
  country TEXT,
  country_code TEXT,
  education_level TEXT,
  age_range TEXT,
  goals TEXT[] DEFAULT '{}',
  preferred_locations TEXT[] DEFAULT '{}',
  
  -- Computed fields (updated by triggers)
  profile_completeness INTEGER DEFAULT 0, -- 0-100
  primary_interest TEXT,
  
  -- Analytics
  opportunities_viewed INTEGER DEFAULT 0,
  opportunities_applied INTEGER DEFAULT 0,
  marketplace_enrollments INTEGER DEFAULT 0,
  
  -- Timestamps
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  preferences_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "API can read profiles for filtering"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (true); -- API needs to read for personalization

-- Indexes
CREATE INDEX idx_user_profiles_country ON user_profiles(country);
CREATE INDEX idx_user_profiles_interests ON user_profiles USING GIN(interests);
CREATE INDEX idx_user_profiles_education ON user_profiles(education_level);
```

## Sync Strategy

### Option A: Webhook Sync (Recommended)

Clerk sends webhook events, Edge Function updates Supabase.

**Flow:**
```
User updates profile (Clerk)
    ↓
Clerk sends webhook: user.updated
    ↓
Supabase Edge Function receives webhook
    ↓
Update user_profiles table
    ↓
Broadcast to connected clients (Realtime)
```

**Implementation:**

```typescript
// supabase/functions/clerk-webhook/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const payload = await req.json()
  const { type, data } = payload
  
  if (type === 'user.updated' || type === 'user.created') {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    
    const { id, email_addresses, first_name, last_name, image_url, unsafe_metadata } = data
    
    const primaryEmail = email_addresses?.find(e => e.id === data.primary_email_address_id)?.email_address
    
    await supabase.from('user_profiles').upsert({
      id: data.id, // UUID from Clerk
      clerk_id: data.id,
      email: primaryEmail,
      first_name: first_name || '',
      last_name: last_name || '',
      avatar_url: image_url,
      
      // Map Clerk metadata to columns
      onboarding_complete: unsafe_metadata?.onboardingComplete || false,
      interests: unsafe_metadata?.interests || [],
      country: unsafe_metadata?.country || '',
      education_level: unsafe_metadata?.educationLevel || '',
      age_range: unsafe_metadata?.ageRange || '',
      goals: unsafe_metadata?.goals || [],
      preferred_locations: unsafe_metadata?.preferredLocations || [],
      
      preferences_updated_at: new Date().toISOString(),
    }, {
      onConflict: 'id'
    })
  }
  
  return new Response('OK', { status: 200 })
})
```

### Option B: Client-Side Sync

Mobile app syncs profile on change.

```typescript
// packages/core/src/services/userProfile.ts

export async function syncUserProfileToSupabase(
  supabase: SupabaseClient,
  clerkUser: User
): Promise<void> {
  const metadata = clerkUser.unsafeMetadata;
  
  await supabase.from('user_profiles').upsert({
    id: clerkUser.id,
    clerk_id: clerkUser.id,
    email: clerkUser.primaryEmailAddress?.emailAddress,
    first_name: clerkUser.firstName,
    last_name: clerkUser.lastName,
    avatar_url: clerkUser.imageUrl,
    
    onboarding_complete: metadata?.onboardingComplete || false,
    interests: metadata?.interests || [],
    country: metadata?.country || '',
    education_level: metadata?.educationLevel || '',
    age_range: metadata?.ageRange || '',
    goals: metadata?.goals || [],
    preferred_locations: metadata?.preferredLocations || [],
    
    updated_at: new Date().toISOString(),
  }, {
    onConflict: 'id'
  });
}
```

**Call on:**
- App startup
- After onboarding completion
- When profile is updated

### Option C: Hybrid (Recommended Implementation)

Combine webhook (primary) + client-side (backup).

```typescript
// 1. Webhook handles most updates
// 2. Client syncs on critical moments:

// After onboarding
async function completeOnboarding(data: OnboardingData) {
  // 1. Update Clerk
  await user.update({
    unsafeMetadata: {
      ...user.unsafeMetadata,
      onboardingComplete: true,
      interests: data.interests,
      country: data.country,
      // ...
    }
  })
  
  // 2. Sync to Supabase immediately (don't wait for webhook)
  await syncUserProfileToSupabase(supabase, user)
}
```

## Implementation Plan

### Phase 1: Create Table + RLS

```sql
-- Run migration
CREATE TABLE user_profiles (...);
-- Add policies and indexes
```

### Phase 2: Create Sync Service

```typescript
// packages/core/src/services/userProfile.ts

export class UserProfileService {
  constructor(
    private supabase: SupabaseClient,
    private clerkUser: User | null
  ) {}

  async sync(): Promise<void> {
    if (!this.clerkUser) return;
    
    await syncUserProfileToSupabase(this.supabase, this.clerkUser);
  }

  async updatePreferences(prefs: Partial<UserPreferences>): Promise<void> {
    if (!this.clerkUser) throw new Error('Not authenticated');
    
    // 1. Update Clerk
    await this.clerkUser.update({
      unsafeMetadata: {
        ...this.clerkUser.unsafeMetadata,
        ...prefs
      }
    });
    
    // 2. Sync to Supabase
    await this.sync();
  }

  async getProfile(): Promise<UserProfile | null> {
    const { data } = await this.supabase
      .from('user_profiles')
      .select('*')
      .eq('id', this.clerkUser?.id)
      .single();
    
    return data;
  }
}
```

### Phase 3: Hook Integration

```typescript
// packages/core/src/hooks/useUserProfile.ts

export function useUserProfile() {
  const { user } = useUser();
  const { supabase } = useSupabase(); // Assuming you have this
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Sync on user change
  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }

    const service = new UserProfileService(supabase, user);
    
    // Sync profile
    setSyncing(true);
    service.sync().finally(() => setSyncing(false));
    
    // Fetch profile
    service.getProfile().then(setProfile);
    
    // Subscribe to realtime changes
    const subscription = supabase
      .channel(`user_profile:${user.id}`)
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'user_profiles', filter: `id=eq.${user.id}` },
        (payload) => setProfile(payload.new as UserProfile)
      )
      .subscribe();
    
    return () => {
      subscription.unsubscribe();
    };
  }, [user?.id]);

  const updatePreferences = async (prefs: Partial<UserPreferences>) => {
    if (!user) return;
    
    const service = new UserProfileService(supabase, user);
    await service.updatePreferences(prefs);
  };

  return { profile, syncing, updatePreferences };
}
```

### Phase 4: Update Opportunities to Use Supabase Profile

```typescript
// Update useOpportunities hook

export function useOpportunities(options: UseOpportunitiesOptions) {
  const { supabase, userId } = options;
  const { profile } = useUserProfile(); // Now from Supabase

  useEffect(() => {
    // Use Supabase profile instead of Clerk metadata
    const userProfile = profile ? {
      interests: profile.interests,
      country: profile.country,
      educationLevel: profile.education_level,
    } : undefined;

    fetchOpportunities({ supabase, userId, userProfile })
      // ...
  }, [profile?.updated_at]); // Re-fetch when profile changes
}
```

## Benefits

1. **SQL Querying**: Filter opportunities by user preferences in database
2. **API Access**: External API can query Supabase for user profile
3. **Analytics**: Run reports on user demographics and preferences
4. **Real-time**: Profile changes sync across devices instantly
5. **Backup**: Clerk data backed up in Supabase
6. **Performance**: No need to fetch Clerk user for every filter operation

## Testing Checklist

- [ ] New user creates profile on signup
- [ ] Profile updates sync Clerk → Supabase
- [ ] Real-time subscription works across devices
- [ ] RLS prevents unauthorized access
- [ ] Opportunities filter using Supabase profile
- [ ] Webhook handles Clerk updates correctly
- [ ] Offline mode works with cached profile

## Security Considerations

1. **RLS Policies**: Users can only read/write their own profile
2. **Service Role**: Edge Function uses service role key for webhooks
3. **PII Handling**: Email/name encrypted at rest
4. **Audit Trail**: Track who changed what

```sql
-- Audit log table
CREATE TABLE user_profile_audit (
  id UUID DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_profiles(id),
  changed_by UUID,
  changes JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```
