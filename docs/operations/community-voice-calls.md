# Community Voice Calls Operations Runbook

This runbook covers the scheduled community-call control plane, the mediasoup
gateway, and the native delivery paths. The feature must remain disabled until
every production gate below is complete.

## Release order

1. Apply `supabase/migrations/20260806120000_community_group_voice_calls.sql`.
2. Deploy the NestJS API with `COMMUNITY_CALLS_ENABLED=false`.
3. Deploy the Node 22 voice gateway and verify `/health`, `/ready`, and
   `/metrics` from inside the API network.
4. Configure the gateway callback to the API and verify one signed synthetic
   media-failure request in staging.
5. Ship native mobile builds containing WebRTC, CallKeep/ConnectionService,
   PushKit, and FCM support. Expo Go is not supported.
6. Deploy the web client with the production WSS origin allowlisted.
7. Complete the device and network test matrix, then enable the feature for a
   small internal cohort before wider rollout.

Do not start two media nodes until room assignment is externalized. The first
release intentionally runs one gateway node because Router state is local and
cannot migrate during a call.

## Required configuration

The API and gateway must share the same random
`COMMUNITY_CALL_TOKEN_SECRET` (at least 32 bytes). Rotate it only during a
coordinated deployment because existing join and service tokens immediately
become invalid.

API configuration is documented in
`backend/services/services/api/.env.example`. At minimum, set the feature
flag, gateway internal URL, public signaling URL policy, call windows and
limits, and the APNs/FCM credentials used for native ringing.

Gateway configuration is documented in
`backend/services/services/voice/.env.example`. In production:

- use a public, stable `VOICE_ANNOUNCED_ADDRESS`;
- expose `VOICE_SIGNALING_URL` over `wss://`;
- set `VOICE_API_CALLBACK_URL` to the API origin reachable from the gateway;
- open the configured RTC range for both UDP and TCP; and
- keep `/internal/*` network-restricted even though every request is signed.

The web client must allow the assigned WSS origin through
`VITE_VOICE_ALLOWED_WSS_ORIGINS`. Mobile and web clients use the per-call
`signalingUrl` returned by the API; they must not guess the gateway address.

## Production gates

- Backend migration, focused tests, full build, and idempotent lifecycle tests
  pass against a staging database.
- Gateway typecheck, unit/contract tests, build, and real mediasoup smoke test
  pass on the target Linux image with the production-style UDP/TCP range.
- TLS/WSS, reverse-proxy upgrade handling, health checks, and API-only access to
  gateway control routes are verified.
- iOS VoIP entitlement, APNs VoIP key, PushKit wake-up, CallKit answer/decline,
  microphone permission, and terminated-app behavior pass on physical devices.
- Android FCM high-priority data delivery, ConnectionService/CallKeep,
  foreground-service permissions, answer/decline, and terminated-app behavior
  pass on physical devices.
- Durable missed-call history appears after reconnect even when push delivery
  is deliberately blocked.
- Start authorization is tested for owner, moderator, member, removed member,
  and unauthenticated users.
- Capacity, reconnect, worker-death, maximum-duration, and one-live-call rules
  pass under load.
- Metrics and alerts are connected before enabling external users.

## Monitoring

Alert on gateway readiness loss, worker deaths, room/peer saturation, callback
retry exhaustion, callback queue drops, abnormal reconnect rates, and API
media-preparation failures. Dashboard at least:

- healthy workers, rooms, peers, transports, producers, and consumers;
- worker deaths and reconnect requests;
- API callback queue depth, attempts, retries, drops, and exhaustion;
- call starts by outcome (`live`, `failed`, `expired`); and
- native ring outcomes by provider without logging device tokens.

Never log join JWTs, push tokens, ICE credentials, DTLS fingerprints, SDP,
media payloads, or complete signaling frames.

## Incident actions

### Gateway is not ready

Keep the API feature disabled for new starts. Existing schedules and history
remain available. Check worker startup, announced address, RTC port binding,
and CPU/memory pressure. Do not route calls to a gateway that fails `/ready`.

### A worker dies

Affected calls cannot be transparently migrated. The gateway emits
`reconnectRequired`/`callEnded` and reports the media failure to the API, which
durably marks the call failed. Confirm the signed callback was accepted and
that the replacement worker becomes ready.

### Native ringing degrades

Do not hide or delete scheduled calls. Disable only the native ring provider if
needed; ordinary notification fallback and durable participant snapshots keep
the call discoverable and preserve missed-call history. Investigate provider
response codes and token ownership, never raw token values in logs.

### Rollback

Set `COMMUNITY_CALLS_ENABLED=false` first. This blocks new schedules, starts,
and join-token issuance while preserving call records. End active calls from
the control plane, drain gateway rooms, then roll back application services.
Do not drop the call tables during rollback; the migration is additive and the
history is needed for reconciliation.

## Verification matrix

Test at least two accounts in one group, including owner/moderator and member,
on current iOS and Android physical devices plus two supported browsers. Cover
foreground, background, terminated, notifications-disabled, microphone-denied,
offline-then-reconnect, Wi-Fi, cellular, UDP-blocked/TCP-fallback, late join,
decline, leave/rejoin, admin end, timeout end, and missed-call sync.

Record the build identifiers, device/OS/browser versions, gateway image,
network conditions, and test result. A scheduled call must never auto-start,
and a non-moderator must never be able to schedule or start one.
