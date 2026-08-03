# Group Discussions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded WhatsApp channel link on the Discover "Group Discussion" tile with an in-app discussions feature: browse, group chat over Supabase Realtime, opportunity-anchored groups, three forms (create / join request / per-group custom questions), a WhatsApp-channel banner, and the UGC moderation kit App Store review requires.

**Architecture:** Writes go through a new NestJS `communities` module using Drizzle against Postgres; reads of the live message stream go direct from the mobile client through Supabase Realtime. RLS is `SELECT`-only — the client never writes. Six new `community_group*` tables, all keyed on the raw Clerk subject.

**Tech Stack:** NestJS 10 + Drizzle ORM + Zod (backend) · Expo Router + React Native + `@supabase/supabase-js` Realtime + i18next (mobile) · Jest for both.

**Spec:** `docs/superpowers/specs/2026-08-03-group-discussions-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

1. **Branch from `origin/main` in a fresh worktree.** The current working branch is 41 commits behind `origin/main` and this tree is shared by concurrent sessions. Never run `git stash`, `git checkout .`, or `git restore` in this repo.
2. **`user_id` is the RAW Clerk subject, `text`, everywhere in this feature.** In controllers that means `@CurrentUser("authId")` — **NOT** `@CurrentUser("id")`. `src/auth/clerk-auth.guard.ts:169` sets `id` to `toDatabaseUserId(payload.sub)` (a *derived* UUID) and `authId` to the raw `payload.sub`. Existing tables such as `saved_searches` key on the derived UUID; these six tables do not. Using `id` here writes rows no client can ever read back.
3. **All new tables are prefixed `community_group`** (plus `community_reports`). `community_posts`, `community_comments`, `community_post_reactions` and `community_stories` already exist and mean *success stories / marketplace*.
4. **RLS: `SELECT` policies only. No table gets `INSERT`, `UPDATE` or `DELETE` policies.** `community_reports` gets no `SELECT` policy at all.
5. **One Realtime channel, for the on-screen group only.** Never one channel per joined group. Subscribe on screen focus, remove on blur.
6. **No hardcoded user-visible strings.** New keys go in a new `community` namespace at `edutumobile/lib/i18n/locales/en/community.json`, mirrored into `ar es fr ha hi pt sw zh`. Those files mix 2- and 4-space indentation — insert textually at an anchor, never reformat. Run `node scripts/gen-i18n-resources.js` after any locale change.
7. **DESIGN.md is binding.** Icons are `lucide-react-native` only; icon-only controls require `accessibilityLabel`; empty states get a 30–34pt icon at ~50% opacity plus one line and one CTA; every interactive component ships default / pressed / disabled / loading / error; `reducedMotion` honoured per component; colour stays Restrained (no saturated field — groups are not an AI moment).
8. **Gates before every commit:** `npx eslint <changed files> --max-warnings 0` must exit 0 everywhere. Backend tests: `npm test -- <spec>` from `backend/services/services/api`. Mobile tests: `npx jest <file> --maxWorkers=2` from `edutumobile`.

   **`tsc` baselines differ by project, and neither is zero on mobile.**
   - Backend (`backend/services/services/api`): `npx tsc --noEmit` exits 0. Any error is yours.
   - Mobile (`edutumobile`): `npx tsc --noEmit -p tsconfig.json` reports **2 pre-existing errors on `origin/main`**, both in `app/(app)/cv/index.tsx` — a stale import of `components/cv/CVEditor` (deleted upstream) and an implicit `any` at line 976. They are NOT yours, they are NOT in scope, and fixing them widens the diff into another session's work. The gate is **no NEW errors**, not zero.
   - The mobile jest suite likewise has a pre-existing baseline of ~9 failing suites, all environment/mock shims (`requireOptionalNativeModule`, `Easing.back`, `setStatusBarStyle`, `user.update`) plus one paywall test asserting a string that exists nowhere in the repo. Same rule: do not add to it, do not try to fix it.

## File Structure

**Backend** — `backend/services/services/api/src/`
| File | Responsibility |
|---|---|
| `db/schema.ts` (modify, append) | Drizzle definitions for the six tables |
| `communities/communities.module.ts` (create) | Nest module wiring |
| `communities/communities.controller.ts` (create) | Routes, auth, Zod pipes |
| `communities/groups.service.ts` (create) | Group CRUD, membership, join policy |
| `communities/messages.service.ts` (create) | Message send/list/delete + screening |
| `communities/forms.service.ts` (create) | Custom questions + join requests |
| `communities/moderation.service.ts` (create) | Reports, blocks, owner tools |
| `communities/dto/community.dto.ts` (create) | Zod schemas and inferred types |
| `communities/message-screen.ts` (create) | Send-time text screener (pure) |
| `app.module.ts` (modify) | Register `CommunitiesModule` |

Split by responsibility rather than by layer: four services, each small enough to hold in context, sharing one controller and one DTO file.

**Migration** — `supabase/migrations/20260803120000_community_groups.sql`

**Mobile** — `edutumobile/`
| File | Responsibility |
|---|---|
| `packages/core/src/services/communities.ts` (create) | Typed client for every endpoint |
| `packages/core/src/services/communityRealtime.ts` (create) | Channel subscribe/unsubscribe lifecycle |
| `app/(app)/discussions/index.tsx` (create) | Browse: your groups, opportunity rail, discovery, WhatsApp banner |
| `app/(app)/discussions/[id].tsx` (create) | Chat, or the join gate |
| `app/(app)/discussions/new.tsx` (create) | Create-group form |
| `app/(app)/discussions/[id]/settings.tsx` (create) | Owner: details + question builder |
| `app/(app)/discussions/[id]/requests.tsx` (create) | Owner: join-request queue |
| `components/community/GroupRow.tsx` (create) | List-row affordance |
| `components/community/GroupRailCard.tsx` (create) | Opportunity-anchored rail card |
| `components/community/MessageBubble.tsx` (create) | One message + long-press menu |
| `components/community/Composer.tsx` (create) | Input + send + error state |
| `components/community/QuestionBuilder.tsx` (create) | The constrained form builder |
| `components/community/WhatsAppBanner.tsx` (create) | Dismissible channel banner |
| `app/(app)/opportunities/index.tsx:99-107` (modify) | Re-route the `discussion` tile |
| `lib/i18n/locales/*/community.json` (create ×9) | Strings |

---

## Task 1: Migration — the six tables

**Files:**
- Create: `supabase/migrations/20260803120000_community_groups.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: tables `community_groups`, `community_group_members`, `community_group_messages`, `community_join_requests`, `community_group_forms`, `community_reports`.

- [ ] **Step 1: Write the migration**

```sql
-- Group Discussions. See docs/superpowers/specs/2026-08-03-group-discussions-design.md
-- user_id columns hold the RAW Clerk subject (text), never the derived uuid.

create table if not exists community_groups (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  opportunity_id uuid references opportunities(id) on delete set null,
  owner_id text not null,
  visibility text not null default 'public' check (visibility in ('public','private')),
  join_policy text not null default 'open' check (join_policy in ('open','request')),
  cover_emoji text not null default '💬',
  accent text,
  expires_at timestamptz,
  archived_at timestamptz,
  member_count integer not null default 0,
  message_count integer not null default 0,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists community_groups_opportunity_idx on community_groups(opportunity_id);
create index if not exists community_groups_owner_idx on community_groups(owner_id);
create index if not exists community_groups_active_idx on community_groups(archived_at, last_message_at desc);

create table if not exists community_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references community_groups(id) on delete cascade,
  user_id text not null,
  role text not null default 'member' check (role in ('owner','mod','member')),
  status text not null default 'active' check (status in ('active','pending','removed','banned')),
  joined_at timestamptz not null default now(),
  unique (group_id, user_id)
);
create index if not exists community_group_members_user_idx on community_group_members(user_id, status);

create table if not exists community_group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references community_groups(id) on delete cascade,
  user_id text not null,
  body text not null,
  kind text not null default 'text' check (kind in ('text','system','opportunity')),
  opportunity_id uuid references opportunities(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by text
);
create index if not exists community_group_messages_group_idx
  on community_group_messages(group_id, created_at desc);

create table if not exists community_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references community_groups(id) on delete cascade,
  user_id text not null,
  answers jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create table if not exists community_group_forms (
  group_id uuid primary key references community_groups(id) on delete cascade,
  questions jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists community_reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('message','group')),
  target_id uuid not null,
  reporter_id text not null,
  reason text not null,
  status text not null default 'open' check (status in ('open','actioned','dismissed')),
  created_at timestamptz not null default now()
);

alter table community_groups enable row level security;
alter table community_group_members enable row level security;
alter table community_group_messages enable row level security;
alter table community_join_requests enable row level security;
alter table community_group_forms enable row level security;
alter table community_reports enable row level security;

-- Realtime reads. auth.jwt()->>'sub' is the raw Clerk subject, matching user_id.
create policy community_groups_read on community_groups for select to authenticated
  using (
    visibility = 'public'
    or exists (
      select 1 from community_group_members m
      where m.group_id = community_groups.id
        and m.user_id = auth.jwt() ->> 'sub'
        and m.status = 'active'
    )
  );

create policy community_group_members_read on community_group_members for select to authenticated
  using (
    exists (
      select 1 from community_groups g
      where g.id = community_group_members.group_id
        and (g.visibility = 'public' or g.owner_id = auth.jwt() ->> 'sub')
    )
    or user_id = auth.jwt() ->> 'sub'
  );

create policy community_group_messages_read on community_group_messages for select to authenticated
  using (
    exists (
      select 1 from community_group_members m
      where m.group_id = community_group_messages.group_id
        and m.user_id = auth.jwt() ->> 'sub'
        and m.status = 'active'
    )
  );

create policy community_join_requests_read on community_join_requests for select to authenticated
  using (
    user_id = auth.jwt() ->> 'sub'
    or exists (
      select 1 from community_groups g
      where g.id = community_join_requests.group_id
        and g.owner_id = auth.jwt() ->> 'sub'
    )
  );

create policy community_group_forms_read on community_group_forms for select to authenticated
  using (true);

-- community_reports gets NO select policy on purpose: a reporter must not be
-- able to enumerate reports, and members must not see who reported them.
-- The service role bypasses RLS and is the only reader.

alter publication supabase_realtime add table community_group_messages;
```

- [ ] **Step 2: Apply it**

Apply via the Supabase MCP `apply_migration` tool with name `community_groups`, or `supabase db push`.

- [ ] **Step 3: Verify the tables and that reports has no SELECT policy**

Run this SQL:

```sql
select tablename from pg_tables where tablename like 'community_group%' or tablename = 'community_reports';
select tablename, policyname, cmd from pg_policies where tablename like 'community_%';
```

Expected: six tables listed; policies listed for five of them; **zero rows for `community_reports`**.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260803120000_community_groups.sql
git commit -m "feat(communities): group discussions schema, RLS select-only"
```

---

## Task 2: Drizzle schema

**Files:**
- Modify: `backend/services/services/api/src/db/schema.ts` (append at end)

**Interfaces:**
- Consumes: Task 1's tables.
- Produces: `communityGroups`, `communityGroupMembers`, `communityGroupMessages`, `communityJoinRequests`, `communityGroupForms`, `communityReports`, and the inferred types `CommunityGroup`, `CommunityGroupMember`, `CommunityGroupMessage`.

- [ ] **Step 1: Append the definitions**

Follow the existing file's idiom (see `savedSearches` at `db/schema.ts:1487`). Note `userId` is `text`, **not** `uuid`, unlike the tables above it.

```ts
// ── Group Discussions ──────────────────────────────────────────────────────
// user_id columns hold the RAW Clerk subject. Unlike savedSearches above,
// these are `text`, not `uuid` — see clerk-auth.guard.ts:169 for why the two
// representations exist and the plan's Global Constraint 2 for the rule.
export const communityGroups = pgTable(
  "community_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    opportunityId: uuid("opportunity_id"),
    ownerId: text("owner_id").notNull(),
    visibility: text("visibility").default("public").notNull(),
    joinPolicy: text("join_policy").default("open").notNull(),
    coverEmoji: text("cover_emoji").default("💬").notNull(),
    accent: text("accent"),
    expiresAt: timestamp("expires_at"),
    archivedAt: timestamp("archived_at"),
    memberCount: integer("member_count").default(0).notNull(),
    messageCount: integer("message_count").default(0).notNull(),
    lastMessageAt: timestamp("last_message_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("community_groups_opportunity_idx").on(table.opportunityId),
    index("community_groups_owner_idx").on(table.ownerId),
  ],
);

export const communityGroupMembers = pgTable(
  "community_group_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role").default("member").notNull(),
    status: text("status").default("active").notNull(),
    joinedAt: timestamp("joined_at").defaultNow(),
  },
  (table) => [index("community_group_members_user_idx").on(table.userId, table.status)],
);

export const communityGroupMessages = pgTable(
  "community_group_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id").notNull(),
    userId: text("user_id").notNull(),
    body: text("body").notNull(),
    kind: text("kind").default("text").notNull(),
    opportunityId: uuid("opportunity_id"),
    createdAt: timestamp("created_at").defaultNow(),
    deletedAt: timestamp("deleted_at"),
    deletedBy: text("deleted_by"),
  },
  (table) => [index("community_group_messages_group_idx").on(table.groupId, table.createdAt)],
);

export const communityJoinRequests = pgTable("community_join_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id").notNull(),
  userId: text("user_id").notNull(),
  answers: jsonb("answers").default([]).notNull(),
  status: text("status").default("pending").notNull(),
  decidedBy: text("decided_by"),
  decidedAt: timestamp("decided_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const communityGroupForms = pgTable("community_group_forms", {
  groupId: uuid("group_id").primaryKey(),
  questions: jsonb("questions").default([]).notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const communityReports = pgTable("community_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  targetType: text("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  reporterId: text("reporter_id").notNull(),
  reason: text("reason").notNull(),
  status: text("status").default("open").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type CommunityGroup = typeof communityGroups.$inferSelect;
export type CommunityGroupMember = typeof communityGroupMembers.$inferSelect;
export type CommunityGroupMessage = typeof communityGroupMessages.$inferSelect;
```

- [ ] **Step 2: Verify it compiles**

Run from `backend/services/services/api`: `npx tsc --noEmit`
Expected: exit 0. If `jsonb` or `integer` is not already imported at the top of `schema.ts`, add it to the existing `drizzle-orm/pg-core` import.

- [ ] **Step 3: Commit**

```bash
git add backend/services/services/api/src/db/schema.ts
git commit -m "feat(communities): drizzle schema for group discussions"
```

---

## Task 3: DTOs and the message screener

**Files:**
- Create: `backend/services/services/api/src/communities/dto/community.dto.ts`
- Create: `backend/services/services/api/src/communities/message-screen.ts`
- Test: `backend/services/services/api/src/communities/message-screen.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `CreateGroupSchema`, `UpdateGroupSchema`, `SendMessageSchema`, `JoinRequestSchema`, `GroupFormSchema`, `ReportSchema` and their inferred `…Dto` types; `screenMessage(body: string): { allowed: boolean; reason?: string }`.

- [ ] **Step 1: Write the failing screener test**

```ts
import { screenMessage } from "./message-screen";

describe("screenMessage", () => {
  it("allows ordinary group talk", () => {
    expect(screenMessage("Has anyone started the Chevening essay?")).toEqual({
      allowed: true,
    });
  });

  it("blocks a request for an up-front fee, the commonest scam here", () => {
    const result = screenMessage("DM me a $50 processing fee to guarantee your slot");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it("blocks contact-harvesting off-platform", () => {
    expect(screenMessage("send your bank details to my whatsapp +234...").allowed).toBe(false);
  });

  it("does not punish the word 'fee' when it is discussed, not demanded", () => {
    expect(screenMessage("Is there an application fee for this one?").allowed).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run from `backend/services/services/api`: `npm test -- message-screen.spec`
Expected: FAIL, "Cannot find module './message-screen'".

- [ ] **Step 3: Implement the screener**

```ts
/**
 * Send-time text screener for group messages.
 *
 * Deliberately NOT the scraper's scam gate: that one grades metadata which
 * already carries LLM-extracted `red_flags` and cannot screen raw prose. This
 * shares its vocabulary and its two-signal threshold, nothing else.
 *
 * Two independent signals must fire before a message is blocked. One alone is
 * how "Is there an application fee?" gets a legitimate question rejected.
 */
const MONEY_DEMAND =
  /\b(processing|registration|application|admin)\s+fee\b|\bpay(?:ment)?\s+(?:me|us|first|now)\b|\$\s?\d|\bN\d{3,}\b/i;
const URGENCY =
  /\bguarantee(?:d)?\b|\bslot\b|\blimited\b|\bact now\b|\bonly today\b|\bhurry\b/i;
const OFF_PLATFORM =
  /\bwhats\s?app\b|\btelegram\b|\bdm me\b|\bbank (?:details|account)\b|\bbvn\b|\+\d{7,}/i;
const CREDENTIALS = /\bpassword\b|\botp\b|\bpin\b|\bbank (?:details|account)\b|\bbvn\b/i;

export function screenMessage(body: string): { allowed: boolean; reason?: string } {
  const text = (body || "").trim();
  if (!text) return { allowed: false, reason: "empty" };

  const signals = [
    MONEY_DEMAND.test(text),
    URGENCY.test(text),
    OFF_PLATFORM.test(text),
    CREDENTIALS.test(text),
  ].filter(Boolean).length;

  if (signals >= 2) {
    return { allowed: false, reason: "scam_pattern" };
  }
  return { allowed: true };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npm test -- message-screen.spec`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the DTOs**

```ts
import { z } from "zod";

export const CreateGroupSchema = z.object({
  name: z.string().trim().min(3).max(60),
  description: z.string().trim().max(280).optional(),
  opportunityId: z.string().uuid().optional(),
  visibility: z.enum(["public", "private"]).default("public"),
  joinPolicy: z.enum(["open", "request"]).default("open"),
  coverEmoji: z.string().min(1).max(8).default("💬"),
});
export type CreateGroupDto = z.infer<typeof CreateGroupSchema>;

export const UpdateGroupSchema = CreateGroupSchema.partial().omit({
  opportunityId: true,
});
export type UpdateGroupDto = z.infer<typeof UpdateGroupSchema>;

export const SendMessageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  opportunityId: z.string().uuid().optional(),
});
export type SendMessageDto = z.infer<typeof SendMessageSchema>;

// The constrained question set. Max 5, fixed types — a form builder, not a
// form engine, so the builder / renderer / viewer each stay testable.
export const GroupQuestionSchema = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(["short_text", "long_text", "single_select"]),
  label: z.string().trim().min(1).max(60),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(40)).max(6).optional(),
});
export const GroupFormSchema = z.object({
  questions: z.array(GroupQuestionSchema).max(5),
});
export type GroupFormDto = z.infer<typeof GroupFormSchema>;

export const JoinRequestSchema = z.object({
  answers: z
    .array(z.object({ id: z.string(), value: z.string().trim().max(500) }))
    .max(5)
    .default([]),
});
export type JoinRequestDto = z.infer<typeof JoinRequestSchema>;

export const ReportSchema = z.object({
  targetType: z.enum(["message", "group"]),
  targetId: z.string().uuid(),
  reason: z.string().trim().min(3).max(280),
});
export type ReportDto = z.infer<typeof ReportSchema>;
```

- [ ] **Step 6: Verify and commit**

Run: `npx tsc --noEmit` then `npx eslint src/communities --max-warnings 0`
Expected: both exit 0.

```bash
git add backend/services/services/api/src/communities
git commit -m "feat(communities): dtos and the send-time message screener"
```

---

## Task 4: Groups service — create, browse, membership

**Files:**
- Create: `backend/services/services/api/src/communities/groups.service.ts`
- Test: `backend/services/services/api/src/communities/groups.service.spec.ts`

**Interfaces:**
- Consumes: Task 2's tables, Task 3's `CreateGroupDto` / `UpdateGroupDto`.
- Produces: `GroupsService` with `create(userId, dto)`, `list(userId, filter)`, `get(userId, groupId)`, `update(userId, groupId, dto)`, `join(userId, groupId, answers)`, `leave(userId, groupId)`, `removeMember(actorId, groupId, targetId)`, `activeMembership(userId, groupId)`. `MAX_GROUPS_PER_USER = 2`.

- [ ] **Step 1: Write the failing tests**

```ts
import { GroupsService } from "./groups.service";

// The service takes its db as a constructor arg so the spec can hand it a
// fake; this is the pattern the module wires in Task 6.
describe("GroupsService", () => {
  it("refuses a third active group for the same owner", async () => {
    const service = new GroupsService(fakeDb({ ownedActive: 2 }));
    await expect(
      service.create("user_abc", { name: "Third group", visibility: "public", joinPolicy: "open", coverEmoji: "💬" }),
    ).rejects.toThrow(/2 active groups/i);
  });

  it("does not count archived groups against the limit", async () => {
    const service = new GroupsService(fakeDb({ ownedActive: 1, ownedArchived: 5 }));
    await expect(
      service.create("user_abc", { name: "Second group", visibility: "public", joinPolicy: "open", coverEmoji: "💬" }),
    ).resolves.toMatchObject({ name: "Second group" });
  });

  it("makes the creator an active owner in one transaction", async () => {
    const db = fakeDb({ ownedActive: 0 });
    const service = new GroupsService(db);
    const group = await service.create("user_abc", { name: "Chevening 2027", visibility: "public", joinPolicy: "open", coverEmoji: "🎓" });
    expect(db.members).toContainEqual(
      expect.objectContaining({ groupId: group.id, userId: "user_abc", role: "owner", status: "active" }),
    );
  });

  it("puts a joiner in pending when the policy is request", async () => {
    const service = new GroupsService(fakeDb({ group: { id: "g1", joinPolicy: "request" } }));
    const result = await service.join("user_xyz", "g1", []);
    expect(result.status).toBe("pending");
  });

  it("admits a joiner immediately when the policy is open", async () => {
    const service = new GroupsService(fakeDb({ group: { id: "g1", joinPolicy: "open" } }));
    const result = await service.join("user_xyz", "g1", []);
    expect(result.status).toBe("active");
  });

  it("refuses to let a non-owner remove a member", async () => {
    const service = new GroupsService(fakeDb({ group: { id: "g1", ownerId: "user_owner" } }));
    await expect(service.removeMember("user_other", "g1", "user_victim")).rejects.toThrow(/not allowed/i);
  });
});
```

Write `fakeDb` as a small in-memory double at the top of the spec file returning arrays for `groups`, `members`; do not mock Drizzle's builder chain.

- [ ] **Step 2: Run and watch them fail**

Run: `npm test -- groups.service.spec`
Expected: FAIL, "Cannot find module './groups.service'".

- [ ] **Step 3: Implement `GroupsService`**

Key rules the implementation must satisfy, all covered by the tests above:
`MAX_GROUPS_PER_USER = 2` counted over `archivedAt is null` only; creation inserts the group and the owner membership together; `join` branches on `joinPolicy`; `removeMember` requires the actor to be `owner` or `mod`; `slug` is derived from the name plus a 6-char suffix and is retried once on unique violation. `expiresAt` is copied from the linked opportunity's `deadline` when `opportunityId` is present.

**On the mentor raise:** the spec allows 10 groups for a mentor, sourced from
the `creator_applications` / `creator_profiles` pipeline, *and* explicitly
permits a flat 2 for everyone as the fallback. **Ship the flat 2.** No test
above asserts the raise, adding it costs a cross-module join, and it grants
eight extra groups to a population that is currently zero rows
(`creator_profiles` has none). Record it as a follow-up rather than building
it speculatively.

- [ ] **Step 4: Run and watch them pass**

Run: `npm test -- groups.service.spec`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/services/services/api/src/communities/groups.service.ts backend/services/services/api/src/communities/groups.service.spec.ts
git commit -m "feat(communities): groups service with creation limit and join policy"
```

---

## Task 5: Messages service — send, list, soft delete

**Files:**
- Create: `backend/services/services/api/src/communities/messages.service.ts`
- Test: `backend/services/services/api/src/communities/messages.service.spec.ts`

**Interfaces:**
- Consumes: Task 3's `SendMessageDto` and `screenMessage`; Task 2's tables.
- Produces: `MessagesService` with `list(userId, groupId, before?)`, `send(userId, groupId, dto)`, `softDelete(userId, messageId)`.

**Note on the membership check:** `MessagesService` takes the db directly and
runs its own membership query — it does **not** depend on `GroupsService`.
Injecting one service into the other to reuse `activeMembership` creates a
circular import the moment `GroupsService` needs to post a `kind='system'`
message on join. Both services query `community_group_members` directly.

- [ ] **Step 1: Write the failing tests**

```ts
describe("MessagesService", () => {
  it("refuses to list a private group's messages for a non-member", async () => {
    const service = new MessagesService(fakeDb({ membership: null, group: { visibility: "private" } }));
    await expect(service.list("user_stranger", "g1")).rejects.toThrow(/not a member/i);
  });

  it("rejects a screened message with a human reason and writes nothing", async () => {
    const db = fakeDb({ membership: { status: "active" } });
    const service = new MessagesService(db);
    await expect(
      service.send("user_abc", "g1", { body: "pay me a $50 processing fee, slots are limited" }),
    ).rejects.toThrow(/can't be sent/i);
    expect(db.messages).toHaveLength(0);
  });

  it("soft-deletes rather than removing the row, preserving the moderation record", async () => {
    const db = fakeDb({ membership: { status: "active" }, message: { id: "m1", userId: "user_abc" } });
    const service = new MessagesService(db);
    await service.softDelete("user_abc", "m1");
    expect(db.messages.find((m) => m.id === "m1")).toMatchObject({
      deletedAt: expect.anything(),
      deletedBy: "user_abc",
    });
  });

  it("lets a group owner delete someone else's message", async () => {
    const db = fakeDb({ membership: { status: "active", role: "owner" }, message: { id: "m1", userId: "user_other" } });
    await new MessagesService(db).softDelete("user_owner", "m1");
    expect(db.messages[0].deletedBy).toBe("user_owner");
  });

  it("refuses to let an ordinary member delete someone else's message", async () => {
    const db = fakeDb({ membership: { status: "active", role: "member" }, message: { id: "m1", userId: "user_other" } });
    await expect(new MessagesService(db).softDelete("user_member", "m1")).rejects.toThrow(/not allowed/i);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npm test -- messages.service.spec`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `MessagesService`**

`send` screens first and throws `BadRequestException` with a human sentence (Global Constraint 7 / DESIGN.md §4 — never a code), then inserts and bumps `messageCount` / `lastMessageAt` on the group. `list` requires an active membership unless the group is public.

**`softDelete` MUST blank the body**, not merely stamp `deletedAt`:

```ts
.set({ body: "", deletedAt: new Date(), deletedBy: actorId })
```

Found in the Task 1 migration review. The mobile client reads
`community_group_messages` **directly** through Supabase Realtime, so RLS is
the only boundary — there is no server in the read path to filter rows. Leaving
the text in place lets any member (or, in a public group, any signed-in user)
run `select body from community_group_messages where deleted_at is not null`
and read exactly the content a moderator removed. Filtering deleted rows in the
React Native client is cosmetic.

Do **not** "fix" this by adding `and deleted_at is null` to the read policy:
that hides the soft-delete `UPDATE` from Realtime subscribers, so the tombstone
never propagates and the deleted message stays on every open screen until
reload. The row must stay visible; its content must not.

A test asserting the blanked body is required, not optional.

- [ ] **Step 4: Run and watch them pass**

Run: `npm test -- messages.service.spec`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/services/services/api/src/communities/messages.service.ts backend/services/services/api/src/communities/messages.service.spec.ts
git commit -m "feat(communities): message send/list/soft-delete with screening"
```

---

## Task 6: Forms, moderation, controller, module

**Files:**
- Create: `backend/services/services/api/src/communities/forms.service.ts`
- Create: `backend/services/services/api/src/communities/moderation.service.ts`
- Create: `backend/services/services/api/src/communities/communities.controller.ts`
- Create: `backend/services/services/api/src/communities/communities.module.ts`
- Test: `backend/services/services/api/src/communities/communities.controller.spec.ts`
- Modify: `backend/services/services/api/src/app.module.ts`

**Interfaces:**
- Consumes: Tasks 3–5.
- Produces: every route in the spec's §5 table, mounted at `/communities`.

- [ ] **Step 1: Write the failing controller test**

The single most important assertion in this plan — Global Constraint 2:

```ts
import { CommunitiesController } from "./communities.controller";
import { GroupFormSchema } from "./dto/community.dto";

const stub = () => ({}) as never;

describe("CommunitiesController", () => {
  it("keys writes on the RAW Clerk subject, not the derived uuid", async () => {
    const groups = { create: jest.fn().mockResolvedValue({ id: "g1" }) };
    // Constructor order: groups, messages, forms, moderation.
    const controller = new CommunitiesController(
      groups as never,
      stub(),
      stub(),
      stub(),
    );
    // @CurrentUser("authId") supplies payload.sub; @CurrentUser("id") would
    // supply toDatabaseUserId(sub) and write rows no client can read back.
    await controller.createGroup("user_2abcRAWclerksub", { name: "Test", visibility: "public", joinPolicy: "open", coverEmoji: "💬" });
    expect(groups.create).toHaveBeenCalledWith("user_2abcRAWclerksub", expect.anything());
  });

  it("rejects a 6th custom question", async () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ id: `q${i}`, type: "short_text", label: `Q${i}`, required: false }));
    expect(() => GroupFormSchema.parse({ questions: six })).toThrow();
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test -- communities.controller.spec`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the two services, the controller and the module**

**FIRST, extract `src/communities/community-authz.ts`.** Three separate
Criticals in this feature have been "two methods that should agree, disagreeing":
`join` vs `get` on private-group entry (Task 4), and `list` vs `get` on
message-read visibility (Task 5). The second happened in a service written
*after* the first was in its brief, so restating the rule in prose does not
work. Both services now carry near-duplicate `canRead` / `canModerate` logic,
duplicated only because `MessagesService` must not import `GroupsService`
(circular — `GroupsService` posts `kind='system'` messages).

Extract the shared predicates into a dependency-free module both import:
`canReadGroup(group, membership)`, `canModerateGroup(group, membership)`,
`canActivate(group, membership)`. Pure functions over plain rows, no db, no
Nest. Then delete the copies in both services and confirm the existing tests
still pass — if a behaviour changes, the two had already drifted and the diff
tells you which was wrong.

`FormsService`: `getForm(groupId)`, `setForm(actorId, groupId, dto)` (owner only), `listRequests(actorId, groupId)` (owner only), `decide(actorId, requestId, 'approved'|'rejected')` which on approval flips the member row to `active`.

`ModerationService`: `report(userId, dto)` inserts into `community_reports` and notifies the group owner via the existing `NotificationsService`; `block(userId, targetId)` writes to the existing `user_blocks` table.

Controller: every route from the spec's §5 table. **Every handler takes `@CurrentUser("authId")`.** Body validation via `new ZodValidationPipe(Schema)`, matching `saved-searches.controller.ts`.

**Three routes beyond the spec's §5 table**, added by the Task 4 review and
already implemented in `GroupsService` — without them the service has methods
no client can reach, and two user-facing error messages point at nothing:

| Method | Route | Notes |
|---|---|---|
| POST | `/communities/groups/:id/archive` | owner only; **irreversible**, there is deliberately no unarchive |
| PATCH | `/communities/groups/:id/members/:uid/role` | owner only; refuses to leave the group with zero owners |
| POST | `/communities/groups/:id/invite` | owner/mod only; the ONLY entry path into a private group |

`invite` is load-bearing, not a convenience. The Task 4 review found that
`join` let a stranger holding a leaked group id self-join a private group that
`get` refuses to show them, and RLS does not catch it because the backend runs
as `service_role` and bypasses row-level security entirely. The rule is now
that a private group can never be self-joined whatever its `joinPolicy` says;
entry is by owner action. If `invite` has no route, private groups become
unjoinable by anyone, including people the owner wants in.

Module: standard Nest module importing `NotificationsModule`; register in `app.module.ts` alongside `SavedSearchesModule` (`app.module.ts:37` for the import, `:86` for the providers array).

- [ ] **Step 4: Run the whole backend suite**

Run: `npm test -- communities`
Expected: PASS, all specs from Tasks 3–6.

- [ ] **Step 5: Verify the app still boots**

Run: `npm run build && node dist/main.js` — kill after it logs the port. This catches the Nest DI failures that have twice broken this backend on deploy.
Expected: boots and logs a listening port, no `UnknownDependenciesException`.

- [ ] **Step 6: Commit**

```bash
git add backend/services/services/api/src
git commit -m "feat(communities): forms, moderation, controller and module wiring"
```

---

## Task 7: Mobile API client + realtime lifecycle

**Files:**
- Create: `edutumobile/packages/core/src/services/communities.ts`
- Create: `edutumobile/packages/core/src/services/communityRealtime.ts`
- Test: `edutumobile/__tests__/communitiesService.test.ts`

**Interfaces:**
- Consumes: Task 6's routes; the existing `requestProductApi` / `GetAuthToken` from `packages/core/src/services/productApi.ts`.
- Produces: types `CommunityGroup`, `CommunityMessage`, `GroupQuestion`, `JoinRequest`; functions `fetchGroups`, `fetchGroup`, `createGroup`, `updateGroup`, `joinGroup`, `leaveGroup`, `fetchMessages`, `sendMessage`, `deleteMessage`, `fetchGroupForm`, `saveGroupForm`, `fetchJoinRequests`, `decideJoinRequest`, `reportTarget`; and `subscribeToGroupMessages(groupId, onInsert): () => void`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('communities service', () => {
  it('sends the create-group body the backend DTO expects', async () => { /* assert path + method + body */ });
  it('surfaces the screener rejection as a human message, not a status code', async () => { /* 400 → thrown Error with the server sentence */ });
});

describe('subscribeToGroupMessages', () => {
  it('opens exactly one channel and removes it on unsubscribe', () => {
    const unsubscribe = subscribeToGroupMessages('g1', jest.fn());
    expect(mockSupabase.channel).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(mockSupabase.removeChannel).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run from `edutumobile`: `npx jest __tests__/communitiesService.test.ts --maxWorkers=2`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement both files**

`communities.ts` mirrors `packages/core/src/services/savedSearches.ts` exactly in shape — one exported interface per payload, one thin async function per route, all through `requestProductApi`.

`communityRealtime.ts`:

```ts
import { supabase } from '../../../../lib/supabase';
import type { CommunityMessage } from './communities';

/**
 * ONE channel, for the group currently on screen. Never one per joined group:
 * that pattern exhausts Supabase's concurrent-connection budget at roughly 25
 * simultaneous users and drains battery on the mid-range Androids this product
 * targets. Callers subscribe on focus and call the returned unsubscribe on
 * blur — not merely on unmount, or a backgrounded screen keeps its socket.
 */
export function subscribeToGroupMessages(
  groupId: string,
  onInsert: (message: CommunityMessage) => void,
): () => void {
  const channel = supabase
    .channel(`community_group:${groupId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'community_group_messages', filter: `group_id=eq.${groupId}` },
      (payload) => onInsert(payload.new as CommunityMessage),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
```

- [ ] **Step 4: Run and watch them pass**

Run: `npx jest __tests__/communitiesService.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add edutumobile/packages/core/src/services/communities.ts edutumobile/packages/core/src/services/communityRealtime.ts edutumobile/__tests__/communitiesService.test.ts
git commit -m "feat(communities): mobile api client and single-channel realtime"
```

---

## Task 8: Locale namespace

**Files:**
- Create: `edutumobile/lib/i18n/locales/{en,ar,es,fr,ha,hi,pt,sw,zh}/community.json`
- Modify: `edutumobile/lib/i18n/index.ts` (register the `community` namespace)
- Test: `edutumobile/__tests__/communityLocales.test.ts`

**Interfaces:**
- Produces: the `community` i18n namespace, key-identical across nine locales.

- [ ] **Step 1: Write the failing parity test**

```ts
const LANGS = ['en','ar','es','fr','ha','hi','pt','sw','zh'];
function leaves(obj, prefix = '') { /* flatten to dotted paths */ }

it('keeps the community namespace key-identical across all nine locales', () => {
  const base = leaves(require('../lib/i18n/locales/en/community.json'));
  for (const lang of LANGS.filter((l) => l !== 'en')) {
    const cur = leaves(require(`../lib/i18n/locales/${lang}/community.json`));
    expect({ lang, missing: base.filter((k) => !cur.includes(k)) }).toEqual({ lang, missing: [] });
  }
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest __tests__/communityLocales.test.ts --maxWorkers=2`
Expected: FAIL, cannot find `community.json`.

- [ ] **Step 3: Write `en/community.json`, then the eight translations**

Cover at minimum: screen titles, the three form field labels and helper text, join/leave/request actions, the WhatsApp banner, every empty state, every error sentence, the report/block menu, and the no-tolerance notice. Then mirror to the other eight. These files are new, so indentation is yours to set — 2-space throughout.

- [ ] **Step 4: Register the namespace and regenerate**

Add `community` to the namespace list in `lib/i18n/index.ts`, then run `node scripts/gen-i18n-resources.js`.

- [ ] **Step 5: Run and watch it pass, then commit**

Run: `npx jest __tests__/communityLocales.test.ts --maxWorkers=2`
Expected: PASS.

```bash
git add edutumobile/lib/i18n edutumobile/__tests__/communityLocales.test.ts
git commit -m "feat(communities): community i18n namespace across nine locales"
```

---

## Task 9: Browse screen + WhatsApp banner + tile re-route

**Files:**
- Create: `edutumobile/app/(app)/discussions/index.tsx`
- Create: `edutumobile/components/community/GroupRow.tsx`
- Create: `edutumobile/components/community/GroupRailCard.tsx`
- Create: `edutumobile/components/community/WhatsAppBanner.tsx`
- Modify: `edutumobile/app/(app)/opportunities/index.tsx:99-107`
- Test: `edutumobile/__tests__/communityBrowse.test.tsx`

**Interfaces:**
- Consumes: Task 7's `fetchGroups`; Task 8's strings.
- Produces: route `/discussions`.

- [ ] **Step 1: Write the failing tests**

```tsx
it('routes the Discover tile in-app instead of out to WhatsApp', () => {
  const tile = OTHER_FEATURES.find((f) => f.id === 'discussion');
  expect(tile.route).toBe('/discussions');
  expect(tile.external).toBeFalsy();
});

it('renders three distinct affordances, not one card grid', async () => {
  // your groups → rows; opportunity-anchored → rail; discovery → inline section
});

it('shows the WhatsApp banner and remembers dismissal', async () => { /* AsyncStorage key set */ });

it('teaches with an empty state rather than a bare sentence when there are no groups', async () => {
  // EmptyState with icon + one line + one CTA to /discussions/new
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx jest __tests__/communityBrowse.test.tsx --maxWorkers=2`
Expected: FAIL.

- [ ] **Step 3: Implement**

Re-route the tile — delete `external: true` and the `https://whatsapp.com/...` URL, set `route: '/discussions'`.

The screen renders, in order: the WhatsApp banner (dismissible, `AsyncStorage` key `edutu:discussions:waBannerDismissed`), **Your groups** as `GroupRow` list rows, **For opportunities you saved** as a horizontal rail of `GroupRailCard` (deadline colour from the shared `urgencyColor` ramp), and **Discover** as an inline section. Three affordances — DESIGN.md §5.1 bans an identical card grid. Use `EmptyState`, `AnimatedPressable`, `haptics`, `useTheme`. `accessibilityLabel` on every icon-only control.

- [ ] **Step 4: Run and watch them pass, then commit**

Run: `npx jest __tests__/communityBrowse.test.tsx --maxWorkers=2`
Expected: PASS.

```bash
git add edutumobile/app/\(app\)/discussions edutumobile/components/community edutumobile/app/\(app\)/opportunities/index.tsx edutumobile/__tests__/communityBrowse.test.tsx
git commit -m "feat(communities): discussions browse, whatsapp banner, tile re-route"
```

---

## Task 10: Chat screen + join gate

**Files:**
- Create: `edutumobile/app/(app)/discussions/[id].tsx`
- Create: `edutumobile/components/community/MessageBubble.tsx`
- Create: `edutumobile/components/community/Composer.tsx`
- Test: `edutumobile/__tests__/communityChat.test.tsx`

**Interfaces:**
- Consumes: Task 7's `fetchMessages`, `sendMessage`, `subscribeToGroupMessages`, `joinGroup`.
- Produces: route `/discussions/[id]`.

- [ ] **Step 1: Write the failing tests**

```tsx
it('subscribes on focus and unsubscribes on blur, never leaving a socket open', async () => {
  const { unmount } = render(<GroupChatScreen />);
  await waitFor(() => expect(mockSubscribe).toHaveBeenCalledTimes(1));
  fireEvent(screen, 'blur');
  expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
});

it('shows the join gate instead of the composer for a non-member', async () => { /* … */ });

it('shows the request form inline on the join gate for a request-policy group', async () => { /* … */ });

it('surfaces a screened send as a human sentence and keeps the text in the composer', async () => {
  // the user must not lose what they typed
});

it('hides messages from a blocked user', async () => { /* … */ });
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx jest __tests__/communityChat.test.tsx --maxWorkers=2`
Expected: FAIL.

- [ ] **Step 3: Implement**

Use `useFocusEffect` for the subscribe/unsubscribe lifecycle — Global Constraint 5. Optimistic send that rolls back and **retains the composer text** on rejection. `MessageBubble` long-press opens report / block / delete as permissions allow. Skeleton while the first page loads, never a floating spinner (DESIGN.md §2). The join gate is where the join-request form expands inline — the one form that is not its own screen, because it interrupts a browse.

- [ ] **Step 4: Run and watch them pass, then commit**

Run: `npx jest __tests__/communityChat.test.tsx --maxWorkers=2`
Expected: PASS.

```bash
git add edutumobile/app/\(app\)/discussions edutumobile/components/community edutumobile/__tests__/communityChat.test.tsx
git commit -m "feat(communities): group chat with realtime, join gate and inline request form"
```

---

## Task 11: The create form and the question builder

**Files:**
- Create: `edutumobile/app/(app)/discussions/new.tsx`
- Create: `edutumobile/app/(app)/discussions/[id]/settings.tsx`
- Create: `edutumobile/components/community/QuestionBuilder.tsx`
- Test: `edutumobile/__tests__/communityForms.test.tsx`

**Interfaces:**
- Consumes: Task 7's `createGroup`, `updateGroup`, `fetchGroupForm`, `saveGroupForm`.
- Produces: routes `/discussions/new` and `/discussions/[id]/settings`.

- [ ] **Step 1: Write the failing tests**

```tsx
it('creates a group and lands the user in it', async () => { /* push to /discussions/<newId> */ });
it('validates the name inline before enabling submit', async () => { /* 3-char floor */ });
it('prefills and locks the opportunity when opened from an opportunity', async () => { /* … */ });
it('refuses a sixth question and says why', async () => { /* … */ });
it('requires at least two options for a single-select question', async () => { /* … */ });
it('is a screen, not a modal', () => { /* no Modal in the tree — DESIGN.md §5.2 */ });
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx jest __tests__/communityForms.test.tsx --maxWorkers=2`
Expected: FAIL.

- [ ] **Step 3: Implement**

Both are screens. Live inline validation mirroring the Zod DTOs from Task 3 — the client must not be able to submit something the server will reject. The builder caps at 5 questions and disables "add" at the cap with a visible reason rather than a silent no-op.

- [ ] **Step 4: Run and watch them pass, then commit**

Run: `npx jest __tests__/communityForms.test.tsx --maxWorkers=2`
Expected: PASS.

```bash
git add edutumobile/app/\(app\)/discussions edutumobile/components/community/QuestionBuilder.tsx edutumobile/__tests__/communityForms.test.tsx
git commit -m "feat(communities): create-group form and the custom question builder"
```

---

## Task 12: Owner request queue + safety kit

**Files:**
- Create: `edutumobile/app/(app)/discussions/[id]/requests.tsx`
- Modify: `edutumobile/components/community/MessageBubble.tsx` (report/block menu)
- Test: `edutumobile/__tests__/communitySafety.test.tsx`

**Interfaces:**
- Consumes: Task 7's `fetchJoinRequests`, `decideJoinRequest`, `reportTarget`.
- Produces: route `/discussions/[id]/requests`.

- [ ] **Step 1: Write the failing tests**

```tsx
it('shows each requester\'s answers to the group\'s questions', async () => { /* … */ });
it('approving admits the member and removes the row', async () => { /* … */ });
it('hides a reported message from the reporter immediately', async () => {
  // the report has no admin console behind it, so this local effect IS the
  // user-visible outcome — see spec §8
});
it('notifies the group owner when a message is reported', async () => { /* … */ });
it('shows the no-tolerance notice before a first post and only once', async () => { /* … */ });
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx jest __tests__/communitySafety.test.tsx --maxWorkers=2`
Expected: FAIL.

- [ ] **Step 3: Implement**

Report and block from the message long-press and the group header. A report immediately filters that message from the reporter's transcript through the same filter that hides blocked users. First-post notice acknowledged once, persisted in `AsyncStorage`.

- [ ] **Step 4: Run and watch them pass, then commit**

Run: `npx jest __tests__/communitySafety.test.tsx --maxWorkers=2`
Expected: PASS.

```bash
git add edutumobile/app/\(app\)/discussions edutumobile/components/community edutumobile/__tests__/communitySafety.test.tsx
git commit -m "feat(communities): request queue, report, block and first-post notice"
```

---

## Task 13: Opportunity-detail entry point + auto-archive

**Files:**
- Modify: `edutumobile/app/(app)/opportunities/[id].tsx`
- Create: `backend/services/services/api/src/communities/archive.cron.ts`
- Test: `edutumobile/__tests__/mobileOpportunityDetail.test.tsx` (extend)
- Test: `backend/services/services/api/src/communities/archive.cron.spec.ts`

**Interfaces:**
- Consumes: Task 7's `fetchGroups({ opportunityId })`; Task 4's `GroupsService`.
- Produces: nothing downstream.

- [ ] **Step 1: Write the failing tests**

```tsx
// mobile
it('offers the opportunity\'s discussion group, or creating one', async () => { /* … */ });
```

```ts
// backend
it('archives read-only past expiry rather than deleting', async () => {
  await runArchiveSweep(db);
  expect(db.groups[0].archivedAt).toBeTruthy();
  expect(db.groups).toHaveLength(1); // never deleted
});
it('leaves a group with no expiry alone', async () => { /* … */ });
```

- [ ] **Step 2: Run and watch them fail**

Run both suites.
Expected: FAIL.

- [ ] **Step 3: Implement**

The opportunity detail gains one row — not a new card; that screen is already DESIGN.md debt §5.4 (text-dense). A nightly `@Cron` sets `archivedAt` where `expiresAt < now()`; archived groups stay readable and reject new messages.

- [ ] **Step 4: Run and watch them pass, then commit**

```bash
git add backend/services/services/api/src/communities edutumobile/app/\(app\)/opportunities/\[id\].tsx edutumobile/__tests__
git commit -m "feat(communities): opportunity entry point and read-only auto-archive"
```

---

## Task 14: Full-suite verification

**Files:** none.

- [ ] **Step 1: Backend suite**

Run from `backend/services/services/api`: `npm test`
Expected: no new failures against the pre-existing baseline.

- [ ] **Step 2: Boot check**

Run: `npm run build && node dist/main.js`
Expected: listening, no DI errors.

- [ ] **Step 3: Mobile suite**

Run from `edutumobile`: `npx jest --maxWorkers=2`
Expected: **no worse than the recorded baseline of 9 failing suites / 13 failing tests**, all of which are environment/mock failures unrelated to this feature (`requireOptionalNativeModule`, `Easing.back`, `setStatusBarStyle`, `user.update`, and a paywall test asserting a string that exists nowhere in the repo). Any new failure is yours.

- [ ] **Step 4: Gates**

Run: `npx tsc --noEmit` in both projects; `npx eslint <all changed files> --max-warnings 0`.
Expected: exit 0 for each.

- [ ] **Step 5: Locale parity**

Re-run `__tests__/communityLocales.test.ts` and confirm `node scripts/gen-i18n-resources.js` leaves no uncommitted diff.

- [ ] **Step 6: Open the PR**

```bash
gh pr create --base main --title "feat(communities): in-app Group Discussions" --body "..."
```
