# Community Phase 1 — Four-Pass Review

**Date:** 2026-08-23  
**Phase:** Authenticated web parity  
**Branch:** `feat/web-community-parity-seo`

## Pass 1 — Functionality

### Verified scope

- Public Community landing and anonymous-safe public group summaries.
- Protected `/app/community/**` routes for discovery, owned groups, group creation, group detail, join gates, resources, membership settings, join requests, Community Calls, DM requests/conversations, and own Community profile.
- Existing NestJS Community and Community-DM services remain the only mutation authority.
- Mobile notification paths under `/discussions/**` now resolve into the matching protected web workspace route.

### Finding fixed

Legacy notification URLs previously fell through the global wildcard and lost the intended group or DM destination. A strict resolver now maps only known Community paths and rejects malformed/unknown paths.

## Pass 2 — Security and privacy

### Verified scope

- Anonymous endpoints use an explicit safe-field database projection.
- Missing, private, archived, and expired groups produce the same anonymous 404 behavior.
- No anonymous endpoint returns messages, members, owner identifiers, join forms, moderation data, direct messages, or storage URLs.
- Authenticated workspace pages are `noindex`.
- Attachment opens exchange an API-owned resource URL for a short-lived HTTPS storage URL only after a fresh backend authorization check.
- Group and DM writes continue through authenticated NestJS endpoints; Supabase is read/realtime only.

### Residual boundary

Public search rendering in Phase 1 exposes group identity and truthful aggregate counters only. Public posts, answers, comments, profiles, and indexability consent do not exist yet and remain Phase 3–4 work.

## Pass 3 — UI and accessibility

### Finding fixed

The transplanted Community shell rendered a second fixed mobile bottom bar inside the global app bottom bar. The duplicate was removed. Community retains keyboard-accessible top section tabs while the app keeps one global mobile navigation hierarchy.

### Improvements

- Community receives a dedicated workspace icon instead of reusing Profile.
- Community navigation/title labels are defined across all six web locales.
- Primary actions maintain at least 44px touch targets, visible focus rings, semantic navigation labels, and route-aware `aria-current` state.
- Loading, empty, error, pending, invited, removed, and banned states remain explicit rather than collapsing into blank feeds.

## Pass 4 — Reliability and performance

### Finding fixed

Web group chat subscribed only to message INSERT events. Moderator soft-deletes are UPDATE tombstones, so removed content could remain visible until reload. The subscription now handles INSERT and UPDATE through one mapper and merges by stable message ID.

### Verified scope

- Message pagination uses `(createdAt, id)` keyset cursors.
- Duplicate Realtime channels for one group are removed before subscribing.
- Subscriptions clean up on route changes/unmount.
- Blocked authors are filtered from REST pages and Realtime events.
- Backend errors preserve actionable human messages.
- Public list reads are bounded to 50 rows.

## Phase 1 exit gates

- [x] Test-first RED evidence for missing web implementation.
- [x] Test-first RED evidence for Realtime UPDATE tombstones.
- [x] Test-first RED evidence for deep-link and mobile-navigation review findings.
- [x] Backend tests, production E2E, build, and lint were green before the final review commit.
- [x] Web typecheck, build, lint, and all pre-review tests were green before the targeted RED tests.
- [ ] Final exact-head CI and deployment evidence — recorded after this review document triggers a non-bot verification run.
