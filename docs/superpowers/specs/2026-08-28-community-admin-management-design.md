# Community Administration and Creation Approval Design

**Date:** 2026-08-28

## Goal

Give Edutu administrators one place to manage every community, create platform-managed communities, review member creation requests, and curate an ordered Trending collection. A member may have at most two active or pending member-created communities combined. Member submissions require approval; administrator-created communities publish immediately.

## Approved Product Rules

- A member can have at most two slots in use. An active member-created community and a pending creation request each consume one slot.
- Rejected or cancelled requests and archived communities do not consume a slot.
- Every member-created community begins as a pending request and is invisible in community discovery until approved.
- Approval rechecks the creator's active-community count in the same transaction that creates the group. A stale request can never produce a third community.
- Administrator-created communities publish immediately, are marked as platform-managed, and do not consume a personal creator slot.
- Administrators may select any number of active public communities as Trending and control their order.
- Archiving is the normal removal operation. Restoring a member-created community rechecks its creator's limit before making it active again.
- Approval, rejection, creation, editing, archiving, restoring, and Trending changes are audit logged.

## Chosen Architecture

Use a dedicated creation-request table rather than inserting hidden rows into `community_groups`.

This keeps rejected proposals out of production group data, avoids creating owner memberships for unapproved communities, and makes the moderation lifecycle explicit. Existing `community_groups` authorization remains focused on real groups. The existing transactional cap in `GroupsService` remains the authority for direct group insertion, but ordinary clients no longer receive a route that publishes a group immediately.

## Data Model

Add `community_creation_requests` with:

- `id uuid primary key`
- `requester_id text not null` containing the raw Clerk subject
- proposed `name`, `description`, `opportunity_id`, `visibility`, `join_policy`, and `cover_emoji`
- `cover_image_resource_url text null`
- `status text not null` constrained to `pending`, `approved`, `rejected`, or `cancelled`
- `review_reason text null`
- `reviewed_by text null` and `reviewed_at timestamptz null`
- `approved_group_id uuid null` referencing `community_groups(id)`
- `created_at` and `updated_at`

Indexes cover pending-first admin pagination, requester history, and requester/status counts. A member may have multiple historical requests, but only pending rows consume slots.

Extend `community_groups` with:

- `management_scope text not null default 'member'`, constrained to `member` or `platform`
- `trending_rank integer null`
- `updated_at timestamptz not null default now()`

A partial unique index on non-null `trending_rank` prevents duplicate ordering. Archived, private, or expired groups cannot retain a Trending rank; archive and visibility changes clear it transactionally.

## Slot and Concurrency Rules

Submitting a request takes a transaction-scoped advisory lock keyed by the raw Clerk subject. Under that lock, the backend counts:

1. non-archived groups with `management_scope = 'member'` and `owner_id = requester_id`; and
2. pending creation requests for that requester.

If the total is already two, submission returns `409 Conflict` with a stable error code and a human-readable explanation. The request insert happens before the lock is released, preventing double submissions from exceeding the cap.

Approval locks the request row and the same requester advisory key. It then rechecks active member-managed groups. If the member already owns two, no group is created and the request stays pending with an admin-visible conflict response. Otherwise the transaction creates the group, inserts its active owner membership, and marks the request approved with `approved_group_id`.

Approving an already approved request is idempotent and returns the existing group. Rejecting, cancelling, archiving, and restoring are also designed to tolerate repeated requests safely.

## API Contract

### Member API

- `POST /communities/creation-requests` — validates the proposal, reserves one of the member's two slots, and returns the pending request.
- `GET /communities/creation-requests/mine` — returns the caller's request history and current slot usage.
- `POST /communities/creation-requests/:id/cover-image/upload-url` — reserves a private cover-image upload owned by the requester.
- `PATCH /communities/creation-requests/:id/cover-image` — records the stable uploaded resource URL on a pending request.
- `POST /communities/creation-requests/:id/cancel` — cancels the caller's pending request and releases its slot.

The existing authenticated `POST /communities/groups` route no longer publishes member groups. It returns `409 COMMUNITY_CREATION_REVIEW_REQUIRED` with an upgrade-safe explanation, preventing an older client from mistaking a request id for a live group id. Updated clients use the explicit request route and response type.

### Admin API

- `GET /admin/community/groups` — cursor-paginated catalog with search and status, visibility, management-scope, and Trending filters.
- `GET /admin/community/groups/:id` — group detail, creator slot usage, activity summary, and moderation metadata.
- `POST /admin/community/groups` — immediately creates a platform-managed group.
- `PATCH /admin/community/groups/:id` — edits name, description, visibility, join policy, imagery, and allowed metadata.
- `POST /admin/community/groups/:id/archive` and `/restore` — archive or restore with cap enforcement where applicable.
- `GET /admin/community/creation-requests` — cursor-paginated pending-first review queue.
- `POST /admin/community/creation-requests/:id/approve` — atomically approves and creates the group.
- `POST /admin/community/creation-requests/:id/reject` — requires a concise reason.
- `GET /admin/community/trending` — returns the complete ordered selection using cursor pagination.
- `PUT /admin/community/trending` — atomically persists the ordered group-id list. There is no business maximum; payload and pagination protections remain infrastructure concerns.

All admin routes use the existing `AdminGuard`. Inputs use Zod validation pipes. Responses expose stable status and error-code fields so web and mobile clients can distinguish quota, stale-request, and validation failures without parsing prose.

### Discovery API

Community discovery returns Trending and regular results separately. Trending is ordered by `trending_rank`; regular communities retain activity ordering and exclude groups already present in Trending. Both collections are cursor-paginated so an unlimited editorial selection does not create an unbounded response.

## Admin Experience

Add a `Communities` route under the People navigation group. Keep `Community Safety` as a separate, linked moderation queue.

The page uses a restrained operations-console layout consistent with the existing admin shell:

- A header shows the title, a short operational description, refresh status, and a primary `Create community` action.
- Summary metrics show active communities, pending requests, Trending selections, and creators currently using both slots.
- Tabs divide the workspace into `All communities`, `Creation requests`, and `Trending` without navigating away from the page.
- The community catalog supports search and concise filters. Each row shows identity, owner, management scope, visibility, member/post counts, status, and Trending position.
- Selecting a row opens a desktop side panel for editing, archive/restore, Trending actions, and a link to Community Safety. Destructive actions use the existing confirmation dialog.
- The request queue shows the proposed identity, applicant, submission age, and slot usage such as `1 of 2 used`. Its review panel offers approve or reject; rejection requires a reason.
- The Trending tab uses an ordered list with keyboard-accessible move controls as well as pointer reordering. Administrators can add any eligible community and remove or reorder selections.
- The create drawer publishes a platform-managed community immediately and clearly labels that it does not use a personal member slot.

Every asynchronous surface includes loading, empty, stale-data, success, and recoverable error states. Mutation controls disable while submitting, notices use live regions, drawers trap focus, and all icon-only actions have accessible labels.

## Member Web and Mobile Experience

Creation forms keep the existing fields and image validation, but the primary action becomes `Submit for review`. A successful submission opens a receipt state with `Pending review`, the submitted details, slot usage, and a cancel action.

Because an unapproved group has no group id, cover uploads attach to the request. If the upload fails, the request remains safe and the member can retry or continue without an image. Approval copies the stable cover resource URL to the new group.

The Groups screen includes pending request cards so users can see that their submission exists and does not repeatedly resubmit it. Rejected requests display the review reason and allow a corrected new submission once the rejected request has released its slot.

On Explore, Trending becomes a horizontally scrollable, snap-aligned rail on mobile and a responsive rail/grid on wider screens. It loads additional curated items progressively. `More communities` excludes all currently loaded Trending groups and continues with the existing search and focus filtering behavior.

Both `edutu-web-app` and `edutumobile` consume the same request response and stable error codes. Older direct-create calls fail clearly and cannot bypass review through the compatibility behavior described above.

## Authorization and Safety

- Request ownership is checked from the raw Clerk subject on every member route.
- Members can read only their own creation requests.
- Only pending requests can be edited, uploaded to, cancelled, approved, or rejected.
- Only admins can publish platform-managed groups or mutate Trending.
- Trending accepts only non-archived, non-expired, public groups.
- Admin edits do not bypass attachment validation or stable-resource URL rules.
- Existing group membership and content moderation rules remain unchanged.
- Admin mutations record actor, target, action, and material before/after metadata through the existing audit service.

## Error Handling

- `409 COMMUNITY_CREATION_LIMIT_REACHED` — active plus pending member slots already total two.
- `409 COMMUNITY_REQUEST_STATE_CHANGED` — another reviewer or the requester changed the request first.
- `409 COMMUNITY_RESTORE_LIMIT_REACHED` — restoring would give a member more than two active groups.
- `400 COMMUNITY_TRENDING_INELIGIBLE` — a selected group is private, archived, or expired.
- `404` for inaccessible requests or groups; member routes do not reveal another member's request existence.

Admin conflict responses preserve the pending request and surface a refresh action. Client drafts remain intact on transient failures.

## Verification

- Migration contract tests prove the request table, group columns, constraints, indexes, and foreign keys.
- Backend service tests prove the active-plus-pending cap, concurrent submission serialization, approval recheck, approval idempotency, rejection slot release, restore enforcement, platform-managed exemption, Trending eligibility, and ordered persistence.
- Controller tests prove member ownership, admin authorization, validation, stable errors, and legacy direct-create compatibility.
- Admin React tests cover route/navigation registration, catalog filtering, request review, rejection validation, immediate admin creation, archive/restore confirmation, and accessible Trending reordering.
- Web and mobile tests cover submission receipts, pending/rejected states, cover upload retry, quota messaging, and Trending rendering/order.
- Run targeted red-green cycles first, then backend tests/lint/build, admin tests/build, web tests/typecheck/build, and mobile TypeScript/Jest checks for touched packages.
- Visually verify the admin page at desktop and narrow widths and the Explore rail at representative mobile and desktop widths.

## Rollout

1. Apply the additive migration and deploy the new request/admin endpoints plus the safe direct-create rejection.
2. Deploy the admin catalog, review queue, and Trending controls.
3. Deploy updated web and mobile request flows together with user-facing handling for the compatibility error.
4. After supported clients have migrated, remove the ambiguous direct-create client method while retaining server-side protection against immediate member publishing.

No existing communities are converted into requests. Existing groups default to member-managed; seed or clearly Edutu-owned groups are migrated to platform-managed explicitly. Existing activity ordering remains the fallback when no Trending communities are selected.
