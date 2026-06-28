# AI in Edutu Mobile — Documentation

## Overview

Edutu Mobile uses **DeepSeek** for chat coach, opportunity ranking, and CV tailoring. Voice transcription uses a dedicated speech-to-text provider, while spoken output uses `expo-speech`.

---

## AI Model

| Field        | Value                            |
|--------------|----------------------------------|
| Provider     | Google                           |
| Model        | Gemini 2.0 Flash                 |
| Endpoint     | `generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent` |
| Config Key   | `GEMINI_API_KEY` (in `.env`)     |
| Temperature  | 0.2                              |

---

## AI Features

### 1. AI Chat Coach

**File:** `supabase/functions/chat-proxy/index.ts:355-384`

- Acts as an educational guidance coach inside the mobile app
- Receives the user's profile, goals, and opportunity context
- Recommends opportunities, adapts to feedback ("not interested", "remote only", etc.)
- Returns structured markdown responses (`## Best matches`, `## Why these fit`, `## Next refinement`)
- Saves conversation to `chat_messages` table in Supabase

### 2. Opportunity Ranking (AI Match Scoring)

**File:** `supabase/functions/chat-proxy/index.ts:308-348`

- Uses Gemini to score and rank opportunities against a user's profile and request
- Returns JSON: `{ matches: [{ id, score (0-100), reason }] }`
- Input: user profile, goals, user message, list of opportunities
- Fallback: keyword-based ranking if Gemini is unavailable (`fallbackRankOpportunities` function)

### 3. Audio Transcription

**File:** `supabase/functions/chat-proxy/index.ts:75-89`

- Uses OpenAI Whisper to transcribe voice messages sent by the user
- Accepts audio payload (`mimeType` + `data` as base64)
- Returns plain text transcript
- Mode: `mode === "transcribe"` in chat-proxy

### 4. AI CV Draft Generation

**File:** `packages/core/src/services/cv.ts:460-539`

- Generates a CV draft from user profile and goals data
- Builds summary from profile (`field_of_study`, `education_level`, `skills`, `interests`)
- Auto-populates experience, education, and achievements from user goals
- Used as a starting point; no direct Gemini API call (rule-based generation from profile)

### 5. AI CV Tailoring

**File:** `components/cv/AITailorModal.tsx` (UI) + `packages/core/src/services/cv.ts:618-694` (logic)

- Allows user to select an opportunity and tailor their CV toward it
- Matches CV skills against opportunity keywords
- Generates a tailored summary and match score
- Reports matched/missing keywords and improvement suggestions

---

## Data Flow

```
User Message / Audio
        │
        ▼
┌───────────────────┐
│  chat-proxy       │  Supabase Edge Function
│  (Deno runtime)   │
└─────┬─────────────┘
      │
      ├──► [Audio?] ──► transcribeAudio(openaiKey, audio)
      │
      ├──► [Text] ──► Fetch user profile, goals, opportunities from Supabase
      │                    │
      │                    ├──► Try shared recommendation API (EDUTU_API_URL)
      │                    │
      │                    └──► Fallback: callGeminiJson() for ranking
      │
      ├──► callGeminiJson() ──► Gemini API (JSON: opportunity ranking)
      │
      └──► callGemini() ──► Gemini API (text: coach response)
                              │
                              ▼
                     Save to chat_messages table
```

---

## Configuration

### Environment Variables

```env
# .env
OPENAI_API_KEY=...              # OpenAI API key for transcription
SERPER_API_KEY=...              # (Reserved — not actively used in chat-proxy)
EXPO_PUBLIC_API_URL=https://edutu-platform.onrender.com  # Backend API URL for recommendations
```

### Supabase Edge Function

- **Name:** `chat-proxy`
- **Runtime:** Deno
- **Required secrets:** `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- **Optional:** `EDUTU_API_URL` (for shared recommendation service)

---

## Checking AI Usage

### Google Cloud Console
1. Go to https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com
2. Navigate to **Usage** or **Quotas** tab
3. View token counts, request counts, and costs

### Google AI Studio
1. Go to https://aistudio.google.com
2. Navigate to **Activity** or **Usage** tab
3. View recent API calls and model usage

### Supabase Dashboard
1. Go to your Supabase project → **Edge Functions**
2. Click on `chat-proxy`
3. View **Logs** to see request/response data, errors, and Gemini call results

### Application-Level Inspection
The API response from `chat-proxy` includes:
- `threadId` — the chat thread ID
- `userMessage` — saved user message
- `assistantMessage` — saved AI response

Opportunity objects include:
- `ai_match_score` — numeric score (0-100)
- `ai_match_reason` — explanation string
- `matchReasons` — array of match reason strings

---

## Security Notes

- `DEEPSEEK_API_KEY` is stored in the backend env for text AI. `OPENAI_API_KEY` is stored in the Supabase Edge Function env for transcription. Neither should be exposed to the client.
- The client communicates with Gemini only through the `chat-proxy` Edge Function
- Gemini calls use temperature 0.2 for consistent, factual responses
- JSON responses use `responseMimeType: "application/json"` for structured output
