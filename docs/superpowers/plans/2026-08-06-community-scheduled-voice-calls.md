# Community Scheduled Voice Calls — Integration Plan

**Date:** 2026-08-06

**Status:** Implemented behind `COMMUNITY_CALLS_ENABLED`; production rollout is
blocked on the physical-device, provider-credential, target-host, and load gates
that remain unchecked below.

**ADR:** `docs/architecture/adr/0002-community-voice-mediasoup-gateway.md`

**Diagram:** `docs/architecture/community-voice-calls.mmd`

## Goal

Add audio-only group calls to Edutu discussions. Calls must be scheduled,
visible in the group before they happen, and manually started by a group admin.
Starting a call invites every active group member, including members whose app
is backgrounded or terminated. Members who do not join see a durable missed
call in the group and notification inbox.

In this plan, **group admin** means an active `community_group_members` row with
role `owner` or `mod`, resolved through the existing `canModerateGroup()` rule.
Global Edutu administrators do not gain group-call authority merely from their
platform role.

The current mobile route is `/discussions`; `/communities` is the backend
module and product domain. Mobile discussions contain the complete group-chat
entry points. The web app now supports protected call participation and deep
links, while web group-chat transcript parity remains a later slice.

## What was unpacked from mediasoup

The official `versatica/mediasoup` repository was cloned for review at
`/private/tmp/mediasoup`.

- Reviewed commit: `5baac84111b917f251daf28b013f7665ac3cb7b6`
- Reviewed package: mediasoup `3.24.1`
- Runtime requirement: Node `>=22`
- License: ISC
- `node/src/` is the TypeScript control API for Worker, Router,
  WebRtcTransport, Producer, Consumer, and audio observers.
- `worker/` is the C++ media subprocess. The Node layer spawns it and exchanges
  control messages over FlatBuffers channels.
- A Worker uses one CPU core and owns Routers. A Router is the natural room
  boundary. A WebRtcTransport is the server side of a client's WebRTC
  connection. Producers send tracks; Consumers receive tracks.
- `AudioLevelObserver` and `ActiveSpeakerObserver` provide speaking indicators
  without decoding audio.
- mediasoup does not provide signaling, auth, schedules, push ringing, call
  history, or a ready-made room service. Edutu must own those layers.

Do not copy the cloned source into this repository. Consume pinned npm releases
in the dedicated gateway and keep the exact version in its lockfile.

## Non-negotiable product rules

1. A call record must exist in `scheduled` state before it can be started.
2. Only a group owner or moderator can schedule, edit, cancel, start, or end a
   call.
3. Starting is manual. A scheduler sends reminders and expires abandoned
   schedules; it never starts media by itself.
4. The server rejects starts outside a configurable start window. Proposed
   pilot defaults are five minutes before through thirty minutes after the
   scheduled time; product must approve these values.
5. Only one call may be `starting` or `live` in a group.
6. The active-member list is snapshotted when the call goes live. That snapshot
   is the ringing and missed-call audience.
7. The call can remain joinable after the short ringing window while it is
   live. A late member sees “Join live call,” not another unsolicited ring.
8. No recording in the first release. DTLS-SRTP protects media in transit, but
   this is not end-to-end encryption against the SFU.
9. Muted is the default on join until the microphone permission and pre-join
   check succeed.
10. Calls have a configurable maximum duration and participant cap. Initial
    numbers are selected from load tests, not guesses.

## Honest offline-ringing contract

No service can guarantee that every offline device rings: a device may have no
network, notifications disabled, Do Not Disturb enabled, an expired token, or
OS delivery suppression. The implementation guarantees two different things:

- **Best-effort immediate ring:** iOS PushKit + CallKit and Android high-priority
  FCM + ConnectionService/CallKeep, with an ordinary Expo push fallback.
- **Guaranteed server-side history:** every invitee snapshot receives a call
  participation row. If they never join, it becomes `missed`, so they see the
  missed call on their next sync even if no push reached the device.

A plain Expo notification is not sufficient for a true incoming-call
experience on locked or terminated devices. The native calling work is part of
feature completion, not an optional polish item.

## Target architecture

### Existing NestJS API — durable control plane

Owns authorization, schedules, call state transitions, invitee snapshots,
notifications, join-token minting, audit history, and media-gateway commands.
It remains on Node 20 initially.

### New voice gateway — ephemeral media plane

Create `backend/services/services/voice/` as a Node 22 TypeScript service with
`mediasoup`, `ws`, and a minimal HTTP health/control server. It owns workers,
routers, transports, producers, consumers, audio-level events, and WSS
signaling. It does not query or mutate group membership directly.

Deploy it on infrastructure with a stable public address and explicit inbound
UDP/TCP RTC ports. The existing Render HTTP API deployment is not assumed to
provide this. Start with one media node; add Redis-backed room assignment only
before adding a second node.

### Mobile app — media and native call UI

Use `mediasoup-client@3` plus `react-native-webrtc`, calling
`registerGlobals()` before creating a mediasoup `Device`. This requires a
development/production native build; Expo Go cannot load the native module.
Use `react-native-callkeep` (or a proven equivalent) for iOS CallKit and Android
ConnectionService, plus PushKit/APNs VoIP on iOS and direct high-priority FCM
data messages on Android.

### Web app — protected participation parity

Use the same `mediasoup-client` signaling contract with browser
`getUserMedia()`. Web Push may notify a closed browser, but native phone-style
ringing is not promised on the web.

## Persistent data model

Add a migration named
`supabase/migrations/20260806120000_community_group_voice_calls.sql` and mirror
it in Drizzle.

### `community_group_calls`

- `id uuid primary key`
- `group_id uuid not null`
- `title text not null`
- `scheduled_for timestamptz not null`
- `duration_minutes integer not null`
- `status text not null`: `scheduled | starting | live | ended | cancelled |
expired | failed`
- `created_by text not null`
- `started_by text null`, `ended_by text null`
- `started_at`, `ring_expires_at`, `ended_at`, `cancelled_at`
- `media_node_id text null`, `media_room_id text null`
- `failure_code text null`
- `version integer not null default 1`
- `created_at`, `updated_at`

Constraints and indexes:

- Partial unique index allowing at most one `starting`/`live` call per group.
- Index `(group_id, scheduled_for desc)` for the chat history and upcoming card.
- Compare-and-set transitions using `status` and `version`; no read-then-write
  lifecycle updates.

### `community_group_call_participants`

One row per user in the start-time active-member snapshot.

- Primary key `(call_id, user_id)`; `user_id` is the raw Clerk subject (`text`).
- `role_at_start`
- `invite_status`: `pending | ringing | notified | joined | declined | missed |
unreachable`
- `first_notified_at`, `first_joined_at`, `last_joined_at`, `left_at`
- `joined_count integer not null default 0`
- `created_at`, `updated_at`

The row records user-level outcome, not one row per device. Transport delivery
details continue to live in notification telemetry.

### `community_group_call_events`

Append-only audit and diagnostics stream:

- `id`, `call_id`, `actor_id`, `type`, `payload jsonb`, `created_at`
- Unique `(call_id, type, idempotency_key)` where an idempotency key applies.

Record schedule, reschedule, cancel, start requested, media ready, join,
decline, leave, end, expiry, and failure. Never store SDP, DTLS keys, access
tokens, or raw audio metadata in this table.

### Existing tables to extend

- Add nullable `call_id` to `community_group_messages` and allow `kind='call'`
  so schedule/live/ended cards have a stable transcript anchor.
- Extend notification kinds with `community-call-reminder`,
  `community-call-started`, and `community-call-missed`.
- Store APNs VoIP and direct FCM calling tokens through the existing push-token
  ownership boundary, using explicit providers and device identifiers. Do not
  confuse an Expo token with a native VoIP token.

RLS remains `SELECT`-only. Clients never write calls or participants directly.
Only active members can read call rows for a private group; a participant can
read their own outcome row. Service-role code performs all writes.

## Call state machine

```text
scheduled ──cancel──> cancelled
    │
    ├──grace elapsed──> expired
    │
    └──admin start──> starting ──gateway ready──> live ──admin/timeout──> ended
                           │                         │
                           └──prepare failure──────> failed
```

`POST start` is idempotent. It first atomically changes `scheduled` to
`starting`, then calls the gateway's idempotent room-prepare endpoint. Only
after the gateway returns ready does the API atomically write `live`, snapshot
members, enqueue ring delivery, and append the call message/event. If media
preparation fails, the call becomes `failed`; nobody is rung for a room they
cannot join.

## REST control-plane API

All handlers use `@CurrentUser("authId")` because community IDs are raw Clerk
subjects.

| Method  | Route                                   | Authorization and purpose                             |
| ------- | --------------------------------------- | ----------------------------------------------------- |
| `GET`   | `/communities/groups/:groupId/calls`    | Readable group; upcoming and recent calls             |
| `GET`   | `/communities/calls/:callId`            | Readable group; viewer outcome and live state         |
| `POST`  | `/communities/groups/:groupId/calls`    | Owner/mod; schedule with timezone-safe ISO instant    |
| `PATCH` | `/communities/calls/:callId`            | Owner/mod; edit only while scheduled                  |
| `POST`  | `/communities/calls/:callId/cancel`     | Owner/mod; idempotent cancellation                    |
| `POST`  | `/communities/calls/:callId/start`      | Owner/mod; scheduled-window + single-live-call checks |
| `POST`  | `/communities/calls/:callId/end`        | Owner/mod; idempotently end for everyone              |
| `POST`  | `/communities/calls/:callId/join-token` | Active member; live call only; 60-second signed token |
| `POST`  | `/communities/calls/:callId/decline`    | Invitee; records decline without joining media        |
| `POST`  | `/communities/calls/:callId/leave`      | Joined member; presence fallback/audit                |

Every mutation accepts an idempotency key. Return stable domain codes such as
`CALL_NOT_SCHEDULED`, `CALL_OUTSIDE_START_WINDOW`, `CALL_ALREADY_LIVE`,
`CALL_FULL`, and `MEDIA_UNAVAILABLE`; clients do not branch on prose.

## Gateway control and signaling contracts

### Internal API-to-gateway calls

- `PUT /internal/calls/:callId/room` — idempotently prepare one Router and
  return node/room identity.
- `DELETE /internal/calls/:callId/room` — idempotently close transports,
  producers, consumers, observer, and Router.
- `GET /health` — process liveness.
- `GET /ready` — at least one healthy worker, valid announced address, and
  media listeners bound.

Authenticate internal calls with short-lived service JWTs or HMAC signatures,
timestamp validation, and replay protection. Do not expose these routes through
the public API hostname.

### Client WebSocket protocol

All request messages carry a request ID and receive an explicit success/error
response.

Client requests:

- `authenticate`
- `getRouterRtpCapabilities`
- `createTransport` (`send` or `recv`)
- `connectTransport`
- `produceAudio`
- `pauseProducer`, `resumeProducer`, `closeProducer`
- `consume`, `resumeConsumer`
- `leave`

Server events:

- `peerJoined`, `peerLeft`
- `newProducer`, `producerClosed`
- `participantMuted`
- `activeSpeakers`
- `callEnded`
- `membershipRevoked`
- `reconnectRequired`

The join token contains `sub`, `callId`, `groupId`, `role`, `aud`, `jti`, and a
60-second expiry. It authorizes opening a session, not remaining forever; the
gateway enforces call end, token claims, capacity, and membership-revocation
events.

Use one send transport and one receive transport per participant. Create an
Opus producer only after explicit microphone consent. Consume other audio
producers only when `router.canConsume()` succeeds. Use an AudioLevelObserver
for speaking indicators; never infer speaking from client claims.

## Ringing, reminders, and missed calls

### At schedule time

- Insert a call message card into the group transcript.
- Queue a routine reminder, proposed at 15 minutes before start.
- Rescheduling cancels/replaces pending reminder rows by a call-specific dedupe
  prefix.

### When an admin starts

1. Prepare media and transition the call to `live`.
2. Snapshot all active members in the same database transaction.
3. Exclude only the starting device from ringing; the admin's other devices may
   still receive a silent synchronization event.
4. Send native call invitations with call UUID, group name, call title,
   `ringExpiresAt`, and a deep link. Use a short payload and fetch display data
   after wake when necessary.
5. Send an ordinary high-priority Expo push fallback to devices without a
   native calling token.
6. Publish `call-started` to currently connected app sessions.

Call-start pushes bypass marketing/routine fatigue limits and quiet-hour
deferral because they represent a live user-facing session, but the OS and the
user's notification/DND settings remain authoritative. Give ring pushes a
short expiry so a delayed packet cannot ring after the call ends.

### Missed-call finalization

At `ring_expires_at`, participants who have never joined move to `missed` (or
`unreachable` when every known delivery attempt was rejected). Insert one
deduplicated missed-call inbox notification. If the call is still live, that
notification may offer “Join now”; after it ends it opens the call summary.
Joining after the ring window changes `missed` to `joined` while preserving the
original ring timestamps in the event history.

## Mobile surfaces

Add these feature modules rather than growing the existing 1,000-line chat
route:

- `features/community-calls/api.ts` — typed REST control-plane client.
- `features/community-calls/signaling.ts` — WSS request/event protocol.
- `features/community-calls/media.ts` — mediasoup Device and transport lifecycle.
- `features/community-calls/nativeCall.ts` — CallKeep/PushKit/FCM adapter.
- `features/community-calls/useCommunityCall.ts` — screen state orchestration.
- `components/community/calls/ScheduledCallCard.tsx`
- `components/community/calls/CallPreflight.tsx`
- `components/community/calls/VoiceCallRoom.tsx`
- `app/(app)/discussions/[id]/calls/new.tsx` — owner/mod scheduling screen.
- `app/(app)/discussions/[id]/calls/[callId].tsx` — preflight/live/summary route.

The group chat header shows the nearest scheduled call and a countdown. A
transcript call card shows scheduled, live, ended, cancelled, or missed state.
Only admins see Schedule, Edit, Cancel, Start, and End-for-everyone controls.

The live room includes participant list, speaking indicator, mute, audio route,
leave, reconnect state, and admin end control. It must handle denied microphone
permission, unsupported device, call full, call ended, connection loss, and
media-server failure. Every new string goes through all nine community locale
files.

## Delivery plan

### Phase 0 — compatibility and infrastructure spike (go/no-go)

- [x] Pin a mediasoup server/client version pair after checking release notes.
- [ ] Build the Node 22 gateway image and worker on the target Linux host.
- [ ] Expose WSS plus UDP/TCP RTC listeners with a correct announced public IP.
- [ ] Connect Chrome, one physical iPhone, and one physical Android device.
- [ ] Prove two-way Opus, mute, speaker/Bluetooth routing, and network recovery.
- [ ] Prove terminated-device native ringing on both mobile platforms.
- [x] Record the exact Expo config-plugin/native changes required by SDK 56,
      React Native 0.85, and the New Architecture.
- [ ] Stop if PushKit/CallKeep or react-native-webrtc cannot build reliably;
      resolve that before writing product persistence.

### Phase 1 — durable call domain

- [x] Add migration, Drizzle schema, call state machine, repository, and unit
      tests.
- [x] Add admin-only schedule/edit/cancel/start/end services using existing
      community authorization helpers.
- [x] Add participant snapshot and append-only event writes.
- [x] Add call transcript cards and SELECT-only RLS.
- [x] Add REST DTO validation, idempotency, rate limits, and domain errors.
- [x] Add lifecycle cron for reminders, ring expiry, duration timeout, and
      abandoned-schedule expiry. Use compare-and-set claims so multiple API
      instances cannot process the same call.

### Phase 2 — media gateway

- [x] Scaffold `backend/services/services/voice/` with Node 22, locked
      dependencies, Dockerfile, health checks, and structured logging.
- [x] Implement worker pool, room registry, Router-per-call lifecycle, and
      Opus-only codec configuration.
- [x] Implement internal prepare/end endpoints and signed service auth.
- [x] Implement versioned WebSocket signaling and short-lived join-token auth.
- [x] Implement transport/producer/consumer cleanup and AudioLevelObserver.
- [x] Add gateway unit tests and real-worker integration tests.
- [x] Emit metrics for workers, rooms, peers, transports, producers, consumers,
      bitrate, packet loss, reconnects, and worker deaths.

### Phase 3 — in-app mobile calls

- [x] Add native WebRTC dependencies and config plugin changes.
- [x] Implement the typed API/signaling/media adapters and preflight check.
- [x] Add schedule management UI for owners/mods.
- [x] Add scheduled/live/missed transcript cards and chat-header countdown.
- [x] Add live audio room UI and app foreground/background recovery.
- [x] Add nine-locale copy, accessibility labels, reduced-motion behavior, and
      analytics events.
- [x] Add focused Jest tests.
- [ ] Complete physical-device integration tests.

### Phase 4 — native offline ringing

- [x] Register and rotate APNs VoIP tokens separately from ordinary Expo tokens.
- [x] Configure PushKit and the `voip` background mode; immediately report valid
      incoming calls to CallKit.
- [x] Configure Android direct FCM handling, ConnectionService/CallKeep, and the
      microphone foreground service required during active background calls.
- [x] Wire Answer, Decline, End, and answer-on-another-device events to the
      server idempotently.
- [x] Add short push TTL, stale-token cleanup, fallback Expo push, and delivery
      telemetry.
- [ ] Test locked, backgrounded, terminated, offline, DND, revoked permission,
      and stale-push scenarios on real devices.

### Phase 5 — web parity

- [ ] Add upcoming/live call cards to web group chat once group-chat parity
      exists there.
- [x] Implement browser mediasoup client and microphone preflight.
- [x] Add Web Push notification/deep linking with a clearly documented
      best-effort ringing contract.

### Phase 6 — load, rollout, and operations

- [ ] Load-test realistic audio rooms and choose the pilot participant cap from
      CPU, egress, consumer count, and mobile battery results.
- [ ] Add synthetic call probes and alerts for worker death, room-prepare
      failures, join latency, push rejection, and abnormal disconnect rate.
- [ ] Add feature flags for scheduling, joining, and native ringing separately.
- [ ] Roll out to staff groups, then selected communities, then all eligible
      groups.
- [ ] Document drain-before-deploy for media nodes; never terminate a node with
      live rooms during a normal release.
- [ ] Add Redis room assignment and multiple media nodes only after one-node
      saturation or availability data justifies it.

## Test and acceptance matrix

### Authorization and scheduling

- Member cannot schedule, edit, cancel, start, or end.
- Owner and moderator can perform those operations.
- Admin cannot start an unscheduled, cancelled, expired, ended, or out-of-window
  call.
- Concurrent starts create one room and one invite snapshot.
- A second live call in the same group is rejected.
- Removed/banned/pending/invited users cannot obtain a join token.

### Ringing and history

- Every active member at start has exactly one participant row.
- Online members see the live event immediately.
- Locked/terminated devices receive native call UI when OS policy permits.
- No token, disabled notifications, stale token, and offline device all produce
  durable missed-call history without retry storms.
- A delayed push cannot ring after `ring_expires_at` or call end.
- Answering on one device stops ringing on the user's other connected devices.

### Media

- Audio is Opus only; no camera permission is requested.
- Mute state, speaker/Bluetooth route, interruptions, app backgrounding, and
  reconnect behave on iOS and Android physical devices.
- Producer/consumer/transport resources close on leave, disconnect timeout,
  kick, call end, and worker shutdown.
- Worker death transitions the durable call to `failed` and dismisses native
  call UI; the first release does not pretend the call migrated.

### Performance targets to validate during the spike

- Measure API start-to-live transition, push dispatch latency, WSS connection,
  time to first remote audio, CPU per worker, egress, packet loss, reconnect
  rate, and battery use.
- Do not publish numerical SLOs or a participant limit until measurements exist
  on the selected media host and representative Nigerian mobile networks.

## Security and privacy checklist

- Short-lived call-scoped tokens; no Clerk token in media logs.
- WSS for signaling and DTLS-SRTP for media.
- Internal gateway routes authenticated and network-restricted.
- Membership checked when minting a token and revocations propagated to live
  rooms.
- Rate-limit token minting, signaling requests, joins, and admin transitions.
- No recording, transcription, or persistent audio in v1.
- Publish microphone/call privacy copy and retention rules for call metadata.
- Redact SDP, ICE credentials, DTLS parameters, push tokens, and IP addresses
  from normal application logs.

## Rollback

- Disable the scheduling feature flag to stop new calls.
- Leave call-history reads enabled so existing scheduled/missed records remain
  understandable.
- Drain live rooms, disable native ring dispatch, then stop the media gateway.
- Database additions are backward-compatible and remain in place; do not drop
  call history during rollback.

## Open product decisions

1. Confirm whether both owners and moderators count as “admin” (this plan says
   yes) or owners only.
2. Approve minimum notice, start window, reminder timing, maximum duration, and
   whether an admin may reschedule after reminders have been sent.
3. Decide whether all members may speak immediately or whether large groups use
   host-controlled speaker permissions.
4. Decide whether native call UI should show the group name, scheduled-call
   title, or starting admin as the caller identity.
5. Decide whether web participation is required for the first public release.
