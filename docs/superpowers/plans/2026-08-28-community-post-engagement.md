# Community Post Engagement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a backend-enforced member-only community feed with a pinned visitor preview, fixed composers, animated room header, persistent likes, sharing, and Facebook-style post comments.

**Architecture:** Store comments in the existing community message table through a one-level parent reference, and store likes in a separate idempotent join table. Keep group preview authorization separate from full-content authorization, enrich post reads in the message service, and expose a dedicated post-detail route in the React app.

**Tech Stack:** NestJS 11, Drizzle ORM, PostgreSQL/Supabase migrations, Jest, React 18, React Router, TypeScript, Tailwind CSS, Vitest/Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-28-community-post-engagement-design.md`

## Global Constraints

- Non-members, invitees, and pending applicants may receive only group metadata and the single pinned preview post.
- Full feed/resources/post threads/attachments require active membership; owner fallback is denied after removal or ban.
- Comments are one level only and do not increase `community_groups.message_count`.
- Only one undeleted top-level post may be pinned per group.
- No new runtime dependency.
- Preserve all unrelated uncommitted work in the shared workspace.

---

### Task 1: Persistence and authorization boundary

**Files:**
- Create: `backend/services/services/api/supabase/migrations/20260828120000_community_post_engagement.sql`
- Create: `backend/services/services/api/src/communities/community-post-engagement.migration.spec.ts`
- Modify: `backend/services/services/api/src/db/schema.ts`
- Modify: `backend/services/services/api/src/communities/community-authz.ts`
- Modify: `backend/services/services/api/src/communities/community-authz.spec.ts`

**Interfaces:**
- Produces: `canReadGroupContent(group, userId, membership): boolean`.
- Produces: message fields `parentMessageId`, `pinnedAt`, `pinnedBy` and table `communityMessageLikes`.

- [ ] **Step 1: Write failing authorization and migration contract tests.** Assert literals showing a public non-member and private invitee cannot read full content, an active member can, and an undeprived owner fallback can. Apply the migration to an isolated PGlite database, then query the PostgreSQL catalog to prove the parent FK, composite like key, comment index, and partial unique pin index behave as defined.
- [ ] **Step 2: Run red tests.** Run `npm test -- community-authz.spec.ts community-post-engagement.migration.spec.ts --runInBand` from `backend/services/services/api`; expect missing predicate/migration failures.
- [ ] **Step 3: Add the migration, Drizzle schema fields/table/indexes, and minimal authorization predicate.** Use `parent_message_id`, `pinned_at`, `pinned_by`, and `(message_id, user_id)` exactly as defined by the spec.
- [ ] **Step 4: Run green tests.** Repeat the targeted Jest command; expect both suites to pass.

### Task 2: Member feed, pinned preview, comments, likes, and pin service

**Files:**
- Modify: `backend/services/services/api/src/communities/dto/community.dto.ts`
- Modify: `backend/services/services/api/src/communities/dto/community.dto.spec.ts`
- Modify: `backend/services/services/api/src/communities/messages.service.ts`
- Modify: `backend/services/services/api/src/communities/messages.service.spec.ts`
- Modify: `backend/services/services/api/src/communities/communities.controller.ts`
- Modify: `backend/services/services/api/src/communities/communities.controller.spec.ts`

**Interfaces:**
- Produces: `CommunityMessageView` with `commentCount`, `likeCount`, `viewerHasLiked`, `parentMessageId`, `pinnedAt`, and `pinnedBy`.
- Produces: `MessagesService.getPinnedPreview`, `getPostThread`, `sendComment`, `setLike`, and `setPinned`.
- Produces controller routes from the approved API contract.

- [ ] **Step 1: Write failing service tests.** Prove non-members cannot list top-level posts, preview readers receive only the pin, comments are same-group/top-level-only, comment inserts use a zero post-count bump, likes are idempotent, and moderators atomically replace the current pin.
- [ ] **Step 2: Run the service suite red.** Run `npm test -- messages.service.spec.ts --runInBand`; expect failures caused by missing service methods and the old public-feed branch.
- [ ] **Step 3: Extend DTO validation and the store boundary.** Add a text-only comment schema and pin schema; add store methods for top-level reads, comment reads, engagement summaries, idempotent like writes, and transactional pin replacement.
- [ ] **Step 4: Implement the minimal service behavior.** Apply `canReadGroupContent` to feed/resources/attachments/threads; keep `canReadGroup` for pinned preview; enrich all returned post/comment views; clear pin metadata on soft delete.
- [ ] **Step 5: Run the service suite green.** Repeat the targeted Jest command; expect zero failures.
- [ ] **Step 6: Write failing controller-contract tests.** Exercise the exact paths and methods for pinned preview, post thread, comment, like/unlike, and pin.
- [ ] **Step 7: Register controller routes and rerun controller/DTO tests.** Run `npm test -- communities.controller.spec.ts dto/community.dto.spec.ts --runInBand`; expect zero failures.

### Task 3: Typed web API and post interaction components

**Files:**
- Modify: `edutu-web-app/src/features/community/types.ts`
- Modify: `edutu-web-app/src/features/community/api.ts`
- Create: `edutu-web-app/src/features/community/components/CommunityComposer.tsx`
- Create: `edutu-web-app/src/features/community/components/PostActions.tsx`
- Modify: `edutu-web-app/src/features/community/components/MessageBubble.tsx`
- Create: `edutu-web-app/src/test/__tests__/communityPostInteractions.test.tsx`

**Interfaces:**
- Produces: `CommunityApi.fetchPinnedPost`, `fetchPostThread`, `sendComment`, `likeMessage`, `unlikeMessage`, and `pinMessage`.
- Produces: `CommunityComposer` with `mode: "post" | "comment"`, controlled draft, safety acknowledgement, busy/error state, and submit callback.
- Produces: `PostActions` with post URL, counts, like state, and callbacks.

- [ ] **Step 1: Write failing component/API behavior tests.** Assert accessible Like/Comment/Share actions, correct post links, native-share preference, clipboard fallback, optimistic visual state callback, and fixed safe-area composer classes.
- [ ] **Step 2: Run red web tests.** Run `npm test -- src/test/__tests__/communityPostInteractions.test.tsx` from `edutu-web-app`; expect module/behavior failures.
- [ ] **Step 3: Add exact frontend types and API methods.** Encode path segments and map each method to the approved HTTP method without adding a library.
- [ ] **Step 4: Build the shared composer/action components and integrate them into `MessageBubble`.** Keep the overflow moderation actions intact and expose pin only when `canModerate` is true.
- [ ] **Step 5: Run green web tests.** Repeat the targeted Vitest command; expect zero failures.

### Task 4: Member-gated group feed and animated header

**Files:**
- Modify: `edutu-web-app/src/features/community/CommunityGroupPage.tsx`
- Modify: `edutu-web-app/src/features/community/useGroupMessages.ts`
- Modify: `edutu-web-app/src/features/community/components/CommunityProductShell.tsx`
- Modify: `edutu-web-app/src/test/__tests__/communityFeatureGroupPage.test.tsx`
- Modify: `edutu-web-app/src/test/__tests__/communityProductShell.test.tsx`

**Interfaces:**
- Consumes: pinned-post API, enriched messages, `CommunityComposer`, and `PostActions`.
- Produces: visitor preview/gate and active-member fixed post composer.
- Produces: shell prop `restingTitle="Community"` while retaining `title={group.name}` as the scrolled title.

- [ ] **Step 1: Write failing visitor/member UI tests.** Assert a public non-member never calls `fetchMessages`, sees only a pinned post plus “Join to view more,” and an active member sees the feed plus viewport-fixed composer.
- [ ] **Step 2: Write the failing header transition test.** Assert the group-room center begins with visible “Community,” then changes to the group name when the title anchor crosses the header; keep the menu action rendered.
- [ ] **Step 3: Run red group/shell tests.** Run `npm test -- src/test/__tests__/communityFeatureGroupPage.test.tsx src/test/__tests__/communityProductShell.test.tsx`; expect old access/header/composer behavior to fail.
- [ ] **Step 4: Implement the preview boundary and fixed composer.** Enable `useGroupMessages` only for active members, fetch one pin otherwise, hide Resources for non-members, add adequate feed bottom padding, and move the shared composer outside the scrolling panel with `fixed inset-x-0 bottom-0` positioning.
- [ ] **Step 5: Implement the two-state header transition.** Use the existing scroll measurement, visible text rather than an empty center, CSS opacity/transform animation, and `motion-reduce` fallbacks.
- [ ] **Step 6: Run green group/shell tests.** Repeat the targeted Vitest command; expect zero failures.

### Task 5: Facebook-style post detail and comments

**Files:**
- Create: `edutu-web-app/src/features/community/CommunityPostPage.tsx`
- Modify: `edutu-web-app/src/features/community/CommunityAppRouter.tsx`
- Create: `edutu-web-app/src/test/__tests__/communityPostPage.test.tsx`

**Interfaces:**
- Consumes: `CommunityApi.fetchPostThread`, `sendComment`, like APIs, `MessageBubble`, and `CommunityComposer`.
- Produces: route `/app/community/groups/:id/posts/:postId`.

- [ ] **Step 1: Write failing route/page tests.** Assert the selected post renders once above chronological comments, “No comments yet” appears for an empty thread, Comment writes through the fixed composer, failed submission preserves text, and a 404 links back to the group.
- [ ] **Step 2: Run red post-page tests.** Run `npm test -- src/test/__tests__/communityPostPage.test.tsx`; expect missing route/component failures.
- [ ] **Step 3: Implement the route and page.** Fetch group detail and thread in parallel where possible, require active membership, append successful comments, update counts/likes locally, and preserve accessibility labels/live regions.
- [ ] **Step 4: Run green post-page tests.** Repeat the targeted Vitest command; expect zero failures.

### Task 6: Full verification

**Files:**
- Verify all files above without altering unrelated failures.

**Interfaces:**
- Consumes: completed backend and web contracts.
- Produces: fresh evidence for the implementation handoff.

- [ ] **Step 1: Run backend targeted suites.** Run `npm test -- community-authz.spec.ts community-post-engagement.migration.spec.ts messages.service.spec.ts communities.controller.spec.ts dto/community.dto.spec.ts --runInBand`.
- [ ] **Step 2: Run backend static verification.** Run `npm run build` and `npm run lint` from `backend/services/services/api`.
- [ ] **Step 3: Run web targeted suites.** Run `npm test -- src/test/__tests__/communityPostInteractions.test.tsx src/test/__tests__/communityFeatureGroupPage.test.tsx src/test/__tests__/communityProductShell.test.tsx src/test/__tests__/communityPostPage.test.tsx`.
- [ ] **Step 4: Run web static verification.** Run `npm run typecheck`, `npm run build`, and `npm run lint` from `edutu-web-app`.
- [ ] **Step 5: Review the diff against every spec requirement.** Confirm the access boundary, single pin, fixed composers, comment route, like/share states, and header transition each have evidence; report any unrelated pre-existing failures exactly.
