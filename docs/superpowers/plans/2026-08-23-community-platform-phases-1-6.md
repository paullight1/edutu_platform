# Edutu Community Platform Phases 1–6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development. Every task follows RED → GREEN → REFACTOR and four review passes before the next phase.

**Goal:** Deliver a unified web/mobile Community, public Q&A/resource publishing, SEO rendering, moderation operations, and production governance.

**Architecture:** Preserve the existing NestJS Community and Community-DM domains as the source of truth. Add focused modules for realtime synchronization, public posts, rendering, moderation, and operations; both clients consume typed HTTP contracts and authenticated Supabase realtime events.

**Tech Stack:** NestJS, Drizzle/PostgreSQL/Supabase, React/Vite, Expo Router/React Native, Clerk, Vitest/Jest, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-23-community-platform-phases-1-6-design.md`

## Global constraints

- No direct client database writes.
- No private chat indexing.
- No new role or membership vocabulary.
- New migrations go only under `backend/services/services/api/supabase/migrations/`.
- Every cursor uses `(createdAt, id)` ordering.
- Every mutation validates authorization in the service, not only in the controller.
- Every phase receives four review passes: functional, security/privacy, UI/accessibility, reliability/performance.

---

## Phase 1 — Web parity

### Task 1.1: Rebase the existing Community web work onto current main

**Files:** reuse `edutu-web-app/src/features/community/**`; add the public Community controller/service; integrate `App.tsx`, `workspaceNavigation.ts`, and Netlify metadata without replacing newer marketplace/auth/payment routes.

**Tests:** `public-community.*.spec.ts`, `communityApi.test.ts`, `communityMembershipActions.test.ts`, `communityMessageActions.test.tsx`, `communityRemainingParity.test.ts`, `communitySeo.test.tsx`.

- [ ] Commit the tests alone and verify CI fails because the Community modules are absent.
- [ ] Add the implementation and verify focused backend/web suites, typecheck, lint, and build.
- [ ] Functional review: every mobile capability has a web route or an explicit external-only blocker.
- [ ] Security review: anonymous projection contains no owner/member/message/private asset data.
- [ ] UX review: touch targets, loading/error/empty states, keyboard flow, responsive desktop/mobile-web layouts.
- [ ] Reliability review: cursor pairing, aborts, dedupe, cleanup, and human backend error sentences.

## Phase 2 — Realtime synchronization

### Task 2.1: DM and membership realtime contract

**Files:** create canonical migration `20260823xxxxxx_community_realtime_contract.sql`; extend web `realtime.ts`; create mobile `communityDmsRealtime.ts`; update web/mobile DM screens and tests.

**Interfaces:**
```ts
subscribeToDmMessages(conversationId: string, onChange: (event: RealtimeDmEvent) => void): () => void
subscribeToGroupChanges(groupId: string, onInvalidate: () => void): () => void
mergeByStableId<T extends { id: string }>(current: T[], incoming: T[]): T[]
```

- [ ] Test INSERT/UPDATE dedupe, cleanup, token refresh, reconnect reconciliation, and no subscription for invalid IDs.
- [ ] Add DM tables to realtime publication idempotently and preserve RLS participant checks.
- [ ] Replace 10-second polling with realtime plus a 60-second reconciliation safety read.
- [ ] Run four review passes and all web/mobile/backend gates.

## Phase 3 — Public posts, Q&A, and resources

### Task 3.1: Database and backend domain

**Files:** canonical migration for `community_posts`, `community_post_answers`, `community_post_comments`, `community_post_tags`, `community_post_votes`, `community_post_saves`, `community_post_revisions`; create `src/community-posts/**`; register module.

**Core contracts:**
```ts
type CommunityPostType = "question" | "discussion" | "resource" | "experience";
type CommunityPostVisibility = "group_members" | "authenticated_public" | "public_web_unlisted" | "public_web_indexable";
type CommunityPublicationStatus = "draft" | "pending_review" | "published" | "rejected" | "removed";
```

- [ ] Test authorization, transitions, accepted answers, vote idempotency, revisions, safe public projection, and cursor ordering before implementation.
- [ ] Add authenticated and anonymous-safe controllers.
- [ ] Add server-side resource URL validation with HTTPS-only, private-address rejection, redirect limits, and canonical domain metadata.

### Task 3.2: Web and mobile product surfaces

**Files:** add web feed/create/detail routes under `/app/community/posts/**`; add Expo routes under `/discussions/posts/**`; add typed clients and tests.

- [ ] Implement question, discussion, resource, and experience composers.
- [ ] Implement answers, comments, accepted answer, votes, saves, tags, report actions, revision history, and explicit publication consent.
- [ ] Verify identical IDs/state across both clients and run four review passes.

## Phase 4 — Public SEO rendering

### Task 4.1: Public routes and crawler HTML

**Files:** public Community web routes, backend OG/render controller, Vercel rewrites, dynamic sitemap endpoint, SEO tests.

- [ ] Test `QAPage` only for one-question/multiple-answer pages; `DiscussionForumPosting` for discussions; `ProfilePage` for opted-in profiles.
- [ ] Render visible body/answers in crawler HTML, not metadata only.
- [ ] Add canonical, pagination, breadcrumbs, Open Graph, lastmod, 404/410, and noindex rules.
- [ ] Verify anonymous requests can never retrieve private or members-only content.

## Phase 5 — Moderation and reputation

### Task 5.1: Moderation case backend

**Files:** migration for `community_moderation_cases`, events, appeals, reputation ledger, domain decisions; backend admin/public modules and tests.

- [ ] Convert reports into cases with priority, assignee, status, evidence, decision, and audit history.
- [ ] Implement warn/remove/restrict/suspend/ban/restore and appeal decisions with idempotency.
- [ ] Add per-route account/IP rate limits, duplicate/scam/link safety signals, and repeat-offender scoring.

### Task 5.2: Admin console

**Files:** `admin/src/pages/CommunityModeration.tsx`, API client, route/navigation, tests.

- [ ] Build queue, filters, case detail, evidence, action confirmation, appeals, domain controls, and audit timeline.
- [ ] Propagate actions to web/mobile immediately and run four review passes.

## Phase 6 — Scale and governance

### Task 6.1: Operational gates

**Files:** Community security SQL tests, CI workflow additions, load probe, migration drift checker, SLO/runbook docs, index migration.

- [ ] Add role-matrix tests for anonymous, stranger, invited, pending, active, moderator, owner, removed, banned, blocked, and DM non-participant cases.
- [ ] Add query indexes and EXPLAIN-plan assertions for feeds, messages, moderation queue, and sitemap reads.
- [ ] Add load probes for reads, posts, group messages, DMs, votes, and moderation bursts.
- [ ] Add availability/latency/error SLOs, alerts, backup/restore, export/deletion, incident response, staged rollout, rollback, and release evidence template.
- [ ] Run all repository gates and inspect exact-head CI/deployment evidence before merge.
