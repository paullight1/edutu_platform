# Personalization System — Documentation

## Overview

Edutu Mobile's personalization system tailors opportunity recommendations, CV generation, and chat responses to each user's profile, education, interests, and goals. The system operates at multiple layers: data collection during onboarding, client-side matching, server-side AI ranking, and personalized CV generation.

---

## 1. Data Collection: Onboarding

**File:** `app/onboarding.tsx`

The onboarding flow collects user profile data across 4 steps:

### Step 1: Profile
| Field           | Type     | Max    | Purpose                          |
|-----------------|----------|--------|----------------------------------|
| Full Name       | Text     | —      | Display name, CV header          |
| Country         | Select   | —      | Geographic eligibility filtering |
| Phone           | Text     | —      | Contact (optional)               |
| Age             | Number   | —      | Age-eligible opportunities       |
| Degree Pursuit  | Select   | —      | Education level classification   |

**Degree options:** BSc, MSc, PhD, Other/None

### Step 2: Education
| Field              | Type     | Condition         | Purpose                         |
|--------------------|----------|--------------------|---------------------------------|
| High School Status | Yes/No   | —                  | Determines grade vs. university |
| Grade Level        | Select   | If No to HS        | School-level opportunities      |
| School Name        | Text     | Always             | Institution context             |

**Grade options:** SS3/Grade 12, SS2/Grade 11, SS1/Grade 10, JSS3/Grade 9

**School search:** Pre-populated with 20 Nigerian universities + custom entry

### Step 3: Interests & Goals
| Field      | Type     | Max Selected | Purpose                          |
|------------|----------|---------------|----------------------------------|
| Interests  | Chips    | 3             | Opportunity matching            |
| Ambitions  | Cards    | 2             | Goal-aligned recommendations    |

**Interest options:** Technology, Business, Healthcare, Engineering, Arts, Science, Education, Law, Finance, Marketing, Design, Sports, Music, Writing, Research, Social Impact, Entrepreneurship

**Ambition options:** Get Scholarship, Land a Job, Join Fellowship, Find Internship, Get Mentor, Build Skills

### Data Storage

Profile data is saved to **Clerk `unsafeMetadata`** on the user object:

```typescript
await user.update({
  unsafeMetadata: {
    onboardingComplete: true,
    fullName, country, countryCode, phone, age,
    pursuit, isGraduate, schoolName, gradeLevel,
    interests: [...],  // up to 3
    ambitions: [...],  // up to 2
  },
});
```

---

## 2. Profile Schema

Profile data exists in multiple stores:

| Store              | Table/Field              | Key Fields                                      |
|---------------------|--------------------------|--------------------------------------------------|
| Clerk              | `unsafeMetadata`         | fullName, country, interests, ambitions, etc.    |
| Supabase           | `profiles`               | country, field_of_study, education_level, interests, skills, goals |
| Supabase           | `goals`                  | title, deadline, progress                        |

### Profile Normalization

**File:** `packages/core/src/services/opportunities.ts:79-101`

```typescript
function normaliseProfileInput(profile) {
  return {
    interests: Array.isArray(profile.interests) ? profile.interests : [],
    ambitions: Array.isArray(profile.ambitions) ? profile.ambitions : [],
    skills: Array.isArray(profile.skills) ? profile.skills : [],
    country: profile.country || profile.countryCode || '',
    field_of_study: profile.field_of_study || profile.pursuit || profile.schoolName || profile.gradeLevel || '',
  };
}
```

---

## 3. Opportunity Matching Engine

**File:** `packages/core/src/services/opportunities.ts:124-207`

The matching engine calculates a personalized score (0-100) for each opportunity against the user's profile.

### Scoring Criteria

| Criterion          | Weight | Logic                                                                 |
|---------------------|--------|------------------------------------------------------------------------|
| Field of Study      | +1.5   | Direct match to eligibility.major; +1.0 for text match                 |
| Skills Overlap      | +1.5   | Proportionate: matching up to half the skills gives max points         |
| Interests Overlap   | +1.0   | Proportionate scoring based on interest matches                        |
| Ambitions Alignment | +1.0   | Scoring based on ambition keyword matches                              |
| Country Match       | +1.0   | Hard filter: if opportunity has eligibility.countries and user's country is not in the list, score = 0 |

### Formula

```
normalizedPercentage = (score / min(criteriaCount * 1.25, 6.0)) * 100
finalScore = min(100, round(normalizedPercentage))
```

### Hard Filters

- **Geographic restriction:** If an opportunity specifies `eligibility.countries` and the user's country is not in the list → score = 0 (disqualified)

### Ranking Sort

- Opportunities are sorted by `match` score in descending order for logged-in users
- Guests see opportunities sorted by `created_at` (newest first)

---

## 4. AI-Powered Ranking (Server-Side)

**File:** `supabase/functions/chat-proxy/index.ts:308-348`

When the Gemini API key is available, the server-side AI ranking overrides the client-side scoring:

### Input to Gemini
- User profile (country, field_of_study, education_level, interests, skills)
- User goals (title, progress, deadline)
- User message/request
- List of up to 25 active opportunities

### Gemini Output (JSON)

```json
{
  "matches": [
    { "id": "uuid", "score": 0-100, "reason": "explanation" }
  ]
}
```

### Fallback

If Gemini is unavailable, `fallbackRankOpportunities` uses keyword matching:
- Extracts terms from user message + profile interests + profile skills
- Counts keyword hits in opportunity text
- Returns top 5 sorted by hit count

---

## 5. Personalized Chat Coach

**File:** `supabase/functions/chat-proxy/index.ts:355-384`

The AI coach receives personalized context on every request:

```
USER PROFILE:
- Country: Nigeria
- Field of study: Computer Science
- Education level: BSc
- Interests: Technology, Research
- Skills: Python, Data Analysis

USER GOALS:
- Get ML Internship (progress: 45%, deadline: 2025-12-01)

INTERNAL OPPORTUNITIES:
[Top 5 ranked opportunities with AI match reasons]

User request:
"I need a data science internship in Europe"
```

The coach adapts recommendations based on:
- User feedback ("not interested", "too expensive", "remote only")
- Profile constraints (country, education level)
- Goal progress and deadlines

---

## 6. Personalized CV Generation

**File:** `packages/core/src/services/cv.ts:460-539`

### AI CV Draft (Profile-Based)

The CV system auto-generates content from the user's profile:

| CV Section     | Source Data                                      |
|----------------|---------------------------------------------------|
| Header         | `full_name`, `email`, `country` from profile      |
| Summary        | Auto-built from `field_of_study`, `education_level`, `skills`, `interests` |
| Skills         | Merged from profile `skills` + `interests`        |
| Experience     | Auto-generated from user `goals` (up to 2)        |
| Education      | `institution`, `education_level`, `field_of_study`|
| Achievements   | Auto-generated from user `goals` (up to 3)        |

### Summary Builder

```typescript
function buildSummaryFromProfile(profile, prompt?) {
  // "Motivated Computer Science student at BSc level
  //  with strengths in Python, Data Analysis
  //  interested in Technology, Research
  //  currently targeting ML Internship."
}
```

### CV Tailoring to Opportunity

**File:** `packages/core/src/services/cv.ts:618-694`

When tailoring a CV to a specific opportunity:
1. Extract opportunity keywords (skills, requirements, tags)
2. Match against user's current CV skills
3. Generate tailored summary mentioning the target opportunity
4. Calculate match score (35-100 range)
5. Report matched and missing keywords
6. Suggest improvements

### CV-to-Opportunity Matching

**File:** `packages/core/src/services/cv.ts:541-616`

Compares CV text content against opportunity requirements:
- Extracts meaningful terms (3+ characters) from both
- Calculates keyword overlap percentage
- Reports matched keywords, missing keywords, and suggestions

---

## 7. Caching & Offline

| Mechanism         | Key Pattern                       | Scope         |
|--------------------|------------------------------------|---------------|
| AsyncStorage       | `edutu_opportunities_cache:{userId}` | Per user      |
| AsyncStorage       | `edutu:user_cvs:{userId}`          | Per user      |
| In-memory cache    | `cachedOpportunities`               | Session       |

Cached opportunities include personalized `match` scores per user.

---

## 8. Recommendation API Integration

**File:** `packages/core/src/services/opportunities.ts:239-258`

When `EXPO_PUBLIC_API_URL` is set, the app can use a shared recommendation service:

```
POST {API_URL}/opportunities/recommendations/query
Body: { profile, limit: 50, minMatchScore: userId ? 0 : 30 }
```

This allows server-side personalization that is shared across all Edutu clients (mobile, web, admin).

---

## 9. Data Flow Diagram

```
┌─────────────┐
│ Onboarding   │ Collects: name, country, age, degree, school,
│ (onboarding  │           interests (max 3), ambitions (max 2)
│  .tsx)       │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌──────────────┐
│ Clerk        │────►│ Supabase     │
│ unsafeMetadata│     │ profiles table│
└──────┬──────┘     └──────┬───────┘
       │                   │
       ▼                   ▼
┌────────────────────────────────┐
│  Client-Side Matching          │
│  (opportunities.ts)            │
│                                │
│  1. Fetch profile from Supabase│
│  2. normalizeProfileInput()    │
│  3. calculateMatchScore()      │
│     - Field of Study (+1.5)    │
│     - Skills (+1.5)            │
│     - Interests (+1.0)         │
│     - Ambitions (+1.0)         │
│     - Country (hard filter)    │
│  4. Sort by match score        │
└───────────┬────────────────────┘
            │
            ▼
┌────────────────────────────────┐
│  Server-Side AI Ranking        │
│  (chat-proxy Edge Function)    │
│                                │
│  1. Try shared rec API         │
│  2. Fallback: Gemini ranking   │
│     - Input: profile + goals   │
│     - Output: JSON scores      │
│  3. Fallback: keyword match    │
└───────────┬────────────────────┘
            │
            ▼
┌────────────────────────────────┐
│  Personalized Output           │
│                                │
│  - Ranked opportunities list   │
│  - AI match reasons            │
│  - Chat coach recommendations  │
│  - Auto-generated CV           │
│  - Tailored CV per opportunity │
└────────────────────────────────┘
```

---

## 10. Extending Personalization

### To Add New Profile Fields

1. Add field to onboarding form (`app/onboarding.tsx`)
2. Add to Clerk `unsafeMetadata` in `saveAndNavigate()`
3. Update `normaliseProfileInput()` in `packages/core/src/services/opportunities.ts`
4. Update `calculateMatchScore()` with new criterion
5. Update Supabase `profiles` table migration if used server-side

### To Adjust Match Weings

Edit `calculateMatchScore()` in `packages/core/src/services/opportunities.ts:124-207`:
- Modify weight constants (e.g., `1.5`, `1.0`)
- Add new criteria blocks
- Adjust `maxPossibleScore` and normalization formula

### To Change AI Ranking Behavior

Edit the prompt in `supabase/functions/chat-proxy/index.ts:310-326` (ranking prompt) and `index.ts:357-381` (coach prompt).

---

## 11. Limitations & Notes

- **School list:** Currently limited to 20 Nigerian universities; other schools require manual entry
- **Interests/Ambitions cap:** Maximum 3 interests and 2 ambitions enforced in onboarding
- **Match scoring:** Keyword-based matching; no semantic/NLP matching on the client side
- **AI ranking:** Depends on `DEEPSEEK_API_KEY` availability; gracefully degrades to keyword fallback
- **Shared recommendations:** Only active when `EDUTU_API_URL` / `EXPO_PUBLIC_API_URL` is configured
- **CV generation:** Rule-based (profile-driven), not AI-generated (Gemini not called for CV creation)
