# Edutu Voice Gateway

Standalone Node 22 media plane for scheduled community voice calls. The NestJS API remains the durable control plane and is the only service allowed to prepare or end rooms. This gateway stores no membership, schedule, call history, SDP, tokens, or audio.

## Run locally

```bash
cp .env.example .env
npm ci
npm run dev
```

Use a random `COMMUNITY_CALL_TOKEN_SECRET` of at least 32 bytes and configure the same value in the API. In production, `VOICE_ANNOUNCED_ADDRESS` must be the public media host address and `VOICE_SIGNALING_URL` must use `wss://`.

```bash
npm run typecheck
npm test
npm run build
npm run test:smoke
```

The smoke test starts a real mediasoup subprocess and binds the configured test RTC port. Unit tests use an injectable media adapter.

## Network contract

- HTTP/WSS: `PORT` (default `4000/tcp`)
- Media: one UDP and TCP port per worker, starting at `VOICE_RTC_PORT_BASE`
- Open `VOICE_RTC_PORT_BASE` through `VOICE_RTC_PORT_BASE + VOICE_MAX_WORKERS - 1` for both UDP and TCP.
- Terminate TLS at a trusted reverse proxy and route `/ws` with WebSocket upgrade support.
- Restrict `/internal/*` to the API network. JWT authentication is still mandatory.

`VOICE_MAX_WORKERS` must not exceed available CPU cores. One Router is created per call and assigned to the least-loaded healthy worker. A worker death ends its rooms, emits `reconnectRequired` and `callEnded`, then attempts worker replacement.

## Authentication

All JWTs use HS256 with `COMMUNITY_CALL_TOKEN_SECRET` and issuer `edutu-api`.

- Control: audience `edutu-voice-internal`; requires `sub`, `jti`, `iat`, `exp`. A `jti` is single-use within the replay window, so retries must mint a fresh service token.
- Join: audience `edutu-voice`; requires `sub`, `callId`, `groupId`, `role`, `jti`, `iat`, `exp`. The API should keep join tokens to 60 seconds.

Gateway-to-API callbacks reverse the trust direction. Every attempt receives a fresh 30-second HS256 token with issuer `edutu-voice`, audience `edutu-api-internal`, subject `edutu-voice`, and unique `jti`, `iat`, and `exp` claims.

- Participant joined: `POST /internal/community-calls/:callId/participants/:userId/joined`, token claims `action=participant-joined`, `callId`, `userId`, and `joinTokenJti`; body `{ "joinTokenJti": "..." }`.
- Worker failure: `POST /internal/community-calls/:callId/media-failed`, token claims `action=media-failed` and `callId`; body `{ "failureCode": "MEDIA_WORKER_DIED" }`.

The API must verify that signed identifiers match route/body identifiers and handle duplicate delivery idempotently.

Tokens, RTP parameters, ICE credentials, DTLS fingerprints, SDP, and client addresses are never written to application logs.

## HTTP API

- `GET /health` — process liveness
- `GET /ready` — readiness after at least one worker and WebRtcServer bind successfully
- `GET /metrics` — Prometheus text metrics
- `PUT /internal/calls/:callId/room` — idempotently prepare a room; returns `{ nodeId, roomId, signalingUrl }`
- `DELETE /internal/calls/:callId/room` — idempotently end and clean up a room

PUT and DELETE accept no body or an empty JSON object. Request bodies, headers, and socket payloads have explicit limits and timeouts.

## Signaling protocol v1

Connect to `/ws`. Every request is JSON with `{ version: 1, requestId, action, data }`. Responses are `{ version, requestId, ok, data? }` or `{ version, requestId, ok: false, error }`. Duplicate request IDs on one socket receive the cached response.

Authenticate first, then use:

- `getRouterRtpCapabilities`
- `createTransport` with `send` or `recv`
- `connectTransport`
- `produceAudio` (Opus only, initially paused)
- `pauseProducer`, `resumeProducer`, `closeProducer`
- `consume`, `resumeConsumer`
- `leave`

Server events are `peerJoined`, `peerLeft`, `newProducer`, `producerClosed`, `participantMuted`, `activeSpeakers`, `callEnded`, `membershipRevoked`, and `reconnectRequired`. `RoomRegistry.revokeMembership()` is the stable hook for the future API-to-gateway revocation publication path.

## Operations

Use `/ready` for traffic readiness and `/metrics` for saturation/health. Metrics include workers, rooms, peers, WebSocket connections, transports, producers, consumers, aggregate bitrate/packet-loss values, reconnect requests, request errors, and worker deaths.

### API callbacks

Set `VOICE_API_CALLBACK_URL` to the NestJS API origin only, for example `https://api.edutu.ai`; do not include a path, credentials, query, or fragment. The gateway appends the participant-joined or media-failed route. Use the same `COMMUNITY_CALL_TOKEN_SECRET` in both services and restrict these endpoints to the private service network where possible. Participant confirmation is mandatory: when the URL is absent or delivery is exhausted, WebSocket authentication fails with stable code `MEDIA_UNAVAILABLE` and the provisional media peer is removed.

- `VOICE_API_CALLBACK_TIMEOUT_MS` — per-attempt HTTP deadline, `250`–`5000` ms; default `3000`.
- `VOICE_API_CALLBACK_MAX_ATTEMPTS` — total attempts, `1`–`5`; default `3`.
- `VOICE_API_CALLBACK_MAX_CONCURRENCY` — simultaneous deliveries, `1`–`32`; default `4`.
- `VOICE_API_CALLBACK_QUEUE_CAPACITY` — unique calls pending or in flight, `1`–`10000`; default `100` and must be at least `VOICE_MAX_ROOMS`.

HTTP `408`, `425`, `429`, and `5xx` responses are retried with capped exponential backoff and a fresh JWT/JTI per attempt. Successful `2xx` responses complete delivery; worker-failure `404` is also accepted as an idempotent terminal outcome. Other `4xx` responses are not retried. Shutdown rejects new callbacks, drops queued work, aborts in-flight requests, and exposes the outcome through callback metrics.

Participant-joined confirmation is awaited after the peer enters the prepared Router but before signaling authentication succeeds. A callback failure or WebSocket close removes that provisional peer; a shutdown aborts pending confirmations before waiting for signaling handlers to drain. Unlike worker-failure delivery, `404` is a terminal participant-confirmation failure rather than success.

Alert on `voice_api_callbacks_exhausted_total`, `voice_api_callbacks_dropped_total`, `voice_api_callbacks_disabled_total`, and sustained non-zero `voice_api_callbacks_queued`. A disabled callback means worker loss can leave the durable API call state stale, so production must configure the callback URL.

Also alert on `voice_participant_join_confirmations_failed_total` and `voice_signaling_auth_confirmation_failures_total`; sustained increases prevent users from joining calls and normally indicate API reachability, credentials, or contract drift.

On worker death, all affected rooms are closed and reported independently. Replacement uses one tracked timer per worker slot with exponential backoff capped at 30 seconds; shutdown cancels pending replacement timers and closes workers created during a stop race.

Drain the node before deployment: stop new room assignment, wait for active rooms to reach zero, then terminate. The first release does not migrate active Routers between workers or nodes.
