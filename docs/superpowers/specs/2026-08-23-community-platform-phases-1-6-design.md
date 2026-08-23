# Edutu Community Platform — Phases 1–6 Design

**Date:** 2026-08-23  
**Status:** Approved for implementation  
**Repository:** `paullight1/edutu_platform`

## Goal

Ship one safe, synchronized Community product across web and mobile, then add a separate public knowledge layer whose questions, discussions, answers, resources, and profiles can be indexed without exposing private group chat or direct messages.

## Non-negotiable boundaries

- NestJS owns every mutation; Supabase remains an authenticated read/realtime transport.
- Web and mobile share the same PostgreSQL rows, canonical IDs, server timestamps, membership states, moderation decisions, and attachment resource URLs.
- Private DMs are never public, crawlable, or indexable.
- Group chat is never automatically published to the public web.
- Public knowledge content requires an explicit publication state and consent record.
- Anonymous endpoints use explicit safe-field projections and return the same 404 for missing versus non-public content.
- `active | invited | pending | removed | banned` remain distinct membership states.
- `owner | mod | member` remain the only group roles.
- Every phase uses test-first commits and four review passes: functionality, security/privacy, UI/accessibility, and reliability/performance.

## Target architecture

```text
Expo Mobile ───────────────┐
Authenticated Web ─────────┼── typed Community clients ── NestJS API ── PostgreSQL/Supabase
Public Community Web ──────┤                                      │
Admin Moderation Console ──┘                                      ├── private object storage
                                                                  ├── Supabase Realtime
                                                                  └── notification/outbox workers
```

## Phase 1 — Authenticated web parity

Bring groups, membership gates, chat, resources, settings, join requests, DMs, member profiles, reporting, blocking, attachment handling, and Community Calls to `/app/community/**`. Keep `/community/**` public and anonymous-safe.

## Phase 2 — Cross-platform synchronization

Publish DM messages and relevant Community changes to realtime, replace ten-second DM polling with focused subscriptions plus periodic reconciliation, deduplicate by stable ID/version, handle UPDATE tombstones, and keep unread state consistent after reconnect or token refresh.

## Phase 3 — Public post, Q&A, and resource domain

Add dedicated posts, answers, comments, tags, votes, saves, revisions, accepted answers, resource metadata, visibility/publication states, consent provenance, quality state, and public/authenticated API projections. Chat messages are not reused as posts.

## Phase 4 — Search and public rendering

Add public routes for questions, discussions, resources, topics, and profiles. Render complete anonymous-safe HTML for crawlers, emit canonical metadata and semantically correct JSON-LD, generate dynamic Community sitemaps, and noindex thin, duplicate, pending, unsafe, or private content.

## Phase 5 — Trust, moderation, and reputation

Add a central moderation case system, report triage, assignment, actions, appeals, audit history, domain safety, anti-spam controls, and reputation events. Admin actions are explicit, attributable, reversible where appropriate, and propagated to both clients.

## Phase 6 — Scale and release governance

Add Community-specific security contract tests, migration drift checks, load probes, index/query guards, SLOs, dashboards, runbooks, data export/deletion coverage, attachment safety controls, staged rollout gates, and rollback procedures.

## Completion evidence

A phase is complete only when its focused tests, typecheck, lint, build, migration/security checks, and requirements checklist pass on the exact GitHub head. Production readiness additionally requires deployed-environment evidence; repository tests alone are not represented as live proof.
