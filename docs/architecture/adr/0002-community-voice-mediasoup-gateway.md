# ADR 0002: Run community voice on a dedicated mediasoup gateway

Date: 2026-08-06

## Status

Accepted for implementation. Production rollout remains gated by the
physical-device and target-host validation listed below.

## Context

Edutu group discussions need scheduled, admin-led, audio-only calls. The
existing NestJS API owns community authorization, Postgres state, and push
notifications. It is deployed on Render with Node 20.18.1. The current
mediasoup server package reviewed for this decision is `3.24.1` at upstream
commit `5baac84111b917f251daf28b013f7665ac3cb7b6`; it requires Node 22 and needs
public UDP/TCP media listeners.

mediasoup is an SFU and deliberately provides no signaling, scheduling,
membership, ringing, or missed-call persistence. Embedding it in the API would
couple a stateful media process and UDP lifecycle to the stateless HTTP API,
force an immediate Node runtime migration, and make normal API deploys drop
active calls.

## Decision

Run a dedicated Node 22 voice gateway beside the existing API.

- The NestJS API remains the source of truth for schedules, call state,
  membership snapshots, permissions, notifications, and audit history.
- The voice gateway owns only ephemeral mediasoup workers, routers,
  transports, producers, consumers, WebSocket signaling, and live presence.
- One live call maps to one mediasoup Router. Workers are created up to the
  host CPU-core count and rooms are assigned to the least-loaded healthy
  worker.
- The API prepares a room before marking a call live or ringing members.
- Clients obtain a short-lived, call-scoped join token from the API. The media
gateway validates that token and never accepts a Clerk identity supplied in
  a WebSocket message.
- The versioned wire format is defined in
  `docs/architecture/community-voice-signaling-v1.md`; gateway and client
  contract tests must change together.
- Postgres remains the durable store. Redis is introduced only when a second
  gateway node is required, for room assignment, short-lived presence, and
  distributed locks—not as the source of truth.
- The first release is audio-only Opus with no recording and no media data
  channels.

## Consequences

Positive:

- API deploys and media deploys are isolated.
- The existing Node 20 API does not block adoption of current mediasoup.
- Media capacity, UDP exposure, and worker health can scale independently.
- Durable call history survives gateway restarts.

Costs:

- A second deployable service, internal authentication, and distributed
  failure modes are introduced.
- Active calls cannot be transparently moved when a mediasoup worker dies in
  the first release; they end as failed and may be restarted by an admin.
- Native offline ringing requires iOS PushKit/CallKit and Android
  FCM/ConnectionService work in addition to mediasoup.

## Rejected alternatives

### Embed mediasoup in the NestJS API

Rejected because the current API runtime is incompatible with the reviewed
mediasoup version, Render's HTTP service is not the right boundary for public
RTC UDP listeners, and an API restart would terminate every call.

### Peer-to-peer mesh WebRTC

Rejected because every participant would upload one stream per peer. It is
simple for tiny calls but degrades quickly in group chats and gives Edutu no
stable server-side room control.

### Vendor the mediasoup repository into Edutu

Rejected. Edutu should consume pinned npm releases and keep the upstream source
clone as review material only. Vendoring the C++ worker would create an
unnecessary maintenance and security-update burden.

## Validation gates

- Build mediasoup on the chosen Node 22 Linux image.
- Connect Chrome, a physical iPhone, and a physical Android device to one
  audio room.
- Prove microphone mute/unmute, background/foreground recovery, Bluetooth and
  speaker routing, and reconnect after a brief network change.
- Prove a locked iPhone and terminated Android app can receive an incoming-call
  invitation using native call UI.
- Load-test before choosing the initial participant cap.
