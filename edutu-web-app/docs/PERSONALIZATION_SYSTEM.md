# Edutu App - Personalization System Documentation

## Overview

The Edutu app includes a comprehensive personalization system that tailors opportunity recommendations based on user preferences, interests, and goals. This document covers the entire personalization flow from user onboarding to filtered opportunity delivery.

---

## Table of Contents

1. [Personalization Flow](#personalization-flow)
2. [User Profile Data Structure](#user-profile-data-structure)
3. [Onboarding System](#onboarding-system)
4. [Personalized Recommendations](#personalized-recommendations)
5. [n8n Webhook Integration](#n8n-webhook-integration)
6. [API Reference](#api-reference)
7. [Database Schema](#database-schema)
8. [Configuration](#configuration)

---

## Personalization Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    New User     │     │   Onboarding    │     │    Profile      │
│    Signup       │ ──▶ │   Popup         │ ──▶ │    Saved        │
│                 │     │   (Welcome)     │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Personalized   │     │    Match        │     │  User Profile   │
│  Opportunities  │ ◀── │    Scoring      │ ◀── │  for Recs       │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        ▲
                                                        │
┌─────────────────┐     ┌─────────────────┐             │
│    Settings     │     │ Personalization │             │
│    Menu         │ ──▶ │ Profile Page    │ ────────────┘
│                 │     │ (Edit)          │
└─────────────────┘     └─────────────────┘
```

### Flow Description

1. **New User Signup**: When a user signs up (detected via `?signup=true` URL parameter), the Introduction Popup appears.

2. **Onboarding Popup**: Collects user information in a multi-step wizard:
   - Full Name & Age
   - Course of Study
   - Interests (multi-select)
   - Career Goals (multi-select)
   - Experience Level
   - Location
   - Education Level
   - Preferred Learning Styles

3. **Profile Saved**: Data is stored in the user's profile preferences in Supabase.

4. **Returning Users**: Can edit their profile via Settings → Personalization Profile (full-page form, not popup).

5. **Personalized Recommendations**: Opportunities are scored and filtered based on the user's profile.

---

## User Profile Data Structure

### OnboardingProfileData (src/types/onboarding.ts)

```typescript
interface OnboardingProfileData {
  fullName: string;
  age: number | null;
  courseOfStudy: string;
  interests: string[];           // e.g., ['Technology', 'AI & Machine Learning']
  goals: string[];               // e.g., ['Get a Job', 'Learn New Skills']
  experience: string;            // 'beginner' | 'intermediate' | 'advanced'
  location: string;              // e.g., 'Lagos, Nigeria'
  educationLevel: string;        // 'high-school' | 'undergraduate' | etc.
  preferredLearning: string[];   // e.g., ['Visual', 'Hands-on']
}
```

### UserProfileForRecommendations (src/services/personalizedRecommendations.ts)

```typescript
interface UserProfileForRecommendations {
  id: string;
  name?: string;
  age?: number;
  courseOfStudy?: string;
  interests: string[];
  location?: string;
  careerGoals: string[];
  experienceLevel: string;
  preferredCategories: string[];
  availability: string;
  educationLevel?: string;
  preferredLearning?: string[];
}
```

---

## Onboarding System

### Components

| Component | Purpose | Location |
|-----------|---------|----------|
| `IntroductionPopup` | Multi-step wizard for NEW users | `src/components/IntroductionPopup.tsx` |
| `PersonalizationProfileScreen` | Full-page edit form for RETURNING users | `src/components/PersonalizationProfileScreen.tsx` |

### When Onboarding Shows

**New Users (Popup)**:
- Only when `?signup=true` is in the URL after authentication
- Never shows on page refresh or navigation
- Shows once per new signup

**Returning Users (Settings Page)**:
- Settings Menu → "Personalization profile" 
- Navigates to `/app/personalization`
- No "welcome" message, just an edit form

### Triggering Onboarding

```typescript
// In App.tsx - New User Detection
const urlParams = new URLSearchParams(window.location.search);
const isSignup = urlParams.get('signup') === 'true';

if (isSignup) {
  // Check if user hasn't completed onboarding
  const profileData = await fetchUserProfile(session.user.id);
  const isActuallyNew = isNewUser(profileData, session.user);
  if (isActuallyNew && !profileData?.preferences?.onboarding?.completed) {
    setShowIntroPopup(true);
  }
}

// In Settings - Navigate to personalization page
const handleRedoOnboarding = () => {
  navigate('/app/personalization');
};
```

---

## Personalized Recommendations

### Match Scoring Algorithm

The recommendation system uses a weighted scoring algorithm that evaluates each opportunity against the user's profile:

| Factor | Max Points | Description |
|--------|------------|-------------|
| Course/Interest Match | 40 | Matches user's course of study and interests with opportunity category/title/description |
| Preferred Categories | 20 | Direct match with user's preferred categories derived from interests |
| Location Match | 15 | Location preference or remote opportunity bonus |
| Experience/Difficulty | 15 | Matches experience level with opportunity difficulty |
| Career Goals | 15 | Matches career goals with opportunity content |
| Education Level | 5 | Bonus for matching education level requirements |
| **Total** | **100** | Maximum possible score |

### Scoring Logic

```typescript
// Example scoring for a Technology opportunity

// User Profile:
// - courseOfStudy: "Computer Science"
// - interests: ["Technology", "AI & Machine Learning"]
// - experience: "intermediate"
// - goals: ["Get a Job", "Build Portfolio"]
// - location: "Lagos"

// Opportunity:
// - title: "Software Engineering Internship"
// - category: "Technology"
// - difficulty: "Medium"
// - location: "Lagos, Nigeria"
// - description: "Build your portfolio..."

Score Breakdown:
- Course Match (Computer Science → Technology): +25
- Interest Match (Technology in category): +15
- Location Match (Lagos): +15
- Category Match (Technology): +20
- Experience Match (intermediate → Medium): +15
- Goal Match ("Build Portfolio" in description): +5
= Total: 95/100
```

### Using Personalized Opportunities

```typescript
import { fetchPersonalizedOpportunities } from './services/personalizedRecommendations';

// Fetch opportunities personalized for a user
const personalizedOpps = await fetchPersonalizedOpportunities(userId, {
  minScore: 10,    // Minimum match score (default: 10)
  limit: 20,       // Maximum results (default: 50)
  forceRefresh: false
});

// Results include the opportunity and its match score
personalizedOpps.forEach(({ opportunity, matchScore }) => {
  console.log(`${opportunity.title}: ${matchScore}% match`);
});
```

---

## n8n Webhook Integration

### Overview

Opportunities can be ingested from external sources (like web scrapers) via n8n webhooks. These opportunities are then personalized for each user.

### Webhook Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   n8n       │     │  Supabase   │     │  Database   │     │    App      │
│  Scraper    │ ──▶ │  Edge Func  │ ──▶ │  Storage    │ ──▶ │  Display    │
│             │     │  Webhook    │     │             │     │             │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

### Webhook Endpoint

**URL**: `https://<project>.supabase.co/functions/v1/n8n-webhook`

**Headers**:
```
Content-Type: application/json
x-api-key: <your-webhook-api-key>
```

### Payload Structure

```json
{
  "action": "create",
  "data": {
    "title": "Software Engineering Scholarship",
    "organization": "Tech Foundation",
    "category": "Scholarship",
    "location": "Remote",
    "description": "Full scholarship for CS students...",
    "close_date": "2024-06-30",
    "application_url": "https://apply.example.com",
    "is_remote": true,
    "metadata": {
      "difficulty": "Medium",
      "requirements": ["GPA 3.0+", "Enrolled in CS program"],
      "benefits": ["Full tuition", "Mentorship"],
      "tags": ["technology", "scholarship", "undergraduate"]
    }
  }
}
```

### Supported Actions

| Action | Description |
|--------|-------------|
| `create` | Add a new opportunity |
| `update` | Update an existing opportunity (requires `id`) |
| `delete` | Delete an opportunity (requires `id`) |
| `bulk_sync` | Replace all opportunities with new set |

### Setting Up n8n Integration

1. **Create Webhook API Key**:
   ```sql
   INSERT INTO public.webhook_api_keys (key_hash, name, permissions)
   VALUES (
     encode(digest('your-secret-key', 'sha256'), 'hex'),
     'n8n-scraper',
     ARRAY['opportunities:write']
   );
   ```

2. **Deploy Edge Function**:
   ```bash
   supabase functions deploy n8n-webhook
   ```

3. **Configure n8n Workflow**:
   - Create HTTP Request node
   - Point to webhook URL
   - Add API key header
   - Map scraped data to payload structure

---

## API Reference

### Profile Services

```typescript
// src/services/profile.ts

// Fetch user profile from Supabase
fetchUserProfile(userId: string): Promise<Profile | null>

// Save onboarding profile data
saveOnboardingProfile(userId: string, data: OnboardingProfileData): Promise<OnboardingState>

// Extract onboarding state from profile
extractOnboardingState(profile: Profile | null): OnboardingState | null
```

### Recommendation Services

```typescript
// src/services/personalizedRecommendations.ts

// Convert onboarding data to recommendation profile format
onboardingToRecommendationProfile(
  userId: string,
  data: OnboardingProfileData
): UserProfileForRecommendations

// Calculate match score between user and opportunity
calculateMatchScore(
  userProfile: UserProfileForRecommendations,
  opportunity: Opportunity
): number

// Get personalized opportunities with scores
getPersonalizedOpportunities(
  userProfile: UserProfileForRecommendations,
  opportunities: Opportunity[],
  options?: { minScore?: number; limit?: number }
): { opportunity: Opportunity; matchScore: number }[]

// Fetch personalized opportunities for a user (main entry point)
fetchPersonalizedOpportunities(
  userId: string,
  options?: { minScore?: number; limit?: number; forceRefresh?: boolean }
): Promise<{ opportunity: Opportunity; matchScore: number }[]>

// Get user's top interest categories
getUserTopCategories(
  userProfile: UserProfileForRecommendations,
  maxCategories?: number
): string[]
```

### User Settings Services

```typescript
// src/services/userSettings.ts

// Get user privacy and security settings
getUserSettings(): Promise<UserSettings | null>

// Save privacy settings
savePrivacySettings(settings: Partial<PrivacySettings>): Promise<{ success: boolean; error?: string }>

// Save security settings  
saveSecuritySettings(settings: Partial<SecuritySettings>): Promise<{ success: boolean; error?: string }>

// Change user password
changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }>

// Toggle two-factor authentication
toggleTwoFactor(enable: boolean): Promise<{ success: boolean; error?: string }>

// Export all user data
exportUserData(): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }>

// Request account deletion
requestAccountDeletion(): Promise<{ success: boolean; error?: string }>
```

### Profile Image Services

```typescript
// src/services/profileImage.ts

// Upload profile image to Supabase Storage
uploadProfileImage(file: File): Promise<{ success: boolean; url?: string; error?: string }>

// Upload with auto-resize
uploadResizedProfileImage(file: File): Promise<{ success: boolean; url?: string; error?: string }>

// Get profile image URL
getProfileImageUrl(): Promise<string | null>

// Delete profile image
deleteProfileImage(): Promise<{ success: boolean; error?: string }>
```

---

## Database Schema

### Profiles Table Extensions

```sql
-- Onboarding data stored in preferences JSONB column
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}';

-- Example preferences structure:
{
  "onboarding": {
    "completed": true,
    "completedAt": "2024-01-15T10:30:00Z",
    "data": {
      "fullName": "John Doe",
      "age": 22,
      "courseOfStudy": "Computer Science",
      "interests": ["Technology", "AI & Machine Learning"],
      "goals": ["Get a Job", "Build Portfolio"],
      "experience": "intermediate",
      "location": "Lagos, Nigeria",
      "educationLevel": "undergraduate",
      "preferredLearning": ["Visual", "Hands-on"]
    }
  },
  "privacy": {
    "profileVisibility": "public",
    "dataSharing": false
  },
  "security": {
    "twoFactorEnabled": false
  }
}
```

### User Personalization Table

```sql
CREATE TABLE public.user_personalization (
  user_id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  interests text[] NOT NULL DEFAULT ARRAY[]::text[],
  career_goals text[] NOT NULL DEFAULT ARRAY[]::text[],
  experience_level text DEFAULT 'intermediate',
  preferred_categories text[] NOT NULL DEFAULT ARRAY[]::text[],
  preferred_locations text[] NOT NULL DEFAULT ARRAY[]::text[],
  availability text DEFAULT 'flexible',
  recommendation_weights jsonb NOT NULL DEFAULT '{"category": 1, "location": 0.8, "skills": 1.2}',
  last_updated timestamptz NOT NULL DEFAULT now(),
  onboarding_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### Opportunity Recommendations Cache

```sql
CREATE TABLE public.user_opportunity_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES public.opportunities ON DELETE CASCADE,
  match_score numeric(5,2) NOT NULL DEFAULT 0,
  match_reasons jsonb NOT NULL DEFAULT '[]',
  is_dismissed boolean NOT NULL DEFAULT false,
  is_saved boolean NOT NULL DEFAULT false,
  generated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '7 days'),
  UNIQUE (user_id, opportunity_id)
);
```

---

## Configuration

### Environment Variables

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# n8n Integration
VITE_N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/xxx
VITE_N8N_API_KEY=your-n8n-api-key
```

### Personalization Thresholds

You can adjust these values in `src/services/personalizedRecommendations.ts`:

```typescript
// Default options for fetchPersonalizedOpportunities
const DEFAULT_OPTIONS = {
  minScore: 10,     // Minimum match score to include opportunity
  limit: 50,        // Maximum opportunities to return
  forceRefresh: false
};

// Scoring weights (in calculateMatchScore function)
const SCORING_WEIGHTS = {
  courseMatch: 25,
  interestMatch: 15,
  locationMatch: 15,
  categoryMatch: 20,
  experienceMatch: 15,
  careerGoalMatch: 15,  // Max 5 points per goal
  educationBonus: 5
};
```

---

## Best Practices

### 1. Onboarding Completion

Always check if onboarding is completed before showing personalized content:

```typescript
const onboardingState = extractOnboardingState(profile);
if (!onboardingState?.data) {
  // Show generic content or prompt to complete profile
}
```

### 2. Graceful Fallbacks

If personalization fails, return all opportunities with a default score:

```typescript
try {
  return getPersonalizedOpportunities(userProfile, opportunities);
} catch (error) {
  return opportunities.map(opp => ({ opportunity: opp, matchScore: 50 }));
}
```

### 3. Profile Data Privacy

- Store sensitive data only in the authenticated user's profile
- Use RLS policies to restrict access
- Don't expose recommendation scores to other users

### 4. Performance

- Cache opportunities to reduce database calls
- Use `forceRefresh: false` unless data freshness is critical
- Consider implementing server-side personalization for large opportunity sets

---

## Troubleshooting

### Onboarding Popup Won't Show

1. Check if `?signup=true` is in the URL
2. Verify user doesn't have existing onboarding data
3. Check browser console for errors

### Opportunities Not Personalized

1. Verify user has completed onboarding
2. Check if `onboardingState.data` exists
3. Ensure opportunities have proper category/metadata

### Low Match Scores

1. User's interests may not match available opportunities
2. Opportunity categories may not be standardized
3. Consider lowering `minScore` threshold

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-12 | Initial personalization system |
| 1.1.0 | 2024-12 | Added PersonalizationProfileScreen for settings |
| 1.2.0 | 2024-12 | Enhanced match scoring with education level |
