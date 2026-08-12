# Edutu Production Voice Design

## Goal

Ship a production-ready mobile voice experience that removes the review blockers: authenticated thread ownership, fail-closed premium audio, real cancellation, duration-aware charging, and low-latency GPT Realtime WebRTC in Live mode.

## Product split

- **Voice (tap to talk):** preserve the existing Edutu STT → authenticated Edutu chat → TTS pipeline. Stream Edutu chat text into captions, abort every network stage on background/end/account change, and use device speech when premium authorization is unavailable.
- **Live:** use OpenAI Realtime over WebRTC. The realtime model is an audio transport/orchestrator, not Edutu's source of truth. Every completed user utterance must call one `ask_edutu` function. The mobile client fulfills that function through the existing authenticated `/chat/messages/stream` endpoint, then returns the canonical Edutu reply for spoken output.

This keeps Edutu tools, opportunity grounding, safety handling, persistence, and chat metering authoritative while adding native low-latency audio, server VAD, and interruption.

## Trust boundaries

- The OpenAI standard API key exists only on the Nest backend and Supabase Edge Function.
- Mobile receives no standard API key. WebRTC initialization is proxied through authenticated Nest `POST /voice/realtime/session`.
- Clerk identity comes only from the verified bearer token. Body `userId`, entitlement flags, prices, and charge units are never authorization inputs.
- A supplied chat thread is usable only after `(thread_id, authenticated_user_id)` ownership succeeds. Foreign and missing IDs both return 404.
- Premium neural TTS and GPT Realtime require a current server-side Pro entitlement. Client entitlement state controls presentation only and fails closed while loading.

## Billing

- `voicePerMinute` means credits per started minute, not per request.
- `MonetizationService.meter(userId, action, units)` multiplies the configured unit price by validated integer units.
- STT units use duration parsed from the uploaded M4A container on the Edge Function. Invalid/unparseable or over-limit media is rejected before a provider call.
- TTS units use a server-side spoken-duration estimate from the truncated provider input.
- Realtime sessions reserve one started minute at session creation. Sessions are deliberately bounded to one minute for the first release; Live reconnects between minute windows so every provider session has a server-authorized charge. Failed provider setup refunds the reservation.
- Provider failures refund exactly once using the existing owned ledger handle.

## Lifecycle

Every voice turn owns an `AbortController` generation. Beginning a newer turn, barge-in, mute, app background, sign-out, overlay close, or unmount aborts transcription/chat/TTS and prevents stale callbacks from changing UI, speaking, or rearming the microphone.

Realtime session close stops all local media tracks, closes the data channel and peer connection, clears reconnect timers, and ignores late events. Backgrounding closes the session; foregrounding requires a visible resume unless the user is still in Live mode and opted into hands-free behavior.

## Realtime event contract

Mobile handles:

- `session.created` / `session.updated`: connection ready.
- `input_audio_buffer.speech_started`: listening/barge-in state.
- `conversation.item.input_audio_transcription.delta|completed`: live/final user caption.
- `response.function_call_arguments.done` for `ask_edutu`: invoke authenticated Edutu streaming chat once using the call ID as the deduplication key.
- `response.output_audio_transcript.delta|done`: assistant caption and completion.
- `response.done` / `error`: settle UI and recover without replaying stale work.

The `ask_edutu` tool accepts `{ message: string }`. Its output is JSON containing the canonical `threadId` and `reply`. Session instructions require the realtime model to speak `reply` faithfully and never answer from its own knowledge.

## Fallbacks

- Non-Pro, entitlement-loading, Expo Go, WebRTC initialization failure, or Realtime provider failure falls back to the abortable tap-to-talk pipeline; it never silently grants premium service.
- Neural TTS authorization/provider failure falls back to device speech.
- A failed streaming chat establishment may use the existing non-streaming fallback only before any authoritative streamed content is shown.

## Release gates

- Mobile focused and full Jest, TypeScript, and lint.
- Backend focused and full Jest, TypeScript build, and lint.
- Edge pure-helper tests for duration/units and ownership behavior.
- Native iOS/Android development builds demonstrating linked `react-native-webrtc`, microphone permission, remote audio, interruption, background teardown, and reconnect.
- Staging ledger check at 1s, 60s, and 61s boundaries plus provider-failure refund.
- Final independent security/mobile review with no P0/P1 findings.

