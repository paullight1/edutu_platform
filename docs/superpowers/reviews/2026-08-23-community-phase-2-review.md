# Community Phase 2 — Four-Pass Review

**Date:** 2026-08-23
**Phase:** Cross-platform realtime synchronization
**Branch:** `feat/web-community-parity-seo`

## Pass 1 — Functionality

- Web and mobile now subscribe to `community_dm_messages` for the single conversation currently on screen.
- Incoming inserts are mapped from the database's snake_case shape and merged by stable message ID, so API sends and Realtime delivery cannot create duplicate bubbles.
- The existing NestJS DM API remains authoritative for writes, participant checks, read receipts, pagination, profile enrichment, blocking, and conversation state.
- Both clients retain a 60-second authorized API reconciliation read to repair missed events after reconnect, sleep, or token refresh.
- The previous mobile ten-second polling loop is removed.

## Pass 2 — Security and privacy

- The canonical migration only adds `community_dm_messages` to `supabase_realtime`; it grants no client write permission and creates no insert/update/delete policy.
- Existing participant-scoped SELECT RLS remains the delivery boundary.
- Web Supabase now receives Clerk through the client-level `accessToken` callback, which covers the WebSocket transport rather than HTTP fetch alone.
- The web auth provider requests the Clerk `supabase` JWT template first and retains the existing generic-token fallback for environments where the template is not configured.
- Invalid or malformed conversation identifiers never create Realtime channels.

## Pass 3 — UI and accessibility

- Messages arrive without replacing the page, clearing the composer, or showing a full-screen loading state.
- Reconciliation merges into the current list instead of replacing a message that arrived while the API request was in flight.
- Error text remains inline and actionable; the send button preserves its accessible label and disabled/busy behavior.
- Route changes clear conversation-specific state before the next conversation is rendered, preventing one person's content from appearing beneath another person's header.
- The focused mobile lifecycle block was normalized after implementation so the source remains readable and reviewable without changing behavior.

## Pass 4 — Reliability and performance

- Exactly one channel is opened for the focused conversation.
- Duplicate channels with the same topic are removed before subscribing.
- Unsubscribe functions are idempotent and run on blur/unmount.
- Mobile retains active-route guards, request-version invalidation, pagination locks, send locks, and read-receipt dedupe.
- Web uses a stable conversation ref, so profile hydration no longer tears down and recreates the Realtime channel.
- Reconciliation uses a bounded 60-second interval rather than high-frequency polling.
- The publication migration is idempotent and fails clearly if the prerequisite table is absent.

## Phase 2 exit gates

- [x] RED tests proved the adapters, publication migration, WebSocket auth, and polling replacement were absent.
- [x] Focused web/mobile adapter tests cover mapping, invalid IDs, duplicate-channel cleanup, and idempotent unsubscribe.
- [x] Static synchronization contracts cover one-minute reconciliation and Supabase-template authentication.
- [x] Migration contract tests protect the backend-only write boundary.
- [ ] Final exact-head CI and Architecture Governance — this documentation-only commit is the verification trigger after all review fixes and cleanup commits.
