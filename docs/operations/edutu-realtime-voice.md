# Edutu GPT Realtime voice runbook

This runbook describes the production shape of **Live** voice and the gates
that must be completed before enabling it. The design/spec is the source of
truth for product behavior:

- [production voice design](../superpowers/specs/2026-08-12-edutu-production-voice-design.md)
- [implementation plan](../superpowers/plans/2026-08-12-edutu-production-voice.md)

## Current implementation status

Live mode now uses an authenticated OpenAI Realtime WebRTC session. The
production path is:

```text
native microphone -> OpenAI Realtime WebRTC/VAD/transcription -> ask_edutu ->
authenticated Edutu chat stream + saved thread -> Realtime audio + captions
```

`useVoiceModeSession` automatically retains the existing record/transcribe/
chat/TTS pipeline as the tap-to-talk fallback for non-Pro users, unavailable
native WebRTC builds, and session-start failures. Live mode supports interim
and final user transcripts, streaming assistant captions, mute, barge-in,
background checkpoints, foreground recovery, session-expiry renewal, and
transparent transport reconnect while preserving the Edutu thread.

The Nest endpoint and mobile integration are implemented and covered by unit,
contract, lifecycle, metering, and fallback tests. The remaining release gate
is a physical-device staging pass for actual microphone, speaker, Bluetooth,
and OS-interruption behavior.

## Required production architecture

1. The authenticated mobile client requests a short-lived session from Nest:
   `POST /voice/realtime/session` with an SDP offer. The body must not contain
   an authority-bearing user ID or entitlement flag.
2. Nest verifies the Clerk bearer token, checks the current server-side Pro
   entitlement, reserves the bounded voice unit, and proxies the offer to
   OpenAI using the server-only `OPENAI_API_KEY`. The mobile bundle must never
   receive that key.
3. The mobile client creates a native `RTCPeerConnection`, adds its
   microphone track, exchanges SDP, and uses the data channel for Realtime
   events. The OpenAI Realtime model supplies transport/orchestration only.
4. Every completed utterance must invoke the `ask_edutu` tool exactly once.
   The mobile tool handler calls Edutu’s authenticated chat stream, persists
   the returned thread ID, and sends the canonical `{ threadId, reply }` tool
   result back over the data channel. The Realtime model must not answer from
   its own ungrounded knowledge.
5. `session.close()` must be idempotent: stop local tracks, close the data
   channel and peer connection, clear reconnect timers, abort outstanding
   Edutu work, and ignore late events. Backgrounding, sign-out, mute, barge-in,
   and overlay close are teardown boundaries.

Expected event coverage includes `session.created`, `session.updated`, server
VAD speech start/stop, input transcription deltas/completion,
`response.function_call_arguments.done`, output-audio transcript deltas and
completion, `response.done`, and `error`.

## Native build gate

`react-native-webrtc` and its Expo config plugin are declared in
`edutumobile/package.json` and `edutumobile/app.config.js`. Realtime cannot be
verified in Expo Go; use a development or TestFlight build with the native
module linked:

```bash
cd edutumobile
npx expo run:ios
# or
npx expo run:android
```

On a physical device, verify microphone permission, remote audio output,
headset/Bluetooth routing, interruption, background teardown, reconnect, and
barge-in. A simulator smoke test is not sufficient for audio behavior.

## Configuration and rollout

Keep these values server-side (Nest environment or secret manager):

- `OPENAI_API_KEY`
- `OPENAI_REALTIME_MODEL`
- the canonical API/database/Clerk configuration used to verify identity and
  Pro entitlement

The current turn-based fallback uses a conservative `PRO_VOICE_DAILY_MINUTES=5`
default. Each STT and TTS call reserves started provider minutes independently,
so a complete turn normally consumes two units; individual recordings are
hard-capped at 120 seconds and oversized/invalid M4A payloads are rejected.
Raise the daily value only after cost telemetry confirms the active weekly,
monthly, and yearly plans remain profitable.

Expose no OpenAI secret through `EXPO_PUBLIC_*`. The server-derived Pro
entitlement is the primary rollout gate. Release the native build only after
the staging checks pass. Non-Pro users, entitlement-loading states, Expo Go,
missing native WebRTC, and provider/session failures use the abortable
tap-to-talk fallback; they do not receive a premium provider session.

## Observability and rollback

Record structured, non-audio metadata for each session: authenticated user
hash, session/call ID, model, entitlement decision, reserved/settled/refunded
voice units, setup latency, connection close reason, tool-call ID, and provider
error class. Never log SDP, bearer tokens, raw transcripts, or audio payloads.

Before enabling the flag, confirm the ledger at the 1-second, 60-second, and
61-second boundaries and confirm a failed provider setup refunds exactly once.
If setup, tool fulfillment, audio teardown, or unit settlement is unhealthy,
disable the flag and let users continue through tap-to-talk. Do not roll back
by shipping an API key to the client or by bypassing the Pro check.

## Remaining environment-only gate

The authenticated session proxy, native `RTCPeerConnection`/data channel,
required `ask_edutu` fulfillment, live captions, persistence, reconnection,
and fallback orchestration are implemented. A physical-device development or
TestFlight build must still validate actual audio routing and interruption;
Jest and TypeScript cannot prove device microphone/speaker behavior.
