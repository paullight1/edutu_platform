# Web Community Parity + SEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the currently shipped Edutu Mobile community experience to `edutu-web-app`, strengthen its UI/UX, and make public community/group titles and summaries genuinely SEO/share friendly without exposing private community data.

**Architecture:** Keep `/community` public and indexable, add the signed-in product under `/app/community/**`, and make the browser another client of the existing NestJS community/community-DM domain. Add only one backend capability: a deliberately small anonymous projection for active public groups. All authenticated writes continue through the backend; realtime message reads use the existing Clerk-authenticated Supabase client; community calls reuse the already-shipped web call stack.

**Tech Stack:** React 18 + TypeScript + Vite + React Router + Tailwind + Clerk + Supabase Realtime (`edutu-web-app`); NestJS + Drizzle (`backend/services/services/api`); Vitest + Testing Library (web); Jest (backend); Netlify edge functions for crawler-time dynamic metadata.

**Spec:** `docs/superpowers/specs/2026-08-21-web-community-parity-seo-design.md`

## Global Constraints

- Do not touch the separate opportunity UI/UX work except linking a group to an existing opportunity selector.
- Do not introduce new runtime dependencies.
- `/community` stays public/indexable; every `/app/community/**` page is authenticated and `noindex`.
- Public SEO may expose only active, unexpired groups with `visibility === "public"`; never private/unlisted/archived/expired groups, member identities, messages, join answers, owner IDs, signed asset URLs, or moderation data.
- Preserve backend membership semantics exactly: `active`, `invited`, `pending`, `removed`, `banned` are distinct states.
- Preserve current backend admin roles exactly: `owner | mod | member`; do not revive an old `admin` role from historical specs.
- Use existing web theme tokens for dark mode; warm community colors may be scoped accents but not hard-coded across dark surfaces.
- Interactive targets should be at least 44px on touch layouts; conversation/body text should stay at least 15–16px on mobile.
- No fabricated community counts/testimonials. Existing unsupported hard-coded social proof on `/community` must be removed or replaced with factual copy.
- Attachment URLs are untrusted until validated/resolved through Edutu's resource endpoint.
- No direct Supabase mutations. Realtime is read-only; mutations use NestJS APIs.
- `before` and `beforeId` travel together for keyset message/resource/DM pagination.
- The dedicated feature branch `feat/web-community-parity-seo` is the isolated workspace. This environment cannot clone GitHub, so final executable verification must come from PR GitHub Actions; do not claim local test results.

---

## File Structure

### Backend

- Modify `backend/services/services/api/src/communities/groups.service.ts` — add anonymous public list/get projections that share the same active/public filtering rules.
- Modify `backend/services/services/api/src/communities/communities.controller.ts` — add `@Public()` read-only routes under `/public/communities/groups`.
- Modify `backend/services/services/api/src/communities/groups.service.spec.ts` — prove private/unlisted/archived/expired rows are never exposed.
- Modify `backend/services/services/api/src/communities/communities.controller.spec.ts` — prove the new routes are public and return only the projection.

### Web community domain

- Create `edutu-web-app/src/features/community/types.ts` — browser-side types mirroring current backend/mobile JSON contracts.
- Create `edutu-web-app/src/features/community/api.ts` — authenticated community API with `CommunityApiError` preserving backend sentences.
- Create `edutu-web-app/src/features/community/dmApi.ts` — authenticated community DM API.
- Create `edutu-web-app/src/features/community/publicApi.ts` — anonymous public-group fetcher.
- Create `edutu-web-app/src/features/community/realtime.ts` — one on-screen group Supabase channel with safe cleanup.
- Create `edutu-web-app/src/features/community/format.ts` — relative times, membership labels, safe public text helpers.

### Web product UI

- Create `edutu-web-app/src/features/community/components/CommunityProductShell.tsx` — scoped header + Explore/Groups/Chats subnavigation.
- Create `edutu-web-app/src/features/community/components/GroupCard.tsx` — responsive group card/row.
- Create `edutu-web-app/src/features/community/components/GroupAvatar.tsx` — emoji/cover identity.
- Create `edutu-web-app/src/features/community/components/MessageBubble.tsx` — accessible author/message/tombstone rendering.
- Create `edutu-web-app/src/features/community/components/CommunityState.tsx` — loading/error/empty states.
- Create `edutu-web-app/src/features/community/CommunityExplorePage.tsx`.
- Create `edutu-web-app/src/features/community/CommunityGroupsPage.tsx`.
- Create `edutu-web-app/src/features/community/CommunityCreateGroupPage.tsx`.
- Create `edutu-web-app/src/features/community/CommunityGroupPage.tsx`.
- Create `edutu-web-app/src/features/community/CommunityChatsPage.tsx`.
- Create `edutu-web-app/src/features/community/CommunityDmPage.tsx`.
- Create `edutu-web-app/src/features/community/CommunityProfilePage.tsx`.
- Create `edutu-web-app/src/features/community/PublicCommunityGroupPage.tsx`.

### Web integration / SEO

- Modify `edutu-web-app/src/App.tsx` — lazy routes for public group + `/app/community/**`.
- Modify `edutu-web-app/src/components/AppWorkspaceShell.tsx` — first-class Community nav and active/title logic.
- Modify `edutu-web-app/src/components/CommunityPage.tsx` — truthful SEO-first landing page and signed-in/open-community CTA.
- Modify `edutu-web-app/src/i18n/locales/en.json` — Community navigation copy.
- Create `edutu-web-app/netlify/edge-functions/community-group-og.ts` — crawler-time group metadata.
- Modify `edutu-web-app/netlify.toml` — register `/community/groups/*` edge metadata.
- Create `edutu-web-app/src/test/__tests__/communityApi.test.ts`.
- Create `edutu-web-app/src/test/__tests__/communityRoutes.test.tsx`.
- Create `edutu-web-app/src/test/__tests__/communitySeo.test.tsx`.

---

### Task 1: Public Community Projection + SEO-Safe Backend Contract

**Files:**
- Modify: `backend/services/services/api/src/communities/groups.service.ts`
- Modify: `backend/services/services/api/src/communities/communities.controller.ts`
- Modify: `backend/services/services/api/src/communities/groups.service.spec.ts`
- Modify: `backend/services/services/api/src/communities/communities.controller.spec.ts`

**Interfaces:**
- Produces `PublicCommunityGroupSummary` with exactly `id, slug, name, description, coverEmoji, memberCount, messageCount, opportunityId, expiresAt, createdAt`.
- Produces `GroupsService.listPublic(limit)` and `GroupsService.getPublicBySlug(slug)`.
- Produces `GET /public/communities/groups?limit=N` and `GET /public/communities/groups/:slug`.

- [ ] **Step 1: Write failing service tests** proving a public active/unexpired group is returned while private, archived, and expired groups are omitted. Assert the returned object has no `ownerId`, membership, messages, or cover resource URL.
- [ ] **Step 2: Run the focused backend test**: `cd backend/services/services/api && npm test -- groups.service.spec.ts`. Expected before implementation: FAIL because `listPublic/getPublicBySlug` do not exist.
- [ ] **Step 3: Add `PublicCommunityGroupSummary` and service methods.** Reuse the Drizzle `communityGroups` table but use an explicit `.select({ ...safeFields })`; never fetch full rows then delete sensitive properties. Filter `visibility='public'`, `archived_at IS NULL`, and `(expires_at IS NULL OR expires_at > now())`. `getPublicBySlug` throws `NotFoundException` for every non-public/inactive case so callers cannot distinguish private existence.
- [ ] **Step 4: Add public controller routes** with `@Public()` from `../auth/public.decorator`; parse `limit` using the existing bounded parser and return only the service projection.
- [ ] **Step 5: Add controller tests** asserting the public decorator/route behavior and projection.
- [ ] **Step 6: Run** `npm test -- groups.service.spec.ts communities.controller.spec.ts` and `npm run lint` in the backend. Expected: PASS.
- [ ] **Step 7: Commit** `feat(community): add SEO-safe public group API`.

### Task 2: Browser Community API + Realtime Boundary

**Files:**
- Create: `edutu-web-app/src/features/community/types.ts`
- Create: `edutu-web-app/src/features/community/api.ts`
- Create: `edutu-web-app/src/features/community/dmApi.ts`
- Create: `edutu-web-app/src/features/community/publicApi.ts`
- Create: `edutu-web-app/src/features/community/realtime.ts`
- Create: `edutu-web-app/src/features/community/format.ts`
- Test: `edutu-web-app/src/test/__tests__/communityApi.test.ts`

**Interfaces:**
- `CommunityApiError extends Error { status: number }`.
- `CommunityApi` constructed with the existing Clerk `getToken` getter and methods matching current backend routes: groups/list/get/create/update/join/leave/invite/members/form/requests/messages/resources/send/delete/report/blocks/profile content.
- `CommunityDmApi` for requests/conversations/messages/read/hide.
- `fetchPublicGroups()` and `fetchPublicGroup(slug)` anonymous functions.
- `subscribeToGroupMessages(groupId, onInsert)` returns an unsubscribe callback and uses exactly one channel `edutu:web:community:${groupId}`.

- [ ] **Step 1: Write failing API tests** for human-readable 403 propagation, missing-session 401, correct `before+beforeId` query serialization, and public fetch without `Authorization`.
- [ ] **Step 2: Run** `cd edutu-web-app && npm test -- --run src/test/__tests__/communityApi.test.ts`. Expected: FAIL because files do not exist.
- [ ] **Step 3: Implement typed contracts** by mirroring current mobile/backend shapes, not the older July design vocabulary.
- [ ] **Step 4: Implement authenticated request transport** with `getApiBaseUrl('Community API')`, `getLocalDevAuthHeaders()`, a 12–15s abort budget, `Accept: application/json`, conditional `Content-Type`, Clerk bearer token, and `CommunityApiError` whose message comes from backend `message/error` fields.
- [ ] **Step 5: Implement public fetch transport** against `/public/communities/groups` without auth headers.
- [ ] **Step 6: Implement Supabase realtime subscription** using `supabase.channel(...).on('postgres_changes', { event:'INSERT', schema:'public', table:'community_group_messages', filter:'group_id=eq.<id>' }, ...)`. Remove the channel on cleanup; do not subscribe when Supabase is unconfigured.
- [ ] **Step 7: Run API tests, web typecheck and lint.** Expected: PASS.
- [ ] **Step 8: Commit** `feat(web): add community browser client`.

### Task 3: Community Workspace Routes, Navigation, and Product Shell

**Files:**
- Create: `edutu-web-app/src/features/community/components/CommunityProductShell.tsx`
- Modify: `edutu-web-app/src/App.tsx`
- Modify: `edutu-web-app/src/components/AppWorkspaceShell.tsx`
- Modify: `edutu-web-app/src/i18n/locales/en.json`
- Test: `edutu-web-app/src/test/__tests__/communityRoutes.test.tsx`

**Interfaces:**
- `/app/community` redirects to `/app/community/explore`.
- `/app/community/explore`, `/groups`, `/groups/new`, `/groups/:id`, `/groups/:id/settings`, `/groups/:id/requests`, `/chats`, `/dm/new`, `/dm/:id`, `/profile` all run inside `AppWorkspaceRoute`.
- `CommunityProductShell` exposes `Explore`, `Groups`, `Chats`, and a profile action while keeping mobile touch targets >=44px.

- [ ] **Step 1: Write failing route/navigation tests** for Community workspace nav active state and protected routes.
- [ ] **Step 2: Add lazy route modules to `App.tsx`** before the catch-all.
- [ ] **Step 3: Add Community to desktop primary nav and mobile primary nav** using `UsersRound`, and update `isRouteActive/getWorkspaceTitleKey` for `/app/community/**`.
- [ ] **Step 4: Implement product shell** with warm scoped accents, accessible tabs, sticky mobile subnav, and `Seo noindex` on authenticated pages.
- [ ] **Step 5: Run route tests + typecheck/lint.** Expected: PASS.
- [ ] **Step 6: Commit** `feat(web): add community workspace navigation`.

### Task 4: Explore, My Groups, and Group Creation

**Files:**
- Create: `GroupAvatar.tsx`, `GroupCard.tsx`, `CommunityState.tsx`
- Create: `CommunityExplorePage.tsx`, `CommunityGroupsPage.tsx`, `CommunityCreateGroupPage.tsx`
- Extend: `communityRoutes.test.tsx`

**Interfaces:**
- Explore loads `fetchGroups({limit:50})`, excludes archived rows defensively, supports query + `all/scholarships/careers/study` focus filters, and renders membership state on every card.
- Groups loads `mine:true` then partitions rows by `active`, `invited`, `pending`; banned/removed are not presented as rooms.
- Create calls `createGroup` with current backend limits: name 3–60, description <=280, public/private, open/request, emoji, optional opportunity ID.

- [ ] **Step 1: Add failing UI tests** for search/filter, active/invited/pending sections, and create-form validation.
- [ ] **Step 2: Build group primitives** with member/activity/expiry emphasis, no hover-only information, and responsive row/grid variants.
- [ ] **Step 3: Build Explore** with a prominent search field, compact focus chips, skeletons, retry, empty state, and manual refresh.
- [ ] **Step 4: Build My Groups** with separate Invitations and Awaiting approval sections and a restrained Create community CTA.
- [ ] **Step 5: Build full-page creation** with explanatory visibility/join controls and backend sentence errors. Use existing `fetchOpportunities()` only to populate an optional linked-opportunity picker; do not alter opportunity page UI.
- [ ] **Step 6: Run tests/typecheck/lint.** Expected: PASS.
- [ ] **Step 7: Commit** `feat(web): port community discovery and groups`.

### Task 5: Group Workspace — Membership Gate, Posts, Resources, About, Moderation

**Files:**
- Create: `MessageBubble.tsx`
- Create: `CommunityGroupPage.tsx`
- Extend: `communityRoutes.test.tsx`

**Interfaces:**
- Tabs: `posts | resources | about` encoded in query `?tab=` so refresh/back preserves state.
- `active` can read/post; `invited` receives current allowed preview + accept action; `pending` never fetches messages; `banned` has no retry CTA.
- History uses `fetchMessages(id,{before,beforeId,limit:40})` and live INSERT subscription.
- Composer sends text up to backend limit, shows first-post safety notice before first send, and surfaces backend screener refusals verbatim.
- Resources use the dedicated resources cursor endpoint.
- About uses the real roster endpoint and server-provided role for admin affordances.

- [ ] **Step 1: Write failing tests** for pending privacy gate, invited accept flow, banned terminal state, `before+beforeId`, and send-error sentence rendering.
- [ ] **Step 2: Implement group fetch/gate** before mounting message/realtime hooks so pending users cannot leak data through an eager request.
- [ ] **Step 3: Implement Posts** with readable 16px conversation copy, author/avatar, tombstones, reply context, history loader, realtime dedupe by message id, send composer, report/delete/block actions where allowed, and call-message cards linking to existing `/communities/calls/:callId`.
- [ ] **Step 4: Implement Resources** with safe metadata parsing and resource URL resolution immediately before open/download; render unavailable rather than arbitrary URLs.
- [ ] **Step 5: Implement About/admin controls** for roster, join form, invitation, request decisions, role changes, leaving, editing, and irreversible archive language. Do not create an `admin` role.
- [ ] **Step 6: Add settings/requests route wrappers** that focus the corresponding About/admin panels without duplicating business logic.
- [ ] **Step 7: Run focused tests/typecheck/lint.** Expected: PASS.
- [ ] **Step 8: Commit** `feat(web): port community group workspace`.

### Task 6: Chats/DMs and Community Profile

**Files:**
- Create: `CommunityChatsPage.tsx`
- Create: `CommunityDmPage.tsx`
- Create: `CommunityProfilePage.tsx`
- Extend: `communityRoutes.test.tsx`

**Interfaces:**
- Inbox uses `/community-dms/conversations`; DM page uses conversation + paged messages + send + mark-read.
- Inbox removal uses backend `DELETE /community-dms/conversations/:id`, not client-only hiding.
- Profile uses `/communities/profile/content` cursor and existing Edutu profile identity.

- [ ] **Step 1: Write failing tests** for unread DM emphasis, empty-state route to Explore, hide conversation, mark-read, and profile Posts/Resources switching.
- [ ] **Step 2: Build Chats** as a clean list with avatar, name, preview, time, unread badge, retry/empty states, and explicit remove action instead of web-only swipe dependence.
- [ ] **Step 3: Build DM thread** with keyset history, readable bubbles, send state, mark read after load, and privacy-safe identity only.
- [ ] **Step 4: Build own community profile** with avatar/name/supporting line, profile edit link, Posts/Resources tabs and cursor load-more.
- [ ] **Step 5: Run tests/typecheck/lint.** Expected: PASS.
- [ ] **Step 6: Commit** `feat(web): port community chats and profile`.

### Task 7: Public Community UX + Dynamic Group SEO

**Files:**
- Modify: `edutu-web-app/src/components/CommunityPage.tsx`
- Create: `edutu-web-app/src/features/community/PublicCommunityGroupPage.tsx`
- Create: `edutu-web-app/netlify/edge-functions/community-group-og.ts`
- Modify: `edutu-web-app/netlify.toml`
- Create: `edutu-web-app/src/test/__tests__/communitySeo.test.tsx`

**Interfaces:**
- `/community` title: `Scholarship & Career Community for African Learners | Edutu` (or a semantically equivalent concise title).
- `/community/groups/:slug` title: `${group.name} Community | Edutu` with canonical URL and public-safe JSON-LD.
- Edge function fetches only `/public/communities/groups/:slug`, escapes all inserted HTML attributes/text, caps metadata lengths, and falls back safely when backend is unavailable.

- [ ] **Step 1: Write failing SEO tests** for title, canonical, description, `noindex` on missing/inactive groups, and absence of fabricated `50K+/800+/3.2K` social proof.
- [ ] **Step 2: Refine `/community`** so its hero clearly explains the functional product, CTA enters `/app/community` for signed-in members or sign-up with return path for guests, and hard-coded unsupported stats/testimonials are removed.
- [ ] **Step 3: Build public group page** with factual summary, member/activity context, archived/closed state protection, join/open CTA, `BreadcrumbList` + `WebPage/CollectionPage` JSON-LD, and no private data.
- [ ] **Step 4: Build Netlify edge function** following the existing opportunity edge pattern; sanitize fetched data and inject canonical/OG/Twitter tags for crawlers.
- [ ] **Step 5: Register edge function** for `/community/groups/*` in `netlify.toml`.
- [ ] **Step 6: Run SEO tests/typecheck/lint/build.** Expected: PASS.
- [ ] **Step 7: Commit** `feat(web): add community group SEO and public UX`.

### Task 8: Cross-Surface Verification and PR Evidence

**Files:**
- No feature files unless a gate exposes a real regression.

- [ ] **Step 1: Run backend gates**: `cd backend/services/services/api && npm test -- groups.service.spec.ts communities.controller.spec.ts && npm run lint && npm run build`.
- [ ] **Step 2: Run web gates**: `cd edutu-web-app && npm test -- --run src/test/__tests__/communityApi.test.ts src/test/__tests__/communityRoutes.test.tsx src/test/__tests__/communitySeo.test.tsx && npm run typecheck && npm run lint && npm run build`.
- [ ] **Step 3: Verify public privacy contract manually** against the diff: no anonymous endpoint selects owner IDs/member identities/messages/cover resource URLs.
- [ ] **Step 4: Verify route/index contract**: `/community` and active public group pages index; `/app/community/**` noindex and protected.
- [ ] **Step 5: Verify mobile parity matrix** against current `edutumobile/app/(app)/discussions/**`: Explore, Groups, creation, membership gates, Posts, Resources, About/admin, Chats, own profile, call linking. Record any genuine external-only gap rather than silently dropping it.
- [ ] **Step 6: Open a PR to `main`** and use GitHub Actions as executable verification because the current environment cannot clone/run the repository locally.
- [ ] **Step 7: Inspect every failed CI job**; fix only regressions attributable to this branch and rerun affected gates.
- [ ] **Step 8: Commit final verification-only fixes**, then report exact passing/blocked evidence.
