# PLAN — Edutu AI Coach Overhaul ("one brain, many hands")

> Goal: turn Edutu's AI from a single-shot Q&A bot into an **agentic opportunity coach** —
> jovial, personalized, memory-backed — that can recommend, learn interests, take feedback,
> proactively ping users, and execute one-click actions (roadmaps, calendar-integrated goals,
> CV/SOP documents as PDF/DOCX, resources, opportunity images) directly from chat.
>
> Grounded in a full audit of the current code (2026-07-12). File paths below are real.

---

## 0. What exists today (audit summary)

**Chat is a single-shot bot, not an agent.**
- `backend/.../src/chat/chat.service.ts`: one DeepSeek call (`chat.coach` route), `maxOutputTokens: 220`, `temperature: 0.1`, forced JSON `{message, followUpQuestions}`, regex intent detection (`isOpportunityIntent` etc.), then regex sanitizers that strip most personality.
- **No tool/function-calling anywhere** — `AiProviderAdapter` (`ai/ai.types.ts:86`) only has `generateText`/`generateEmbedding`. No streaming anywhere (`stream: false` in every adapter; single JSON response).
- **The pipeline exists 3 times** and diverges: NestJS `chat.service.ts`, Supabase edge fn `chat-proxy` (also owns Whisper STT + OpenAI TTS), and client-side fallback ranking in `edutumobile/app/(app)/chat.tsx`.
- Chat picks opportunities via a **keyword counter over the 10 newest rows** — it never touches the real recommendation engine.

**The recommendation engine is good and underused.**
- `opportunities/opportunity-ranking.service.ts` + `recommendation-blender.ts`: hybrid_v2 = pgvector semantic (45%) + behavior signals (20%) + profile-fit rules (25%) + freshness (10%), with match reasons, per-user 45s cache, `POST /opportunities/recommendations`, `POST /opportunities/match-scores`, `POST /opportunities/signals`.
- Profile embeddings auto-refresh on profile save (`profile.service.ts:66` → `refreshProfileEmbedding`, hash-invalidated). **Anything we add to the profile immediately shifts recommendations.**

**Signal plumbing is half-connected (bugs, not design):**
- `chat_like` / `chat_dislike` (−12) / `recommended_in_chat` weights exist but are **emitted by zero call sites**.
- Mobile "dismiss" is AsyncStorage-only (`dismissedOpportunities.ts`) — the backend dismiss weight (−100) + auto category-exclusion never fire.
- Mobile sends `share` signals that the backend DTO **rejects with 400** (`personalization.dto.ts:22`).

**A proactive push engine already exists** (`alerts/opportunity-alerts.service.ts`): daily interest alerts (cron 09:15 UTC, min score 62, cap 2/day, dedupe ledger, quiet hours) + deadline reminders. Limits: only 26h-fresh opportunities, requires a signal in the last 60 days, template copy (not AI), quiet hours assume UTC.

**Coaching surfaces exist but aren't chat-reachable:**
- Roadmaps: `POST /roadmaps/ai/opportunity-plan` (LLM narrative, merge-by-id), dated scaffold + calendar sync live client-side in `opportunities/[id].tsx` (`handleTrackWithRoadmap`). Chat's roadmap panel uses a **downgraded deterministic-only path**.
- Goals: **two parallel systems** — backend `/goals` (server reminders 7/3/1/0d via `notification_queue`, external Google/Outlook calendar sync via `calendar-sync.service.ts`) vs mobile `useGoals` (direct Supabase writes, local expo-notifications). `goals/add.tsx` schedules neither.
- Copilot kits (`application_kits`): LLM kit/outline/essay-feedback — no export.
- CV: `/cv/ai/draft` + `/cv/ai/tailor` + LinkedIn import; PDF only client-side via expo-print (`lib/exportCv.ts`); **no SOP generator, no DOCX, two disjoint CV stores** (`user_cvs` mobile vs `cv_records` backend).
- Opportunity images: `opportunity-share-card.service.ts` `renderSvg` (1080×1350, deterministic, cached in Storage) with public endpoints — just not surfaced in chat.
- Resources: deterministic Google/YouTube search-URL scaffolds (`generateResources`), no curated/LLM layer.

**Monetization is ready for this**: global `AiMeteringInterceptor` + `@AiMetered(action)` actions (`chatMessage`, `roadmapGeneration`, `copilotKit`, `cvAi`, …), credit ledger, Pro fair-use, admin-tunable prices.

---

## 1. Architecture: the agent loop (Pillar 0 — everything depends on this)

### 1.1 Tool-calling in the AI layer
- Extend `AiGenerateOptions`/`AiProviderAdapter` (`ai/ai.types.ts`) with `messages[]`, `tools[]` (JSON-Schema), `toolChoice`, and a result union `{ text } | { toolCalls: [{id, name, arguments}] }`.
- DeepSeek + OpenRouter adapters: OpenAI-compatible `tools`/`tool_calls` passthrough. Gemini adapter: `functionDeclarations` mapping (fallback only).
- New route keys (admin-overridable in `ai_routes`, per existing pattern):
  - `chat.agent` — deepseek-chat (supports function calling), temp 0.6, maxOutputTokens 1024, fallback → OpenRouter (admin can hot-swap to a stronger tool model without deploy).
  - `memory.extract`, `coach.pulse`, `docs.sop` — cheap/strong as appropriate.
  - `embeddings.*` stay **Gemini** (hard constraint — DeepSeek has no embeddings).

### 1.2 Orchestrator (in `chat.service.ts`, replacing regex intents)
- Loop: system prompt + memories + history → model → if `toolCalls`, execute server-side (Zod-validated, userId-scoped), append results, repeat. Caps: **max 6 tool rounds / turn**, per-tool timeout, total token budget.
- Tool registry: one file per tool under `src/chat/tools/`, each declaring `name, description, schema, execute(ctx, args), meterAction?`.
- Moderation gate stays FIRST (before the agent ever runs). Keep `SAFETY_REFUSAL` path.

### 1.3 Streaming transport
- `POST /chat/messages/stream` → SSE with typed events:
  `turn.start | text.delta | tool.start {name,label} | tool.result {summary} | cards.opportunities | action.result | doc.ready | turn.final {assistantMessage, metadata, usage}`.
- Keep the existing non-streaming `POST /chat/messages` as compatibility fallback (same orchestrator, buffered).
- Mobile: SSE via fetch/`react-native-sse`; show "Coach is checking your matches…" progress lines from `tool.start` events. Web: EventSource.

### 1.4 Consolidation (kill the triplication)
- NestJS = the one chat brain. `chat-proxy` edge fn shrinks to: Whisper STT, OpenAI TTS, and a dumb relay → backend for send (keep as availability fallback for one release, then remove its own DeepSeek pipeline).
- Remove client-side fallback ranking from `chat.tsx` once agent is stable.

### 1.5 Metering for agent turns
- Turn base cost: existing `@AiMetered("chatMessage")` on the endpoint.
- Expensive tools meter **inside** the tool via `monetizationService.meter()` with the existing actions (`roadmapGeneration`, `cvAi`, `copilotKit`) + refund on tool failure — mirrors the interceptor's charge/refund contract. The agent tells the user before running a credit-costing tool ("This'll use 5 credits — go ahead?") when balance is low.

### 1.6 Persona ("jovial coach")
- System prompt v2 stored in the existing `ai_prompts` table (admin-editable, versioned), replacing the duplicated inline prompts. Identity: warm, playful, emoji-light, celebrates wins, speaks the user's app language (i18n locale passed in context), never dumps lists when a card will do.
- Relax `sanitizeCoachMessage` — keep provider-name scrubbing + length guard, stop stripping all personality. Voice channel keeps the terse style variant.

## 2. Core tool registry (v1)

| Tool | Backs onto | Notes |
|---|---|---|
| `recommend_opportunities({limit, refinement?, excludeIds?})` | `rankingService.getPersonalizedRecommendations` | THE fix: chat finally uses hybrid_v2 + match reasons. Auto-emits `recommended_in_chat` signals. |
| `search_opportunities({query, filters})` | existing search | For explicit asks ("scholarships in Canada"). |
| `spin_opportunity()` | weighted random from user's top-30 | The fun path — see 6.2. |
| `record_feedback({opportunityIds, sentiment, reason?})` | `POST /opportunities/signals` (`chat_like`/`chat_dislike`) + memory write | "I don't like these" → dislikes + a memory of *why* + immediate re-query excluding them. |
| `get_user_profile()` / `update_user_profile(fields)` | `profile.service` (`UpdateProfileSchema`) | Slot-filling: no country → ask → save → embedding auto-refreshes → better recs *same conversation*. |
| `remember({kind, content})` / auto-recall | new `user_ai_memories` (see 3) | |
| `create_roadmap({opportunityId})` | `generateOpportunityPlan` + NEW server-side dated plan + persist `roadmaps` row (`status:'personal'`) | Returns plan preview card. |
| `create_goals({opportunityId?, goals[]})` | backend `GoalsService.create` (server reminders + external cal sync) | Returns `deviceActions` for local calendar/notifications (see 4.2). |
| `get_goals()` / `get_upcoming_deadlines()` | goals + signals | Coach awareness ("your IELTS goal is 40% done…"). |
| `draft_cv` / `tailor_cv` / `improve_cv` | `/cv/ai/*` services | Meters `cvAi`. |
| `draft_sop({opportunityId, notes})` | NEW SOP generator (generalized copilot outline/feedback engine) | |
| `edit_document({docId, instruction})` | doc patch loop (see 5) | |
| `export_document({docId, format, filename?})` | server render → Storage signed URL | PDF + DOCX. |
| `get_resources({opportunityId})` | NEW LLM-curated resources cached in `opportunities.metadata.resources` (see 5.4) | |
| `get_opportunity_image({opportunityId})` | `ensureShareCardForOpportunity` | Returns the share-card URL as an image card in chat. |

## 3. Memory & learned interests (Pillar 1)

- **Table `user_ai_memories`**: `id, user_id, kind ('interest'|'preference'|'dislike'|'fact'|'context'), content text, source ('chat'|'behavior'|'onboarding'), confidence real, created_at, last_used_at, expires_at?`. RLS service-role only.
- **Extraction**: fire-and-forget post-turn job (route `memory.extract`, cheap) distills durable facts ("wants fully-funded Masters in Canada", "dislikes unpaid internships"); dedupes against existing memories before insert.
- **Injection**: top-K relevant memories into the agent system prompt each turn.
- **The multiplier**: append memory-derived interests to `buildProfileText` (`opportunity-embedding.service.ts`) — the existing `profileHash` invalidation then re-embeds the profile, so chat-learned interests directly move pgvector recommendations everywhere (feed, widgets, alerts), not just chat.
- **Signal bug fixes (ship first, tiny)**:
  1. Backend DTO: accept `share` + give it a weight (~6).
  2. Mobile dismiss → also POST backend `dismiss` signal (keep AsyncStorage for instant UX).
  3. Emit `recommended_in_chat` / `chat_like` / `chat_dislike` from the agent tools.
  4. Sync onboarding `skills`/`ambitions` to the backend profile row (today they stop at Clerk metadata).

## 4. One-click actions from chat (Pillar 2)

### 4.1 Message protocol v2
Assistant `metadata` gains typed blocks the mobile/web chat renders natively:
- `opportunityCards` (exists today — keep),
- `actionButtons: [{id, kind: 'create_roadmap'|'create_goals'|'draft_cv'|'draft_sop'|'spin_again'|…, label, payload}]`,
- `planPreview` (roadmap milestones w/ dates), `documents: [{docId, title, format, url}]`, `image: {url}`.
One tap → `POST /chat/actions` (same tool registry, same metering) → streamed progress → success card deep-linking into the created artifact.

### 4.2 Device-side effects contract
Server tools can't touch the phone's calendar/local notifications, so tool results may include
`deviceActions: [{type: 'calendar.sync', payload: datedPlan}, {type: 'notifications.schedule', payload: reminders}]`.
The mobile chat executes them with the existing helpers (`lib/calendarSync.ts`, `notificationService.scheduleGoalReminder`) after permission prompts. External Google/Outlook sync already happens server-side for connected users (`calendar-sync.service.ts`).

### 4.3 Unify the two goals systems
All goal **writes** go through backend `/goals` (server reminders + external calendar + queue); mobile keeps reads + adds local notifications/device calendar on top. Align reminder cadence (7/3/1/0d server + day-of local). Fix `goals/add.tsx` to schedule reminders like the opportunity flow does. Chat's roadmap panel switches from the downgraded deterministic path to the same `create_roadmap`/`create_goals` tools.

## 5. Documents studio — CV + SOP, PDF/DOCX, chat-editable (Pillar 3)

- **Table `ai_documents`**: `id, user_id, type ('cv'|'sop'|'cover_letter'|'essay'), title, content jsonb (structured sections), opportunity_id?, version int, history jsonb[], updated_at`. Canonical store; adapters keep `user_cvs`/`cv_records` reading until migrated.
- **Server render service** (`src/documents/`): reuse `buildCVHtml` (already ATS-safe) server-side → PDF via headless Chromium (puppeteer-core, works on Render) — plus **DOCX via the `docx` npm package** from the same structured content. SOP templates: hook → motivation → fit → goals → closing, encoded in `ai_prompts` with best-practice rubrics (ATS rules for CV, program-fit rules for SOP).
- **Well-named files**: `"{FullName} — {DocType} — {OpportunityShort} — {YYYY-MM}.{ext}"`, stored in Storage bucket `ai-documents`, signed URLs, `doc.ready` SSE event renders a document card with [Export PDF] [Export DOCX] [Keep editing].
- **Chat editing loop**: `edit_document` applies targeted JSON patches to sections (never full regeneration), bumps `version`, appends to `history` (undo). Copilot essay feedback engine (`copilot.service`) is reused for "score my SOP".
- Mobile `expo-print` export stays as offline fallback.

## 6. Proactive coach + delight (Pillars 4-5)

### 6.1 Upgrade the existing alerts engine (don't rebuild it)
In `opportunity-alerts.service.ts`:
1. Widen candidates: top personalized matches not yet in `opportunity_alert_ledger` (not just 26h-fresh rows).
2. Drop the signals-in-60-days gate when a `user_profile_embeddings` row exists (new users get pulses too).
3. AI-authored copy via `coach.pulse` route ("Hey Paul 👋 — a 78% match for Canada just landed. Want the breakdown?"), capped length, fallback to today's template.
4. Add `profiles.timezone` (set from device on app start) and fix quiet-hours math.
5. Emit `recommended_in_chat` on push; deep-link to **chat** with the opportunity context preloaded ("why this fits you") instead of only the detail page.
6. Keep caps/ledger/admin triggers exactly as-is.
Plus: Home "coach card" (fresh matches count) and a chat greeting that surfaces one new match on open.

### 6.2 "Spin me an opportunity"
`spin_opportunity` tool = weighted random from the user's top-30 personalized matches. Mobile renders a slot-machine reveal card (reanimated) → [Love it → roadmap] [Spin again] [Not for me → feedback tool]. Zero extra backend beyond the tool.

### 6.3 Voice + web + i18n
- Voice mode inherits everything automatically (same backend turn API); TTS stays in the edge fn.
- Wire the dead web chat (`edutu-web-app/src/services/chat.ts` has no UI) to a `ChatInterface` speaking protocol v2.
- Agent answers in the app locale (9 languages already shipped on mobile).

## 7. Rollout, risks, guardrails

- **Feature flag** `AI_AGENT_ENABLED` + per-user % rollout; old pipeline remains the fallback branch for a full release cycle.
- **DeepSeek tool-calling quality**: works, but multi-step is weaker than frontier models. Mitigations: ≤6 tool rounds, strict Zod schemas w/ one retry on validation error, and `ai_routes` hot-swap to an OpenRouter tool-capable model — an admin toggle, no deploy.
- **Cost**: tool loops multiply tokens. Meter per action (2.5/1.5), log to `ai_usage_logs`, watch the admin Monetization page; keep `memory.extract`/`coach.pulse` on the cheapest route.
- **Safety**: moderation before the agent; server-side tool allowlist; every tool scoped to the authed userId; documents bucket private w/ signed URLs; pulse caps + quiet hours prevent notification spam.
- **Perf**: recommendations tool hits the 45s per-user cache; stream `tool.start` immediately so the UI never feels dead.

## 8. Phases

| Phase | Scope | Est. |
|---|---|---|
| **P0 quick wins** (independent, ship now) | `share` signal DTO fix; mobile dismiss → backend signal; chat swaps keyword ranker for `scoreOpportunitiesForUser`; emit `recommended_in_chat`; sync onboarding skills/ambitions to profile | 1–2 days |
| **P1 Agent core** | Adapter tool support, orchestrator, SSE endpoint, persona v2 in `ai_prompts`, tools: recommend/search/profile/feedback/spin/deadlines, `user_ai_memories` + extraction + embedding injection | ~2 wks |
| **P2 Actions** | `create_roadmap`/`create_goals` tools, server-side dated plan, unified goal writes, deviceActions contract, action buttons + progress UI in mobile chat | ~1.5 wks |
| **P3 Documents** | `ai_documents`, SOP generator, server PDF+DOCX render, chat edit loop, export cards, doc viewer | ~2 wks |
| **P4 Proactive** | Alerts upgrades (candidates, gates, AI copy, timezone), chat deep-link pulses, Home coach card | ~1 wk |
| **P5 Delight** | Spin animation, opportunity image card, web ChatInterface, i18n pass, remove legacy pipelines | ~1 wk |

Dependencies: P1 → P2 → P3; P4 and P5 can run parallel to P2/P3. Each phase ships behind the flag and is demo-able on its own.
