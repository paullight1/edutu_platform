# Edutu Production Voice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all release-blocking findings in Edutu mobile voice and add authenticated GPT Realtime WebRTC Live mode.

**Architecture:** Tap-to-talk remains the trusted Edutu pipeline with streamed captions and cancellation. Live mode uses OpenAI Realtime WebRTC as audio transport and must delegate every user turn to Edutu's authenticated streaming chat through an `ask_edutu` tool. Nest owns premium authorization and Realtime session creation; the Edge Function owns upload validation and server-derived voice units.

**Tech Stack:** React Native 0.85 / Expo 56, react-native-webrtc 124.0.8, NestJS, Clerk, Supabase Edge Functions, OpenAI Realtime API, Jest.

## Global Constraints

- Never expose `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or another server secret to mobile code or an `EXPO_PUBLIC_*` variable.
- Authentication uses Clerk bearer tokens and authorization uses the authenticated identity, never body `userId` or client entitlement state.
- Foreign and unknown thread IDs return the same 404 response.
- Premium provider audio fails closed server-side; device speech remains the non-premium fallback.
- `voicePerMinute` is billed in positive integer started-minute units.
- App background, unmount, sign-out, mute, barge-in, and explicit end abort or close all in-flight voice work.
- Tests are written and observed failing before production changes.
- Preserve unrelated dirty-worktree changes and do not edit the ongoing billing migration files.

---

### Task 1: Secure and unit-aware voice metering

**Files:**
- Modify: `backend/services/services/api/src/monetization/monetization.service.ts`
- Modify: `backend/services/services/api/src/monetization/monetization.controller.ts`
- Test: `backend/services/services/api/src/monetization/monetization.service.spec.ts`
- Test: `backend/services/services/api/src/monetization/monetization.metering.spec.ts`

**Interfaces:**
- Produces: `meter(userId, action, units?: number)` and `POST /monetization/voice/authorize { kind: "tts" | "realtime" }`.
- The existing `/monetization/meter` accepts optional `units`, restricted to `voicePerMinute`, integer `1..120`.

- [ ] Add failing tests for 1/2 started-minute multiplication, invalid units, canonical Pro allow/deny, stale-profile denial, and billing lookup failure.
- [ ] Run the focused Jest files and verify those cases fail for the missing behavior.
- [ ] Implement validated unit multiplication without changing single-unit behavior for other actions.
- [ ] Add the authenticated fail-closed premium authorization endpoint backed by canonical active entitlements.
- [ ] Re-run the focused tests to green.

### Task 2: Edge ownership, duration derivation, and premium enforcement

**Files:**
- Create: `edutumobile/supabase/functions/chat-proxy/voice-usage.ts`
- Modify: `edutumobile/supabase/functions/chat-proxy/index.ts`
- Test: `edutumobile/__tests__/chatProxyVoiceUsage.test.ts`

**Interfaces:**
- Consumes: `/monetization/meter { action: "voicePerMinute", units }` and `/monetization/voice/authorize`.
- Produces: `parseM4aDurationSeconds(bytes)`, `startedMinuteUnits(seconds)`, and owned-thread resolution before history or writes.

- [ ] Add failing tests for MP4 `mvhd` duration parsing and 1s/60s/61s unit boundaries.
- [ ] Add a failing ownership behavior test using a fake Supabase query chain.
- [ ] Run the focused Jest test and verify red failures.
- [ ] Implement strict M4A validation, duration cap, server-derived units, and TTS server estimates.
- [ ] Enforce premium authorization before paid TTS.
- [ ] Resolve an existing thread by both ID and authenticated owner before history, inserts, or updates; return generic 404 otherwise.
- [ ] Re-run focused tests and mobile typecheck.

### Task 3: Abortable streamed tap-to-talk

**Files:**
- Modify: `edutumobile/hooks/useVoiceSession.ts`
- Modify: `edutumobile/lib/edutuSpeech.ts`
- Modify: `edutumobile/components/chat/VoiceModeOverlay.tsx`
- Test: `edutumobile/__tests__/voiceSession.test.ts`
- Test: `edutumobile/__tests__/edutuSpeech.test.ts`

**Interfaces:**
- Consumes: `streamChatMessage(..., { signal, onToken })`.
- Produces: generation-scoped cancellation; `speak(..., { signal })`; fail-closed `premiumVoiceEnabled = false`.

- [ ] Add failing tests for background/unmount during transcription, chat, and TTS; stale turn suppression; account change reset; fail-closed premium loading.
- [ ] Run focused Jest and verify red failures.
- [ ] Add a turn-scoped AbortController and pass its signal through file fetch, Edge transcription, chat streaming, and TTS synthesis.
- [ ] Render streamed tokens as the assistant caption and reconcile to `turn.final`.
- [ ] Abort before recorder/TTS cleanup on every lifecycle exit and prevent late continuations.
- [ ] Default premium voice false and enable it only after explicit current Pro success.
- [ ] Re-run focused tests and typecheck.

### Task 4: Authenticated Realtime session backend

**Files:**
- Create: `backend/services/services/api/src/voice/voice.module.ts`
- Create: `backend/services/services/api/src/voice/voice.controller.ts`
- Create: `backend/services/services/api/src/voice/realtime-voice.service.ts`
- Create: `backend/services/services/api/src/voice/realtime-voice.service.spec.ts`
- Modify: `backend/services/services/api/src/app.module.ts`
- Modify: `backend/services/services/api/src/main.ts`
- Modify: `backend/services/services/api/.env.example`

**Interfaces:**
- Produces: authenticated `POST /voice/realtime/session { sdp, voice?, locale? } -> { sdp, expiresAt }`.
- Session config exposes only `ask_edutu(message)` and requires that call for each user turn.

- [ ] Add failing tests for missing key, non-Pro denial, malformed/oversized SDP, privacy-preserving safety ID, exact OpenAI multipart contract, setup refund, and sanitized voice/locale.
- [ ] Run the focused Jest test and verify red failures.
- [ ] Implement the OpenAI `/v1/realtime/calls` unified WebRTC proxy using the server key and a hashed user safety identifier.
- [ ] Reserve one voice minute before provider setup and refund on setup failure.
- [ ] Configure server VAD, interruption, input transcription, bounded output, and required `ask_edutu` tool behavior.
- [ ] Register the module and document `OPENAI_REALTIME_MODEL` without a secret value.
- [ ] Re-run focused tests, backend typecheck/build, and lint.

### Task 5: Mobile GPT Realtime WebRTC session

**Files:**
- Create: `edutumobile/lib/realtimeVoiceSession.ts`
- Create: `edutumobile/__tests__/realtimeVoiceSession.test.ts`
- Modify: `edutumobile/hooks/useVoiceSession.ts`
- Modify: `edutumobile/components/chat/VoiceModeOverlay.tsx`

**Interfaces:**
- Consumes: `/voice/realtime/session`, `streamChatMessage`, Clerk token, `react-native-webrtc`.
- Produces: `RealtimeVoiceSession.start()`, `setMuted()`, `interrupt()`, and idempotent `close()` with typed callbacks.

- [ ] Add failing tests for offer/answer setup, required tool fulfillment, transcript deltas, duplicate call suppression, background close, track/channel/peer teardown, interruption, and connection failure fallback.
- [ ] Run the focused Jest test and verify red failures.
- [ ] Implement lazy native WebRTC import, microphone track, data channel, SDP exchange, and event parsing.
- [ ] Fulfill `ask_edutu` via authenticated streaming chat, persist its returned thread ID, and send canonical tool output back once.
- [ ] Integrate Live mode only for explicit Pro; keep tap-to-talk fallback for non-Pro/unavailable builds.
- [ ] Re-run focused tests, full voice suite, typecheck, and lint.

### Task 6: Production verification and release report

**Files:**
- Create: `docs/operations/edutu-realtime-voice.md`
- Modify: `edutumobile/docs/TESTFLIGHT_GUIDE.md`

**Interfaces:**
- Produces: deployment configuration, staged rollout/rollback instructions, observability fields, physical-device matrix, and final evidence.

- [ ] Run complete mobile Jest, typecheck, and lint.
- [ ] Run complete backend Jest with open-handle detection, build, and lint.
- [ ] Verify Expo config and native WebRTC autolinking without overwriting the user's native projects.
- [ ] Document server/Edge secrets, rollout flag, dashboards, refund checks, and rollback.
- [ ] Dispatch independent mobile/security code review and fix all P0/P1 findings.
- [ ] Record remaining environment-only gates (EAS builds, physical devices, staging provider call) honestly; do not describe unexecuted external gates as passing.

