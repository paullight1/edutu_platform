# Community Administration and Creation Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin community workspace, approval-based member creation, a strict two-slot creator limit, and unlimited ordered Trending curation across the backend, admin, web, and mobile clients.

**Architecture:** Persist proposals separately from live communities. Serialize member submission and approval with requester-scoped PostgreSQL advisory locks, then expose guarded admin operations through a focused management service. Discovery consumes explicit Trending ordering, while both member clients submit requests instead of creating groups directly.

**Tech Stack:** NestJS, Drizzle ORM, PostgreSQL/Supabase migrations, Zod, React + Vite + TypeScript, Expo React Native, Vitest, Jest, Testing Library, PGlite.

**Spec:** `docs/superpowers/specs/2026-08-28-community-admin-management-design.md`

## Global Constraints

- A member has exactly two active-or-pending creation slots; rejected/cancelled requests and archived groups do not consume slots.
- Member creation always requires admin approval; platform-managed admin creation publishes immediately.
- Approval and restoration recheck the limit transactionally.
- Trending has no business maximum and accepts only active, unexpired, public groups.
- Raw Clerk subjects remain the identity type for every `community_*` user column.
- Existing group membership, report moderation, attachment safety, and stable resource URL rules remain unchanged.
- Preserve unrelated staged and unstaged work; commit only task-specific paths.

## File Structure

- `supabase/migrations/20260828153000_community_admin_management.sql` owns additive persistence, constraints, indexes, and data backfill.
- `backend/services/services/api/src/communities/creation-requests.service.ts` owns member request lifecycle, slot locking, and approval transaction primitives.
- `backend/services/services/api/src/communities/dto/creation-request.dto.ts` owns member request validation and stable response types.
- `backend/services/services/api/src/admin/community-management.service.ts` owns admin catalog, moderation, platform creation, restoration, and Trending orchestration.
- `backend/services/services/api/src/admin/community-management.dto.ts` owns admin query and mutation validation.
- `backend/services/services/api/src/admin/community-management.controller.ts` exposes guarded admin routes only.
- `admin/src/features/communities/` contains typed API, model, page, styles, and focused components for the operations workspace.
- `edutu-web-app/src/features/community/` receives request/discovery types and updates the existing create, groups, and Explore pages.
- `edutumobile/packages/core/src/services/communities.ts` and `edutumobile/app/(app)/discussions/` receive the same API contract and receipt states.

---

### Task 1: Persistence Contract and Drizzle Schema

**Files:**
- Create: `supabase/migrations/20260828153000_community_admin_management.sql`
- Create: `backend/services/services/api/src/communities/community-admin-management.migration.spec.ts`
- Modify: `backend/services/services/api/src/db/schema.ts`

**Interfaces:**
- Produces: `communityCreationRequests`, `CommunityCreationRequest`, `NewCommunityCreationRequest`, `communityGroups.managementScope`, `communityGroups.trendingRank`, and `communityGroups.updatedAt`.
- Consumes: existing `communityGroups`, `opportunities`, raw Clerk `text` identities, and current authenticated-role conventions.

- [ ] **Step 1: Write the failing migration contract test**

Create a PGlite fixture with the minimum `community_groups` and `opportunities` tables, execute the migration, then assert literal columns and constraints:

```ts
expect(requestColumns.rows.map(({ column_name }) => column_name)).toEqual(
  expect.arrayContaining([
    "requester_id",
    "status",
    "review_reason",
    "approved_group_id",
    "cover_image_resource_url",
  ]),
);
expect(groupColumns.rows.map(({ column_name }) => column_name)).toEqual(
  expect.arrayContaining(["management_scope", "trending_rank", "updated_at"]),
);
```

Also insert duplicate non-null Trending ranks and assert the second write fails.

- [ ] **Step 2: Run the test to verify RED**

Run: `cd backend/services/services/api && npm test -- community-admin-management.migration.spec.ts --runInBand`

Expected: FAIL because `20260828153000_community_admin_management.sql` does not exist.

- [ ] **Step 3: Add the migration and schema exports**

The SQL must create the request status/scope checks, requester/status and pending-order indexes, foreign keys, and this ordering invariant:

```sql
create unique index community_groups_trending_rank_unique
  on public.community_groups (trending_rank)
  where trending_rank is not null;
```

Backfill seed-owned groups to `platform` using known seed slugs; leave all other existing rows at the safe `member` default. Mirror the SQL exactly in Drizzle.

- [ ] **Step 4: Run the migration test and backend type build**

Run: `cd backend/services/services/api && npm test -- community-admin-management.migration.spec.ts --runInBand && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit only Task 1 files**

```bash
git add supabase/migrations/20260828153000_community_admin_management.sql backend/services/services/api/src/communities/community-admin-management.migration.spec.ts backend/services/services/api/src/db/schema.ts
git commit --only -m "feat(community): add administration persistence" -- supabase/migrations/20260828153000_community_admin_management.sql backend/services/services/api/src/communities/community-admin-management.migration.spec.ts backend/services/services/api/src/db/schema.ts
```

### Task 2: Member Creation-Request Lifecycle

**Files:**
- Create: `backend/services/services/api/src/communities/dto/creation-request.dto.ts`
- Create: `backend/services/services/api/src/communities/dto/creation-request.dto.spec.ts`
- Create: `backend/services/services/api/src/communities/creation-requests.service.ts`
- Create: `backend/services/services/api/src/communities/creation-requests.service.spec.ts`
- Modify: `backend/services/services/api/src/communities/communities.controller.ts`
- Modify: `backend/services/services/api/src/communities/communities.controller.spec.ts`
- Modify: `backend/services/services/api/src/communities/communities.module.ts`

**Interfaces:**
- Produces: `CreateCommunityRequestSchema`, `CommunityCreationRequestDto`, `CommunityCreationSlotSummary`, `CreationRequestsService.submit`, `.listMine`, `.cancel`, `.createCoverUpload`, and `.setCoverImage`.
- Consumes: Task 1 schema, `MessagesService` stable private-attachment helpers, `CurrentUser("authId")`, and `CreateGroupSchema` field rules.

- [ ] **Step 1: Write failing DTO and service tests**

The break caught is any path that allows a third active-or-pending slot or lets one user mutate another user's request. Use an in-memory store at the persistence boundary and literal expectations:

```ts
await expect(service.submit("user_ada", validProposal)).rejects.toMatchObject({
  response: expect.objectContaining({
    code: "COMMUNITY_CREATION_LIMIT_REACHED",
  }),
});
expect(store.createPending).not.toHaveBeenCalled();
```

Add cases for one active plus one pending, rejection/cancellation not counting, request ownership, and invalid proposal fields.

- [ ] **Step 2: Run tests to verify RED**

Run: `cd backend/services/services/api && npm test -- creation-request.dto.spec.ts creation-requests.service.spec.ts --runInBand`

Expected: FAIL because the DTO and service modules do not exist.

- [ ] **Step 3: Implement request validation and store boundary**

Define the stable response shape:

```ts
export type CommunityCreationRequestResponse = {
  request: CommunityCreationRequest;
  slots: { used: number; limit: 2 };
};
```

`DrizzleCreationRequestsStore.submitWithinLimit()` must take `pg_advisory_xact_lock(hashtext('community_creation_slots:' || requesterId))`, count active member-managed groups plus pending requests, and insert only when the total is below two.

- [ ] **Step 4: Add member endpoints and close the legacy bypass**

Register explicit creation-request routes. Change `POST /communities/groups` to throw a conflict payload with code `COMMUNITY_CREATION_REVIEW_REQUIRED`; do not call `GroupsService.create` for member requests.

- [ ] **Step 5: Run focused controller/service tests**

Run: `cd backend/services/services/api && npm test -- creation-request.dto.spec.ts creation-requests.service.spec.ts communities.controller.spec.ts --runInBand`

Expected: PASS and the controller test proves raw `authId` is forwarded.

- [ ] **Step 6: Commit only Task 2 files**

```bash
git add backend/services/services/api/src/communities/dto/creation-request.dto.ts backend/services/services/api/src/communities/dto/creation-request.dto.spec.ts backend/services/services/api/src/communities/creation-requests.service.ts backend/services/services/api/src/communities/creation-requests.service.spec.ts backend/services/services/api/src/communities/communities.controller.ts backend/services/services/api/src/communities/communities.controller.spec.ts backend/services/services/api/src/communities/communities.module.ts
git commit --only -m "feat(community): require creation approval" -- backend/services/services/api/src/communities/dto/creation-request.dto.ts backend/services/services/api/src/communities/dto/creation-request.dto.spec.ts backend/services/services/api/src/communities/creation-requests.service.ts backend/services/services/api/src/communities/creation-requests.service.spec.ts backend/services/services/api/src/communities/communities.controller.ts backend/services/services/api/src/communities/communities.controller.spec.ts backend/services/services/api/src/communities/communities.module.ts
```

### Task 3: Admin Management, Approval, and Trending Backend

**Files:**
- Create: `backend/services/services/api/src/admin/community-management.dto.ts`
- Create: `backend/services/services/api/src/admin/community-management.dto.spec.ts`
- Create: `backend/services/services/api/src/admin/community-management.service.ts`
- Create: `backend/services/services/api/src/admin/community-management.service.spec.ts`
- Create: `backend/services/services/api/src/admin/community-management.controller.ts`
- Create: `backend/services/services/api/src/admin/community-management.controller.spec.ts`
- Modify: `backend/services/services/api/src/admin/admin.module.ts`
- Modify: `backend/services/services/api/src/communities/groups.service.ts`
- Modify: `backend/services/services/api/src/communities/groups.service.spec.ts`

**Interfaces:**
- Produces: guarded `/admin/community/groups`, `/creation-requests`, and `/trending` routes; `AdminCommunityManagementService`; atomic approval and ordered Trending writes.
- Consumes: Task 1 schema, Task 2 request/store types, `AdminGuard`, `AuditService`, `GroupsService`, and the two-slot constant.

- [ ] **Step 1: Write failing service tests for moderation invariants**

Cover the realistic mutations: approving twice, approving after the creator reaches two groups, restoring a third group, selecting private/archived/expired Trending groups, duplicate Trending ids, and wrong ordering. Assert real service results and store effects:

```ts
await service.replaceTrending("admin_1", [groupB.id, groupA.id]);
expect(await store.listTrending()).toEqual([
  expect.objectContaining({ id: groupB.id, trendingRank: 1 }),
  expect.objectContaining({ id: groupA.id, trendingRank: 2 }),
]);
```

- [ ] **Step 2: Run service tests to verify RED**

Run: `cd backend/services/services/api && npm test -- community-management.service.spec.ts --runInBand`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement the management store and service**

Use transactions for approval, restore, and Trending replacement. Approval locks both request row and requester advisory key, creates group plus active owner membership, then links `approved_group_id`. Platform creation writes `management_scope = 'platform'` and bypasses personal slot counting only through the admin service.

- [ ] **Step 4: Write failing controller authorization/validation tests**

Assert `AdminGuard` metadata, bounded cursor/query parsing, required rejection reasons, and actor forwarding. A non-admin integration path must never reach service methods.

- [ ] **Step 5: Implement DTOs, controller, module wiring, and audit calls**

Audit names are literal and stable:

```ts
"community.creation_request.approve"
"community.creation_request.reject"
"community.group.create_platform"
"community.group.update"
"community.group.archive"
"community.group.restore"
"community.trending.replace"
```

- [ ] **Step 6: Run all focused backend tests**

Run: `cd backend/services/services/api && npm test -- community-management community-admin-management creation-requests groups.service --runInBand`

Expected: PASS.

- [ ] **Step 7: Commit only Task 3 files**

```bash
git add backend/services/services/api/src/admin/community-management.* backend/services/services/api/src/admin/admin.module.ts backend/services/services/api/src/communities/groups.service.ts backend/services/services/api/src/communities/groups.service.spec.ts
git commit --only -m "feat(admin): manage community lifecycle" -- backend/services/services/api/src/admin/community-management.dto.ts backend/services/services/api/src/admin/community-management.dto.spec.ts backend/services/services/api/src/admin/community-management.service.ts backend/services/services/api/src/admin/community-management.service.spec.ts backend/services/services/api/src/admin/community-management.controller.ts backend/services/services/api/src/admin/community-management.controller.spec.ts backend/services/services/api/src/admin/admin.module.ts backend/services/services/api/src/communities/groups.service.ts backend/services/services/api/src/communities/groups.service.spec.ts
```

### Task 4: Curated Discovery Contract

**Files:**
- Modify: `backend/services/services/api/src/communities/groups.service.ts`
- Modify: `backend/services/services/api/src/communities/groups.service.spec.ts`
- Modify: `backend/services/services/api/src/communities/communities.controller.ts`
- Create: `backend/services/services/api/src/communities/community-discovery.spec.ts`

**Interfaces:**
- Produces: `GET /communities/discovery` returning `{ trending, communities, trendingCursor, communitiesCursor }` with no duplicate group ids.
- Consumes: explicit `communityGroups.trendingRank`, existing visibility authorization, membership enrichment, and activity ordering.

- [ ] **Step 1: Write the failing discovery behavior tests**

Use real service filtering with a store double. Prove explicit rank beats activity, private/archived entries disappear, regular rows exclude Trending ids, and more than two Trending entries are retained.

```ts
expect(result.trending.map(({ group }) => group.id)).toEqual(["g3", "g1", "g2"]);
expect(result.communities.map(({ group }) => group.id)).not.toContain("g1");
```

- [ ] **Step 2: Run the test to verify RED**

Run: `cd backend/services/services/api && npm test -- community-discovery.spec.ts --runInBand`

Expected: FAIL because discovery is still activity-derived in the client.

- [ ] **Step 3: Implement cursor-paginated discovery**

Trending ordering is `trending_rank asc, id asc`. Regular ordering remains `last_message_at desc nulls last, created_at desc, id desc`. Enrich both with the viewer's membership using the existing `GroupWithMembership` contract.

- [ ] **Step 4: Run discovery and group suites**

Run: `cd backend/services/services/api && npm test -- community-discovery.spec.ts groups.service.spec.ts communities.controller.spec.ts --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit Task 4 paths**

```bash
git add backend/services/services/api/src/communities/groups.service.ts backend/services/services/api/src/communities/groups.service.spec.ts backend/services/services/api/src/communities/communities.controller.ts backend/services/services/api/src/communities/community-discovery.spec.ts
git commit --only -m "feat(community): serve curated discovery" -- backend/services/services/api/src/communities/groups.service.ts backend/services/services/api/src/communities/groups.service.spec.ts backend/services/services/api/src/communities/communities.controller.ts backend/services/services/api/src/communities/community-discovery.spec.ts
```

### Task 5: Admin Community Operations Workspace

**Files:**
- Create: `admin/src/features/communities/model.ts`
- Create: `admin/src/features/communities/api.ts`
- Create: `admin/src/features/communities/api.spec.ts`
- Create: `admin/src/features/communities/CommunitiesPage.tsx`
- Create: `admin/src/features/communities/CommunitiesPage.css`
- Create: `admin/src/features/communities/CommunitiesPage.spec.tsx`
- Modify: `admin/src/app/route-manifest.tsx`
- Modify: `admin/src/app/route-manifest.spec.tsx`
- Modify: `admin/src/app/AdminRoutes.tsx`

**Interfaces:**
- Produces: `/communities` People navigation entry and an accessible three-tab admin workspace.
- Consumes: Task 3 admin API, `backendFetchJson`, existing `ConfirmDialog`, admin shell CSS tokens, and Lucide icons.

- [ ] **Step 1: Write failing route and page integration tests**

The route test must expect `/communities` exactly once under People. The page test uses a complete API fixture and asserts visible behavior rather than mock presence:

```tsx
expect(await screen.findByRole("heading", { name: "Communities" })).toBeVisible();
fireEvent.click(screen.getByRole("tab", { name: /creation requests/i }));
expect(screen.getByText("1 of 2 slots used")).toBeVisible();
```

Add tests for required rejection reason, approval refresh, immediate admin creation, archive confirmation, and keyboard move-up/down Trending order.

- [ ] **Step 2: Run admin tests to verify RED**

Run: `cd admin && npm test -- src/app/route-manifest.spec.tsx src/features/communities/CommunitiesPage.spec.tsx`

Expected: FAIL because route and page do not exist.

- [ ] **Step 3: Implement typed API and restrained operations UI**

Use one page-level loader with three focused panels. Preserve search/filter state across tab switches. Use a side drawer for create/edit/review, `ConfirmDialog` for archive/restore, live-region notices, keyboard reorder controls, and mobile stacking below 760px.

- [ ] **Step 4: Run page tests, lint, and build**

Run: `cd admin && npm test -- src/app/route-manifest.spec.tsx src/features/communities/CommunitiesPage.spec.tsx src/features/communities/api.spec.ts && npx eslint src/features/communities src/app/route-manifest.tsx src/app/AdminRoutes.tsx --max-warnings 0 && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit Task 5 paths**

```bash
git add admin/src/features/communities admin/src/app/route-manifest.tsx admin/src/app/route-manifest.spec.tsx admin/src/app/AdminRoutes.tsx
git commit --only -m "feat(admin): add community operations workspace" -- admin/src/features/communities admin/src/app/route-manifest.tsx admin/src/app/route-manifest.spec.tsx admin/src/app/AdminRoutes.tsx
```

### Task 6: Web Request Receipt and Curated Explore

**Files:**
- Modify: `edutu-web-app/src/features/community/types.ts`
- Modify: `edutu-web-app/src/features/community/api.ts`
- Modify: `edutu-web-app/src/features/community/CommunityCreateGroupPage.tsx`
- Modify: `edutu-web-app/src/features/community/CommunityGroupsPage.tsx`
- Modify: `edutu-web-app/src/features/community/CommunityExplorePage.tsx`
- Modify: `edutu-web-app/src/test/__tests__/CommunityCreateGroupPage.test.tsx`
- Modify: `edutu-web-app/src/test/__tests__/CommunityGroupsPage.test.tsx`
- Modify: `edutu-web-app/src/test/__tests__/CommunityExplorePage.test.tsx`

**Interfaces:**
- Produces: `CommunityCreationRequest`, `CommunityCreationSlotSummary`, `CommunityDiscoveryResponse`, `CommunityApi.submitCreationRequest`, `.listMyCreationRequests`, `.cancelCreationRequest`, and `.getDiscovery`.
- Consumes: Tasks 2 and 4 member endpoints and existing attachment/upload utilities.

- [ ] **Step 1: Rewrite create-page tests for request behavior and verify RED**

Assert the action label, request endpoint input, pending receipt, `used of 2` copy, cancel behavior, and retained receipt when cover upload fails. The production change that makes each fail is a return to immediate group navigation.

- [ ] **Step 2: Run create/groups tests to verify RED**

Run: `cd edutu-web-app && npm test -- src/test/__tests__/CommunityCreateGroupPage.test.tsx src/test/__tests__/CommunityGroupsPage.test.tsx`

Expected: FAIL on `Submit for review` and pending-card expectations.

- [ ] **Step 3: Implement typed request API and member receipt states**

Replace `createGroup()` calls on new-creation surfaces with:

```ts
const { request, slots } = await api.submitCreationRequest(input);
setReceipt({ request, slots });
```

Do not navigate to a group id. Pending and rejected request cards link back to request details, not group routes.

- [ ] **Step 4: Rewrite Explore test for explicit Trending and verify RED**

Return three low-activity explicitly ranked groups from `getDiscovery()` and assert all three render in Trending in rank order while a higher-activity regular group remains under More communities.

- [ ] **Step 5: Implement curated Explore rail**

Use a snap-aligned horizontal rail on narrow screens and a responsive grid/rail on desktop. Search and focus filters apply to both collections; do not recalculate Trending from member/message counts.

- [ ] **Step 6: Run web tests, typecheck, lint, and build**

Run: `cd edutu-web-app && npm test -- src/test/__tests__/CommunityCreateGroupPage.test.tsx src/test/__tests__/CommunityGroupsPage.test.tsx src/test/__tests__/CommunityExplorePage.test.tsx && npm run typecheck && npx eslint src/features/community --report-unused-disable-directives --max-warnings 0 && npm run build`

Expected: PASS; only pre-existing build warnings may remain and must be reported.

- [ ] **Step 7: Commit Task 6 paths**

```bash
git add edutu-web-app/src/features/community/types.ts edutu-web-app/src/features/community/api.ts edutu-web-app/src/features/community/CommunityCreateGroupPage.tsx edutu-web-app/src/features/community/CommunityGroupsPage.tsx edutu-web-app/src/features/community/CommunityExplorePage.tsx edutu-web-app/src/test/__tests__/CommunityCreateGroupPage.test.tsx edutu-web-app/src/test/__tests__/CommunityGroupsPage.test.tsx edutu-web-app/src/test/__tests__/CommunityExplorePage.test.tsx
git commit --only -m "feat(web): submit communities for review" -- edutu-web-app/src/features/community/types.ts edutu-web-app/src/features/community/api.ts edutu-web-app/src/features/community/CommunityCreateGroupPage.tsx edutu-web-app/src/features/community/CommunityGroupsPage.tsx edutu-web-app/src/features/community/CommunityExplorePage.tsx edutu-web-app/src/test/__tests__/CommunityCreateGroupPage.test.tsx edutu-web-app/src/test/__tests__/CommunityGroupsPage.test.tsx edutu-web-app/src/test/__tests__/CommunityExplorePage.test.tsx
```

### Task 7: Mobile Request Contract and Receipt

**Files:**
- Modify: `edutumobile/packages/core/src/services/communities.ts`
- Modify: `edutumobile/app/(app)/discussions/new.tsx`
- Modify: `edutumobile/app/(app)/discussions/index.tsx`
- Modify: `edutumobile/__tests__/communitiesService.test.ts`
- Modify: `edutumobile/__tests__/communityForms.test.tsx`
- Modify: `edutumobile/lib/i18n/locales/en/community.json`

**Interfaces:**
- Produces: `submitCommunityCreationRequest`, `fetchMyCommunityCreationRequests`, `createCommunityRequestCoverUpload`, `setCommunityRequestCoverImage`, `fetchCommunityDiscovery`, a native pending receipt/card, and explicit Trending order.
- Consumes: Tasks 2 and 4 APIs plus existing Expo attachment validation, upload, safe-area, and localization patterns.

- [ ] **Step 1: Write failing core-service contract tests**

Assert `POST /communities/creation-requests`, exact compact payload, typed request/slot response, list-mine, cover reservation/finalization, cancellation, and discovery paths. Remove expectations that a submission immediately returns `CommunityGroup`.

- [ ] **Step 2: Run service tests to verify RED**

Run: `cd edutumobile && npm test -- --runInBand __tests__/communitiesService.test.ts`

Expected: FAIL because request methods do not exist.

- [ ] **Step 3: Implement the mobile service contract**

Use the same field names and status vocabulary as web. Preserve abort/network error handling and compact optional values. Cover reservations use the request id and copy the returned stable resource URL through the finalization endpoint.

- [ ] **Step 4: Write failing native receipt tests, then implement UI**

Assert `Submit for review`, `Pending review`, slot usage, cover-upload retry, and no navigation to `/discussions/:requestId`. Update the discussion index to render the server-provided Trending order without activity reranking and to progressively load more curated rows. Update only English copy in this task; untranslated locales fall back through the established i18n configuration.

- [ ] **Step 5: Run mobile focused tests and typecheck**

Run: `cd edutumobile && npm test -- --runInBand __tests__/communitiesService.test.ts __tests__/communityForms.test.tsx && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit Task 7 paths**

```bash
git add edutumobile/packages/core/src/services/communities.ts 'edutumobile/app/(app)/discussions/new.tsx' 'edutumobile/app/(app)/discussions/index.tsx' edutumobile/__tests__/communitiesService.test.ts edutumobile/__tests__/communityForms.test.tsx edutumobile/lib/i18n/locales/en/community.json
git commit --only -m "feat(mobile): submit communities for approval" -- edutumobile/packages/core/src/services/communities.ts 'edutumobile/app/(app)/discussions/new.tsx' 'edutumobile/app/(app)/discussions/index.tsx' edutumobile/__tests__/communitiesService.test.ts edutumobile/__tests__/communityForms.test.tsx edutumobile/lib/i18n/locales/en/community.json
```

### Task 8: Full Verification and Visual Review

**Files:**
- Modify only files found defective by a failing verification, with a reproducing test added before each fix.

**Interfaces:**
- Consumes: all prior task deliverables.
- Produces: verified admin, backend, web, and mobile feature handoff.

- [ ] **Step 1: Run the backend feature and regression suites**

Run: `cd backend/services/services/api && npm test -- community admin --runInBand && npm run lint && npm run build`

Expected: PASS with no new warnings.

- [ ] **Step 2: Run admin verification**

Run: `cd admin && npm test -- src/features/communities src/app/route-manifest.spec.tsx && npm run lint && npm run build`

Expected: PASS.

- [ ] **Step 3: Run web verification**

Run: `cd edutu-web-app && npm test -- src/test/__tests__/CommunityCreateGroupPage.test.tsx src/test/__tests__/CommunityGroupsPage.test.tsx src/test/__tests__/CommunityExplorePage.test.tsx && npm run typecheck && npm run build`

Expected: PASS.

- [ ] **Step 4: Run mobile verification**

Run: `cd edutumobile && npm test -- --runInBand __tests__/communitiesService.test.ts __tests__/communityForms.test.tsx && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Perform visual and accessibility smoke checks**

At desktop admin widths, verify tabs, table density, drawers, confirmation dialogs, keyboard Trending controls, empty/loading/error states, and responsive stacking. At representative mobile and desktop web widths, verify pending receipts/cards and a Trending selection of at least four communities. Check the browser console and keyboard focus order.

- [ ] **Step 6: Validate repository hygiene**

Run: `git diff --check` and inspect `git status --short` to confirm no temporary screenshots, harnesses, generated files, or unrelated edits were included.

- [ ] **Step 7: Commit only any verification fixes**

Use a path-limited commit whose message names the verified defect. Do not stage unrelated workspace changes.
