# Community Voice Signaling Protocol v1

This document is the canonical wire contract shared by the NestJS control
plane, the Node 22 mediasoup gateway, and Edutu clients. A protocol change must
update this document and contract tests in the gateway, mobile app, and web app
in the same pull request.

## Session assignment

`POST /communities/calls/:callId/join-token` returns the media assignment made
for that call:

```json
{
  "token": "<short-lived JWT>",
  "expiresAt": "2026-08-06T18:31:00.000Z",
  "signalingUrl": "wss://voice-1.example.com",
  "nodeId": "voice-1",
  "roomId": "<call UUID>"
}
```

Clients must use `signalingUrl` from this response. They must not derive a WSS
address from the internal gateway URL. Production clients accept only `wss:`;
`ws:` is permitted only for a loopback development address.

## Join JWT

- Algorithm: `HS256`
- Secret: `COMMUNITY_CALL_TOKEN_SECRET` (minimum 32 characters)
- Issuer: `edutu-api`
- Audience: `edutu-voice`
- Lifetime: 60 seconds by default
- Required claims: `sub`, `callId`, `groupId`, `role`, `jti`, `iat`, `exp`

The token authenticates one signaling session. It must never be placed in the
WebSocket URL, analytics, errors, or normal application logs. The first client
request after opening the socket is `authenticate`.

## Frames

Every frame is UTF-8 JSON and includes `version: 1`. Request IDs are unique per
connection and are echoed verbatim by the gateway.

Client request:

```json
{
  "version": 1,
  "requestId": "mobile-1722969000000-1",
  "action": "createTransport",
  "data": { "direction": "send" }
}
```

Successful response:

```json
{
  "version": 1,
  "requestId": "mobile-1722969000000-1",
  "ok": true,
  "data": {}
}
```

Error response:

```json
{
  "version": 1,
  "requestId": "mobile-1722969000000-1",
  "ok": false,
  "error": { "code": "TRANSPORT_NOT_FOUND", "message": "Transport not found" }
}
```

Server event:

```json
{
  "version": 1,
  "event": "activeSpeakers",
  "data": { "speakers": [{ "peerId": "peer-id", "volume": -38 }] }
}
```

Frames do not have a `type` or `method` property. Unknown properties are
rejected on client requests so accidental protocol drift fails early.

## Client actions

| Action | Data | Success data |
|---|---|---|
| `authenticate` | `{ token }` | `{ peerId, existingProducers }` |
| `getRouterRtpCapabilities` | `{}` | mediasoup RTP capabilities |
| `createTransport` | `{ direction: "send" | "recv" }` | mediasoup transport options |
| `connectTransport` | `{ transportId, dtlsParameters }` | `{}` |
| `produceAudio` | `{ transportId, rtpParameters }` | `{ id }` |
| `pauseProducer` | `{ producerId }` | `{}` |
| `resumeProducer` | `{ producerId }` | `{}` |
| `closeProducer` | `{ producerId }` | `{}` |
| `consume` | `{ transportId, producerId, rtpCapabilities }` | `{ id, producerId, peerId, kind, rtpParameters, type, producerPaused }` |
| `resumeConsumer` | `{ consumerId }` | `{}` |
| `leave` | `{}` | `{}` |

Only Opus audio producers are accepted. Each peer has at most one send and one
receive transport and at most one audio producer.

## Server events

- `peerJoined`: `{ peerId, userId, role }`
- `peerLeft`: `{ peerId, userId, reason }`
- `newProducer`: `{ producerId, peerId }`
- `producerClosed`: `{ producerId, peerId }`
- `participantMuted`: `{ peerId, muted }`
- `activeSpeakers`: `{ speakers: [{ peerId, volume }] }`
- `callEnded`: `{ callId, reason }`
- `membershipRevoked`: `{ callId, peerId }`
- `reconnectRequired`: `{ callId, reason }`

## Internal control authentication

API-to-gateway calls use short-lived `HS256` JWTs signed with the same secret,
issuer `edutu-api`, audience `edutu-voice-internal`, and unique `jti` values.
The gateway consumes each `jti` once. Internal endpoints are not exposed on the
public API hostname even though they are authenticated.

## Gateway failure callback

If a worker or room fails after preparation, the gateway reports the durable
failure to `POST /internal/community-calls/:callId/media-failed` with body
`{ "failureCode": "<stable-code>" }`. The bearer token uses `HS256`, the shared
secret, issuer `edutu-voice`, audience `edutu-api-internal`, subject
`edutu-voice`, the matching `callId`, action `media-failed`, and short-lived
`jti`, `iat`, and `exp` claims. The API verifies all of these claims before a
compare-and-set transition from `starting` or `live` to `failed`.

Callbacks are bounded, timed out, retried only for transient failures, and
deduplicated by call. Neither service logs callback tokens. The callback may be
unset for local development, but configured callback delivery is a production
release gate.

## Gateway attendance callback

Minting a join token reserves capacity but does not prove attendance. After the
gateway verifies that token and admits the peer to the assigned room, it calls
`POST /internal/community-calls/:callId/participants/:userId/joined` with body
`{ "joinTokenJti": "<the verified join-token jti>" }` before acknowledging the
client's `authenticate` request.

The callback token uses the same reverse direction (`iss=edutu-voice`,
`aud=edutu-api-internal`, `sub=edutu-voice`) with action
`participant-joined`, plus matching `callId`, `userId`, and `joinTokenJti`
claims. The API consumes the reservation atomically and idempotently. If the
callback cannot be confirmed after bounded retries, the gateway removes the
peer and fails authentication; this prevents a media participant from being
persisted as a missed invitee.
