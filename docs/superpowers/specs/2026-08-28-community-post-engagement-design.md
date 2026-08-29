# Community Post Access and Engagement Design

**Date:** 2026-08-28

## Goal

Turn a community room into a member-gated post feed: visitors may see group metadata and at most one pinned post, active members see the full feed, and every post supports persistent likes, a Facebook-style comment detail view, and link sharing. Keep member posting available from a fixed bottom composer and make the room header transition from “Community” to the group name while scrolling.

## Approved Experience

- A non-member, invited user, or pending applicant sees the group identity, membership action/status, and the current pinned top-level post when one exists.
- The remaining posts and resources are replaced by a “Join to view more” gate. Joining or approval immediately unlocks the feed.
- Active members see top-level posts in the group feed. Each post shows Like, Comment, and Share actions plus persisted counts.
- Selecting a post or Comment opens `/app/community/groups/:groupId/posts/:postId`. That page shows the post first and a chronological, one-level comment list below it; comments are not nested.
- The group feed has a viewport-fixed post composer for active members. The post-detail page has a viewport-fixed comment composer.
- The room header initially reads “Community” and retains the menu/settings action. When the large group title scrolls behind the sticky header, the center title animates to the group name. Reduced-motion users receive an immediate state change.
- Owners and moderators can pin or unpin a single top-level post. Pinning a different post atomically replaces the previous pin.

## Security and Authorization

The backend, not the React client, owns the content boundary.

- Existing group-preview visibility remains unchanged: public/unlisted groups are previewable by signed-in users; private groups are previewable only by active members or invitees.
- Full feed, resource, attachment, post-detail, comment, and like endpoints require an active membership. The canonical owner is also admitted unless explicitly removed or banned, protecting against a missing membership row.
- The pinned-preview endpoint applies group-preview visibility but returns only the single pinned top-level post. Deleted posts are never returned.
- Sending posts/comments and liking require an active member and a non-archived group. Archived groups remain readable to active members but are read-only.
- Pinning requires owner/moderator authorization. A comment cannot be pinned.
- Comment creation verifies that the parent exists, belongs to the same group, is a top-level post, and is not deleted.

## Data Model

Extend `community_group_messages` with:

- `parent_message_id uuid null` referencing `community_group_messages(id)` with cascade delete. `null` means a top-level post; non-null means a one-level comment.
- `pinned_at timestamptz null` and `pinned_by text null` for the single pinned top-level post.

Add `community_message_likes`:

- `message_id uuid not null` referencing `community_group_messages(id)` with cascade delete.
- `user_id text not null`.
- `created_at timestamptz not null default now()`.
- Composite primary key `(message_id, user_id)` makes liking idempotent.

Indexes cover top-level group pagination, chronological comments, like aggregation, and a partial unique index on `group_id` when `pinned_at is not null and parent_message_id is null and deleted_at is null`.

Group `message_count` continues to mean top-level posts; comments do not increment it. Both posts and comments may update `last_message_at`.

## API Contract

- `GET /communities/groups/:id/messages` — active-member top-level feed, enriched with `commentCount`, `likeCount`, `viewerHasLiked`, `parentMessageId`, `pinnedAt`, and `pinnedBy`.
- `GET /communities/groups/:id/pinned-post` — preview-safe single enriched pinned post or `null`.
- `GET /communities/groups/:id/posts/:postId` — active-member post plus chronological comments.
- `POST /communities/groups/:id/messages` — existing post endpoint; accepts no parent from clients.
- `POST /communities/groups/:id/posts/:postId/comments` — creates a text comment.
- `PUT /communities/messages/:messageId/like` and `DELETE /communities/messages/:messageId/like` — idempotently set or clear the viewer’s like and return updated reaction state.
- `PATCH /communities/messages/:messageId/pin` with `{ "pinned": boolean }` — owner/mod-only pin state.

All error responses use the existing NestJS exception contract. Missing/deleted posts return 404; membership failures return 403; malformed ids/bodies return 400.

## Frontend Structure

- Keep group-detail orchestration in `CommunityGroupPage`, but extract a reusable fixed `CommunityComposer` and post-action row so the feed and post page share interaction behavior.
- Add `CommunityPostPage` for the post-and-comments route.
- Extend `CommunityMessage` with engagement fields and add `CommunityPostThread`/reaction response types.
- Likes update optimistically and roll back with an inline error when the request fails.
- Share uses `navigator.share` when supported, otherwise copies the absolute post URL to the clipboard and announces success through an accessible live region.
- The fixed composer includes safe-area padding, `data-keyboard-avoid`, and matching bottom padding on the scroll content so the final post/comment cannot be covered.

## Loading, Empty, and Error States

- A preview with no pinned post shows the join gate without an empty-feed message.
- A member with no posts sees the existing constructive empty state and the fixed composer.
- A post with no comments says “No comments yet” and keeps the comment composer available.
- A deleted or unavailable post shows a recoverable state linking back to the group.
- Failed likes roll back; failed comments preserve the draft; failed shares show a compact accessible error.

## Verification

- Backend unit tests prove public non-members and invitees cannot list the feed, active members can, pinned preview returns only the current pin, comments cannot nest, like operations are idempotent, and only moderators can pin.
- Migration contract tests prove columns, keys, and indexes exist.
- React tests prove the visitor gate, pinned preview, active-member feed/composer, Facebook-style post route, counts/actions, share fallback, comment submission, and header transition.
- Run targeted suites first, then backend build/lint/tests and web typecheck/build/tests. Existing unrelated failures must be reported rather than hidden.
