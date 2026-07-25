# Edutu Communities — Slice 2: Groups Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Edutu Communities groups end to end — spaces, group create/join, live chat with images, roles, invites, announcements, expiry + auto-archive, realtime reads, notifications and full moderation — on backend, web, mobile and admin, store-shippable on its own.

**Architecture:** All writes go through the NestJS API (`src/communities/`). Clients never write to Postgres: RLS on every `community_*` table grants **SELECT only** and explicitly no INSERT/UPDATE/DELETE to `anon`/`authenticated`. Clients read the message stream live over Supabase Realtime (`postgres_changes` on `community_messages`, one channel for the on-screen group only) and read everything else over HTTP. Permission decisions are made in exactly one server function, `assertGroupPermission(userId, groupId, action)`, built on the pure `groupCan(role, action)` predicate published from `@edutu/core` so web and mobile can grey out controls without ever being trusted.

**Tech Stack:** NestJS 11 + Drizzle ORM 0.45 + Postgres/Supabase (backend) · React 18 + Vite + react-router 6 + Tailwind 3 (web `edutu-web-app`) · Expo Router + React Native (mobile `edutumobile`) · React + Vite (admin `admin`) · `@edutu/core` shared package (React + `@supabase/supabase-js` only) · Jest 30 (backend), Vitest (web/admin), Jest (mobile).

---

## PREREQUISITE — branch from `origin/main`, and re-verify before you start

**Communities work branches from `origin/main`. Do not build on the branch this plan was written
against.**

This plan was drafted while the working tree sat on `feat/ai-copilot-and-fit-fixes`, which is **41
commits behind `origin/main`**. Several findings below came from greps of that tree and were wrong
because of it — most importantly the scam gate, which *does* exist on `origin/main` (see
"Spec contradictions" item 1). Assume any other "X does not exist in the repo" claim in this document
is branch-sensitive until you re-check it.

- [ ] **Step 0.1: Confirm your base contains `origin/main`**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
git fetch origin
git merge-base --is-ancestor origin/main HEAD && echo "BASE OK" || echo "BASE STALE — rebase onto origin/main before starting"
```

Expected: `BASE OK`. If it prints `BASE STALE`, stop and rebase/branch from `origin/main` first.
Everything downstream — the scam gate reuse in Task 7, the `SCAM_GATE_CAP_THRESHOLD` import, and any
interaction with PR#40's shipped features — depends on this.

- [ ] **Step 0.2: Re-verify the branch-sensitive claims this plan makes**

Run each of these against your `origin/main`-based tree and reconcile the plan text if a result
differs. These are the exact greps whose *absence* of a hit drove a design decision:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api/src

# 1. Scam gate — EXPECTED TO EXIST on origin/main. Task 7 imports from here.
grep -n "SCAM_GATE_CAP_THRESHOLD\|isScamGateEnabled\|extractRedFlags\|decideScamGate" \
  scraper/opportunity-dedup.service.ts

# 2. notifications_kind_check current value — Task 1 restates the FULL list; if origin/main
#    already added kinds this plan does not list, add them or the migration silently drops them.
grep -rn "notifications_kind_check" ../supabase/ ../../../../../supabase/ 2>/dev/null
grep -n "kind text not null check" ../supabase/schema.sql

# 3. NotificationKind union + BroadcastNotificationSchema enum — Task 13 extends both.
grep -n "NotificationKind\|\"deadline-reminder\"" notifications/dto/notification.dto.ts

# 4. user_blocks column types — Task 12's toDatabaseUserId boundary assumes uuid.
grep -n -A6 "export const userBlocks" db/schema.ts

# 5. uploads bucket + supported mime types — Task 10 extends UploadsService.
grep -n "BUCKET\|SUPPORTED_UPLOAD_MIME_TYPES" uploads/uploads.service.ts uploads/extract-text.ts

# 6. Does a communities/social module already exist (Slice 1 landed, or someone else got there)?
ls -d communities social 2>/dev/null

# 7. Admin moderation surface — Task 22 assumes none exists.
grep -rn "moderation\|Moderation" ../../../../../admin/src --include="*.tsx" --include="*.ts" | head
```

Record any divergence in the PR description before writing code.

---

## Global Constraints

### Product limits (from spec §2 — enforce server-side)

Active groups owned per user: 2 (mentors/approved creators: 10). Group creation cooldown: 24 h.
New group listed in Spaces after 5 members. Messages: 20/min and 300/hour per user per group.
`@edutu`: 5 per user per group per day, and always subject to the app-wide `@AiMetered` quota.
`@everyone` announcements: 1 per group per day. Brief regeneration: ≥3 new ✦saved messages OR
≥40 new messages, max once per hour per group, only for groups with ≥10 members and ≥25 messages.
Group expiry defaults to the anchored opportunity's deadline + 30 days.

Application status vocabulary is `draft | submitted | offer | rejected | withdrawn | no_response`
in the `opportunity_applications` table. There is **no** `shortlisted` status. Wins come from
`outcome_offer` rows in `user_opportunity_signals`.

> Of these, Slice 2 enforces: owned-group cap, creation cooldown, 5-member listing threshold, message
> rate limits, announcement cap, and default expiry. The `@edutu` and Brief-regeneration limits belong
> to Slice 4 — do not implement them here, but do not contradict them either.

### Non-negotiable repo constraints (each has already caused a production incident)

1. **`notifications_kind_check`** silently rejects unknown `kind` values — inserts fail with no error
   surfaced. Any slice adding a notification kind MUST alter that CHECK constraint in the *same*
   migration, and MUST include a test asserting an insert of each new kind succeeds.
   New kinds: `community-message`, `community-mention`, `community-announcement`, `community-invite`,
   `community-join-request`, `follow`, `note-reply`, `group-expiring`.
2. **Three user-id namespaces.** Use `rawClerkUserId` / `toLegacyUuid` above and nothing else.
   `profiles.userId` is typed `uuid` in Drizzle but the live DB stores raw Clerk subs — verify column
   types against the live DB before writing FKs; do not trust the Drizzle type.
3. **Supabase Realtime channel lifecycle.** Keep callbacks in refs so the subscribe effect depends only
   on `[supabase, groupId]`; remove any pre-existing channel with the same topic via `getChannels()`
   before subscribing; wrap `subscribe()` in try/catch. Otherwise you reproduce the shipped
   "cannot add postgres_changes callbacks ... after subscribe" crash. **One channel for the on-screen
   group only** — never one per joined group.
4. **`admin_settings` writes must satisfy its Zod schema exactly** — a malformed write makes ALL
   settings silently fall back to defaults. Extend the schema in the same change that adds keys.
5. **`npm run build` in `edutu-web-app` wipes `public/sitemap.xml`** — if a slice touches the sitemap,
   account for it.
6. **Never `git stash`** — concurrent sessions share this working tree.
7. Lint is a real gate on all four apps (backend, web, admin, mobile); mobile runs `--max-warnings 0`.
   Mobile is on the React Compiler — no conditional hooks, no mutation of props/state during render.
8. Web theme tokens only: `bg-surface-*`, `text-text-*`, `border-subtle`, `text-brand`. **Never `text-primary`.**
   `index.css` remaps `.bg-white` with `!important` — use `bg-[#ffffff]` if you truly need white.
9. Mobile i18n covers 9 languages (RTL for `ar`); locale JSON files mix 2- and 4-space indentation —
   hand-edit `ar/ha/hi/sw` then regenerate via `gen-i18n-resources.js`. There is no `de` locale (it's `pt`).
10. Backend deploy smoke test is `node dist/main` — a module that only fails at boot (Nest DI, native
    deps) passes tests and breaks production.

### Slice-2 additions to the above

- **Migrations go in root `supabase/migrations/`** using `YYYYMMDDHHMMSS_name.sql`. Do **not** add to
  `edutumobile/supabase/migrations/` (legacy `NNN_` numbering) or
  `backend/services/services/api/supabase/migrations/`.
- **`request.user.id` is NOT the raw Clerk sub.** `ClerkAuthGuard`
  (`backend/services/services/api/src/auth/clerk-auth.guard.ts:159,168`) sets
  `request.user.id = toDatabaseUserId(payload.sub)` (the derived uuid) and
  `request.user.authId = payload.sub` (the raw sub). Every communities controller therefore reads
  `@CurrentUser("authId")` and passes it through `rawClerkUserId(...)`. Reading `@CurrentUser("id")`
  into a `community_*` table is a bug.
- **Lint gates:** backend `cd backend/services/services/api && npm run lint`; web
  `cd edutu-web-app && npm run lint` (`--max-warnings 0`, `no-explicit-any` is a warning → failure);
  admin `cd admin && npm run lint` (`--max-warnings 0`); mobile `cd edutumobile && npm run lint`.
- **No new runtime dependencies** in any of the four apps.

---

## File Structure

### Database

| File | Responsibility |
|---|---|
| `supabase/migrations/20260725130000_communities_groups_core.sql` | 8 `community_*` tables, indexes, seeded spaces, SELECT-only RLS, `notifications_kind_check` widening, realtime publication |
| `backend/services/services/api/src/db/schema.ts` (modify, append) | Drizzle definitions mirroring the migration |

### Backend — `backend/services/services/api/src/communities/`

| File | Responsibility |
|---|---|
| `communities.module.ts` | Nest module wiring; registered in `app.module.ts` |
| `communities.controller.ts` | Every `/communities/*` route from the locked contract |
| `communities.service.ts` | Spaces, groups, membership, join requests |
| `community-messages.service.ts` | List/send/delete messages, reactions, announcements, save-to-brief |
| `community-invites.service.ts` | Token mint/hash/preview/accept/revoke |
| `community-moderation.service.ts` | Reports, blocks, mod actions, admin queue |
| `community-permissions.ts` | `assertGroupPermission` — the single server-side gate |
| `community-limits.ts` | Product limits, admin-settings-backed with constant fallbacks |
| `community-message-safety.ts` | Send-time filters: link safety, abuse, contact harvesting, shadow-hold |
| `community-notifications.service.ts` | Batched per-group notification fan-out |
| `community-expiry.service.ts` | Nightly expiry → system message + `status='archived'` |
| `dto/community.dto.ts` | Zod schemas for every request body |
| `*.spec.ts` | One spec file per unit above |

### Backend — modified files

| File | Change |
|---|---|
| `src/app.module.ts` | Import `CommunitiesModule` |
| `src/db/schema.ts` | Append 8 pgTables |
| `src/settings/settings.dto.ts` | Add `communities` settings group (Zod + defaults + merge) |
| `src/uploads/uploads.service.ts` | Add `createSignedCommunityImageUpload()` + `communityImagePublicUrlPrefix()` |
| `src/uploads/uploads.module.ts` | `exports: [UploadsService]` |
| `src/notifications/dto/notification.dto.ts` | Add the 6 new kinds to `NotificationKind` + `BroadcastNotificationSchema` |
| `src/notifications/notifications.service.ts` | Add the new kinds to `TOPIC_PREFERENCE_BY_KIND` |

### `@edutu/core` (consumed by both apps; directory stays inside `edutumobile`)

> **Settled by Slice 1 — do not "correct" these paths back to a repo-root `packages/`.** Slice 1 adds
> `@edutu/core` to the root `workspaces` array so `edutu-web-app` can consume it, but **the package
> directory stays at `edutumobile/packages/core`**. It is not relocated. Slice 1's reasoning:
> EAS Build only uploads the `edutumobile/` directory unless `edutumobile` is itself a member of a
> root `workspaces` array, and making it one breaks `npm ci` inside `edutumobile` in
> `.github/workflows/ci.yml`, whose `cache-dependency-path` is `edutumobile/package-lock.json`.
> Relocating the directory is explicitly out of scope and recorded as a follow-up.
>
> Every filesystem path below is repo-root-relative, because that is where these commands run.
> Import specifiers (`from '@edutu/core/...'`) are a different thing and stay exactly as written —
> they are identical regardless of where the directory sits. Sanity-check resolution with
> `node -e "console.log(require.resolve('@edutu/core/package.json'))"` from `edutu-web-app` before Task 2.

| File | Responsibility |
|---|---|
| `edutumobile/packages/core/src/communities/permissions.ts` | `GroupRole`, `GroupAction`, `groupCan` |
| `edutumobile/packages/core/src/communities/types.ts` | `CommunitySpace`, `CommunityGroup`, `CommunityMessage`, `GroupMember`, `SendMessageInput` |
| `edutumobile/packages/core/src/communities/api.ts` | HTTP client for every `/communities/*` route |
| `edutumobile/packages/core/src/communities/realtime.ts` | `subscribeToGroupMessages` — the crash-safe channel lifecycle |
| `edutumobile/packages/core/src/communities/useGroupMessages.ts` | Optimistic send with `pending`/`failed` + retry |
| `edutumobile/packages/core/src/communities/useGroups.ts` | Spaces + group lists + one group |
| `edutumobile/packages/core/src/index.ts` (modify) | Re-export the above |

### Web — `edutu-web-app/src/`

| File | Responsibility |
|---|---|
| `components/CommunitiesPage.tsx` | `/communities` — For you · Spaces · Discover |
| `components/CommunitySpacePage.tsx` | `/communities/s/:spaceSlug` |
| `components/CommunityGroupPage.tsx` | `/communities/g/:groupSlug` — chat |
| `components/CommunityInvitePage.tsx` | `/g/:token` — public invite landing |
| `components/community/GroupCard.tsx` | Shared group card |
| `components/community/MessageList.tsx` | Message stream + blocked/deleted collapse |
| `components/community/MessageComposer.tsx` | Text + image composer |
| `components/community/ReportDialog.tsx` | Report any target |
| `services/communities.ts` | Thin wrapper binding `@edutu/core` api to `getProductApiToken` |
| `App.tsx` (modify) | 4 new routes, registered before the `path="*"` catch-all |
| `components/AppWorkspaceShell.tsx` (modify) | Nav entry + `isRouteActive` + `getWorkspaceTitleKey` |
| `i18n/locales/en.json` (modify) | `navigation.communities` / `.space` / `.group` |
| `test/__tests__/communities.test.tsx` | Route + realtime-remount + permission-gating tests |

### Mobile — `edutumobile/`

| File | Responsibility |
|---|---|
| `app/(app)/communities/index.tsx` | Communities home |
| `app/(app)/communities/[groupId].tsx` | Group chat screen |
| `app/g/[token].tsx` | Invite landing (plural form) |
| `app/group/[token].tsx` | Invite landing (singular deep-link form) → redirect |
| `app/groups/[token].tsx` | Invite landing (plural deep-link form) → redirect |
| `components/communities/*` | MessageBubble, Composer, GroupRow, ReportSheet |
| `__tests__/communities.test.ts` | Realtime remount + permission tests |

### Admin — `admin/src/`

| File | Responsibility |
|---|---|
| `pages/Moderation.tsx` | Report queue with SLA countdown + actions |
| `lib/moderationApi.ts` | Types + `backendFetchJson` calls |
| `App.tsx` (modify) | `/app/moderation` route |
| `components/nav-items.tsx` (modify) | Nav leaf under the App group |
| `index.css` (modify) | `.mod-*` classes (never a page-level `<style>` template literal) |

---

## Spec contradictions found in the real codebase — resolutions locked here

Read these before starting; they change what you are asked to build.

1. **The scam gate exists — it just cannot read chat text.** An earlier draft of this plan claimed
   `SCRAPER_SCAM_GATE` did not exist. That was a **stale-branch error**: the grep ran against
   `feat/ai-copilot-and-fit-fixes`, 41 commits behind `origin/main`. On `origin/main` the gate is live
   in `backend/services/services/api/src/scraper/opportunity-dedup.service.ts`, covered by
   `src/scraper/scam-gate.spec.ts` (~230 lines), and exports:

   ```ts
   export function isScamGateEnabled(env: NodeJS.ProcessEnv): boolean;   // reads SCRAPER_SCAM_GATE, default ON
   export function extractRedFlags(metadata: unknown): string[];
   export function decideScamGate(/* … */): { status: string; needsReview: boolean; scamRisk: string | null };
   export const SCAM_GATE_CAP_THRESHOLD = 2;
   ```

   Its semantics, which Slice 2 adopts verbatim: **1 red flag → `metadata.needs_review = true` +
   `metadata.scam_risk`, status unchanged; 2+ red flags (`SCAM_GATE_CAP_THRESHOLD`) → cap `active`
   down to review.**

   **The two gates do different jobs and must not be merged.** The scraper gate grades *stored
   metadata that already carries LLM-extracted `red_flags`* — it reads a verdict someone else computed.
   There is no `red_flags` field on a member's chat message, so it structurally cannot screen raw
   prose. Task 7's `screenMessage` therefore keeps its **own detection logic** for adversarial,
   user-typed text; it is a real screener, not a wrapper over `decideScamGate`.

   What Task 7 borrows is **vocabulary, not implementation**:
   - it imports `SCAM_GATE_CAP_THRESHOLD` and mirrors the 1-flag-review / 2-flag-hold semantics, so
     chat screening and listing screening can never disagree about what "risky" means;
   - it is kill-switched by `COMMUNITY_MESSAGE_GATE` (default ON, fails safe), following the
     `SCRAPER_SCAM_GATE` env-flag convention rather than inventing a new one.

   **The one place the existing gate genuinely applies** is a shared **opportunity card**
   (`kind: 'opportunity'`): Task 7's `screenSharedOpportunity` reads that opportunity's stored
   `metadata.scam_risk` / `metadata.needs_review` through `extractRedFlags` and blocks or warns inline.
   It **reads the stored verdict and never re-runs detection**, so the group card and the admin review
   queue always agree. A listing our own scraper already flagged can never be laundered into a group as
   a clean-looking card. All coupling to the scraper module funnels through one small adapter
   (`toFlags` / `toVerdict`) that fails safe.

   Also reused unchanged: `sanitizeUrl` normalisation semantics from
   `src/scraper/scraper.service.ts:3750` and `isObjectionable()` from `src/common/moderation.ts`.
2. **`announce` for `mod`.** Spec §6.1 lists announcements under `admin`; spec §9 says
   "`@everyone` announcements: admin/mod only". Resolution used here: **mod can announce.** The
   permission table in Task 2 is the single source of truth.
3. **`request.user.id` is the derived uuid, not the raw Clerk sub** (see Global Constraints). The spec
   says community tables hold the raw sub; the guard hands you the uuid by default. Controllers read
   `@CurrentUser("authId")`.
4. **`notifications.user_id` is `uuid`,** and `NotificationsService.resolveRecipients` already calls
   `toDatabaseUserId()` on `targetUserIds`. So community code passes **raw Clerk subs** to
   `notificationsService.broadcast(...)` and the conversion happens there — that call site is the one
   sanctioned legacy boundary, equivalent to `toLegacyUuid`.
5. **`/g/:token` needs no `vercel.json` change.** `edutu-web-app/vercel.json` already rewrites
   everything that is not a static asset to `/index.html`. Rich OG unfurls for invite links are Slice 5.

---

## Task 1: Schema — migration, RLS, notification kinds, Drizzle

**Files:**
- Create: `supabase/migrations/20260725130000_communities_groups_core.sql`
- Create: `backend/services/services/api/src/communities/schema-contract.spec.ts`
- Modify: `backend/services/services/api/src/db/schema.ts` (append at end of file)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: tables `community_spaces`, `community_groups`, `community_group_members`,
  `community_messages`, `community_message_reactions`, `community_invites`,
  `community_join_requests`, `community_reports`; Drizzle exports `communitySpaces`,
  `communityGroups`, `communityGroupMembers`, `communityMessages`, `communityMessageReactions`,
  `communityInvites`, `communityJoinRequests`, `communityReports`.

- [ ] **Step 1: Write the failing migration-contract test**

This test is deterministic and runs in CI without a database. It is the CI-enforceable half of the
RLS proof; Task 1 Step 7 adds the live half.

Create `backend/services/services/api/src/communities/schema-contract.spec.ts`:

```ts
import { readFileSync } from "fs";
import { join } from "path";

const MIGRATION = join(
  __dirname,
  "../../../../../../supabase/migrations/20260725130000_communities_groups_core.sql",
);

const COMMUNITY_TABLES = [
  "community_spaces",
  "community_groups",
  "community_group_members",
  "community_messages",
  "community_message_reactions",
  "community_invites",
  "community_join_requests",
  "community_reports",
];

const NEW_NOTIFICATION_KINDS = [
  "community-message",
  "community-mention",
  "community-announcement",
  "community-invite",
  "community-join-request",
  "group-expiring",
];

describe("communities migration contract", () => {
  const sql = readFileSync(MIGRATION, "utf8").toLowerCase();

  it("creates every community table", () => {
    for (const table of COMMUNITY_TABLES) {
      expect(sql).toContain(`create table if not exists public.${table}`);
    }
  });

  it("enables row level security on every community table", () => {
    for (const table of COMMUNITY_TABLES) {
      expect(sql).toContain(
        `alter table public.${table} enable row level security`,
      );
    }
  });

  it("revokes every write privilege from anon and authenticated", () => {
    for (const table of COMMUNITY_TABLES) {
      for (const role of ["anon", "authenticated"]) {
        expect(sql).toContain(
          `revoke insert, update, delete, truncate on table public.${table} from ${role}`,
        );
      }
    }
  });

  it("declares no insert/update/delete policy for anon or authenticated", () => {
    // Every policy in this file must be `for select`, except service_role's.
    const policyBlocks = sql.split("create policy ").slice(1);
    expect(policyBlocks.length).toBeGreaterThan(0);
    for (const block of policyBlocks) {
      const header = block.slice(0, block.indexOf("using ("));
      const isServiceRole = header.includes("to service_role");
      if (isServiceRole) continue;
      expect(header).toContain("for select");
      expect(header).not.toContain("for insert");
      expect(header).not.toContain("for update");
      expect(header).not.toContain("for delete");
      expect(header).not.toContain("for all");
    }
  });

  it("widens notifications_kind_check with every new community kind", () => {
    expect(sql).toContain("notifications_kind_check");
    for (const kind of NEW_NOTIFICATION_KINDS) {
      expect(sql).toContain(`'${kind}'`);
    }
  });

  it("keeps every pre-existing notification kind in the widened check", () => {
    for (const kind of [
      "goal-reminder",
      "goal-weekly-digest",
      "goal-progress",
      "opportunity-highlight",
      "opportunity-alert",
      "deadline-reminder",
      "admin-broadcast",
      "system",
      "achievement",
    ]) {
      expect(sql).toContain(`'${kind}'`);
    }
  });

  it("seeds spaces from the canonical opportunity categories", () => {
    for (const slug of [
      "scholarships",
      "internships",
      "programs",
      "fellowships",
      "grants",
      "graduate_programs",
      "bootcamps",
      "events",
      "jobs",
      "competitions",
      "other",
    ]) {
      expect(sql).toContain(`'${slug}'`);
    }
  });

  it("adds community_messages to the realtime publication", () => {
    expect(sql).toContain(
      "alter publication supabase_realtime add table public.community_messages",
    );
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/communities/schema-contract.spec.ts
```

Expected: FAIL — `ENOENT: no such file or directory, open '.../supabase/migrations/20260725130000_communities_groups_core.sql'`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260725130000_communities_groups_core.sql`:

```sql
-- Edutu Communities — Slice 2 core schema.
--
-- Every write in this domain goes through the NestJS API on the service-role
-- connection. RLS is therefore SELECT-ONLY: anon/authenticated get read
-- policies and have INSERT/UPDATE/DELETE/TRUNCATE revoked outright. That is
-- deliberate — it removes the single largest historical bug surface in this
-- repo (client writes racing backend writes under three different user-id
-- namespaces).
--
-- USER IDS: every user column here is `text` holding the RAW Clerk sub
-- (matching what profiles.user_id actually stores in the live DB, despite the
-- Drizzle type saying uuid). No safe-uuid variants inside this domain.
-- Conversion to legacy uuid-keyed tables (notifications, user_blocks) happens
-- in exactly one place: NotificationsService.resolveRecipients /
-- toDatabaseUserId, called from the backend.

-- ── Spaces ─────────────────────────────────────────────────────────────────
create table if not exists public.community_spaces (
    id          uuid primary key default gen_random_uuid(),
    slug        text not null unique,
    name        text not null,
    icon        text not null default 'Sparkles',
    sort_order  integer not null default 100,
    is_active   boolean not null default true,
    created_at  timestamptz not null default now()
);

-- Spaces ≡ the canonical opportunity categories (see
-- src/opportunities/opportunity-categorization.ts). 'other' exists so that an
-- uncategorised anchored group still has a valid FK target, but is inactive so
-- it never renders in the Spaces tab.
insert into public.community_spaces (slug, name, icon, sort_order, is_active) values
    ('scholarships',      'Scholarships',      'GraduationCap', 10,  true),
    ('fellowships',       'Fellowships',       'Award',         20,  true),
    ('internships',       'Internships',       'Briefcase',     30,  true),
    ('grants',            'Grants',            'Coins',         40,  true),
    ('programs',          'Programs',          'Route',         50,  true),
    ('graduate_programs', 'Graduate programs', 'BookOpen',      60,  true),
    ('bootcamps',         'Bootcamps',         'Rocket',        70,  true),
    ('competitions',      'Competitions',      'Trophy',        80,  true),
    ('events',            'Events',            'CalendarDays',  90,  true),
    ('jobs',              'Jobs',              'BadgeCheck',    100, true),
    ('other',             'Other',             'Sparkles',      999, false)
on conflict (slug) do nothing;

-- ── Groups ─────────────────────────────────────────────────────────────────
create table if not exists public.community_groups (
    id              uuid primary key default gen_random_uuid(),
    space_id        uuid not null references public.community_spaces(id) on delete restrict,
    slug            text not null unique,
    name            text not null,
    description     text,
    icon_url        text,
    cover_url       text,
    visibility      text not null default 'public'
                        check (visibility in ('public', 'unlisted', 'private')),
    join_policy     text not null default 'open'
                        check (join_policy in ('open', 'request', 'invite')),
    -- Deliberately NOT a foreign key: opportunities rows are churned by the
    -- scraper's retention job, and a cascade there must never delete a group's
    -- conversation. Integrity is enforced in the service on write.
    opportunity_id  uuid,
    rules           text,
    created_by      text not null,
    member_count    integer not null default 0,
    message_count   integer not null default 0,
    last_message_at timestamptz,
    expires_at      timestamptz,
    archived_at     timestamptz,
    status          text not null default 'active'
                        check (status in ('active', 'archived', 'suspended')),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists idx_community_groups_space
    on public.community_groups (space_id, status, member_count desc);
create index if not exists idx_community_groups_opportunity
    on public.community_groups (opportunity_id) where opportunity_id is not null;
create index if not exists idx_community_groups_creator
    on public.community_groups (created_by, created_at desc);
create index if not exists idx_community_groups_expiry
    on public.community_groups (expires_at) where status = 'active' and expires_at is not null;
create index if not exists idx_community_groups_activity
    on public.community_groups (status, last_message_at desc nulls last);

-- ── Members ────────────────────────────────────────────────────────────────
create table if not exists public.community_group_members (
    id            uuid primary key default gen_random_uuid(),
    group_id      uuid not null references public.community_groups(id) on delete cascade,
    user_id       text not null,
    role          text not null default 'member'
                      check (role in ('owner', 'admin', 'mod', 'member')),
    joined_at     timestamptz not null default now(),
    last_read_at  timestamptz,
    muted_until   timestamptz,
    banned_at     timestamptz,
    banned_reason text,
    notify        text not null default 'mentions'
                      check (notify in ('all', 'mentions', 'none'))
);

create unique index if not exists uq_community_group_members_pair
    on public.community_group_members (group_id, user_id);
create index if not exists idx_community_group_members_user
    on public.community_group_members (user_id, joined_at desc);

-- ── Messages ───────────────────────────────────────────────────────────────
create table if not exists public.community_messages (
    id             uuid primary key default gen_random_uuid(),
    group_id       uuid not null references public.community_groups(id) on delete cascade,
    user_id        text not null,
    kind           text not null default 'text'
                       check (kind in ('text', 'image', 'opportunity', 'system', 'announcement', 'ai')),
    body           text,
    attachments    jsonb not null default '[]'::jsonb,
    opportunity_id uuid,
    reply_to_id    uuid references public.community_messages(id) on delete set null,
    saved_to_brief boolean not null default false,
    -- Borderline content shadow-holds instead of hard-blocking a real user
    -- mid-conversation (spec §9.4). Held messages are invisible to everyone
    -- but their author and the moderation queue.
    --
    -- Thresholds mirror the scraper's scam gate exactly (SCAM_GATE_CAP_THRESHOLD):
    --   1 signal  → 'published' + safety_note + a system row in community_reports
    --   2 signals → 'held'
    review_status  text not null default 'published'
                       check (review_status in ('published', 'held', 'removed')),
    -- Human-readable reason a message was flagged or held, and the caution a
    -- shared opportunity card renders inline when Edutu's own scam checks
    -- already flagged that listing. NULL for the overwhelming majority.
    safety_note    text,
    is_deleted     boolean not null default false,
    deleted_by     text,
    deleted_reason text,
    created_at     timestamptz not null default now(),
    edited_at      timestamptz
);

create index if not exists idx_community_messages_group_created
    on public.community_messages (group_id, created_at desc);
create index if not exists idx_community_messages_user_rate
    on public.community_messages (user_id, group_id, created_at desc);
create index if not exists idx_community_messages_held
    on public.community_messages (review_status, created_at desc)
    where review_status = 'held';

-- ── Reactions ──────────────────────────────────────────────────────────────
create table if not exists public.community_message_reactions (
    id         uuid primary key default gen_random_uuid(),
    message_id uuid not null references public.community_messages(id) on delete cascade,
    user_id    text not null,
    emoji      text not null,
    created_at timestamptz not null default now()
);

create unique index if not exists uq_community_message_reactions_triple
    on public.community_message_reactions (message_id, user_id, emoji);
create index if not exists idx_community_message_reactions_message
    on public.community_message_reactions (message_id);

-- ── Invites ────────────────────────────────────────────────────────────────
-- token_hash is HMAC-SHA256(token, API_KEY_PEPPER) — same helper as API keys
-- (src/common/api-key-hash.ts). token_prefix is the first 6 chars of the raw
-- token, stored so admins can identify a link without holding the secret.
create table if not exists public.community_invites (
    id           uuid primary key default gen_random_uuid(),
    group_id     uuid not null references public.community_groups(id) on delete cascade,
    token_hash   text not null unique,
    token_prefix text not null,
    created_by   text not null,
    role_on_join text not null default 'member'
                     check (role_on_join in ('admin', 'mod', 'member')),
    max_uses     integer,
    uses         integer not null default 0,
    expires_at   timestamptz,
    revoked_at   timestamptz,
    created_at   timestamptz not null default now()
);

create index if not exists idx_community_invites_group
    on public.community_invites (group_id, created_at desc);
create index if not exists idx_community_invites_prefix
    on public.community_invites (token_prefix);

-- ── Join requests ──────────────────────────────────────────────────────────
create table if not exists public.community_join_requests (
    id         uuid primary key default gen_random_uuid(),
    group_id   uuid not null references public.community_groups(id) on delete cascade,
    user_id    text not null,
    message    text,
    status     text not null default 'pending'
                   check (status in ('pending', 'approved', 'rejected')),
    decided_by text,
    decided_at timestamptz,
    created_at timestamptz not null default now()
);

create unique index if not exists uq_community_join_requests_pending
    on public.community_join_requests (group_id, user_id) where status = 'pending';
create index if not exists idx_community_join_requests_group
    on public.community_join_requests (group_id, status, created_at desc);

-- ── Reports ────────────────────────────────────────────────────────────────
-- Generalises roadmap_comment_reports to every UGC target in the product.
create table if not exists public.community_reports (
    id               uuid primary key default gen_random_uuid(),
    target_type      text not null
                         check (target_type in ('message', 'group', 'profile', 'note')),
    target_id        text not null,
    group_id         uuid references public.community_groups(id) on delete set null,
    reporter_user_id text not null,
    reason           text not null default 'other'
                         check (reason in ('spam', 'scam', 'harassment', 'hate', 'sexual', 'violence', 'other')),
    detail           text,
    status           text not null default 'open'
                         check (status in ('open', 'reviewed', 'actioned', 'dismissed')),
    resolved_by      text,
    resolved_at      timestamptz,
    action_taken     text,
    created_at       timestamptz not null default now()
);

create index if not exists idx_community_reports_queue
    on public.community_reports (status, created_at asc);
create index if not exists idx_community_reports_target
    on public.community_reports (target_type, target_id);
create unique index if not exists uq_community_reports_reporter_target
    on public.community_reports (reporter_user_id, target_type, target_id);

-- ── RLS: SELECT ONLY ───────────────────────────────────────────────────────
-- Writes are backend-only. Revoke first, then grant select, then add policies.

alter table public.community_spaces            enable row level security;
alter table public.community_groups            enable row level security;
alter table public.community_group_members     enable row level security;
alter table public.community_messages          enable row level security;
alter table public.community_message_reactions enable row level security;
alter table public.community_invites           enable row level security;
alter table public.community_join_requests     enable row level security;
alter table public.community_reports           enable row level security;

revoke insert, update, delete, truncate on table public.community_spaces from anon;
revoke insert, update, delete, truncate on table public.community_spaces from authenticated;
revoke insert, update, delete, truncate on table public.community_groups from anon;
revoke insert, update, delete, truncate on table public.community_groups from authenticated;
revoke insert, update, delete, truncate on table public.community_group_members from anon;
revoke insert, update, delete, truncate on table public.community_group_members from authenticated;
revoke insert, update, delete, truncate on table public.community_messages from anon;
revoke insert, update, delete, truncate on table public.community_messages from authenticated;
revoke insert, update, delete, truncate on table public.community_message_reactions from anon;
revoke insert, update, delete, truncate on table public.community_message_reactions from authenticated;
revoke insert, update, delete, truncate on table public.community_invites from anon;
revoke insert, update, delete, truncate on table public.community_invites from authenticated;
revoke insert, update, delete, truncate on table public.community_join_requests from anon;
revoke insert, update, delete, truncate on table public.community_join_requests from authenticated;
revoke insert, update, delete, truncate on table public.community_reports from anon;
revoke insert, update, delete, truncate on table public.community_reports from authenticated;

grant select on table public.community_spaces            to anon, authenticated;
grant select on table public.community_groups            to anon, authenticated;
grant select on table public.community_group_members     to authenticated;
grant select on table public.community_messages          to authenticated;
grant select on table public.community_message_reactions to authenticated;
grant select on table public.community_join_requests     to authenticated;
grant select on table public.community_reports           to authenticated;
-- community_invites: NO grant at all. token_hash is a secret; the only reader
-- is the backend service role.

grant insert, update, delete, truncate on table public.community_spaces            to service_role;
grant insert, update, delete, truncate on table public.community_groups            to service_role;
grant insert, update, delete, truncate on table public.community_group_members     to service_role;
grant insert, update, delete, truncate on table public.community_messages          to service_role;
grant insert, update, delete, truncate on table public.community_message_reactions to service_role;
grant insert, update, delete, truncate on table public.community_invites           to service_role;
grant insert, update, delete, truncate on table public.community_join_requests     to service_role;
grant insert, update, delete, truncate on table public.community_reports           to service_role;

-- Helper: is the current JWT subject a live (non-banned) member of a group?
-- Wrapped so the policies below stay readable and the planner can inline it.
create or replace function public.community_is_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.community_group_members m
    where m.group_id = p_group_id
      and m.user_id = public.current_app_user_id()
      and m.banned_at is null
  )
$$;

revoke all on function public.community_is_member(uuid) from public;
grant execute on function public.community_is_member(uuid) to authenticated, service_role;

drop policy if exists "community_spaces_select" on public.community_spaces;
create policy "community_spaces_select" on public.community_spaces
  for select to anon, authenticated using (true);

-- Private groups are invisible to non-members. Public + unlisted are readable
-- (unlisted is link-reachable by design; it is just not listed in discovery,
-- which the API enforces, not RLS).
drop policy if exists "community_groups_select" on public.community_groups;
create policy "community_groups_select" on public.community_groups
  for select to anon, authenticated using (
    visibility in ('public', 'unlisted')
    or public.community_is_member(id)
  );

drop policy if exists "community_group_members_select" on public.community_group_members;
create policy "community_group_members_select" on public.community_group_members
  for select to authenticated using (
    user_id = public.current_app_user_id()
    or public.community_is_member(group_id)
  );

-- The realtime read path. Members only; deleted/held rows never stream out
-- (the author sees their own held message through the HTTP API, not realtime).
drop policy if exists "community_messages_select" on public.community_messages;
create policy "community_messages_select" on public.community_messages
  for select to authenticated using (
    public.community_is_member(group_id)
    and is_deleted = false
    and review_status = 'published'
  );

drop policy if exists "community_message_reactions_select" on public.community_message_reactions;
create policy "community_message_reactions_select" on public.community_message_reactions
  for select to authenticated using (
    exists (
      select 1 from public.community_messages msg
      where msg.id = message_id
        and public.community_is_member(msg.group_id)
    )
  );

drop policy if exists "community_join_requests_select" on public.community_join_requests;
create policy "community_join_requests_select" on public.community_join_requests
  for select to authenticated using (
    user_id = public.current_app_user_id()
    or public.community_is_member(group_id)
  );

drop policy if exists "community_reports_select" on public.community_reports;
create policy "community_reports_select" on public.community_reports
  for select to authenticated using (
    reporter_user_id = public.current_app_user_id()
  );

-- community_invites has RLS enabled and NO policy for anon/authenticated at
-- all, so the table is invisible to client keys.
drop policy if exists "community_invites_service_role" on public.community_invites;
create policy "community_invites_service_role" on public.community_invites
  for select to service_role using (true);

-- ── Notification kinds ─────────────────────────────────────────────────────
-- notifications_kind_check silently rejects unknown kinds; every kind ever
-- used must be listed or the insert fails with no error surfaced to the app.
-- This restates the FULL list (existing + new), because a CHECK constraint is
-- replaced, not appended to.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'goal-reminder',
    'goal-weekly-digest',
    'goal-progress',
    'opportunity-highlight',
    'opportunity-alert',
    'deadline-reminder',
    'admin-broadcast',
    'system',
    'achievement',
    'community-message',
    'community-mention',
    'community-announcement',
    'community-invite',
    'community-join-request',
    'follow',
    'note-reply',
    'group-expiring'
  ));

-- ── Realtime ───────────────────────────────────────────────────────────────
-- Only community_messages streams. Everything else is fetched over HTTP, which
-- keeps the per-user connection count at "one channel for the group on screen".
-- Default replica identity (primary key) is enough: clients need INSERT and
-- UPDATE new-tuples; they never need the old tuple.
do $$
begin
  alter publication supabase_realtime add table public.community_messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end
$$;
```

- [ ] **Step 4: Run the contract test to verify it passes**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/communities/schema-contract.spec.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Append the Drizzle definitions**

Append to the end of `backend/services/services/api/src/db/schema.ts`:

```ts
// ───────────────────────────────────────────────────────────────────────────
// Edutu Communities (Slice 2).
//
// Every user column here is `text` holding the RAW Clerk sub — NOT the derived
// uuid used by profiles/goals/notifications. Do not "fix" these to uuid: the
// migration declares them text on purpose (see
// supabase/migrations/20260725130000_communities_groups_core.sql).
// ───────────────────────────────────────────────────────────────────────────

export const communitySpaces = pgTable("community_spaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("Sparkles"),
  sortOrder: integer("sort_order").notNull().default(100),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const communityGroups = pgTable(
  "community_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => communitySpaces.id),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    iconUrl: text("icon_url"),
    coverUrl: text("cover_url"),
    visibility: text("visibility").notNull().default("public"),
    joinPolicy: text("join_policy").notNull().default("open"),
    opportunityId: uuid("opportunity_id"),
    rules: text("rules"),
    createdBy: text("created_by").notNull(),
    memberCount: integer("member_count").notNull().default(0),
    messageCount: integer("message_count").notNull().default(0),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_community_groups_space").on(
      table.spaceId,
      table.status,
      table.memberCount,
    ),
    index("idx_community_groups_creator").on(table.createdBy, table.createdAt),
  ],
);

export const communityGroupMembers = pgTable(
  "community_group_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => communityGroups.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    role: text("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow(),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
    mutedUntil: timestamp("muted_until", { withTimezone: true }),
    bannedAt: timestamp("banned_at", { withTimezone: true }),
    bannedReason: text("banned_reason"),
    notify: text("notify").notNull().default("mentions"),
  },
  (table) => [
    uniqueIndex("uq_community_group_members_pair").on(
      table.groupId,
      table.userId,
    ),
    index("idx_community_group_members_user").on(table.userId, table.joinedAt),
  ],
);

export const communityMessages = pgTable(
  "community_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => communityGroups.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    kind: text("kind").notNull().default("text"),
    body: text("body"),
    attachments: jsonb("attachments")
      .$type<Array<{ url: string; width: number; height: number }>>()
      .notNull()
      .default([]),
    opportunityId: uuid("opportunity_id"),
    replyToId: uuid("reply_to_id"),
    savedToBrief: boolean("saved_to_brief").notNull().default(false),
    reviewStatus: text("review_status").notNull().default("published"),
    safetyNote: text("safety_note"),
    isDeleted: boolean("is_deleted").notNull().default(false),
    deletedBy: text("deleted_by"),
    deletedReason: text("deleted_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_community_messages_group_created").on(
      table.groupId,
      table.createdAt,
    ),
    index("idx_community_messages_user_rate").on(
      table.userId,
      table.groupId,
      table.createdAt,
    ),
  ],
);

export const communityMessageReactions = pgTable(
  "community_message_reactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => communityMessages.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_community_message_reactions_triple").on(
      table.messageId,
      table.userId,
      table.emoji,
    ),
  ],
);

export const communityInvites = pgTable(
  "community_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => communityGroups.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    tokenPrefix: text("token_prefix").notNull(),
    createdBy: text("created_by").notNull(),
    roleOnJoin: text("role_on_join").notNull().default("member"),
    maxUses: integer("max_uses"),
    uses: integer("uses").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_community_invites_group").on(table.groupId, table.createdAt),
    index("idx_community_invites_prefix").on(table.tokenPrefix),
  ],
);

export const communityJoinRequests = pgTable(
  "community_join_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => communityGroups.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    message: text("message"),
    status: text("status").notNull().default("pending"),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_community_join_requests_group").on(
      table.groupId,
      table.status,
      table.createdAt,
    ),
  ],
);

export const communityReports = pgTable(
  "community_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    groupId: uuid("group_id"),
    reporterUserId: text("reporter_user_id").notNull(),
    reason: text("reason").notNull().default("other"),
    detail: text("detail"),
    status: text("status").notNull().default("open"),
    resolvedBy: text("resolved_by"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    actionTaken: text("action_taken"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_community_reports_queue").on(table.status, table.createdAt),
    index("idx_community_reports_target").on(table.targetType, table.targetId),
  ],
);
```

- [ ] **Step 6: Typecheck and lint the schema change**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx tsc --noEmit -p tsconfig.json && npm run lint
```

Expected: no output from `tsc`, `eslint` exits 0.

- [ ] **Step 7: Write the live RLS proof (skips without a database)**

Create `backend/services/services/api/src/communities/rls.live.spec.ts`:

```ts
/**
 * Live RLS proof. Requires a real Supabase project reachable via
 * SUPABASE_URL + SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY with this
 * slice's migration applied. Skipped entirely in CI, where those are absent —
 * the always-on half of the RLS contract lives in schema-contract.spec.ts.
 *
 * Run locally with:
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx jest src/communities/rls.live.spec.ts
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const live = Boolean(url && anonKey && serviceKey);
const describeLive = live ? describe : describe.skip;

describeLive("community_* RLS is SELECT-only", () => {
  const anon = createClient(url as string, anonKey as string, {
    auth: { persistSession: false },
  });
  const admin = createClient(url as string, serviceKey as string, {
    auth: { persistSession: false },
  });

  let spaceId = "";
  let privateGroupId = "";
  let publicGroupId = "";

  beforeAll(async () => {
    const { data: space } = await admin
      .from("community_spaces")
      .select("id")
      .eq("slug", "scholarships")
      .single();
    spaceId = (space as { id: string }).id;

    const { data: groups } = await admin
      .from("community_groups")
      .insert([
        {
          space_id: spaceId,
          slug: `rls-private-${Date.now()}`,
          name: "RLS private",
          visibility: "private",
          join_policy: "invite",
          created_by: "user_rls_owner",
        },
        {
          space_id: spaceId,
          slug: `rls-public-${Date.now()}`,
          name: "RLS public",
          visibility: "public",
          join_policy: "open",
          created_by: "user_rls_owner",
        },
      ])
      .select("id, visibility");
    const rows = (groups ?? []) as Array<{ id: string; visibility: string }>;
    privateGroupId = rows.find((r) => r.visibility === "private")!.id;
    publicGroupId = rows.find((r) => r.visibility === "public")!.id;
  });

  afterAll(async () => {
    await admin
      .from("community_groups")
      .delete()
      .in("id", [privateGroupId, publicGroupId]);
  });

  it("lets an anon client read a public group", async () => {
    const { data, error } = await anon
      .from("community_groups")
      .select("id")
      .eq("id", publicGroupId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("hides a private group from a non-member", async () => {
    const { data, error } = await anon
      .from("community_groups")
      .select("id")
      .eq("id", privateGroupId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it.each([
    "community_spaces",
    "community_groups",
    "community_group_members",
    "community_messages",
    "community_message_reactions",
    "community_invites",
    "community_join_requests",
    "community_reports",
  ])("refuses an INSERT into %s from a client key", async (table) => {
    const { error } = await anon.from(table).insert({ name: "x" });
    expect(error).not.toBeNull();
  });

  it.each([
    "community_groups",
    "community_messages",
    "community_group_members",
  ])("refuses an UPDATE of %s from a client key", async (table) => {
    const { error } = await anon
      .from(table)
      .update({ name: "hacked" })
      .eq("id", publicGroupId);
    expect(error).not.toBeNull();
  });

  it.each(["community_groups", "community_messages"])(
    "refuses a DELETE from %s from a client key",
    async (table) => {
      const { error } = await anon.from(table).delete().eq("id", publicGroupId);
      expect(error).not.toBeNull();
    },
  );

  it("cannot read community_invites at all", async () => {
    const { error } = await anon.from("community_invites").select("id");
    expect(error).not.toBeNull();
  });

  it.each([
    "community-message",
    "community-mention",
    "community-announcement",
    "community-invite",
    "community-join-request",
    "group-expiring",
  ])("accepts an insert of notification kind %s", async (kind) => {
    const { data, error } = await admin
      .from("notifications")
      .insert({
        user_id: "00000000-0000-4000-a000-000000000001",
        kind,
        title: "kind check",
        body: "kind check",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    await admin
      .from("notifications")
      .delete()
      .eq("id", (data as { id: string }).id);
  });
});
```

- [ ] **Step 8: Run the full backend suite**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/communities
```

Expected: `schema-contract.spec.ts` PASS; `rls.live.spec.ts` reported as skipped.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260725130000_communities_groups_core.sql \
        backend/services/services/api/src/db/schema.ts \
        backend/services/services/api/src/communities/schema-contract.spec.ts \
        backend/services/services/api/src/communities/rls.live.spec.ts
git commit -m "feat(communities): core schema with SELECT-only RLS and widened notification kinds"
```

---

## Task 2: `groupCan` — the pure permission predicate in `@edutu/core`

**Files:**
- Create: `edutumobile/packages/core/src/communities/permissions.ts`
- Create: `edutumobile/packages/core/src/communities/permissions.spec.ts`
- Modify: `edutumobile/packages/core/src/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export type GroupRole = 'owner' | 'admin' | 'mod' | 'member';
  export type GroupAction = 'post' | 'react' | 'save' | 'delete_message' | 'mute' | 'ban'
                          | 'edit_group' | 'invite' | 'promote' | 'announce' | 'set_expiry' | 'delete_group';
  export function groupCan(role: GroupRole, action: GroupAction): boolean;
  export const GROUP_ROLES: readonly GroupRole[];
  export const GROUP_ACTIONS: readonly GroupAction[];
  ```

- [ ] **Step 1: Confirm where `@edutu/core` lives**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
node -e "console.log(require.resolve('@edutu/core/package.json'))"
```

Expected: an absolute path. Everything below uses `<CORE>` for the directory containing that
`package.json` (i.e. `edutumobile/packages/core` after Slice 1's workspace promotion). If the command fails,
Slice 1 is not complete — stop and finish it first.

- [ ] **Step 2: Write the failing table-driven test**

Create `<CORE>/src/communities/permissions.spec.ts`:

```ts
import {
  GROUP_ACTIONS,
  GROUP_ROLES,
  groupCan,
  type GroupAction,
  type GroupRole,
} from "./permissions";

// The role matrix from the design spec §6.1, resolved against §9 for
// `announce` (spec §6.1 lists it under admin; spec §9 says "admin/mod only" —
// mod wins, and this table is the single source of truth).
const EXPECTED: Record<GroupAction, GroupRole[]> = {
  post: ["owner", "admin", "mod", "member"],
  react: ["owner", "admin", "mod", "member"],
  save: ["owner", "admin", "mod", "member"],
  delete_message: ["owner", "admin", "mod"],
  mute: ["owner", "admin", "mod"],
  ban: ["owner", "admin"],
  edit_group: ["owner", "admin"],
  invite: ["owner", "admin"],
  promote: ["owner", "admin"],
  announce: ["owner", "admin", "mod"],
  set_expiry: ["owner"],
  delete_group: ["owner"],
};

describe("groupCan", () => {
  it("covers every declared action", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...GROUP_ACTIONS].sort());
  });

  it("covers every declared role", () => {
    expect([...GROUP_ROLES].sort()).toEqual([
      "admin",
      "member",
      "mod",
      "owner",
    ]);
  });

  for (const action of Object.keys(EXPECTED) as GroupAction[]) {
    for (const role of ["owner", "admin", "mod", "member"] as GroupRole[]) {
      const allowed = EXPECTED[action].includes(role);
      it(`${role} ${allowed ? "can" : "cannot"} ${action}`, () => {
        expect(groupCan(role, action)).toBe(allowed);
      });
    }
  }

  it("owner is a strict superset of admin", () => {
    for (const action of GROUP_ACTIONS) {
      if (groupCan("admin", action)) expect(groupCan("owner", action)).toBe(true);
    }
  });

  it("returns false for an unknown role or action", () => {
    expect(groupCan("ghost" as GroupRole, "post")).toBe(false);
    expect(groupCan("owner", "launch_missiles" as GroupAction)).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile
npx jest ../packages/core/src/communities/permissions.spec.ts --maxWorkers=2
```

> If Slice 1 kept the package inside `edutumobile/packages/core`, the path is
> `edutumobile/packages/core/src/communities/permissions.spec.ts` relative to `edutumobile`.

Expected: FAIL — `Cannot find module './permissions'`.

- [ ] **Step 4: Implement the predicate**

Create `<CORE>/src/communities/permissions.ts`:

```ts
/**
 * Group role → action matrix.
 *
 * This is a PURE predicate on (role, action). It knows nothing about group
 * status, bans, mutes or membership — those live server-side in
 * assertGroupPermission(). Clients use it only to grey out controls; the
 * server never trusts a client's answer.
 *
 * Source: design spec §6.1, with `announce` resolved to include `mod` per
 * spec §9 ("@everyone announcements: admin/mod only").
 */

export type GroupRole = "owner" | "admin" | "mod" | "member";

export type GroupAction =
  | "post"
  | "react"
  | "save"
  | "delete_message"
  | "mute"
  | "ban"
  | "edit_group"
  | "invite"
  | "promote"
  | "announce"
  | "set_expiry"
  | "delete_group";

export const GROUP_ROLES: readonly GroupRole[] = [
  "owner",
  "admin",
  "mod",
  "member",
] as const;

export const GROUP_ACTIONS: readonly GroupAction[] = [
  "post",
  "react",
  "save",
  "delete_message",
  "mute",
  "ban",
  "edit_group",
  "invite",
  "promote",
  "announce",
  "set_expiry",
  "delete_group",
] as const;

const MATRIX: Record<GroupRole, ReadonlySet<GroupAction>> = {
  member: new Set<GroupAction>(["post", "react", "save"]),
  mod: new Set<GroupAction>([
    "post",
    "react",
    "save",
    "delete_message",
    "mute",
    "announce",
  ]),
  admin: new Set<GroupAction>([
    "post",
    "react",
    "save",
    "delete_message",
    "mute",
    "announce",
    "ban",
    "edit_group",
    "invite",
    "promote",
  ]),
  owner: new Set<GroupAction>([
    "post",
    "react",
    "save",
    "delete_message",
    "mute",
    "announce",
    "ban",
    "edit_group",
    "invite",
    "promote",
    "set_expiry",
    "delete_group",
  ]),
};

export function groupCan(role: GroupRole, action: GroupAction): boolean {
  return MATRIX[role]?.has(action) ?? false;
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile
npx jest ../packages/core/src/communities/permissions.spec.ts --maxWorkers=2
```

Expected: PASS, 53 tests.

- [ ] **Step 6: Export from the barrel**

Add to `<CORE>/src/index.ts`, after the existing `export * from './services/referrals';` line:

```ts
export * from './communities/permissions';
```

- [ ] **Step 7: Commit**

```bash
git add "<CORE>/src/communities/permissions.ts" \
        "<CORE>/src/communities/permissions.spec.ts" \
        "<CORE>/src/index.ts"
git commit -m "feat(core): publish groupCan role/action matrix for communities"
```

---

## Task 3: `assertGroupPermission` — the single server-side gate

**Files:**
- Create: `backend/services/services/api/src/communities/community-permissions.ts`
- Create: `backend/services/services/api/src/communities/community-permissions.spec.ts`

**Interfaces:**
- Consumes: `groupCan`, `GroupRole`, `GroupAction` (Task 2); `communityGroups`,
  `communityGroupMembers` (Task 1); `rawClerkUserId` (Slice 1).
- Produces:
  ```ts
  export type GroupContext = {
    group: { id: string; slug: string; status: 'active' | 'archived' | 'suspended';
             visibility: 'public' | 'unlisted' | 'private';
             joinPolicy: 'open' | 'request' | 'invite'; name: string;
             spaceId: string; createdBy: string; expiresAt: Date | null };
    role: GroupRole | null;
    mutedUntil: Date | null;
    bannedAt: Date | null;
  };
  export async function loadGroupContext(userId: string, groupId: string): Promise<GroupContext>;
  export async function assertGroupPermission(
    userId: string, groupId: string, action: GroupAction,
  ): Promise<GroupContext>;
  export function evaluateGroupPermission(
    context: GroupContext, action: GroupAction, now?: Date,
  ): { allowed: true } | { allowed: false; reason: PermissionDenialReason };
  export type PermissionDenialReason =
    | 'not_a_member' | 'banned' | 'muted' | 'archived' | 'suspended' | 'role';
  ```

- [ ] **Step 1: Write the failing table-driven test**

Create `backend/services/services/api/src/communities/community-permissions.spec.ts`:

```ts
import {
  evaluateGroupPermission,
  type GroupContext,
} from "./community-permissions";
import type { GroupAction, GroupRole } from "@edutu/core";

const NOW = new Date("2026-07-25T12:00:00.000Z");

function ctx(overrides: Partial<GroupContext> = {}): GroupContext {
  return {
    group: {
      id: "11111111-1111-4111-a111-111111111111",
      slug: "chevening-2027",
      status: "active",
      visibility: "public",
      joinPolicy: "open",
      name: "Chevening 2027",
      spaceId: "22222222-2222-4222-a222-222222222222",
      createdBy: "user_owner",
      expiresAt: null,
      ...(overrides.group ?? {}),
    },
    role: "member",
    mutedUntil: null,
    bannedAt: null,
    ...overrides,
  } as GroupContext;
}

const ALL_ACTIONS: GroupAction[] = [
  "post",
  "react",
  "save",
  "delete_message",
  "mute",
  "ban",
  "edit_group",
  "invite",
  "promote",
  "announce",
  "set_expiry",
  "delete_group",
];

describe("evaluateGroupPermission — role × action (active group)", () => {
  const expected: Record<GroupAction, GroupRole[]> = {
    post: ["owner", "admin", "mod", "member"],
    react: ["owner", "admin", "mod", "member"],
    save: ["owner", "admin", "mod", "member"],
    delete_message: ["owner", "admin", "mod"],
    mute: ["owner", "admin", "mod"],
    ban: ["owner", "admin"],
    edit_group: ["owner", "admin"],
    invite: ["owner", "admin"],
    promote: ["owner", "admin"],
    announce: ["owner", "admin", "mod"],
    set_expiry: ["owner"],
    delete_group: ["owner"],
  };

  for (const action of ALL_ACTIONS) {
    for (const role of ["owner", "admin", "mod", "member"] as GroupRole[]) {
      const allowed = expected[action].includes(role);
      it(`${role} → ${action} = ${allowed}`, () => {
        const result = evaluateGroupPermission(ctx({ role }), action, NOW);
        expect(result.allowed).toBe(allowed);
        if (!allowed && !result.allowed) expect(result.reason).toBe("role");
      });
    }
  }
});

describe("evaluateGroupPermission — group status", () => {
  for (const action of ALL_ACTIONS) {
    it(`owner cannot ${action} in an archived group`, () => {
      const result = evaluateGroupPermission(
        ctx({ role: "owner", group: { ...ctx().group, status: "archived" } }),
        action,
        NOW,
      );
      expect(result).toEqual({ allowed: false, reason: "archived" });
    });

    it(`owner cannot ${action} in a suspended group`, () => {
      const result = evaluateGroupPermission(
        ctx({ role: "owner", group: { ...ctx().group, status: "suspended" } }),
        action,
        NOW,
      );
      expect(result).toEqual({ allowed: false, reason: "suspended" });
    });
  }
});

describe("evaluateGroupPermission — membership state", () => {
  it("denies a non-member every action", () => {
    for (const action of ALL_ACTIONS) {
      expect(evaluateGroupPermission(ctx({ role: null }), action, NOW)).toEqual({
        allowed: false,
        reason: "not_a_member",
      });
    }
  });

  it("denies a banned member every action, ahead of the role check", () => {
    const banned = ctx({ role: "owner", bannedAt: new Date("2026-07-01") });
    expect(evaluateGroupPermission(banned, "post", NOW)).toEqual({
      allowed: false,
      reason: "banned",
    });
    expect(evaluateGroupPermission(banned, "delete_group", NOW)).toEqual({
      allowed: false,
      reason: "banned",
    });
  });

  it("blocks post/react/save while muted but still allows moderation", () => {
    const muted = ctx({ role: "mod", mutedUntil: new Date("2026-07-26") });
    expect(evaluateGroupPermission(muted, "post", NOW)).toEqual({
      allowed: false,
      reason: "muted",
    });
    expect(evaluateGroupPermission(muted, "react", NOW)).toEqual({
      allowed: false,
      reason: "muted",
    });
    expect(evaluateGroupPermission(muted, "delete_message", NOW).allowed).toBe(
      true,
    );
  });

  it("ignores an expired mute", () => {
    const wasMuted = ctx({ role: "member", mutedUntil: new Date("2026-07-24") });
    expect(evaluateGroupPermission(wasMuted, "post", NOW).allowed).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/communities/community-permissions.spec.ts
```

Expected: FAIL — `Cannot find module './community-permissions'`.

- [ ] **Step 3: Implement the guard**

Create `backend/services/services/api/src/communities/community-permissions.ts`:

```ts
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { groupCan, type GroupAction, type GroupRole } from "@edutu/core";
import { db } from "../db";
import { communityGroupMembers, communityGroups } from "../db/schema";

export type PermissionDenialReason =
  | "not_a_member"
  | "banned"
  | "muted"
  | "archived"
  | "suspended"
  | "role";

export type GroupSummary = {
  id: string;
  slug: string;
  name: string;
  spaceId: string;
  status: "active" | "archived" | "suspended";
  visibility: "public" | "unlisted" | "private";
  joinPolicy: "open" | "request" | "invite";
  createdBy: string;
  expiresAt: Date | null;
};

export type GroupContext = {
  group: GroupSummary;
  role: GroupRole | null;
  mutedUntil: Date | null;
  bannedAt: Date | null;
};

/** Actions a muted member loses. Moderation duties survive a mute. */
const MUTED_ACTIONS: ReadonlySet<GroupAction> = new Set([
  "post",
  "react",
  "save",
  "announce",
]);

const DENIAL_MESSAGE: Record<PermissionDenialReason, string> = {
  not_a_member: "Join this group first.",
  banned: "You have been removed from this group.",
  muted: "You are muted in this group.",
  archived: "This group is archived and read-only.",
  suspended: "This group is suspended.",
  role: "You do not have permission to do that in this group.",
};

/**
 * Pure decision function: given a loaded context, may `action` proceed?
 *
 * Order matters and is asserted by the spec file: membership → ban → group
 * status → mute → role. A banned owner of a suspended group must be told
 * "banned", not "suspended" — the more specific fact about *them* comes first,
 * except that group status outranks a mute (an archived group is read-only for
 * everyone regardless of mute state).
 */
export function evaluateGroupPermission(
  context: GroupContext,
  action: GroupAction,
  now: Date = new Date(),
): { allowed: true } | { allowed: false; reason: PermissionDenialReason } {
  if (!context.role) return { allowed: false, reason: "not_a_member" };
  if (context.bannedAt) return { allowed: false, reason: "banned" };

  if (context.group.status === "archived") {
    return { allowed: false, reason: "archived" };
  }
  if (context.group.status === "suspended") {
    return { allowed: false, reason: "suspended" };
  }

  if (
    context.mutedUntil &&
    context.mutedUntil.getTime() > now.getTime() &&
    MUTED_ACTIONS.has(action)
  ) {
    return { allowed: false, reason: "muted" };
  }

  if (!groupCan(context.role, action)) {
    return { allowed: false, reason: "role" };
  }

  return { allowed: true };
}

/**
 * Loads the group plus the caller's membership row in one round trip.
 * `userId` is the RAW Clerk sub — pass `rawClerkUserId(req.user.authId)`.
 */
export async function loadGroupContext(
  userId: string,
  groupId: string,
): Promise<GroupContext> {
  const [group] = await db
    .select({
      id: communityGroups.id,
      slug: communityGroups.slug,
      name: communityGroups.name,
      spaceId: communityGroups.spaceId,
      status: communityGroups.status,
      visibility: communityGroups.visibility,
      joinPolicy: communityGroups.joinPolicy,
      createdBy: communityGroups.createdBy,
      expiresAt: communityGroups.expiresAt,
    })
    .from(communityGroups)
    .where(eq(communityGroups.id, groupId));

  if (!group) throw new NotFoundException("Group not found");

  const [membership] = await db
    .select({
      role: communityGroupMembers.role,
      mutedUntil: communityGroupMembers.mutedUntil,
      bannedAt: communityGroupMembers.bannedAt,
    })
    .from(communityGroupMembers)
    .where(
      and(
        eq(communityGroupMembers.groupId, groupId),
        eq(communityGroupMembers.userId, userId),
      ),
    );

  return {
    group: group as GroupSummary,
    role: (membership?.role as GroupRole | undefined) ?? null,
    mutedUntil: membership?.mutedUntil ?? null,
    bannedAt: membership?.bannedAt ?? null,
  };
}

/**
 * THE gate. Every mutating communities route calls this and nothing else.
 * Never re-implement any part of it in a controller, a client, or an RLS
 * policy (RLS in this domain is SELECT-only by design).
 */
export async function assertGroupPermission(
  userId: string,
  groupId: string,
  action: GroupAction,
): Promise<GroupContext> {
  const context = await loadGroupContext(userId, groupId);
  const verdict = evaluateGroupPermission(context, action);
  if (!verdict.allowed) {
    throw new ForbiddenException(DENIAL_MESSAGE[verdict.reason]);
  }
  return context;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/communities/community-permissions.spec.ts
```

Expected: PASS, 78 tests.

- [ ] **Step 5: Verify `@edutu/core` resolves from the backend**

The backend must be able to import `@edutu/core` for `groupCan`. Check it compiles:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx tsc --noEmit -p tsconfig.json
```

Expected: no output. If it reports `Cannot find module '@edutu/core'`, add the package to the API's
dependencies and a path mapping — edit
`backend/services/services/api/package.json` `dependencies` to add
`"@edutu/core": "*"`, run `npm install` from the repo root, and add to
`backend/services/services/api/tsconfig.json` under `compilerOptions`:

```json
    "paths": {
      "@edutu/core": ["../../../../packages/core/src/index.ts"]
    }
```

and to the `jest` block in `backend/services/services/api/package.json`:

```json
    "moduleNameMapper": {
      "^@edutu/core$": "<rootDir>/../../../../packages/core/src/index.ts"
    }
```

Re-run `npx tsc --noEmit -p tsconfig.json` and the spec until both pass.

- [ ] **Step 6: Commit**

```bash
git add backend/services/services/api/src/communities/community-permissions.ts \
        backend/services/services/api/src/communities/community-permissions.spec.ts \
        backend/services/services/api/package.json \
        backend/services/services/api/tsconfig.json
git commit -m "feat(communities): single server-side assertGroupPermission gate"
```

---

## Task 4: Product limits, admin-settings backed

**Files:**
- Create: `backend/services/services/api/src/communities/community-limits.ts`
- Create: `backend/services/services/api/src/communities/community-limits.spec.ts`
- Modify: `backend/services/services/api/src/settings/settings.dto.ts`

**Interfaces:**
- Consumes: `SettingsService` (`src/settings/settings.service.ts`).
- Produces:
  ```ts
  export const COMMUNITY_LIMIT_DEFAULTS: CommunityLimits;
  export type CommunityLimits = {
    ownedGroupsPerUser: number; ownedGroupsPerMentor: number;
    groupCreationCooldownHours: number; listInSpacesAfterMembers: number;
    messagesPerMinute: number; messagesPerHour: number;
    announcementsPerDay: number; expiryGraceDays: number;
    reportSlaHours: number;
  };
  export function resolveCommunityLimits(settings: unknown): CommunityLimits;
  ```

- [ ] **Step 1: Write the failing test**

Create `backend/services/services/api/src/communities/community-limits.spec.ts`:

```ts
import {
  COMMUNITY_LIMIT_DEFAULTS,
  resolveCommunityLimits,
} from "./community-limits";
import { mergeAdminSettings } from "../settings/settings.dto";

describe("resolveCommunityLimits", () => {
  it("matches the spec defaults", () => {
    expect(COMMUNITY_LIMIT_DEFAULTS).toEqual({
      ownedGroupsPerUser: 2,
      ownedGroupsPerMentor: 10,
      groupCreationCooldownHours: 24,
      listInSpacesAfterMembers: 5,
      messagesPerMinute: 20,
      messagesPerHour: 300,
      announcementsPerDay: 1,
      expiryGraceDays: 30,
      reportSlaHours: 24,
    });
  });

  it("falls back to defaults for unknown input", () => {
    expect(resolveCommunityLimits(null)).toEqual(COMMUNITY_LIMIT_DEFAULTS);
    expect(resolveCommunityLimits({})).toEqual(COMMUNITY_LIMIT_DEFAULTS);
    expect(resolveCommunityLimits({ communities: "nope" })).toEqual(
      COMMUNITY_LIMIT_DEFAULTS,
    );
  });

  it("applies admin overrides field by field", () => {
    const resolved = resolveCommunityLimits({
      communities: { messagesPerMinute: 5, reportSlaHours: 12 },
    });
    expect(resolved.messagesPerMinute).toBe(5);
    expect(resolved.reportSlaHours).toBe(12);
    expect(resolved.messagesPerHour).toBe(
      COMMUNITY_LIMIT_DEFAULTS.messagesPerHour,
    );
  });
});

describe("admin_settings communities group", () => {
  it("survives mergeAdminSettings when absent (settings must not fall back wholesale)", () => {
    const merged = mergeAdminSettings({ platform: { siteName: "Edutu" } });
    expect(merged.communities).toEqual(COMMUNITY_LIMIT_DEFAULTS);
    expect(merged.platform.siteName).toBe("Edutu");
  });

  it("round-trips a stored communities group", () => {
    const merged = mergeAdminSettings({
      communities: { messagesPerMinute: 9 },
    });
    expect(merged.communities.messagesPerMinute).toBe(9);
    expect(merged.communities.announcementsPerDay).toBe(1);
  });

  it("does not throw and wipe all settings on an out-of-range value", () => {
    // A bad write must be clamped or rejected by the field, never make the
    // whole parse throw — that is the documented incident.
    expect(() =>
      mergeAdminSettings({ communities: { messagesPerMinute: 0 } }),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/communities/community-limits.spec.ts
```

Expected: FAIL — `Cannot find module './community-limits'`.

- [ ] **Step 3: Add the settings group**

In `backend/services/services/api/src/settings/settings.dto.ts`, insert this block immediately
before `export const AdminSettingsSchema = z.object({`:

```ts
// Communities product limits (spec §2). Every field is defaulted and range-
// clamped: admin_settings writes must stay inside this schema or
// mergeAdminSettings throws and ALL settings silently fall back to defaults.
const CommunitiesSettingsSchema = z.object({
  ownedGroupsPerUser: z.number().int().min(1).max(50).default(2),
  ownedGroupsPerMentor: z.number().int().min(1).max(200).default(10),
  groupCreationCooldownHours: z.number().int().min(0).max(720).default(24),
  listInSpacesAfterMembers: z.number().int().min(1).max(1000).default(5),
  messagesPerMinute: z.number().int().min(1).max(600).default(20),
  messagesPerHour: z.number().int().min(1).max(10_000).default(300),
  announcementsPerDay: z.number().int().min(0).max(50).default(1),
  expiryGraceDays: z.number().int().min(0).max(365).default(30),
  reportSlaHours: z.number().int().min(1).max(168).default(24),
});
```

In the same file, add to `AdminSettingsSchema`, after the `safety:` line:

```ts
  communities: CommunitiesSettingsSchema.optional(),
```

Add the type export next to the other `export type ... = z.infer<...>` lines:

```ts
export type CommunitiesSettings = z.infer<typeof CommunitiesSettingsSchema>;
```

Add `communities: CommunitiesSettings;` to the `ResolvedAdminSettings` intersection:

```ts
type ResolvedAdminSettings = AdminSettingsDto & {
  mobileApp: MobileAppSettings;
  pricing: PricingSettings;
  paywall: PaywallSettings;
  webContent: WebContentSettings;
  userContent: UserContentSettings;
  safety: SafetySettings;
  communities: CommunitiesSettings;
};
```

Add the defaults to `DEFAULT_ADMIN_SETTINGS`, after the `safety:` entry:

```ts
  // Communities product limits (spec §2).
  communities: {
    ownedGroupsPerUser: 2,
    ownedGroupsPerMentor: 10,
    groupCreationCooldownHours: 24,
    listInSpacesAfterMembers: 5,
    messagesPerMinute: 20,
    messagesPerHour: 300,
    announcementsPerDay: 1,
    expiryGraceDays: 30,
    reportSlaHours: 24,
  },
```

And to `mergeAdminSettings`, after the `safety: {...}` entry:

```ts
    communities: {
      ...DEFAULT_ADMIN_SETTINGS.communities,
      ...(partial.communities ?? {}),
    },
```

- [ ] **Step 4: Implement the resolver**

Create `backend/services/services/api/src/communities/community-limits.ts`:

```ts
import { Injectable } from "@nestjs/common";
import { SettingsService } from "../settings/settings.service";

export type CommunityLimits = {
  ownedGroupsPerUser: number;
  ownedGroupsPerMentor: number;
  groupCreationCooldownHours: number;
  listInSpacesAfterMembers: number;
  messagesPerMinute: number;
  messagesPerHour: number;
  announcementsPerDay: number;
  expiryGraceDays: number;
  reportSlaHours: number;
};

/** Spec §2 "Concrete limits". Admin-tunable; these are the shipped defaults. */
export const COMMUNITY_LIMIT_DEFAULTS: CommunityLimits = {
  ownedGroupsPerUser: 2,
  ownedGroupsPerMentor: 10,
  groupCreationCooldownHours: 24,
  listInSpacesAfterMembers: 5,
  messagesPerMinute: 20,
  messagesPerHour: 300,
  announcementsPerDay: 1,
  expiryGraceDays: 30,
  reportSlaHours: 24,
};

function positiveInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : fallback;
}

export function resolveCommunityLimits(settings: unknown): CommunityLimits {
  const raw =
    settings && typeof settings === "object"
      ? (settings as { communities?: unknown }).communities
      : null;
  if (!raw || typeof raw !== "object") return { ...COMMUNITY_LIMIT_DEFAULTS };

  const source = raw as Partial<Record<keyof CommunityLimits, unknown>>;
  const out = { ...COMMUNITY_LIMIT_DEFAULTS };
  for (const key of Object.keys(out) as Array<keyof CommunityLimits>) {
    out[key] = positiveInt(source[key], COMMUNITY_LIMIT_DEFAULTS[key]);
  }
  return out;
}

/**
 * Cached limits reader. Settings change rarely; re-reading admin_settings on
 * every message send would put a query in the hot path of the chat composer.
 */
@Injectable()
export class CommunityLimitsService {
  private cached: { at: number; value: CommunityLimits } | null = null;
  private readonly ttlMs = 60_000;

  constructor(private readonly settingsService: SettingsService) {}

  async get(): Promise<CommunityLimits> {
    if (this.cached && Date.now() - this.cached.at < this.ttlMs) {
      return this.cached.value;
    }
    try {
      const response = await this.settingsService.getSettings();
      const value = resolveCommunityLimits(response.settings);
      this.cached = { at: Date.now(), value };
      return value;
    } catch {
      // A settings outage must never stop people talking.
      return { ...COMMUNITY_LIMIT_DEFAULTS };
    }
  }
}
```

- [ ] **Step 5: Confirm the `SettingsService.getSettings` signature**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
grep -n "async getSettings" src/settings/settings.service.ts
```

Expected: a method returning `{ success, source, settings }`. If it takes arguments or is named
differently, adjust the call in `CommunityLimitsService.get()` to match — the shape you need is the
merged settings object.

- [ ] **Step 6: Run the tests**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/communities/community-limits.spec.ts src/settings
```

Expected: PASS. `src/settings/settings.dto.spec.ts` must still pass — if it asserts an exact
`DEFAULT_ADMIN_SETTINGS` shape, add `communities` to that expectation.

- [ ] **Step 7: Commit**

```bash
git add backend/services/services/api/src/communities/community-limits.ts \
        backend/services/services/api/src/communities/community-limits.spec.ts \
        backend/services/services/api/src/settings/settings.dto.ts
git commit -m "feat(communities): admin-tunable product limits with safe defaults"
```

---

## Task 5: Module skeleton — spaces, group discovery, create + update

**Files:**
- Create: `backend/services/services/api/src/communities/dto/community.dto.ts`
- Create: `backend/services/services/api/src/communities/communities.service.ts`
- Create: `backend/services/services/api/src/communities/communities.controller.ts`
- Create: `backend/services/services/api/src/communities/communities.module.ts`
- Create: `backend/services/services/api/src/communities/communities.service.spec.ts`
- Modify: `backend/services/services/api/src/app.module.ts`

**Interfaces:**
- Consumes: `assertGroupPermission`, `loadGroupContext` (Task 3); `CommunityLimitsService` (Task 4);
  `rawClerkUserId` (Slice 1); Drizzle tables (Task 1).
- Produces:
  ```ts
  export class CommunitiesService {
    listSpaces(): Promise<CommunitySpaceDto[]>;
    listGroups(userId: string, query: ListGroupsDto): Promise<CommunityGroupDto[]>;
    getGroup(userId: string, groupId: string): Promise<CommunityGroupDto>;
    createGroup(userId: string, dto: CreateGroupDto): Promise<CommunityGroupDto>;
    updateGroup(userId: string, groupId: string, dto: UpdateGroupDto): Promise<CommunityGroupDto>;
    toGroupDto(row, role): CommunityGroupDto;
  }
  export function slugifyGroupName(name: string, suffix: string): string;
  ```
  `CommunityGroupDto` matches `CommunityGroup` in `@edutu/core` field for field.

- [ ] **Step 1: Write the failing test**

Create `backend/services/services/api/src/communities/communities.service.spec.ts`:

```ts
import { slugifyGroupName, defaultExpiryFromDeadline } from "./communities.service";

describe("slugifyGroupName", () => {
  it("lowercases, strips punctuation and joins with hyphens", () => {
    expect(slugifyGroupName("Chevening 2027 — UK!", "ab12")).toBe(
      "chevening-2027-uk-ab12",
    );
  });

  it("collapses runs of separators", () => {
    expect(slugifyGroupName("A   B___C", "zz99")).toBe("a-b-c-zz99");
  });

  it("caps the readable part at 48 characters", () => {
    const long = "x".repeat(120);
    const slug = slugifyGroupName(long, "abcd");
    expect(slug.length).toBe(53); // 48 + '-' + 4
    expect(slug.endsWith("-abcd")).toBe(true);
  });

  it("never produces an empty readable part", () => {
    expect(slugifyGroupName("!!!", "q1w2")).toBe("group-q1w2");
  });
});

describe("defaultExpiryFromDeadline", () => {
  it("adds the grace period to the anchored deadline", () => {
    const expiry = defaultExpiryFromDeadline(
      new Date("2026-11-01T00:00:00.000Z"),
      30,
    );
    expect(expiry?.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });

  it("returns null for a standalone group with no anchor", () => {
    expect(defaultExpiryFromDeadline(null, 30)).toBeNull();
  });

  it("returns null for an unparseable deadline", () => {
    expect(defaultExpiryFromDeadline(new Date("nope"), 30)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/communities/communities.service.spec.ts
```

Expected: FAIL — `Cannot find module './communities.service'`.

- [ ] **Step 3: Write the DTOs**

Create `backend/services/services/api/src/communities/dto/community.dto.ts`:

```ts
import { z } from "zod";

export const ListGroupsQuerySchema = z.object({
  space: z.string().trim().max(60).optional(),
  anchor: z.string().uuid().optional(),
  q: z.string().trim().max(120).optional(),
  scope: z.enum(["discover", "mine"]).default("discover"),
  limit: z.coerce.number().int().min(1).max(60).default(24),
  offset: z.coerce.number().int().min(0).max(2000).default(0),
});
export type ListGroupsQueryDto = z.infer<typeof ListGroupsQuerySchema>;

export const CreateGroupSchema = z.object({
  name: z.string().trim().min(3).max(80),
  spaceSlug: z.string().trim().min(1).max(60),
  description: z.string().trim().max(500).optional(),
  rules: z.string().trim().max(2000).optional(),
  visibility: z.enum(["public", "unlisted", "private"]).default("public"),
  joinPolicy: z.enum(["open", "request", "invite"]).default("open"),
  opportunityId: z.string().uuid().optional(),
  iconUrl: z.string().trim().max(1000).optional(),
  expiresAt: z.string().datetime().optional(),
});
export type CreateGroupDto = z.infer<typeof CreateGroupSchema>;

export const UpdateGroupSchema = z.object({
  name: z.string().trim().min(3).max(80).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  rules: z.string().trim().max(2000).nullable().optional(),
  iconUrl: z.string().trim().max(1000).nullable().optional(),
  visibility: z.enum(["public", "unlisted", "private"]).optional(),
  joinPolicy: z.enum(["open", "request", "invite"]).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});
export type UpdateGroupDto = z.infer<typeof UpdateGroupSchema>;

export const JoinGroupSchema = z.object({
  message: z.string().trim().max(300).optional(),
});
export type JoinGroupDto = z.infer<typeof JoinGroupSchema>;

export const UpdateMemberSchema = z.object({
  role: z.enum(["admin", "mod", "member"]).optional(),
  muteMinutes: z.number().int().min(0).max(43_200).optional(),
  ban: z.boolean().optional(),
  banReason: z.string().trim().max(300).optional(),
  remove: z.boolean().optional(),
  decideJoinRequest: z.enum(["approved", "rejected"]).optional(),
});
export type UpdateMemberDto = z.infer<typeof UpdateMemberSchema>;

export const SendMessageSchema = z
  .object({
    body: z.string().trim().max(4000).optional(),
    kind: z.enum(["text", "image", "opportunity"]).default("text"),
    attachments: z
      .array(
        z.object({
          url: z.string().trim().min(1).max(1000),
          width: z.number().int().min(1).max(20_000),
          height: z.number().int().min(1).max(20_000),
        }),
      )
      .max(4)
      .default([]),
    opportunityId: z.string().uuid().optional(),
    replyToId: z.string().uuid().optional(),
    clientId: z.string().trim().max(64).optional(),
  })
  .refine(
    (dto) =>
      Boolean(dto.body?.trim()) ||
      dto.attachments.length > 0 ||
      Boolean(dto.opportunityId),
    { message: "A message needs text, an image, or an opportunity" },
  );
export type SendMessageDto = z.infer<typeof SendMessageSchema>;

export const ListMessagesQuerySchema = z.object({
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(80).default(40),
});
export type ListMessagesQueryDto = z.infer<typeof ListMessagesQuerySchema>;

export const ReactionSchema = z.object({
  emoji: z.string().trim().min(1).max(8),
});
export type ReactionDto = z.infer<typeof ReactionSchema>;

export const AnnouncementSchema = z.object({
  body: z.string().trim().min(1).max(1000),
});
export type AnnouncementDto = z.infer<typeof AnnouncementSchema>;

export const CreateInviteSchema = z.object({
  roleOnJoin: z.enum(["admin", "mod", "member"]).default("member"),
  maxUses: z.number().int().min(1).max(10_000).nullable().optional(),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
});
export type CreateInviteDto = z.infer<typeof CreateInviteSchema>;

export const CreateReportSchema = z.object({
  targetType: z.enum(["message", "group", "profile", "note"]),
  targetId: z.string().trim().min(1).max(200),
  groupId: z.string().uuid().optional(),
  reason: z
    .enum(["spam", "scam", "harassment", "hate", "sexual", "violence", "other"])
    .default("other"),
  detail: z.string().trim().max(1000).optional(),
  blockAuthor: z.boolean().optional(),
});
export type CreateReportDto = z.infer<typeof CreateReportSchema>;

export const CreateImageUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(160),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});
export type CreateImageUploadDto = z.infer<typeof CreateImageUploadSchema>;
```

- [ ] **Step 4: Write the service**

Create `backend/services/services/api/src/communities/communities.service.ts`:

```ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "crypto";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { GroupRole } from "@edutu/core";
import { db } from "../db";
import {
  communityGroupMembers,
  communityGroups,
  communitySpaces,
  profiles,
} from "../db/schema";
import { CommunityLimitsService } from "./community-limits";
import {
  assertGroupPermission,
  loadGroupContext,
  type GroupSummary,
} from "./community-permissions";
import type {
  CreateGroupDto,
  ListGroupsQueryDto,
  UpdateGroupDto,
} from "./dto/community.dto";

export type CommunitySpaceDto = {
  id: string;
  slug: string;
  name: string;
  icon: string;
  sortOrder: number;
  groupCount: number;
};

export type CommunityGroupDto = {
  id: string;
  slug: string;
  spaceId: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  visibility: "public" | "unlisted" | "private";
  joinPolicy: "open" | "request" | "invite";
  opportunityId: string | null;
  memberCount: number;
  lastMessageAt: string | null;
  expiresAt: string | null;
  status: "active" | "archived" | "suspended";
  myRole: GroupRole | null;
};

/**
 * URL-safe slug plus a random suffix. The suffix is what makes the slug
 * globally unique without a retry loop, and it keeps two "Chevening 2027"
 * groups from fighting over the same URL.
 */
export function slugifyGroupName(name: string, suffix: string): string {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      .replace(/-+$/g, "") || "group";
  return `${base}-${suffix}`;
}

/** Spec §6.3: expiry defaults to the anchored deadline + grace days. */
export function defaultExpiryFromDeadline(
  deadline: Date | null,
  graceDays: number,
): Date | null {
  if (!deadline || Number.isNaN(deadline.getTime())) return null;
  const expiry = new Date(deadline.getTime());
  expiry.setUTCDate(expiry.getUTCDate() + graceDays);
  return expiry;
}

@Injectable()
export class CommunitiesService {
  constructor(private readonly limits: CommunityLimitsService) {}

  async listSpaces(): Promise<CommunitySpaceDto[]> {
    const rows = await db.execute(sql`
      select s.id, s.slug, s.name, s.icon, s.sort_order,
             count(g.id) filter (
               where g.status = 'active' and g.visibility = 'public'
             )::int as group_count
      from public.community_spaces s
      left join public.community_groups g on g.space_id = s.id
      where s.is_active = true
      group by s.id
      order by s.sort_order asc, s.name asc
    `);
    return this.rows<{
      id: string;
      slug: string;
      name: string;
      icon: string;
      sort_order: number;
      group_count: number;
    }>(rows).map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      icon: row.icon,
      sortOrder: row.sort_order,
      groupCount: row.group_count,
    }));
  }

  /**
   * Discovery. Two scopes:
   *  - `mine`     → every group the caller belongs to, newest activity first.
   *  - `discover` → public groups only, and only once they clear the
   *                 listInSpacesAfterMembers threshold (spec §2). Below that a
   *                 group is link-reachable but unlisted, which is the main
   *                 brake on moderation inflow.
   */
  async listGroups(
    userId: string,
    query: ListGroupsQueryDto,
  ): Promise<CommunityGroupDto[]> {
    const limits = await this.limits.get();

    if (query.scope === "mine") {
      const rows = await db
        .select({
          group: communityGroups,
          role: communityGroupMembers.role,
        })
        .from(communityGroupMembers)
        .innerJoin(
          communityGroups,
          eq(communityGroups.id, communityGroupMembers.groupId),
        )
        .where(
          and(
            eq(communityGroupMembers.userId, userId),
            sql`${communityGroupMembers.bannedAt} is null`,
          ),
        )
        .orderBy(desc(communityGroups.lastMessageAt))
        .limit(query.limit)
        .offset(query.offset);

      return rows.map((row) =>
        this.toGroupDto(row.group, row.role as GroupRole),
      );
    }

    const conditions = [
      eq(communityGroups.status, "active"),
      eq(communityGroups.visibility, "public"),
      sql`${communityGroups.memberCount} >= ${limits.listInSpacesAfterMembers}`,
    ];

    if (query.space) {
      const [space] = await db
        .select({ id: communitySpaces.id })
        .from(communitySpaces)
        .where(eq(communitySpaces.slug, query.space));
      if (!space) return [];
      conditions.push(eq(communityGroups.spaceId, space.id));
    }
    if (query.anchor) {
      conditions.push(eq(communityGroups.opportunityId, query.anchor));
    }
    if (query.q) {
      conditions.push(ilike(communityGroups.name, `%${query.q}%`));
    }

    const rows = await db
      .select()
      .from(communityGroups)
      .where(and(...conditions))
      .orderBy(desc(communityGroups.lastMessageAt), desc(communityGroups.memberCount))
      .limit(query.limit)
      .offset(query.offset);

    const roles = await this.rolesFor(userId, rows.map((row) => row.id));
    return rows.map((row) => this.toGroupDto(row, roles.get(row.id) ?? null));
  }

  async getGroup(userId: string, groupId: string): Promise<CommunityGroupDto> {
    const context = await loadGroupContext(userId, groupId);
    if (context.group.visibility === "private" && !context.role) {
      // Do not leak the existence of a private group.
      throw new NotFoundException("Group not found");
    }
    const [row] = await db
      .select()
      .from(communityGroups)
      .where(eq(communityGroups.id, groupId));
    return this.toGroupDto(row, context.role);
  }

  /** Slug lookup used by the web routes (/communities/g/:groupSlug). */
  async getGroupBySlug(
    userId: string,
    slug: string,
  ): Promise<CommunityGroupDto> {
    const [row] = await db
      .select({ id: communityGroups.id })
      .from(communityGroups)
      .where(eq(communityGroups.slug, slug));
    if (!row) throw new NotFoundException("Group not found");
    return this.getGroup(userId, row.id);
  }

  async createGroup(
    userId: string,
    dto: CreateGroupDto,
  ): Promise<CommunityGroupDto> {
    const limits = await this.limits.get();

    const [space] = await db
      .select({ id: communitySpaces.id })
      .from(communitySpaces)
      .where(eq(communitySpaces.slug, dto.spaceSlug));
    if (!space) throw new BadRequestException("Unknown space");

    await this.assertCanCreateGroup(userId, limits);

    let expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (!expiresAt && dto.opportunityId) {
      const anchor = await db.execute(sql`
        select coalesce(close_date, deadline) as deadline
        from public.opportunities
        where id = ${dto.opportunityId}::uuid
      `);
      const deadline = this.rows<{ deadline: string | null }>(anchor)[0]
        ?.deadline;
      expiresAt = defaultExpiryFromDeadline(
        deadline ? new Date(deadline) : null,
        limits.expiryGraceDays,
      );
    }

    const slug = slugifyGroupName(dto.name, randomBytes(3).toString("hex"));

    const [group] = await db
      .insert(communityGroups)
      .values({
        spaceId: space.id,
        slug,
        name: dto.name,
        description: dto.description ?? null,
        rules: dto.rules ?? null,
        iconUrl: dto.iconUrl ?? null,
        visibility: dto.visibility,
        joinPolicy: dto.joinPolicy,
        opportunityId: dto.opportunityId ?? null,
        createdBy: userId,
        memberCount: 1,
        expiresAt,
      })
      .returning();

    await db.insert(communityGroupMembers).values({
      groupId: group.id,
      userId,
      role: "owner",
      notify: "all",
    });

    return this.toGroupDto(group, "owner");
  }

  async updateGroup(
    userId: string,
    groupId: string,
    dto: UpdateGroupDto,
  ): Promise<CommunityGroupDto> {
    // `expiresAt` is owner-only (spec §6.1 `set_expiry`); everything else is
    // admin-and-up. Check the narrower permission first so an admin editing
    // only the description is not blocked.
    if (dto.expiresAt !== undefined) {
      await assertGroupPermission(userId, groupId, "set_expiry");
    }
    const context = await assertGroupPermission(userId, groupId, "edit_group");

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.rules !== undefined) patch.rules = dto.rules;
    if (dto.iconUrl !== undefined) patch.iconUrl = dto.iconUrl;
    if (dto.visibility !== undefined) patch.visibility = dto.visibility;
    if (dto.joinPolicy !== undefined) patch.joinPolicy = dto.joinPolicy;
    if (dto.expiresAt !== undefined) {
      patch.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    }

    const [updated] = await db
      .update(communityGroups)
      .set(patch)
      .where(eq(communityGroups.id, groupId))
      .returning();

    return this.toGroupDto(updated, context.role);
  }

  /**
   * Spec §2: 2 active owned groups (10 for mentors/approved creators) and a
   * 24 h cooldown. Enforced here, server-side, never in the client.
   */
  private async assertCanCreateGroup(
    userId: string,
    limits: { ownedGroupsPerUser: number; ownedGroupsPerMentor: number; groupCreationCooldownHours: number },
  ) {
    const [privileged] = await db
      .select({
        mentorStatus: profiles.mentorStatus,
        creatorStatus: profiles.creatorStatus,
      })
      .from(profiles)
      .where(sql`${profiles.userId}::text = ${userId}`);

    const cap =
      privileged?.mentorStatus === "approved" ||
      privileged?.creatorStatus === "approved"
        ? limits.ownedGroupsPerMentor
        : limits.ownedGroupsPerUser;

    const owned = await db.execute(sql`
      select count(*)::int as active,
             max(created_at) as last_created
      from public.community_groups
      where created_by = ${userId} and status = 'active'
    `);
    const stats = this.rows<{ active: number; last_created: string | null }>(
      owned,
    )[0];

    if ((stats?.active ?? 0) >= cap) {
      throw new ForbiddenException(
        `You can own ${cap} active group${cap === 1 ? "" : "s"} at a time. Archive one to create another.`,
      );
    }

    if (stats?.last_created) {
      const elapsedHours =
        (Date.now() - new Date(stats.last_created).getTime()) / 3_600_000;
      if (elapsedHours < limits.groupCreationCooldownHours) {
        const wait = Math.ceil(limits.groupCreationCooldownHours - elapsedHours);
        throw new ForbiddenException(
          `You can create another group in ${wait} hour${wait === 1 ? "" : "s"}.`,
        );
      }
    }
  }

  async rolesFor(
    userId: string,
    groupIds: string[],
  ): Promise<Map<string, GroupRole>> {
    const map = new Map<string, GroupRole>();
    if (!groupIds.length) return map;
    const rows = await db
      .select({
        groupId: communityGroupMembers.groupId,
        role: communityGroupMembers.role,
      })
      .from(communityGroupMembers)
      .where(
        and(
          eq(communityGroupMembers.userId, userId),
          inArray(communityGroupMembers.groupId, groupIds),
          sql`${communityGroupMembers.bannedAt} is null`,
        ),
      );
    for (const row of rows) map.set(row.groupId, row.role as GroupRole);
    return map;
  }

  toGroupDto(
    row: typeof communityGroups.$inferSelect | GroupSummary,
    role: GroupRole | null,
  ): CommunityGroupDto {
    const full = row as typeof communityGroups.$inferSelect;
    return {
      id: full.id,
      slug: full.slug,
      spaceId: full.spaceId,
      name: full.name,
      description: full.description ?? null,
      iconUrl: full.iconUrl ?? null,
      visibility: full.visibility as CommunityGroupDto["visibility"],
      joinPolicy: full.joinPolicy as CommunityGroupDto["joinPolicy"],
      opportunityId: full.opportunityId ?? null,
      memberCount: full.memberCount ?? 0,
      lastMessageAt: full.lastMessageAt
        ? new Date(full.lastMessageAt).toISOString()
        : null,
      expiresAt: full.expiresAt ? new Date(full.expiresAt).toISOString() : null,
      status: full.status as CommunityGroupDto["status"],
      myRole: role,
    };
  }

  protected rows<T>(result: unknown): T[] {
    if (Array.isArray(result)) return result as T[];
    return (result as { rows?: T[] }).rows ?? [];
  }
}
```

> `asc` and `or` are imported above for use by later tasks in this file; if the linter flags them as
> unused at this point, remove them from the import and re-add when Task 6 needs them.

- [ ] **Step 5: Write the controller and module**

Create `backend/services/services/api/src/communities/communities.controller.ts`:

```ts
import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { rawClerkUserId } from "../common/community-user-id";
import { CurrentUser } from "../auth";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CommunitiesService } from "./communities.service";
import {
  CreateGroupSchema,
  ListGroupsQuerySchema,
  UpdateGroupSchema,
  type CreateGroupDto,
  type ListGroupsQueryDto,
  type UpdateGroupDto,
} from "./dto/community.dto";

/**
 * Every route here reads @CurrentUser("authId") — the RAW Clerk sub — because
 * ClerkAuthGuard sets `user.id` to the DERIVED uuid. Community tables are
 * keyed on the raw sub; using `user.id` writes rows nobody can read back.
 */
@Controller("communities")
export class CommunitiesController {
  constructor(private readonly communitiesService: CommunitiesService) {}

  @Get("spaces")
  listSpaces() {
    return this.communitiesService.listSpaces();
  }

  @Get("groups")
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  listGroups(
    @CurrentUser("authId") authId: string,
    @Query(new ZodValidationPipe(ListGroupsQuerySchema)) query: ListGroupsQueryDto,
  ) {
    return this.communitiesService.listGroups(rawClerkUserId(authId), query);
  }

  @Post("groups")
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  createGroup(
    @CurrentUser("authId") authId: string,
    @Body(new ZodValidationPipe(CreateGroupSchema)) dto: CreateGroupDto,
  ) {
    return this.communitiesService.createGroup(rawClerkUserId(authId), dto);
  }

  @Get("groups/:groupId")
  getGroup(
    @CurrentUser("authId") authId: string,
    @Param("groupId") groupId: string,
  ) {
    const userId = rawClerkUserId(authId);
    // Web routes address groups by slug; mobile by id. Accept both.
    return /^[0-9a-f-]{36}$/i.test(groupId)
      ? this.communitiesService.getGroup(userId, groupId)
      : this.communitiesService.getGroupBySlug(userId, groupId);
  }

  @Patch("groups/:groupId")
  updateGroup(
    @CurrentUser("authId") authId: string,
    @Param("groupId") groupId: string,
    @Body(new ZodValidationPipe(UpdateGroupSchema)) dto: UpdateGroupDto,
  ) {
    return this.communitiesService.updateGroup(
      rawClerkUserId(authId),
      groupId,
      dto,
    );
  }
}
```

Create `backend/services/services/api/src/communities/communities.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { SettingsModule } from "../settings/settings.module";
import { UploadsModule } from "../uploads/uploads.module";
import { CommunitiesController } from "./communities.controller";
import { CommunitiesService } from "./communities.service";
import { CommunityLimitsService } from "./community-limits";

@Module({
  imports: [SettingsModule, NotificationsModule, UploadsModule],
  controllers: [CommunitiesController],
  providers: [CommunitiesService, CommunityLimitsService],
  exports: [CommunitiesService],
})
export class CommunitiesModule {}
```

- [ ] **Step 6: Register the module**

In `backend/services/services/api/src/app.module.ts`, add the import next to the others:

```ts
import { CommunitiesModule } from "./communities/communities.module";
```

and add `CommunitiesModule,` to the `imports` array, immediately after `SupportModule,`.

- [ ] **Step 7: Verify `SettingsModule` and `UploadsModule` export their services**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
grep -n "exports" src/settings/settings.module.ts src/uploads/uploads.module.ts
```

If either lacks `exports: [...]`, add it — `SettingsModule` must export `SettingsService`,
`UploadsModule` must export `UploadsService`. A missing export is a **boot-time** Nest DI failure that
passes every unit test and breaks production (constraint 10).

- [ ] **Step 8: Run the tests, lint, and the boot smoke test**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/communities && npm run lint && npm run build && timeout 25 node dist/main
```

Expected: tests PASS; eslint exits 0; `nest build` succeeds; `node dist/main` logs
`Nest application successfully started` before the timeout kills it. A `Nest can't resolve
dependencies` error here is the bug this step exists to catch.

- [ ] **Step 9: Commit**

```bash
git add backend/services/services/api/src/communities backend/services/services/api/src/app.module.ts
git commit -m "feat(communities): spaces, group discovery, create and update"
```

---

## Task 6: Membership — join, leave, members list, role/mute/ban, join requests

**Files:**
- Modify: `backend/services/services/api/src/communities/communities.service.ts`
- Modify: `backend/services/services/api/src/communities/communities.controller.ts`
- Create: `backend/services/services/api/src/communities/community-membership.spec.ts`

**Interfaces:**
- Consumes: Task 5's `CommunitiesService`, Task 3's `assertGroupPermission`.
- Produces:
  ```ts
  joinGroup(userId: string, groupId: string, dto: JoinGroupDto):
    Promise<{ status: 'joined' | 'requested'; group: CommunityGroupDto }>;
  leaveGroup(userId: string, groupId: string): Promise<{ success: true }>;
  listMembers(userId: string, groupId: string):
    Promise<{ members: GroupMemberDto[]; joinRequests: JoinRequestDto[] }>;
  updateMember(userId: string, groupId: string, targetUserId: string, dto: UpdateMemberDto):
    Promise<{ success: true }>;
  markRead(userId: string, groupId: string): Promise<{ success: true }>;
  export type GroupMemberDto = { userId: string; role: GroupRole; displayName: string;
    avatarUrl: string | null; joinedAt: string; mutedUntil: string | null; bannedAt: string | null };
  export type JoinRequestDto = { id: string; userId: string; displayName: string;
    message: string | null; createdAt: string };
  ```

- [ ] **Step 1: Write the failing test**

Create `backend/services/services/api/src/communities/community-membership.spec.ts`:

```ts
import { ForbiddenException } from "@nestjs/common";
import { canTargetMember, nextMemberPatch } from "./communities.service";
import type { GroupRole } from "@edutu/core";

describe("canTargetMember — rank guard", () => {
  const cases: Array<[GroupRole, GroupRole, boolean]> = [
    ["owner", "admin", true],
    ["owner", "owner", false],
    ["admin", "mod", true],
    ["admin", "admin", false],
    ["admin", "owner", false],
    ["mod", "member", true],
    ["mod", "mod", false],
    ["member", "member", false],
  ];

  for (const [actor, target, allowed] of cases) {
    it(`${actor} ${allowed ? "may" : "may not"} act on ${target}`, () => {
      expect(canTargetMember(actor, target)).toBe(allowed);
    });
  }
});

describe("nextMemberPatch", () => {
  const NOW = new Date("2026-07-25T12:00:00.000Z");

  it("promotes a member to mod", () => {
    expect(nextMemberPatch({ role: "mod" }, NOW)).toEqual({ role: "mod" });
  });

  it("converts muteMinutes to an absolute timestamp", () => {
    expect(nextMemberPatch({ muteMinutes: 60 }, NOW)).toEqual({
      mutedUntil: new Date("2026-07-25T13:00:00.000Z"),
    });
  });

  it("treats muteMinutes 0 as an unmute", () => {
    expect(nextMemberPatch({ muteMinutes: 0 }, NOW)).toEqual({
      mutedUntil: null,
    });
  });

  it("stamps a ban with its reason", () => {
    expect(nextMemberPatch({ ban: true, banReason: "scam links" }, NOW)).toEqual(
      { bannedAt: NOW, bannedReason: "scam links" },
    );
  });

  it("lifts a ban", () => {
    expect(nextMemberPatch({ ban: false }, NOW)).toEqual({
      bannedAt: null,
      bannedReason: null,
    });
  });

  it("rejects an empty patch so a no-op cannot silently 200", () => {
    expect(() => nextMemberPatch({}, NOW)).toThrow(ForbiddenException);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/communities/community-membership.spec.ts
```

Expected: FAIL — `canTargetMember is not a function`.

- [ ] **Step 3: Add the membership logic to `communities.service.ts`**

Add these two exported helpers at module scope in
`backend/services/services/api/src/communities/communities.service.ts`, below
`defaultExpiryFromDeadline`:

```ts
const ROLE_RANK: Record<GroupRole, number> = {
  owner: 4,
  admin: 3,
  mod: 2,
  member: 1,
};

/**
 * A moderator may only act on someone strictly below them. Without this an
 * admin could ban the owner, or two admins could ban each other in a loop.
 */
export function canTargetMember(actor: GroupRole, target: GroupRole): boolean {
  return ROLE_RANK[actor] > ROLE_RANK[target];
}

/** Translates an UpdateMemberDto into a Drizzle patch. Throws on a no-op. */
export function nextMemberPatch(
  dto: {
    role?: "admin" | "mod" | "member";
    muteMinutes?: number;
    ban?: boolean;
    banReason?: string;
  },
  now: Date,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (dto.role) patch.role = dto.role;
  if (dto.muteMinutes !== undefined) {
    patch.mutedUntil =
      dto.muteMinutes > 0
        ? new Date(now.getTime() + dto.muteMinutes * 60_000)
        : null;
  }
  if (dto.ban === true) {
    patch.bannedAt = now;
    patch.bannedReason = dto.banReason ?? null;
  } else if (dto.ban === false) {
    patch.bannedAt = null;
    patch.bannedReason = null;
  }
  if (Object.keys(patch).length === 0) {
    throw new ForbiddenException("Nothing to change on this member.");
  }
  return patch;
}

export type GroupMemberDto = {
  userId: string;
  role: GroupRole;
  displayName: string;
  avatarUrl: string | null;
  joinedAt: string;
  mutedUntil: string | null;
  bannedAt: string | null;
};

export type JoinRequestDto = {
  id: string;
  userId: string;
  displayName: string;
  message: string | null;
  createdAt: string;
};
```

Add `communityJoinRequests` to the `../db/schema` import list, and add these methods inside the
`CommunitiesService` class:

```ts
  async joinGroup(
    userId: string,
    groupId: string,
    dto: { message?: string },
  ): Promise<{ status: "joined" | "requested"; group: CommunityGroupDto }> {
    const context = await loadGroupContext(userId, groupId);

    if (context.bannedAt) {
      throw new ForbiddenException("You have been removed from this group.");
    }
    if (context.group.status !== "active") {
      throw new ForbiddenException("This group is no longer accepting members.");
    }
    if (context.role) {
      const [row] = await db
        .select()
        .from(communityGroups)
        .where(eq(communityGroups.id, groupId));
      return { status: "joined", group: this.toGroupDto(row, context.role) };
    }
    if (context.group.joinPolicy === "invite") {
      throw new ForbiddenException("This group is invite-only.");
    }

    if (context.group.joinPolicy === "request") {
      await db
        .insert(communityJoinRequests)
        .values({ groupId, userId, message: dto.message ?? null })
        .onConflictDoNothing();
      const [row] = await db
        .select()
        .from(communityGroups)
        .where(eq(communityGroups.id, groupId));
      return { status: "requested", group: this.toGroupDto(row, null) };
    }

    return { status: "joined", group: await this.addMember(groupId, userId, "member") };
  }

  /**
   * Inserts the membership row and bumps member_count in one statement each.
   * Shared by open joins, invite accepts (Task 11), and join-request approvals
   * so the counter can never drift between those three paths.
   */
  async addMember(
    groupId: string,
    userId: string,
    role: GroupRole,
  ): Promise<CommunityGroupDto> {
    const inserted = await db
      .insert(communityGroupMembers)
      .values({ groupId, userId, role })
      .onConflictDoNothing({
        target: [communityGroupMembers.groupId, communityGroupMembers.userId],
      })
      .returning({ id: communityGroupMembers.id });

    if (inserted.length) {
      await db
        .update(communityGroups)
        .set({ memberCount: sql`${communityGroups.memberCount} + 1` })
        .where(eq(communityGroups.id, groupId));
    }

    const [row] = await db
      .select()
      .from(communityGroups)
      .where(eq(communityGroups.id, groupId));
    return this.toGroupDto(row, role);
  }

  async leaveGroup(userId: string, groupId: string) {
    const context = await loadGroupContext(userId, groupId);
    if (!context.role) return { success: true as const };
    if (context.role === "owner") {
      throw new ForbiddenException(
        "Transfer ownership before leaving, or archive the group.",
      );
    }

    const removed = await db
      .delete(communityGroupMembers)
      .where(
        and(
          eq(communityGroupMembers.groupId, groupId),
          eq(communityGroupMembers.userId, userId),
        ),
      )
      .returning({ id: communityGroupMembers.id });

    if (removed.length) {
      await db
        .update(communityGroups)
        .set({
          memberCount: sql`greatest(${communityGroups.memberCount} - 1, 0)`,
        })
        .where(eq(communityGroups.id, groupId));
    }
    return { success: true as const };
  }

  async listMembers(userId: string, groupId: string) {
    const context = await loadGroupContext(userId, groupId);
    if (!context.role) throw new ForbiddenException("Join this group first.");

    const memberRows = await db.execute(sql`
      select m.user_id,
             m.role,
             m.joined_at,
             m.muted_until,
             m.banned_at,
             coalesce(p.full_name, 'Edutu learner') as display_name,
             p.avatar_url
      from public.community_group_members m
      left join public.profiles p on p.user_id::text = m.user_id
      where m.group_id = ${groupId}::uuid
      order by
        case m.role when 'owner' then 0 when 'admin' then 1 when 'mod' then 2 else 3 end,
        m.joined_at asc
      limit 500
    `);

    const members: GroupMemberDto[] = this.rows<{
      user_id: string;
      role: GroupRole;
      joined_at: string;
      muted_until: string | null;
      banned_at: string | null;
      display_name: string;
      avatar_url: string | null;
    }>(memberRows).map((row) => ({
      userId: row.user_id,
      role: row.role,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      joinedAt: new Date(row.joined_at).toISOString(),
      mutedUntil: row.muted_until ? new Date(row.muted_until).toISOString() : null,
      bannedAt: row.banned_at ? new Date(row.banned_at).toISOString() : null,
    }));

    // Pending join requests are moderation data — only visible to people who
    // can actually act on them.
    let joinRequests: JoinRequestDto[] = [];
    if (context.role === "owner" || context.role === "admin") {
      const requestRows = await db.execute(sql`
        select r.id, r.user_id, r.message, r.created_at,
               coalesce(p.full_name, 'Edutu learner') as display_name
        from public.community_join_requests r
        left join public.profiles p on p.user_id::text = r.user_id
        where r.group_id = ${groupId}::uuid and r.status = 'pending'
        order by r.created_at asc
        limit 200
      `);
      joinRequests = this.rows<{
        id: string;
        user_id: string;
        message: string | null;
        created_at: string;
        display_name: string;
      }>(requestRows).map((row) => ({
        id: row.id,
        userId: row.user_id,
        displayName: row.display_name,
        message: row.message,
        createdAt: new Date(row.created_at).toISOString(),
      }));
    }

    return { members, joinRequests };
  }

  async updateMember(
    userId: string,
    groupId: string,
    targetUserId: string,
    dto: {
      role?: "admin" | "mod" | "member";
      muteMinutes?: number;
      ban?: boolean;
      banReason?: string;
      remove?: boolean;
      decideJoinRequest?: "approved" | "rejected";
    },
  ) {
    if (dto.decideJoinRequest) {
      const context = await assertGroupPermission(userId, groupId, "invite");
      const [request] = await db
        .update(communityJoinRequests)
        .set({
          status: dto.decideJoinRequest,
          decidedBy: userId,
          decidedAt: new Date(),
        })
        .where(
          and(
            eq(communityJoinRequests.groupId, groupId),
            eq(communityJoinRequests.userId, targetUserId),
            eq(communityJoinRequests.status, "pending"),
          ),
        )
        .returning({ id: communityJoinRequests.id });
      if (!request) throw new NotFoundException("No pending request");
      if (dto.decideJoinRequest === "approved") {
        await this.addMember(groupId, targetUserId, "member");
      }
      void context;
      return { success: true as const };
    }

    const action = dto.remove || dto.ban !== undefined ? "ban" : dto.role ? "promote" : "mute";
    const context = await assertGroupPermission(userId, groupId, action);

    const targetContext = await loadGroupContext(targetUserId, groupId);
    if (!targetContext.role) throw new NotFoundException("Member not found");
    if (!canTargetMember(context.role as GroupRole, targetContext.role)) {
      throw new ForbiddenException("You cannot act on this member.");
    }
    if (dto.role === "admin" && context.role !== "owner") {
      throw new ForbiddenException("Only the owner can appoint admins.");
    }

    if (dto.remove) {
      await db
        .delete(communityGroupMembers)
        .where(
          and(
            eq(communityGroupMembers.groupId, groupId),
            eq(communityGroupMembers.userId, targetUserId),
          ),
        );
      await db
        .update(communityGroups)
        .set({
          memberCount: sql`greatest(${communityGroups.memberCount} - 1, 0)`,
        })
        .where(eq(communityGroups.id, groupId));
      return { success: true as const };
    }

    await db
      .update(communityGroupMembers)
      .set(nextMemberPatch(dto, new Date()))
      .where(
        and(
          eq(communityGroupMembers.groupId, groupId),
          eq(communityGroupMembers.userId, targetUserId),
        ),
      );

    return { success: true as const };
  }

  /** Unread accounting: stamp the caller's read cursor. */
  async markRead(userId: string, groupId: string) {
    await db
      .update(communityGroupMembers)
      .set({ lastReadAt: new Date() })
      .where(
        and(
          eq(communityGroupMembers.groupId, groupId),
          eq(communityGroupMembers.userId, userId),
        ),
      );
    return { success: true as const };
  }
```

- [ ] **Step 4: Add the routes**

Append to `communities.controller.ts` (and extend the `@nestjs/common` import with `Delete`):

```ts
  @Post("groups/:groupId/join")
  @Throttle({ default: { limit: 20, ttl: 3600000 } })
  join(
    @CurrentUser("authId") authId: string,
    @Param("groupId") groupId: string,
    @Body(new ZodValidationPipe(JoinGroupSchema)) dto: JoinGroupDto,
  ) {
    return this.communitiesService.joinGroup(
      rawClerkUserId(authId),
      groupId,
      dto,
    );
  }

  @Delete("groups/:groupId/leave")
  leave(
    @CurrentUser("authId") authId: string,
    @Param("groupId") groupId: string,
  ) {
    return this.communitiesService.leaveGroup(rawClerkUserId(authId), groupId);
  }

  @Get("groups/:groupId/members")
  members(
    @CurrentUser("authId") authId: string,
    @Param("groupId") groupId: string,
  ) {
    return this.communitiesService.listMembers(rawClerkUserId(authId), groupId);
  }

  @Patch("groups/:groupId/members/:userId")
  updateMember(
    @CurrentUser("authId") authId: string,
    @Param("groupId") groupId: string,
    @Param("userId") targetUserId: string,
    @Body(new ZodValidationPipe(UpdateMemberSchema)) dto: UpdateMemberDto,
  ) {
    return this.communitiesService.updateMember(
      rawClerkUserId(authId),
      groupId,
      targetUserId,
      dto,
    );
  }

  @Post("groups/:groupId/read")
  markRead(
    @CurrentUser("authId") authId: string,
    @Param("groupId") groupId: string,
  ) {
    return this.communitiesService.markRead(rawClerkUserId(authId), groupId);
  }
```

Extend the DTO import in the controller with `JoinGroupSchema`, `UpdateMemberSchema`,
`type JoinGroupDto`, `type UpdateMemberDto`.

- [ ] **Step 5: Run the tests and lint**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/communities && npm run lint
```

Expected: PASS; eslint exits 0.

- [ ] **Step 6: Commit**

```bash
git add backend/services/services/api/src/communities
git commit -m "feat(communities): membership, join requests, roles, mute and ban"
```

---

## Task 7: Send-time safety filters

**Files:**
- Create: `backend/services/services/api/src/communities/community-message-safety.ts`
- Create: `backend/services/services/api/src/communities/community-message-safety.spec.ts`

**Interfaces:**
- Consumes: `isObjectionable` from `../common/moderation`; `SCAM_GATE_CAP_THRESHOLD` and
  `extractRedFlags` from `../scraper/opportunity-dedup.service` (these live on `origin/main` — see the
  PREREQUISITE section).
- Produces:
  ```ts
  export type SafetyReason = 'scam_link' | 'contact_harvesting' | 'abuse' | 'illegal' | 'flagged_listing';
  export type SafetyVerdict =
    | { action: 'allow' }
    | { action: 'review'; reason: SafetyReason; detail: string }
    | { action: 'hold'; reason: SafetyReason; detail: string }
    | { action: 'block'; reason: SafetyReason; detail: string };
  export function screenMessage(text: string, env?: NodeJS.ProcessEnv): SafetyVerdict;
  export function screenSharedOpportunity(metadata: unknown, env?: NodeJS.ProcessEnv): SafetyVerdict;
  export function isCommunityMessageGateEnabled(env: NodeJS.ProcessEnv): boolean;
  export function extractUrls(text: string): string[];
  export function isRiskyLink(url: string): boolean;
  export function detectsContactHarvesting(text: string): boolean;
  export function textRedFlags(text: string): string[];
  export function toFlags(metadata: unknown): string[];
  export function toVerdict(flags: string[], reason: SafetyReason, detail: string): SafetyVerdict;
  ```

**Two gates, one vocabulary — read this before writing code.**

The scraper's scam gate (`opportunity-dedup.service.ts` on `origin/main`) grades *stored metadata that
already carries LLM-extracted `red_flags`*. It reads a verdict someone else computed. A chat message
has no `red_flags` field, so that gate structurally cannot screen prose. `screenMessage` therefore
keeps its **own detection logic** — it is a real screener of adversarial user text, not a wrapper.

What is shared is the **vocabulary**, so the two can never disagree about what "risky" means:

| Signals | Scraper gate (listings) | This gate (chat) |
|---|---|---|
| 0 | untouched | `allow` |
| 1 | `needs_review = true` + `scam_risk`, status kept | `review` — publishes, and files a system report into the moderation queue |
| ≥ `SCAM_GATE_CAP_THRESHOLD` (2) | caps `active` → review | `hold` — shadow-held, invisible to the group |

Unambiguous abuse/illegal content still hard-`block`s at any count — that is orthogonal to flag counting.

The **one place the existing gate genuinely applies** is a shared opportunity card:
`screenSharedOpportunity` **reads the stored verdict** through `extractRedFlags` and never re-runs
detection, so a group card and the admin queue always agree about the same listing. All coupling to the
scraper module funnels through the `toFlags` / `toVerdict` adapter, which fails safe.

- [ ] **Step 1: Verify the real signatures you are importing**

The exact shapes below were reported, not read — confirm them against your `origin/main` tree before
writing the import.

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api/src
grep -n "SCAM_GATE_CAP_THRESHOLD\|export function extractRedFlags\|export function isScamGateEnabled\|export function decideScamGate" \
  scraper/opportunity-dedup.service.ts
```

Expected: four hits, including `export const SCAM_GATE_CAP_THRESHOLD = 2;` and
`export function extractRedFlags(...)`. If `extractRedFlags` takes something other than the whole
metadata object, adjust **only** `toFlags` below — nothing else in this slice touches the scraper
module. If the symbols are missing, your base is stale: go back to the PREREQUISITE section.

- [ ] **Step 2: Write the failing test**

Create `backend/services/services/api/src/communities/community-message-safety.spec.ts`:

```ts
import {
  detectsContactHarvesting,
  extractUrls,
  isCommunityMessageGateEnabled,
  isRiskyLink,
  screenMessage,
  screenSharedOpportunity,
  textRedFlags,
  toFlags,
} from "./community-message-safety";
import { SCAM_GATE_CAP_THRESHOLD } from "../scraper/opportunity-dedup.service";

describe("extractUrls", () => {
  it("finds bare and scheme-prefixed urls", () => {
    expect(
      extractUrls("see https://chevening.org and bit.ly/abc today"),
    ).toEqual(["https://chevening.org", "bit.ly/abc"]);
  });

  it("returns an empty array when there are none", () => {
    expect(extractUrls("no links here")).toEqual([]);
  });

  it("is not fooled by zero-width characters inside the host", () => {
    expect(extractUrls("bit​.ly/abc")).toEqual(["bit.ly/abc"]);
  });
});

describe("isRiskyLink", () => {
  it.each([
    "bit.ly/free-scholarship",
    "https://tinyurl.com/x",
    "https://scholarship-grant-portal.tk/apply",
    "https://chevening.org.verify-now.xyz/pay",
    "http://192.168.1.9/apply",
  ])("flags %s", (url) => {
    expect(isRiskyLink(url)).toBe(true);
  });

  it.each([
    "https://chevening.org/apply",
    "https://www.mastercardfdn.org/scholars",
    "https://edutu.org/opportunity/abc",
  ])("allows %s", (url) => {
    expect(isRiskyLink(url)).toBe(false);
  });
});

describe("detectsContactHarvesting", () => {
  it.each([
    "dm me on whatsapp +234 801 234 5678",
    "Send me your WhatsApp number and I'll add you",
    "text me on telegram @quickcash",
    "drop your number, I'll add you to the paid group",
  ])("flags %s", (text) => {
    expect(detectsContactHarvesting(text)).toBe(true);
  });

  it.each([
    "The deadline is 1 November 2026",
    "My IELTS was 7.5 overall",
    "Call the university admissions office listed on the site",
  ])("allows %s", (text) => {
    expect(detectsContactHarvesting(text)).toBe(false);
  });
});

describe("textRedFlags", () => {
  it("returns no flags for ordinary advice", () => {
    expect(textRedFlags("Start your Chevening essays in August.")).toEqual([]);
  });

  it("returns one flag for a single shortened link", () => {
    expect(textRedFlags("apply here bit.ly/free-scholarship")).toEqual([
      "risky_link",
    ]);
  });

  it("returns one flag per distinct signal type, not per occurrence", () => {
    expect(
      textRedFlags("bit.ly/a and tinyurl.com/b and rb.gy/c"),
    ).toEqual(["risky_link"]);
  });

  it("returns two flags when a risky link and harvesting appear together", () => {
    expect(
      textRedFlags("bit.ly/x — dm me on whatsapp +2348012345678").sort(),
    ).toEqual(["contact_harvesting", "risky_link"]);
  });
});

describe("screenMessage — shares the scraper gate's thresholds", () => {
  it("allows ordinary advice", () => {
    expect(screenMessage("Start your Chevening essays in August.")).toEqual({
      action: "allow",
    });
  });

  it("REVIEWS a single signal — publishes, but queues it (1 flag = needs_review)", () => {
    const verdict = screenMessage("apply here bit.ly/free-scholarship");
    expect(verdict.action).toBe("review");
    if (verdict.action !== "allow") expect(verdict.reason).toBe("scam_link");
  });

  it("REVIEWS contact harvesting on its own", () => {
    const verdict = screenMessage("dm me on whatsapp +2348012345678");
    expect(verdict.action).toBe("review");
    if (verdict.action !== "allow")
      expect(verdict.reason).toBe("contact_harvesting");
  });

  it("HOLDS at SCAM_GATE_CAP_THRESHOLD signals rather than hard-blocking a real user", () => {
    const verdict = screenMessage(
      "bit.ly/x — dm me on whatsapp +2348012345678",
    );
    expect(SCAM_GATE_CAP_THRESHOLD).toBe(2);
    expect(verdict.action).toBe("hold");
  });

  it("BLOCKS profanity and slurs outright, regardless of flag count", () => {
    const verdict = screenMessage("you are a f u c k i n g idiot");
    expect(verdict.action).toBe("block");
    if (verdict.action !== "allow") expect(verdict.reason).toBe("abuse");
  });

  it("BLOCKS severe illegal-content patterns outright", () => {
    expect(screenMessage("kill yourself").action).toBe("block");
  });

  it("prefers a block over a hold when a message trips both", () => {
    expect(screenMessage("bit.ly/x you cunt").action).toBe("block");
  });

  it("is safe on empty input", () => {
    expect(screenMessage("")).toEqual({ action: "allow" });
  });
});

describe("isCommunityMessageGateEnabled — mirrors the SCRAPER_SCAM_GATE convention", () => {
  it("defaults ON when unset (fails safe)", () => {
    expect(isCommunityMessageGateEnabled({})).toBe(true);
  });

  it("stays ON for any value other than an explicit false", () => {
    expect(isCommunityMessageGateEnabled({ COMMUNITY_MESSAGE_GATE: "true" })).toBe(true);
    expect(isCommunityMessageGateEnabled({ COMMUNITY_MESSAGE_GATE: "" })).toBe(true);
    expect(isCommunityMessageGateEnabled({ COMMUNITY_MESSAGE_GATE: "yes" })).toBe(true);
  });

  it("turns OFF only on an explicit false", () => {
    expect(isCommunityMessageGateEnabled({ COMMUNITY_MESSAGE_GATE: "false" })).toBe(false);
    expect(isCommunityMessageGateEnabled({ COMMUNITY_MESSAGE_GATE: "FALSE" })).toBe(false);
  });

  it("still blocks abuse when the gate is disabled — the kill switch is for the scam heuristics only", () => {
    const env = { COMMUNITY_MESSAGE_GATE: "false" };
    expect(screenMessage("bit.ly/free-money", env).action).toBe("allow");
    expect(screenMessage("you cunt", env).action).toBe("block");
  });
});

describe("toFlags — reads the STORED scraper verdict, never re-runs detection", () => {
  it("returns the extractor's red flags", () => {
    expect(
      toFlags({ red_flags: ["asks_for_payment", "no_official_domain"] }).sort(),
    ).toEqual(["asks_for_payment", "no_official_domain"]);
  });

  it("falls back to needs_review when red_flags is absent", () => {
    expect(toFlags({ needs_review: true })).toEqual(["needs_review"]);
  });

  it("treats a high scam_risk as being at the cap on its own", () => {
    expect(toFlags({ scam_risk: "high" }).length).toBeGreaterThanOrEqual(
      SCAM_GATE_CAP_THRESHOLD,
    );
  });

  it("returns nothing for clean metadata", () => {
    expect(toFlags({ scam_risk: null, needs_review: false })).toEqual([]);
  });

  it("fails safe on junk rather than throwing", () => {
    expect(toFlags(null)).toEqual([]);
    expect(toFlags("nonsense")).toEqual([]);
    expect(toFlags(undefined)).toEqual([]);
  });
});

describe("screenSharedOpportunity — a flagged listing cannot be laundered into a group", () => {
  it("allows a clean listing", () => {
    expect(screenSharedOpportunity({ scam_risk: null })).toEqual({
      action: "allow",
    });
  });

  it("WARNS on a single stored red flag so the card renders with a caution", () => {
    const verdict = screenSharedOpportunity({ red_flags: ["asks_for_payment"] });
    expect(verdict.action).toBe("review");
    if (verdict.action !== "allow")
      expect(verdict.reason).toBe("flagged_listing");
  });

  it("BLOCKS a listing our own scraper already capped", () => {
    const verdict = screenSharedOpportunity({
      red_flags: ["asks_for_payment", "no_official_domain"],
    });
    expect(verdict.action).toBe("block");
    if (verdict.action !== "allow")
      expect(verdict.reason).toBe("flagged_listing");
  });

  it("BLOCKS a high scam_risk listing", () => {
    expect(screenSharedOpportunity({ scam_risk: "high" }).action).toBe("block");
  });

  it("carries the stored verdict in the detail so the card and the queue agree", () => {
    const verdict = screenSharedOpportunity({
      red_flags: ["asks_for_payment", "no_official_domain"],
    });
    if (verdict.action !== "allow") {
      expect(verdict.detail).toContain("asks_for_payment");
    }
  });

  it("allows when the gate is disabled", () => {
    expect(
      screenSharedOpportunity(
        { scam_risk: "high" },
        { COMMUNITY_MESSAGE_GATE: "false" },
      ),
    ).toEqual({ action: "allow" });
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/communities/community-message-safety.spec.ts
```

Expected: FAIL — `Cannot find module './community-message-safety'`.

- [ ] **Step 4: Implement it**

Create `backend/services/services/api/src/communities/community-message-safety.ts`:

```ts
/**
 * Send-time safety for group chat (design spec §9.4).
 *
 * TWO GATES, ONE VOCABULARY.
 *
 * The scraper's scam gate (src/scraper/opportunity-dedup.service.ts) grades
 * stored metadata that an LLM extractor has already annotated with
 * `red_flags`. It reads a verdict; it cannot compute one from prose. A chat
 * message has no `red_flags` field, so screening raw text is genuinely
 * separate work and lives here.
 *
 * What is shared is the SCALE, imported rather than re-declared:
 *   0 signals                       → allow
 *   1 signal                        → review  (publish + queue, mirrors needs_review)
 *   SCAM_GATE_CAP_THRESHOLD signals → hold    (mirrors capping active → review)
 * Unambiguous abuse / illegal content hard-blocks at any count.
 *
 * For a SHARED OPPORTUNITY CARD the scraper's gate is exactly right, so
 * screenSharedOpportunity READS the stored verdict via extractRedFlags and
 * never re-runs detection — the group card and the admin queue must never
 * disagree about the same listing.
 *
 * Kill switch: COMMUNITY_MESSAGE_GATE, default ON, mirroring SCRAPER_SCAM_GATE.
 * It disables the scam HEURISTICS only; abuse/illegal blocking is not optional.
 */
import { isObjectionable } from "../common/moderation";
import {
  SCAM_GATE_CAP_THRESHOLD,
  extractRedFlags,
} from "../scraper/opportunity-dedup.service";

export type SafetyReason =
  | "scam_link"
  | "contact_harvesting"
  | "abuse"
  | "illegal"
  | "flagged_listing";

export type SafetyVerdict =
  | { action: "allow" }
  | { action: "review"; reason: SafetyReason; detail: string }
  | { action: "hold"; reason: SafetyReason; detail: string }
  | { action: "block"; reason: SafetyReason; detail: string };

/** Same convention as isScamGateEnabled: on unless explicitly turned off. */
export function isCommunityMessageGateEnabled(env: NodeJS.ProcessEnv): boolean {
  return String(env.COMMUNITY_MESSAGE_GATE ?? "").toLowerCase() !== "false";
}

// URL shorteners hide the destination, which is exactly how the "pay ₦5,000
// for the application link" scam is delivered in WhatsApp groups today.
const SHORTENER_HOSTS = new Set([
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "ow.ly",
  "cutt.ly",
  "rb.gy",
  "is.gd",
  "shorturl.at",
  "rebrand.ly",
  "linktr.ee",
  "bio.link",
]);

// Free/abused TLDs that essentially never host a real funder.
const RISKY_TLDS = new Set([
  "tk",
  "ml",
  "ga",
  "cf",
  "gq",
  "xyz",
  "top",
  "click",
  "work",
]);

const CONTACT_PATTERNS: RegExp[] = [
  /\b(whats\s?app|whatsapp|telegram|signal)\b[\s\S]{0,40}(\+?\d[\d\s-]{6,})/i,
  /\b(dm|text|message|ping|contact)\s+me\b[\s\S]{0,30}\b(whats\s?app|telegram|signal|number|line)\b/i,
  /\b(send|drop|share|give)\s+(me\s+)?(your|ur)\s+(whats\s?app|telegram|number|digits|contact)\b/i,
  /\b(join|add(ed)?\s+(you|u)\s+to)\b[\s\S]{0,30}\b(paid|private|vip)\s+(group|channel)\b/i,
];

/**
 * Strips the zero-width characters and stray whitespace used to slip a host
 * past a naive matcher, then pulls out anything link-shaped. Mirrors the
 * normalisation sanitizeUrl applies in scraper.service.ts.
 */
export function extractUrls(text: string): string[] {
  if (!text) return [];
  const cleaned = text
    .replace(/[​‌‍﻿]/g, "")
    .replace(/\s*\.\s*/g, ".");
  const pattern =
    /(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:\/[^\s]*)?|https?:\/\/\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?(?:\/[^\s]*)?/gi;
  return cleaned.match(pattern) ?? [];
}

function hostOf(url: string): string {
  const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  try {
    return new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function isRiskyLink(url: string): boolean {
  const host = hostOf(url);
  if (!host) return true;
  if (SHORTENER_HOSTS.has(host)) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;

  const labels = host.split(".");
  if (RISKY_TLDS.has(labels[labels.length - 1])) return true;

  // A brand name buried in a subdomain of an unrelated host is the classic
  // phishing shape: chevening.org.verify-now.xyz
  if (labels.length >= 4) return true;

  return false;
}

export function detectsContactHarvesting(text: string): boolean {
  if (!text) return false;
  return CONTACT_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Red flags derived from raw text. One flag PER SIGNAL TYPE, not per
 * occurrence — three shortened links are one person sharing links badly, not a
 * three-signal conspiracy, and counting occurrences would push ordinary
 * link-heavy advice straight past the cap.
 */
export function textRedFlags(text: string): string[] {
  const flags: string[] = [];
  if (extractUrls(text).some(isRiskyLink)) flags.push("risky_link");
  if (detectsContactHarvesting(text)) flags.push("contact_harvesting");
  return flags;
}

/**
 * Adapter #1 — the ONLY place this slice reads the scraper's stored verdict.
 * Fails safe: junk metadata yields no flags rather than throwing, because a
 * malformed metadata blob must not stop members sharing opportunities.
 */
export function toFlags(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object") return [];

  let flags: string[] = [];
  try {
    const extracted = extractRedFlags(metadata);
    if (Array.isArray(extracted)) {
      flags = extracted.map((flag) => String(flag)).filter(Boolean);
    }
  } catch {
    // Signature drift or a bad blob — fall through to the raw fields below.
  }

  const record = metadata as Record<string, unknown>;
  if (!flags.length && record.needs_review === true) {
    flags = ["needs_review"];
  }

  // A stored high risk is already the scraper's "cap it" verdict, so it counts
  // as being at the threshold on its own.
  if (String(record.scam_risk ?? "").toLowerCase() === "high") {
    while (flags.length < SCAM_GATE_CAP_THRESHOLD) {
      flags.push("scam_risk_high");
    }
  }

  return Array.from(new Set(flags));
}

/** Adapter #2 — maps a flag count onto this slice's actions using the shared threshold. */
export function toVerdict(
  flags: string[],
  reason: SafetyReason,
  detail: string,
): SafetyVerdict {
  if (flags.length >= SCAM_GATE_CAP_THRESHOLD) {
    return { action: "hold", reason, detail };
  }
  if (flags.length > 0) {
    return { action: "review", reason, detail };
  }
  return { action: "allow" };
}

export function screenMessage(
  text: string,
  env: NodeJS.ProcessEnv = process.env,
): SafetyVerdict {
  if (!text || !text.trim()) return { action: "allow" };

  // Unambiguous abuse / illegal content: hard block, checked first so it wins
  // over any flag-count verdict, and NOT subject to the kill switch.
  if (isObjectionable(text)) {
    return {
      action: "block",
      reason: "abuse",
      detail: "Message matched the objectionable-content filter.",
    };
  }

  if (!isCommunityMessageGateEnabled(env)) return { action: "allow" };

  const flags = textRedFlags(text);
  if (!flags.length) return { action: "allow" };

  const reason: SafetyReason = flags.includes("risky_link")
    ? "scam_link"
    : "contact_harvesting";

  return toVerdict(
    flags,
    reason,
    `Signals: ${flags.join(", ")}.`,
  );
}

/**
 * A shared opportunity card. Reads the STORED scraper verdict — never re-runs
 * detection — so the card a member sees and the row an admin reviews are
 * derived from the same annotation. `hold` is upgraded to `block` here because
 * a card at the cap is a listing our own pipeline already refused to publish;
 * shadow-holding it would leave the sender believing it went through.
 */
export function screenSharedOpportunity(
  metadata: unknown,
  env: NodeJS.ProcessEnv = process.env,
): SafetyVerdict {
  if (!isCommunityMessageGateEnabled(env)) return { action: "allow" };

  const flags = toFlags(metadata);
  const verdict = toVerdict(
    flags,
    "flagged_listing",
    `This listing was flagged by Edutu's scam checks (${flags.join(", ")}).`,
  );

  if (verdict.action === "hold") {
    return { ...verdict, action: "block" };
  }
  return verdict;
}
```

- [ ] **Step 5: Run the tests**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/communities/community-message-safety.spec.ts
```

Expected: PASS, 46 tests.

- [ ] **Step 6: Commit**

```bash
git add backend/services/services/api/src/communities/community-message-safety.ts \
        backend/services/services/api/src/communities/community-message-safety.spec.ts
git commit -m "feat(communities): send-time text screening sharing the scam gate's thresholds"
```

---

## Task 8: Messages — list, send, rate limits

**Files:**
- Create: `backend/services/services/api/src/communities/community-messages.service.ts`
- Create: `backend/services/services/api/src/communities/community-messages.service.spec.ts`
- Modify: `backend/services/services/api/src/communities/communities.controller.ts`
- Modify: `backend/services/services/api/src/communities/communities.module.ts`

**Interfaces:**
- Consumes: `assertGroupPermission` (Task 3), `CommunityLimitsService` (Task 4),
  `screenMessage` (Task 7).
- Produces:
  ```ts
  export class CommunityMessagesService {
    list(userId, groupId, query): Promise<{ messages: CommunityMessageDto[]; hasMore: boolean }>;
    send(userId, groupId, dto): Promise<CommunityMessageDto>;
  }
  export type CommunityMessageDto = {
    id: string; groupId: string; userId: string; authorUsername: string;
    authorDisplayName: string; authorAvatarUrl: string | null;
    kind: 'text'|'image'|'opportunity'|'system'|'announcement'|'ai';
    body: string | null; attachments: Array<{ url: string; width: number; height: number }>;
    opportunityId: string | null; replyToId: string | null; savedToBrief: boolean;
    createdAt: string; reviewStatus: 'published'|'held'|'removed';
    reactions: Array<{ emoji: string; count: number; mine: boolean }>;
    blocked?: boolean; clientId?: string;
  };
  ```

- [ ] **Step 1: Write the failing test**

Create `backend/services/services/api/src/communities/community-messages.service.spec.ts`:

```ts
import {
  TooManyRequestsException,
  buildRateWindows,
  mostSevere,
} from "./community-messages.service";
import type { SafetyVerdict } from "./community-message-safety";

describe("mostSevere", () => {
  const review: SafetyVerdict = {
    action: "review",
    reason: "scam_link",
    detail: "r",
  };
  const hold: SafetyVerdict = {
    action: "hold",
    reason: "scam_link",
    detail: "h",
  };
  const block: SafetyVerdict = {
    action: "block",
    reason: "flagged_listing",
    detail: "b",
  };

  it("allows when nothing fired", () => {
    expect(mostSevere([{ action: "allow" }, { action: "allow" }])).toEqual({
      action: "allow",
    });
  });

  it("a flagged listing blocks even when the text is clean", () => {
    expect(mostSevere([{ action: "allow" }, block])).toEqual(block);
  });

  it("prefers hold over review", () => {
    expect(mostSevere([review, hold])).toEqual(hold);
  });

  it("prefers block over everything", () => {
    expect(mostSevere([hold, block, review])).toEqual(block);
  });

  it("is safe on an empty list", () => {
    expect(mostSevere([])).toEqual({ action: "allow" });
  });
});

describe("buildRateWindows", () => {
  it("returns the minute and hour windows from the limits", () => {
    expect(
      buildRateWindows({ messagesPerMinute: 20, messagesPerHour: 300 }),
    ).toEqual([
      { seconds: 60, max: 20, label: "a minute" },
      { seconds: 3600, max: 300, label: "an hour" },
    ]);
  });
});

describe("TooManyRequestsException", () => {
  it("is a 429 carrying a retry hint", () => {
    const error = new TooManyRequestsException("a minute", 12);
    expect(error.getStatus()).toBe(429);
    expect(JSON.stringify(error.getResponse())).toContain("12");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/communities/community-messages.service.spec.ts
```

Expected: FAIL — `Cannot find module './community-messages.service'`.

- [ ] **Step 3: Implement the service**

Create `backend/services/services/api/src/communities/community-messages.service.ts`:

```ts
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "../db";
import {
  communityGroupMembers,
  communityGroups,
  communityMessageReactions,
  communityMessages,
  communityReports,
} from "../db/schema";
import { CommunityLimitsService } from "./community-limits";
import { assertGroupPermission, loadGroupContext } from "./community-permissions";
import {
  screenMessage,
  screenSharedOpportunity,
  type SafetyVerdict,
} from "./community-message-safety";
import type {
  ListMessagesQueryDto,
  SendMessageDto,
} from "./dto/community.dto";

export type CommunityMessageDto = {
  id: string;
  groupId: string;
  userId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarUrl: string | null;
  kind: "text" | "image" | "opportunity" | "system" | "announcement" | "ai";
  body: string | null;
  attachments: Array<{ url: string; width: number; height: number }>;
  opportunityId: string | null;
  replyToId: string | null;
  savedToBrief: boolean;
  createdAt: string;
  reviewStatus: "published" | "held" | "removed";
  /** Why this was flagged/held, or the caution a shared opportunity card renders. */
  safetyNote: string | null;
  reactions: Array<{ emoji: string; count: number; mine: boolean }>;
  blocked?: boolean;
  clientId?: string;
};

/** Severity ordering shared by both screens: block > hold > review > allow. */
const SEVERITY: Record<SafetyVerdict["action"], number> = {
  allow: 0,
  review: 1,
  hold: 2,
  block: 3,
};

export function mostSevere(verdicts: SafetyVerdict[]): SafetyVerdict {
  return verdicts.reduce<SafetyVerdict>(
    (worst, candidate) =>
      SEVERITY[candidate.action] > SEVERITY[worst.action] ? candidate : worst,
    { action: "allow" },
  );
}

export class TooManyRequestsException extends HttpException {
  constructor(window: string, retryAfterSeconds: number) {
    super(
      {
        errorCode: "RATE_LIMIT_EXCEEDED",
        message: `You're sending messages faster than ${window} allows. Try again shortly.`,
        metadata: { retryAfterSeconds },
        timestamp: new Date().toISOString(),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export function buildRateWindows(limits: {
  messagesPerMinute: number;
  messagesPerHour: number;
}) {
  return [
    { seconds: 60, max: limits.messagesPerMinute, label: "a minute" },
    { seconds: 3600, max: limits.messagesPerHour, label: "an hour" },
  ];
}

@Injectable()
export class CommunityMessagesService {
  constructor(private readonly limits: CommunityLimitsService) {}

  /**
   * Newest-first page. `before` is the createdAt of the oldest message the
   * client already has, so paging backwards is a keyset scan on
   * idx_community_messages_group_created — no OFFSET, no drift as new
   * messages arrive at the head.
   */
  async list(
    userId: string,
    groupId: string,
    query: ListMessagesQueryDto,
  ): Promise<{ messages: CommunityMessageDto[]; hasMore: boolean }> {
    const context = await loadGroupContext(userId, groupId);
    if (!context.role) throw new ForbiddenException("Join this group first.");
    if (context.bannedAt) {
      throw new ForbiddenException("You have been removed from this group.");
    }

    const conditions = [
      eq(communityMessages.groupId, groupId),
      eq(communityMessages.isDeleted, false),
      // Held messages are visible only to their author (spec §9.4 shadow-hold).
      sql`(${communityMessages.reviewStatus} = 'published' or ${communityMessages.userId} = ${userId})`,
    ];
    if (query.before) {
      conditions.push(lt(communityMessages.createdAt, new Date(query.before)));
    }

    const rows = await db
      .select()
      .from(communityMessages)
      .where(and(...conditions))
      .orderBy(desc(communityMessages.createdAt))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;

    return {
      messages: await this.hydrate(userId, page.reverse()),
      hasMore,
    };
  }

  async send(
    userId: string,
    groupId: string,
    dto: SendMessageDto,
  ): Promise<CommunityMessageDto> {
    await assertGroupPermission(userId, groupId, "post");
    await this.assertUnderRateLimit(userId, groupId);

    if (dto.replyToId) {
      const [parent] = await db
        .select({ id: communityMessages.id })
        .from(communityMessages)
        .where(
          and(
            eq(communityMessages.id, dto.replyToId),
            eq(communityMessages.groupId, groupId),
          ),
        );
      if (!parent) throw new BadRequestException("That message is not in this group.");
    }

    // Two screens, in severity order. Text screening computes signals from the
    // message itself; the shared-opportunity screen READS the verdict Edutu's
    // scraper already stored for that listing (never re-running detection, so
    // the card and the admin queue can never disagree).
    const verdicts: SafetyVerdict[] = [screenMessage(dto.body ?? "")];
    if (dto.opportunityId) {
      verdicts.push(await this.screenSharedOpportunityId(dto.opportunityId));
    }
    const verdict = mostSevere(verdicts);

    if (verdict.action === "block") {
      throw new ForbiddenException(
        verdict.reason === "flagged_listing"
          ? "Edutu's scam checks flagged this listing, so it can't be shared into a group."
          : "That message breaks the community rules and was not sent.",
      );
    }

    const [message] = await db
      .insert(communityMessages)
      .values({
        groupId,
        userId,
        kind: dto.kind,
        body: dto.body?.trim() || null,
        attachments: dto.attachments,
        opportunityId: dto.opportunityId ?? null,
        replyToId: dto.replyToId ?? null,
        reviewStatus: verdict.action === "hold" ? "held" : "published",
        safetyNote: verdict.action === "allow" ? null : verdict.detail,
      })
      .returning();

    // A single signal publishes but files itself into the moderation queue —
    // the chat equivalent of the scraper gate's `needs_review = true`. Reusing
    // community_reports means no second queue and no schema change; the unique
    // (reporter, target_type, target_id) index makes it idempotent.
    if (verdict.action === "review") {
      await db
        .insert(communityReports)
        .values({
          targetType: "message",
          targetId: message.id,
          groupId,
          reporterUserId: "system",
          reason: verdict.reason === "flagged_listing" ? "scam" : "scam",
          detail: verdict.detail,
        })
        .onConflictDoNothing();
    }

    if (verdict.action === "allow" || verdict.action === "review") {
      await db
        .update(communityGroups)
        .set({
          messageCount: sql`${communityGroups.messageCount} + 1`,
          lastMessageAt: new Date(),
        })
        .where(eq(communityGroups.id, groupId));
    }

    const [hydrated] = await this.hydrate(userId, [message]);
    return { ...hydrated, clientId: dto.clientId };
  }

  /**
   * Loads the listing's STORED scam-gate annotation and screens the share.
   * Deliberately a plain metadata read — re-running detection here would let a
   * group card and the admin queue disagree about the same opportunity. A
   * missing opportunity is not a safety signal (it is a 404 the caller will
   * surface elsewhere), so it fails open.
   */
  private async screenSharedOpportunityId(
    opportunityId: string,
  ): Promise<SafetyVerdict> {
    const result = await db.execute(sql`
      select metadata
      from public.opportunities
      where id = ${opportunityId}::uuid
    `);
    const metadata = this.rows<{ metadata: unknown }>(result)[0]?.metadata;
    if (metadata === undefined) return { action: "allow" };
    return screenSharedOpportunity(metadata);
  }

  /**
   * Spec §2: 20 messages/minute and 300/hour per user per group. Counted from
   * the messages table itself rather than an in-memory counter, so the limit
   * holds across every Render instance and survives a restart.
   */
  private async assertUnderRateLimit(userId: string, groupId: string) {
    const limits = await this.limits.get();
    for (const window of buildRateWindows(limits)) {
      const result = await db.execute(sql`
        select count(*)::int as sent
        from public.community_messages
        where user_id = ${userId}
          and group_id = ${groupId}::uuid
          and created_at > now() - (${window.seconds} || ' seconds')::interval
      `);
      const sent = this.rows<{ sent: number }>(result)[0]?.sent ?? 0;
      if (sent >= window.max) {
        throw new TooManyRequestsException(window.label, window.seconds);
      }
    }
  }

  /**
   * Attaches author identity, reaction rollups and the caller's block list.
   * Blocked authors' content collapses to `blocked: true` with the body
   * stripped — the row still renders so the thread does not develop holes,
   * but nothing the blocker chose not to see reaches their device.
   */
  async hydrate(
    userId: string,
    rows: Array<typeof communityMessages.$inferSelect>,
  ): Promise<CommunityMessageDto[]> {
    if (!rows.length) return [];

    const authorIds = Array.from(new Set(rows.map((row) => row.userId)));
    const authorResult = await db.execute(sql`
      select p.user_id::text as user_id,
             coalesce(p.username, '') as username,
             coalesce(p.full_name, 'Edutu learner') as full_name,
             p.avatar_url
      from public.profiles p
      where p.user_id::text = any(${authorIds}::text[])
    `);
    const authors = new Map(
      this.rows<{
        user_id: string;
        username: string;
        full_name: string;
        avatar_url: string | null;
      }>(authorResult).map((row) => [row.user_id, row]),
    );

    const blockedResult = await db.execute(sql`
      select b.blocked_user_id::text as blocked
      from public.user_blocks b
      where b.blocker_user_id = public.clerk_id_to_uuid(${userId})::uuid
    `);
    const blockedDerived = new Set(
      this.rows<{ blocked: string }>(blockedResult).map((row) => row.blocked),
    );

    const messageIds = rows.map((row) => row.id);
    const reactionRows = await db
      .select({
        messageId: communityMessageReactions.messageId,
        emoji: communityMessageReactions.emoji,
        userId: communityMessageReactions.userId,
      })
      .from(communityMessageReactions)
      .where(inArray(communityMessageReactions.messageId, messageIds));

    const reactions = new Map<
      string,
      Map<string, { count: number; mine: boolean }>
    >();
    for (const row of reactionRows) {
      const byEmoji = reactions.get(row.messageId) ?? new Map();
      const entry = byEmoji.get(row.emoji) ?? { count: 0, mine: false };
      entry.count += 1;
      if (row.userId === userId) entry.mine = true;
      byEmoji.set(row.emoji, entry);
      reactions.set(row.messageId, byEmoji);
    }

    return rows.map((row) => {
      const author = authors.get(row.userId);
      // user_blocks is uuid-keyed legacy; compare through the same mapping the
      // rest of the app uses. This is the one sanctioned conversion site.
      const isBlocked = blockedDerived.size > 0 && blockedDerived.has(row.userId);
      return {
        id: row.id,
        groupId: row.groupId,
        userId: row.userId,
        authorUsername: author?.username || "",
        authorDisplayName: author?.full_name || "Edutu learner",
        authorAvatarUrl: author?.avatar_url ?? null,
        kind: row.kind as CommunityMessageDto["kind"],
        body: isBlocked ? null : (row.body ?? null),
        attachments: isBlocked ? [] : (row.attachments ?? []),
        opportunityId: isBlocked ? null : (row.opportunityId ?? null),
        replyToId: row.replyToId ?? null,
        savedToBrief: row.savedToBrief,
        createdAt: new Date(row.createdAt as unknown as string).toISOString(),
        reviewStatus: row.reviewStatus as CommunityMessageDto["reviewStatus"],
        safetyNote: isBlocked ? null : (row.safetyNote ?? null),
        reactions: Array.from(reactions.get(row.id)?.entries() ?? []).map(
          ([emoji, value]) => ({ emoji, count: value.count, mine: value.mine }),
        ),
        ...(isBlocked ? { blocked: true } : {}),
      };
    });
  }

  protected rows<T>(result: unknown): T[] {
    if (Array.isArray(result)) return result as T[];
    return (result as { rows?: T[] }).rows ?? [];
  }
}
```

> `NotFoundException` is imported for use by Task 9; drop it from the import until then if the linter
> complains.

- [ ] **Step 4: Note the `user_blocks` id-namespace caveat**

`user_blocks.blocked_user_id` is `uuid` (derived), while `community_messages.user_id` is the raw
Clerk sub. The comparison above must map one side. Replace the `blockedResult` query with this
version, which maps in SQL so the two namespaces never meet in JavaScript:

```ts
    const blockedResult = await db.execute(sql`
      select m.user_id
      from public.community_messages m
      where m.id = any(${rows.map((r) => r.id)}::uuid[])
        and exists (
          select 1 from public.user_blocks b
          where b.blocker_user_id = public.clerk_id_to_uuid(${userId})::uuid
            and b.blocked_user_id = public.clerk_id_to_uuid(m.user_id)::uuid
        )
    `);
    const blockedDerived = new Set(
      this.rows<{ user_id: string }>(blockedResult).map((row) => row.user_id),
    );
```

- [ ] **Step 5: Add the routes**

Append to `communities.controller.ts`:

```ts
  @Get("groups/:groupId/messages")
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  listMessages(
    @CurrentUser("authId") authId: string,
    @Param("groupId") groupId: string,
    @Query(new ZodValidationPipe(ListMessagesQuerySchema))
    query: ListMessagesQueryDto,
  ) {
    return this.messagesService.list(rawClerkUserId(authId), groupId, query);
  }

  @Post("groups/:groupId/messages")
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  sendMessage(
    @CurrentUser("authId") authId: string,
    @Param("groupId") groupId: string,
    @Body(new ZodValidationPipe(SendMessageSchema)) dto: SendMessageDto,
  ) {
    return this.messagesService.send(rawClerkUserId(authId), groupId, dto);
  }
```

Inject the service in the controller constructor:

```ts
  constructor(
    private readonly communitiesService: CommunitiesService,
    private readonly messagesService: CommunityMessagesService,
  ) {}
```

Add `CommunityMessagesService` to `providers` in `communities.module.ts` and to its `exports`.

- [ ] **Step 6: Run the suite, lint and boot smoke test**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/communities && npm run lint && npm run build && timeout 25 node dist/main
```

Expected: PASS; lint clean; `Nest application successfully started`.

- [ ] **Step 7: Commit**

```bash
git add backend/services/services/api/src/communities
git commit -m "feat(communities): message list and send with per-group rate limits"
```

---

## Task 9: Message actions — delete, react, save-to-brief, announcements

**Files:**
- Modify: `backend/services/services/api/src/communities/community-messages.service.ts`
- Modify: `backend/services/services/api/src/communities/communities.controller.ts`
- Create: `backend/services/services/api/src/communities/community-announcements.spec.ts`

**Interfaces:**
- Consumes: Task 8's `CommunityMessagesService`.
- Produces:
  ```ts
  deleteMessage(userId, groupId, messageId, reason?): Promise<{ success: true }>;
  toggleReaction(userId, groupId, messageId, emoji): Promise<{ emoji: string; count: number; mine: boolean }>;
  toggleSaveToBrief(userId, groupId, messageId): Promise<{ savedToBrief: boolean }>;
  postAnnouncement(userId, groupId, body): Promise<CommunityMessageDto>;
  postSystemMessage(groupId, body): Promise<CommunityMessageDto>;
  ```

- [ ] **Step 1: Write the failing test**

Create `backend/services/services/api/src/communities/community-announcements.spec.ts`:

```ts
import { ForbiddenException } from "@nestjs/common";
import { assertAnnouncementQuota } from "./community-messages.service";

describe("assertAnnouncementQuota", () => {
  it("allows the first announcement of the day", () => {
    expect(() => assertAnnouncementQuota(0, 1)).not.toThrow();
  });

  it("blocks the second when the cap is one per day", () => {
    expect(() => assertAnnouncementQuota(1, 1)).toThrow(ForbiddenException);
    expect(() => assertAnnouncementQuota(1, 1)).toThrow(
      /1 announcement a day/i,
    );
  });

  it("respects a raised admin cap", () => {
    expect(() => assertAnnouncementQuota(2, 3)).not.toThrow();
    expect(() => assertAnnouncementQuota(3, 3)).toThrow(ForbiddenException);
  });

  it("blocks everything when the cap is zero", () => {
    expect(() => assertAnnouncementQuota(0, 0)).toThrow(ForbiddenException);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/communities/community-announcements.spec.ts
```

Expected: FAIL — `assertAnnouncementQuota is not a function`.

- [ ] **Step 3: Implement**

Add to module scope in `community-messages.service.ts`:

```ts
/** Spec §2: @everyone announcements are capped at 1 per group per day. */
export function assertAnnouncementQuota(sentToday: number, cap: number): void {
  if (sentToday >= cap) {
    throw new ForbiddenException(
      `This group can post ${cap} announcement${cap === 1 ? "" : "s"} a day. Try again tomorrow.`,
    );
  }
}
```

Add these methods to `CommunityMessagesService`:

```ts
  /**
   * Soft delete. The row survives so replies do not dangle and so the
   * moderation queue can still show what was removed; RLS hides it from every
   * client the moment is_deleted flips.
   */
  async deleteMessage(
    userId: string,
    groupId: string,
    messageId: string,
    reason?: string,
  ) {
    const [message] = await db
      .select({
        id: communityMessages.id,
        userId: communityMessages.userId,
      })
      .from(communityMessages)
      .where(
        and(
          eq(communityMessages.id, messageId),
          eq(communityMessages.groupId, groupId),
        ),
      );
    if (!message) throw new NotFoundException("Message not found");

    // Authors may always delete their own message; anyone else needs the
    // delete_message permission.
    if (message.userId !== userId) {
      await assertGroupPermission(userId, groupId, "delete_message");
    } else {
      await assertGroupPermission(userId, groupId, "post");
    }

    await db
      .update(communityMessages)
      .set({
        isDeleted: true,
        deletedBy: userId,
        deletedReason: reason ?? null,
      })
      .where(eq(communityMessages.id, messageId));

    return { success: true as const };
  }

  async toggleReaction(
    userId: string,
    groupId: string,
    messageId: string,
    emoji: string,
  ) {
    await assertGroupPermission(userId, groupId, "react");

    const [message] = await db
      .select({ id: communityMessages.id })
      .from(communityMessages)
      .where(
        and(
          eq(communityMessages.id, messageId),
          eq(communityMessages.groupId, groupId),
        ),
      );
    if (!message) throw new NotFoundException("Message not found");

    const removed = await db
      .delete(communityMessageReactions)
      .where(
        and(
          eq(communityMessageReactions.messageId, messageId),
          eq(communityMessageReactions.userId, userId),
          eq(communityMessageReactions.emoji, emoji),
        ),
      )
      .returning({ id: communityMessageReactions.id });

    if (!removed.length) {
      await db
        .insert(communityMessageReactions)
        .values({ messageId, userId, emoji })
        .onConflictDoNothing();
    }

    const result = await db.execute(sql`
      select count(*)::int as count
      from public.community_message_reactions
      where message_id = ${messageId}::uuid and emoji = ${emoji}
    `);

    return {
      emoji,
      count: this.rows<{ count: number }>(result)[0]?.count ?? 0,
      mine: removed.length === 0,
    };
  }

  /**
   * ✦save-to-brief. Slice 2 only flips the flag and returns it; Slice 4 reads
   * `saved_to_brief` as its regeneration trigger. Nothing here knows about the
   * Brief, deliberately.
   */
  async toggleSaveToBrief(userId: string, groupId: string, messageId: string) {
    await assertGroupPermission(userId, groupId, "save");

    const [updated] = await db
      .update(communityMessages)
      .set({ savedToBrief: sql`not ${communityMessages.savedToBrief}` })
      .where(
        and(
          eq(communityMessages.id, messageId),
          eq(communityMessages.groupId, groupId),
        ),
      )
      .returning({ savedToBrief: communityMessages.savedToBrief });

    if (!updated) throw new NotFoundException("Message not found");
    return { savedToBrief: updated.savedToBrief };
  }

  async postAnnouncement(userId: string, groupId: string, body: string) {
    await assertGroupPermission(userId, groupId, "announce");

    const limits = await this.limits.get();
    const result = await db.execute(sql`
      select count(*)::int as sent
      from public.community_messages
      where group_id = ${groupId}::uuid
        and kind = 'announcement'
        and created_at > now() - interval '24 hours'
    `);
    assertAnnouncementQuota(
      this.rows<{ sent: number }>(result)[0]?.sent ?? 0,
      limits.announcementsPerDay,
    );

    // Announcements are stricter than ordinary messages on purpose: they push
    // to every member. A single signal that would merely `review` a chat
    // message refuses an announcement outright, so nothing flagged is ever
    // broadcast while it waits for a human.
    const verdict = screenMessage(body);
    if (verdict.action !== "allow") {
      throw new ForbiddenException(
        "The safety filter flagged that announcement. Edit it and try again.",
      );
    }

    const [message] = await db
      .insert(communityMessages)
      .values({ groupId, userId, kind: "announcement", body: body.trim() })
      .returning();

    await db
      .update(communityGroups)
      .set({
        messageCount: sql`${communityGroups.messageCount} + 1`,
        lastMessageAt: new Date(),
      })
      .where(eq(communityGroups.id, groupId));

    const [hydrated] = await this.hydrate(userId, [message]);
    return hydrated;
  }

  /**
   * System messages have no author and bypass every permission and rate check
   * — they are written by crons (expiry) and by membership events, never by a
   * user. `user_id` is the literal 'system' so the raw-Clerk-sub invariant
   * still holds (it is a text column, and no profile will ever match).
   */
  async postSystemMessage(groupId: string, body: string) {
    const [message] = await db
      .insert(communityMessages)
      .values({ groupId, userId: "system", kind: "system", body })
      .returning();
    const [hydrated] = await this.hydrate("system", [message]);
    return hydrated;
  }
```

- [ ] **Step 4: Add the routes**

Append to `communities.controller.ts`:

```ts
  @Delete("groups/:groupId/messages/:messageId")
  deleteMessage(
    @CurrentUser("authId") authId: string,
    @Param("groupId") groupId: string,
    @Param("messageId") messageId: string,
    @Query("reason") reason?: string,
  ) {
    return this.messagesService.deleteMessage(
      rawClerkUserId(authId),
      groupId,
      messageId,
      reason,
    );
  }

  @Post("groups/:groupId/messages/:messageId/reactions")
  react(
    @CurrentUser("authId") authId: string,
    @Param("groupId") groupId: string,
    @Param("messageId") messageId: string,
    @Body(new ZodValidationPipe(ReactionSchema)) dto: ReactionDto,
  ) {
    return this.messagesService.toggleReaction(
      rawClerkUserId(authId),
      groupId,
      messageId,
      dto.emoji,
    );
  }

  @Post("groups/:groupId/messages/:messageId/save")
  saveToBrief(
    @CurrentUser("authId") authId: string,
    @Param("groupId") groupId: string,
    @Param("messageId") messageId: string,
  ) {
    return this.messagesService.toggleSaveToBrief(
      rawClerkUserId(authId),
      groupId,
      messageId,
    );
  }

  @Post("groups/:groupId/announcements")
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  announce(
    @CurrentUser("authId") authId: string,
    @Param("groupId") groupId: string,
    @Body(new ZodValidationPipe(AnnouncementSchema)) dto: AnnouncementDto,
  ) {
    return this.messagesService.postAnnouncement(
      rawClerkUserId(authId),
      groupId,
      dto.body,
    );
  }
```

Extend the DTO import with `ReactionSchema`, `AnnouncementSchema`, `type ReactionDto`,
`type AnnouncementDto`.

- [ ] **Step 5: Run the tests and lint**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/communities && npm run lint
```

Expected: PASS; lint clean.

- [ ] **Step 6: Commit**

```bash
git add backend/services/services/api/src/communities
git commit -m "feat(communities): delete, reactions, save-to-brief and announcements"
```

---

## Task 10: Images in chat — reuse the uploads service

**Files:**
- Modify: `backend/services/services/api/src/uploads/uploads.service.ts`
- Modify: `backend/services/services/api/src/uploads/uploads.module.ts`
- Create: `backend/services/services/api/src/uploads/community-image-upload.spec.ts`
- Modify: `backend/services/services/api/src/communities/communities.controller.ts`
- Modify: `backend/services/services/api/src/communities/community-messages.service.ts`

**Interfaces:**
- Consumes: `UploadsService` (existing), `assertGroupPermission` (Task 3).
- Produces:
  ```ts
  // UploadsService
  createSignedCommunityImageUpload(userId: string, groupId: string, input: { fileName: string; mimeType: string }):
    Promise<{ uploadUrl: string; publicUrl: string; storagePath: string }>;
  communityImagePublicUrlPrefix(): string;
  export const COMMUNITY_IMAGES_BUCKET: string;
  export const COMMUNITY_IMAGE_MIME_TYPES: readonly string[];
  // route
  POST /communities/groups/:groupId/images  → { uploadUrl, publicUrl, storagePath }
  ```

> Why a new bucket rather than `cv-files`: `cv-files` is private and served through 5-minute signed
> URLs (`uploads.service.ts:18`). A chat attachment must render for every member for years, so it needs
> a durable public URL — the same shape `blog.service.ts` already uses for `blog-images`. The bucket is
> created lazily with `listBuckets()/createBucket()`, exactly as `BlogService.ensureBucket()` does.

- [ ] **Step 1: Write the failing test**

Create `backend/services/services/api/src/uploads/community-image-upload.spec.ts`:

```ts
import { UnsupportedMediaTypeException } from "@nestjs/common";
import { UploadsService, COMMUNITY_IMAGES_BUCKET } from "./uploads.service";

function fakeSupabase() {
  const uploadUrl = "https://storage.test/signed/put";
  return {
    storage: {
      listBuckets: jest
        .fn()
        .mockResolvedValue({ data: [{ name: COMMUNITY_IMAGES_BUCKET }], error: null }),
      createBucket: jest.fn().mockResolvedValue({ error: null }),
      from: jest.fn().mockReturnValue({
        createSignedUploadUrl: jest
          .fn()
          .mockResolvedValue({ data: { signedUrl: uploadUrl }, error: null }),
        getPublicUrl: jest.fn().mockImplementation((path: string) => ({
          data: { publicUrl: `https://storage.test/public/${path}` },
        })),
      }),
    },
  };
}

describe("UploadsService.createSignedCommunityImageUpload", () => {
  it("rejects a non-image mime type", async () => {
    const service = new UploadsService(fakeSupabase() as never);
    await expect(
      service.createSignedCommunityImageUpload("user_1", "group-1", {
        fileName: "cv.pdf",
        mimeType: "application/pdf",
      }),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
  });

  it("returns an upload url and a durable public url under the group prefix", async () => {
    const supabase = fakeSupabase();
    const service = new UploadsService(supabase as never);
    const result = await service.createSignedCommunityImageUpload(
      "user_1",
      "group-1",
      { fileName: "my photo!.png", mimeType: "image/png" },
    );

    expect(result.uploadUrl).toBe("https://storage.test/signed/put");
    expect(result.storagePath).toMatch(/^group-1\/user_1\/[0-9a-f-]+-my_photo_\.png$/);
    expect(result.publicUrl).toBe(
      `https://storage.test/public/${result.storagePath}`,
    );
    expect(supabase.storage.from).toHaveBeenCalledWith(COMMUNITY_IMAGES_BUCKET);
  });

  it("creates the bucket when it does not exist yet", async () => {
    const supabase = fakeSupabase();
    supabase.storage.listBuckets = jest
      .fn()
      .mockResolvedValue({ data: [], error: null });
    const service = new UploadsService(supabase as never);
    await service.createSignedCommunityImageUpload("user_1", "group-1", {
      fileName: "a.webp",
      mimeType: "image/webp",
    });
    expect(supabase.storage.createBucket).toHaveBeenCalledWith(
      COMMUNITY_IMAGES_BUCKET,
      { public: true },
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/uploads/community-image-upload.spec.ts
```

Expected: FAIL — `service.createSignedCommunityImageUpload is not a function`.

- [ ] **Step 3: Extend `UploadsService`**

Add near the top of `backend/services/services/api/src/uploads/uploads.service.ts`, beside the
existing `const BUCKET = "cv-files";`:

```ts
/**
 * Chat attachments live in their own PUBLIC bucket. `cv-files` is private and
 * served through 5-minute signed URLs, which is right for a CV and wrong for a
 * message attachment that has to render for every member for years.
 */
export const COMMUNITY_IMAGES_BUCKET =
  process.env.COMMUNITY_IMAGES_BUCKET || "community-images";

export const COMMUNITY_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
```

Add these methods to the `UploadsService` class:

```ts
  /**
   * Direct-to-storage upload for a chat image. The API never sees the bytes.
   * The returned `publicUrl` is what the client puts in
   * `SendMessageInput.attachments[].url`; the send path validates that the URL
   * starts with this bucket's public prefix, so a client cannot attach an
   * arbitrary third-party (or malicious) URL to a message.
   */
  async createSignedCommunityImageUpload(
    userId: string,
    groupId: string,
    input: { fileName: string; mimeType: string },
  ): Promise<{ uploadUrl: string; publicUrl: string; storagePath: string }> {
    if (
      !(COMMUNITY_IMAGE_MIME_TYPES as readonly string[]).includes(
        input.mimeType,
      )
    ) {
      throw new UnsupportedMediaTypeException(
        `Unsupported image type: ${input.mimeType}`,
      );
    }

    await this.ensureCommunityImagesBucket();

    const safeName = input.fileName
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 120);
    const storagePath = `${groupId}/${userId}/${randomUUID()}-${safeName}`;

    const bucket = this.supabase.storage.from(COMMUNITY_IMAGES_BUCKET);
    const { data: signed, error } = await bucket.createSignedUploadUrl(
      storagePath,
    );
    if (error || !signed) {
      throw new BadRequestException(
        `Could not create upload URL: ${error?.message ?? "unknown"}`,
      );
    }

    const { data: publicData } = bucket.getPublicUrl(storagePath);
    return {
      uploadUrl: signed.signedUrl,
      publicUrl: publicData.publicUrl,
      storagePath,
    };
  }

  /** Public URL prefix for the community images bucket, used to validate attachments. */
  communityImagePublicUrlPrefix(): string {
    const { data } = this.supabase.storage
      .from(COMMUNITY_IMAGES_BUCKET)
      .getPublicUrl("");
    return data.publicUrl;
  }

  private communityBucketReady = false;

  private async ensureCommunityImagesBucket(): Promise<void> {
    if (this.communityBucketReady) return;
    const { data: buckets, error } = await this.supabase.storage.listBuckets();
    if (error) throw error;
    if (!buckets?.some((bucket) => bucket.name === COMMUNITY_IMAGES_BUCKET)) {
      const { error: createError } = await this.supabase.storage.createBucket(
        COMMUNITY_IMAGES_BUCKET,
        { public: true },
      );
      if (createError) throw createError;
    }
    this.communityBucketReady = true;
  }
```

- [ ] **Step 4: Export `UploadsService` from its module**

`backend/services/services/api/src/uploads/uploads.module.ts` must read:

```ts
import { Module } from "@nestjs/common";
import { UploadsController } from "./uploads.controller";
import { UploadsService } from "./uploads.service";

@Module({
  controllers: [UploadsController],
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
```

- [ ] **Step 5: Validate attachment URLs on send**

In `community-messages.service.ts`, inject the uploads service:

```ts
  constructor(
    private readonly limits: CommunityLimitsService,
    private readonly uploads: UploadsService,
  ) {}
```

(import `UploadsService` from `../uploads/uploads.service`), and insert this check in `send()`
immediately after the `screenMessage` block:

```ts
    if (dto.attachments.length) {
      const prefix = this.uploads.communityImagePublicUrlPrefix();
      const foreign = dto.attachments.find(
        (attachment) => !attachment.url.startsWith(prefix),
      );
      if (foreign) {
        throw new BadRequestException(
          "Attachments must be uploaded through Edutu.",
        );
      }
    }
```

- [ ] **Step 6: Add the upload route**

Append to `communities.controller.ts` (inject `UploadsService` in the constructor):

```ts
  @Post("groups/:groupId/images")
  @Throttle({ default: { limit: 30, ttl: 3600000 } })
  async createImageUpload(
    @CurrentUser("authId") authId: string,
    @Param("groupId") groupId: string,
    @Body(new ZodValidationPipe(CreateImageUploadSchema))
    dto: CreateImageUploadDto,
  ) {
    const userId = rawClerkUserId(authId);
    await assertGroupPermission(userId, groupId, "post");
    return this.uploadsService.createSignedCommunityImageUpload(
      userId,
      groupId,
      dto,
    );
  }
```

Import `assertGroupPermission` from `./community-permissions`, `UploadsService` from
`../uploads/uploads.service`, and extend the DTO import with `CreateImageUploadSchema` +
`type CreateImageUploadDto`.

- [ ] **Step 7: Run the tests, lint and boot smoke test**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/uploads src/communities && npm run lint && npm run build && timeout 25 node dist/main
```

Expected: PASS (including the existing `uploads.service.spec.ts`); lint clean; app boots.

- [ ] **Step 8: Commit**

```bash
git add backend/services/services/api/src/uploads backend/services/services/api/src/communities
git commit -m "feat(communities): chat image attachments on a public storage bucket"
```

---

## Task 11: Invite links — hashed tokens, preview, accept, revoke

**Files:**
- Create: `backend/services/services/api/src/communities/community-invites.service.ts`
- Create: `backend/services/services/api/src/communities/community-invites.service.spec.ts`
- Modify: `backend/services/services/api/src/communities/communities.controller.ts`
- Modify: `backend/services/services/api/src/communities/communities.module.ts`

**Interfaces:**
- Consumes: `hashApiKey`, `safeEqualHash` from `../common/api-key-hash`;
  `assertGroupPermission` (Task 3); `CommunitiesService.addMember` (Task 6).
- Produces:
  ```ts
  export function mintInviteToken(): { token: string; tokenHash: string; tokenPrefix: string };
  export function inviteUrl(token: string): string;
  export function inviteRejection(row: InviteRow, now: Date): InviteRejection | null;
  export type InviteRejection = 'revoked' | 'expired' | 'exhausted';
  export class CommunityInvitesService {
    create(userId, groupId, dto): Promise<{ id: string; url: string; token: string; tokenPrefix: string; roleOnJoin; maxUses; expiresAt }>;
    revoke(userId, groupId, inviteId): Promise<{ success: true }>;
    preview(token): Promise<InvitePreviewDto>;
    accept(userId, token): Promise<{ status: 'joined'; groupId: string; groupSlug: string }>;
    listForGroup(userId, groupId): Promise<InviteSummaryDto[]>;
  }
  export type InvitePreviewDto = { groupId: string; groupSlug: string; name: string;
    description: string | null; iconUrl: string | null; memberCount: number; rules: string | null;
    spaceSlug: string; valid: boolean; reason: InviteRejection | null };
  ```

- [ ] **Step 1: Write the failing test**

Create `backend/services/services/api/src/communities/community-invites.service.spec.ts`:

```ts
import { hashApiKey } from "../common/api-key-hash";
import {
  inviteRejection,
  inviteUrl,
  mintInviteToken,
} from "./community-invites.service";

describe("mintInviteToken", () => {
  const originalPepper = process.env.API_KEY_PEPPER;
  afterEach(() => {
    if (originalPepper === undefined) delete process.env.API_KEY_PEPPER;
    else process.env.API_KEY_PEPPER = originalPepper;
  });

  it("produces a 22-character url-safe token", () => {
    for (let i = 0; i < 50; i += 1) {
      const { token } = mintInviteToken();
      expect(token).toHaveLength(22);
      expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    }
  });

  it("stores the token hashed with the API_KEY_PEPPER helper, never in the clear", () => {
    process.env.API_KEY_PEPPER = "super-secret-pepper-value-32chars!!";
    const { token, tokenHash } = mintInviteToken();
    expect(tokenHash).not.toContain(token);
    expect(tokenHash).toBe(hashApiKey(token));
  });

  it("stores a 6-character prefix for admin lookup", () => {
    const { token, tokenPrefix } = mintInviteToken();
    expect(tokenPrefix).toBe(token.slice(0, 6));
  });

  it("never repeats a token across many mints", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) seen.add(mintInviteToken().token);
    expect(seen.size).toBe(500);
  });
});

describe("inviteUrl", () => {
  const original = process.env.PUBLIC_APP_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.PUBLIC_APP_URL;
    else process.env.PUBLIC_APP_URL = original;
  });

  it("builds the /g/<token> link on the configured public origin", () => {
    process.env.PUBLIC_APP_URL = "https://edutu.org/";
    expect(inviteUrl("abc")).toBe("https://edutu.org/g/abc");
  });

  it("falls back to edutu.org", () => {
    delete process.env.PUBLIC_APP_URL;
    expect(inviteUrl("abc")).toBe("https://edutu.org/g/abc");
  });
});

describe("inviteRejection", () => {
  const NOW = new Date("2026-07-25T12:00:00.000Z");

  it("accepts a live invite", () => {
    expect(
      inviteRejection(
        { revokedAt: null, expiresAt: null, maxUses: null, uses: 0 },
        NOW,
      ),
    ).toBeNull();
  });

  it("rejects a revoked invite", () => {
    expect(
      inviteRejection(
        { revokedAt: new Date("2026-07-01"), expiresAt: null, maxUses: null, uses: 0 },
        NOW,
      ),
    ).toBe("revoked");
  });

  it("rejects an expired invite", () => {
    expect(
      inviteRejection(
        { revokedAt: null, expiresAt: new Date("2026-07-24"), maxUses: null, uses: 0 },
        NOW,
      ),
    ).toBe("expired");
  });

  it("rejects an exhausted invite", () => {
    expect(
      inviteRejection(
        { revokedAt: null, expiresAt: null, maxUses: 5, uses: 5 },
        NOW,
      ),
    ).toBe("exhausted");
  });

  it("reports revocation ahead of expiry", () => {
    expect(
      inviteRejection(
        {
          revokedAt: new Date("2026-07-01"),
          expiresAt: new Date("2026-07-02"),
          maxUses: null,
          uses: 0,
        },
        NOW,
      ),
    ).toBe("revoked");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/communities/community-invites.service.spec.ts
```

Expected: FAIL — `Cannot find module './community-invites.service'`.

- [ ] **Step 3: Implement the service**

Create `backend/services/services/api/src/communities/community-invites.service.ts`:

```ts
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { hashApiKey } from "../common/api-key-hash";
import { communityGroups, communityInvites, communitySpaces } from "../db/schema";
import { CommunitiesService } from "./communities.service";
import { assertGroupPermission, loadGroupContext } from "./community-permissions";
import type { CreateInviteDto } from "./dto/community.dto";

const TOKEN_LENGTH = 22;

export type InviteRejection = "revoked" | "expired" | "exhausted";

export type InviteRow = {
  revokedAt: Date | null;
  expiresAt: Date | null;
  maxUses: number | null;
  uses: number;
};

export type InvitePreviewDto = {
  groupId: string;
  groupSlug: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  memberCount: number;
  rules: string | null;
  spaceSlug: string;
  valid: boolean;
  reason: InviteRejection | null;
};

export type InviteSummaryDto = {
  id: string;
  tokenPrefix: string;
  roleOnJoin: string;
  maxUses: number | null;
  uses: number;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

/**
 * 22 url-safe characters ≈ 132 bits of entropy — the same order as a Stripe
 * key, and short enough to type. Stored HASHED with the existing API-key
 * helper (HMAC-SHA256 keyed by API_KEY_PEPPER), so a leaked community_invites
 * table cannot be turned into working invite links. `token_prefix` lets an
 * admin identify a link in the queue without the secret ever being stored.
 */
export function mintInviteToken(): {
  token: string;
  tokenHash: string;
  tokenPrefix: string;
} {
  const token = randomBytes(24)
    .toString("base64url")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, TOKEN_LENGTH);
  return {
    token,
    tokenHash: hashApiKey(token),
    tokenPrefix: token.slice(0, 6),
  };
}

export function inviteUrl(token: string): string {
  const origin = (process.env.PUBLIC_APP_URL || "https://edutu.org").replace(
    /\/+$/,
    "",
  );
  return `${origin}/g/${token}`;
}

export function inviteRejection(
  row: InviteRow,
  now: Date,
): InviteRejection | null {
  if (row.revokedAt) return "revoked";
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return "expired";
  if (row.maxUses !== null && row.uses >= row.maxUses) return "exhausted";
  return null;
}

@Injectable()
export class CommunityInvitesService {
  constructor(private readonly communitiesService: CommunitiesService) {}

  async create(userId: string, groupId: string, dto: CreateInviteDto) {
    const context = await assertGroupPermission(userId, groupId, "invite");
    if (dto.roleOnJoin === "admin" && context.role !== "owner") {
      throw new ForbiddenException("Only the owner can invite admins.");
    }

    const { token, tokenHash, tokenPrefix } = mintInviteToken();
    const expiresAt = dto.expiresInDays
      ? new Date(Date.now() + dto.expiresInDays * 86_400_000)
      : null;

    const [invite] = await db
      .insert(communityInvites)
      .values({
        groupId,
        tokenHash,
        tokenPrefix,
        createdBy: userId,
        roleOnJoin: dto.roleOnJoin,
        maxUses: dto.maxUses ?? null,
        expiresAt,
      })
      .returning();

    // The raw token is returned exactly ONCE, here. It is never persisted and
    // never retrievable again — the same contract as an API key.
    return {
      id: invite.id,
      token,
      tokenPrefix,
      url: inviteUrl(token),
      roleOnJoin: invite.roleOnJoin,
      maxUses: invite.maxUses,
      expiresAt: invite.expiresAt ? invite.expiresAt.toISOString() : null,
    };
  }

  async revoke(userId: string, groupId: string, inviteId: string) {
    await assertGroupPermission(userId, groupId, "invite");
    const [revoked] = await db
      .update(communityInvites)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(communityInvites.id, inviteId),
          eq(communityInvites.groupId, groupId),
          sql`${communityInvites.revokedAt} is null`,
        ),
      )
      .returning({ id: communityInvites.id });
    if (!revoked) throw new NotFoundException("Invite not found");
    return { success: true as const };
  }

  async listForGroup(
    userId: string,
    groupId: string,
  ): Promise<InviteSummaryDto[]> {
    await assertGroupPermission(userId, groupId, "invite");
    const rows = await db
      .select()
      .from(communityInvites)
      .where(eq(communityInvites.groupId, groupId))
      .orderBy(desc(communityInvites.createdAt))
      .limit(50);
    return rows.map((row) => ({
      id: row.id,
      tokenPrefix: row.tokenPrefix,
      roleOnJoin: row.roleOnJoin,
      maxUses: row.maxUses,
      uses: row.uses,
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
      createdAt: new Date(row.createdAt as unknown as string).toISOString(),
    }));
  }

  /**
   * Unauthenticated preview for the /g/<token> landing page. Returns enough to
   * render a persuasive card and nothing more — no member list, no messages.
   * An invalid token still returns 404 rather than leaking which tokens exist.
   */
  async preview(token: string): Promise<InvitePreviewDto> {
    const invite = await this.findByToken(token);
    const [group] = await db
      .select({
        id: communityGroups.id,
        slug: communityGroups.slug,
        name: communityGroups.name,
        description: communityGroups.description,
        iconUrl: communityGroups.iconUrl,
        rules: communityGroups.rules,
        memberCount: communityGroups.memberCount,
        status: communityGroups.status,
        spaceSlug: communitySpaces.slug,
      })
      .from(communityGroups)
      .innerJoin(communitySpaces, eq(communitySpaces.id, communityGroups.spaceId))
      .where(eq(communityGroups.id, invite.groupId));

    if (!group) throw new NotFoundException("Invite not found");

    const reason =
      group.status !== "active"
        ? "expired"
        : inviteRejection(
            {
              revokedAt: invite.revokedAt,
              expiresAt: invite.expiresAt,
              maxUses: invite.maxUses,
              uses: invite.uses,
            },
            new Date(),
          );

    return {
      groupId: group.id,
      groupSlug: group.slug,
      name: group.name,
      description: group.description ?? null,
      iconUrl: group.iconUrl ?? null,
      memberCount: group.memberCount,
      rules: group.rules ?? null,
      spaceSlug: group.spaceSlug,
      valid: reason === null,
      reason,
    };
  }

  async accept(userId: string, token: string) {
    const invite = await this.findByToken(token);

    const reason = inviteRejection(
      {
        revokedAt: invite.revokedAt,
        expiresAt: invite.expiresAt,
        maxUses: invite.maxUses,
        uses: invite.uses,
      },
      new Date(),
    );
    if (reason) throw new ForbiddenException(`This invite link is ${reason}.`);

    const context = await loadGroupContext(userId, invite.groupId);
    if (context.bannedAt) {
      throw new ForbiddenException("You have been removed from this group.");
    }
    if (context.group.status !== "active") {
      throw new ForbiddenException("This group is no longer active.");
    }

    if (!context.role) {
      await this.communitiesService.addMember(
        invite.groupId,
        userId,
        invite.roleOnJoin as "admin" | "mod" | "member",
      );
      // Only a real join burns a use, so refreshing the landing page cannot
      // exhaust a max_uses=1 link.
      await db
        .update(communityInvites)
        .set({ uses: sql`${communityInvites.uses} + 1` })
        .where(eq(communityInvites.id, invite.id));
    }

    return {
      status: "joined" as const,
      groupId: context.group.id,
      groupSlug: context.group.slug,
    };
  }

  /**
   * Lookup is by HASH, not by prefix: the prefix is not unique enough to be a
   * key and using it would turn a 6-character guess into a valid lookup.
   */
  private async findByToken(token: string) {
    const [invite] = await db
      .select()
      .from(communityInvites)
      .where(eq(communityInvites.tokenHash, hashApiKey(token)));
    if (!invite) throw new NotFoundException("Invite not found");
    return invite;
  }
}
```

- [ ] **Step 4: Add the routes**

Append to `communities.controller.ts` (inject `CommunityInvitesService`, import `Public` from `../auth`):

```ts
  @Get("groups/:groupId/invites")
  listInvites(
    @CurrentUser("authId") authId: string,
    @Param("groupId") groupId: string,
  ) {
    return this.invitesService.listForGroup(rawClerkUserId(authId), groupId);
  }

  @Post("groups/:groupId/invites")
  @Throttle({ default: { limit: 20, ttl: 3600000 } })
  createInvite(
    @CurrentUser("authId") authId: string,
    @Param("groupId") groupId: string,
    @Body(new ZodValidationPipe(CreateInviteSchema)) dto: CreateInviteDto,
  ) {
    return this.invitesService.create(rawClerkUserId(authId), groupId, dto);
  }

  @Delete("groups/:groupId/invites/:inviteId")
  revokeInvite(
    @CurrentUser("authId") authId: string,
    @Param("groupId") groupId: string,
    @Param("inviteId") inviteId: string,
  ) {
    return this.invitesService.revoke(
      rawClerkUserId(authId),
      groupId,
      inviteId,
    );
  }

  // Public so the /g/<token> landing page renders before sign-in — that page
  // IS the acquisition funnel. Throttled hard because it is the only
  // unauthenticated surface in this module.
  @Public()
  @Get("invites/:token")
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  previewInvite(@Param("token") token: string) {
    return this.invitesService.preview(token);
  }

  @Post("invites/:token/accept")
  @Throttle({ default: { limit: 20, ttl: 3600000 } })
  acceptInvite(
    @CurrentUser("authId") authId: string,
    @Param("token") token: string,
  ) {
    return this.invitesService.accept(rawClerkUserId(authId), token);
  }
```

Extend the DTO import with `CreateInviteSchema` + `type CreateInviteDto`. Add
`CommunityInvitesService` to `providers` and `exports` in `communities.module.ts`.

> **Route-order gotcha:** `@Get("invites/:token")` must be declared **before** any
> `@Get(":something")` wildcard on this controller. There is none today; keep it that way.

- [ ] **Step 5: Run the tests, lint and boot smoke test**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/communities && npm run lint && npm run build && timeout 25 node dist/main
```

Expected: PASS; lint clean; app boots.

- [ ] **Step 6: Commit**

```bash
git add backend/services/services/api/src/communities
git commit -m "feat(communities): revocable hashed invite links with public preview"
```

---

## Task 12: Moderation — reports, blocks, admin queue endpoints, SLA

**Files:**
- Create: `backend/services/services/api/src/communities/community-moderation.service.ts`
- Create: `backend/services/services/api/src/communities/community-moderation.service.spec.ts`
- Create: `backend/services/services/api/src/communities/communities-admin.controller.ts`
- Modify: `backend/services/services/api/src/communities/communities.controller.ts`
- Modify: `backend/services/services/api/src/communities/communities.module.ts`

**Interfaces:**
- Consumes: `userBlocks` + `toDatabaseUserId`; `CommunityLimitsService` (Task 4);
  `AuditService` (`../common/audit`).
- Produces:
  ```ts
  export function reportSlaState(createdAt: Date, slaHours: number, now?: Date):
    { hoursRemaining: number; breached: boolean };
  export class CommunityModerationService {
    report(userId, dto): Promise<{ id: string; slaHours: number }>;
    blockUser(userId, blockedUserId): Promise<{ success: true }>;
    unblockUser(userId, blockedUserId): Promise<{ success: true }>;
    listQueue(query): Promise<{ reports: AdminReportDto[]; slaHours: number; openCount: number; breachedCount: number }>;
    resolve(adminId, reportId, dto): Promise<{ success: true }>;
  }
  export type AdminReportDto = { id: string; targetType; targetId: string; groupId: string | null;
    groupName: string | null; reporterUserId: string; reporterName: string; reason: string;
    detail: string | null; status: string; createdAt: string; hoursRemaining: number;
    breached: boolean; reportCount: number; preview: string | null; authorUserId: string | null;
    authorName: string | null };
  export type ResolveReportDto = { action: 'dismiss'|'delete_message'|'ban_user'|'suspend_group'; note?: string };
  ```
- Routes: `POST /communities/reports`, `POST /communities/blocks`, `DELETE /communities/blocks/:userId`,
  `GET /admin/communities/reports`, `PATCH /admin/communities/reports/:reportId`.

- [ ] **Step 1: Write the failing test**

Create `backend/services/services/api/src/communities/community-moderation.service.spec.ts`:

```ts
import { reportSlaState, resolutionToStatus } from "./community-moderation.service";

describe("reportSlaState", () => {
  const NOW = new Date("2026-07-25T12:00:00.000Z");

  it("reports the hours left inside the window", () => {
    expect(
      reportSlaState(new Date("2026-07-25T06:00:00.000Z"), 24, NOW),
    ).toEqual({ hoursRemaining: 18, breached: false });
  });

  it("flags a breach once the window has passed", () => {
    expect(
      reportSlaState(new Date("2026-07-23T06:00:00.000Z"), 24, NOW),
    ).toEqual({ hoursRemaining: 0, breached: true });
  });

  it("treats the exact boundary as breached", () => {
    expect(
      reportSlaState(new Date("2026-07-24T12:00:00.000Z"), 24, NOW),
    ).toEqual({ hoursRemaining: 0, breached: true });
  });

  it("rounds down to whole hours", () => {
    expect(
      reportSlaState(new Date("2026-07-25T11:30:00.000Z"), 24, NOW)
        .hoursRemaining,
    ).toBe(23);
  });
});

describe("resolutionToStatus", () => {
  it("maps dismiss to dismissed and everything else to actioned", () => {
    expect(resolutionToStatus("dismiss")).toBe("dismissed");
    expect(resolutionToStatus("delete_message")).toBe("actioned");
    expect(resolutionToStatus("ban_user")).toBe("actioned");
    expect(resolutionToStatus("suspend_group")).toBe("actioned");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/communities/community-moderation.service.spec.ts
```

Expected: FAIL — `Cannot find module './community-moderation.service'`.

- [ ] **Step 3: Implement the service**

Create `backend/services/services/api/src/communities/community-moderation.service.ts`:

```ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { toDatabaseUserId } from "../common/user-id";
import {
  communityGroupMembers,
  communityGroups,
  communityMessages,
  communityReports,
  userBlocks,
} from "../db/schema";
import { CommunityLimitsService } from "./community-limits";
import type { CreateReportDto } from "./dto/community.dto";

export type ResolveReportAction =
  | "dismiss"
  | "delete_message"
  | "ban_user"
  | "suspend_group";

export type ResolveReportDto = { action: ResolveReportAction; note?: string };

export type AdminReportDto = {
  id: string;
  targetType: string;
  targetId: string;
  groupId: string | null;
  groupName: string | null;
  reporterUserId: string;
  reporterName: string;
  reason: string;
  detail: string | null;
  status: string;
  createdAt: string;
  hoursRemaining: number;
  breached: boolean;
  reportCount: number;
  preview: string | null;
  authorUserId: string | null;
  authorName: string | null;
};

/**
 * Spec §9.5: a published 24-hour action SLA. The queue is prioritised by
 * remaining time so the oldest unactioned report is always at the top, and a
 * breach is visible rather than silent.
 */
export function reportSlaState(
  createdAt: Date,
  slaHours: number,
  now: Date = new Date(),
): { hoursRemaining: number; breached: boolean } {
  const elapsedHours = (now.getTime() - createdAt.getTime()) / 3_600_000;
  const remaining = slaHours - elapsedHours;
  if (remaining <= 0) return { hoursRemaining: 0, breached: true };
  return { hoursRemaining: Math.floor(remaining), breached: false };
}

export function resolutionToStatus(action: ResolveReportAction) {
  return action === "dismiss" ? "dismissed" : "actioned";
}

@Injectable()
export class CommunityModerationService {
  constructor(private readonly limits: CommunityLimitsService) {}

  /**
   * Anyone signed in may report any target. The unique index on
   * (reporter, target_type, target_id) makes a repeat report idempotent —
   * report-bombing one message inflates nothing.
   */
  async report(userId: string, dto: CreateReportDto) {
    const limits = await this.limits.get();

    const [inserted] = await db
      .insert(communityReports)
      .values({
        targetType: dto.targetType,
        targetId: dto.targetId,
        groupId: dto.groupId ?? null,
        reporterUserId: userId,
        reason: dto.reason,
        detail: dto.detail ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: communityReports.id });

    if (dto.blockAuthor && dto.targetType === "message") {
      const [message] = await db
        .select({ userId: communityMessages.userId })
        .from(communityMessages)
        .where(eq(communityMessages.id, dto.targetId));
      if (message) await this.blockUser(userId, message.userId);
    }

    return { id: inserted?.id ?? "", slaHours: limits.reportSlaHours };
  }

  /**
   * user_blocks is the pre-existing uuid-keyed table (Apple Guideline 1.2).
   * This is the one sanctioned conversion boundary out of the raw-Clerk-sub
   * namespace — nowhere else in this module calls toDatabaseUserId.
   */
  async blockUser(userId: string, blockedUserId: string) {
    if (userId === blockedUserId) {
      throw new BadRequestException("You cannot block yourself.");
    }
    await db
      .insert(userBlocks)
      .values({
        blockerUserId: toDatabaseUserId(userId),
        blockedUserId: toDatabaseUserId(blockedUserId),
      })
      .onConflictDoNothing({
        target: [userBlocks.blockerUserId, userBlocks.blockedUserId],
      });
    return { success: true as const };
  }

  async unblockUser(userId: string, blockedUserId: string) {
    await db
      .delete(userBlocks)
      .where(
        and(
          eq(userBlocks.blockerUserId, toDatabaseUserId(userId)),
          eq(userBlocks.blockedUserId, toDatabaseUserId(blockedUserId)),
        ),
      );
    return { success: true as const };
  }

  async listQueue(query: { status?: string; limit?: number }) {
    const limits = await this.limits.get();
    const status = query.status && query.status !== "all" ? query.status : null;
    const limit = Math.min(Math.max(query.limit ?? 100, 1), 200);

    const result = await db.execute(sql`
      select r.id,
             r.target_type,
             r.target_id,
             r.group_id,
             r.reporter_user_id,
             r.reason,
             r.detail,
             r.status,
             r.created_at,
             g.name as group_name,
             coalesce(rp.full_name, 'Edutu learner') as reporter_name,
             msg.body as preview,
             msg.user_id as author_user_id,
             coalesce(ap.full_name, 'Edutu learner') as author_name,
             (
               select count(*)::int from public.community_reports dup
               where dup.target_type = r.target_type and dup.target_id = r.target_id
             ) as report_count
      from public.community_reports r
      left join public.community_groups g on g.id = r.group_id
      left join public.profiles rp on rp.user_id::text = r.reporter_user_id
      left join public.community_messages msg
        on r.target_type = 'message' and msg.id::text = r.target_id
      left join public.profiles ap on ap.user_id::text = msg.user_id
      where (${status}::text is null or r.status = ${status})
      order by r.created_at asc
      limit ${limit}
    `);

    const now = new Date();
    const reports = this.rows<Record<string, unknown>>(result).map((row) => {
      const createdAt = new Date(row.created_at as string);
      const sla = reportSlaState(createdAt, limits.reportSlaHours, now);
      return {
        id: String(row.id),
        targetType: String(row.target_type),
        targetId: String(row.target_id),
        groupId: (row.group_id as string) ?? null,
        groupName: (row.group_name as string) ?? null,
        reporterUserId: String(row.reporter_user_id),
        reporterName: String(row.reporter_name),
        reason: String(row.reason),
        detail: (row.detail as string) ?? null,
        status: String(row.status),
        createdAt: createdAt.toISOString(),
        hoursRemaining: sla.hoursRemaining,
        breached: sla.breached,
        reportCount: Number(row.report_count ?? 1),
        preview: (row.preview as string) ?? null,
        authorUserId: (row.author_user_id as string) ?? null,
        authorName: (row.author_name as string) ?? null,
      } satisfies AdminReportDto;
    });

    return {
      reports,
      slaHours: limits.reportSlaHours,
      openCount: reports.filter((report) => report.status === "open").length,
      breachedCount: reports.filter(
        (report) => report.status === "open" && report.breached,
      ).length,
    };
  }

  async resolve(adminId: string, reportId: string, dto: ResolveReportDto) {
    const [report] = await db
      .select()
      .from(communityReports)
      .where(eq(communityReports.id, reportId));
    if (!report) throw new NotFoundException("Report not found");

    if (dto.action === "delete_message" && report.targetType === "message") {
      await db
        .update(communityMessages)
        .set({
          isDeleted: true,
          deletedBy: adminId,
          deletedReason: dto.note ?? "Removed by Edutu staff",
        })
        .where(eq(communityMessages.id, report.targetId));
    }

    if (dto.action === "ban_user") {
      const authorId = await this.resolveTargetAuthor(report);
      if (authorId && report.groupId) {
        await db
          .update(communityGroupMembers)
          .set({
            bannedAt: new Date(),
            bannedReason: dto.note ?? "Banned by Edutu staff",
          })
          .where(
            and(
              eq(communityGroupMembers.groupId, report.groupId),
              eq(communityGroupMembers.userId, authorId),
            ),
          );
      }
    }

    if (dto.action === "suspend_group" && report.groupId) {
      await db
        .update(communityGroups)
        .set({ status: "suspended" })
        .where(eq(communityGroups.id, report.groupId));
    }

    // Every report on the same target resolves together — otherwise ten
    // reports of one message require ten identical clicks.
    await db
      .update(communityReports)
      .set({
        status: resolutionToStatus(dto.action),
        resolvedBy: adminId,
        resolvedAt: new Date(),
        actionTaken: dto.action,
      })
      .where(
        and(
          eq(communityReports.targetType, report.targetType),
          eq(communityReports.targetId, report.targetId),
          eq(communityReports.status, "open"),
        ),
      );

    return { success: true as const };
  }

  /** Held messages awaiting review (spec §9.4 shadow-hold). */
  async listHeldMessages(limit = 100) {
    const result = await db.execute(sql`
      select m.id, m.group_id, m.user_id, m.body, m.created_at,
             g.name as group_name,
             coalesce(p.full_name, 'Edutu learner') as author_name
      from public.community_messages m
      join public.community_groups g on g.id = m.group_id
      left join public.profiles p on p.user_id::text = m.user_id
      where m.review_status = 'held' and m.is_deleted = false
      order by m.created_at asc
      limit ${Math.min(Math.max(limit, 1), 200)}
    `);
    return this.rows<Record<string, unknown>>(result).map((row) => ({
      id: String(row.id),
      groupId: String(row.group_id),
      groupName: String(row.group_name),
      authorUserId: String(row.user_id),
      authorName: String(row.author_name),
      body: (row.body as string) ?? null,
      createdAt: new Date(row.created_at as string).toISOString(),
    }));
  }

  async decideHeldMessage(
    adminId: string,
    messageId: string,
    decision: "publish" | "remove",
  ) {
    const [updated] = await db
      .update(communityMessages)
      .set(
        decision === "publish"
          ? { reviewStatus: "published" }
          : {
              reviewStatus: "removed",
              isDeleted: true,
              deletedBy: adminId,
              deletedReason: "Removed in review",
            },
      )
      .where(eq(communityMessages.id, messageId))
      .returning({ id: communityMessages.id, groupId: communityMessages.groupId });

    if (!updated) throw new NotFoundException("Message not found");

    if (decision === "publish") {
      await db
        .update(communityGroups)
        .set({
          messageCount: sql`${communityGroups.messageCount} + 1`,
          lastMessageAt: new Date(),
        })
        .where(eq(communityGroups.id, updated.groupId));
    }
    return { success: true as const };
  }

  private async resolveTargetAuthor(report: {
    targetType: string;
    targetId: string;
  }): Promise<string | null> {
    if (report.targetType === "profile") return report.targetId;
    if (report.targetType !== "message") return null;
    const [message] = await db
      .select({ userId: communityMessages.userId })
      .from(communityMessages)
      .where(eq(communityMessages.id, report.targetId));
    return message?.userId ?? null;
  }

  protected rows<T>(result: unknown): T[] {
    if (Array.isArray(result)) return result as T[];
    return (result as { rows?: T[] }).rows ?? [];
  }
}
```

- [ ] **Step 4: Add the user-facing routes**

Append to `communities.controller.ts` (inject `CommunityModerationService`):

```ts
  @Post("reports")
  @Throttle({ default: { limit: 20, ttl: 3600000 } })
  report(
    @CurrentUser("authId") authId: string,
    @Body(new ZodValidationPipe(CreateReportSchema)) dto: CreateReportDto,
  ) {
    return this.moderationService.report(rawClerkUserId(authId), dto);
  }

  @Post("blocks")
  block(
    @CurrentUser("authId") authId: string,
    @Body() body: { userId: string },
  ) {
    return this.moderationService.blockUser(
      rawClerkUserId(authId),
      body.userId,
    );
  }

  @Delete("blocks/:userId")
  unblock(
    @CurrentUser("authId") authId: string,
    @Param("userId") blockedUserId: string,
  ) {
    return this.moderationService.unblockUser(
      rawClerkUserId(authId),
      blockedUserId,
    );
  }
```

Extend the DTO import with `CreateReportSchema` + `type CreateReportDto`.

- [ ] **Step 5: Add the admin controller**

Create `backend/services/services/api/src/communities/communities-admin.controller.ts`:

```ts
import { Body, Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { AdminGuard, CurrentUser } from "../auth";
import {
  CommunityModerationService,
  type ResolveReportDto,
} from "./community-moderation.service";

/**
 * Staff-only moderation surface, mounted under /admin so it sits beside the
 * other admin routes the admin app already calls. AdminGuard already allows
 * the `moderator` role, so no new role plumbing is needed.
 */
@Controller("admin/communities")
@UseGuards(AdminGuard)
export class CommunitiesAdminController {
  constructor(private readonly moderationService: CommunityModerationService) {}

  @Get("reports")
  listReports(
    @Query("status") status?: string,
    @Query("limit") limit?: string,
  ) {
    return this.moderationService.listQueue({
      status,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Patch("reports/:reportId")
  resolveReport(
    @CurrentUser("authId") adminAuthId: string,
    @Param("reportId") reportId: string,
    @Body() body: ResolveReportDto,
  ) {
    return this.moderationService.resolve(adminAuthId, reportId, body);
  }

  @Get("held-messages")
  listHeld(@Query("limit") limit?: string) {
    return this.moderationService.listHeldMessages(
      limit ? Number(limit) : undefined,
    );
  }

  @Patch("held-messages/:messageId")
  decideHeld(
    @CurrentUser("authId") adminAuthId: string,
    @Param("messageId") messageId: string,
    @Body() body: { decision: "publish" | "remove" },
  ) {
    return this.moderationService.decideHeldMessage(
      adminAuthId,
      messageId,
      body.decision,
    );
  }
}
```

Register it in `communities.module.ts`:

```ts
  controllers: [CommunitiesController, CommunitiesAdminController],
  providers: [
    CommunitiesService,
    CommunityLimitsService,
    CommunityMessagesService,
    CommunityInvitesService,
    CommunityModerationService,
  ],
```

- [ ] **Step 6: Run the tests, lint and boot smoke test**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/communities && npm run lint && npm run build && timeout 25 node dist/main
```

Expected: PASS; lint clean; app boots.

- [ ] **Step 7: Commit**

```bash
git add backend/services/services/api/src/communities
git commit -m "feat(communities): reports, blocks, shadow-hold review and admin queue endpoints"
```

---

## Task 13: Notifications — batched per group, prefs + quiet hours honoured

**Files:**
- Create: `backend/services/services/api/src/communities/community-notifications.service.ts`
- Create: `backend/services/services/api/src/communities/community-notifications.service.spec.ts`
- Modify: `backend/services/services/api/src/notifications/dto/notification.dto.ts`
- Modify: `backend/services/services/api/src/notifications/notifications.service.ts`
- Modify: `backend/services/services/api/src/communities/community-messages.service.ts`
- Modify: `backend/services/services/api/src/communities/communities.module.ts`

**Interfaces:**
- Consumes: `NotificationsService.broadcast` (existing).
- Produces:
  ```ts
  export function extractMentions(body: string | null): string[];
  export function batchWindowKey(groupId: string, minutes: number, now?: Date): string;
  export class CommunityNotificationsService {
    onMessage(input: { groupId: string; groupName: string; authorUserId: string;
      authorName: string; body: string | null; kind: string }): Promise<void>;
    onInvite(input: { groupId: string; groupName: string; inviteeUserId: string; inviterName: string }): Promise<void>;
    onJoinRequest(input: { groupId: string; groupName: string; requesterName: string }): Promise<void>;
    onGroupExpiring(input: { groupId: string; groupName: string; daysLeft: number }): Promise<void>;
  }
  ```

- [ ] **Step 1: Write the failing test**

Create `backend/services/services/api/src/communities/community-notifications.service.spec.ts`:

```ts
import {
  batchWindowKey,
  extractMentions,
  COMMUNITY_NOTIFICATION_KINDS,
} from "./community-notifications.service";
import { BroadcastNotificationSchema } from "../notifications/dto/notification.dto";

describe("extractMentions", () => {
  it("pulls @usernames out of a message", () => {
    expect(extractMentions("thanks @ada_o and @kwame99!")).toEqual([
      "ada_o",
      "kwame99",
    ]);
  });

  it("ignores @everyone (that is the announcement path, not a mention)", () => {
    expect(extractMentions("@everyone deadline moved")).toEqual([]);
  });

  it("ignores @edutu (that is Slice 4's agent trigger)", () => {
    expect(extractMentions("@edutu what is the deadline?")).toEqual([]);
  });

  it("dedupes and lowercases", () => {
    expect(extractMentions("@Ada @ada @ADA")).toEqual(["ada"]);
  });

  it("is safe on null", () => {
    expect(extractMentions(null)).toEqual([]);
  });
});

describe("batchWindowKey", () => {
  it("buckets a group into fixed windows so one push covers many messages", () => {
    const a = batchWindowKey("g1", 15, new Date("2026-07-25T12:03:00.000Z"));
    const b = batchWindowKey("g1", 15, new Date("2026-07-25T12:14:59.000Z"));
    const c = batchWindowKey("g1", 15, new Date("2026-07-25T12:16:00.000Z"));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("never shares a window between two groups", () => {
    const now = new Date("2026-07-25T12:03:00.000Z");
    expect(batchWindowKey("g1", 15, now)).not.toBe(batchWindowKey("g2", 15, now));
  });
});

describe("notification kind vocabulary", () => {
  it.each(COMMUNITY_NOTIFICATION_KINDS)(
    "%s is accepted by BroadcastNotificationSchema",
    (kind) => {
      const parsed = BroadcastNotificationSchema.safeParse({
        title: "t",
        body: "b",
        kind,
      });
      expect(parsed.success).toBe(true);
    },
  );
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/communities/community-notifications.service.spec.ts
```

Expected: FAIL — `Cannot find module './community-notifications.service'`.

- [ ] **Step 3: Widen the notification vocabulary**

In `backend/services/services/api/src/notifications/dto/notification.dto.ts`, extend the
`NotificationKind` union:

```ts
export type NotificationKind =
  | "goal-reminder"
  | "goal-weekly-digest"
  | "goal-progress"
  | "opportunity-highlight"
  | "opportunity-alert"
  | "deadline-reminder"
  | "admin-broadcast"
  | "system"
  | "community-message"
  | "community-mention"
  | "community-announcement"
  | "community-invite"
  | "community-join-request"
  | "group-expiring";
```

and the enum inside `BroadcastNotificationSchema` with the same six new values, in the same order.

In `backend/services/services/api/src/notifications/notifications.service.ts`, extend the topic map so
the existing preference plumbing governs the new kinds:

```ts
const TOPIC_PREFERENCE_BY_KIND: Record<string, keyof typeof TOPIC_COLUMNS> = {
  "opportunity-alert": "opportunityAlerts",
  "deadline-reminder": "deadlineReminders",
  "goal-reminder": "goalReminders",
  achievement: "achievementCelebrations",
  // Group activity rides the deadline/reminder switch rather than adding a new
  // preference column: users who muted reminders do not want group pings
  // either, and per-group control already exists on
  // community_group_members.notify.
  "group-expiring": "deadlineReminders",
};
```

- [ ] **Step 4: Implement the service**

Create `backend/services/services/api/src/communities/community-notifications.service.ts`:

```ts
import { Injectable, Logger } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { NotificationsService } from "../notifications/notifications.service";
import type { NotificationKind } from "../notifications/dto/notification.dto";

export const COMMUNITY_NOTIFICATION_KINDS = [
  "community-message",
  "community-mention",
  "community-announcement",
  "community-invite",
  "community-join-request",
  "group-expiring",
] as const satisfies readonly NotificationKind[];

/** Group activity is batched into 15-minute windows, never one push per message. */
const BATCH_WINDOW_MINUTES = 15;

/**
 * @everyone and @edutu are deliberately excluded: the first is the
 * announcement path (its own kind, its own quota) and the second is Slice 4's
 * agent trigger. Neither is a person to notify.
 */
export function extractMentions(body: string | null): string[] {
  if (!body) return [];
  const matches = body.match(/@([a-z0-9_]{3,24})/gi) ?? [];
  const reserved = new Set(["everyone", "edutu", "here", "channel"]);
  const names = matches
    .map((match) => match.slice(1).toLowerCase())
    .filter((name) => !reserved.has(name));
  return Array.from(new Set(names));
}

/**
 * A stable key per (group, time window). Used as the notification dedupeKey so
 * a burst of 40 messages produces ONE row and ONE push per window, which is
 * the spec's "12 new messages in Chevening 2027" behaviour.
 */
export function batchWindowKey(
  groupId: string,
  minutes: number = BATCH_WINDOW_MINUTES,
  now: Date = new Date(),
): string {
  const bucket = Math.floor(now.getTime() / (minutes * 60_000));
  return `community-msg:${groupId}:${bucket}`;
}

@Injectable()
export class CommunityNotificationsService {
  private readonly logger = new Logger(CommunityNotificationsService.name);

  constructor(private readonly notifications: NotificationsService) {}

  /**
   * Called after a message commits. Never awaited by the send path — a push
   * outage must not fail a message that is already in the database.
   *
   * Recipients:
   *  - mentions  → everyone named, regardless of their per-group notify setting
   *                (short of 'none'), kind `community-mention`
   *  - all-mode  → members who opted into `notify='all'`, kind `community-message`
   *  - announce  → every member except muted, kind `community-announcement`
   *
   * The author is always excluded. Quiet hours and notification_preferences
   * are enforced inside NotificationsService.deliverBroadcast, so nothing here
   * has to know about them.
   */
  async onMessage(input: {
    groupId: string;
    groupName: string;
    authorUserId: string;
    authorName: string;
    body: string | null;
    kind: string;
  }): Promise<void> {
    try {
      const mentioned = extractMentions(input.body);
      const isAnnouncement = input.kind === "announcement";

      const result = await db.execute(sql`
        select m.user_id,
               m.notify,
               coalesce(p.username, '') as username
        from public.community_group_members m
        left join public.profiles p on p.user_id::text = m.user_id
        where m.group_id = ${input.groupId}::uuid
          and m.banned_at is null
          and m.user_id <> ${input.authorUserId}
          and m.notify <> 'none'
      `);
      const members = this.rows<{
        user_id: string;
        notify: string;
        username: string;
      }>(result);
      if (!members.length) return;

      const mentionTargets = members
        .filter((member) => mentioned.includes(member.username.toLowerCase()))
        .map((member) => member.user_id);

      if (mentionTargets.length) {
        await this.notifications.broadcast("system", {
          title: `${input.authorName} mentioned you in ${input.groupName}`,
          body: (input.body ?? "").slice(0, 140) || "Open the group to reply.",
          kind: "community-mention",
          audience: "specific",
          targetUserIds: mentionTargets,
          metadata: { groupId: input.groupId, url: `/communities/${input.groupId}` },
          channels: { inApp: true, push: true, email: false },
        });
      }

      const activityTargets = members
        .filter(
          (member) =>
            !mentionTargets.includes(member.user_id) &&
            (isAnnouncement || member.notify === "all"),
        )
        .map((member) => member.user_id);

      if (!activityTargets.length) return;

      await this.notifications.broadcast("system", {
        title: isAnnouncement
          ? `Announcement in ${input.groupName}`
          : `New activity in ${input.groupName}`,
        body: isAnnouncement
          ? (input.body ?? "").slice(0, 160)
          : `${input.authorName} and others are talking. Tap to catch up.`,
        kind: isAnnouncement ? "community-announcement" : "community-message",
        audience: "specific",
        targetUserIds: activityTargets,
        // Batching: one row + one push per group per 15-minute window.
        dedupeKey: isAnnouncement
          ? `community-ann:${input.groupId}:${Date.now()}`
          : batchWindowKey(input.groupId),
        metadata: { groupId: input.groupId, url: `/communities/${input.groupId}` },
        channels: { inApp: true, push: true, email: false },
      });
    } catch (error) {
      this.logger.warn(
        `Community message notification failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async onInvite(input: {
    groupId: string;
    groupName: string;
    inviteeUserId: string;
    inviterName: string;
  }): Promise<void> {
    await this.safeBroadcast({
      title: `${input.inviterName} invited you to ${input.groupName}`,
      body: "Tap to see the group and join.",
      kind: "community-invite",
      audience: "specific",
      targetUserIds: [input.inviteeUserId],
      metadata: { groupId: input.groupId, url: `/communities/${input.groupId}` },
    });
  }

  async onJoinRequest(input: {
    groupId: string;
    groupName: string;
    requesterName: string;
  }): Promise<void> {
    const result = await db.execute(sql`
      select user_id from public.community_group_members
      where group_id = ${input.groupId}::uuid
        and role in ('owner', 'admin')
        and banned_at is null
    `);
    const targets = this.rows<{ user_id: string }>(result).map(
      (row) => row.user_id,
    );
    if (!targets.length) return;

    await this.safeBroadcast({
      title: `${input.requesterName} wants to join ${input.groupName}`,
      body: "Review the request in the group's members tab.",
      kind: "community-join-request",
      audience: "specific",
      targetUserIds: targets,
      metadata: { groupId: input.groupId, url: `/communities/${input.groupId}` },
    });
  }

  async onGroupExpiring(input: {
    groupId: string;
    groupName: string;
    daysLeft: number;
  }): Promise<void> {
    const result = await db.execute(sql`
      select user_id from public.community_group_members
      where group_id = ${input.groupId}::uuid
        and banned_at is null
        and notify <> 'none'
    `);
    const targets = this.rows<{ user_id: string }>(result).map(
      (row) => row.user_id,
    );
    if (!targets.length) return;

    await this.safeBroadcast({
      title: `${input.groupName} closes in ${input.daysLeft} day${input.daysLeft === 1 ? "" : "s"}`,
      body: "Save anything you need from the chat — it becomes read-only after that.",
      kind: "group-expiring",
      audience: "specific",
      targetUserIds: targets,
      dedupeKey: `group-expiring:${input.groupId}:${input.daysLeft}`,
      metadata: { groupId: input.groupId, url: `/communities/${input.groupId}` },
    });
  }

  private async safeBroadcast(
    payload: Parameters<NotificationsService["broadcast"]>[1],
  ) {
    try {
      await this.notifications.broadcast("system", {
        channels: { inApp: true, push: true, email: false },
        ...payload,
      });
    } catch (error) {
      this.logger.warn(
        `Community notification failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  protected rows<T>(result: unknown): T[] {
    if (Array.isArray(result)) return result as T[];
    return (result as { rows?: T[] }).rows ?? [];
  }
}
```

- [ ] **Step 5: Fire notifications from the message paths**

In `community-messages.service.ts`, inject `CommunityNotificationsService` and add this at the end of
`send()` (before `return`) and of `postAnnouncement()`:

```ts
    // Fire-and-forget: a message is committed the moment the insert returns.
    // Awaiting the push would make a Brevo/Expo outage look like a failed send.
    if (message.reviewStatus === "published") {
      void this.communityNotifications.onMessage({
        groupId,
        groupName: hydrated.authorDisplayName ? "" : "",
        authorUserId: userId,
        authorName: hydrated.authorDisplayName,
        body: message.body,
        kind: message.kind,
      });
    }
```

Replace the placeholder `groupName` by loading it once — add this before the insert in both methods:

```ts
    const [group] = await db
      .select({ name: communityGroups.name })
      .from(communityGroups)
      .where(eq(communityGroups.id, groupId));
```

and pass `groupName: group?.name ?? "your group"`.

Add `CommunityNotificationsService` to `providers` in `communities.module.ts`, and call
`this.communityNotifications.onJoinRequest(...)` from `CommunitiesService.joinGroup` when a request is
created, and `onInvite(...)` from `CommunityInvitesService.accept` is **not** needed (the invitee is
already present) — instead call it from a future direct-invite path; leaving it unused is intentional
and Slice 5 wires it.

> To keep `CommunitiesService` free of a circular import, inject
> `CommunityNotificationsService` into `CommunitiesService` (Nest resolves this fine: the
> notifications service depends only on `NotificationsService`).

- [ ] **Step 6: Run the tests, lint and boot smoke test**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/communities src/notifications && npm run lint && npm run build && timeout 25 node dist/main
```

Expected: PASS; lint clean; app boots. If `node dist/main` fails with a circular-dependency error,
wrap the injection with `forwardRef(() => CommunityNotificationsService)` — this is exactly the class
of failure constraint 10 exists for.

- [ ] **Step 7: Commit**

```bash
git add backend/services/services/api/src/communities backend/services/services/api/src/notifications
git commit -m "feat(communities): batched group notifications honouring prefs and quiet hours"
```

---

## Task 14: Expiry + archive cron

**Files:**
- Create: `backend/services/services/api/src/communities/community-expiry.service.ts`
- Create: `backend/services/services/api/src/communities/community-expiry.service.spec.ts`
- Modify: `backend/services/services/api/src/communities/communities.module.ts`

**Interfaces:**
- Consumes: `CommunityMessagesService.postSystemMessage` (Task 9),
  `CommunityNotificationsService.onGroupExpiring` (Task 13).
- Produces:
  ```ts
  export const EXPIRY_WARNING_DAYS: readonly number[];  // [7, 1]
  export function archiveSystemMessage(groupName: string): string;
  export class CommunityExpiryService {
    runScheduled(): Promise<void>;                // @Cron EVERY_DAY_AT_6AM
    archiveDueGroups(limit?: number): Promise<{ archived: number }>;
    warnExpiringGroups(limit?: number): Promise<{ warned: number }>;
  }
  ```

> Modelled directly on `src/notifications/opportunity-deadline-reminders.service.ts`: the same
> `@Cron(CronExpression.EVERY_DAY_AT_6AM)` shape, the same env kill-switch, the same
> `this.rows<T>(result)` helper, the same "log only when there was work" discipline.

- [ ] **Step 1: Write the failing test**

Create `backend/services/services/api/src/communities/community-expiry.service.spec.ts`:

```ts
import {
  EXPIRY_WARNING_DAYS,
  archiveSystemMessage,
} from "./community-expiry.service";

describe("expiry", () => {
  it("warns at 7 days and 1 day", () => {
    expect([...EXPIRY_WARNING_DAYS]).toEqual([7, 1]);
  });

  it("writes a system message that explains read-only, not deleted", () => {
    const text = archiveSystemMessage("Chevening 2027");
    expect(text).toContain("Chevening 2027");
    expect(text.toLowerCase()).toContain("read-only");
    expect(text.toLowerCase()).not.toContain("deleted");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/communities/community-expiry.service.spec.ts
```

Expected: FAIL — `Cannot find module './community-expiry.service'`.

- [ ] **Step 3: Implement**

Create `backend/services/services/api/src/communities/community-expiry.service.ts`:

```ts
import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { CommunityMessagesService } from "./community-messages.service";
import { CommunityNotificationsService } from "./community-notifications.service";

/** Members get a heads-up a week out and again the day before. */
export const EXPIRY_WARNING_DAYS = [7, 1] as const;

export function archiveSystemMessage(groupName: string): string {
  return `${groupName} has reached its end date. The chat is now read-only — every message and the Brief stay here for good, so you can still search and reread them. The owner can carry this group forward to next season.`;
}

type DueGroup = { id: string; name: string };
type ExpiringGroup = { id: string; name: string; days_left: number };

/**
 * The anti-graveyard mechanic (spec §6.3). A group that has passed its
 * expires_at flips to `status='archived'` and gets a system message explaining
 * what happened. Nothing is ever deleted — the archive is the asset that
 * Slice 5's carry-forward feeds on.
 */
@Injectable()
export class CommunityExpiryService {
  private readonly logger = new Logger(CommunityExpiryService.name);

  constructor(
    private readonly messages: CommunityMessagesService,
    private readonly notifications: CommunityNotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async runScheduled() {
    if (process.env.COMMUNITY_EXPIRY_ENABLED === "false") return;
    try {
      const warned = await this.warnExpiringGroups();
      const archived = await this.archiveDueGroups();
      if (warned.warned > 0 || archived.archived > 0) {
        this.logger.log(
          `Community expiry: ${archived.archived} archived, ${warned.warned} warned`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Community expiry run failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }

  async warnExpiringGroups(limit = 500): Promise<{ warned: number }> {
    const result = await db.execute(sql`
      select id, name,
             ceil(extract(epoch from (expires_at - now())) / 86400)::int as days_left
      from public.community_groups
      where status = 'active'
        and expires_at is not null
        and expires_at > now()
        and ceil(extract(epoch from (expires_at - now())) / 86400)::int
            = any(${[...EXPIRY_WARNING_DAYS]}::int[])
      limit ${limit}
    `);

    const groups = this.rows<ExpiringGroup>(result);
    for (const group of groups) {
      await this.notifications.onGroupExpiring({
        groupId: group.id,
        groupName: group.name,
        daysLeft: group.days_left,
      });
    }
    return { warned: groups.length };
  }

  async archiveDueGroups(limit = 500): Promise<{ archived: number }> {
    // Flip first, then post — so a crash between the two leaves an archived
    // group without a notice (harmless) rather than a notice on a live group
    // (confusing), and a re-run cannot double-post because the WHERE clause no
    // longer matches.
    const result = await db.execute(sql`
      update public.community_groups
      set status = 'archived', archived_at = now()
      where id in (
        select id from public.community_groups
        where status = 'active'
          and expires_at is not null
          and expires_at <= now()
        order by expires_at asc
        limit ${limit}
      )
      returning id, name
    `);

    const groups = this.rows<DueGroup>(result);
    for (const group of groups) {
      try {
        await this.messages.postSystemMessage(
          group.id,
          archiveSystemMessage(group.name),
        );
      } catch (error) {
        this.logger.warn(
          `Could not post archive notice for ${group.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return { archived: groups.length };
  }

  private rows<T>(result: unknown): T[] {
    if (Array.isArray(result)) return result as T[];
    return (result as { rows?: T[] }).rows ?? [];
  }
}
```

Add `CommunityExpiryService` to `providers` in `communities.module.ts`.

- [ ] **Step 4: Run the tests, lint and boot smoke test**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/communities && npm run lint && npm run build && timeout 25 node dist/main
```

Expected: PASS; lint clean; app boots and registers the cron (`ScheduleModule.forRoot()` is already in
`app.module.ts`).

- [ ] **Step 5: Commit**

```bash
git add backend/services/services/api/src/communities
git commit -m "feat(communities): daily expiry warnings and read-only archive cron"
```

---

## Task 15: `@edutu/core` — types, API client, realtime, `useGroupMessages`

**Files:**
- Create: `<CORE>/src/communities/types.ts`
- Create: `<CORE>/src/communities/api.ts`
- Create: `<CORE>/src/communities/realtime.ts`
- Create: `<CORE>/src/communities/useGroupMessages.ts`
- Create: `<CORE>/src/communities/useGroups.ts`
- Create: `<CORE>/src/communities/realtime.spec.ts`
- Create: `<CORE>/src/communities/useGroupMessages.spec.tsx`
- Modify: `<CORE>/src/index.ts`

**Interfaces:**
- Consumes: `groupCan` (Task 2); backend routes (Tasks 5–12).
- Produces (these are the exports slices 3–5 build on):
  ```ts
  export type CommunitySpace = { id: string; slug: string; name: string; icon: string;
    sortOrder: number; groupCount: number };
  export type CommunityGroup = { id: string; slug: string; spaceId: string; name: string;
    description: string | null; iconUrl: string | null;
    visibility: 'public'|'unlisted'|'private'; joinPolicy: 'open'|'request'|'invite';
    opportunityId: string | null; memberCount: number; lastMessageAt: string | null;
    expiresAt: string | null; status: 'active'|'archived'|'suspended'; myRole: GroupRole | null };
  export type CommunityMessage = { id: string; groupId: string; userId: string;
    authorUsername: string; authorDisplayName: string; authorAvatarUrl: string | null;
    kind: 'text'|'image'|'opportunity'|'system'|'announcement'|'ai';
    body: string | null; attachments: Array<{ url: string; width: number; height: number }>;
    opportunityId: string | null; replyToId: string | null; savedToBrief: boolean;
    createdAt: string; pending?: boolean; failed?: boolean;
    reactions?: Array<{ emoji: string; count: number; mine: boolean }>;
    reviewStatus?: 'published'|'held'|'removed'; blocked?: boolean; clientId?: string };
  export type SendMessageInput = { body?: string; kind?: 'text'|'image'|'opportunity';
    attachments?: Array<{ url: string; width: number; height: number }>;
    opportunityId?: string; replyToId?: string };
  export type GroupMember = { userId: string; role: GroupRole; displayName: string;
    avatarUrl: string | null; joinedAt: string; mutedUntil: string | null; bannedAt: string | null };
  export type InvitePreview = { groupId: string; groupSlug: string; name: string;
    description: string | null; iconUrl: string | null; memberCount: number; rules: string | null;
    spaceSlug: string; valid: boolean; reason: 'revoked'|'expired'|'exhausted'|null };
  export const communitiesApi: { … };   // one method per backend route
  export function subscribeToGroupMessages(supabase, groupId, onInsert, onUpdate?): () => void;
  export function useGroupMessages(groupId, deps): { messages; send; loadOlder; retry; loading; hasMore };
  export function useGroups(deps, query): { groups; spaces; loading; error; refresh };
  ```

> **Additive extension to the contract:** the contract fixes `useGroupMessages`'s return as
> `{ messages, send, loadOlder, loading, hasMore }`. This adds one field, `retry(clientId)`, required
> by the brief's "pending/failed states and retry". Adding a field breaks no consumer; nothing is
> renamed or removed.

- [ ] **Step 1: Write the failing realtime-lifecycle test**

Create `<CORE>/src/communities/realtime.spec.ts`:

```ts
import { subscribeToGroupMessages } from "./realtime";

function makeClient() {
  const channels: Array<{ topic: string }> = [];
  const on = jest.fn().mockReturnThis();
  const subscribe = jest.fn().mockReturnThis();
  const client = {
    channels,
    getChannels: jest.fn(() => channels),
    removeChannel: jest.fn((channel: { topic: string }) => {
      const index = channels.indexOf(channel);
      if (index >= 0) channels.splice(index, 1);
    }),
    channel: jest.fn((topic: string) => {
      const created = { topic: `realtime:${topic}`, on, subscribe };
      channels.push(created);
      return created;
    }),
    realtime: { setAuth: jest.fn() },
  };
  return { client, on, subscribe };
}

describe("subscribeToGroupMessages", () => {
  it("removes a stale channel with the same topic BEFORE subscribing", () => {
    const { client } = makeClient();
    const stale = { topic: "realtime:community-group-g1" };
    client.channels.push(stale as never);

    subscribeToGroupMessages(client as never, "g1", jest.fn());

    expect(client.removeChannel).toHaveBeenCalledWith(stale);
    expect(client.channel).toHaveBeenCalledWith("community-group-g1");
  });

  it("binds postgres_changes filtered to the group", () => {
    const { client, on } = makeClient();
    subscribeToGroupMessages(client as never, "g1", jest.fn());
    expect(on).toHaveBeenCalledWith(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "community_messages",
        filter: "group_id=eq.g1",
      },
      expect.any(Function),
    );
  });

  it("never throws when the binding fails — a realtime error must not reach the ErrorBoundary", () => {
    const { client } = makeClient();
    client.channel = jest.fn(() => {
      throw new Error("cannot add postgres_changes callbacks after subscribe");
    }) as never;
    expect(() =>
      subscribeToGroupMessages(client as never, "g1", jest.fn()),
    ).not.toThrow();
  });

  it("returns an unsubscribe that removes exactly the channel it created", () => {
    const { client } = makeClient();
    const unsubscribe = subscribeToGroupMessages(client as never, "g1", jest.fn());
    unsubscribe();
    expect(client.removeChannel).toHaveBeenCalledTimes(1);
    expect(client.channels).toHaveLength(0);
  });

  it("survives a remount: subscribe → unsubscribe → subscribe leaves one channel", () => {
    const { client } = makeClient();
    const first = subscribeToGroupMessages(client as never, "g1", jest.fn());
    first();
    const second = subscribeToGroupMessages(client as never, "g1", jest.fn());
    expect(client.channels).toHaveLength(1);
    second();
    expect(client.channels).toHaveLength(0);
  });

  it("survives a FAST remount where the old channel was not cleaned up", () => {
    const { client } = makeClient();
    subscribeToGroupMessages(client as never, "g1", jest.fn()); // never unsubscribed
    expect(() =>
      subscribeToGroupMessages(client as never, "g1", jest.fn()),
    ).not.toThrow();
    expect(client.channels).toHaveLength(1);
  });

  it("opens exactly one channel even when several groups are joined", () => {
    const { client } = makeClient();
    const a = subscribeToGroupMessages(client as never, "g1", jest.fn());
    a();
    const b = subscribeToGroupMessages(client as never, "g2", jest.fn());
    expect(client.channels).toHaveLength(1);
    expect(client.channels[0].topic).toBe("realtime:community-group-g2");
    b();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile
npx jest ../packages/core/src/communities/realtime.spec.ts --maxWorkers=2
```

Expected: FAIL — `Cannot find module './realtime'`.

- [ ] **Step 3: Write the types**

Create `<CORE>/src/communities/types.ts`:

```ts
import type { GroupRole } from "./permissions";

export type CommunitySpace = {
  id: string;
  slug: string;
  name: string;
  icon: string;
  sortOrder: number;
  groupCount: number;
};

export type CommunityGroup = {
  id: string;
  slug: string;
  spaceId: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  visibility: "public" | "unlisted" | "private";
  joinPolicy: "open" | "request" | "invite";
  opportunityId: string | null;
  memberCount: number;
  lastMessageAt: string | null;
  expiresAt: string | null;
  status: "active" | "archived" | "suspended";
  myRole: GroupRole | null;
};

export type MessageAttachment = {
  url: string;
  width: number;
  height: number;
};

export type CommunityMessage = {
  id: string;
  groupId: string;
  userId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarUrl: string | null;
  kind: "text" | "image" | "opportunity" | "system" | "announcement" | "ai";
  body: string | null;
  attachments: MessageAttachment[];
  opportunityId: string | null;
  replyToId: string | null;
  savedToBrief: boolean;
  createdAt: string;
  /** Local-only: the row has not been acknowledged by the server yet. */
  pending?: boolean;
  /** Local-only: the send failed and can be retried. */
  failed?: boolean;
  /** Correlates an optimistic row with its server row. Local-only. */
  clientId?: string;
  reactions?: Array<{ emoji: string; count: number; mine: boolean }>;
  reviewStatus?: "published" | "held" | "removed";
  /**
   * Why this was flagged or held, and — for a shared opportunity card — the
   * caution to render inline when Edutu's own scam checks already flagged that
   * listing. Slice 3's card component reads this; never render a shared
   * opportunity without checking it.
   */
  safetyNote?: string | null;
  /** The author is blocked by the viewer; body and attachments are stripped. */
  blocked?: boolean;
};

export type SendMessageInput = {
  body?: string;
  kind?: "text" | "image" | "opportunity";
  attachments?: MessageAttachment[];
  opportunityId?: string;
  replyToId?: string;
};

export type GroupMember = {
  userId: string;
  role: GroupRole;
  displayName: string;
  avatarUrl: string | null;
  joinedAt: string;
  mutedUntil: string | null;
  bannedAt: string | null;
};

export type GroupJoinRequest = {
  id: string;
  userId: string;
  displayName: string;
  message: string | null;
  createdAt: string;
};

export type InvitePreview = {
  groupId: string;
  groupSlug: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  memberCount: number;
  rules: string | null;
  spaceSlug: string;
  valid: boolean;
  reason: "revoked" | "expired" | "exhausted" | null;
};

export type GroupInvite = {
  id: string;
  token?: string;
  url?: string;
  tokenPrefix: string;
  roleOnJoin: string;
  maxUses: number | null;
  uses?: number;
  expiresAt: string | null;
  revokedAt?: string | null;
};
```

- [ ] **Step 4: Write the API client**

Create `<CORE>/src/communities/api.ts`:

```ts
import type {
  CommunityGroup,
  CommunityMessage,
  CommunitySpace,
  GroupInvite,
  GroupJoinRequest,
  GroupMember,
  InvitePreview,
  SendMessageInput,
} from "./types";

/** Injected by each app so this package stays framework- and auth-agnostic. */
export type CommunitiesApiDeps = {
  baseUrl: string;
  getToken: () => Promise<string | null | undefined>;
};

async function request<T>(
  deps: CommunitiesApiDeps,
  path: string,
  init: RequestInit = {},
  requireAuth = true,
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body) headers["Content-Type"] = "application/json";
  if (requireAuth) {
    const token = await deps.getToken();
    if (!token) throw new Error("Sign in to use Communities.");
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(
    `${deps.baseUrl.replace(/\/+$/, "")}${path}`,
    { ...init, headers: { ...headers, ...(init.headers as object) } },
  );

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (payload as { message?: string } | null)?.message ||
      `Request failed (${response.status})`;
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return payload as T;
}

export const communitiesApi = {
  listSpaces(deps: CommunitiesApiDeps) {
    return request<CommunitySpace[]>(deps, "/communities/spaces");
  },

  listGroups(
    deps: CommunitiesApiDeps,
    query: {
      space?: string;
      anchor?: string;
      q?: string;
      scope?: "discover" | "mine";
      limit?: number;
      offset?: number;
    } = {},
  ) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") params.set(key, String(value));
    }
    const suffix = params.toString() ? `?${params}` : "";
    return request<CommunityGroup[]>(deps, `/communities/groups${suffix}`);
  },

  getGroup(deps: CommunitiesApiDeps, groupIdOrSlug: string) {
    return request<CommunityGroup>(
      deps,
      `/communities/groups/${encodeURIComponent(groupIdOrSlug)}`,
    );
  },

  createGroup(
    deps: CommunitiesApiDeps,
    body: {
      name: string;
      spaceSlug: string;
      description?: string;
      rules?: string;
      visibility?: "public" | "unlisted" | "private";
      joinPolicy?: "open" | "request" | "invite";
      opportunityId?: string;
      expiresAt?: string;
    },
  ) {
    return request<CommunityGroup>(deps, "/communities/groups", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  updateGroup(
    deps: CommunitiesApiDeps,
    groupId: string,
    body: Record<string, unknown>,
  ) {
    return request<CommunityGroup>(deps, `/communities/groups/${groupId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },

  joinGroup(deps: CommunitiesApiDeps, groupId: string, message?: string) {
    return request<{ status: "joined" | "requested"; group: CommunityGroup }>(
      deps,
      `/communities/groups/${groupId}/join`,
      { method: "POST", body: JSON.stringify({ message }) },
    );
  },

  leaveGroup(deps: CommunitiesApiDeps, groupId: string) {
    return request<{ success: true }>(
      deps,
      `/communities/groups/${groupId}/leave`,
      { method: "DELETE" },
    );
  },

  listMessages(
    deps: CommunitiesApiDeps,
    groupId: string,
    query: { before?: string; limit?: number } = {},
  ) {
    const params = new URLSearchParams();
    if (query.before) params.set("before", query.before);
    if (query.limit) params.set("limit", String(query.limit));
    const suffix = params.toString() ? `?${params}` : "";
    return request<{ messages: CommunityMessage[]; hasMore: boolean }>(
      deps,
      `/communities/groups/${groupId}/messages${suffix}`,
    );
  },

  sendMessage(
    deps: CommunitiesApiDeps,
    groupId: string,
    input: SendMessageInput & { clientId?: string },
  ) {
    return request<CommunityMessage>(
      deps,
      `/communities/groups/${groupId}/messages`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },

  deleteMessage(deps: CommunitiesApiDeps, groupId: string, messageId: string) {
    return request<{ success: true }>(
      deps,
      `/communities/groups/${groupId}/messages/${messageId}`,
      { method: "DELETE" },
    );
  },

  react(
    deps: CommunitiesApiDeps,
    groupId: string,
    messageId: string,
    emoji: string,
  ) {
    return request<{ emoji: string; count: number; mine: boolean }>(
      deps,
      `/communities/groups/${groupId}/messages/${messageId}/reactions`,
      { method: "POST", body: JSON.stringify({ emoji }) },
    );
  },

  saveToBrief(deps: CommunitiesApiDeps, groupId: string, messageId: string) {
    return request<{ savedToBrief: boolean }>(
      deps,
      `/communities/groups/${groupId}/messages/${messageId}/save`,
      { method: "POST" },
    );
  },

  listMembers(deps: CommunitiesApiDeps, groupId: string) {
    return request<{ members: GroupMember[]; joinRequests: GroupJoinRequest[] }>(
      deps,
      `/communities/groups/${groupId}/members`,
    );
  },

  updateMember(
    deps: CommunitiesApiDeps,
    groupId: string,
    userId: string,
    body: Record<string, unknown>,
  ) {
    return request<{ success: true }>(
      deps,
      `/communities/groups/${groupId}/members/${encodeURIComponent(userId)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    );
  },

  announce(deps: CommunitiesApiDeps, groupId: string, body: string) {
    return request<CommunityMessage>(
      deps,
      `/communities/groups/${groupId}/announcements`,
      { method: "POST", body: JSON.stringify({ body }) },
    );
  },

  markRead(deps: CommunitiesApiDeps, groupId: string) {
    return request<{ success: true }>(
      deps,
      `/communities/groups/${groupId}/read`,
      { method: "POST" },
    );
  },

  createImageUpload(
    deps: CommunitiesApiDeps,
    groupId: string,
    body: { fileName: string; mimeType: string },
  ) {
    return request<{ uploadUrl: string; publicUrl: string; storagePath: string }>(
      deps,
      `/communities/groups/${groupId}/images`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },

  listInvites(deps: CommunitiesApiDeps, groupId: string) {
    return request<GroupInvite[]>(
      deps,
      `/communities/groups/${groupId}/invites`,
    );
  },

  createInvite(
    deps: CommunitiesApiDeps,
    groupId: string,
    body: {
      roleOnJoin?: "admin" | "mod" | "member";
      maxUses?: number | null;
      expiresInDays?: number | null;
    } = {},
  ) {
    return request<GroupInvite>(
      deps,
      `/communities/groups/${groupId}/invites`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },

  revokeInvite(deps: CommunitiesApiDeps, groupId: string, inviteId: string) {
    return request<{ success: true }>(
      deps,
      `/communities/groups/${groupId}/invites/${inviteId}`,
      { method: "DELETE" },
    );
  },

  /** Public: no token required, so the landing page renders before sign-in. */
  previewInvite(deps: CommunitiesApiDeps, token: string) {
    return request<InvitePreview>(
      deps,
      `/communities/invites/${encodeURIComponent(token)}`,
      {},
      false,
    );
  },

  acceptInvite(deps: CommunitiesApiDeps, token: string) {
    return request<{ status: "joined"; groupId: string; groupSlug: string }>(
      deps,
      `/communities/invites/${encodeURIComponent(token)}/accept`,
      { method: "POST" },
    );
  },

  report(
    deps: CommunitiesApiDeps,
    body: {
      targetType: "message" | "group" | "profile" | "note";
      targetId: string;
      groupId?: string;
      reason?: string;
      detail?: string;
      blockAuthor?: boolean;
    },
  ) {
    return request<{ id: string; slaHours: number }>(
      deps,
      "/communities/reports",
      { method: "POST", body: JSON.stringify(body) },
    );
  },

  block(deps: CommunitiesApiDeps, userId: string) {
    return request<{ success: true }>(deps, "/communities/blocks", {
      method: "POST",
      body: JSON.stringify({ userId }),
    });
  },

  unblock(deps: CommunitiesApiDeps, userId: string) {
    return request<{ success: true }>(
      deps,
      `/communities/blocks/${encodeURIComponent(userId)}`,
      { method: "DELETE" },
    );
  },
};
```

- [ ] **Step 5: Write the realtime subscriber**

Create `<CORE>/src/communities/realtime.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ONE channel, for the group currently on screen, ever.
 *
 * Holding a channel per joined group would multiply every user's realtime
 * connections by their group count and blow through Supabase's limits (spec
 * §8.1). Unread counts for every other group arrive by push + a foreground
 * refresh instead.
 *
 * The lifecycle here is the documented fix for the shipped
 * "cannot add postgres_changes callbacks ... after subscribe" crash:
 *   1. remove any channel already joined on this exact topic (fast remounts
 *      leave one behind),
 *   2. build and subscribe inside try/catch so a binding error can never reach
 *      the app's ErrorBoundary,
 *   3. hand back a disposer that removes precisely the channel we created.
 * Callers MUST keep their callbacks in refs so the effect that calls this
 * depends only on [supabase, groupId].
 */
export function subscribeToGroupMessages(
  supabase: SupabaseClient,
  groupId: string,
  onInsert: (row: Record<string, unknown>) => void,
  onUpdate?: (row: Record<string, unknown>) => void,
): () => void {
  const name = `community-group-${groupId}`;
  const topic = `realtime:${name}`;
  let channel: ReturnType<SupabaseClient["channel"]> | null = null;

  try {
    for (const existing of supabase.getChannels()) {
      if (existing.topic === topic) void supabase.removeChannel(existing);
    }

    let builder = supabase.channel(name).on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "community_messages",
        filter: `group_id=eq.${groupId}`,
      },
      (payload: { new: Record<string, unknown> }) => onInsert(payload.new),
    );

    if (onUpdate) {
      builder = builder.on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "community_messages",
          filter: `group_id=eq.${groupId}`,
        },
        (payload: { new: Record<string, unknown> }) => onUpdate(payload.new),
      );
    }

    channel = builder.subscribe();
  } catch (error) {
    // A realtime binding failure degrades the screen to poll-on-focus; it must
    // never crash it.
    console.warn("Community realtime subscription failed:", error);
  }

  return () => {
    if (channel) void supabase.removeChannel(channel);
  };
}

/**
 * Realtime authorises postgres_changes against RLS using the socket's JWT.
 * Both apps attach the Clerk token via a fetch override, which the WEBSOCKET
 * never sees — so without this call the socket is anon and a member receives
 * nothing. Safe to call repeatedly; failures are swallowed because a stale
 * socket auth is a degraded stream, not a crash.
 */
export async function authorizeRealtime(
  supabase: SupabaseClient,
  getToken: () => Promise<string | null | undefined>,
): Promise<void> {
  try {
    const token = await getToken();
    if (!token) return;
    const realtime = (supabase as unknown as {
      realtime?: { setAuth?: (token: string) => void | Promise<void> };
    }).realtime;
    await realtime?.setAuth?.(token);
  } catch (error) {
    console.warn("Community realtime auth failed:", error);
  }
}
```

- [ ] **Step 6: Run the realtime test**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile
npx jest ../packages/core/src/communities/realtime.spec.ts --maxWorkers=2
```

Expected: PASS, 7 tests.

- [ ] **Step 7: Write the failing `useGroupMessages` test**

Create `<CORE>/src/communities/useGroupMessages.spec.tsx`:

```tsx
import React from "react";
import { act, render, waitFor } from "@testing-library/react";
import { useGroupMessages } from "./useGroupMessages";
import type { CommunityMessage } from "./types";

jest.mock("./api", () => ({
  communitiesApi: {
    listMessages: jest.fn(),
    sendMessage: jest.fn(),
  },
}));
jest.mock("./realtime", () => ({
  subscribeToGroupMessages: jest.fn(() => jest.fn()),
  authorizeRealtime: jest.fn(async () => undefined),
}));

import { communitiesApi } from "./api";
import { subscribeToGroupMessages } from "./realtime";

const serverMessage = (id: string): CommunityMessage => ({
  id,
  groupId: "g1",
  userId: "user_1",
  authorUsername: "ada",
  authorDisplayName: "Ada",
  authorAvatarUrl: null,
  kind: "text",
  body: `message ${id}`,
  attachments: [],
  opportunityId: null,
  replyToId: null,
  savedToBrief: false,
  createdAt: "2026-07-25T12:00:00.000Z",
});

let hook: ReturnType<typeof useGroupMessages>;
function Probe({ groupId }: { groupId: string }) {
  hook = useGroupMessages(groupId, {
    baseUrl: "https://api.test",
    getToken: async () => "token",
    supabase: { getChannels: () => [], channel: () => ({}) } as never,
  });
  return null;
}

describe("useGroupMessages", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (communitiesApi.listMessages as jest.Mock).mockResolvedValue({
      messages: [serverMessage("m1")],
      hasMore: false,
    });
  });

  it("loads the initial page", async () => {
    render(<Probe groupId="g1" />);
    await waitFor(() => expect(hook.messages).toHaveLength(1));
    expect(hook.loading).toBe(false);
    expect(hook.messages[0].id).toBe("m1");
  });

  it("shows an optimistic pending message immediately, then replaces it", async () => {
    let resolveSend: (value: CommunityMessage) => void = () => {};
    (communitiesApi.sendMessage as jest.Mock).mockReturnValue(
      new Promise<CommunityMessage>((resolve) => {
        resolveSend = resolve;
      }),
    );

    render(<Probe groupId="g1" />);
    await waitFor(() => expect(hook.messages).toHaveLength(1));

    await act(async () => {
      void hook.send({ body: "hello" });
    });

    expect(hook.messages).toHaveLength(2);
    expect(hook.messages[1].pending).toBe(true);
    expect(hook.messages[1].body).toBe("hello");

    await act(async () => {
      resolveSend({ ...serverMessage("m2"), body: "hello" });
    });

    await waitFor(() => expect(hook.messages[1].pending).toBeUndefined());
    expect(hook.messages[1].id).toBe("m2");
    expect(hook.messages).toHaveLength(2);
  });

  it("marks a failed send as failed and keeps it in the list for retry", async () => {
    (communitiesApi.sendMessage as jest.Mock).mockRejectedValue(
      new Error("offline"),
    );
    render(<Probe groupId="g1" />);
    await waitFor(() => expect(hook.messages).toHaveLength(1));

    await act(async () => {
      await hook.send({ body: "nope" }).catch(() => undefined);
    });

    await waitFor(() => expect(hook.messages[1].failed).toBe(true));
    expect(hook.messages[1].pending).toBe(false);
  });

  it("retry re-sends a failed message and clears the failed flag", async () => {
    (communitiesApi.sendMessage as jest.Mock).mockRejectedValueOnce(
      new Error("offline"),
    );
    render(<Probe groupId="g1" />);
    await waitFor(() => expect(hook.messages).toHaveLength(1));
    await act(async () => {
      await hook.send({ body: "later" }).catch(() => undefined);
    });
    await waitFor(() => expect(hook.messages[1].failed).toBe(true));

    (communitiesApi.sendMessage as jest.Mock).mockResolvedValueOnce({
      ...serverMessage("m3"),
      body: "later",
    });
    const clientId = hook.messages[1].clientId as string;
    await act(async () => {
      await hook.retry(clientId);
    });

    await waitFor(() => expect(hook.messages[1].id).toBe("m3"));
    expect(hook.messages[1].failed).toBeUndefined();
  });

  it("ignores a realtime insert that duplicates a message already present", async () => {
    render(<Probe groupId="g1" />);
    await waitFor(() => expect(hook.messages).toHaveLength(1));

    const onInsert = (subscribeToGroupMessages as jest.Mock).mock.calls[0][2];
    await act(async () => {
      onInsert({ id: "m1", group_id: "g1" });
    });
    expect(hook.messages).toHaveLength(1);
  });

  it("re-subscribes exactly once per groupId change", async () => {
    const { rerender } = render(<Probe groupId="g1" />);
    await waitFor(() => expect(hook.messages).toHaveLength(1));
    expect(subscribeToGroupMessages).toHaveBeenCalledTimes(1);

    rerender(<Probe groupId="g1" />);
    expect(subscribeToGroupMessages).toHaveBeenCalledTimes(1);

    rerender(<Probe groupId="g2" />);
    await waitFor(() =>
      expect(subscribeToGroupMessages).toHaveBeenCalledTimes(2),
    );
  });
});
```

- [ ] **Step 8: Implement the hook**

Create `<CORE>/src/communities/useGroupMessages.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { communitiesApi, type CommunitiesApiDeps } from "./api";
import { authorizeRealtime, subscribeToGroupMessages } from "./realtime";
import type { CommunityMessage, SendMessageInput } from "./types";

export type UseGroupMessagesDeps = CommunitiesApiDeps & {
  supabase: SupabaseClient;
};

export type UseGroupMessagesReturn = {
  messages: CommunityMessage[];
  send: (input: SendMessageInput) => Promise<void>;
  loadOlder: () => Promise<void>;
  /** Additive to the locked contract: re-sends a message left in `failed`. */
  retry: (clientId: string) => Promise<void>;
  loading: boolean;
  hasMore: boolean;
  error: string | null;
};

const PAGE_SIZE = 40;

function newClientId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The group chat stream: HTTP for history and sends, Supabase Realtime for
 * live inserts. Writes NEVER go to Postgres from here — RLS in this domain is
 * SELECT-only by design.
 *
 * Optimistic send: the local row appears instantly with `pending: true` and a
 * `clientId`. On success the server row replaces it in place (so it does not
 * jump position); on failure it flips to `failed: true` and stays put so
 * `retry(clientId)` can send it again. A realtime INSERT that matches a
 * clientId or an id already present is dropped — otherwise your own message
 * arrives twice.
 */
export function useGroupMessages(
  groupId: string,
  deps: UseGroupMessagesDeps,
): UseGroupMessagesReturn {
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset when the group changes — adjust-during-render, React's documented
  // alternative to a state-resetting effect.
  const [prevGroupId, setPrevGroupId] = useState(groupId);
  if (prevGroupId !== groupId) {
    setPrevGroupId(groupId);
    setMessages([]);
    setLoading(true);
    setHasMore(false);
    setError(null);
  }

  // Every callback the realtime handler needs lives in a ref, so the subscribe
  // effect below can depend on [supabase, groupId] alone. Re-running it tears
  // down and recreates the channel, which is what triggers the documented
  // "postgres_changes after subscribe" crash on a reused topic.
  const depsRef = useRef(deps);
  useEffect(() => {
    depsRef.current = deps;
  }, [deps]);

  const fetchPage = useCallback(
    (before?: string): Promise<void> =>
      communitiesApi
        .listMessages(depsRef.current, groupId, { before, limit: PAGE_SIZE })
        .then((page) => {
          setHasMore(page.hasMore);
          setMessages((current) =>
            before ? [...page.messages, ...current] : page.messages,
          );
          setError(null);
        })
        .catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : "Could not load messages");
        })
        .finally(() => {
          setLoading(false);
        }),
    [groupId],
  );

  useEffect(() => {
    void fetchPage();
  }, [fetchPage]);

  const loadOlder = useCallback(async () => {
    const oldest = messages.find((message) => !message.pending && !message.failed);
    if (!oldest || !hasMore) return;
    await fetchPage(oldest.createdAt);
  }, [messages, hasMore, fetchPage]);

  const deliver = useCallback(
    async (clientId: string, input: SendMessageInput) => {
      try {
        const saved = await communitiesApi.sendMessage(
          depsRef.current,
          groupId,
          { ...input, clientId },
        );
        setMessages((current) =>
          current.map((message) =>
            message.clientId === clientId
              ? { ...saved, clientId }
              : message,
          ),
        );
      } catch (cause) {
        setMessages((current) =>
          current.map((message) =>
            message.clientId === clientId
              ? { ...message, pending: false, failed: true }
              : message,
          ),
        );
        throw cause;
      }
    },
    [groupId],
  );

  const send = useCallback(
    async (input: SendMessageInput) => {
      const clientId = newClientId();
      const optimistic: CommunityMessage = {
        id: clientId,
        groupId,
        userId: "",
        authorUsername: "",
        authorDisplayName: "You",
        authorAvatarUrl: null,
        kind: input.kind ?? "text",
        body: input.body ?? null,
        attachments: input.attachments ?? [],
        opportunityId: input.opportunityId ?? null,
        replyToId: input.replyToId ?? null,
        savedToBrief: false,
        createdAt: new Date().toISOString(),
        pending: true,
        clientId,
      };
      setMessages((current) => [...current, optimistic]);
      await deliver(clientId, input);
    },
    [groupId, deliver],
  );

  const retry = useCallback(
    async (clientId: string) => {
      const target = messages.find((message) => message.clientId === clientId);
      if (!target) return;
      setMessages((current) =>
        current.map((message) =>
          message.clientId === clientId
            ? { ...message, pending: true, failed: undefined }
            : message,
        ),
      );
      await deliver(clientId, {
        body: target.body ?? undefined,
        kind: target.kind === "image" ? "image" : "text",
        attachments: target.attachments,
        opportunityId: target.opportunityId ?? undefined,
        replyToId: target.replyToId ?? undefined,
      });
    },
    [messages, deliver],
  );

  useEffect(() => {
    if (!groupId) return;

    void authorizeRealtime(depsRef.current.supabase, () =>
      depsRef.current.getToken(),
    );

    const unsubscribe = subscribeToGroupMessages(
      depsRef.current.supabase,
      groupId,
      (row) => {
        const id = String(row.id ?? "");
        if (!id) return;
        setMessages((current) => {
          if (current.some((message) => message.id === id)) return current;
          // The realtime payload is the raw DB row (snake_case, no author
          // join), so refetch the tail rather than trying to shape it here.
          void communitiesApi
            .listMessages(depsRef.current, groupId, { limit: 10 })
            .then((page) => {
              setMessages((latest) => {
                const known = new Set(latest.map((message) => message.id));
                const fresh = page.messages.filter(
                  (message) => !known.has(message.id),
                );
                return fresh.length ? [...latest, ...fresh] : latest;
              });
            })
            .catch(() => undefined);
          return current;
        });
      },
    );

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps.supabase, groupId]);

  return { messages, send, loadOlder, retry, loading, hasMore, error };
}
```

- [ ] **Step 9: Write `useGroups`**

Create `<CORE>/src/communities/useGroups.ts`:

```ts
import { useCallback, useEffect, useState } from "react";
import { communitiesApi, type CommunitiesApiDeps } from "./api";
import type { CommunityGroup, CommunitySpace } from "./types";

export type UseGroupsQuery = {
  space?: string;
  anchor?: string;
  q?: string;
  scope?: "discover" | "mine";
};

export type UseGroupsReturn = {
  spaces: CommunitySpace[];
  groups: CommunityGroup[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useGroups(
  deps: CommunitiesApiDeps,
  query: UseGroupsQuery = {},
): UseGroupsReturn {
  const [spaces, setSpaces] = useState<CommunitySpace[]>([]);
  const [groups, setGroups] = useState<CommunityGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const key = JSON.stringify(query);

  const load = useCallback((): Promise<void> => {
    const parsed = JSON.parse(key) as UseGroupsQuery;
    return Promise.all([
      communitiesApi.listSpaces(deps).catch(() => [] as CommunitySpace[]),
      communitiesApi.listGroups(deps, parsed),
    ])
      .then(([spaceRows, groupRows]) => {
        setSpaces(spaceRows);
        setGroups(groupRows);
        setError(null);
      })
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error ? cause.message : "Could not load communities",
        );
      })
      .finally(() => {
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, deps.baseUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await load();
  }, [load]);

  return { spaces, groups, loading, error, refresh };
}
```

- [ ] **Step 10: Export from the barrel**

Add to `<CORE>/src/index.ts`, below the `permissions` line from Task 2:

```ts
export * from './communities/types';
export * from './communities/api';
export * from './communities/realtime';
export * from './communities/useGroupMessages';
export * from './communities/useGroups';
```

- [ ] **Step 11: Run the core tests**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile
npx jest ../packages/core/src/communities --maxWorkers=2
```

Expected: PASS. If `@testing-library/react` is unavailable in the mobile jest environment, run the
`useGroupMessages` spec from the web app instead:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npx vitest run ../packages/core/src/communities/useGroupMessages.spec.tsx
```

and convert `jest.fn`/`jest.mock` to `vi.fn`/`vi.mock` in that one file (keep `realtime.spec.ts` on
jest — it has no React dependency).

- [ ] **Step 12: Commit**

```bash
git add "<CORE>/src/communities" "<CORE>/src/index.ts"
git commit -m "feat(core): communities types, api client, realtime and optimistic useGroupMessages"
```

---

## Task 16: Web — service binding, `/communities`, `/communities/s/:spaceSlug`, nav

**Files:**
- Create: `edutu-web-app/src/services/communities.ts`
- Create: `edutu-web-app/src/components/CommunitiesPage.tsx`
- Create: `edutu-web-app/src/components/CommunitySpacePage.tsx`
- Create: `edutu-web-app/src/components/community/GroupCard.tsx`
- Modify: `edutu-web-app/src/App.tsx`
- Modify: `edutu-web-app/src/components/AppWorkspaceShell.tsx`
- Modify: `edutu-web-app/src/i18n/locales/en.json`

**Interfaces:**
- Consumes: `communitiesApi`, `useGroups`, `CommunityGroup`, `CommunitySpace` from `@edutu/core`;
  `getApiBaseUrl` (`src/lib/apiBaseUrl.ts`); `getProductApiToken` (`src/lib/clerkToken.ts`).
- Produces:
  ```ts
  // src/services/communities.ts
  export function useCommunitiesDeps(): { baseUrl: string; getToken: () => Promise<string | null> };
  export function useCommunitiesRealtimeDeps(): { baseUrl; getToken; supabase: SupabaseClient };
  ```

- [ ] **Step 1: Write the failing test**

Create `edutu-web-app/src/test/__tests__/communitiesRoutes.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const coreMocks = vi.hoisted(() => ({
  listSpaces: vi.fn(),
  listGroups: vi.fn(),
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: "user_1",
    getToken: vi.fn().mockResolvedValue("token-123"),
  }),
  useUser: () => ({ isLoaded: true, isSignedIn: true, user: { id: "user_1" } }),
  useClerk: () => ({ signOut: vi.fn() }),
}));

vi.mock("@edutu/core", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@edutu/core");
  return {
    ...actual,
    communitiesApi: {
      listSpaces: coreMocks.listSpaces,
      listGroups: coreMocks.listGroups,
    },
  };
});

import CommunitiesPage from "../../components/CommunitiesPage";

const space = {
  id: "s1",
  slug: "scholarships",
  name: "Scholarships",
  icon: "GraduationCap",
  sortOrder: 10,
  groupCount: 3,
};

const group = {
  id: "g1",
  slug: "chevening-2027-ab12",
  spaceId: "s1",
  name: "Chevening 2027",
  description: "Crew for the 2027 cycle",
  iconUrl: null,
  visibility: "public" as const,
  joinPolicy: "open" as const,
  opportunityId: null,
  memberCount: 42,
  lastMessageAt: "2026-07-25T10:00:00.000Z",
  expiresAt: "2026-12-01T00:00:00.000Z",
  status: "active" as const,
  myRole: null,
};

describe("CommunitiesPage", () => {
  beforeEach(() => {
    coreMocks.listSpaces.mockResolvedValue([space]);
    coreMocks.listGroups.mockResolvedValue([group]);
  });

  it("renders the spaces and the discovered groups", async () => {
    render(
      <MemoryRouter initialEntries={["/communities"]}>
        <Routes>
          <Route path="/communities" element={<CommunitiesPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText("Chevening 2027")).toBeTruthy());
    expect(screen.getByText("Scholarships")).toBeTruthy();
    expect(screen.getByText(/42 members/i)).toBeTruthy();
  });

  it("shows an empty state rather than a blank page", async () => {
    coreMocks.listGroups.mockResolvedValue([]);
    render(
      <MemoryRouter initialEntries={["/communities"]}>
        <Routes>
          <Route path="/communities" element={<CommunitiesPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText(/no groups yet/i)).toBeTruthy(),
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npx vitest run src/test/__tests__/communitiesRoutes.test.tsx
```

Expected: FAIL — cannot resolve `../../components/CommunitiesPage`.

- [ ] **Step 3: Write the service binding**

Create `edutu-web-app/src/services/communities.ts`:

```ts
import { useMemo } from "react";
import { useAuth } from "@clerk/clerk-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getApiBaseUrl } from "../lib/apiBaseUrl";
import { getProductApiToken } from "../lib/clerkToken";
import { supabase } from "../lib/supabaseClient";

/**
 * Binds @edutu/core's framework-agnostic communities client to this app's
 * Clerk token getter and backend base URL. Memoised on `getToken` so the deps
 * object is referentially stable — useGroupMessages' subscribe effect depends
 * on `deps.supabase`, and a new object every render would re-subscribe on
 * every render.
 */
export function useCommunitiesDeps() {
  const { getToken } = useAuth();
  return useMemo(
    () => ({
      baseUrl: getApiBaseUrl("Communities API"),
      getToken: () => getProductApiToken(getToken),
    }),
    [getToken],
  );
}

export function useCommunitiesRealtimeDeps() {
  const deps = useCommunitiesDeps();
  return useMemo(
    () => ({ ...deps, supabase: supabase as SupabaseClient }),
    [deps],
  );
}

/** Unauthenticated base URL for the public /g/:token preview. */
export function communitiesPublicBaseUrl(): string {
  return getApiBaseUrl("Communities API");
}
```

- [ ] **Step 4: Write the group card**

Create `edutu-web-app/src/components/community/GroupCard.tsx`:

```tsx
import { Link } from "react-router-dom";
import { Clock3, Lock, Users } from "lucide-react";
import type { CommunityGroup } from "@edutu/core";

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(diff)) return null;
  return Math.ceil(diff / 86_400_000);
}

export default function GroupCard({ group }: { group: CommunityGroup }) {
  const closing = daysUntil(group.expiresAt);

  return (
    <Link
      to={`/communities/g/${group.slug}`}
      className="group flex h-full flex-col gap-3 rounded-2xl border border-subtle bg-surface-layer p-5 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-elevated"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-lg font-semibold tracking-tight text-text-primary">
          {group.name}
        </h3>
        {group.visibility === "private" ? (
          <Lock size={16} className="mt-1 shrink-0 text-text-muted" aria-label="Private group" />
        ) : null}
      </div>

      {group.description ? (
        <p className="line-clamp-2 text-sm leading-6 text-text-secondary">
          {group.description}
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-2 text-xs text-text-secondary">
        <span className="inline-flex items-center gap-1 rounded-md border border-subtle bg-surface-elevated px-2 py-1">
          <Users size={12} />
          {group.memberCount} members
        </span>
        {group.status === "archived" ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-subtle bg-surface-elevated px-2 py-1">
            Archived · read-only
          </span>
        ) : closing !== null && closing <= 30 ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-2 py-1 text-warning">
            <Clock3 size={12} />
            Closes in {closing} day{closing === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
```

- [ ] **Step 5: Write the two pages**

Create `edutu-web-app/src/components/CommunitiesPage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Search, Users } from "lucide-react";
import { communitiesApi, type CommunityGroup, type CommunitySpace } from "@edutu/core";
import GroupCard from "./community/GroupCard";
import { useCommunitiesDeps } from "../services/communities";

export default function CommunitiesPage() {
  const deps = useCommunitiesDeps();
  const [spaces, setSpaces] = useState<CommunitySpace[]>([]);
  const [mine, setMine] = useState<CommunityGroup[]>([]);
  const [discover, setDiscover] = useState<CommunityGroup[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([
      communitiesApi.listSpaces(deps).catch(() => [] as CommunitySpace[]),
      communitiesApi.listGroups(deps, { scope: "mine" }).catch(() => []),
      communitiesApi.listGroups(deps, { scope: "discover", q: query || undefined }),
    ])
      .then(([spaceRows, mineRows, discoverRows]) => {
        if (!active) return;
        setSpaces(spaceRows);
        setMine(mineRows);
        setDiscover(discoverRows);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(
          cause instanceof Error ? cause.message : "Could not load communities",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [deps, query]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">
          Communities
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
          Find your crew
        </h1>
        <p className="max-w-2xl text-base leading-7 text-text-secondary">
          Groups are time-boxed to the deadline they serve, so nobody is left
          scrolling a graveyard. Join one, ask anything, and keep what you learn.
        </p>
      </header>

      <label className="mt-6 flex items-center gap-2 rounded-xl border border-subtle bg-surface-layer px-3 py-2">
        <Search size={16} className="text-text-muted" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search groups"
          className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
          aria-label="Search groups"
        />
      </label>

      {error ? (
        <p className="mt-5 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {mine.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-display text-xl font-semibold tracking-tight text-text-primary">
            For you
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {mine.map((group) => (
              <GroupCard key={group.id} group={group} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold tracking-tight text-text-primary">
          Spaces
        </h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {spaces.map((space) => (
            <Link
              key={space.id}
              to={`/communities/s/${space.slug}`}
              className="inline-flex items-center gap-2 rounded-pill border border-subtle bg-surface-elevated px-4 py-2 text-sm font-semibold text-text-secondary transition-colors hover:border-brand/40 hover:text-text-primary"
            >
              {space.name}
              <span className="text-text-muted">{space.groupCount}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold tracking-tight text-text-primary">
          Discover
        </h2>
        {loading ? (
          <div className="mt-6 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-brand" />
          </div>
        ) : discover.length ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {discover.map((group) => (
              <GroupCard key={group.id} group={group} />
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-subtle bg-surface-layer p-10 text-center">
            <Users className="mx-auto h-8 w-8 text-text-muted" />
            <p className="mt-3 font-display text-xl font-semibold tracking-tight text-text-primary">
              No groups yet
            </p>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              New groups appear here once they reach five members. Start one from
              any opportunity you are chasing.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
```

Create `edutu-web-app/src/components/CommunitySpacePage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { communitiesApi, type CommunityGroup } from "@edutu/core";
import GroupCard from "./community/GroupCard";
import { useCommunitiesDeps } from "../services/communities";

export default function CommunitySpacePage() {
  const { spaceSlug } = useParams<{ spaceSlug: string }>();
  const deps = useCommunitiesDeps();
  const [groups, setGroups] = useState<CommunityGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!spaceSlug) return;
    let active = true;
    setLoading(true);
    void communitiesApi
      .listGroups(deps, { space: spaceSlug, scope: "discover", limit: 60 })
      .then((rows) => {
        if (active) setGroups(rows);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [deps, spaceSlug]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <Link
        to="/communities"
        className="inline-flex items-center gap-2 text-sm font-semibold text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={16} />
        All spaces
      </Link>

      <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight capitalize text-text-primary">
        {(spaceSlug ?? "").replace(/_/g, " ")}
      </h1>

      {loading ? (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-brand" />
        </div>
      ) : groups.length ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <GroupCard key={group.id} group={group} />
          ))}
        </div>
      ) : (
        <p className="mt-6 rounded-2xl border border-subtle bg-surface-layer p-10 text-center text-sm text-text-secondary">
          No groups yet in this space. Be the first to start one.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Register the routes**

In `edutu-web-app/src/App.tsx`, add the lazy imports beside the others:

```tsx
const CommunitiesPage = lazy(() => import("./components/CommunitiesPage"));
const CommunitySpacePage = lazy(() => import("./components/CommunitySpacePage"));
```

and add these routes **before** the `path="*"` catch-all:

```tsx
      <Route
        path="/communities"
        element={
          <AppWorkspaceRoute>
            <CommunitiesPage />
          </AppWorkspaceRoute>
        }
      />
      <Route
        path="/communities/s/:spaceSlug"
        element={
          <AppWorkspaceRoute>
            <CommunitySpacePage />
          </AppWorkspaceRoute>
        }
      />
```

- [ ] **Step 7: Add the nav entry**

In `edutu-web-app/src/components/AppWorkspaceShell.tsx`:

1. add `Users,` to the `lucide-react` import block;
2. append to `primaryNavItems`:

```tsx
  { to: "/communities", label: "navigation.communities", icon: Users },
```

3. extend `isRouteActive`, before its final `return`:

```tsx
  if (to === "/communities") {
    return pathname.startsWith("/communities");
  }
```

4. extend `getWorkspaceTitleKey`:

```tsx
  if (pathname.startsWith("/communities/g/")) return "navigation.group";
  if (pathname.startsWith("/communities/s/")) return "navigation.space";
  if (pathname.startsWith("/communities")) return "navigation.communities";
```

5. add to `edutu-web-app/src/i18n/locales/en.json` under `"navigation"`:

```json
        "communities": "Communities",
        "space": "Space",
        "group": "Group",
```

> Do **not** add Communities to `mobileNavItems`: that bar renders `grid-cols-4` over three items plus
> a hardcoded "More" button, so a fourth item silently breaks the layout. Communities is reachable from
> the "More" sheet via `secondaryNavItems` if you want it there — leave the bottom bar alone.

- [ ] **Step 8: Run the test, lint and typecheck**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npx vitest run src/test/__tests__/communitiesRoutes.test.tsx && npm run lint && npm run typecheck
```

Expected: PASS; eslint exits 0 (`--max-warnings 0`); `tsc -b` silent.

- [ ] **Step 9: Commit**

```bash
git add edutu-web-app/src/services/communities.ts \
        edutu-web-app/src/components/CommunitiesPage.tsx \
        edutu-web-app/src/components/CommunitySpacePage.tsx \
        edutu-web-app/src/components/community \
        edutu-web-app/src/App.tsx \
        edutu-web-app/src/components/AppWorkspaceShell.tsx \
        edutu-web-app/src/i18n/locales/en.json \
        edutu-web-app/src/test/__tests__/communitiesRoutes.test.tsx
git commit -m "feat(web): communities home, space pages and workspace nav entry"
```

---

## Task 17: Web — the group chat page

**Files:**
- Create: `edutu-web-app/src/components/CommunityGroupPage.tsx`
- Create: `edutu-web-app/src/components/community/MessageList.tsx`
- Create: `edutu-web-app/src/components/community/MessageComposer.tsx`
- Create: `edutu-web-app/src/components/community/ReportDialog.tsx`
- Modify: `edutu-web-app/src/App.tsx`

**Interfaces:**
- Consumes: `useGroupMessages`, `communitiesApi`, `groupCan`, `CommunityMessage` from `@edutu/core`;
  `useCommunitiesRealtimeDeps` (Task 16).
- Produces: route `/communities/g/:groupSlug`.

- [ ] **Step 1: Write the failing test**

Append to `edutu-web-app/src/test/__tests__/communitiesRoutes.test.tsx`:

```tsx
import CommunityGroupPage from "../../components/CommunityGroupPage";
import { fireEvent } from "@testing-library/react";

const hookMocks = vi.hoisted(() => ({
  send: vi.fn().mockResolvedValue(undefined),
  retry: vi.fn().mockResolvedValue(undefined),
  loadOlder: vi.fn().mockResolvedValue(undefined),
  messages: [] as unknown[],
}));

vi.mock("@edutu/core/src/communities/useGroupMessages", () => ({
  useGroupMessages: () => ({
    messages: hookMocks.messages,
    send: hookMocks.send,
    retry: hookMocks.retry,
    loadOlder: hookMocks.loadOlder,
    loading: false,
    hasMore: false,
    error: null,
  }),
}));

describe("CommunityGroupPage", () => {
  beforeEach(() => {
    hookMocks.messages = [
      {
        id: "m1",
        groupId: "g1",
        userId: "user_2",
        authorUsername: "kwame",
        authorDisplayName: "Kwame",
        authorAvatarUrl: null,
        kind: "text",
        body: "Start your essays in August.",
        attachments: [],
        opportunityId: null,
        replyToId: null,
        savedToBrief: false,
        createdAt: "2026-07-25T09:00:00.000Z",
      },
    ];
    coreMocks.listGroups.mockResolvedValue([group]);
  });

  function renderGroup(myRole: string | null) {
    coreMocks.getGroup?.mockResolvedValue({ ...group, myRole });
    return render(
      <MemoryRouter initialEntries={["/communities/g/chevening-2027-ab12"]}>
        <Routes>
          <Route
            path="/communities/g/:groupSlug"
            element={<CommunityGroupPage />}
          />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("renders the message stream", async () => {
    renderGroup("member");
    await waitFor(() =>
      expect(screen.getByText("Start your essays in August.")).toBeTruthy(),
    );
  });

  it("shows a Join call to action instead of the composer for a non-member", async () => {
    renderGroup(null);
    await waitFor(() => expect(screen.getByText(/join group/i)).toBeTruthy());
    expect(screen.queryByPlaceholderText(/message/i)).toBeNull();
  });

  it("replaces the composer with a read-only notice in an archived group", async () => {
    coreMocks.getGroup?.mockResolvedValue({
      ...group,
      myRole: "member",
      status: "archived",
    });
    render(
      <MemoryRouter initialEntries={["/communities/g/chevening-2027-ab12"]}>
        <Routes>
          <Route
            path="/communities/g/:groupSlug"
            element={<CommunityGroupPage />}
          />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText(/read-only/i)).toBeTruthy(),
    );
  });

  it("sends a message from the composer", async () => {
    renderGroup("member");
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/message/i)).toBeTruthy(),
    );
    fireEvent.change(screen.getByPlaceholderText(/message/i), {
      target: { value: "Thanks!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() =>
      expect(hookMocks.send).toHaveBeenCalledWith({ body: "Thanks!" }),
    );
  });
});
```

Also add `getGroup: vi.fn()` to the `communitiesApi` object inside the existing
`vi.mock("@edutu/core", ...)` factory and to `coreMocks`.

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npx vitest run src/test/__tests__/communitiesRoutes.test.tsx
```

Expected: FAIL — cannot resolve `../../components/CommunityGroupPage`.

- [ ] **Step 3: Write `MessageList`**

Create `edutu-web-app/src/components/community/MessageList.tsx`:

```tsx
import { Flag, RotateCcw, Star } from "lucide-react";
import type { CommunityMessage } from "@edutu/core";

type Props = {
  messages: CommunityMessage[];
  canSave: boolean;
  onSave: (messageId: string) => void;
  onReport: (message: CommunityMessage) => void;
  onRetry: (clientId: string) => void;
};

export default function MessageList({
  messages,
  canSave,
  onSave,
  onReport,
  onRetry,
}: Props) {
  return (
    <ol className="flex flex-col gap-4">
      {messages.map((message) => {
        if (message.kind === "system") {
          return (
            <li
              key={message.id}
              className="mx-auto max-w-xl rounded-xl border border-subtle bg-surface-elevated px-4 py-2 text-center text-xs text-text-secondary"
            >
              {message.body}
            </li>
          );
        }

        if (message.blocked) {
          return (
            <li
              key={message.id}
              className="rounded-xl border border-subtle bg-surface-elevated px-4 py-2 text-xs italic text-text-muted"
            >
              Blocked message
            </li>
          );
        }

        return (
          <li key={message.id} className="flex flex-col gap-1">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold text-text-primary">
                {message.authorDisplayName}
              </span>
              <time
                className="text-2xs text-text-muted"
                dateTime={message.createdAt}
              >
                {new Date(message.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
              {message.kind === "announcement" ? (
                <span className="rounded-md border border-brand/20 bg-brand/10 px-2 py-0.5 text-2xs font-semibold text-brand">
                  Announcement
                </span>
              ) : null}
              {message.reviewStatus === "held" ? (
                <span className="rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 text-2xs text-warning">
                  Held for review — only you can see this
                </span>
              ) : null}
            </div>

            {message.body ? (
              <p
                className={`whitespace-pre-wrap text-sm leading-6 ${
                  message.pending ? "text-text-muted" : "text-text-secondary"
                }`}
              >
                {message.body}
              </p>
            ) : null}

            {message.attachments.length ? (
              <div className="flex flex-wrap gap-2">
                {message.attachments.map((attachment) => (
                  <img
                    key={attachment.url}
                    src={attachment.url}
                    width={attachment.width}
                    height={attachment.height}
                    alt=""
                    className="max-h-72 max-w-full rounded-xl border border-subtle object-cover"
                  />
                ))}
              </div>
            ) : null}

            <div className="flex items-center gap-3 text-2xs text-text-muted">
              {message.failed && message.clientId ? (
                <button
                  type="button"
                  onClick={() => onRetry(message.clientId as string)}
                  className="inline-flex items-center gap-1 font-semibold text-danger"
                >
                  <RotateCcw size={12} />
                  Failed — retry
                </button>
              ) : null}
              {canSave && !message.pending && !message.failed ? (
                <button
                  type="button"
                  onClick={() => onSave(message.id)}
                  className="inline-flex items-center gap-1 hover:text-text-secondary"
                  aria-label="Save to Brief"
                >
                  <Star size={12} fill={message.savedToBrief ? "currentColor" : "none"} />
                  {message.savedToBrief ? "Saved" : "Save"}
                </button>
              ) : null}
              {!message.pending && !message.failed ? (
                <button
                  type="button"
                  onClick={() => onReport(message)}
                  className="inline-flex items-center gap-1 hover:text-danger"
                  aria-label="Report message"
                >
                  <Flag size={12} />
                  Report
                </button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 4: Write `MessageComposer` and `ReportDialog`**

Create `edutu-web-app/src/components/community/MessageComposer.tsx`:

```tsx
import { useRef, useState } from "react";
import { ImagePlus, Loader2, Send } from "lucide-react";
import type { MessageAttachment, SendMessageInput } from "@edutu/core";

type Props = {
  disabled?: boolean;
  onSend: (input: SendMessageInput) => Promise<void>;
  onPickImage: (file: File) => Promise<MessageAttachment>;
};

export default function MessageComposer({
  disabled,
  onSend,
  onPickImage,
}: Props) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    const body = value.trim();
    if (!body && attachments.length === 0) return;
    setBusy(true);
    try {
      await onSend(
        attachments.length
          ? { body: body || undefined, kind: "image", attachments }
          : { body },
      );
      setValue("");
      setAttachments([]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sticky bottom-0 border-t border-subtle bg-surface-layer p-3">
      {attachments.length ? (
        <div className="mb-2 flex gap-2">
          {attachments.map((attachment) => (
            <img
              key={attachment.url}
              src={attachment.url}
              alt=""
              className="h-16 w-16 rounded-lg border border-subtle object-cover"
            />
          ))}
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            setBusy(true);
            try {
              setAttachments((current) => [...current, ...[]]);
              const uploaded = await onPickImage(file);
              setAttachments((current) => [...current, uploaded]);
            } finally {
              setBusy(false);
            }
          }}
        />
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => fileRef.current?.click()}
          className="rounded-xl border border-subtle bg-surface-elevated p-2 text-text-secondary disabled:opacity-50"
          aria-label="Add image"
        >
          <ImagePlus size={18} />
        </button>

        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          rows={1}
          maxLength={4000}
          disabled={disabled}
          placeholder="Message the group"
          className="max-h-40 flex-1 resize-y rounded-xl border border-subtle bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand/50"
        />

        <button
          type="button"
          onClick={() => void submit()}
          disabled={disabled || busy}
          className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <span className="inline-flex items-center gap-2">
              <Send size={16} />
              Send
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
```

Create `edutu-web-app/src/components/community/ReportDialog.tsx`:

```tsx
import { useState } from "react";

const REASONS = [
  { value: "scam", label: "Scam or fraud" },
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "hate", label: "Hate speech" },
  { value: "sexual", label: "Sexual content" },
  { value: "violence", label: "Violence" },
  { value: "other", label: "Something else" },
] as const;

type Props = {
  open: boolean;
  slaHours: number;
  onClose: () => void;
  onSubmit: (input: {
    reason: string;
    detail: string;
    blockAuthor: boolean;
  }) => Promise<void>;
};

export default function ReportDialog({
  open,
  slaHours,
  onClose,
  onSubmit,
}: Props) {
  const [reason, setReason] = useState<string>("scam");
  const [detail, setDetail] = useState("");
  const [blockAuthor, setBlockAuthor] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-overlay/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Report content"
        className="w-full max-w-md rounded-2xl border border-subtle bg-surface-layer p-5 shadow-elevated"
      >
        <h2 className="font-display text-lg font-semibold tracking-tight text-text-primary">
          Report this
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          Our team reviews every report within {slaHours} hours.
        </p>

        <fieldset className="mt-4 flex flex-col gap-2">
          <legend className="sr-only">Reason</legend>
          {REASONS.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="radio"
                name="report-reason"
                value={option.value}
                checked={reason === option.value}
                onChange={() => setReason(option.value)}
              />
              {option.label}
            </label>
          ))}
        </fieldset>

        <textarea
          value={detail}
          onChange={(event) => setDetail(event.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="Anything else we should know? (optional)"
          className="mt-4 w-full rounded-xl border border-subtle bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
        />

        <label className="mt-3 flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={blockAuthor}
            onChange={(event) => setBlockAuthor(event.target.checked)}
          />
          Also block this person
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-subtle px-4 py-2 text-sm font-semibold text-text-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSubmit({ reason, detail, blockAuthor });
                onClose();
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Send report
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write the page**

Create `edutu-web-app/src/components/CommunityGroupPage.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Clock3, Loader2, Users } from "lucide-react";
import {
  communitiesApi,
  groupCan,
  useGroupMessages,
  type CommunityGroup,
  type CommunityMessage,
  type MessageAttachment,
} from "@edutu/core";
import MessageComposer from "./community/MessageComposer";
import MessageList from "./community/MessageList";
import ReportDialog from "./community/ReportDialog";
import {
  useCommunitiesDeps,
  useCommunitiesRealtimeDeps,
} from "../services/communities";

export default function CommunityGroupPage() {
  const { groupSlug } = useParams<{ groupSlug: string }>();
  const deps = useCommunitiesDeps();
  const realtimeDeps = useCommunitiesRealtimeDeps();

  const [group, setGroup] = useState<CommunityGroup | null>(null);
  const [loadingGroup, setLoadingGroup] = useState(true);
  const [reportTarget, setReportTarget] = useState<CommunityMessage | null>(null);
  const [slaHours, setSlaHours] = useState(24);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!groupSlug) return;
    let active = true;
    setLoadingGroup(true);
    void communitiesApi
      .getGroup(deps, groupSlug)
      .then((row) => {
        if (active) setGroup(row);
      })
      .catch(() => {
        if (active) setGroup(null);
      })
      .finally(() => {
        if (active) setLoadingGroup(false);
      });
    return () => {
      active = false;
    };
  }, [deps, groupSlug]);

  const { messages, send, retry, loadOlder, loading, hasMore } =
    useGroupMessages(group?.id ?? "", realtimeDeps);

  const uploadImage = useCallback(
    async (file: File): Promise<MessageAttachment> => {
      if (!group) throw new Error("Group not loaded");
      const signed = await communitiesApi.createImageUpload(deps, group.id, {
        fileName: file.name,
        mimeType: file.type,
      });
      const put = await fetch(signed.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type, "x-upsert": "true" },
        body: file,
      });
      if (!put.ok) throw new Error("Upload failed");

      const dimensions = await new Promise<{ width: number; height: number }>(
        (resolve) => {
          const image = new Image();
          image.onload = () =>
            resolve({ width: image.naturalWidth, height: image.naturalHeight });
          image.onerror = () => resolve({ width: 1200, height: 1200 });
          image.src = URL.createObjectURL(file);
        },
      );

      return { url: signed.publicUrl, ...dimensions };
    },
    [deps, group],
  );

  if (loadingGroup) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-text-primary">
          Group not found
        </h1>
        <Link to="/communities" className="mt-4 inline-block text-sm font-semibold text-brand">
          Back to Communities
        </Link>
      </div>
    );
  }

  const isMember = group.myRole !== null;
  const isActive = group.status === "active";
  const canPost = isMember && isActive && groupCan(group.myRole!, "post");
  const canSave = isMember && isActive && groupCan(group.myRole!, "save");

  return (
    <div className="mx-auto flex h-[calc(100dvh-120px)] w-full max-w-4xl flex-col px-4 sm:px-6">
      <header className="flex items-center gap-3 border-b border-subtle py-4">
        <Link to="/communities" aria-label="Back to Communities">
          <ArrowLeft size={18} className="text-text-secondary" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lg font-semibold tracking-tight text-text-primary">
            {group.name}
          </h1>
          <p className="flex items-center gap-3 text-2xs text-text-muted">
            <span className="inline-flex items-center gap-1">
              <Users size={12} />
              {group.memberCount} members
            </span>
            {group.expiresAt ? (
              <span className="inline-flex items-center gap-1">
                <Clock3 size={12} />
                Closes {new Date(group.expiresAt).toLocaleDateString()}
              </span>
            ) : null}
          </p>
        </div>
      </header>

      {notice ? (
        <p className="mt-3 rounded-xl border border-subtle bg-surface-elevated px-3 py-2 text-xs text-text-secondary">
          {notice}
        </p>
      ) : null}

      <div className="flex-1 overflow-y-auto py-4">
        {hasMore ? (
          <button
            type="button"
            onClick={() => void loadOlder()}
            className="mx-auto mb-4 block rounded-pill border border-subtle px-4 py-1.5 text-xs font-semibold text-text-secondary"
          >
            Load earlier messages
          </button>
        ) : null}

        {loading ? (
          <div className="flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-brand" />
          </div>
        ) : (
          <MessageList
            messages={messages}
            canSave={canSave}
            onSave={(messageId) => {
              void communitiesApi
                .saveToBrief(deps, group.id, messageId)
                .catch(() => setNotice("Could not save that message."));
            }}
            onReport={setReportTarget}
            onRetry={(clientId) => void retry(clientId)}
          />
        )}
      </div>

      {!isMember ? (
        <div className="border-t border-subtle p-4 text-center">
          <button
            type="button"
            onClick={async () => {
              const result = await communitiesApi.joinGroup(deps, group.id);
              setGroup(result.group);
              setNotice(
                result.status === "requested"
                  ? "Request sent — an admin will review it."
                  : null,
              );
            }}
            className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white"
          >
            Join group
          </button>
        </div>
      ) : !isActive ? (
        <p className="border-t border-subtle p-4 text-center text-sm text-text-secondary">
          This group is archived and read-only. Everything said here stays
          searchable.
        </p>
      ) : (
        <MessageComposer
          disabled={!canPost}
          onSend={send}
          onPickImage={uploadImage}
        />
      )}

      <ReportDialog
        open={reportTarget !== null}
        slaHours={slaHours}
        onClose={() => setReportTarget(null)}
        onSubmit={async ({ reason, detail, blockAuthor }) => {
          if (!reportTarget) return;
          const result = await communitiesApi.report(deps, {
            targetType: "message",
            targetId: reportTarget.id,
            groupId: group.id,
            reason,
            detail: detail || undefined,
            blockAuthor,
          });
          setSlaHours(result.slaHours);
          setNotice(
            `Report received. We act on reports within ${result.slaHours} hours.`,
          );
        }}
      />
    </div>
  );
}
```

- [ ] **Step 6: Register the route**

In `edutu-web-app/src/App.tsx`:

```tsx
const CommunityGroupPage = lazy(() => import("./components/CommunityGroupPage"));
```

```tsx
      <Route
        path="/communities/g/:groupSlug"
        element={
          <AppWorkspaceRoute>
            <CommunityGroupPage />
          </AppWorkspaceRoute>
        }
      />
```

- [ ] **Step 7: Run the test, lint and typecheck**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npx vitest run src/test/__tests__/communitiesRoutes.test.tsx && npm run lint && npm run typecheck
```

Expected: PASS; lint clean; typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add edutu-web-app/src/components edutu-web-app/src/App.tsx \
        edutu-web-app/src/test/__tests__/communitiesRoutes.test.tsx
git commit -m "feat(web): group chat page with realtime, images, save and report"
```

---

## Task 18: Web — the public `/g/:token` invite landing

**Files:**
- Create: `edutu-web-app/src/components/CommunityInvitePage.tsx`
- Create: `edutu-web-app/src/test/__tests__/communityInvite.test.tsx`
- Modify: `edutu-web-app/src/App.tsx`

**Interfaces:**
- Consumes: `communitiesApi.previewInvite` / `.acceptInvite`, `InvitePreview` from `@edutu/core`;
  `communitiesPublicBaseUrl` (Task 16).
- Produces: public route `/g/:token`.

- [ ] **Step 1: Write the failing test**

Create `edutu-web-app/src/test/__tests__/communityInvite.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const clerkMocks = vi.hoisted(() => ({ isSignedIn: false }));
const apiMocks = vi.hoisted(() => ({
  previewInvite: vi.fn(),
  acceptInvite: vi.fn(),
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: clerkMocks.isSignedIn,
    getToken: vi.fn().mockResolvedValue("token-123"),
  }),
  useUser: () => ({ isLoaded: true, isSignedIn: clerkMocks.isSignedIn, user: null }),
  useClerk: () => ({ signOut: vi.fn() }),
}));

vi.mock("@edutu/core", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@edutu/core");
  return {
    ...actual,
    communitiesApi: {
      previewInvite: apiMocks.previewInvite,
      acceptInvite: apiMocks.acceptInvite,
    },
  };
});

import CommunityInvitePage from "../../components/CommunityInvitePage";

const preview = {
  groupId: "g1",
  groupSlug: "chevening-2027-ab12",
  name: "Chevening 2027",
  description: "Crew for the 2027 cycle",
  iconUrl: null,
  memberCount: 42,
  rules: "Be useful. No selling.",
  spaceSlug: "scholarships",
  valid: true,
  reason: null,
};

function renderInvite() {
  return render(
    <MemoryRouter initialEntries={["/g/abc123"]}>
      <Routes>
        <Route path="/g/:token" element={<CommunityInvitePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CommunityInvitePage", () => {
  beforeEach(() => {
    clerkMocks.isSignedIn = false;
    apiMocks.previewInvite.mockResolvedValue(preview);
  });

  it("renders the group preview without requiring sign-in", async () => {
    renderInvite();
    await waitFor(() => expect(screen.getByText("Chevening 2027")).toBeTruthy());
    expect(screen.getByText(/42 members/i)).toBeTruthy();
    expect(screen.getByText(/be useful/i)).toBeTruthy();
    expect(apiMocks.acceptInvite).not.toHaveBeenCalled();
  });

  it("prompts a signed-out visitor to sign in", async () => {
    renderInvite();
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /sign in to join/i })).toBeTruthy(),
    );
  });

  it("offers Join to a signed-in visitor", async () => {
    clerkMocks.isSignedIn = true;
    renderInvite();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /join group/i })).toBeTruthy(),
    );
  });

  it("explains an expired link instead of a generic error", async () => {
    apiMocks.previewInvite.mockResolvedValue({
      ...preview,
      valid: false,
      reason: "expired",
    });
    renderInvite();
    await waitFor(() =>
      expect(screen.getByText(/this invite link has expired/i)).toBeTruthy(),
    );
  });

  it("explains a revoked link", async () => {
    apiMocks.previewInvite.mockResolvedValue({
      ...preview,
      valid: false,
      reason: "revoked",
    });
    renderInvite();
    await waitFor(() =>
      expect(screen.getByText(/no longer active/i)).toBeTruthy(),
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npx vitest run src/test/__tests__/communityInvite.test.tsx
```

Expected: FAIL — cannot resolve `../../components/CommunityInvitePage`.

- [ ] **Step 3: Write the page**

Create `edutu-web-app/src/components/CommunityInvitePage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { Loader2, Users } from "lucide-react";
import { communitiesApi, type InvitePreview } from "@edutu/core";
import PublicEditorialShell from "./PublicEditorialShell";
import Seo from "./Seo";
import {
  communitiesPublicBaseUrl,
  useCommunitiesDeps,
} from "../services/communities";

const REASON_COPY: Record<string, string> = {
  expired: "This invite link has expired. Ask whoever shared it for a new one.",
  revoked: "This invite link is no longer active.",
  exhausted: "This invite link has been used up. Ask for a fresh one.",
};

export default function CommunityInvitePage() {
  const { token } = useParams<{ token: string }>();
  const { isSignedIn } = useAuth();
  const authedDeps = useCommunitiesDeps();
  const navigate = useNavigate();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!token) return;
    let active = true;
    setLoading(true);
    // Public deps: no token, so the card renders before sign-in. This page IS
    // the acquisition funnel; gating it behind auth would waste every share.
    void communitiesApi
      .previewInvite(
        { baseUrl: communitiesPublicBaseUrl(), getToken: async () => null },
        token,
      )
      .then((row) => {
        if (active) setPreview(row);
      })
      .catch(() => {
        if (active) setError("We couldn't find that invite.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <PublicEditorialShell mainClassName="max-w-2xl py-10 sm:py-14">
      <Seo
        title="Join an Edutu group"
        description="You've been invited to an Edutu community group."
        path={`/g/${token ?? ""}`}
        noindex
      />

      <section className="rounded-3xl border border-subtle bg-surface-layer p-6 shadow-soft sm:p-8">
        {loading ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-brand" />
          </div>
        ) : error || !preview ? (
          <>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-text-primary">
              Invite not found
            </h1>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              {error ?? "That link doesn't point anywhere."}
            </p>
            <Link
              to="/communities"
              className="mt-6 inline-flex h-11 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-white"
            >
              Browse communities
            </Link>
          </>
        ) : (
          <>
            <p className="text-2xs font-semibold uppercase tracking-[0.18em] text-text-muted">
              You're invited
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-text-primary">
              {preview.name}
            </h1>
            {preview.description ? (
              <p className="mt-3 text-base leading-7 text-text-secondary">
                {preview.description}
              </p>
            ) : null}

            <p className="mt-4 inline-flex items-center gap-2 rounded-md border border-subtle bg-surface-elevated px-3 py-1.5 text-xs text-text-secondary">
              <Users size={14} />
              {preview.memberCount} members
            </p>

            {preview.rules ? (
              <div className="mt-6 rounded-2xl border border-subtle bg-surface-elevated p-4">
                <h2 className="text-sm font-semibold text-text-primary">
                  Group rules
                </h2>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text-secondary">
                  {preview.rules}
                </p>
              </div>
            ) : null}

            {!preview.valid ? (
              <p className="mt-6 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
                {REASON_COPY[preview.reason ?? ""] ??
                  "This invite link can no longer be used."}
              </p>
            ) : isSignedIn ? (
              <button
                type="button"
                disabled={joining}
                onClick={async () => {
                  if (!token) return;
                  setJoining(true);
                  try {
                    const result = await communitiesApi.acceptInvite(
                      authedDeps,
                      token,
                    );
                    navigate(`/communities/g/${result.groupSlug}`, {
                      replace: true,
                    });
                  } catch (cause) {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "Could not join that group.",
                    );
                  } finally {
                    setJoining(false);
                  }
                }}
                className="mt-7 inline-flex h-11 items-center rounded-xl bg-brand px-5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {joining ? "Joining…" : "Join group"}
              </button>
            ) : (
              <Link
                to={`/auth?mode=sign-in&redirect=${encodeURIComponent(`/g/${token ?? ""}`)}`}
                className="mt-7 inline-flex h-11 items-center rounded-xl bg-brand px-5 text-sm font-semibold text-white"
              >
                Sign in to join
              </Link>
            )}
          </>
        )}
      </section>
    </PublicEditorialShell>
  );
}
```

- [ ] **Step 4: Register the public route**

In `edutu-web-app/src/App.tsx`:

```tsx
const CommunityInvitePage = lazy(
  () => import("./components/CommunityInvitePage"),
);
```

and, **before** the `path="*"` catch-all, with no wrapper (this route must work signed out):

```tsx
      <Route path="/g/:token" element={<CommunityInvitePage />} />
```

> No `vercel.json` change is needed: the existing catch-all rewrite already serves `index.html` for
> `/g/<token>`. Rich crawler unfurls for invite links are Slice 5's SEO work.

- [ ] **Step 5: Run the test, lint and typecheck**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npx vitest run src/test/__tests__/communityInvite.test.tsx && npm run lint && npm run typecheck
```

Expected: PASS, 5 tests; lint clean; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add edutu-web-app/src/components/CommunityInvitePage.tsx \
        edutu-web-app/src/App.tsx \
        edutu-web-app/src/test/__tests__/communityInvite.test.tsx
git commit -m "feat(web): public /g/:token invite landing page"
```

---

## Task 19: Mobile — Communities tab and index screen

**Files:**
- Create: `edutumobile/app/(app)/communities/index.tsx`
- Create: `edutumobile/components/communities/GroupRow.tsx`
- Create: `edutumobile/lib/communities.ts`
- Create: `edutumobile/__tests__/mobileCommunities.test.tsx`
- Modify: `edutumobile/app/(app)/_layout.tsx`
- Modify: `edutumobile/lib/i18n/locales/en/home.json` (+ the other 8 locales)

**Interfaces:**
- Consumes: `communitiesApi`, `CommunityGroup`, `CommunitySpace` from `@edutu/core`.
- Produces:
  ```ts
  // edutumobile/lib/communities.ts
  export function useCommunitiesDeps(): { baseUrl: string; getToken: () => Promise<string | null> };
  export function useCommunitiesRealtimeDeps(): { baseUrl; getToken; supabase: SupabaseClient };
  ```

- [ ] **Step 1: Write the failing test**

Create `edutumobile/__tests__/mobileCommunities.test.tsx`:

```tsx
import { render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
let mockGroups: unknown[] = [];
let mockSpaces: unknown[] = [];

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock("@clerk/clerk-expo", () => ({
  useAuth: () => ({ getToken: jest.fn().mockResolvedValue("token") }),
  useUser: () => ({ user: { id: "user_1" } }),
}));
jest.mock("../components/context/ThemeContext", () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      background: "#FFFFFF",
      foreground: "#111827",
      card: "#FFFFFF",
      border: "#E5E7EB",
      accent: "#6366F1",
      primary: "#2563EB",
      textSecondary: "#64748B",
    },
    reducedMotion: true,
  }),
}));
jest.mock("../lib/supabase", () => ({ supabase: {} }));
jest.mock(
  "@edutu/core",
  () => ({
    communitiesApi: {
      listSpaces: jest.fn(async () => mockSpaces),
      listGroups: jest.fn(async () => mockGroups),
    },
    groupCan: () => true,
  }),
  { virtual: true },
);
jest.mock("lucide-react-native", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return new Proxy(
    {},
    {
      get: (_target, name) => (props: Record<string, unknown>) =>
        React.createElement(Text, props, String(name)),
    },
  );
});

const CommunitiesScreen = require("../app/(app)/communities/index").default;

describe("mobile communities index", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSpaces = [
      { id: "s1", slug: "scholarships", name: "Scholarships", icon: "X", sortOrder: 10, groupCount: 2 },
    ];
    mockGroups = [
      {
        id: "g1",
        slug: "chevening-2027-ab12",
        spaceId: "s1",
        name: "Chevening 2027",
        description: null,
        iconUrl: null,
        visibility: "public",
        joinPolicy: "open",
        opportunityId: null,
        memberCount: 42,
        lastMessageAt: null,
        expiresAt: null,
        status: "active",
        myRole: null,
      },
    ];
  });

  it("lists discovered groups", async () => {
    const { getByText } = render(<CommunitiesScreen />);
    await waitFor(() => expect(getByText("Chevening 2027")).toBeTruthy());
    expect(getByText(/42 members/i)).toBeTruthy();
  });

  it("shows an empty state when there is nothing to join", async () => {
    mockGroups = [];
    const { getByText } = render(<CommunitiesScreen />);
    await waitFor(() => expect(getByText(/no groups yet/i)).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile
npx jest __tests__/mobileCommunities.test.tsx --maxWorkers=2
```

Expected: FAIL — `Cannot find module '../app/(app)/communities/index'`.

- [ ] **Step 3: Write the deps helper**

Create `edutumobile/lib/communities.ts`:

```ts
import { useMemo } from "react";
import { useAuth } from "@clerk/clerk-expo";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getConfig } from "./config";
import { supabase } from "./supabase";

/**
 * Binds @edutu/core's communities client to Clerk + the configured API base
 * URL. Memoised on `getToken` so the deps object stays referentially stable —
 * useGroupMessages' subscribe effect depends on `deps.supabase`, and a fresh
 * object every render would tear the realtime channel down and back up on
 * every keystroke.
 */
export function useCommunitiesDeps() {
  const { getToken } = useAuth();
  return useMemo(
    () => ({
      baseUrl: getConfig().apiBaseUrl,
      getToken: async () => (await getToken().catch(() => null)) ?? null,
    }),
    [getToken],
  );
}

export function useCommunitiesRealtimeDeps() {
  const deps = useCommunitiesDeps();
  return useMemo(
    () => ({ ...deps, supabase: supabase as SupabaseClient }),
    [deps],
  );
}
```

- [ ] **Step 4: Write the row component and the screen**

Create `edutumobile/components/communities/GroupRow.tsx`:

```tsx
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Clock3, Lock, Users } from "lucide-react-native";
import type { CommunityGroup } from "@edutu/core";
import { useTheme } from "../context/ThemeContext";

export function GroupRow({
  group,
  onPress,
}: {
  group: CommunityGroup;
  onPress: () => void;
}) {
  const { colors, isDark } = useTheme();
  const closing = group.expiresAt
    ? Math.ceil((new Date(group.expiresAt).getTime() - Date.now()) / 86_400_000)
    : null;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
          {group.name}
        </Text>
        {group.visibility === "private" ? (
          <Lock size={14} color={colors.textSecondary} />
        ) : null}
      </View>

      {group.description ? (
        <Text
          style={[styles.description, { color: colors.textSecondary }]}
          numberOfLines={2}
        >
          {group.description}
        </Text>
      ) : null}

      <View style={styles.metaRow}>
        <View style={styles.meta}>
          <Users size={12} color={colors.textSecondary} />
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>
            {group.memberCount} members
          </Text>
        </View>
        {group.status === "archived" ? (
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>
            Archived · read-only
          </Text>
        ) : closing !== null && closing <= 30 ? (
          <View style={styles.meta}>
            <Clock3 size={12} color={isDark ? "#FBBF24" : "#B45309"} />
            <Text style={[styles.metaText, { color: isDark ? "#FBBF24" : "#B45309" }]}>
              Closes in {closing}d
            </Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 6 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { flex: 1, fontSize: 16, fontWeight: "600" },
  description: { fontSize: 13, lineHeight: 19 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 2 },
  meta: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 12 },
});
```

Create `edutumobile/app/(app)/communities/index.tsx`:

```tsx
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { communitiesApi, type CommunityGroup } from "@edutu/core";
import { ScreenHeader } from "../../../components/ui/ScreenHeader";
import { useTheme } from "../../../components/context/ThemeContext";
import { GroupRow } from "../../../components/communities/GroupRow";
import { useCommunitiesDeps } from "../../../lib/communities";

export default function CommunitiesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const deps = useCommunitiesDeps();

  const [mine, setMine] = useState<CommunityGroup[]>([]);
  const [discover, setDiscover] = useState<CommunityGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback((): Promise<void> => {
    return Promise.all([
      communitiesApi.listGroups(deps, { scope: "mine" }).catch(() => []),
      communitiesApi.listGroups(deps, { scope: "discover" }).catch(() => []),
    ])
      .then(([mineRows, discoverRows]) => {
        setMine(mineRows);
        setDiscover(discoverRows);
      })
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, [deps]);

  useEffect(() => {
    void load();
  }, [load]);

  const sections: CommunityGroup[] = [...mine, ...discover];

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <ScreenHeader title="Communities" subtitle="Find your crew" />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : sections.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            No groups yet
          </Text>
          <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
            New groups appear here once they reach five members. Start one from
            any opportunity you are chasing.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
          ListHeaderComponent={
            mine.length ? (
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                For you
              </Text>
            ) : null
          }
          renderItem={({ item, index }) => (
            <>
              {mine.length > 0 && index === mine.length ? (
                <Text
                  style={[
                    styles.sectionTitle,
                    { color: colors.foreground, marginTop: 20 },
                  ]}
                >
                  Discover
                </Text>
              ) : null}
              <GroupRow
                group={item}
                onPress={() =>
                  router.push(`/communities/${item.id}` as never)
                }
              />
            </>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 8 },
  list: { padding: 16, paddingBottom: 120 },
  sectionTitle: { fontSize: 18, fontWeight: "600", marginBottom: 10 },
  emptyTitle: { fontSize: 18, fontWeight: "600" },
  emptyBody: { fontSize: 14, lineHeight: 20, textAlign: "center" },
});
```

- [ ] **Step 5: Wire the tab**

In `edutumobile/app/(app)/_layout.tsx`:

1. add `MessagesSquare` to the `lucide-react-native` import block;
2. add the tab entry to the `tabs` array (it becomes 5 items):

```tsx
    { key: "communities", route: "/communities", label: t('tabs.communities'), icon: MessagesSquare, badge: undefined },
```

3. register both screens in the `<Stack>`:

```tsx
    <Stack.Screen name="communities/index" />
    <Stack.Screen name="communities/[groupId]" />
```

4. in `getActiveRoute()`, add before the final return:

```tsx
    if (normalizedPath === "/communities") return "communities";
```

and add `"/communities/"` to the `"subpage"` `includes(...)` list so the bottom nav hides inside a
group chat, exactly like `"/opportunities/"` already does;

5. add `"communities"` to `topLevelRoutes`;
6. add `activeRoute === "communities"` to `hideSharedHeader` (the screen renders its own `ScreenHeader`).

> **Layout math:** the nav pill width is computed from a 4-item assumption (`NAV_PILL_WIDTH`). After
> adding the fifth tab, run the app and check the bar; if labels clip, reduce `NAV_PILL_WIDTH`
> proportionally. `__tests__/mobileBottomNavStyles.test.tsx` hardcodes a 4-item `TABS` const — update
> that fixture to 5 items in the same commit or that suite fails.

- [ ] **Step 6: Add the i18n key**

Add `"communities": "Communities"` under `"tabs"` in `edutumobile/lib/i18n/locales/en/home.json`, then
in each of `ar, es, fr, ha, hi, pt, sw, zh`. `ar/ha/hi/sw` mix 2- and 4-space indentation — hand-edit
those four to match their surrounding style. Then regenerate:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile
node scripts/gen-i18n-resources.js
```

Expected: `lib/i18n/resources.ts` is rewritten; `git diff --stat` shows only that file plus the nine
locale JSONs.

- [ ] **Step 7: Run the tests and lint**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile
npx jest __tests__/mobileCommunities.test.tsx __tests__/mobileBottomNavStyles.test.tsx --maxWorkers=2 \
  && npm run lint
```

Expected: PASS; eslint exits 0 at `--max-warnings 0`.

- [ ] **Step 8: Commit**

```bash
git add edutumobile/app/\(app\)/communities edutumobile/components/communities \
        edutumobile/lib/communities.ts edutumobile/app/\(app\)/_layout.tsx \
        edutumobile/lib/i18n edutumobile/__tests__
git commit -m "feat(mobile): communities tab and discovery screen"
```

---

## Task 20: Mobile — the group chat screen

**Files:**
- Create: `edutumobile/app/(app)/communities/[groupId].tsx`
- Create: `edutumobile/components/communities/MessageBubble.tsx`
- Create: `edutumobile/components/communities/ReportSheet.tsx`
- Create: `edutumobile/__tests__/mobileCommunityGroup.test.tsx`

**Interfaces:**
- Consumes: `useGroupMessages`, `communitiesApi`, `groupCan` from `@edutu/core`;
  `useCommunitiesRealtimeDeps` (Task 19).
- Produces: route `/communities/[groupId]`.

> Structure mirrors `edutumobile/app/(app)/chat.tsx`: `SafeAreaView edges={['top','left','right']}` →
> `ScreenHeader` → `KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}` →
> non-inverted `FlatList` with `onContentSizeChange` → `scrollToEnd`, `keyboardDismissMode="interactive"`,
> `keyboardShouldPersistTaps="handled"` → inline composer whose bottom padding uses
> `Math.max(insets.bottom, 8)` when the keyboard is hidden.

- [ ] **Step 1: Write the failing test**

Create `edutumobile/__tests__/mobileCommunityGroup.test.tsx`:

```tsx
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

const mockBack = jest.fn();
let mockMessages: unknown[] = [];
let mockGroup: Record<string, unknown> = {};
const mockSend = jest.fn().mockResolvedValue(undefined);
const mockRetry = jest.fn().mockResolvedValue(undefined);

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: jest.fn() }),
  useLocalSearchParams: () => ({ groupId: "g1" }),
}));
jest.mock("@clerk/clerk-expo", () => ({
  useAuth: () => ({ getToken: jest.fn().mockResolvedValue("token") }),
  useUser: () => ({ user: { id: "user_1" } }),
}));
jest.mock("../components/context/ThemeContext", () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      background: "#FFFFFF",
      foreground: "#111827",
      card: "#FFFFFF",
      border: "#E5E7EB",
      accent: "#6366F1",
      primary: "#2563EB",
      textSecondary: "#64748B",
    },
    reducedMotion: true,
  }),
}));
jest.mock("../lib/supabase", () => ({ supabase: {} }));
jest.mock(
  "@edutu/core",
  () => ({
    communitiesApi: {
      getGroup: jest.fn(async () => mockGroup),
      joinGroup: jest.fn(async () => ({ status: "joined", group: mockGroup })),
      report: jest.fn(async () => ({ id: "r1", slaHours: 24 })),
      saveToBrief: jest.fn(async () => ({ savedToBrief: true })),
      markRead: jest.fn(async () => ({ success: true })),
      createImageUpload: jest.fn(),
    },
    groupCan: (role: string, action: string) =>
      role === "member" ? ["post", "react", "save"].includes(action) : true,
    useGroupMessages: () => ({
      messages: mockMessages,
      send: mockSend,
      retry: mockRetry,
      loadOlder: jest.fn(),
      loading: false,
      hasMore: false,
      error: null,
    }),
  }),
  { virtual: true },
);
jest.mock("lucide-react-native", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return new Proxy(
    {},
    {
      get: (_target, name) => (props: Record<string, unknown>) =>
        React.createElement(Text, props, String(name)),
    },
  );
});

const GroupScreen = require("../app/(app)/communities/[groupId]").default;

function findTouchable(node: any) {
  let current = node;
  while (current && !current.props?.onPress) current = current.parent;
  return current;
}

describe("mobile community group screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGroup = {
      id: "g1",
      slug: "chevening-2027-ab12",
      spaceId: "s1",
      name: "Chevening 2027",
      description: null,
      iconUrl: null,
      visibility: "public",
      joinPolicy: "open",
      opportunityId: null,
      memberCount: 42,
      lastMessageAt: null,
      expiresAt: null,
      status: "active",
      myRole: "member",
    };
    mockMessages = [
      {
        id: "m1",
        groupId: "g1",
        userId: "user_2",
        authorUsername: "kwame",
        authorDisplayName: "Kwame",
        authorAvatarUrl: null,
        kind: "text",
        body: "Start your essays in August.",
        attachments: [],
        opportunityId: null,
        replyToId: null,
        savedToBrief: false,
        createdAt: "2026-07-25T09:00:00.000Z",
      },
    ];
  });

  it("renders the message stream", async () => {
    const { getByText } = render(<GroupScreen />);
    await waitFor(() =>
      expect(getByText("Start your essays in August.")).toBeTruthy(),
    );
  });

  it("sends from the composer and clears the input", async () => {
    const { getByPlaceholderText, getByText } = render(<GroupScreen />);
    await waitFor(() => expect(getByPlaceholderText("Message the group")).toBeTruthy());
    fireEvent.changeText(getByPlaceholderText("Message the group"), "Thanks!");
    act(() => {
      findTouchable(getByText("Send")).props.onPress?.();
    });
    await waitFor(() =>
      expect(mockSend).toHaveBeenCalledWith({ body: "Thanks!" }),
    );
  });

  it("shows Join instead of the composer for a non-member", async () => {
    mockGroup = { ...mockGroup, myRole: null };
    const { getByText, queryByPlaceholderText } = render(<GroupScreen />);
    await waitFor(() => expect(getByText("Join group")).toBeTruthy());
    expect(queryByPlaceholderText("Message the group")).toBeNull();
  });

  it("shows a read-only notice in an archived group", async () => {
    mockGroup = { ...mockGroup, status: "archived" };
    const { getByText, queryByPlaceholderText } = render(<GroupScreen />);
    await waitFor(() => expect(getByText(/read-only/i)).toBeTruthy());
    expect(queryByPlaceholderText("Message the group")).toBeNull();
  });

  it("offers retry on a failed message", async () => {
    mockMessages = [
      { ...(mockMessages[0] as object), id: "local-1", clientId: "local-1", failed: true },
    ];
    const { getByText } = render(<GroupScreen />);
    await waitFor(() => expect(getByText(/retry/i)).toBeTruthy());
    act(() => {
      findTouchable(getByText(/retry/i)).props.onPress?.();
    });
    await waitFor(() => expect(mockRetry).toHaveBeenCalledWith("local-1"));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile
npx jest __tests__/mobileCommunityGroup.test.tsx --maxWorkers=2
```

Expected: FAIL — `Cannot find module '../app/(app)/communities/[groupId]'`.

- [ ] **Step 3: Write `MessageBubble`**

Create `edutumobile/components/communities/MessageBubble.tsx`:

```tsx
import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Flag, RotateCcw, Star } from "lucide-react-native";
import type { CommunityMessage } from "@edutu/core";
import { useTheme } from "../context/ThemeContext";

type Props = {
  message: CommunityMessage;
  isMine: boolean;
  canSave: boolean;
  onSave: () => void;
  onReport: () => void;
  onRetry: () => void;
};

export function MessageBubble({
  message,
  isMine,
  canSave,
  onSave,
  onReport,
  onRetry,
}: Props) {
  const { colors, isDark } = useTheme();

  if (message.kind === "system") {
    return (
      <View style={[styles.system, { borderColor: colors.border }]}>
        <Text style={[styles.systemText, { color: colors.textSecondary }]}>
          {message.body}
        </Text>
      </View>
    );
  }

  if (message.blocked) {
    return (
      <View style={[styles.system, { borderColor: colors.border }]}>
        <Text style={[styles.systemText, { color: colors.textSecondary }]}>
          Blocked message
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.row, isMine ? styles.rowMine : styles.rowOther]}>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: isMine
              ? colors.accent
              : isDark
                ? "rgba(255,255,255,0.06)"
                : "#F1F5F9",
          },
          message.pending ? styles.pending : null,
        ]}
      >
        {!isMine ? (
          <Text style={[styles.author, { color: colors.textSecondary }]}>
            {message.authorDisplayName}
          </Text>
        ) : null}

        {message.kind === "announcement" ? (
          <Text style={[styles.badge, { color: isMine ? "#FFFFFF" : colors.accent }]}>
            Announcement
          </Text>
        ) : null}

        {message.reviewStatus === "held" ? (
          <Text style={[styles.badge, { color: isDark ? "#FBBF24" : "#B45309" }]}>
            Held for review — only you can see this
          </Text>
        ) : null}

        {message.body ? (
          <Text
            style={[
              styles.body,
              { color: isMine ? "#FFFFFF" : colors.foreground },
            ]}
          >
            {message.body}
          </Text>
        ) : null}

        {message.attachments.map((attachment) => (
          <Image
            key={attachment.url}
            source={{ uri: attachment.url }}
            style={styles.image}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        ))}
      </View>

      <View style={styles.actions}>
        {message.failed ? (
          <TouchableOpacity onPress={onRetry} style={styles.action}>
            <RotateCcw size={12} color="#DC2626" />
            <Text style={[styles.actionText, { color: "#DC2626" }]}>
              Failed — retry
            </Text>
          </TouchableOpacity>
        ) : null}
        {canSave && !message.pending && !message.failed ? (
          <TouchableOpacity onPress={onSave} style={styles.action}>
            <Star size={12} color={colors.textSecondary} />
            <Text style={[styles.actionText, { color: colors.textSecondary }]}>
              {message.savedToBrief ? "Saved" : "Save"}
            </Text>
          </TouchableOpacity>
        ) : null}
        {!message.pending && !message.failed && !isMine ? (
          <TouchableOpacity onPress={onReport} style={styles.action}>
            <Flag size={12} color={colors.textSecondary} />
            <Text style={[styles.actionText, { color: colors.textSecondary }]}>
              Report
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: 12, maxWidth: "88%" },
  rowMine: { alignSelf: "flex-end", alignItems: "flex-end" },
  rowOther: { alignSelf: "flex-start", alignItems: "flex-start" },
  bubble: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, gap: 4 },
  pending: { opacity: 0.6 },
  author: { fontSize: 12, fontWeight: "600" },
  badge: { fontSize: 11, fontWeight: "600" },
  body: { fontSize: 15, lineHeight: 21 },
  image: { width: 200, height: 200, borderRadius: 12, marginTop: 4 },
  actions: { flexDirection: "row", gap: 12, marginTop: 4 },
  action: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionText: { fontSize: 11 },
  system: {
    alignSelf: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 12,
    maxWidth: "90%",
  },
  systemText: { fontSize: 12, textAlign: "center" },
});
```

- [ ] **Step 4: Write `ReportSheet`**

Create `edutumobile/components/communities/ReportSheet.tsx`:

```tsx
import React, { useState } from "react";
import {
  Modal,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "../context/ThemeContext";

const REASONS = [
  { value: "scam", label: "Scam or fraud" },
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "hate", label: "Hate speech" },
  { value: "sexual", label: "Sexual content" },
  { value: "violence", label: "Violence" },
  { value: "other", label: "Something else" },
];

export function ReportSheet({
  visible,
  slaHours,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  slaHours: number;
  onClose: () => void;
  onSubmit: (input: {
    reason: string;
    detail: string;
    blockAuthor: boolean;
  }) => Promise<void>;
}) {
  const { colors } = useTheme();
  const [reason, setReason] = useState("scam");
  const [detail, setDetail] = useState("");
  const [blockAuthor, setBlockAuthor] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>Report this</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Our team reviews every report within {slaHours} hours.
          </Text>

          {REASONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              onPress={() => setReason(option.value)}
              style={styles.reasonRow}
            >
              <View
                style={[
                  styles.radio,
                  {
                    borderColor:
                      reason === option.value ? colors.accent : colors.border,
                    backgroundColor:
                      reason === option.value ? colors.accent : "transparent",
                  },
                ]}
              />
              <Text style={[styles.reasonText, { color: colors.foreground }]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}

          <TextInput
            value={detail}
            onChangeText={setDetail}
            placeholder="Anything else we should know? (optional)"
            placeholderTextColor={colors.textSecondary}
            multiline
            maxLength={1000}
            style={[
              styles.input,
              { borderColor: colors.border, color: colors.foreground },
            ]}
          />

          <View style={styles.blockRow}>
            <Text style={[styles.reasonText, { color: colors.foreground }]}>
              Also block this person
            </Text>
            <Switch value={blockAuthor} onValueChange={setBlockAuthor} />
          </View>

          <View style={styles.buttons}>
            <TouchableOpacity onPress={onClose} style={styles.cancel}>
              <Text style={{ color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={busy}
              onPress={async () => {
                setBusy(true);
                try {
                  await onSubmit({ reason, detail, blockAuthor });
                  onClose();
                } finally {
                  setBusy(false);
                }
              }}
              style={[styles.submit, { backgroundColor: "#DC2626" }]}
            >
              <Text style={styles.submitText}>Send report</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 8 },
  title: { fontSize: 18, fontWeight: "700" },
  subtitle: { fontSize: 13, marginBottom: 6 },
  reasonRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  reasonText: { fontSize: 14 },
  input: { borderWidth: 1, borderRadius: 12, padding: 10, minHeight: 70, marginTop: 8 },
  blockRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  buttons: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 16 },
  cancel: { paddingHorizontal: 16, paddingVertical: 10 },
  submit: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12 },
  submitText: { color: "#FFFFFF", fontWeight: "600" },
});
```

- [ ] **Step 5: Write the screen**

Create `edutumobile/app/(app)/communities/[groupId].tsx`:

```tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Send } from "lucide-react-native";
import {
  communitiesApi,
  groupCan,
  useGroupMessages,
  type CommunityGroup,
  type CommunityMessage,
} from "@edutu/core";
import { useUser } from "@clerk/clerk-expo";
import { ScreenHeader } from "../../../components/ui/ScreenHeader";
import { useTheme } from "../../../components/context/ThemeContext";
import { MessageBubble } from "../../../components/communities/MessageBubble";
import { ReportSheet } from "../../../components/communities/ReportSheet";
import {
  useCommunitiesDeps,
  useCommunitiesRealtimeDeps,
} from "../../../lib/communities";

export default function CommunityGroupScreen() {
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const router = useRouter();
  const { user } = useUser();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const deps = useCommunitiesDeps();
  const realtimeDeps = useCommunitiesRealtimeDeps();

  const [group, setGroup] = useState<CommunityGroup | null>(null);
  const [loadingGroup, setLoadingGroup] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [reportTarget, setReportTarget] = useState<CommunityMessage | null>(null);
  const [slaHours, setSlaHours] = useState(24);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const listRef = useRef<FlatList>(null);

  const { messages, send, retry, loadOlder, loading, hasMore } =
    useGroupMessages(groupId ?? "", realtimeDeps);

  useEffect(() => {
    if (!groupId) return;
    let active = true;
    setLoadingGroup(true);
    void communitiesApi
      .getGroup(deps, groupId)
      .then((row) => {
        if (active) setGroup(row);
      })
      .catch(() => {
        if (active) setGroup(null);
      })
      .finally(() => {
        if (active) setLoadingGroup(false);
      });
    return () => {
      active = false;
    };
  }, [deps, groupId]);

  // Unread accounting: stamp the read cursor when the screen opens.
  useEffect(() => {
    if (!groupId || !group?.myRole) return;
    void communitiesApi.markRead(deps, groupId).catch(() => undefined);
  }, [deps, groupId, group?.myRole]);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const handleSend = useCallback(async () => {
    const body = input.trim();
    if (!body || sending) return;
    setInput("");
    setSending(true);
    try {
      await send({ body });
    } catch {
      // The optimistic row is already flagged failed by the hook; restore the
      // text so a quick edit-and-resend is possible.
      setInput(body);
    } finally {
      setSending(false);
    }
  }, [input, sending, send]);

  const isMember = Boolean(group?.myRole);
  const isActive = group?.status === "active";
  const canPost = Boolean(
    isMember && isActive && group && groupCan(group.myRole!, "post"),
  );
  const canSave = Boolean(
    isMember && isActive && group && groupCan(group.myRole!, "save"),
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <ScreenHeader
        title={group?.name ?? "Group"}
        subtitle={group ? `${group.memberCount} members` : undefined}
        showBack
        onBack={() => router.back()}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
        keyboardVerticalOffset={0}
      >
        {loadingGroup || loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : !group ? (
          <View style={styles.center}>
            <Text style={{ color: colors.foreground }}>Group not found</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.clientId ?? item.id}
            contentContainerStyle={styles.list}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() =>
              listRef.current?.scrollToEnd({ animated: true })
            }
            onEndReachedThreshold={0.1}
            ListHeaderComponent={
              hasMore ? (
                <TouchableOpacity
                  onPress={() => void loadOlder()}
                  style={styles.loadOlder}
                >
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                    Load earlier messages
                  </Text>
                </TouchableOpacity>
              ) : null
            }
            renderItem={({ item }) => (
              <MessageBubble
                message={item}
                isMine={item.userId === user?.id || Boolean(item.pending)}
                canSave={canSave}
                onSave={() => {
                  if (!groupId) return;
                  void communitiesApi
                    .saveToBrief(deps, groupId, item.id)
                    .catch(() => undefined);
                }}
                onReport={() => setReportTarget(item)}
                onRetry={() => {
                  if (item.clientId) void retry(item.clientId);
                }}
              />
            )}
          />
        )}

        {group && !isMember ? (
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              onPress={async () => {
                if (!groupId) return;
                const result = await communitiesApi.joinGroup(deps, groupId);
                setGroup(result.group);
              }}
              style={[styles.joinButton, { backgroundColor: colors.accent }]}
            >
              <Text style={styles.joinText}>Join group</Text>
            </TouchableOpacity>
          </View>
        ) : group && !isActive ? (
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <Text style={[styles.readOnly, { color: colors.textSecondary }]}>
              This group is archived and read-only. Everything said here stays
              searchable.
            </Text>
          </View>
        ) : group ? (
          <View
            style={[
              styles.composer,
              {
                borderTopColor: colors.border,
                backgroundColor: colors.background,
                paddingBottom: keyboardVisible ? 8 : Math.max(insets.bottom, 8),
              },
            ]}
          >
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Message the group"
              placeholderTextColor={colors.textSecondary}
              editable={canPost}
              multiline
              maxLength={4000}
              style={[
                styles.input,
                {
                  color: colors.foreground,
                  backgroundColor: isDark ? "#1E293B" : "#F1F5F9",
                },
              ]}
            />
            <TouchableOpacity
              onPress={() => void handleSend()}
              disabled={!canPost || sending || !input.trim()}
              style={[
                styles.sendButton,
                { backgroundColor: colors.accent, opacity: canPost ? 1 : 0.4 },
              ]}
            >
              <Send size={16} color="#FFFFFF" />
              <Text style={styles.sendText}>Send</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <ReportSheet
        visible={reportTarget !== null}
        slaHours={slaHours}
        onClose={() => setReportTarget(null)}
        onSubmit={async ({ reason, detail, blockAuthor }) => {
          if (!reportTarget || !groupId) return;
          const result = await communitiesApi.report(deps, {
            targetType: "message",
            targetId: reportTarget.id,
            groupId,
            reason,
            detail: detail || undefined,
            blockAuthor,
          });
          setSlaHours(result.slaHours);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16, paddingBottom: 20 },
  loadOlder: { alignSelf: "center", paddingVertical: 8, marginBottom: 8 },
  footer: { borderTopWidth: 1, padding: 16, alignItems: "center" },
  joinButton: { borderRadius: 14, paddingHorizontal: 22, paddingVertical: 12 },
  joinText: { color: "#FFFFFF", fontWeight: "600" },
  readOnly: { fontSize: 13, textAlign: "center", lineHeight: 19 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  input: {
    flex: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxHeight: 120,
    fontSize: 15,
  },
  sendButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sendText: { color: "#FFFFFF", fontWeight: "600", fontSize: 13 },
});
```

- [ ] **Step 6: Run the tests and lint**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile
npx jest __tests__/mobileCommunityGroup.test.tsx --maxWorkers=2 && npm run lint
```

Expected: PASS, 5 tests; eslint exits 0. React Compiler rules are strict here — no conditional hooks
and no state mutation during render; every hook above is unconditional and every setState is in a
callback or effect.

- [ ] **Step 7: Commit**

```bash
git add edutumobile/app/\(app\)/communities edutumobile/components/communities edutumobile/__tests__
git commit -m "feat(mobile): group chat screen with realtime, optimistic send and reporting"
```

---

## Task 21: Mobile — invite landing and deep links (singular + plural)

**Files:**
- Create: `edutumobile/app/g/[token].tsx`
- Create: `edutumobile/app/group/[token].tsx`
- Create: `edutumobile/app/groups/[token].tsx`
- Create: `edutumobile/app/community/[id].tsx`
- Create: `edutumobile/app/communities/[id].tsx`
- Create: `edutumobile/__tests__/mobileCommunityDeepLinks.test.tsx`
- Modify: `edutumobile/packages/core/src/services/deepLinking.ts` (i.e. `<CORE>/src/services/deepLinking.ts`)

**Interfaces:**
- Consumes: `communitiesApi.previewInvite` / `.acceptInvite`.
- Produces: `edutu://g/<token>`, `edutu://group/<token>`, `edutu://groups/<token>`,
  `edutu://community/<id>`, `edutu://communities/<id>` all resolving to a real screen.

> This repo has already shipped an "Unmatched Route" bug because widget/share links emit singular
> paths while the real screen lives under a plural segment (`app/opportunity/[id].tsx` exists purely
> to redirect). Register both forms on day one.

- [ ] **Step 1: Write the failing test**

Create `edutumobile/__tests__/mobileCommunityDeepLinks.test.tsx`:

```tsx
import { render } from "@testing-library/react-native";

let mockParams: Record<string, string> = {};
const redirects: string[] = [];

jest.mock("expo-router", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    useLocalSearchParams: () => mockParams,
    useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }),
    Redirect: ({ href }: { href: string }) => {
      redirects.push(href);
      return React.createElement(Text, null, `redirect:${href}`);
    },
  };
});

describe("community deep-link redirects", () => {
  beforeEach(() => {
    redirects.length = 0;
    jest.resetModules();
  });

  it("edutu://group/<token> lands on the invite screen", () => {
    mockParams = { token: "abc123" };
    const Screen = require("../app/group/[token]").default;
    render(<Screen />);
    expect(redirects).toEqual(["/g/abc123"]);
  });

  it("edutu://groups/<token> lands on the invite screen", () => {
    mockParams = { token: "abc123" };
    const Screen = require("../app/groups/[token]").default;
    render(<Screen />);
    expect(redirects).toEqual(["/g/abc123"]);
  });

  it("edutu://community/<id> lands on the group screen", () => {
    mockParams = { id: "g1" };
    const Screen = require("../app/community/[id]").default;
    render(<Screen />);
    expect(redirects).toEqual(["/communities/g1"]);
  });

  it("edutu://communities/<id> lands on the group screen", () => {
    mockParams = { id: "g1" };
    const Screen = require("../app/communities/[id]").default;
    render(<Screen />);
    expect(redirects).toEqual(["/communities/g1"]);
  });

  it("falls back to the communities index when the id is missing", () => {
    mockParams = {};
    const Screen = require("../app/community/[id]").default;
    render(<Screen />);
    expect(redirects).toEqual(["/communities"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile
npx jest __tests__/mobileCommunityDeepLinks.test.tsx --maxWorkers=2
```

Expected: FAIL — `Cannot find module '../app/group/[token]'`.

- [ ] **Step 3: Write the four redirect routes**

Create `edutumobile/app/group/[token].tsx`:

```tsx
import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * Invite links are shared as `edutu://group/<token>` and `https://edutu.org/g/<token>`.
 * Expo Router matches the incoming path verbatim, so without this bridge the
 * singular form has no route and the app shows "Unmatched Route" — the exact
 * bug this repo already shipped once for `edutu://opportunity/<id>`.
 */
export default function GroupInviteSingularRedirect() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  return <Redirect href={token ? `/g/${token}` : "/communities"} />;
}
```

Create `edutumobile/app/groups/[token].tsx` with the identical body and the component renamed
`GroupInvitePluralRedirect`.

Create `edutumobile/app/community/[id].tsx`:

```tsx
import { Redirect, useLocalSearchParams } from "expo-router";

/** `edutu://community/<id>` → the real screen at `/communities/<id>`. */
export default function CommunitySingularRedirect() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <Redirect href={id ? `/communities/${id}` : "/communities"} />;
}
```

Create `edutumobile/app/communities/[id].tsx`:

```tsx
import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * Root-level `/communities/<id>` (what push payloads and web links emit)
 * forwards into the authenticated `(app)` group where the screen lives.
 */
export default function CommunityRootRedirect() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <Redirect href={id ? `/communities/${id}` : "/communities"} />;
}
```

> If Expo Router reports a duplicate route for `app/communities/[id].tsx` versus
> `app/(app)/communities/[groupId].tsx`, delete `app/communities/[id].tsx` — the `(app)` group is a
> URL-less segment, so `/communities/<id>` already resolves there — and drop the corresponding test
> case. Verify with `npx expo-router --help` unavailable; instead run the app and open
> `edutu://communities/g1`.

- [ ] **Step 4: Write the invite landing screen**

Create `edutumobile/app/g/[token].tsx`:

```tsx
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { communitiesApi, type InvitePreview } from "@edutu/core";
import { useTheme } from "../../components/context/ThemeContext";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { useCommunitiesDeps } from "../../lib/communities";
import { getConfig } from "../../lib/config";

const REASON_COPY: Record<string, string> = {
  expired: "This invite link has expired. Ask for a new one.",
  revoked: "This invite link is no longer active.",
  exhausted: "This invite link has been used up. Ask for a fresh one.",
};

export default function GroupInviteScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { colors } = useTheme();
  const deps = useCommunitiesDeps();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    // Public preview: no token needed, so the card renders before sign-in.
    void communitiesApi
      .previewInvite(
        { baseUrl: getConfig().apiBaseUrl, getToken: async () => null },
        token,
      )
      .then((row) => {
        if (active) setPreview(row);
      })
      .catch(() => {
        if (active) setError("We couldn't find that invite.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <ScreenHeader title="You're invited" showBack />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : error || !preview ? (
        <View style={styles.center}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Invite not found
          </Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            {error ?? "That link doesn't point anywhere."}
          </Text>
        </View>
      ) : (
        <View style={styles.content}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {preview.name}
          </Text>
          {preview.description ? (
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              {preview.description}
            </Text>
          ) : null}
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            {preview.memberCount} members
          </Text>

          {preview.rules ? (
            <View style={[styles.rules, { borderColor: colors.border }]}>
              <Text style={[styles.rulesTitle, { color: colors.foreground }]}>
                Group rules
              </Text>
              <Text style={[styles.body, { color: colors.textSecondary }]}>
                {preview.rules}
              </Text>
            </View>
          ) : null}

          {!preview.valid ? (
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              {REASON_COPY[preview.reason ?? ""] ??
                "This invite link can no longer be used."}
            </Text>
          ) : (
            <TouchableOpacity
              disabled={joining}
              onPress={async () => {
                if (!token) return;
                if (!isSignedIn) {
                  router.push("/(auth)/sign-in" as never);
                  return;
                }
                setJoining(true);
                try {
                  const result = await communitiesApi.acceptInvite(deps, token);
                  router.replace(`/communities/${result.groupId}` as never);
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Could not join that group.",
                  );
                } finally {
                  setJoining(false);
                }
              }}
              style={[styles.button, { backgroundColor: colors.accent }]}
            >
              <Text style={styles.buttonText}>
                {isSignedIn ? (joining ? "Joining…" : "Join group") : "Sign in to join"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  content: { padding: 20, gap: 10 },
  title: { fontSize: 24, fontWeight: "700" },
  body: { fontSize: 14, lineHeight: 20 },
  meta: { fontSize: 12 },
  rules: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 6, marginTop: 6 },
  rulesTitle: { fontSize: 14, fontWeight: "600" },
  button: {
    marginTop: 18,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
  },
  buttonText: { color: "#FFFFFF", fontWeight: "600", fontSize: 15 },
});
```

> If the sign-in route path differs, confirm it with
> `ls "edutumobile/app/(auth)"` and use the real file name.

- [ ] **Step 5: Extend the deep-link helper**

In `<CORE>/src/services/deepLinking.ts`, add a `'group'` arm to the `DeepLinkRoute` union and to each
of the five switches (`createShareLink`, `createWebLink`, `createUniversalLink`, `parseDeepLink`,
`parsePath`), mapping `group` → path `g/<id>` on web and `group/<id>` on the `edutu://` scheme:

```ts
export type DeepLinkRoute =
  | { screen: 'opportunity'; id?: string }
  | { screen: 'roadmap'; id?: string }
  | { screen: 'goal'; id?: string }
  | { screen: 'profile'; id?: string }
  | { screen: 'chat'; id?: string }
  | { screen: 'group'; id?: string };
```

Follow the existing arm bodies exactly — each switch already has an `opportunity` case to copy the
shape from.

- [ ] **Step 6: Run the tests and lint**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile
npx jest __tests__/mobileCommunityDeepLinks.test.tsx --maxWorkers=2 && npm run lint
```

Expected: PASS; eslint exits 0.

- [ ] **Step 7: Commit**

```bash
git add edutumobile/app/g edutumobile/app/group edutumobile/app/groups \
        edutumobile/app/community edutumobile/app/communities \
        edutumobile/__tests__/mobileCommunityDeepLinks.test.tsx \
        "<CORE>/src/services/deepLinking.ts"
git commit -m "feat(mobile): invite landing plus singular and plural deep-link routes"
```

---

## Task 22: Admin — the moderation report queue

**Files:**
- Create: `admin/src/lib/moderationApi.ts`
- Create: `admin/src/pages/Moderation.tsx`
- Create: `admin/src/test/moderationApi.spec.ts`
- Modify: `admin/src/App.tsx`
- Modify: `admin/src/components/nav-items.tsx`
- Modify: `admin/src/index.css`

**Interfaces:**
- Consumes: `backendFetchJson` (`admin/src/lib/backend.ts`); backend routes
  `GET /admin/communities/reports`, `PATCH /admin/communities/reports/:id`,
  `GET /admin/communities/held-messages`, `PATCH /admin/communities/held-messages/:id` (Task 12).
- Produces:
  ```ts
  export type ModerationReport = { id: string; targetType: string; targetId: string;
    groupId: string | null; groupName: string | null; reporterUserId: string; reporterName: string;
    reason: string; detail: string | null; status: string; createdAt: string;
    hoursRemaining: number; breached: boolean; reportCount: number; preview: string | null;
    authorUserId: string | null; authorName: string | null };
  export type HeldMessage = { id: string; groupId: string; groupName: string;
    authorUserId: string; authorName: string; body: string | null; createdAt: string };
  export type ModerationAction = 'dismiss' | 'delete_message' | 'ban_user' | 'suspend_group';
  export const moderationApi: { listReports; resolveReport; listHeld; decideHeld };
  export function slaLabel(report: Pick<ModerationReport, 'hoursRemaining' | 'breached' | 'status'>): string;
  ```

> There is no existing moderation queue in `admin/` — this is new, not an extension. Types and
> constants go in `lib/moderationApi.ts`, not in the page: `react-refresh/only-export-components`
> runs at `--max-warnings 0` and a page file exporting a non-component fails lint.

- [ ] **Step 1: Write the failing test**

Create `admin/src/test/moderationApi.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { slaLabel } from "../lib/moderationApi";

describe("slaLabel", () => {
  it("counts down inside the window", () => {
    expect(
      slaLabel({ hoursRemaining: 18, breached: false, status: "open" }),
    ).toBe("18h left");
  });

  it("says less than an hour rather than 0h left", () => {
    expect(
      slaLabel({ hoursRemaining: 0, breached: false, status: "open" }),
    ).toBe("<1h left");
  });

  it("calls out a breach", () => {
    expect(
      slaLabel({ hoursRemaining: 0, breached: true, status: "open" }),
    ).toBe("SLA breached");
  });

  it("stops counting once the report is resolved", () => {
    expect(
      slaLabel({ hoursRemaining: 0, breached: true, status: "actioned" }),
    ).toBe("Resolved");
    expect(
      slaLabel({ hoursRemaining: 3, breached: false, status: "dismissed" }),
    ).toBe("Resolved");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/admin
npx vitest run src/test/moderationApi.spec.ts
```

Expected: FAIL — cannot resolve `../lib/moderationApi`.

- [ ] **Step 3: Write the API module**

Create `admin/src/lib/moderationApi.ts`:

```ts
import { backendFetchJson } from './backend';

export type ModerationReport = {
    id: string;
    targetType: string;
    targetId: string;
    groupId: string | null;
    groupName: string | null;
    reporterUserId: string;
    reporterName: string;
    reason: string;
    detail: string | null;
    status: string;
    createdAt: string;
    hoursRemaining: number;
    breached: boolean;
    reportCount: number;
    preview: string | null;
    authorUserId: string | null;
    authorName: string | null;
};

export type ModerationQueue = {
    reports: ModerationReport[];
    slaHours: number;
    openCount: number;
    breachedCount: number;
};

export type HeldMessage = {
    id: string;
    groupId: string;
    groupName: string;
    authorUserId: string;
    authorName: string;
    body: string | null;
    createdAt: string;
};

export type ModerationAction =
    | 'dismiss'
    | 'delete_message'
    | 'ban_user'
    | 'suspend_group';

export const ACTION_LABELS: Record<ModerationAction, string> = {
    dismiss: 'Dismiss',
    delete_message: 'Delete message',
    ban_user: 'Ban from group',
    suspend_group: 'Suspend group',
};

export const REASON_LABELS: Record<string, string> = {
    scam: 'Scam or fraud',
    spam: 'Spam',
    harassment: 'Harassment',
    hate: 'Hate speech',
    sexual: 'Sexual content',
    violence: 'Violence',
    other: 'Other',
};

/** The published 24h SLA, rendered so a breach is impossible to miss. */
export function slaLabel(
    report: Pick<ModerationReport, 'hoursRemaining' | 'breached' | 'status'>,
): string {
    if (report.status !== 'open') return 'Resolved';
    if (report.breached) return 'SLA breached';
    if (report.hoursRemaining <= 0) return '<1h left';
    return `${report.hoursRemaining}h left`;
}

export const moderationApi = {
    listReports(status: string) {
        const query = status && status !== 'all' ? `?status=${status}` : '';
        return backendFetchJson<ModerationQueue>(
            `/admin/communities/reports${query}`,
        );
    },
    resolveReport(reportId: string, action: ModerationAction, note?: string) {
        return backendFetchJson<{ success: true }>(
            `/admin/communities/reports/${reportId}`,
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, note }),
            },
        );
    },
    listHeld() {
        return backendFetchJson<HeldMessage[]>('/admin/communities/held-messages');
    },
    decideHeld(messageId: string, decision: 'publish' | 'remove') {
        return backendFetchJson<{ success: true }>(
            `/admin/communities/held-messages/${messageId}`,
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ decision }),
            },
        );
    },
};
```

- [ ] **Step 4: Write the page**

Create `admin/src/pages/Moderation.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Inbox,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import {
  ACTION_LABELS,
  REASON_LABELS,
  moderationApi,
  slaLabel,
  type HeldMessage,
  type ModerationAction,
  type ModerationQueue,
  type ModerationReport,
} from "../lib/moderationApi";

const FILTERS = [
  { key: "open", label: "Open" },
  { key: "actioned", label: "Actioned" },
  { key: "dismissed", label: "Dismissed" },
  { key: "all", label: "All" },
];

export default function Moderation() {
  const [filter, setFilter] = useState("open");
  const [queue, setQueue] = useState<ModerationQueue | null>(null);
  const [held, setHeld] = useState<HeldMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: string; message: string } | null>(
    null,
  );

  const load = useCallback(
    async (opts: { quiet?: boolean } = {}) => {
      if (!opts.quiet) setLoading(true);
      try {
        const [reports, heldRows] = await Promise.all([
          moderationApi.listReports(filter),
          moderationApi.listHeld().catch(() => [] as HeldMessage[]),
        ]);
        setQueue(reports);
        setHeld(heldRows);
        setBanner(null);
      } catch (error) {
        setBanner({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "Couldn't load the moderation queue.",
        });
      } finally {
        setLoading(false);
      }
    },
    [filter],
  );

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load({ quiet: true }), 60000);
    return () => clearInterval(interval);
  }, [load]);

  const act = async (report: ModerationReport, action: ModerationAction) => {
    setBusyId(report.id);
    try {
      await moderationApi.resolveReport(report.id, action);
      setBanner({
        type: "success",
        message: `${ACTION_LABELS[action]} applied.`,
      });
      await load({ quiet: true });
    } catch (error) {
      setBanner({
        type: "error",
        message: error instanceof Error ? error.message : "Action failed.",
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mod-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Moderation</h1>
          <p className="mod-sub">
            Published SLA: every report is actioned within{" "}
            {queue?.slaHours ?? 24} hours.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={() => void load()}>
          <RefreshCw size={16} /> Refresh
        </button>
      </header>

      {banner ? (
        <div
          className={`mod-banner ${banner.type === "error" ? "badge-danger" : "badge-success"}`}
        >
          {banner.message}
        </div>
      ) : null}

      <div className="mod-tiles">
        <div className="card mod-tile">
          <Inbox size={18} />
          <span className="mod-tile-value">{queue?.openCount ?? 0}</span>
          <span className="mod-tile-label">Open reports</span>
        </div>
        <div className="card mod-tile">
          <AlertTriangle size={18} />
          <span className="mod-tile-value">{queue?.breachedCount ?? 0}</span>
          <span className="mod-tile-label">SLA breached</span>
        </div>
        <div className="card mod-tile">
          <ShieldAlert size={18} />
          <span className="mod-tile-value">{held.length}</span>
          <span className="mod-tile-label">Held for review</span>
        </div>
      </div>

      <div className="mod-filters">
        {FILTERS.map((option) => (
          <button
            key={option.key}
            className={`btn btn-pill ${filter === option.key ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setFilter(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mod-loading">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Target</th>
                <th>Reason</th>
                <th>Group</th>
                <th>Reports</th>
                <th>SLA</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(queue?.reports ?? []).map((report) => (
                <tr key={report.id}>
                  <td>
                    <div className="mod-target">
                      <span className="mod-target-type">{report.targetType}</span>
                      {report.preview ? (
                        <span className="mod-preview">
                          {report.preview.slice(0, 160)}
                        </span>
                      ) : null}
                      {report.authorName ? (
                        <span className="mod-author">by {report.authorName}</span>
                      ) : null}
                    </div>
                  </td>
                  <td>{REASON_LABELS[report.reason] ?? report.reason}</td>
                  <td>{report.groupName ?? "—"}</td>
                  <td>{report.reportCount}</td>
                  <td>
                    <span
                      className={`badge ${report.breached && report.status === "open" ? "badge-danger" : "badge-secondary"}`}
                    >
                      {slaLabel(report)}
                    </span>
                  </td>
                  <td>
                    {report.status === "open" ? (
                      <div className="mod-actions">
                        <button
                          className="btn btn-secondary"
                          disabled={busyId === report.id}
                          onClick={() => void act(report, "dismiss")}
                        >
                          Dismiss
                        </button>
                        {report.targetType === "message" ? (
                          <button
                            className="btn btn-danger"
                            disabled={busyId === report.id}
                            onClick={() => void act(report, "delete_message")}
                          >
                            Delete
                          </button>
                        ) : null}
                        <button
                          className="btn btn-danger"
                          disabled={busyId === report.id}
                          onClick={() => void act(report, "ban_user")}
                        >
                          Ban
                        </button>
                        <button
                          className="btn btn-danger"
                          disabled={busyId === report.id}
                          onClick={() => void act(report, "suspend_group")}
                        >
                          Suspend group
                        </button>
                      </div>
                    ) : (
                      <span className="badge badge-secondary">
                        {report.status}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(queue?.reports ?? []).length === 0 ? (
            <p className="mod-empty">Nothing in this bucket. Good.</p>
          ) : null}
        </div>
      )}

      <section className="mod-held">
        <h2 className="mod-section-title">Held for review</h2>
        <p className="mod-sub">
          Borderline messages are hidden from the group but visible to their
          author until a human decides.
        </p>
        {held.length === 0 ? (
          <p className="mod-empty">Nothing held.</p>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Message</th>
                  <th>Group</th>
                  <th>Author</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {held.map((message) => (
                  <tr key={message.id}>
                    <td className="mod-preview">{message.body}</td>
                    <td>{message.groupName}</td>
                    <td>{message.authorName}</td>
                    <td>
                      <div className="mod-actions">
                        <button
                          className="btn btn-secondary"
                          disabled={busyId === message.id}
                          onClick={async () => {
                            setBusyId(message.id);
                            try {
                              await moderationApi.decideHeld(
                                message.id,
                                "publish",
                              );
                              await load({ quiet: true });
                            } finally {
                              setBusyId(null);
                            }
                          }}
                        >
                          Publish
                        </button>
                        <button
                          className="btn btn-danger"
                          disabled={busyId === message.id}
                          onClick={async () => {
                            setBusyId(message.id);
                            try {
                              await moderationApi.decideHeld(
                                message.id,
                                "remove",
                              );
                              await load({ quiet: true });
                            } finally {
                              setBusyId(null);
                            }
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Add the styles**

Append to `admin/src/index.css` (never a page-level `<style>{\`…\`}</style>` — a stray backtick in
`Layout.tsx`'s CSS literal breaks the build, and this repo has already documented that trap):

```css
/* ── Communities moderation queue ─────────────────────────────────────── */
.mod-page { display: flex; flex-direction: column; gap: 20px; }
.mod-sub { color: var(--text-tertiary); font-size: 13px; margin-top: 4px; }
.mod-banner { border-radius: 12px; padding: 10px 14px; font-size: 13px; }
.mod-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.mod-tile { display: flex; flex-direction: column; gap: 4px; padding: 16px; }
.mod-tile-value { font-size: 26px; font-weight: 700; }
.mod-tile-label { font-size: 12px; color: var(--text-tertiary); }
.mod-filters { display: flex; gap: 8px; flex-wrap: wrap; }
.mod-loading { display: flex; justify-content: center; padding: 40px 0; }
.mod-target { display: flex; flex-direction: column; gap: 2px; max-width: 460px; }
.mod-target-type { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-tertiary); }
.mod-preview { font-size: 13px; overflow-wrap: anywhere; }
.mod-author { font-size: 12px; color: var(--text-tertiary); }
.mod-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.mod-empty { padding: 24px; text-align: center; color: var(--text-tertiary); font-size: 13px; }
.mod-held { display: flex; flex-direction: column; gap: 8px; }
.mod-section-title { font-size: 18px; font-weight: 600; }
```

- [ ] **Step 6: Register the route and nav entry**

In `admin/src/App.tsx`, add the lazy import beside the others:

```tsx
const Moderation = lazy(() => import("./pages/Moderation"));
```

and the route inside the `<Route path="/" element={<Layout />}>` block:

```tsx
        <Route path="app/moderation" element={<Moderation />} />
```

In `admin/src/components/nav-items.tsx`, add `Flag` to the `lucide-react` import block and append to
the `app` group's `children`:

```tsx
    { label: "Moderation", to: "/app/moderation", icon: Flag },
```

- [ ] **Step 7: Run the tests, lint and typecheck**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/admin
npx vitest run src/test/moderationApi.spec.ts && npm run lint && npx tsc -b
```

Expected: PASS, 4 tests; eslint exits 0 at `--max-warnings 0`; `tsc -b` silent (there is no
`typecheck` script in `admin/package.json` — `npx tsc -b` is the equivalent).

- [ ] **Step 8: Commit**

```bash
git add admin/src/lib/moderationApi.ts admin/src/pages/Moderation.tsx \
        admin/src/test/moderationApi.spec.ts admin/src/App.tsx \
        admin/src/components/nav-items.tsx admin/src/index.css
git commit -m "feat(admin): communities moderation queue with SLA countdown and held-message review"
```

---

## Task 23: Full-slice verification

**Files:** none created. This task runs the whole gate and fixes anything it finds.

- [ ] **Step 1: Backend — tests, lint, build, boot**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npm test && npm run lint && npm run build && timeout 30 node dist/main
```

Expected: all suites PASS; eslint exits 0; `nest build` succeeds; `node dist/main` prints
`Nest application successfully started`. A DI/native-dep failure that only appears here is exactly the
class of bug that passes tests and breaks production.

- [ ] **Step 2: Web — tests, lint, typecheck, build**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npm test && npm run lint && npm run typecheck && npm run build
```

Expected: all PASS. **After `npm run build`, check `git status`** — `prebuild` regenerates
`public/sitemap.xml`. If it shows as modified with content you did not intend, restore it:
`git checkout -- edutu-web-app/public/sitemap.xml`.

- [ ] **Step 3: Mobile — tests and lint**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile
npx jest --maxWorkers=2 && npm run lint
```

Expected: all PASS; eslint exits 0 at `--max-warnings 0`.

- [ ] **Step 4: Admin — tests, lint, build**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/admin
npm run test && npm run lint && npm run build
```

Expected: all PASS.

- [ ] **Step 5: Apply the migration to a branch database and run the live RLS proof**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
npx supabase db push --include-all
cd backend/services/services/api
SUPABASE_URL="$SUPABASE_URL" SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
npx jest src/communities/rls.live.spec.ts
```

Expected: every RLS assertion PASSES — anon can read a public group, cannot read a private one, cannot
INSERT/UPDATE/DELETE any `community_*` table, cannot read `community_invites`, and every new
notification kind inserts successfully.

> Do this against a Supabase **branch**, never production. The migration is additive (new tables plus
> one CHECK constraint replacement), but the CHECK replacement briefly drops and re-adds a constraint
> on a live table.

- [ ] **Step 6: Manual smoke — the one path automated tests cannot cover**

With the backend running locally and the web app on `npm run dev`:

1. Sign in, open `/communities`, create a group in the Scholarships space.
2. Post a message. Confirm it appears instantly (optimistic) and settles.
3. Open the same group in a second browser profile signed in as another user, join, and post.
   **Confirm the first window receives it without a refresh** — that is the realtime path, and no unit
   test proves it end to end.
4. Navigate away from the group and back five times in a row. **Confirm no
   "cannot add postgres_changes callbacks ... after subscribe" error appears in the console** — that is
   the shipped crash this slice must not reproduce.
5. Create an invite, open `/g/<token>` in a private window, confirm the preview renders signed out.
6. Post a message containing **one** signal — `bit.ly/free-money`. Confirm it **publishes** (1 flag =
   review, mirroring the scraper gate's `needs_review`) and that a `system` report for it appears in
   `/admin/app/moderation`.
7. Post a message with **two** signals — `bit.ly/x — dm me on whatsapp +2348012345678`. Confirm the
   author still sees it marked "Held for review", the other user does not see it at all, and it appears
   in `/admin/app/moderation` under "Held for review".
8. Pick an opportunity whose `metadata.scam_risk` is `high` (or set one on a test row) and share it
   into a group. **Confirm the send is refused** with the flagged-listing message — a listing our own
   scraper already caught must never be laundered into a group as a clean-looking card.
9. Report a message, then resolve it in the admin queue and confirm it disappears from the group.

- [ ] **Step 7: Deployment checklist**

Record these in the PR description — they are manual and outside the repo:

1. Apply `supabase/migrations/20260725130000_communities_groups_core.sql` to production **before**
   deploying the backend. The backend writes `community-*` notification kinds on day one; deploying it
   first means every one of those inserts is silently rejected by `notifications_kind_check`.
2. Confirm `API_KEY_PEPPER` is set on Render (`src/main.ts` already refuses to boot without it in
   production) — invite tokens are hashed with it.
3. Confirm `PUBLIC_APP_URL` is set to `https://edutu.org` on Render, or every invite link is minted
   against the fallback origin.
4. `COMMUNITY_IMAGES_BUCKET` is optional; the service creates `community-images` as a public bucket on
   first upload. If your Supabase project restricts bucket creation, create it manually and mark it
   public before the first image is sent.
5. `COMMUNITY_EXPIRY_ENABLED=false` is the kill switch for the archive cron if anything looks wrong in
   the first days. `COMMUNITY_MESSAGE_GATE=false` is the kill switch for the scam heuristics (abuse
   blocking stays on regardless). Both default ON; neither needs to be set to ship.
6. Mobile needs a native rebuild only if the tab bar layout changes require it; the screens themselves
   are JS and ship over OTA.

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "chore(communities): slice 2 verification pass"
```

---

## Appendix A: What Slice 2 publishes for slices 3–5

Later slices import these and must never redefine them.

**From `@edutu/core`:**

| Export | Kind | Notes |
|---|---|---|
| `GroupRole`, `GroupAction` | type | Contract-fixed |
| `groupCan(role, action)` | function | Contract-fixed, pure |
| `GROUP_ROLES`, `GROUP_ACTIONS` | const | Iteration helpers for tests/UI |
| `CommunitySpace` | type | Slice-2 namespace |
| `CommunityGroup` | type | Contract-fixed shape |
| `CommunityMessage` | type | Contract-fixed shape + `reactions`, `reviewStatus`, `blocked`, `clientId` |
| `MessageAttachment` | type | Slice-2 namespace |
| `SendMessageInput` | type | Already carries `opportunityId` + `kind: 'opportunity'` for Slice 3 |
| `GroupMember`, `GroupJoinRequest`, `GroupInvite`, `InvitePreview` | type | Slice-2 namespace |
| `communitiesApi` | const | One method per `/communities/*` route |
| `CommunitiesApiDeps` | type | `{ baseUrl, getToken }` — the injection point |
| `subscribeToGroupMessages`, `authorizeRealtime` | function | The crash-safe channel lifecycle |
| `useGroupMessages(groupId, deps)` | hook | Contract-fixed + additive `retry` |
| `useGroups(deps, query)` | hook | Slice-2 namespace |

**From the backend:**

| Export | Path | Notes |
|---|---|---|
| `assertGroupPermission(userId, groupId, action)` | `src/communities/community-permissions.ts` | The only permission gate; Slice 4's `/ai` and `/brief` routes call it with `'post'` and `'edit_group'` |
| `loadGroupContext`, `evaluateGroupPermission`, `GroupContext` | same file | For read-only checks |
| `CommunityMessagesService.postSystemMessage(groupId, body)` | `src/communities/community-messages.service.ts` | Slice 4's AI turn posts with `kind: 'ai'` — add that kind to the DTO enum there, not here |
| `CommunityMessagesService.hydrate(userId, rows)` | same file | Reuse for any new message-producing path |
| `CommunityLimitsService.get()` | `src/communities/community-limits.ts` | Slice 4 adds `edutuInvocationsPerDay` and the Brief thresholds to the same `communities` settings group |
| `CommunityModerationService` | `src/communities/community-moderation.service.ts` | Slice 3's Notes reuse `report()` with `targetType: 'note'` |
| `CommunityNotificationsService` | `src/communities/community-notifications.service.ts` | Slice 1/3 add `follow` and `note-reply` here; both kinds are already in the CHECK constraint |
| `screenMessage(text, env?)` | `src/communities/community-message-safety.ts` | Slice 3 must run Notes through this too. Returns `allow \| review \| hold \| block` on the scraper gate's scale |
| `screenSharedOpportunity(metadata, env?)`, `toFlags`, `toVerdict` | same file | **Slice 3 must call this before rendering any shared opportunity card.** Reads the scraper's stored verdict; never re-runs detection |
| `mostSevere(verdicts)` | `src/communities/community-messages.service.ts` | Combine several screens without re-deriving severity ordering |
| `communityMessages.safetyNote` / `CommunityMessage.safetyNote` | schema + `@edutu/core` | The inline caution Slice 3's opportunity card renders |
| `communityMessages.savedToBrief` | `src/db/schema.ts` | Slice 4's Brief regeneration trigger reads this column |
| `community_briefs` | **not created here** | Slice 4 owns that table and its migration |

**Reserved for later slices, deliberately unused in Slice 2:** notification kinds `follow` and
`note-reply` are already in `notifications_kind_check` (constraint 1 requires the full list in one
place), and `community_messages.kind` already permits `'opportunity'` and `'ai'`.

---

## Appendix B: Self-review notes

Run before starting implementation; recorded here so an executor knows what was already checked.

**Spec coverage (design spec §3, §5.2, §5.4, §6, §8.1, §9, §10):**

| Spec requirement | Task |
|---|---|
| §3 IA: Communities tab, For you / Spaces / Discover | 16, 19 |
| §5.2 all eight `community_*` tables + columns | 1 |
| §5.2 `community_briefs` | **excluded — Slice 4 owns it** |
| §5.4 raw-Clerk-sub user ids, one conversion boundary | 1 (columns), 5 (`@CurrentUser("authId")`), 12 (`toDatabaseUserId` only in `blockUser`), 13 (`broadcast` boundary) |
| §6.1 role matrix, single server-side guard | 2, 3 |
| §6.2 hashed 22-char invite tokens, prefix, max_uses, expiry, revocation, `/g/<token>` | 11, 18, 21 |
| §6.3 expiry → system message + `status='archived'`, never deleted | 14 |
| §8.1 one channel on screen, refs, `getChannels()`, try/catch | 15 |
| §9.1 report any target → `community_reports` → admin queue | 12, 22 |
| §9.2 block, content collapses to "Blocked message" | 12 (`blockUser`), 8 (`hydrate`), 17/20 (render) |
| §9.3 mute, kick, ban per group | 6 |
| §9.4 send-time filters + shadow-hold, reusing the scam gate for links in chat | 7, 8, 12, 22 |
| §9.4 shared opportunity cards inherit the scraper's stored scam verdict | 7 (`screenSharedOpportunity`), 8 (wired into `send`) |
| §9.5 published 24-hour SLA | 12 (`reportSlaState`), 17/20 (in-app statement), 22 (queue) |
| §9 images: uploads service, report/queue/block/rate limit | 10 |
| §10 six notification kinds, CHECK constraint, batching, quiet hours, prefs | 1, 13 |
| §2 product limits enforced server-side | 4, 5, 8, 9 |
| Contract: every `/communities/*` route | 5, 6, 8, 9, 11, 12 |
| Contract: `@edutu/core` exports | 2, 15 |
| Contract: web + mobile routes, both deep-link forms | 16–21 |
| Testing strategy §12: permission matrix, id-namespace, RLS, moderation filters, notification kinds, realtime lifecycle | 3, 1, 1, 7, 1/13, 15 |

**Deliberate exclusions (owned by other slices):** `community_briefs` and Brief generation (4);
`@edutu` in-group agent and `/recommend` (4); opportunity cards rendered in chat and anchored-group
discovery UI (3); `opportunity_notes` (3); carry-forward, group search, presence/typing, group SEO
pages (5); usernames and public profiles (1) — Slice 2 reads `profiles.username` and degrades to
`''` if Slice 1's column is not present yet.

**Type consistency check:** `CommunityGroupDto` (backend, Task 5) is field-for-field identical to
`CommunityGroup` (`@edutu/core`, Task 15). `CommunityMessageDto` (Task 8) is `CommunityMessage` plus
nothing the client does not accept. `GroupMemberDto` ≡ `GroupMember`. `InvitePreviewDto` ≡
`InvitePreview`. `assertGroupPermission` is called with the same `GroupAction` strings everywhere.
`slugifyGroupName`, `defaultExpiryFromDeadline`, `canTargetMember`, `nextMemberPatch`,
`assertAnnouncementQuota`, `buildRateWindows`, `mintInviteToken`, `inviteUrl`, `inviteRejection`,
`reportSlaState`, `resolutionToStatus`, `screenMessage`, `screenSharedOpportunity`, `textRedFlags`,
`toFlags`, `toVerdict`, `isCommunityMessageGateEnabled`, `mostSevere`, `extractUrls`, `isRiskyLink`,
`detectsContactHarvesting`, `extractMentions`, `batchWindowKey`, `archiveSystemMessage`, `slaLabel`
are each defined in exactly one task and referenced by that exact name everywhere else.
`CommunityMessageDto.safetyNote` (Task 8) ≡ `CommunityMessage.safetyNote` (Task 15) ≡
`community_messages.safety_note` (Task 1).

**Branch-sensitivity caveat.** This plan was drafted against a tree 41 commits behind `origin/main`.
One finding was wrong because of it (the scam gate — corrected in "Spec contradictions" item 1 and
Task 7). Every other "X does not exist" claim is re-checked by PREREQUISITE Step 0.2 before any code is
written. Two further consequences to hold in mind:

- **Only the scam-gate claim was verifiable as wrong from here.** Task 22's "admin has no moderation
  queue" and Task 3's "`@edutu/core` is not yet a root workspace" are the two most likely to have moved
  on `origin/main`; Step 0.2 greps both. If a moderation surface already exists, extend it rather than
  adding a second one.
- **PR#40's shipped features are present on `origin/main` and may interact with Communities.** Fit
  language (match-% reframed away from win-odds), eligibility gates, the answer bank, and the season
  pass all touch the opportunity surfaces this slice links into. Before writing Task 8's shared-card
  path or Task 16/17's group cards, check whether fit/eligibility copy conventions already exist and
  match them — a group card that says "92% match" while the rest of the app has moved to fit language
  is a regression, not a new feature. Slice 3 owns the card itself, so the durable fix is to keep
  Slice 2's message DTO neutral (it carries `opportunityId` + `safetyNote`, no scoring language).
