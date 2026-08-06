# Edutu Communities — Slice 5: Scale & Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Edutu Communities compound instead of decay — archived groups carry their knowledge forward into the next season, every group is findable by search and by Google, and members can see who else is in the room.

**Architecture:** Five independent capabilities layered on the Slice 1–4 foundation. (1) **Season carry-forward** is a single backend transaction that clones an archived group's Brief, its ✦saved messages, and an opt-in invite into a new group, made idempotent by a partial unique index on `carried_forward_from_group_id`. (2) **Group search** reuses the exact Reciprocal-Rank-Fusion pattern already shipped for opportunities (`pg_trgm` + a generated `tsvector` + GIN indexes), extended with a `visible` CTE so a caller can never see a group they may not see. (3) **Web SEO group pages** reuse the shipped opportunity-unfurl architecture: a backend `og/` controller that fetches the deployed SPA shell and injects head meta, an unconditional rewrite in the **root** `vercel.json`, and a mirror Netlify edge function. (4) **Presence/typing** rides the *same single* Supabase Realtime channel Slice 2 already opens for the on-screen group, via a ref-counted channel registry in `@edutu/core` that binds every callback before `subscribe()`. (5) A re-runnable **launch seeding** script anchors 20 groups to the highest-demand live opportunities with a deterministically-built Brief.

**Tech Stack:** NestJS 11 + Drizzle ORM + raw `db.execute(sql\`\`)` (backend), Postgres 15 with `pg_trgm` 1.6 and `vector` 0.8 (Supabase), React 18 + Vite + Tailwind + vitest (`edutu-web-app`), Expo Router + React Native + jest (`edutumobile`), React + Vite (`admin`), `@edutu/core` shared workspace package, Netlify Edge Functions (Deno) + Vercel rewrites.

---

## PREREQUISITE — branch from `origin/main`, and verify absence claims against it

**Do not start this plan on the branch this repo is currently checked out to.** That branch is
**41 commits behind `origin/main`** (verified 2026-07-25). Communities work — every slice — branches
from `origin/main`.

Notably, the stale branch is missing **PR#40 (the user-trust masterplan)** and the scraper scam gate.

Confirm before Task 1 — this is a hard gate, not a suggestion:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
git fetch origin
git merge-base --is-ancestor origin/main HEAD && echo "OK: origin/main is an ancestor" \
  || echo "STOP: branch from origin/main first"
git rev-list --count HEAD..origin/main
```

Expected: `OK: origin/main is an ancestor` and a count of `0`. Anything else means you are on the
stale tree — branch from `origin/main` before writing a line of code.

**Rule for reading this plan (and for your own investigation):** a grep of the working tree is **not
evidence that something is absent from the repo.** This plan was written against a tree 41 commits
behind, and that tree actively misled the author twice:

| Claim from the stale tree | Reality on `origin/main` |
|---|---|
| "there is no scraper scam gate" | `isScamGateEnabled`, `extractRedFlags`, `decideScamGate`, `SCAM_GATE_CAP_THRESHOLD = 2` all exist in `src/scraper/opportunity-dedup.service.ts` — see contract correction #2 and Task 10 |
| "`og.controller.ts` renders a standalone mini page" | `origin/main` **is** the shell-injecting version (`OG_MARKER`, `getSpaShell()`, `renderWithShell()`, `X-Og-Source: backend/og-shell` / `backend/og-fallback`) — see Task 8 |

Before asserting any absence, check `git show origin/main:<path>`. Task 8 is the clearest example of
why: had the author trusted the working tree, this slice would have shipped a mini page to real users
on an unconditional rewrite.

---

## Global Constraints

Every task's requirements implicitly include this section.

### Product limits (from spec §2 — verbatim)

Active groups owned per user: 2 (mentors/approved creators: 10). Group creation cooldown: 24 h.
New group listed in Spaces after 5 members. Messages: 20/min and 300/hour per user per group.
`@edutu`: 5 per user per group per day, and always subject to the app-wide `@AiMetered` quota.
`@everyone` announcements: 1 per group per day. Brief regeneration: ≥3 new ✦saved messages OR
≥40 new messages, max once per hour per group, only for groups with ≥10 members and ≥25 messages.
Group expiry defaults to the anchored opportunity's deadline + 30 days.

Application status vocabulary is `draft | submitted | offer | rejected | withdrawn | no_response`
in the `opportunity_applications` table. There is **no** `shortlisted` status. Wins come from
`outcome_offer` rows in `user_opportunity_signals`.

### Non-negotiable repo constraints (from the locked contract — verbatim)

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

### Contract corrections issued 2026-07-25 (these override the contract text above)

1. **The raw Clerk sub lives on `request.user.authId`, not `request.user.id`.**
   `src/auth/clerk-auth.guard.ts` sets `id = toDatabaseUserId(payload.sub)` (the **derived uuid**) and
   `authId = payload.sub` (the **raw sub**). Every controller in this slice therefore uses
   `@CurrentUser("authId")` and never `@CurrentUser()` + `.id`. The contract's
   `rawClerkUserId({ id?, sub? })` signature is wrong on that point — pass the `authId` string.
   This is load-bearing for Task 2: resolving `community_group_members.user_id` against the derived
   uuid would match nothing, every group would look like "not a member", and the private-group leak
   test is the thing that catches it.
   `src/common/user-id.ts` already exists with `toDatabaseUserId` and `matchProfileUserId` — do not
   use either against a `community_*` table.
2. **The scraper scam gate DOES exist — on `origin/main`.** (An earlier instruction said it did not;
   that was read off the stale branch.) `backend/services/services/api/src/scraper/opportunity-dedup.service.ts`
   on `origin/main` exports `isScamGateEnabled(env)`, `extractRedFlags(metadata)`,
   `decideScamGate(status, flagCount, gateEnabled, capThreshold)` and `SCAM_GATE_CAP_THRESHOLD = 2`,
   with a spec beside it. Behaviour that matters to this slice:
   - `extractRedFlags` reads `metadata.red_flags` (tolerates missing/malformed, never throws);
   - **≥2 flags** caps an `active` row to `pending_review` *and* sets `metadata.needs_review = true`;
   - **exactly 1 flag** sets `metadata.needs_review = true` and `metadata.scam_risk` but **leaves
     `status = 'active'`**.
   That last case is the trap: a `status = 'active'` filter alone does **not** exclude a flagged
   listing. Task 10 filters on `needs_review` / `scam_risk` / `red_flags` in SQL *and* re-checks with
   `extractRedFlags` in TypeScript. Seeding an official-looking Edutu group around a flagged listing
   would be the worst possible launch bug.
   Slice 2 separately builds `src/communities/community-message-safety.ts` (`screenMessage`) for chat
   URLs; that is a different gate and nothing in Slice 5 depends on it.
3. **Migration timestamp band for this slice is `202607251600xx`.** Slices apply in order, so
   timestamps must strictly increase across slices (1: `…1200xx`, 2: `…1300xx`, 3: `…1400xx`,
   4: `…1500xx`, 5: `…1600xx`). This plan's single migration is `20260725160000_…`.
4. **Supabase Realtime sockets are anonymous unless explicitly authorised.** The Supabase client in
   both apps attaches the Clerk JWT via a `global.fetch` override, which the **websocket never sees**;
   without `realtime.setAuth(token)` the socket is anonymous and RLS delivers no rows. Slice 2
   introduces `authorizeRealtime()` in `@edutu/core`. Task 4 consumes it inside the shared channel
   registry — do not re-solve this, and do not call `setAuth` from the presence hook (that would
   authorise per-consumer instead of per-channel).

### Slice-5-specific constraints

- **This slice adds ZERO new notification kinds.** Carry-forward reuses `community-invite`, already
  added to `notifications_kind_check` by Slice 2. Task 3 includes a test asserting that exact kind is
  the one emitted, so nobody "helpfully" invents `community-carry-forward` and hits constraint #1.
- **No new search technology.** `pg_trgm` 1.6 is installed in schema `public` on the live database
  (verified 2026-07-25). Follow `supabase/migrations/20260710170000_opportunity_hybrid_search.sql`
  and `OpportunitiesService.hybridSearch()` exactly: generated `tsvector` column + GIN, trigram GIN on
  `lower(name)`, Reciprocal Rank Fusion with `k = 60`, try/catch fallback to ILIKE logged **once**.
- **No new realtime transport.** Presence rides the existing Supabase Realtime channel. One channel
  per on-screen group, total, across messages + presence + typing.
- **No new rendering approach.** SEO group pages use the shipped opportunity architecture:
  backend `og/` controller → SPA-shell fetch + head injection → **root** `vercel.json` rewrite.
- **Dynamic Vercel rewrites MUST live in the ROOT `/vercel.json`**, as a top-level `rewrites` array
  next to `experimentalServices`. The per-app `edutu-web-app/vercel.json` silently drops `has`
  conditions and path-param external rewrites on this deployment. Never ship a crawler-gated (`has`)
  rewrite here — it is a no-op in production.
- **Consume, never redefine, Slice 1–4 interfaces.** The only exception is documented in Task 3: one
  *additive optional* property (`carriedForwardFrom?`) on the Slice-2 `CommunityGroup` type. Additive
  optional properties do not break any existing consumer; no existing field changes name or type.
- Backend jest: `rootDir` is `src`, `testRegex` is `.*\.spec\.ts$`. Web: vitest, tests live in
  `edutu-web-app/src/test/__tests__/*.test.ts`. Mobile: jest, tests live in `edutumobile/__tests__/*.test.ts`.

### Path resolution for `@edutu/core`

Slice 1 promotes `@edutu/core` from `edutumobile/packages/core` to a root npm workspace. Its final
location is not fixed by the contract. **Before starting Task 4**, resolve it once:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
ls -d packages/core 2>/dev/null || ls -d edutumobile/packages/core
```

Expected output: exactly one of `packages/core` or `edutumobile/packages/core`.
Every `<CORE>` in this plan means that directory. All other paths are literal.

---

## File Structure

**Backend — `backend/services/services/api/`** (all new files inside the existing `src/communities/`
module created by Slice 2; Slice 5 adds no top-level module, per the contract)

| File | Responsibility |
|---|---|
| `src/communities/community-search.service.ts` | RRF search over group name/description + Brief text, scoped to caller visibility |
| `src/communities/community-search.service.spec.ts` | Search tests incl. the private-group leak assertion |
| `src/communities/community-search.controller.ts` | `GET /communities/search` |
| `src/communities/community-carry-forward.service.ts` | Idempotent season carry-forward transaction |
| `src/communities/community-carry-forward.service.spec.ts` | Idempotency + no-Brief tests |
| `src/communities/community-carry-forward.controller.ts` | `POST /communities/groups/:groupId/carry-forward` |
| `src/communities/dto/carry-forward.dto.ts` | Zod DTO for the carry-forward body |
| `src/communities/community-seo.service.ts` | Public group projection for OG + sitemap |
| `src/communities/community-seo.service.spec.ts` | Visibility/no-leak tests for the SEO projection |
| `src/communities/community-group-og.controller.ts` | `GET /og/group/:slug` — SPA-shell injection |
| `src/communities/community-group-og.controller.spec.ts` | Head-injection + private-group tests |
| `src/communities/spa-shell.ts` | Cached deployed-SPA-shell fetch + head meta injection |
| `src/communities/spa-shell.spec.ts` | Cache TTL, loop guard, stale-forever fallback |
| `src/communities/community-admin.controller.ts` | `GET /admin/communities/lineage` (AdminGuard) |
| `src/communities/community-lineage.service.ts` | Lineage + seeded-group listing for admin |
| `src/communities/community-lineage.service.spec.ts` | Lineage listing tests |
| `src/communities/communities.module.ts` | **Modify** — register the five new providers + four controllers |
| `src/db/schema.ts` | **Modify** — three new `communityGroups` columns |
| `src/app.controller.ts` | **Modify** — add public group URLs to `/sitemap.xml` |
| `scripts/seed-launch-groups.ts` | Re-runnable launch seeding script |

**Database — root `supabase/migrations/`**

| File | Responsibility |
|---|---|
| `20260725160000_communities_scale_lifecycle.sql` | Search vectors + GIN/trgm indexes, carry-forward lineage columns + the idempotency unique index, `seed_key`, SELECT-only grant re-assertion |

**Shared — `<CORE>/`**

| File | Responsibility |
|---|---|
| `src/realtime/groupChannel.ts` | Ref-counted single-channel-per-group registry; all bindings created before `subscribe()` |
| `src/hooks/useGroupPresence.ts` | Presence + typing on the shared channel; degrades silently |
| `src/types/presence.ts` | `GroupPresenceMember`, `GroupPresenceState` |
| `src/types/communitySearch.ts` | `CommunitySearchHit`, `CommunitySearchResponse`, `GroupLineage` |
| `src/services/communitySearch.ts` | `searchCommunities()` API client |
| `src/types/community.ts` (Slice 2's) | **Modify** — one additive optional `carriedForwardFrom?` on `CommunityGroup` |
| `src/index.ts` | **Modify** — re-export the new modules |

**Web — `edutu-web-app/`**

| File | Responsibility |
|---|---|
| `src/components/communities/GroupPresenceBar.tsx` | Avatar stack + "N online" + typing line |
| `src/components/communities/CommunitySearchPanel.tsx` | Debounced search box + results list |
| `netlify/edge-functions/group-og.ts` | Netlify mirror of the group OG injection |
| `netlify.toml` | **Modify** — register the `/communities/g/*` edge function |
| `scripts/generate-sitemap.mjs` | **Modify** — fetch + emit public group URLs |
| `src/test/__tests__/groupChannel.test.ts` | Single-channel + remount-safety tests |
| `src/test/__tests__/groupPresence.test.ts` | Presence degrade + typing throttle tests |
| `src/test/__tests__/communitySearchPanel.test.tsx` | Search panel render/debounce test |

**Root**

| File | Responsibility |
|---|---|
| `vercel.json` | **Modify** — add the `/communities/g/:slug` dynamic rewrite (root file only) |

**Mobile — `edutumobile/`**

| File | Responsibility |
|---|---|
| `components/communities/GroupPresenceBar.tsx` | Native presence strip |
| `app/(app)/communities/search.tsx` | Search screen |
| `__tests__/communitySearchScreen.test.tsx` | Screen render + query test |

**Admin — `admin/`**

| File | Responsibility |
|---|---|
| `src/pages/CommunityLineage.tsx` | Lineage chains + seeded groups, read-only |
| `src/lib/communitiesApi.ts` | Typed client for `GET /admin/communities/lineage` |
| `src/components/nav-items.tsx` | **Modify** — add the "Lineage & Seeding" leaf |
| `src/App.tsx` | **Modify** — register `communities/lineage` |
| `src/test/__tests__/communityLineage.test.tsx` | Page render test |

---

## Task 1: Database — search vectors, carry-forward lineage, seed keys

**Files:**
- Create: `supabase/migrations/20260725160000_communities_scale_lifecycle.sql`
- Create: `backend/services/services/api/src/communities/scale-lifecycle-migration.spec.ts`
- Modify: `backend/services/services/api/src/db/schema.ts`

**Interfaces:**
- Consumes: Slice 2's `community_groups`, `community_group_members`, `community_briefs` tables and their SELECT-only RLS posture.
- Produces: `community_groups.search_tsv`, `community_groups.carried_forward_from_group_id`,
  `community_groups.carried_forward_at`, `community_groups.seed_key`,
  `community_briefs.search_tsv`, the unique index `uq_community_groups_carried_forward_from`
  (the carry-forward idempotency guarantee), the unique index `uq_community_groups_seed_key`
  (the seeding idempotency guarantee), and Drizzle columns
  `communityGroups.searchTsv`, `.carriedForwardFromGroupId`, `.carriedForwardAt`, `.seedKey`.

- [ ] **Step 1: Write the failing migration test**

Create `backend/services/services/api/src/communities/scale-lifecycle-migration.spec.ts`:

```ts
import { readFileSync } from "fs";
import { join } from "path";

// The migration is the only place the carry-forward idempotency guarantee and
// the SELECT-only posture are expressed. A drifted migration is invisible in
// unit tests of the services, so assert the SQL contract directly.
const MIGRATION_PATH = join(
  __dirname,
  "../../../../../../supabase/migrations/20260725160000_communities_scale_lifecycle.sql",
);

describe("communities scale & lifecycle migration", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8").toLowerCase();

  it("is fully idempotent (safe to re-run)", () => {
    const creates = sql.match(/create (unique )?index (?!if not exists)/g) ?? [];
    expect(creates).toEqual([]);
    const adds = sql.match(/add column (?!if not exists)/g) ?? [];
    expect(adds).toEqual([]);
    expect(sql).toContain("create extension if not exists pg_trgm");
  });

  it("adds a weighted generated tsvector for group name + description", () => {
    expect(sql).toContain("alter table public.community_groups");
    expect(sql).toContain("add column if not exists search_tsv tsvector");
    expect(sql).toContain("setweight(to_tsvector('english', coalesce(name, '')), 'a')");
    expect(sql).toContain(
      "setweight(to_tsvector('english', coalesce(description, '')), 'b')",
    );
    expect(sql).toContain("stored");
  });

  it("indexes the group tsvector and a trigram index on lower(name)", () => {
    expect(sql).toContain(
      "create index if not exists idx_community_groups_search_tsv",
    );
    expect(sql).toContain("using gin (search_tsv)");
    expect(sql).toContain(
      "create index if not exists idx_community_groups_name_trgm",
    );
    expect(sql).toContain("using gin (lower(name) gin_trgm_ops)");
  });

  it("makes brief content searchable with an immutable jsonb_to_tsvector", () => {
    expect(sql).toContain("alter table public.community_briefs");
    expect(sql).toContain("jsonb_to_tsvector('english'::regconfig");
    expect(sql).toContain(
      "create index if not exists idx_community_briefs_search_tsv",
    );
  });

  it("guarantees at most ONE successor per carried-forward group", () => {
    expect(sql).toContain("carried_forward_from_group_id uuid");
    expect(sql).toContain("carried_forward_at timestamptz");
    expect(sql).toContain(
      "create unique index if not exists uq_community_groups_carried_forward_from",
    );
    expect(sql).toContain(
      "on public.community_groups (carried_forward_from_group_id)",
    );
    expect(sql).toContain("where carried_forward_from_group_id is not null");
  });

  it("guarantees the launch seeder can be re-run safely", () => {
    expect(sql).toContain("add column if not exists seed_key text");
    expect(sql).toContain(
      "create unique index if not exists uq_community_groups_seed_key",
    );
    expect(sql).toContain("where seed_key is not null");
  });

  it("keeps RLS SELECT-only for anon and authenticated", () => {
    for (const table of [
      "community_groups",
      "community_briefs",
      "community_group_members",
    ]) {
      expect(sql).toContain(
        `revoke all on table public.${table} from anon, authenticated`,
      );
      expect(sql).toContain(
        `grant select on table public.${table} to anon, authenticated`,
      );
    }
    expect(sql).not.toMatch(
      /grant\s+(insert|update|delete)[^;]*to\s+(anon|authenticated)/,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api && npx jest src/communities/scale-lifecycle-migration.spec.ts`

Expected: FAIL — `ENOENT: no such file or directory, open '.../supabase/migrations/20260725160000_communities_scale_lifecycle.sql'`

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260725160000_communities_scale_lifecycle.sql`:

```sql
-- Communities Slice 5 — scale & lifecycle.
--   1. Search: generated tsvectors + GIN + pg_trgm, mirroring
--      20260710170000_opportunity_hybrid_search.sql exactly.
--   2. Season carry-forward lineage, with the unique index that IS the
--      idempotency guarantee (a double-tapped carry-forward cannot create two
--      successors — the second insert hits 23505 and the service returns the
--      existing group).
--   3. seed_key, so the launch seeding script is safely re-runnable.
-- Every statement is idempotent (IF NOT EXISTS) and additive.

create extension if not exists pg_trgm;

-- ── 1. Search ───────────────────────────────────────────────────────────────
-- Postgres 15: GENERATED ALWAYS AS ... STORED beats triggers for weighted
-- multi-column tsvectors. Explicit 'english' regconfig keeps it IMMUTABLE.
alter table public.community_groups
  add column if not exists search_tsv tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(name, '')), 'A')
      || setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) stored;

create index if not exists idx_community_groups_search_tsv
  on public.community_groups
  using gin (search_tsv);

create index if not exists idx_community_groups_name_trgm
  on public.community_groups
  using gin (lower(name) gin_trgm_ops);

-- The Brief is jsonb. jsonb_to_tsvector(regconfig, jsonb, jsonb) is IMMUTABLE,
-- so it is legal inside a generated column; '["string"]' selects every string
-- leaf (headings, bullet text, citation excerpts) regardless of the exact
-- shape Slice 4 writes.
alter table public.community_briefs
  add column if not exists search_tsv tsvector
  generated always as (
    jsonb_to_tsvector(
      'english'::regconfig,
      coalesce(content, '{}'::jsonb),
      '["string"]'::jsonb
    )
  ) stored;

create index if not exists idx_community_briefs_search_tsv
  on public.community_briefs
  using gin (search_tsv);

-- Every search runs a membership EXISTS() per candidate group; this is the
-- covering index for it.
create index if not exists idx_community_group_members_user_group
  on public.community_group_members (user_id, group_id)
  where banned_at is null;

-- ── 2. Season carry-forward lineage ─────────────────────────────────────────
alter table public.community_groups
  add column if not exists carried_forward_from_group_id uuid;

alter table public.community_groups
  add column if not exists carried_forward_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'community_groups_carried_forward_fk'
  ) then
    alter table public.community_groups
      add constraint community_groups_carried_forward_fk
      foreign key (carried_forward_from_group_id)
      references public.community_groups (id)
      on delete set null;
  end if;
end $$;

-- THE idempotency guarantee. Partial so the millions of non-carried groups
-- stay out of the index.
create unique index if not exists uq_community_groups_carried_forward_from
  on public.community_groups (carried_forward_from_group_id)
  where carried_forward_from_group_id is not null;

create index if not exists idx_community_groups_carried_forward_at
  on public.community_groups (carried_forward_at desc)
  where carried_forward_from_group_id is not null;

-- ── 3. Launch seeding ───────────────────────────────────────────────────────
alter table public.community_groups
  add column if not exists seed_key text;

create unique index if not exists uq_community_groups_seed_key
  on public.community_groups (seed_key)
  where seed_key is not null;

-- ── 4. RLS posture: SELECT only ─────────────────────────────────────────────
-- Re-asserted so this migration can never be the one that opened a write path.
-- All writes go through the backend service-role connection.
revoke all on table public.community_groups from anon, authenticated;
revoke all on table public.community_briefs from anon, authenticated;
revoke all on table public.community_group_members from anon, authenticated;

grant select on table public.community_groups to anon, authenticated;
grant select on table public.community_briefs to anon, authenticated;
grant select on table public.community_group_members to anon, authenticated;

grant select, insert, update, delete on table public.community_groups to service_role;
grant select, insert, update, delete on table public.community_briefs to service_role;
grant select, insert, update, delete on table public.community_group_members to service_role;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api && npx jest src/communities/scale-lifecycle-migration.spec.ts`

Expected: PASS — `Tests: 7 passed, 7 total`

- [ ] **Step 5: Add the Drizzle columns**

In `backend/services/services/api/src/db/schema.ts`, find the `communityGroups` table Slice 2 added:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
grep -n "export const communityGroups" src/db/schema.ts
```

Add these four columns to that `pgTable(...)` object, immediately before its closing `});`:

```ts
  // Slice 5. `searchTsv` is a generated column — never write it.
  searchTsv: text("search_tsv"),
  carriedForwardFromGroupId: uuid("carried_forward_from_group_id"),
  carriedForwardAt: timestamp("carried_forward_at", { withTimezone: true }),
  seedKey: text("seed_key"),
```

`text`, `uuid` and `timestamp` are already imported at the top of `schema.ts`; verify with:

```bash
grep -n "from \"drizzle-orm/pg-core\"" -A 20 src/db/schema.ts | head -25
```

If any of the three is missing from the import list, add it.

- [ ] **Step 6: Type-check and lint the backend**

Run: `cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api && npx tsc --noEmit -p tsconfig.json && npm run lint`

Expected: no output from `tsc`; ESLint reports `0 problems`.

- [ ] **Step 7: Apply the migration to the live database**

Run: `cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder && npx supabase db push`

Expected: `Applying migration 20260725160000_communities_scale_lifecycle.sql...` then `Finished supabase db push.`

Verify the indexes exist:

```bash
npx supabase db push --dry-run
```

Expected: `Remote database is up to date.`

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260725160000_communities_scale_lifecycle.sql \
        backend/services/services/api/src/communities/scale-lifecycle-migration.spec.ts \
        backend/services/services/api/src/db/schema.ts
git commit -m "feat(communities): search vectors, carry-forward lineage and seed keys"
```

---

## Task 2: Group search — `GET /communities/search`

**Files:**
- Create: `backend/services/services/api/src/communities/community-search.service.ts`
- Create: `backend/services/services/api/src/communities/community-search.service.spec.ts`
- Create: `backend/services/services/api/src/communities/community-search.controller.ts`
- Modify: `backend/services/services/api/src/communities/communities.module.ts`

**Interfaces:**
- Consumes: `rawClerkUserId` from `src/common/community-user-id.ts` (Slice 1); the columns added in Task 1.
- Produces:
  ```ts
  export interface CommunitySearchHit {
    groupId: string; slug: string; name: string; description: string | null;
    iconUrl: string | null; spaceId: string;
    visibility: "public" | "unlisted" | "private";
    status: "active" | "archived" | "suspended";
    memberCount: number; opportunityId: string | null;
    matchedOn: Array<"name" | "description" | "brief">;
    snippet: string | null; score: number; isMember: boolean;
    carriedForwardFrom: { id: string; slug: string; name: string } | null;
  }
  export interface CommunitySearchResponse { query: string; hits: CommunitySearchHit[]; degraded: boolean }
  class CommunitySearchService {
    search(viewerRawUserId: string, params: { q: string; space?: string; limit?: number; offset?: number }): Promise<CommunitySearchResponse>;
  }
  ```

- [ ] **Step 1: Write the failing service tests**

Create `backend/services/services/api/src/communities/community-search.service.spec.ts`:

```ts
import { db } from "../db";
import { CommunitySearchService } from "./community-search.service";

jest.mock("../db", () => ({ db: { execute: jest.fn() } }));
jest.mock("../common/community-user-id", () => ({
  rawClerkUserId: (value: unknown) =>
    typeof value === "string" ? value : ((value as { sub?: string })?.sub ?? ""),
}));

const mockedDb = db as unknown as { execute: jest.Mock };

/** Flatten a Drizzle SQL template into inspectable text. */
const collectSqlText = (expression: any): string => {
  if (!expression?.queryChunks) return "";
  return expression.queryChunks
    .map((chunk: any) => {
      if (Array.isArray(chunk?.value)) return chunk.value.join("");
      return collectSqlText(chunk);
    })
    .join("");
};

/** Collect every bound parameter value in order. */
const collectParams = (expression: any, out: unknown[] = []): unknown[] => {
  if (!expression?.queryChunks) return out;
  for (const chunk of expression.queryChunks) {
    if (chunk && typeof chunk === "object" && "value" in chunk && !Array.isArray(chunk.value)) {
      out.push(chunk.value);
    } else {
      collectParams(chunk, out);
    }
  }
  return out;
};

const row = (over: Record<string, unknown> = {}) => ({
  id: "11111111-1111-4111-a111-111111111111",
  slug: "chevening-2027",
  name: "Chevening 2027",
  description: "Crew for the 2027 Chevening cycle",
  icon_url: null,
  space_id: "22222222-2222-4222-a222-222222222222",
  visibility: "public",
  status: "active",
  member_count: 42,
  opportunity_id: null,
  source_id: null,
  source_slug: null,
  source_name: null,
  score: 0.03,
  via_group_text: true,
  via_group_name: false,
  via_brief: false,
  is_member: false,
  snippet: "Crew for the 2027 Chevening cycle",
  ...over,
});

describe("CommunitySearchService", () => {
  let service: CommunitySearchService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new CommunitySearchService();
  });

  it("returns an empty result without querying for a sub-2-character term", async () => {
    const result = await service.search("user_abc", { q: "a" });
    expect(result).toEqual({ query: "a", hits: [], degraded: false });
    expect(mockedDb.execute).not.toHaveBeenCalled();
  });

  it("scopes results so a non-member can never see a private group", async () => {
    mockedDb.execute.mockResolvedValue({ rows: [] });
    await service.search("user_outsider", { q: "chevening" });

    const [expression] = mockedDb.execute.mock.calls[0];
    const text = collectSqlText(expression).toLowerCase();

    // The visibility CTE is the only gate; assert its exact shape.
    expect(text).toContain("g.visibility = 'public'");
    expect(text).toContain("from public.community_group_members m");
    expect(text).toContain("m.group_id = g.id");
    expect(text).toContain("m.banned_at is null");
    expect(text).toContain("g.status <> 'suspended'");
    // The viewer id must be bound, not interpolated.
    expect(collectParams(expression)).toContain("user_outsider");
    // No unscoped scan of the group table outside the `visible` CTE.
    expect(text).not.toMatch(/from public\.community_groups g\s+where g\.search_tsv/);
  });

  it("fuses full-text, trigram and brief legs with RRF k=60", async () => {
    mockedDb.execute.mockResolvedValue({ rows: [] });
    await service.search("user_abc", { q: "chevening" });

    const text = collectSqlText(mockedDb.execute.mock.calls[0][0]).toLowerCase();
    expect(text).toContain("websearch_to_tsquery('english'");
    expect(text).toContain("similarity(lower(g.name)");
    expect(text).toContain("b.search_tsv @@ websearch_to_tsquery");
    expect(text).toContain("1.0 / (60 + f.rank)");
    expect(text).toContain("0.8 / (60 + t.rank)");
    expect(text).toContain("0.6 / (60 + b.rank)");
  });

  it("shapes rows into hits, reporting which legs matched and any lineage", async () => {
    mockedDb.execute.mockResolvedValue({
      rows: [
        row({ via_group_text: true, via_group_name: true, via_brief: true,
              source_id: "33333333-3333-4333-a333-333333333333",
              source_slug: "chevening-2026", source_name: "Chevening 2026" }),
      ],
    });

    const result = await service.search("user_abc", { q: "chevening" });

    expect(result.degraded).toBe(false);
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]).toMatchObject({
      groupId: "11111111-1111-4111-a111-111111111111",
      slug: "chevening-2027",
      name: "Chevening 2027",
      memberCount: 42,
      isMember: false,
      matchedOn: ["name", "description", "brief"],
      carriedForwardFrom: {
        id: "33333333-3333-4333-a333-333333333333",
        slug: "chevening-2026",
        name: "Chevening 2026",
      },
    });
  });

  it("falls back to a visibility-scoped ILIKE query, logging once", async () => {
    const warn = jest.spyOn(service["logger"], "warn").mockImplementation(() => undefined);
    mockedDb.execute
      .mockRejectedValueOnce(new Error('column "search_tsv" does not exist'))
      .mockResolvedValueOnce({ rows: [row()] })
      .mockRejectedValueOnce(new Error('column "search_tsv" does not exist'))
      .mockResolvedValueOnce({ rows: [row()] });

    const first = await service.search("user_abc", { q: "chevening" });
    const second = await service.search("user_abc", { q: "chevening" });

    expect(first.degraded).toBe(true);
    expect(second.degraded).toBe(true);
    expect(first.hits).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);

    const fallbackText = collectSqlText(mockedDb.execute.mock.calls[1][0]).toLowerCase();
    expect(fallbackText).toContain("ilike");
    expect(fallbackText).toContain("g.visibility = 'public'");
  });

  it("clamps limit to 50 and rejects a negative offset", async () => {
    mockedDb.execute.mockResolvedValue({ rows: [] });
    await service.search("user_abc", { q: "chevening", limit: 5000, offset: -10 });

    const params = collectParams(mockedDb.execute.mock.calls[0][0]);
    expect(params).toContain(50);
    expect(params).toContain(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api && npx jest src/communities/community-search.service.spec.ts`

Expected: FAIL — `Cannot find module './community-search.service' from 'src/communities/community-search.service.spec.ts'`

- [ ] **Step 3: Write the search service**

Create `backend/services/services/api/src/communities/community-search.service.ts`:

```ts
import { Injectable, Logger } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { db } from "../db";

export type CommunitySearchLeg = "name" | "description" | "brief";

export interface CommunitySearchHit {
  groupId: string;
  slug: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  spaceId: string;
  visibility: "public" | "unlisted" | "private";
  status: "active" | "archived" | "suspended";
  memberCount: number;
  opportunityId: string | null;
  matchedOn: CommunitySearchLeg[];
  snippet: string | null;
  score: number;
  isMember: boolean;
  carriedForwardFrom: { id: string; slug: string; name: string } | null;
}

export interface CommunitySearchResponse {
  query: string;
  hits: CommunitySearchHit[];
  degraded: boolean;
}

interface SearchRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  space_id: string;
  visibility: CommunitySearchHit["visibility"];
  status: CommunitySearchHit["status"];
  member_count: number | string | null;
  opportunity_id: string | null;
  source_id: string | null;
  source_slug: string | null;
  source_name: string | null;
  score: number | string | null;
  via_group_text: boolean | null;
  via_group_name: boolean | null;
  via_brief: boolean | null;
  is_member: boolean | null;
  snippet: string | null;
}

const MAX_LIMIT = 50;

/**
 * Search across group names, descriptions and Brief content.
 *
 * Deliberately the same machinery as OpportunitiesService.hybridSearch:
 * Reciprocal Rank Fusion (k = 60) over a weighted tsvector leg, a pg_trgm
 * leg for typo tolerance, and — new here — a Brief-content leg. No new search
 * technology is introduced.
 *
 * Visibility is enforced in a single `visible` CTE that every leg joins
 * against, so there is exactly one place that can leak a private group.
 * Unlisted groups are deliberately treated like private ones for in-app
 * search: spec §2 says a group is only *listed* after 5 members, and search is
 * listing. They remain reachable by link and by their public SEO page.
 */
@Injectable()
export class CommunitySearchService {
  private readonly logger = new Logger(CommunitySearchService.name);
  private degradedLogged = false;

  async search(
    viewerRawUserId: string,
    params: { q: string; space?: string; limit?: number; offset?: number },
  ): Promise<CommunitySearchResponse> {
    const term = String(params.q ?? "").trim();
    if (term.length < 2) {
      return { query: term, hits: [], degraded: false };
    }

    const limit = Math.min(Math.max(Number(params.limit) || 20, 1), MAX_LIMIT);
    const offset = Math.max(Number(params.offset) || 0, 0);
    const viewer = String(viewerRawUserId ?? "");
    const space = params.space?.trim() || null;

    try {
      const rows = await this.runFused(term, viewer, space, limit, offset);
      return { query: term, hits: rows.map((row) => this.toHit(row)), degraded: false };
    } catch (error) {
      if (!this.degradedLogged) {
        this.degradedLogged = true;
        this.logger.warn(
          `Community search degraded to ILIKE (migration 20260725160000 not applied?): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      const rows = await this.runFallback(term, viewer, space, limit, offset);
      return { query: term, hits: rows.map((row) => this.toHit(row)), degraded: true };
    }
  }

  private visibleCte(viewer: string, space: string | null) {
    return sql`
      visible as (
        select g.id
        from public.community_groups g
        where g.status <> 'suspended'
          ${space ? sql`and g.space_id = ${space}` : sql``}
          and (
            g.visibility = 'public'
            or exists (
              select 1
              from public.community_group_members m
              where m.group_id = g.id
                and m.user_id = ${viewer}
                and m.banned_at is null
            )
          )
      )
    `;
  }

  private memberExists(viewer: string) {
    return sql`
      exists (
        select 1
        from public.community_group_members m
        where m.group_id = g.id
          and m.user_id = ${viewer}
          and m.banned_at is null
      )
    `;
  }

  private async runFused(
    term: string,
    viewer: string,
    space: string | null,
    limit: number,
    offset: number,
  ): Promise<SearchRow[]> {
    const result = await db.execute(sql`
      with ${this.visibleCte(viewer, space)},
      fts as (
        select g.id,
               row_number() over (
                 order by ts_rank_cd(
                   g.search_tsv,
                   websearch_to_tsquery('english', ${term})
                 ) desc
               ) as rank
        from public.community_groups g
        join visible v on v.id = g.id
        where g.search_tsv @@ websearch_to_tsquery('english', ${term})
        order by ts_rank_cd(
          g.search_tsv,
          websearch_to_tsquery('english', ${term})
        ) desc
        limit 100
      ),
      trgm as (
        select g.id,
               row_number() over (
                 order by similarity(lower(g.name), lower(${term})) desc
               ) as rank
        from public.community_groups g
        join visible v on v.id = g.id
        where similarity(lower(g.name), lower(${term})) > 0.25
        order by similarity(lower(g.name), lower(${term})) desc
        limit 100
      ),
      brief as (
        select b.group_id as id,
               row_number() over (
                 order by ts_rank_cd(
                   b.search_tsv,
                   websearch_to_tsquery('english', ${term})
                 ) desc
               ) as rank
        from public.community_briefs b
        join visible v on v.id = b.group_id
        where b.search_tsv @@ websearch_to_tsquery('english', ${term})
        order by ts_rank_cd(
          b.search_tsv,
          websearch_to_tsquery('english', ${term})
        ) desc
        limit 100
      ),
      fused as (
        select id,
               coalesce(1.0 / (60 + f.rank), 0)
                 + coalesce(0.8 / (60 + t.rank), 0)
                 + coalesce(0.6 / (60 + b.rank), 0) as score,
               (f.rank is not null) as via_group_text,
               (t.rank is not null) as via_group_name,
               (b.rank is not null) as via_brief
        from fts f
        full outer join trgm t using (id)
        full outer join brief b using (id)
      )
      select g.id,
             g.slug,
             g.name,
             g.description,
             g.icon_url,
             g.space_id,
             g.visibility,
             g.status,
             g.member_count,
             g.opportunity_id,
             src.id as source_id,
             src.slug as source_slug,
             src.name as source_name,
             fused.score,
             fused.via_group_text,
             fused.via_group_name,
             fused.via_brief,
             ${this.memberExists(viewer)} as is_member,
             ts_headline(
               'english',
               coalesce(g.description, g.name),
               websearch_to_tsquery('english', ${term}),
               'MaxFragments=1,MaxWords=26,MinWords=8,StartSel=,StopSel='
             ) as snippet
      from fused
      join public.community_groups g on g.id = fused.id
      left join public.community_groups src
        on src.id = g.carried_forward_from_group_id
      order by fused.score desc,
               (g.status = 'active') desc,
               g.member_count desc,
               g.last_message_at desc nulls last
      limit ${limit} offset ${offset}
    `);
    return this.rows<SearchRow>(result);
  }

  /**
   * Fallback for the window between deploying this code and applying migration
   * 20260725160000. Same visibility gate, no tsvector/trigram dependency.
   */
  private async runFallback(
    term: string,
    viewer: string,
    space: string | null,
    limit: number,
    offset: number,
  ): Promise<SearchRow[]> {
    const pattern = `%${term.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    const result = await db.execute(sql`
      with ${this.visibleCte(viewer, space)}
      select g.id,
             g.slug,
             g.name,
             g.description,
             g.icon_url,
             g.space_id,
             g.visibility,
             g.status,
             g.member_count,
             g.opportunity_id,
             null::uuid as source_id,
             null::text as source_slug,
             null::text as source_name,
             0::float as score,
             (g.name ilike ${pattern}) as via_group_text,
             (g.name ilike ${pattern}) as via_group_name,
             false as via_brief,
             ${this.memberExists(viewer)} as is_member,
             g.description as snippet
      from public.community_groups g
      join visible v on v.id = g.id
      where g.name ilike ${pattern} or g.description ilike ${pattern}
      order by (g.status = 'active') desc, g.member_count desc
      limit ${limit} offset ${offset}
    `);
    return this.rows<SearchRow>(result);
  }

  private toHit(row: SearchRow): CommunitySearchHit {
    const matchedOn: CommunitySearchLeg[] = [];
    if (row.via_group_text) matchedOn.push("name", "description");
    else if (row.via_group_name) matchedOn.push("name");
    if (row.via_brief) matchedOn.push("brief");

    return {
      groupId: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description ?? null,
      iconUrl: row.icon_url ?? null,
      spaceId: row.space_id,
      visibility: row.visibility,
      status: row.status,
      memberCount: Number(row.member_count ?? 0),
      opportunityId: row.opportunity_id ?? null,
      matchedOn,
      snippet: row.snippet ?? null,
      score: Number(row.score ?? 0),
      isMember: Boolean(row.is_member),
      carriedForwardFrom:
        row.source_id && row.source_slug && row.source_name
          ? { id: row.source_id, slug: row.source_slug, name: row.source_name }
          : null,
    };
  }

  private rows<T>(result: unknown): T[] {
    if (Array.isArray(result)) return result as T[];
    return (result as { rows?: T[] }).rows ?? [];
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api && npx jest src/communities/community-search.service.spec.ts`

Expected: PASS — `Tests: 6 passed, 6 total`

- [ ] **Step 5: Write the controller**

Create `backend/services/services/api/src/communities/community-search.controller.ts`:

```ts
import { Controller, Get, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser } from "../auth/current-user.decorator";
import { rawClerkUserId } from "../common/community-user-id";
import {
  CommunitySearchService,
  type CommunitySearchResponse,
} from "./community-search.service";

/**
 * Its own controller (same "communities" prefix as Slice 2's) so this slice
 * never has to edit the group controller. Nest resolves `communities/search`
 * and `communities/groups/:groupId` unambiguously — different literal segments.
 */
@Controller("communities")
export class CommunitySearchController {
  constructor(private readonly searchService: CommunitySearchService) {}

  @Get("search")
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  search(
    // `authId` is the RAW Clerk sub. `id` is the derived uuid and must never be
    // used against a community_* table (contract constraint #2).
    @CurrentUser("authId") authId: string,
    @Query("q") q: string,
    @Query("space") space?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ): Promise<CommunitySearchResponse> {
    return this.searchService.search(rawClerkUserId(authId ?? ""), {
      q: q ?? "",
      space,
      limit: Number(limit) || 20,
      offset: Number(offset) || 0,
    });
  }
}
```

- [ ] **Step 6: Register in the communities module**

Open `backend/services/services/api/src/communities/communities.module.ts` and add the import lines
plus the two array entries:

```ts
import { CommunitySearchController } from "./community-search.controller";
import { CommunitySearchService } from "./community-search.service";
```

Then inside `@Module({...})`: add `CommunitySearchController` to `controllers`, and
`CommunitySearchService` to both `providers` and `exports`.

- [ ] **Step 7: Verify the route resolves and the app still boots**

Run:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npm run build && node -e "
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/app.module');
NestFactory.create(AppModule, { logger: false })
  .then(async (app) => { await app.init();
    const routes = app.getHttpServer()._events.request._router.stack
      .filter((l) => l.route).map((l) => l.route.path);
    console.log(routes.includes('/communities/search') ? 'ROUTE OK' : 'ROUTE MISSING');
    await app.close(); process.exit(0); })
  .catch((e) => { console.error(e); process.exit(1); });
"
```

Expected: `ROUTE OK`

(This doubles as the constraint-#10 boot smoke test — a Nest DI mistake fails here, not in jest.)

- [ ] **Step 8: Commit**

```bash
git add backend/services/services/api/src/communities/community-search.service.ts \
        backend/services/services/api/src/communities/community-search.service.spec.ts \
        backend/services/services/api/src/communities/community-search.controller.ts \
        backend/services/services/api/src/communities/communities.module.ts
git commit -m "feat(communities): visibility-scoped group search over names, descriptions and Briefs"
```

---

## Task 3: Season carry-forward — `POST /communities/groups/:groupId/carry-forward`

**Files:**
- Create: `backend/services/services/api/src/communities/dto/carry-forward.dto.ts`
- Create: `backend/services/services/api/src/communities/community-carry-forward.service.ts`
- Create: `backend/services/services/api/src/communities/community-carry-forward.service.spec.ts`
- Create: `backend/services/services/api/src/communities/community-carry-forward.controller.ts`
- Modify: `backend/services/services/api/src/communities/communities.module.ts`
- Modify: `<CORE>/src/types/community.ts` (one additive optional property)

**Interfaces:**
- Consumes: `rawClerkUserId` / `toLegacyUuid` (Slice 1), `hashApiKey` from `src/common/api-key-hash.ts`,
  `NotificationsService.broadcast(adminUserId, dto)` with `audience: "specific"` (existing), the
  `community-invite` notification kind (added by Slice 2), and the Task-1 lineage columns.
- Produces:
  ```ts
  export interface CarryForwardResult {
    created: boolean;                 // false = idempotent replay
    group: { id: string; slug: string; name: string; spaceId: string; expiresAt: string | null };
    carriedForwardFrom: { id: string; slug: string; name: string };
    briefCopied: boolean;
    pinnedCopied: number;
    invite: { token: string; url: string; maxUses: number } | null;
    invitedMemberCount: number;
  }
  class CommunityCarryForwardService {
    carryForward(actorAuthId: string, sourceGroupId: string, dto: CarryForwardGroupDto): Promise<CarryForwardResult>;
  }
  ```
  and the `@edutu/core` `CommunityGroup` gains `carriedForwardFrom?: { id: string; slug: string; name: string } | null`.

- [ ] **Step 1: Write the DTO**

Create `backend/services/services/api/src/communities/dto/carry-forward.dto.ts`:

```ts
import { z } from "zod";

/**
 * Body for POST /communities/groups/:groupId/carry-forward.
 * Everything is optional — a bare POST produces a sensible next-cycle group,
 * because the owner tapping "Carry forward" should not have to fill a form.
 */
export const CarryForwardGroupDtoSchema = z.object({
  name: z.string().trim().min(3).max(80).optional(),
  description: z.string().trim().max(500).optional(),
  // Anchor is NOT inherited: last season's opportunity is closed. The client
  // may pass this season's opportunity if it already exists in the catalogue.
  opportunityId: z.string().uuid().optional(),
  expiresAt: z.string().datetime().optional(),
  // Copy the previous ✦saved messages as pinned resources (default on).
  copyPinned: z.boolean().default(true),
  // Notify prior members with an opt-in invite (default on).
  inviteMembers: z.boolean().default(true),
});

export type CarryForwardGroupDto = z.infer<typeof CarryForwardGroupDtoSchema>;
```

- [ ] **Step 2: Write the failing service tests**

Create `backend/services/services/api/src/communities/community-carry-forward.service.spec.ts`:

```ts
import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { db } from "../db";
import { CommunityCarryForwardService } from "./community-carry-forward.service";

jest.mock("../db", () => ({
  db: { execute: jest.fn(), transaction: jest.fn() },
}));
jest.mock("../common/community-user-id", () => ({
  rawClerkUserId: (value: unknown) =>
    typeof value === "string" ? value : ((value as { sub?: string })?.sub ?? ""),
  toLegacyUuid: (raw: string) => `uuid-of-${raw}`,
}));

const mockedDb = db as unknown as { execute: jest.Mock; transaction: jest.Mock };

const SOURCE_ID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const NEW_ID = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";

const sourceGroup = (over: Record<string, unknown> = {}) => ({
  id: SOURCE_ID,
  slug: "chevening-2026",
  name: "Chevening 2026",
  description: "The 2026 cohort",
  space_id: "cccccccc-cccc-4ccc-cccc-cccccccccccc",
  icon_url: null,
  visibility: "public",
  join_policy: "open",
  rules: "Be kind.",
  status: "archived",
  actor_role: "owner",
  ...over,
});

/**
 * A transaction stub whose `execute` returns queued results in order, so a
 * test declares the DB's answers as a script.
 */
function scriptTransaction(script: Array<{ rows: unknown[] }>) {
  const calls: any[] = [];
  const tx = {
    execute: jest.fn(async (expression: any) => {
      calls.push(expression);
      return script.shift() ?? { rows: [] };
    }),
  };
  mockedDb.transaction.mockImplementation(async (cb: any) => cb(tx));
  return { tx, calls };
}

const collectSqlText = (expression: any): string => {
  if (!expression?.queryChunks) return "";
  return expression.queryChunks
    .map((chunk: any) =>
      Array.isArray(chunk?.value) ? chunk.value.join("") : collectSqlText(chunk),
    )
    .join("");
};

describe("CommunityCarryForwardService", () => {
  let service: CommunityCarryForwardService;
  const notifications = { broadcast: jest.fn() };

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.EDUTU_PUBLIC_APP_URL = "https://www.edutu.org";
    service = new CommunityCarryForwardService(notifications as any);
  });

  it("404s when the source group does not exist", async () => {
    mockedDb.execute.mockResolvedValueOnce({ rows: [] });
    await expect(service.carryForward("user_owner", SOURCE_ID, {} as any)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("403s when the caller is not the owner", async () => {
    mockedDb.execute.mockResolvedValueOnce({ rows: [sourceGroup({ actor_role: "admin" })] });
    await expect(service.carryForward("user_admin", SOURCE_ID, {} as any)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("409s when the source group is not archived yet", async () => {
    mockedDb.execute.mockResolvedValueOnce({ rows: [sourceGroup({ status: "active" })] });
    await expect(service.carryForward("user_owner", SOURCE_ID, {} as any)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  // ── IDEMPOTENCY ──────────────────────────────────────────────────────────
  it("returns the existing successor instead of creating a second one (pre-check)", async () => {
    mockedDb.execute
      .mockResolvedValueOnce({ rows: [sourceGroup()] })
      .mockResolvedValueOnce({
        rows: [{ id: NEW_ID, slug: "chevening-2027", name: "Chevening 2027",
                 space_id: sourceGroup().space_id, expires_at: null }],
      });

    const result = await service.carryForward("user_owner", SOURCE_ID, {
      copyPinned: true, inviteMembers: true,
    } as any);

    expect(result.created).toBe(false);
    expect(result.group.id).toBe(NEW_ID);
    expect(mockedDb.transaction).not.toHaveBeenCalled();
    expect(notifications.broadcast).not.toHaveBeenCalled();
  });

  it("returns the existing successor when two taps race past the pre-check (23505)", async () => {
    const conflict: any = new Error("duplicate key value violates unique constraint");
    conflict.code = "23505";
    conflict.constraint = "uq_community_groups_carried_forward_from";

    mockedDb.execute
      .mockResolvedValueOnce({ rows: [sourceGroup()] })   // load source
      .mockResolvedValueOnce({ rows: [] })                 // pre-check: none yet
      .mockResolvedValueOnce({                             // post-conflict re-read
        rows: [{ id: NEW_ID, slug: "chevening-2027", name: "Chevening 2027",
                 space_id: sourceGroup().space_id, expires_at: null }],
      });
    mockedDb.transaction.mockRejectedValueOnce(conflict);

    const result = await service.carryForward("user_owner", SOURCE_ID, {
      copyPinned: true, inviteMembers: true,
    } as any);

    expect(result.created).toBe(false);
    expect(result.group.id).toBe(NEW_ID);
    expect(notifications.broadcast).not.toHaveBeenCalled();
  });

  // ── HAPPY PATH ───────────────────────────────────────────────────────────
  it("creates the successor with Brief, pinned resources, invite and notification", async () => {
    mockedDb.execute
      .mockResolvedValueOnce({ rows: [sourceGroup()] })
      .mockResolvedValueOnce({ rows: [] });

    const { calls } = scriptTransaction([
      { rows: [{ id: NEW_ID, slug: "chevening-2027", name: "Chevening 2027",
                 space_id: sourceGroup().space_id, expires_at: null }] },  // insert group
      { rows: [] },                                                        // owner membership
      { rows: [{ content: { sections: [] }, citations: {}, model: "deepseek" }] }, // source brief
      { rows: [] },                                                        // insert brief copy
      { rows: [{ n: 4 }] },                                                // copy pinned
      { rows: [] },                                                        // system message
      { rows: [] },                                                        // insert invite
      { rows: [{ user_id: "user_a" }, { user_id: "user_b" }] },            // prior members
    ]);

    const result = await service.carryForward("user_owner", SOURCE_ID, {
      name: "Chevening 2027", copyPinned: true, inviteMembers: true,
    } as any);

    expect(result.created).toBe(true);
    expect(result.briefCopied).toBe(true);
    expect(result.pinnedCopied).toBe(4);
    expect(result.carriedForwardFrom).toEqual({
      id: SOURCE_ID, slug: "chevening-2026", name: "Chevening 2026",
    });
    expect(result.invite?.url).toMatch(/^https:\/\/www\.edutu\.org\/g\/[A-Za-z0-9_-]{22}$/);
    expect(result.invitedMemberCount).toBe(2);

    // Lineage is written on the INSERT, not patched afterwards.
    const insertText = collectSqlText(calls[0]).toLowerCase();
    expect(insertText).toContain("carried_forward_from_group_id");
    expect(insertText).toContain("carried_forward_at");

    // Pinned copy keeps original authorship and drops cross-group reply links.
    const pinnedText = collectSqlText(calls[4]).toLowerCase();
    expect(pinnedText).toContain("saved_to_brief = true");
    expect(pinnedText).toContain("null as reply_to_id");
    expect(pinnedText).toContain("limit 50");

    // Reuses an EXISTING notification kind: no notifications_kind_check change.
    expect(notifications.broadcast).toHaveBeenCalledTimes(1);
    const [, dto] = notifications.broadcast.mock.calls[0];
    expect(dto.kind).toBe("community-invite");
    expect(dto.audience).toBe("specific");
    // notifications is a legacy uuid-keyed table — the ONE sanctioned boundary.
    expect(dto.targetUserIds).toEqual(["uuid-of-user_a", "uuid-of-user_b"]);
  });

  // ── NO BRIEF ─────────────────────────────────────────────────────────────
  it("still creates the successor when the source group has no Brief", async () => {
    mockedDb.execute
      .mockResolvedValueOnce({ rows: [sourceGroup()] })
      .mockResolvedValueOnce({ rows: [] });

    scriptTransaction([
      { rows: [{ id: NEW_ID, slug: "chevening-2027", name: "Chevening 2027",
                 space_id: sourceGroup().space_id, expires_at: null }] },
      { rows: [] },
      { rows: [] },              // <- no brief row
      { rows: [{ n: 0 }] },      // copy pinned (nothing saved)
      { rows: [] },              // system message
      { rows: [] },              // invite
      { rows: [] },              // no prior members
    ]);

    const result = await service.carryForward("user_owner", SOURCE_ID, {
      copyPinned: true, inviteMembers: true,
    } as any);

    expect(result.created).toBe(true);
    expect(result.briefCopied).toBe(false);
    expect(result.pinnedCopied).toBe(0);
    expect(result.invitedMemberCount).toBe(0);
    expect(notifications.broadcast).not.toHaveBeenCalled();
    expect(result.group.name).toBe("Chevening 2027");
  });

  it("skips the invite entirely when inviteMembers is false", async () => {
    mockedDb.execute
      .mockResolvedValueOnce({ rows: [sourceGroup()] })
      .mockResolvedValueOnce({ rows: [] });

    scriptTransaction([
      { rows: [{ id: NEW_ID, slug: "chevening-2027", name: "Chevening 2027",
                 space_id: sourceGroup().space_id, expires_at: null }] },
      { rows: [] },
      { rows: [] },
      { rows: [{ n: 0 }] },
      { rows: [] },
    ]);

    const result = await service.carryForward("user_owner", SOURCE_ID, {
      copyPinned: true, inviteMembers: false,
    } as any);

    expect(result.invite).toBeNull();
    expect(result.invitedMemberCount).toBe(0);
    expect(notifications.broadcast).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api && npx jest src/communities/community-carry-forward.service.spec.ts`

Expected: FAIL — `Cannot find module './community-carry-forward.service'`

- [ ] **Step 4: Write the carry-forward service**

Create `backend/services/services/api/src/communities/community-carry-forward.service.ts`:

```ts
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { hashApiKey } from "../common/api-key-hash";
import { rawClerkUserId, toLegacyUuid } from "../common/community-user-id";
import { NotificationsService } from "../notifications/notifications.service";
import type { CarryForwardGroupDto } from "./dto/carry-forward.dto";

export interface CarryForwardResult {
  created: boolean;
  group: {
    id: string;
    slug: string;
    name: string;
    spaceId: string;
    expiresAt: string | null;
  };
  carriedForwardFrom: { id: string; slug: string; name: string };
  briefCopied: boolean;
  pinnedCopied: number;
  invite: { token: string; url: string; maxUses: number } | null;
  invitedMemberCount: number;
}

interface SourceRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  space_id: string;
  icon_url: string | null;
  visibility: string;
  join_policy: string;
  rules: string | null;
  status: string;
  actor_role: string | null;
}

interface SuccessorRow {
  id: string;
  slug: string;
  name: string;
  space_id: string;
  expires_at: string | null;
}

const MAX_PINNED_CARRIED = 50;
const INVITE_TTL_DAYS = 30;

/** 22 random URL-safe characters, matching the invite-token shape in spec §6.2. */
function newInviteToken(): string {
  return randomBytes(24).toString("base64url").slice(0, 22);
}

/** "Chevening 2026" -> "Chevening 2027"; falls back to a "(next cycle)" suffix. */
function deriveNextName(name: string): string {
  const match = name.match(/(19|20)\d{2}/);
  if (match) {
    const next = String(Number(match[0]) + 1);
    return `${name.slice(0, match.index)}${next}${name.slice(match.index! + 4)}`.trim();
  }
  return `${name} (next cycle)`.slice(0, 80);
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "group"
  );
}

function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const code = (error as { code?: string })?.code;
  if (code !== "23505") return false;
  if (!constraint) return true;
  const name = (error as { constraint?: string })?.constraint ?? "";
  const message = error instanceof Error ? error.message : String(error);
  return name === constraint || message.includes(constraint);
}

/**
 * Season carry-forward — the anti-graveyard mechanic (spec §6.3).
 *
 * An archived group's owner creates next cycle's group pre-loaded with the
 * previous Brief and its ✦saved resources, and every prior member gets an
 * OPT-IN invite back (they are not auto-joined).
 *
 * Idempotency has two layers:
 *   1. a pre-check select on carried_forward_from_group_id, and
 *   2. the partial unique index uq_community_groups_carried_forward_from,
 *      which turns a genuine double-tap race into a 23505 we translate into
 *      "here is the group you already made".
 * Only layer 2 is actually a guarantee; layer 1 just avoids the wasted work.
 */
@Injectable()
export class CommunityCarryForwardService {
  private readonly logger = new Logger(CommunityCarryForwardService.name);

  constructor(private readonly notifications: NotificationsService) {}

  private get appBaseUrl(): string {
    return (
      process.env.EDUTU_PUBLIC_APP_URL ||
      process.env.PUBLIC_APP_URL ||
      "https://www.edutu.org"
    ).replace(/\/$/, "");
  }

  async carryForward(
    actorAuthId: string,
    sourceGroupId: string,
    dto: CarryForwardGroupDto,
  ): Promise<CarryForwardResult> {
    const actor = rawClerkUserId(actorAuthId ?? "");
    const source = await this.loadSource(sourceGroupId, actor);

    if (!source) throw new NotFoundException("Group not found");
    if (source.actor_role !== "owner") {
      throw new ForbiddenException("Only the group owner can carry a season forward");
    }
    if (source.status !== "archived") {
      throw new ConflictException(
        "A group can only be carried forward once it has archived at expiry",
      );
    }

    const existing = await this.findSuccessor(source.id);
    if (existing) return this.replay(source, existing);

    const name = dto.name?.trim() || deriveNextName(source.name);
    const token = newInviteToken();

    let outcome: {
      group: SuccessorRow;
      briefCopied: boolean;
      pinnedCopied: number;
      priorMembers: string[];
      inviteMaxUses: number;
    };

    try {
      outcome = await this.runTransaction(source, actor, dto, name, token);
    } catch (error) {
      if (isUniqueViolation(error, "uq_community_groups_carried_forward_from")) {
        const raced = await this.findSuccessor(source.id);
        if (raced) return this.replay(source, raced);
      }
      throw error;
    }

    if (dto.inviteMembers !== false && outcome.priorMembers.length > 0) {
      await this.notifyPriorMembers(source, outcome.group, token, outcome.priorMembers);
    }

    return {
      created: true,
      group: {
        id: outcome.group.id,
        slug: outcome.group.slug,
        name: outcome.group.name,
        spaceId: outcome.group.space_id,
        expiresAt: outcome.group.expires_at ?? null,
      },
      carriedForwardFrom: { id: source.id, slug: source.slug, name: source.name },
      briefCopied: outcome.briefCopied,
      pinnedCopied: outcome.pinnedCopied,
      invite:
        dto.inviteMembers === false
          ? null
          : {
              token,
              url: `${this.appBaseUrl}/g/${token}`,
              maxUses: outcome.inviteMaxUses,
            },
      invitedMemberCount: dto.inviteMembers === false ? 0 : outcome.priorMembers.length,
    };
  }

  private async loadSource(groupId: string, actor: string): Promise<SourceRow | null> {
    const result = await db.execute(sql`
      select g.id, g.slug, g.name, g.description, g.space_id, g.icon_url,
             g.visibility, g.join_policy, g.rules, g.status,
             (
               select m.role from public.community_group_members m
               where m.group_id = g.id and m.user_id = ${actor} and m.banned_at is null
               limit 1
             ) as actor_role
      from public.community_groups g
      where g.id = ${groupId}
      limit 1
    `);
    return this.rows<SourceRow>(result)[0] ?? null;
  }

  private async findSuccessor(sourceId: string): Promise<SuccessorRow | null> {
    const result = await db.execute(sql`
      select id, slug, name, space_id, expires_at
      from public.community_groups
      where carried_forward_from_group_id = ${sourceId}
      limit 1
    `);
    return this.rows<SuccessorRow>(result)[0] ?? null;
  }

  private replay(source: SourceRow, group: SuccessorRow): CarryForwardResult {
    return {
      created: false,
      group: {
        id: group.id,
        slug: group.slug,
        name: group.name,
        spaceId: group.space_id,
        expiresAt: group.expires_at ?? null,
      },
      carriedForwardFrom: { id: source.id, slug: source.slug, name: source.name },
      briefCopied: false,
      pinnedCopied: 0,
      invite: null,
      invitedMemberCount: 0,
    };
  }

  private async runTransaction(
    source: SourceRow,
    actor: string,
    dto: CarryForwardGroupDto,
    name: string,
    token: string,
  ) {
    return db.transaction(async (tx) => {
      const slug = `${slugify(name)}-${randomBytes(3).toString("hex")}`;
      const description = dto.description?.trim() ?? source.description ?? null;
      const expiresAt = dto.expiresAt ?? null;

      const inserted = this.rows<SuccessorRow>(
        await tx.execute(sql`
          insert into public.community_groups
            (space_id, slug, name, description, icon_url, visibility, join_policy,
             opportunity_id, rules, created_by, member_count, message_count,
             status, expires_at, carried_forward_from_group_id, carried_forward_at,
             created_at)
          values
            (${source.space_id}, ${slug}, ${name}, ${description}, ${source.icon_url},
             ${source.visibility}, ${source.join_policy},
             ${dto.opportunityId ?? null}, ${source.rules}, ${actor}, 1, 0,
             'active', ${expiresAt}, ${source.id}, now(), now())
          returning id, slug, name, space_id, expires_at
        `),
      )[0];

      await tx.execute(sql`
        insert into public.community_group_members (group_id, user_id, role, joined_at)
        values (${inserted.id}, ${actor}, 'owner', now())
        on conflict (group_id, user_id) do nothing
      `);

      // ── Brief ──────────────────────────────────────────────────────────
      const sourceBrief = this.rows<{
        content: unknown;
        citations: unknown;
        model: string | null;
      }>(
        await tx.execute(sql`
          select content, citations, model
          from public.community_briefs
          where group_id = ${source.id}
          limit 1
        `),
      )[0];

      let briefCopied = false;
      if (sourceBrief) {
        // version 1 + is_stale so Slice 4's normal regeneration replaces it as
        // soon as the new cohort produces real material.
        await tx.execute(sql`
          insert into public.community_briefs
            (group_id, content, citations, version, generated_at,
             generated_from_count, model, is_stale)
          values
            (${inserted.id}, ${sourceBrief.content as never},
             ${sourceBrief.citations as never}, 1, now(), 0,
             ${sourceBrief.model ?? null}, true)
          on conflict (group_id) do nothing
        `);
        briefCopied = true;
      }

      // ── Pinned (✦saved) resources ──────────────────────────────────────
      let pinnedCopied = 0;
      if (dto.copyPinned !== false) {
        const copied = this.rows<{ n: number | string }>(
          await tx.execute(sql`
            with carried as (
              insert into public.community_messages
                (group_id, user_id, kind, body, attachments, opportunity_id,
                 reply_to_id, saved_to_brief, is_deleted, created_at)
              select ${inserted.id}, m.user_id, m.kind, m.body, m.attachments,
                     m.opportunity_id, null as reply_to_id, true as saved_to_brief,
                     false, now()
              from public.community_messages m
              where m.group_id = ${source.id}
                and m.saved_to_brief = true
                and m.is_deleted = false
                and m.kind in ('text', 'image', 'opportunity')
              order by m.created_at asc
              limit ${MAX_PINNED_CARRIED}
              returning 1
            )
            select count(*)::int as n from carried
          `),
        )[0];
        pinnedCopied = Number(copied?.n ?? 0);
      }

      // ── Lineage system message ─────────────────────────────────────────
      await tx.execute(sql`
        insert into public.community_messages
          (group_id, user_id, kind, body, attachments, saved_to_brief,
           is_deleted, created_at)
        values
          (${inserted.id}, ${actor}, 'system',
           ${`Carried forward from ${source.name}. The previous cohort's Brief and saved resources are already here.`},
           '[]'::jsonb, false, false, now())
      `);

      // ── Opt-in invite for prior members ────────────────────────────────
      let priorMembers: string[] = [];
      let inviteMaxUses = 0;
      if (dto.inviteMembers !== false) {
        priorMembers = this.rows<{ user_id: string }>(
          await tx.execute(sql`
            select user_id
            from public.community_group_members
            where group_id = ${source.id}
              and banned_at is null
              and user_id <> ${actor}
          `),
        ).map((row) => row.user_id);

        inviteMaxUses = Math.max(priorMembers.length, 1);
        await tx.execute(sql`
          insert into public.community_invites
            (group_id, token_hash, token_prefix, created_by, role_on_join,
             max_uses, uses, expires_at)
          values
            (${inserted.id}, ${hashApiKey(token)}, ${token.slice(0, 6)}, ${actor},
             'member', ${inviteMaxUses}, 0,
             now() + interval '${sql.raw(String(INVITE_TTL_DAYS))} days')
        `);
      }

      return { group: inserted, briefCopied, pinnedCopied, priorMembers, inviteMaxUses };
    });
  }

  private async notifyPriorMembers(
    source: SourceRow,
    group: SuccessorRow,
    token: string,
    priorMembers: string[],
  ) {
    try {
      await this.notifications.broadcast("system:carry-forward", {
        title: `${group.name} is open`,
        body: `${source.name} has closed. Join the next cycle — the Brief and saved resources came with it.`,
        // EXISTING kind (added to notifications_kind_check by Slice 2). Do not
        // invent a new one here: unknown kinds are silently rejected.
        kind: "community-invite" as never,
        severity: "info",
        audience: "specific",
        // notifications is a legacy uuid-keyed table: the ONE sanctioned
        // conversion boundary (contract constraint #2).
        targetUserIds: priorMembers.map((raw) => toLegacyUuid(raw)),
        dedupeKey: `community-carry-forward:${group.id}`,
        metadata: {
          groupId: group.id,
          groupSlug: group.slug,
          carriedForwardFromGroupId: source.id,
          inviteUrl: `${this.appBaseUrl}/g/${token}`,
        },
        channels: { inApp: true, push: true },
      });
    } catch (error) {
      // A notification failure must never undo a successfully created group.
      this.logger.warn(
        `Carry-forward invite notification failed for group ${group.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private rows<T>(result: unknown): T[] {
    if (Array.isArray(result)) return result as T[];
    return (result as { rows?: T[] }).rows ?? [];
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api && npx jest src/communities/community-carry-forward.service.spec.ts`

Expected: PASS — `Tests: 8 passed, 8 total`

- [ ] **Step 6: Write the controller**

Create `backend/services/services/api/src/communities/community-carry-forward.controller.ts`:

```ts
import { Body, Controller, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser } from "../auth/current-user.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  CarryForwardGroupDtoSchema,
  type CarryForwardGroupDto,
} from "./dto/carry-forward.dto";
import {
  CommunityCarryForwardService,
  type CarryForwardResult,
} from "./community-carry-forward.service";

@Controller("communities")
export class CommunityCarryForwardController {
  constructor(private readonly carryForwardService: CommunityCarryForwardService) {}

  // Tight throttle: this is the endpoint a double-tapping thumb hits. The DB
  // unique index is the real guarantee; this just keeps the noise down.
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post("groups/:groupId/carry-forward")
  carryForward(
    @CurrentUser("authId") authId: string,
    @Param("groupId") groupId: string,
    @Body(new ZodValidationPipe(CarryForwardGroupDtoSchema))
    dto: CarryForwardGroupDto,
  ): Promise<CarryForwardResult> {
    return this.carryForwardService.carryForward(authId ?? "", groupId, dto);
  }
}
```

- [ ] **Step 7: Register in the communities module**

Add to `backend/services/services/api/src/communities/communities.module.ts`:

```ts
import { NotificationsModule } from "../notifications/notifications.module";
import { CommunityCarryForwardController } from "./community-carry-forward.controller";
import { CommunityCarryForwardService } from "./community-carry-forward.service";
```

`NotificationsModule` to `imports` (if Slice 2 has not already added it — check first with
`grep -n NotificationsModule src/communities/communities.module.ts`),
`CommunityCarryForwardController` to `controllers`, `CommunityCarryForwardService` to `providers`.

- [ ] **Step 8: Add the additive lineage property to the shared group type**

In `<CORE>/src/types/community.ts`, find the Slice-2 `CommunityGroup` type and append **one optional
property** immediately before its closing brace. This is additive only — no existing field changes:

```ts
  /** Slice 5. Present when this group was created by season carry-forward. */
  carriedForwardFrom?: { id: string; slug: string; name: string } | null;
```

Then make Slice 2's group projection populate it. Locate the projection:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
grep -n "lastMessageAt" src/communities/communities.service.ts
```

In the object literal that maps a group row to the API shape, add:

```ts
      carriedForwardFrom:
        row.carried_forward_from_group_id && row.carried_forward_from_slug
          ? {
              id: row.carried_forward_from_group_id,
              slug: row.carried_forward_from_slug,
              name: row.carried_forward_from_name,
            }
          : null,
```

and in the SELECT that feeds it, add the join + columns:

```sql
       g.carried_forward_from_group_id,
       cf.slug as carried_forward_from_slug,
       cf.name as carried_forward_from_name
...
  left join public.community_groups cf on cf.id = g.carried_forward_from_group_id
```

- [ ] **Step 9: Verify the boot smoke test and the whole backend suite**

Run:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npm run build && timeout 25 node dist/main; echo "exit=$?"
```

Expected: Nest boot logs listing `CommunityCarryForwardController {/communities}: POST /communities/groups/:groupId/carry-forward`, then `exit=124` (killed by timeout — that means it stayed up, which is the pass condition).

Run: `npx jest src/communities && npm run lint`

Expected: all communities specs pass; ESLint reports `0 problems`.

- [ ] **Step 10: Commit**

```bash
git add backend/services/services/api/src/communities/ \
        "$(ls -d packages/core 2>/dev/null || echo edutumobile/packages/core)/src/types/community.ts"
git commit -m "feat(communities): idempotent season carry-forward with Brief, pinned resources and opt-in invites"
```

---

## Task 4: One channel per on-screen group — the shared channel registry

**Why this task exists first:** contract constraint #3 says presence must not add a second channel per
group. Slice 2 already opens one channel for the on-screen group's messages. Supabase forbids adding
bindings after `subscribe()` — that is the exact shipped crash. So presence cannot simply `.on()` a
channel that is already subscribed. The fix is a registry that creates the channel once with **all**
bindings (messages, presence, typing) up front and fans events out to a mutable listener set. Hooks
then register *listeners*, never *bindings*.

**Files:**
- Create: `<CORE>/src/realtime/groupChannel.ts`
- Create: `<CORE>/src/types/presence.ts`
- Modify: `<CORE>/src/index.ts`
- Modify: Slice 2's messages hook (the only file under `<CORE>/src` that calls `supabase.channel(` for a group)
- Create: `edutu-web-app/src/test/__tests__/groupChannel.test.ts`

**Interfaces:**
- Consumes: `@supabase/supabase-js` `SupabaseClient`, `RealtimeChannel`.
- Produces:
  ```ts
  export type GroupChannelListeners = {
    onMessageEvent?: (payload: { eventType: string; new: Record<string, unknown> | null; old: Record<string, unknown> | null }) => void;
    onPresenceSync?: (members: GroupPresenceMember[]) => void;
    onTyping?: (event: { userId: string; displayName: string; at: number }) => void;
  };
  export type GroupChannelHandle = {
    degraded: boolean;
    trackPresence: (member: GroupPresenceMember) => void;
    untrackPresence: () => void;
    broadcastTyping: (event: { userId: string; displayName: string }) => void;
    release: () => void;
  };
  export function acquireGroupChannel(
    supabase: SupabaseClient,
    groupId: string,
    listeners: GroupChannelListeners,
    options?: { authorize?: (client: SupabaseClient) => void | Promise<void> },
  ): GroupChannelHandle;
  export function groupChannelTopic(groupId: string): string;   // "community-group-<id>"
  export function __resetGroupChannelRegistry(): void;           // tests only
  ```
- **Realtime auth (contract correction #4):** the registry calls Slice 2's `authorizeRealtime(supabase)`
  before creating the channel and again on `SUBSCRIBED`. The Supabase client attaches the Clerk JWT
  through a `global.fetch` override that the websocket never sees; without `realtime.setAuth(token)`
  the socket is anonymous and RLS delivers nothing. `options.authorize` exists only so tests can
  inject a spy — production callers always use the default.

- [ ] **Step 1: Resolve `<CORE>`**

Run:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
ls -d packages/core 2>/dev/null || ls -d edutumobile/packages/core
```

Expected: one path printed. Use it as `<CORE>` for every step below.

- [ ] **Step 2: Write the failing registry test**

Create `edutu-web-app/src/test/__tests__/groupChannel.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acquireGroupChannel,
  groupChannelTopic,
  __resetGroupChannelRegistry,
} from '@edutu/core';

type Binding = { type: string; filterOrEvent: unknown; handler: (...args: unknown[]) => void };

/** A Supabase double that reproduces the real client's fatal rule: calling
 *  .on() after .subscribe() throws, exactly as the shipped crash did. */
function makeSupabase() {
  const created: FakeChannel[] = [];

  class FakeChannel {
    topic: string;
    bindings: Binding[] = [];
    subscribed = false;
    tracked: unknown[] = [];
    untracked = 0;
    sent: unknown[] = [];
    presenceState: Record<string, unknown[]> = {};

    constructor(name: string) {
      this.topic = `realtime:${name}`;
      created.push(this);
    }
    on(type: string, filterOrEvent: unknown, handler: (...args: unknown[]) => void) {
      if (this.subscribed) {
        throw new Error('tried to add postgres_changes callbacks after subscribe');
      }
      this.bindings.push({ type, filterOrEvent, handler });
      return this;
    }
    subscribe(cb?: (status: string) => void) {
      this.subscribed = true;
      cb?.('SUBSCRIBED');
      return this;
    }
    track(payload: unknown) { this.tracked.push(payload); return Promise.resolve('ok'); }
    untrack() { this.untracked += 1; return Promise.resolve('ok'); }
    send(payload: unknown) { this.sent.push(payload); return Promise.resolve('ok'); }
    presenceState_() { return this.presenceState; }
  }

  const channels: FakeChannel[] = [];
  const supabase = {
    channel: vi.fn((name: string) => {
      const channel = new FakeChannel(name);
      channels.push(channel);
      return channel;
    }),
    getChannels: vi.fn(() => channels),
    removeChannel: vi.fn((channel: FakeChannel) => {
      const index = channels.indexOf(channel);
      if (index >= 0) channels.splice(index, 1);
      return Promise.resolve('ok');
    }),
  };
  return { supabase, created, channels };
}

describe('acquireGroupChannel', () => {
  beforeEach(() => __resetGroupChannelRegistry());

  it('opens exactly ONE channel for a group no matter how many consumers acquire it', () => {
    const { supabase, created } = makeSupabase();

    const a = acquireGroupChannel(supabase as never, 'g1', { onMessageEvent: vi.fn() });
    const b = acquireGroupChannel(supabase as never, 'g1', { onPresenceSync: vi.fn() });
    const c = acquireGroupChannel(supabase as never, 'g1', { onTyping: vi.fn() });

    expect(supabase.channel).toHaveBeenCalledTimes(1);
    expect(created).toHaveLength(1);
    expect(created[0].topic).toBe(`realtime:${groupChannelTopic('g1')}`);
    a.release(); b.release(); c.release();
  });

  it('binds messages, presence and typing BEFORE subscribing', () => {
    const { supabase, created } = makeSupabase();
    const handle = acquireGroupChannel(supabase as never, 'g1', {});

    const types = created[0].bindings.map((binding) => binding.type);
    expect(types).toContain('postgres_changes');
    expect(types).toContain('presence');
    expect(types).toContain('broadcast');
    // Every binding was registered while subscribed was still false — the fake
    // throws otherwise, so reaching this line is the assertion.
    expect(created[0].subscribed).toBe(true);
    handle.release();
  });

  it('never throws when subscribe fails; it degrades', () => {
    const { supabase, created } = makeSupabase();
    const original = supabase.channel;
    supabase.channel = vi.fn((name: string) => {
      const channel = original(name);
      channel.subscribe = () => { throw new Error('binding error'); };
      return channel;
    }) as never;

    const handle = acquireGroupChannel(supabase as never, 'g1', {});
    expect(handle.degraded).toBe(true);
    expect(() => handle.broadcastTyping({ userId: 'u1', displayName: 'A' })).not.toThrow();
    expect(() => handle.trackPresence({ userId: 'u1', displayName: 'A', avatarUrl: null, at: 1 })).not.toThrow();
    handle.release();
    expect(created).toBeDefined();
  });

  it('removes a stale channel with the same topic before subscribing (remount safety)', () => {
    const { supabase, channels } = makeSupabase();
    const stale = supabase.channel(groupChannelTopic('g1'));
    stale.subscribe();
    expect(channels).toHaveLength(1);

    __resetGroupChannelRegistry();
    const handle = acquireGroupChannel(supabase as never, 'g1', {});

    expect(supabase.removeChannel).toHaveBeenCalledWith(stale);
    expect(handle.degraded).toBe(false);
    handle.release();
  });

  it('tears the channel down only when the LAST consumer releases', async () => {
    const { supabase, channels } = makeSupabase();
    const a = acquireGroupChannel(supabase as never, 'g1', {});
    const b = acquireGroupChannel(supabase as never, 'g1', {});

    a.release();
    expect(supabase.removeChannel).not.toHaveBeenCalled();
    b.release();
    expect(supabase.removeChannel).toHaveBeenCalledTimes(1);
    expect(channels).toHaveLength(0);
  });

  it('fans a postgres_changes payload out to every registered listener', () => {
    const { supabase, created } = makeSupabase();
    const first = vi.fn();
    const second = vi.fn();
    const a = acquireGroupChannel(supabase as never, 'g1', { onMessageEvent: first });
    const b = acquireGroupChannel(supabase as never, 'g1', { onMessageEvent: second });

    const binding = created[0].bindings.find((x) => x.type === 'postgres_changes')!;
    binding.handler({ eventType: 'INSERT', new: { id: 'm1' }, old: null });

    expect(first).toHaveBeenCalledWith({ eventType: 'INSERT', new: { id: 'm1' }, old: null });
    expect(second).toHaveBeenCalledTimes(1);
    a.release(); b.release();
  });

  it('filters postgres_changes to the on-screen group only', () => {
    const { supabase, created } = makeSupabase();
    const handle = acquireGroupChannel(supabase as never, 'g1', {});
    const binding = created[0].bindings.find((x) => x.type === 'postgres_changes')!;
    expect(binding.filterOrEvent).toMatchObject({
      schema: 'public',
      table: 'community_messages',
      filter: 'group_id=eq.g1',
    });
    handle.release();
  });

  it('authorises the realtime socket BEFORE opening the channel', () => {
    // The Supabase client attaches the Clerk JWT via a global.fetch override
    // the websocket never sees. Without realtime.setAuth the socket is
    // anonymous and RLS delivers nothing — so authorise must come first.
    const { supabase } = makeSupabase();
    const order: string[] = [];
    const authorize = vi.fn(() => { order.push('authorize'); });
    supabase.channel = vi.fn((name: string) => {
      order.push('channel');
      return { topic: `realtime:${name}`, on() { return this; }, subscribe() { return this; },
               presenceState: () => ({}), track: () => Promise.resolve('ok'),
               untrack: () => Promise.resolve('ok'), send: () => Promise.resolve('ok') };
    }) as never;

    const handle = acquireGroupChannel(supabase as never, 'g1', {}, { authorize });

    expect(authorize).toHaveBeenCalledWith(supabase);
    expect(order).toEqual(['authorize', 'channel']);
    handle.release();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app && npx vitest run src/test/__tests__/groupChannel.test.ts`

Expected: FAIL — `No "acquireGroupChannel" export is defined on the "@edutu/core" mock` or `Failed to resolve import`.

- [ ] **Step 4: Write the presence types**

Create `<CORE>/src/types/presence.ts`:

```ts
/** A member currently on the group screen. */
export interface GroupPresenceMember {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  /** epoch ms this member was first seen in the current session */
  at: number;
}

export interface GroupPresenceState {
  online: GroupPresenceMember[];
  typing: GroupPresenceMember[];
  /** true when realtime is unavailable — the UI must simply show nothing. */
  degraded: boolean;
  /** false when presence is deliberately off (huge group, or signed out). */
  enabled: boolean;
}
```

- [ ] **Step 5: Write the registry**

Create `<CORE>/src/realtime/groupChannel.ts`:

```ts
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
// Slice 2. Pushes the Clerk JWT onto the realtime SOCKET (realtime.setAuth);
// the client's global.fetch override does not reach the websocket, so without
// this the socket is anonymous and RLS delivers nothing.
import { authorizeRealtime } from '../services/authorizeRealtime';
import type { GroupPresenceMember } from '../types/presence';

export interface GroupMessageEvent {
  eventType: string;
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
}

export interface GroupChannelListeners {
  onMessageEvent?: (event: GroupMessageEvent) => void;
  onPresenceSync?: (members: GroupPresenceMember[]) => void;
  onTyping?: (event: { userId: string; displayName: string; at: number }) => void;
}

export interface GroupChannelHandle {
  degraded: boolean;
  trackPresence: (member: GroupPresenceMember) => void;
  untrackPresence: () => void;
  broadcastTyping: (event: { userId: string; displayName: string }) => void;
  release: () => void;
}

interface RegistryEntry {
  channel: RealtimeChannel | null;
  supabase: SupabaseClient;
  refCount: number;
  degraded: boolean;
  listeners: Set<GroupChannelListeners>;
}

const registry = new Map<string, RegistryEntry>();

export function groupChannelTopic(groupId: string): string {
  return `community-group-${groupId}`;
}

/** Test-only: drop every entry without touching the client. */
export function __resetGroupChannelRegistry(): void {
  registry.clear();
}

function presenceMembersFrom(state: Record<string, unknown[]>): GroupPresenceMember[] {
  const byUser = new Map<string, GroupPresenceMember>();
  for (const entries of Object.values(state ?? {})) {
    for (const raw of entries ?? []) {
      const member = raw as Partial<GroupPresenceMember>;
      if (!member?.userId) continue;
      const existing = byUser.get(member.userId);
      const at = Number(member.at ?? Date.now());
      // One row per human even if they have two tabs open.
      if (!existing || at < existing.at) {
        byUser.set(member.userId, {
          userId: member.userId,
          displayName: String(member.displayName ?? 'Member'),
          avatarUrl: (member.avatarUrl as string | null) ?? null,
          at,
        });
      }
    }
  }
  return Array.from(byUser.values()).sort((a, b) => a.at - b.at);
}

/**
 * THE only place in the codebase that calls `supabase.channel()` for a group.
 *
 * Contract constraint #3, implemented literally:
 *  - one channel for the on-screen group, ref-counted across consumers;
 *  - every `.on()` binding is created BEFORE `.subscribe()`, so a second
 *    consumer mounting later adds a *listener*, never a *binding*;
 *  - any pre-existing channel on the same topic is removed first;
 *  - `subscribe()` is wrapped in try/catch and a failure degrades silently.
 */
export function acquireGroupChannel(
  supabase: SupabaseClient,
  groupId: string,
  listeners: GroupChannelListeners,
  options: { authorize?: (client: SupabaseClient) => void | Promise<void> } = {},
): GroupChannelHandle {
  const authorize = options.authorize ?? authorizeRealtime;
  const key = groupChannelTopic(groupId);
  let entry = registry.get(key);

  if (!entry) {
    entry = {
      channel: null,
      supabase,
      refCount: 0,
      degraded: false,
      listeners: new Set<GroupChannelListeners>(),
    };
    registry.set(key, entry);

    const current = entry;
    try {
      // Authorise the SOCKET first. setAuth also re-pushes the token to every
      // already-joined channel, so calling it again on SUBSCRIBED is safe and
      // covers a token that refreshed mid-connection.
      void authorize(supabase);

      // A stale channel with this exact topic (fast remount) makes `.on()`
      // throw synchronously and bubble to the app ErrorBoundary.
      for (const existing of supabase.getChannels()) {
        if (existing.topic === `realtime:${key}`) {
          void supabase.removeChannel(existing);
        }
      }

      const channel = supabase.channel(key, {
        config: { broadcast: { self: false }, presence: {} },
      });

      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'community_messages',
          filter: `group_id=eq.${groupId}`,
        },
        (payload: unknown) => {
          const event = payload as GroupMessageEvent;
          for (const listener of current.listeners) listener.onMessageEvent?.(event);
        },
      );

      channel.on('presence', { event: 'sync' }, () => {
        const members = presenceMembersFrom(
          (channel.presenceState() ?? {}) as Record<string, unknown[]>,
        );
        for (const listener of current.listeners) listener.onPresenceSync?.(members);
      });

      channel.on('broadcast', { event: 'typing' }, (message: unknown) => {
        const payload = (message as { payload?: { userId?: string; displayName?: string } })
          ?.payload;
        if (!payload?.userId) return;
        const event = {
          userId: payload.userId,
          displayName: String(payload.displayName ?? 'Member'),
          at: Date.now(),
        };
        for (const listener of current.listeners) listener.onTyping?.(event);
      });

      channel.subscribe((status: string) => {
        if (status === 'SUBSCRIBED') void authorize(supabase);
      });
      current.channel = channel;
    } catch (error) {
      // Presence and live messages are both optional comforts. Never crash.
      current.degraded = true;
      current.channel = null;
      // eslint-disable-next-line no-console
      console.warn('Group realtime channel unavailable:', error);
    }
  }

  const entryRef = entry;
  entryRef.listeners.add(listeners);
  entryRef.refCount += 1;

  let released = false;
  return {
    degraded: entryRef.degraded,
    trackPresence(member: GroupPresenceMember) {
      try {
        void entryRef.channel?.track(member);
      } catch {
        /* presence is best-effort */
      }
    },
    untrackPresence() {
      try {
        void entryRef.channel?.untrack();
      } catch {
        /* presence is best-effort */
      }
    },
    broadcastTyping(event) {
      try {
        void entryRef.channel?.send({
          type: 'broadcast',
          event: 'typing',
          payload: { ...event, at: Date.now() },
        });
      } catch {
        /* typing is best-effort */
      }
    },
    release() {
      if (released) return;
      released = true;
      entryRef.listeners.delete(listeners);
      entryRef.refCount -= 1;
      if (entryRef.refCount > 0) return;
      registry.delete(key);
      try {
        if (entryRef.channel) void entryRef.supabase.removeChannel(entryRef.channel);
      } catch {
        /* teardown is best-effort */
      }
    },
  };
}
```

- [ ] **Step 6: Confirm the `authorizeRealtime` import path, then export from the package index**

Slice 2 introduced `authorizeRealtime`. Confirm where it lives and fix the import at the top of
`groupChannel.ts` if the path differs:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
CORE=$(ls -d packages/core 2>/dev/null || echo edutumobile/packages/core)
grep -rn "export .*authorizeRealtime" "$CORE/src"
```

Expected: one hit. The plan assumes `$CORE/src/services/authorizeRealtime.ts`; if Slice 2 put it
elsewhere, update the `import { authorizeRealtime } from '../services/authorizeRealtime';` line to
match. If it does **not** exist yet, stop and raise it — presence over an anonymous socket silently
returns nothing and is the hardest class of bug to spot in review.

Add to `<CORE>/src/index.ts`:

```ts
export * from './realtime/groupChannel';
export * from './types/presence';
```

If `<CORE>/package.json` has an `exports` map (it does today), also add the two subpath entries next
to the existing ones:

```json
    "./realtime/groupChannel": {
      "types": "./src/realtime/groupChannel.ts",
      "default": "./src/realtime/groupChannel.ts",
      "react-native": "./src/realtime/groupChannel.ts"
    },
    "./types/presence": {
      "types": "./src/types/presence.ts",
      "default": "./src/types/presence.ts",
      "react-native": "./src/types/presence.ts"
    },
```

- [ ] **Step 7: Migrate Slice 2's messages hook onto the registry**

Find the one call site:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
grep -rn "supabase.channel(" "$(ls -d packages/core 2>/dev/null || echo edutumobile/packages/core)/src" | grep -i group
```

Expected: exactly one hit, inside Slice 2's `useGroupMessages` realtime effect.

Replace that entire `useEffect` (the one that creates, binds and subscribes a channel, and removes it
in cleanup) with:

```ts
  // Realtime lives in the shared registry so presence/typing can attach to the
  // SAME channel. Deps are [supabase, groupId] only; the handler reads the
  // latest callback from a ref (contract constraint #3).
  const onRealtimeRef = useRef(handleRealtimeEvent);
  useEffect(() => {
    onRealtimeRef.current = handleRealtimeEvent;
  }, [handleRealtimeEvent]);

  useEffect(() => {
    if (!groupId) return;
    const handle = acquireGroupChannel(supabase, groupId, {
      onMessageEvent: (event) => onRealtimeRef.current(event),
    });
    return () => handle.release();
  }, [supabase, groupId]);
```

where `handleRealtimeEvent` is Slice 2's existing payload handler (rename yours to match if it is
called something else). Add the import:

```ts
import { acquireGroupChannel } from '../realtime/groupChannel';
```

and delete the now-unused `getChannels`/`removeChannel` code from that hook.

- [ ] **Step 8: Run the registry test to verify it passes**

Run: `cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app && npx vitest run src/test/__tests__/groupChannel.test.ts`

Expected: PASS — `Test Files 1 passed`, `Tests 8 passed`

- [ ] **Step 9: Verify Slice 2's suites still pass on both clients**

Run:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app && npx vitest run && npm run typecheck
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile && npx jest --maxWorkers=2 && npm run lint
```

Expected: web vitest all green, `tsc -b` silent; mobile jest green and ESLint `0 problems`
(mobile runs `--max-warnings 0`).

- [ ] **Step 10: Commit**

```bash
CORE=$(ls -d packages/core 2>/dev/null || echo edutumobile/packages/core)
git add "$CORE/src/realtime/groupChannel.ts" "$CORE/src/types/presence.ts" \
        "$CORE/src/index.ts" "$CORE/package.json" "$CORE/src/hooks" \
        edutu-web-app/src/test/__tests__/groupChannel.test.ts
git commit -m "refactor(communities): single ref-counted realtime channel per on-screen group"
```

---

## Task 5: `useGroupPresence` — presence + typing that degrade silently

**Files:**
- Create: `<CORE>/src/hooks/useGroupPresence.ts`
- Modify: `<CORE>/src/index.ts`
- Create: `edutu-web-app/src/test/__tests__/groupPresence.test.ts`

**Interfaces:**
- Consumes: `acquireGroupChannel`, `GroupPresenceMember`, `GroupPresenceState` (Task 4).
- Produces:
  ```ts
  export const PRESENCE_MAX_MEMBERS = 200;
  export const TYPING_BROADCAST_THROTTLE_MS = 4000;
  export const TYPING_EXPIRY_MS = 6000;
  export function useGroupPresence(
    supabase: SupabaseClient,
    groupId: string,
    me: { userId: string; displayName: string; avatarUrl: string | null } | null,
    options?: { memberCount?: number },
  ): GroupPresenceState & { setTyping: () => void };
  ```

### Cost / limit note — read before implementing (spec §13, risk 1)

Presence and typing are the only features in this slice that consume a metered Supabase resource.
Two ceilings apply, and **the message ceiling binds long before the connection ceiling**:

| Ceiling | Supabase Pro default | What consumes it |
|---|---|---|
| Concurrent Realtime connections | **500** (raisable to 10,000 on request / higher tiers) | one per user with a group screen **open** — never one per joined group |
| Realtime messages / month | **5,000,000** | presence diffs and typing broadcasts fan out to *every* subscriber on the topic |

*Connections.* One channel per on-screen group means concurrent connections ≈ users currently looking
at a group. At a typical 2–4 % "in a chat screen right now" share of DAU, the 500-connection default
covers roughly **12,000–25,000 DAU**. If Slice 2 had kept a channel per joined group (≈20 per user),
the same 500 slots would be exhausted at ~25 concurrent users — which is why constraint #3 exists.

*Messages.* Fan-out is O(subscribers). One user opening a 25-member group emits a presence join diff
to 25 subscribers, and a leave diff on close: ~50 messages per visit. Each typing broadcast costs
another 25. Two typing bursts per visit ⇒ **~100 realtime messages per group visit**. The 5 M monthly
allowance therefore supports **~50,000 group visits/month ≈ 1,600/day** before overage. Hence three
non-negotiable guards, all implemented below:

1. **Typing is throttled to one broadcast per user per `TYPING_BROADCAST_THROTTLE_MS` (4 s).** Without
   this a fast typist emits ~5 events/second × N subscribers.
2. **Presence and typing switch off entirely above `PRESENCE_MAX_MEMBERS` (200).** Fan-out is
   O(N) per event and O(N²) per group churn cycle; a 1,000-member group would burn the monthly allowance
   on its own. Above the cap the UI simply shows the member count, which is what users read anyway.
3. **Everything degrades silently.** `degraded === true` renders nothing, and **`setTyping()` and
   presence failures can never block or delay a message send** — sending is a plain backend POST in
   Slice 2 and this hook is not in its path.

Monitoring: Supabase Dashboard → Reports → Realtime (concurrent peak connections, messages/day). Add
an alert at 60 % of both. If concurrent connections approach the limit, raise the quota before
touching the code — the write path is already backend-owned, so the fan-out layer is swappable.

- [ ] **Step 1: Write the failing presence tests**

Create `edutu-web-app/src/test/__tests__/groupPresence.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useGroupPresence,
  PRESENCE_MAX_MEMBERS,
  TYPING_BROADCAST_THROTTLE_MS,
  TYPING_EXPIRY_MS,
  __resetGroupChannelRegistry,
} from '@edutu/core';

type Handler = (...args: unknown[]) => void;

function makeSupabase(options: { failSubscribe?: boolean } = {}) {
  const bindings: Array<{ type: string; filter: unknown; handler: Handler }> = [];
  const channel = {
    topic: '',
    presence: {} as Record<string, unknown[]>,
    tracked: [] as unknown[],
    untracked: 0,
    sent: [] as unknown[],
    on(type: string, filter: unknown, handler: Handler) {
      bindings.push({ type, filter, handler });
      return this;
    },
    subscribe() {
      if (options.failSubscribe) throw new Error('binding error');
      return this;
    },
    presenceState() { return this.presence; },
    track(payload: unknown) { this.tracked.push(payload); return Promise.resolve('ok'); },
    untrack() { this.untracked += 1; return Promise.resolve('ok'); },
    send(payload: unknown) { this.sent.push(payload); return Promise.resolve('ok'); },
  };
  const supabase = {
    channel: vi.fn((name: string) => { channel.topic = `realtime:${name}`; return channel; }),
    getChannels: vi.fn(() => []),
    removeChannel: vi.fn(() => Promise.resolve('ok')),
  };
  return { supabase, channel, bindings };
}

const me = { userId: 'u-me', displayName: 'Amara', avatarUrl: null };

describe('useGroupPresence', () => {
  beforeEach(() => { __resetGroupChannelRegistry(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('tracks the current user and reports everyone the channel reports', () => {
    const { supabase, channel, bindings } = makeSupabase();
    channel.presence = {
      k1: [{ userId: 'u-me', displayName: 'Amara', avatarUrl: null, at: 1 }],
      k2: [{ userId: 'u-2', displayName: 'Kwame', avatarUrl: null, at: 2 }],
    };

    const { result } = renderHook(() =>
      useGroupPresence(supabase as never, 'g1', me, { memberCount: 12 }),
    );

    expect(result.current.enabled).toBe(true);
    expect(channel.tracked).toHaveLength(1);
    expect(channel.tracked[0]).toMatchObject({ userId: 'u-me', displayName: 'Amara' });

    const sync = bindings.find((b) => b.type === 'presence')!;
    act(() => { sync.handler(); });
    expect(result.current.online.map((m) => m.userId)).toEqual(['u-me', 'u-2']);
  });

  it('is disabled (and tracks nothing) above PRESENCE_MAX_MEMBERS', () => {
    const { supabase, channel } = makeSupabase();
    const { result } = renderHook(() =>
      useGroupPresence(supabase as never, 'g1', me, { memberCount: PRESENCE_MAX_MEMBERS + 1 }),
    );
    expect(result.current.enabled).toBe(false);
    expect(result.current.online).toEqual([]);
    expect(channel.tracked).toHaveLength(0);
  });

  it('is disabled when signed out', () => {
    const { supabase, channel } = makeSupabase();
    const { result } = renderHook(() =>
      useGroupPresence(supabase as never, 'g1', null, { memberCount: 5 }),
    );
    expect(result.current.enabled).toBe(false);
    expect(channel.tracked).toHaveLength(0);
  });

  it('degrades silently when the channel cannot subscribe — and setTyping never throws', () => {
    const { supabase, channel } = makeSupabase({ failSubscribe: true });
    const { result } = renderHook(() =>
      useGroupPresence(supabase as never, 'g1', me, { memberCount: 12 }),
    );
    expect(result.current.degraded).toBe(true);
    expect(result.current.online).toEqual([]);
    expect(() => act(() => result.current.setTyping())).not.toThrow();
    expect(channel.sent).toHaveLength(0);
  });

  it('throttles typing broadcasts to one per TYPING_BROADCAST_THROTTLE_MS', () => {
    const { supabase, channel } = makeSupabase();
    const { result } = renderHook(() =>
      useGroupPresence(supabase as never, 'g1', me, { memberCount: 12 }),
    );

    act(() => { result.current.setTyping(); result.current.setTyping(); result.current.setTyping(); });
    expect(channel.sent).toHaveLength(1);

    act(() => { vi.advanceTimersByTime(TYPING_BROADCAST_THROTTLE_MS + 1); result.current.setTyping(); });
    expect(channel.sent).toHaveLength(2);
  });

  it('expires a typing indicator after TYPING_EXPIRY_MS and ignores my own', () => {
    const { supabase, bindings } = makeSupabase();
    const { result } = renderHook(() =>
      useGroupPresence(supabase as never, 'g1', me, { memberCount: 12 }),
    );
    const typing = bindings.find((b) => b.type === 'broadcast')!;

    act(() => { typing.handler({ payload: { userId: 'u-2', displayName: 'Kwame' } }); });
    expect(result.current.typing.map((m) => m.userId)).toEqual(['u-2']);

    act(() => { typing.handler({ payload: { userId: 'u-me', displayName: 'Amara' } }); });
    expect(result.current.typing.map((m) => m.userId)).toEqual(['u-2']);

    act(() => { vi.advanceTimersByTime(TYPING_EXPIRY_MS + 1100); });
    expect(result.current.typing).toEqual([]);
  });

  it('untracks and releases the channel on unmount', () => {
    const { supabase, channel } = makeSupabase();
    const { unmount } = renderHook(() =>
      useGroupPresence(supabase as never, 'g1', me, { memberCount: 12 }),
    );
    unmount();
    expect(channel.untracked).toBe(1);
    expect(supabase.removeChannel).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app && npx vitest run src/test/__tests__/groupPresence.test.ts`

Expected: FAIL — `"useGroupPresence" is not exported by "@edutu/core"`

- [ ] **Step 3: Write the hook**

Create `<CORE>/src/hooks/useGroupPresence.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { acquireGroupChannel, type GroupChannelHandle } from '../realtime/groupChannel';
import type { GroupPresenceMember, GroupPresenceState } from '../types/presence';

/** Above this member count the O(N) fan-out per presence/typing event costs more
 *  than the feature is worth — see the cost note in the Slice 5 plan. */
export const PRESENCE_MAX_MEMBERS = 200;
export const TYPING_BROADCAST_THROTTLE_MS = 4000;
export const TYPING_EXPIRY_MS = 6000;

const TYPING_SWEEP_MS = 1000;

export interface GroupPresenceIdentity {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

/**
 * Presence + typing for the on-screen group, riding the SAME channel the
 * message stream uses (Task 4's registry). Never opens a channel of its own.
 *
 * Everything here is best-effort: if realtime is unavailable the hook returns
 * `degraded: true` with empty lists, and `setTyping()` is a no-op. Message
 * sending goes through the backend and is untouched by any of this.
 */
export function useGroupPresence(
  supabase: SupabaseClient,
  groupId: string,
  me: GroupPresenceIdentity | null,
  options: { memberCount?: number } = {},
): GroupPresenceState & { setTyping: () => void } {
  const memberCount = Number(options.memberCount ?? 0);
  const enabled = Boolean(me?.userId) && groupId.length > 0 && memberCount <= PRESENCE_MAX_MEMBERS;

  const [online, setOnline] = useState<GroupPresenceMember[]>([]);
  const [typingMap, setTypingMap] = useState<Record<string, GroupPresenceMember>>({});
  const [degraded, setDegraded] = useState(false);

  // Refs so the subscribe effect can depend on [supabase, groupId] alone.
  const enabledRef = useRef(enabled);
  const meRef = useRef(me);
  const handleRef = useRef<GroupChannelHandle | null>(null);
  const lastTypingSentRef = useRef(0);

  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { meRef.current = me; }, [me]);

  useEffect(() => {
    if (!groupId) return;

    const handle = acquireGroupChannel(supabase, groupId, {
      onPresenceSync: (members) => {
        if (!enabledRef.current) return;
        setOnline(members);
      },
      onTyping: (event) => {
        if (!enabledRef.current) return;
        if (event.userId === meRef.current?.userId) return;
        setTypingMap((previous) => ({
          ...previous,
          [event.userId]: {
            userId: event.userId,
            displayName: event.displayName,
            avatarUrl: null,
            at: event.at,
          },
        }));
      },
    });

    handleRef.current = handle;
    setDegraded(handle.degraded);

    const identity = meRef.current;
    if (enabledRef.current && identity) {
      handle.trackPresence({ ...identity, at: Date.now() });
    }

    return () => {
      handle.untrackPresence();
      handle.release();
      handleRef.current = null;
      setOnline([]);
      setTypingMap({});
    };
  }, [supabase, groupId]);

  // Typing entries expire on their own; a sweep is cheaper than a timer each.
  useEffect(() => {
    const timer = setInterval(() => {
      const cutoff = Date.now() - TYPING_EXPIRY_MS;
      setTypingMap((previous) => {
        const next: Record<string, GroupPresenceMember> = {};
        let changed = false;
        for (const [userId, member] of Object.entries(previous)) {
          if (member.at >= cutoff) next[userId] = member;
          else changed = true;
        }
        return changed ? next : previous;
      });
    }, TYPING_SWEEP_MS);
    return () => clearInterval(timer);
  }, []);

  const setTyping = useCallback(() => {
    if (!enabledRef.current) return;
    const identity = meRef.current;
    const handle = handleRef.current;
    if (!identity || !handle || handle.degraded) return;

    const now = Date.now();
    if (now - lastTypingSentRef.current < TYPING_BROADCAST_THROTTLE_MS) return;
    lastTypingSentRef.current = now;
    handle.broadcastTyping({ userId: identity.userId, displayName: identity.displayName });
  }, []);

  return {
    online: enabled && !degraded ? online : [],
    typing: enabled && !degraded ? Object.values(typingMap) : [],
    degraded,
    enabled,
    setTyping,
  };
}
```

- [ ] **Step 4: Export it**

Add to `<CORE>/src/index.ts`:

```ts
export * from './hooks/useGroupPresence';
```

and to the `exports` map in `<CORE>/package.json`:

```json
    "./hooks/useGroupPresence": {
      "types": "./src/hooks/useGroupPresence.ts",
      "default": "./src/hooks/useGroupPresence.ts",
      "react-native": "./src/hooks/useGroupPresence.ts"
    },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app && npx vitest run src/test/__tests__/groupPresence.test.ts`

Expected: PASS — `Tests 7 passed`

- [ ] **Step 6: Verify the React Compiler is happy on mobile**

Run: `cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile && npm run lint`

Expected: `0 problems`. (Mobile runs `--max-warnings 0`; the hook has no conditional hooks and mutates
nothing during render — every mutation is inside an effect or a callback.)

- [ ] **Step 7: Commit**

```bash
CORE=$(ls -d packages/core 2>/dev/null || echo edutumobile/packages/core)
git add "$CORE/src/hooks/useGroupPresence.ts" "$CORE/src/index.ts" "$CORE/package.json" \
        edutu-web-app/src/test/__tests__/groupPresence.test.ts
git commit -m "feat(communities): presence and typing on the shared group channel, degrading silently"
```

---

## Task 6: Presence UI — web and mobile

**Files:**
- Create: `edutu-web-app/src/components/communities/GroupPresenceBar.tsx`
- Create: `edutumobile/components/communities/GroupPresenceBar.tsx`
- Modify: Slice 2's web group page and mobile group screen (one mount each)
- Create: `edutu-web-app/src/test/__tests__/groupPresenceBar.test.tsx`

**Interfaces:**
- Consumes: `useGroupPresence`, `GroupPresenceMember` (Task 5).
- Produces: `<GroupPresenceBar groupId memberCount me supabase />` in both apps. Renders `null` when
  presence is disabled or degraded, so no caller needs a conditional.

- [ ] **Step 1: Write the failing web component test**

Create `edutu-web-app/src/test/__tests__/groupPresenceBar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const presence = vi.hoisted(() => ({ value: {
  online: [] as Array<{ userId: string; displayName: string; avatarUrl: string | null; at: number }>,
  typing: [] as Array<{ userId: string; displayName: string; avatarUrl: string | null; at: number }>,
  degraded: false,
  enabled: true,
  setTyping: () => undefined,
} }));

vi.mock('@edutu/core', () => ({
  useGroupPresence: () => presence.value,
  PRESENCE_MAX_MEMBERS: 200,
}));

import GroupPresenceBar from '../../components/communities/GroupPresenceBar';

const props = {
  supabase: {} as never,
  groupId: 'g1',
  memberCount: 12,
  me: { userId: 'u-me', displayName: 'Amara', avatarUrl: null },
};

describe('GroupPresenceBar', () => {
  it('renders nothing while degraded', () => {
    presence.value = { ...presence.value, degraded: true, online: [] };
    const { container } = render(<GroupPresenceBar {...props} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when presence is disabled', () => {
    presence.value = { ...presence.value, degraded: false, enabled: false };
    const { container } = render(<GroupPresenceBar {...props} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the online count', () => {
    presence.value = {
      ...presence.value, degraded: false, enabled: true,
      online: [
        { userId: 'u-me', displayName: 'Amara', avatarUrl: null, at: 1 },
        { userId: 'u-2', displayName: 'Kwame', avatarUrl: null, at: 2 },
      ],
      typing: [],
    };
    render(<GroupPresenceBar {...props} />);
    expect(screen.getByText('2 online')).toBeInTheDocument();
  });

  it('names up to two typists and summarises beyond that', () => {
    const typing = [
      { userId: 'a', displayName: 'Kwame', avatarUrl: null, at: 1 },
      { userId: 'b', displayName: 'Zainab', avatarUrl: null, at: 2 },
      { userId: 'c', displayName: 'Tunde', avatarUrl: null, at: 3 },
    ];
    presence.value = { ...presence.value, enabled: true, degraded: false, online: [], typing };
    render(<GroupPresenceBar {...props} />);
    expect(screen.getByText('Kwame, Zainab and 1 other are typing…')).toBeInTheDocument();
  });

  it('uses the singular form for one typist', () => {
    presence.value = {
      ...presence.value, enabled: true, degraded: false, online: [],
      typing: [{ userId: 'a', displayName: 'Kwame', avatarUrl: null, at: 1 }],
    };
    render(<GroupPresenceBar {...props} />);
    expect(screen.getByText('Kwame is typing…')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app && npx vitest run src/test/__tests__/groupPresenceBar.test.tsx`

Expected: FAIL — `Failed to resolve import "../../components/communities/GroupPresenceBar"`

- [ ] **Step 3: Write the web component**

Create `edutu-web-app/src/components/communities/GroupPresenceBar.tsx`:

```tsx
import type { FC } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useGroupPresence } from '@edutu/core';

interface GroupPresenceBarProps {
  supabase: SupabaseClient;
  groupId: string;
  memberCount: number;
  me: { userId: string; displayName: string; avatarUrl: string | null } | null;
}

/** "Kwame is typing…" / "Kwame, Zainab and 2 others are typing…" */
function typingLine(names: string[]): string {
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  const rest = names.length - 2;
  return `${names[0]}, ${names[1]} and ${rest} other${rest === 1 ? '' : 's'} are typing…`;
}

function initials(displayName: string): string {
  return displayName.trim().slice(0, 1).toUpperCase() || '?';
}

/**
 * Live "who's here" strip. Renders null whenever presence is off or degraded,
 * so the group page never has to branch — and a realtime outage is invisible.
 */
const GroupPresenceBar: FC<GroupPresenceBarProps> = ({ supabase, groupId, memberCount, me }) => {
  const { online, typing, degraded, enabled } = useGroupPresence(supabase, groupId, me, {
    memberCount,
  });

  if (!enabled || degraded) return null;
  if (online.length === 0 && typing.length === 0) return null;

  const avatars = online.slice(0, 5);

  return (
    <div
      className="flex items-center gap-3 border-b border-subtle px-4 py-2"
      aria-live="polite"
    >
      {avatars.length > 0 && (
        <div className="flex -space-x-2" aria-hidden="true">
          {avatars.map((member) =>
            member.avatarUrl ? (
              <img
                key={member.userId}
                src={member.avatarUrl}
                alt=""
                className="h-6 w-6 rounded-full border border-subtle object-cover"
              />
            ) : (
              <span
                key={member.userId}
                className="flex h-6 w-6 items-center justify-center rounded-full border border-subtle bg-surface-muted text-[10px] font-semibold text-text-secondary"
              >
                {initials(member.displayName)}
              </span>
            ),
          )}
        </div>
      )}

      {online.length > 0 && (
        <span className="text-xs font-medium text-text-secondary">
          {online.length} online
        </span>
      )}

      {typing.length > 0 && (
        <span className="text-xs italic text-brand">
          {typingLine(typing.map((member) => member.displayName))}
        </span>
      )}
    </div>
  );
};

export default GroupPresenceBar;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app && npx vitest run src/test/__tests__/groupPresenceBar.test.tsx`

Expected: PASS — `Tests 5 passed`

- [ ] **Step 5: Mount it on the web group page and wire the composer**

Find Slice 2's group page:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
grep -rln "communities/g/" src/App.tsx src/components | head
```

In that page component, add the import and render the bar directly above the message list:

```tsx
import GroupPresenceBar from './communities/GroupPresenceBar';
```

```tsx
<GroupPresenceBar
  supabase={supabase}
  groupId={group.id}
  memberCount={group.memberCount}
  me={
    user
      ? {
          userId: user.id,
          displayName: user.fullName ?? user.username ?? 'Member',
          avatarUrl: user.imageUrl ?? null,
        }
      : null
  }
/>
```

To emit typing, lift the hook into the page and pass `setTyping` to the composer's `onChange`:

```tsx
const { setTyping } = useGroupPresence(supabase, group.id, meIdentity, {
  memberCount: group.memberCount,
});
```

```tsx
<textarea
  value={draft}
  onChange={(event) => { setDraft(event.target.value); setTyping(); }}
  /* ...existing props unchanged... */
/>
```

`setTyping()` is throttled and non-blocking; it must never be awaited and must never gate the send
button's `onClick`.

- [ ] **Step 6: Write the mobile component**

Create `edutumobile/components/communities/GroupPresenceBar.tsx`:

```tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useGroupPresence } from '@edutu/core';
import { useTranslation } from 'react-i18next';

interface GroupPresenceBarProps {
  supabase: SupabaseClient;
  groupId: string;
  memberCount: number;
  me: { userId: string; displayName: string; avatarUrl: string | null } | null;
}

export default function GroupPresenceBar({
  supabase,
  groupId,
  memberCount,
  me,
}: GroupPresenceBarProps) {
  const { t } = useTranslation();
  const { online, typing, degraded, enabled } = useGroupPresence(supabase, groupId, me, {
    memberCount,
  });

  if (!enabled || degraded) return null;
  if (online.length === 0 && typing.length === 0) return null;

  const names = typing.map((member) => member.displayName);
  const typingText =
    names.length === 0
      ? null
      : names.length === 1
        ? t('communities.typingOne', { name: names[0], defaultValue: '{{name}} is typing…' })
        : t('communities.typingMany', {
            count: names.length,
            defaultValue: '{{count}} people are typing…',
          });

  return (
    <View style={styles.container}>
      {online.length > 0 && (
        <Text style={styles.online}>
          {t('communities.onlineCount', {
            count: online.length,
            defaultValue: '{{count}} online',
          })}
        </Text>
      )}
      {typingText ? <Text style={styles.typing}>{typingText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  online: { fontSize: 12, fontWeight: '600', opacity: 0.7 },
  typing: { fontSize: 12, fontStyle: 'italic', opacity: 0.8 },
});
```

- [ ] **Step 7: Add the three i18n keys to all nine locales**

The `defaultValue` fallbacks above mean a missing key degrades to English rather than showing the raw
key, but ship the translations anyway. Locate the locale files:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile
ls locales/*/translation.json 2>/dev/null || find . -name "*.json" -path "*locale*" -not -path "*/node_modules/*" | head
```

Add under the existing `communities` object in each of the nine locales
(`en, fr, pt, ar, ha, hi, sw, es, zh` — there is **no `de`**):

| key | en | fr | pt | es | sw | ha | hi | zh | ar |
|---|---|---|---|---|---|---|---|---|---|
| `communities.onlineCount` | `{{count}} online` | `{{count}} en ligne` | `{{count}} online` | `{{count}} en línea` | `{{count}} mtandaoni` | `{{count}} suna kan layi` | `{{count}} ऑनलाइन` | `{{count}} 人在线` | `{{count}} متصل` |
| `communities.typingOne` | `{{name}} is typing…` | `{{name}} écrit…` | `{{name}} está a escrever…` | `{{name}} está escribiendo…` | `{{name}} anaandika…` | `{{name}} yana rubutu…` | `{{name}} लिख रहे हैं…` | `{{name}} 正在输入…` | `{{name}} يكتب…` |
| `communities.typingMany` | `{{count}} people are typing…` | `{{count}} personnes écrivent…` | `{{count}} pessoas estão a escrever…` | `{{count}} personas están escribiendo…` | `Watu {{count}} wanaandika…` | `Mutane {{count}} suna rubutu…` | `{{count}} लोग लिख रहे हैं…` | `{{count}} 人正在输入…` | `{{count}} أشخاص يكتبون…` |

`ar`, `ha`, `hi` and `sw` mix 2- and 4-space indentation — hand-edit those four to match the
surrounding block, then regenerate:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile && node gen-i18n-resources.js
```

Expected: `Generated i18n resources for 9 locales.`

- [ ] **Step 8: Mount on the mobile group screen**

In `edutumobile/app/(app)/communities/[groupId].tsx`, import and render the bar directly above the
message list, and call `setTyping()` from the composer's `onChangeText` exactly as in Step 5.

- [ ] **Step 9: Verify both apps**

Run:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app && npx vitest run && npm run lint && npm run typecheck
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile && npx jest --maxWorkers=2 && npm run lint && npm run typecheck
```

Expected: all green; both ESLint runs `0 problems`; both type-checks silent.

- [ ] **Step 10: Commit**

```bash
git add edutu-web-app/src/components/communities/GroupPresenceBar.tsx \
        edutu-web-app/src/test/__tests__/groupPresenceBar.test.tsx \
        edutumobile/components/communities/GroupPresenceBar.tsx \
        edutumobile/locales edutumobile/app "edutu-web-app/src/components"
git commit -m "feat(communities): presence and typing indicators on web and mobile group screens"
```

---

## Task 7: Search client and UI — `@edutu/core` service, web panel, mobile screen

**Files:**
- Create: `<CORE>/src/types/communitySearch.ts`
- Create: `<CORE>/src/services/communitySearch.ts`
- Modify: `<CORE>/src/index.ts`, `<CORE>/package.json`
- Create: `edutu-web-app/src/components/communities/CommunitySearchPanel.tsx`
- Create: `edutu-web-app/src/test/__tests__/communitySearchPanel.test.tsx`
- Create: `edutumobile/app/(app)/communities/search.tsx`
- Create: `edutumobile/__tests__/communitySearchScreen.test.tsx`

**Interfaces:**
- Consumes: `GET /communities/search` (Task 2), `getJson` from `<CORE>/src/services/httpClient.ts`.
- Produces:
  ```ts
  export interface GroupLineage { id: string; slug: string; name: string }
  export interface CommunitySearchHit {
    groupId: string; slug: string; name: string; description: string | null;
    iconUrl: string | null; spaceId: string;
    visibility: 'public' | 'unlisted' | 'private';
    status: 'active' | 'archived' | 'suspended';
    memberCount: number; opportunityId: string | null;
    matchedOn: Array<'name' | 'description' | 'brief'>;
    snippet: string | null; score: number; isMember: boolean;
    carriedForwardFrom: GroupLineage | null;
  }
  export interface CommunitySearchResponse { query: string; hits: CommunitySearchHit[]; degraded: boolean }
  export function searchCommunities(input: {
    baseUrl: string; token: string | null; q: string;
    space?: string; limit?: number; offset?: number; signal?: AbortSignal;
  }): Promise<CommunitySearchResponse>;
  ```

- [ ] **Step 1: Write the shared types**

Create `<CORE>/src/types/communitySearch.ts`:

```ts
/** The previous cycle a group was carried forward from (Slice 5). */
export interface GroupLineage {
  id: string;
  slug: string;
  name: string;
}

export type CommunitySearchLeg = 'name' | 'description' | 'brief';

export interface CommunitySearchHit {
  groupId: string;
  slug: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  spaceId: string;
  visibility: 'public' | 'unlisted' | 'private';
  status: 'active' | 'archived' | 'suspended';
  memberCount: number;
  opportunityId: string | null;
  matchedOn: CommunitySearchLeg[];
  snippet: string | null;
  score: number;
  isMember: boolean;
  carriedForwardFrom: GroupLineage | null;
}

export interface CommunitySearchResponse {
  query: string;
  hits: CommunitySearchHit[];
  /** true when the backend served the ILIKE fallback (migration not applied). */
  degraded: boolean;
}
```

- [ ] **Step 2: Write the failing client test**

Create `edutu-web-app/src/test/__tests__/communitySearchService.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchCommunities } from '@edutu/core';

const emptyResponse = { query: 'chevening', hits: [], degraded: false };

afterEach(() => { vi.unstubAllGlobals(); });

describe('searchCommunities', () => {
  it('returns an empty result without a network call for a short query', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await searchCommunities({ baseUrl: 'https://api.test', token: 't', q: ' a ' });

    expect(result).toEqual({ query: 'a', hits: [], degraded: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('builds an encoded query and sends the bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => emptyResponse,
    });
    vi.stubGlobal('fetch', fetchMock);

    await searchCommunities({
      baseUrl: 'https://api.test/', token: 'tok123',
      q: 'chevening 2027', space: 'space-1', limit: 10, offset: 20,
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      'https://api.test/communities/search?q=chevening+2027&space=space-1&limit=10&offset=20',
    );
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok123');
  });

  it('degrades to an empty result rather than throwing on a failed request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const result = await searchCommunities({ baseUrl: 'https://api.test', token: 't', q: 'chevening' });
    expect(result).toEqual({ query: 'chevening', hits: [], degraded: true });
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app && npx vitest run src/test/__tests__/communitySearchService.test.ts`

Expected: FAIL — `"searchCommunities" is not exported by "@edutu/core"`

- [ ] **Step 4: Write the client**

Create `<CORE>/src/services/communitySearch.ts`:

```ts
import { fetchWithTimeout } from './httpClient';
import type { CommunitySearchResponse } from '../types/communitySearch';

export interface SearchCommunitiesInput {
  baseUrl: string;
  token: string | null;
  q: string;
  space?: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

/**
 * GET /communities/search. Search is a comfort feature: a backend hiccup must
 * show "no results", never an error screen mid-typing.
 */
export async function searchCommunities(
  input: SearchCommunitiesInput,
): Promise<CommunitySearchResponse> {
  const q = String(input.q ?? '').trim();
  if (q.length < 2) return { query: q, hits: [], degraded: false };

  const url = new URL('/communities/search', `${input.baseUrl.replace(/\/$/, '')}/`);
  url.searchParams.set('q', q);
  if (input.space) url.searchParams.set('space', input.space);
  if (input.limit) url.searchParams.set('limit', String(input.limit));
  if (input.offset) url.searchParams.set('offset', String(input.offset));

  try {
    const response = await fetchWithTimeout(
      url.toString(),
      {
        headers: {
          Accept: 'application/json',
          ...(input.token ? { Authorization: `Bearer ${input.token}` } : {}),
        },
        signal: input.signal,
      },
      9000,
    );
    if (!response.ok) return { query: q, hits: [], degraded: true };
    return (await response.json()) as CommunitySearchResponse;
  } catch {
    return { query: q, hits: [], degraded: true };
  }
}
```

- [ ] **Step 5: Export the new modules**

Add to `<CORE>/src/index.ts`:

```ts
export * from './types/communitySearch';
export * from './services/communitySearch';
```

and the two `exports` entries in `<CORE>/package.json`:

```json
    "./types/communitySearch": {
      "types": "./src/types/communitySearch.ts",
      "default": "./src/types/communitySearch.ts",
      "react-native": "./src/types/communitySearch.ts"
    },
    "./services/communitySearch": {
      "types": "./src/services/communitySearch.ts",
      "default": "./src/services/communitySearch.ts",
      "react-native": "./src/services/communitySearch.ts"
    },
```

- [ ] **Step 6: Run the client test to verify it passes**

Run: `cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app && npx vitest run src/test/__tests__/communitySearchService.test.ts`

Expected: PASS — `Tests 3 passed`

- [ ] **Step 7: Write the failing web panel test**

Create `edutu-web-app/src/test/__tests__/communitySearchPanel.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const searchMock = vi.hoisted(() => vi.fn());
vi.mock('@edutu/core', () => ({ searchCommunities: searchMock }));
vi.mock('@clerk/clerk-react', () => ({ useAuth: () => ({ getToken: async () => 'tok' }) }));
vi.mock('../../lib/apiBaseUrl', () => ({ getApiBaseUrl: () => 'https://api.test' }));

import CommunitySearchPanel from '../../components/communities/CommunitySearchPanel';

const hit = {
  groupId: 'g1', slug: 'chevening-2027', name: 'Chevening 2027',
  description: 'Crew for the 2027 cycle', iconUrl: null, spaceId: 's1',
  visibility: 'public' as const, status: 'active' as const, memberCount: 42,
  opportunityId: null, matchedOn: ['name' as const], snippet: 'Crew for the 2027 cycle',
  score: 0.03, isMember: false,
  carriedForwardFrom: { id: 'g0', slug: 'chevening-2026', name: 'Chevening 2026' },
};

describe('CommunitySearchPanel', () => {
  beforeEach(() => { searchMock.mockReset(); });

  it('does not search until two characters are typed', async () => {
    render(<MemoryRouter><CommunitySearchPanel /></MemoryRouter>);
    await userEvent.type(screen.getByRole('searchbox'), 'c');
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(searchMock).not.toHaveBeenCalled();
  });

  it('renders hits with their lineage chip', async () => {
    searchMock.mockResolvedValue({ query: 'chevening', hits: [hit], degraded: false });
    render(<MemoryRouter><CommunitySearchPanel /></MemoryRouter>);
    await userEvent.type(screen.getByRole('searchbox'), 'chevening');

    await waitFor(() => expect(screen.getByText('Chevening 2027')).toBeInTheDocument());
    expect(screen.getByText('42 members')).toBeInTheDocument();
    expect(screen.getByText('Carried forward from Chevening 2026')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Chevening 2027/ })).toHaveAttribute(
      'href', '/communities/g/chevening-2027',
    );
  });

  it('shows an empty state when nothing matches', async () => {
    searchMock.mockResolvedValue({ query: 'zzz', hits: [], degraded: false });
    render(<MemoryRouter><CommunitySearchPanel /></MemoryRouter>);
    await userEvent.type(screen.getByRole('searchbox'), 'zzzz');
    await waitFor(() =>
      expect(screen.getByText('No groups match that yet.')).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 8: Run it to verify it fails**

Run: `cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app && npx vitest run src/test/__tests__/communitySearchPanel.test.tsx`

Expected: FAIL — `Failed to resolve import "../../components/communities/CommunitySearchPanel"`

- [ ] **Step 9: Write the web panel**

Create `edutu-web-app/src/components/communities/CommunitySearchPanel.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import type { FC } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { searchCommunities, type CommunitySearchHit } from '@edutu/core';
import { getApiBaseUrl } from '../../lib/apiBaseUrl';

const DEBOUNCE_MS = 250;

/**
 * Discover-tab search across group names, descriptions and Brief content.
 * The backend already scopes results to what this caller may see, so nothing
 * here filters — filtering in the client would be a leak waiting to happen.
 */
const CommunitySearchPanel: FC<{ spaceId?: string }> = ({ spaceId }) => {
  const { getToken } = useAuth();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<CommunitySearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setHits([]);
      setSearched(false);
      return;
    }

    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setSearching(true);

      void (async () => {
        const token = await getToken().catch(() => null);
        const result = await searchCommunities({
          baseUrl: getApiBaseUrl('Communities search'),
          token,
          q: term,
          space: spaceId,
          limit: 20,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setHits(result.hits);
        setSearched(true);
        setSearching(false);
      })();
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [query, spaceId, getToken]);

  return (
    <section className="space-y-3">
      <label className="sr-only" htmlFor="community-search">
        Search groups
      </label>
      <input
        id="community-search"
        type="search"
        role="searchbox"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search groups — try “Chevening 2027”"
        className="w-full rounded-xl border border-subtle bg-surface-raised px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
      />

      {searching && <p className="text-xs text-text-muted">Searching…</p>}

      {!searching && searched && hits.length === 0 && (
        <p className="text-sm text-text-secondary">No groups match that yet.</p>
      )}

      <ul className="space-y-2">
        {hits.map((hit) => (
          <li key={hit.groupId}>
            <Link
              to={`/communities/g/${hit.slug}`}
              className="block rounded-xl border border-subtle bg-surface-raised p-4 transition hover:border-brand"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-text-primary">{hit.name}</span>
                <span className="shrink-0 text-xs text-text-muted">
                  {hit.memberCount} members
                </span>
              </div>

              {hit.snippet && (
                <p className="mt-1 line-clamp-2 text-sm text-text-secondary">{hit.snippet}</p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {hit.status === 'archived' && (
                  <span className="rounded-full border border-subtle px-2 py-0.5 text-[11px] text-text-muted">
                    Archived
                  </span>
                )}
                {hit.matchedOn.includes('brief') && (
                  <span className="rounded-full border border-subtle px-2 py-0.5 text-[11px] text-brand">
                    Matched in the Brief
                  </span>
                )}
                {hit.carriedForwardFrom && (
                  <span className="rounded-full border border-subtle px-2 py-0.5 text-[11px] text-text-muted">
                    Carried forward from {hit.carriedForwardFrom.name}
                  </span>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default CommunitySearchPanel;
```

- [ ] **Step 10: Run the panel test to verify it passes**

Run: `cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app && npx vitest run src/test/__tests__/communitySearchPanel.test.tsx`

Expected: PASS — `Tests 3 passed`

- [ ] **Step 11: Mount the panel on the Discover section**

In Slice 2's `/communities` page, import and render it at the top of the Discover section:

```tsx
import CommunitySearchPanel from './communities/CommunitySearchPanel';
```

```tsx
<CommunitySearchPanel />
```

Find the file with:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
grep -rln "Discover" src/components/communities src/components | head
```

- [ ] **Step 12: Write the mobile search screen**

Create `edutumobile/app/(app)/communities/search.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { searchCommunities, type CommunitySearchHit } from '@edutu/core';
import { getApiBaseUrl } from '../../../lib/apiBaseUrl';

const DEBOUNCE_MS = 250;

export default function CommunitySearchScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { getToken } = useAuth();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<CommunitySearchHit[]>([]);
  const [searched, setSearched] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setHits([]);
      setSearched(false);
      return;
    }

    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      void (async () => {
        const token = await getToken().catch(() => null);
        const result = await searchCommunities({
          baseUrl: getApiBaseUrl(),
          token,
          q: term,
          limit: 20,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setHits(result.hits);
        setSearched(true);
      })();
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [query, getToken]);

  return (
    <View style={styles.container}>
      <TextInput
        testID="community-search-input"
        value={query}
        onChangeText={setQuery}
        placeholder={t('communities.searchPlaceholder', {
          defaultValue: 'Search groups — try “Chevening 2027”',
        })}
        autoCorrect={false}
        style={styles.input}
      />

      <FlatList
        data={hits}
        keyExtractor={(item) => item.groupId}
        ListEmptyComponent={
          searched ? (
            <Text style={styles.empty}>
              {t('communities.searchEmpty', { defaultValue: 'No groups match that yet.' })}
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => router.push(`/(app)/communities/${item.groupId}`)}
          >
            <Text style={styles.name}>{item.name}</Text>
            {item.snippet ? (
              <Text numberOfLines={2} style={styles.snippet}>
                {item.snippet}
              </Text>
            ) : null}
            {item.carriedForwardFrom ? (
              <Text style={styles.lineage}>
                {t('communities.carriedForwardFrom', {
                  name: item.carriedForwardFrom.name,
                  defaultValue: 'Carried forward from {{name}}',
                })}
              </Text>
            ) : null}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 12, gap: 12 },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  row: { paddingVertical: 12, gap: 4 },
  name: { fontSize: 15, fontWeight: '600' },
  snippet: { fontSize: 13, opacity: 0.75 },
  lineage: { fontSize: 12, opacity: 0.6 },
  empty: { paddingVertical: 24, textAlign: 'center', opacity: 0.7 },
});
```

Add `communities.searchPlaceholder`, `communities.searchEmpty` and `communities.carriedForwardFrom`
to all nine locales the same way as Task 6 Step 7, then re-run `node gen-i18n-resources.js`.

- [ ] **Step 13: Write the mobile screen test**

Create `edutumobile/__tests__/communitySearchScreen.test.tsx`:

```tsx
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const searchMock = jest.fn();
jest.mock('@edutu/core', () => ({ searchCommunities: (...args: unknown[]) => searchMock(...args) }));
jest.mock('@clerk/clerk-expo', () => ({ useAuth: () => ({ getToken: async () => 'tok' }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../lib/apiBaseUrl', () => ({ getApiBaseUrl: () => 'https://api.test' }));

import CommunitySearchScreen from '../app/(app)/communities/search';

describe('CommunitySearchScreen', () => {
  beforeEach(() => { jest.useFakeTimers(); searchMock.mockReset(); });
  afterEach(() => { jest.useRealTimers(); });

  it('searches after the debounce and renders hits', async () => {
    searchMock.mockResolvedValue({
      query: 'chevening',
      hits: [{
        groupId: 'g1', slug: 'chevening-2027', name: 'Chevening 2027',
        description: null, iconUrl: null, spaceId: 's1', visibility: 'public',
        status: 'active', memberCount: 42, opportunityId: null,
        matchedOn: ['name'], snippet: 'Crew for 2027', score: 1, isMember: false,
        carriedForwardFrom: { id: 'g0', slug: 'chevening-2026', name: 'Chevening 2026' },
      }],
      degraded: false,
    });

    const screen = render(<CommunitySearchScreen />);
    fireEvent.changeText(screen.getByTestId('community-search-input'), 'chevening');
    await act(async () => { jest.advanceTimersByTime(300); });

    await waitFor(() => expect(screen.getByText('Chevening 2027')).toBeTruthy());
    expect(screen.getByText('Carried forward from Chevening 2026')).toBeTruthy();
  });

  it('does not search for a one-character query', async () => {
    const screen = render(<CommunitySearchScreen />);
    fireEvent.changeText(screen.getByTestId('community-search-input'), 'c');
    await act(async () => { jest.advanceTimersByTime(500); });
    expect(searchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 14: Run everything**

Run:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app && npx vitest run && npm run lint && npm run typecheck
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile && npx jest --maxWorkers=2 communitySearchScreen && npm run lint && npm run typecheck
```

Expected: all green; both ESLint runs `0 problems`.

- [ ] **Step 15: Commit**

```bash
CORE=$(ls -d packages/core 2>/dev/null || echo edutumobile/packages/core)
git add "$CORE/src/types/communitySearch.ts" "$CORE/src/services/communitySearch.ts" \
        "$CORE/src/index.ts" "$CORE/package.json" \
        edutu-web-app/src/components/communities/CommunitySearchPanel.tsx \
        edutu-web-app/src/test/__tests__/communitySearchService.test.ts \
        edutu-web-app/src/test/__tests__/communitySearchPanel.test.tsx \
        edutumobile/app/\(app\)/communities/search.tsx \
        edutumobile/__tests__/communitySearchScreen.test.tsx \
        edutumobile/locales
git commit -m "feat(communities): group search UI on web and mobile"
```

---

## Task 8: Server-rendered, indexable group pages — `GET /og/group/:slug`

**Files:**
- Create: `backend/services/services/api/src/communities/spa-shell.ts`
- Create: `backend/services/services/api/src/communities/spa-shell.spec.ts`
- Create: `backend/services/services/api/src/communities/community-seo.service.ts`
- Create: `backend/services/services/api/src/communities/community-seo.service.spec.ts`
- Create: `backend/services/services/api/src/communities/community-group-og.controller.ts`
- Create: `backend/services/services/api/src/communities/community-group-og.controller.spec.ts`
- Modify: `backend/services/services/api/src/communities/communities.module.ts`
- Modify: `backend/services/services/api/src/app.controller.ts`
- Modify: `backend/services/services/api/src/app.module.ts` (only if `CommunitiesModule` is not imported yet)

**The pattern being followed:** `origin/main`'s `src/opportunities/og.controller.ts` +
`edutu-web-app/netlify/edge-functions/opportunity-og.ts`. This task copies that shipped design for
groups — it invents nothing. The response is the **deployed SPA shell with injected head meta**, with
the self-contained page kept only as the fallback. That is required because the Vercel rewrite must be
**unconditional** (see Task 9) — crawler-gated `has` rewrites are silently dropped on this deployment
— so real users hit this endpoint too and must get the real app.

> **Read the reference implementation from `origin/main`, not the working tree.** The stale branch's
> `src/opportunities/og.controller.ts` renders a standalone mini page and sets `X-Og-Source: backend/og`.
> `origin/main` is the shipped, shell-injecting version. Open it first:
>
> ```bash
> git show origin/main:backend/services/services/api/src/opportunities/og.controller.ts | less
> ```
>
> The parts this task mirrors, verbatim in behaviour:
> - `const OG_MARKER = "<!--edutu-og-->"` — **use this exact string**, so either controller's
>   loop guard also catches the other's output;
> - `getSpaShell()` — fetches **`${this.base}/`** (the root path, which is never rewritten to a
>   controller, so it cannot loop), 5-minute TTL, 4 s `AbortController` timeout, and keeps the last
>   good shell **forever** on later failures;
> - the shell is only accepted if it matches `/<\/head>/i` **and** does not already contain `OG_MARKER`;
> - `renderWithShell()` → `X-Og-Source: backend/og-shell`, falling back to the self-contained page as
>   `backend/og-fallback`;
> - the HTML responder removes `Content-Security-Policy`, `Cross-Origin-Opener-Policy`,
>   `Cross-Origin-Resource-Policy` **and `Origin-Agent-Cluster`**.
>
> The standalone page below is the **fallback**, exactly as on `origin/main` — never the primary path.

**Interfaces:**
- Consumes: `OpportunitiesService.getPublicAppBaseUrl()` (existing), the Task-1 lineage columns.
- Produces:
  ```ts
  // spa-shell.ts
  export const OG_MARKER = "<!--edutu-og-->";
  export interface HeadMeta {
    title: string; description: string; canonicalUrl: string; robots: string;
    image: string; imageAlt: string; ogType: "website" | "article";
    jsonLd?: Record<string, unknown>;
  }
  export function injectHeadMeta(html: string, meta: HeadMeta): string;
  export function renderStandalonePage(meta: HeadMeta): string;
  export class SpaShellCache {
    constructor(fetchImpl?: typeof fetch, ttlMs?: number);
    get(shellUrl: string): Promise<string | null>;
    reset(): void;
  }

  // community-seo.service.ts
  export interface PublicGroupPage {
    id: string; slug: string; name: string; description: string | null;
    iconUrl: string | null; coverUrl: string | null;
    visibility: "public" | "unlisted" | "private";
    status: "active" | "archived" | "suspended";
    memberCount: number; opportunityTitle: string | null;
    briefTeaser: string[]; carriedForwardFrom: { slug: string; name: string } | null;
    indexable: boolean; updatedAt: string | null;
  }
  export class CommunitySeoService {
    getPublicGroupPage(slug: string): Promise<PublicGroupPage | null>;
    listSitemapGroups(limit?: number): Promise<Array<{ slug: string; updatedAt: string | null }>>;
  }
  ```

- [ ] **Step 1: Write the failing shell tests**

Create `backend/services/services/api/src/communities/spa-shell.spec.ts`:

```ts
import { OG_MARKER, SpaShellCache, injectHeadMeta, renderStandalonePage } from "./spa-shell";

const SHELL = `<!doctype html><html><head>
  <title>Edutu</title>
  <meta name="description" content="default" />
  <meta property="og:image"
        content="https://www.edutu.org/icons/icon-512x512.png" />
  <link rel="canonical" href="https://www.edutu.org/" />
  <script type="module" src="/assets/index.js"></script>
</head><body><div id="root"></div></body></html>`;

const meta = {
  title: "Chevening 2027 group | Edutu",
  description: "Crew for the 2027 Chevening cycle.",
  canonicalUrl: "https://www.edutu.org/communities/g/chevening-2027",
  robots: "index, follow, max-image-preview:large",
  image: "https://cdn.test/cover.png",
  imageAlt: "Chevening 2027",
  ogType: "website" as const,
  jsonLd: { "@context": "https://schema.org", "@type": "Organization", name: "Chevening 2027" },
};

describe("injectHeadMeta", () => {
  it("rewrites title, description, canonical and og/twitter tags in place", () => {
    const html = injectHeadMeta(SHELL, meta);
    expect(html).toContain("<title>Chevening 2027 group | Edutu</title>");
    expect(html).toContain('content="Crew for the 2027 Chevening cycle."');
    expect(html).toContain('href="https://www.edutu.org/communities/g/chevening-2027"');
    expect(html).toContain('content="https://cdn.test/cover.png"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain('content="index, follow, max-image-preview:large"');
  });

  it("keeps the SPA bootable — the module script survives", () => {
    expect(injectHeadMeta(SHELL, meta)).toContain('src="/assets/index.js"');
  });

  it("stamps the loop marker exactly once", () => {
    const once = injectHeadMeta(SHELL, meta);
    const twice = injectHeadMeta(once, meta);
    expect(twice.split(OG_MARKER)).toHaveLength(2);
  });

  it("escapes quotes so a group name cannot break out of an attribute", () => {
    const html = injectHeadMeta(SHELL, { ...meta, title: 'Ev"il <script>' });
    expect(html).not.toContain('content="Ev"il');
    expect(html).toContain("&quot;");
  });

  it("emits JSON-LD with escaped angle brackets", () => {
    const html = injectHeadMeta(SHELL, {
      ...meta,
      jsonLd: { "@type": "Organization", name: "</script><x>" },
    });
    expect(html).toContain('<script type="application/ld+json">');
    expect(html).not.toContain("</script><x>");
    expect(html).toContain("\\u003c");
  });
});

describe("renderStandalonePage", () => {
  it("is a valid, self-contained fallback document", () => {
    const html = renderStandalonePage(meta);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("Chevening 2027 group | Edutu");
    expect(html).toContain(meta.canonicalUrl);
  });
});

describe("SpaShellCache", () => {
  it("fetches once inside the TTL and refetches after it", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, text: async () => SHELL });
    const cache = new SpaShellCache(fetchImpl as never, 1000);

    expect(await cache.get("https://www.edutu.org/")).toBe(SHELL);
    expect(await cache.get("https://www.edutu.org/")).toBe(SHELL);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    jest.spyOn(Date, "now").mockReturnValue(Date.now() + 5000);
    await cache.get("https://www.edutu.org/");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    jest.restoreAllMocks();
  });

  it("serves the last known good shell forever once the origin starts failing", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, text: async () => SHELL })
      .mockRejectedValue(new Error("origin down"));
    const cache = new SpaShellCache(fetchImpl as never, 0);

    expect(await cache.get("https://www.edutu.org/")).toBe(SHELL);
    expect(await cache.get("https://www.edutu.org/")).toBe(SHELL);
  });

  it("refuses a shell that already carries our marker (rewrite loop guard)", async () => {
    const looped = SHELL.replace("</head>", `${OG_MARKER}</head>`);
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, text: async () => looped });
    const cache = new SpaShellCache(fetchImpl as never, 1000);
    expect(await cache.get("https://www.edutu.org/")).toBeNull();
  });

  it("returns null (never throws) when there is no cached shell and fetch fails", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error("boom"));
    const cache = new SpaShellCache(fetchImpl as never, 1000);
    expect(await cache.get("https://www.edutu.org/")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api && npx jest src/communities/spa-shell.spec.ts`

Expected: FAIL — `Cannot find module './spa-shell'`

- [ ] **Step 3: Write the shell helper**

Create `backend/services/services/api/src/communities/spa-shell.ts`:

```ts
/**
 * Serve the REAL deployed SPA with per-page head meta injected.
 *
 * The Vercel rewrite that routes /communities/g/:slug here is unconditional —
 * crawler-gated (`has`) rewrites are silently dropped on this deployment — so
 * real users land on this endpoint too. Returning a standalone mini page would
 * mean shipping them a dead end. Instead we fetch the deployed SPA shell once
 * every TTL, rewrite the head, and hand back an app that still boots.
 *
 * Behaviourally identical to OgController.getSpaShell()/renderWithShell() on
 * origin/main, extracted here so the group route and the opportunity route
 * share one marker and one set of rules.
 */

export const OG_MARKER = "<!--edutu-og-->";

export interface HeadMeta {
  title: string;
  description: string;
  canonicalUrl: string;
  robots: string;
  image: string;
  imageAlt: string;
  ogType: "website" | "article";
  jsonLd?: Record<string, unknown>;
}

function attr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function textContent(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Tolerates the multi-line meta formatting used in index.html. */
function setValue(
  html: string,
  matcher: RegExp,
  fallbackTag: string,
  value: string,
): string {
  const safe = attr(value);
  if (matcher.test(html)) {
    return html.replace(
      matcher,
      (_match, open: string, close: string) => `${open}${safe}${close}`,
    );
  }
  return html.replace(
    /<\/head>/i,
    `  ${fallbackTag.replace("__VALUE__", safe)}\n</head>`,
  );
}

function ogProperty(prop: string) {
  return new RegExp(`(<meta\\s+property="${prop}"\\s+content=")[\\s\\S]*?(")`, "i");
}

function metaName(name: string) {
  return new RegExp(`(<meta\\s+name="${name}"\\s+content=")[\\s\\S]*?(")`, "i");
}

export function injectHeadMeta(html: string, meta: HeadMeta): string {
  let out = html;

  out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${attr(meta.title)}</title>`);
  out = setValue(out, metaName("description"), `<meta name="description" content="__VALUE__" />`, meta.description);
  out = setValue(out, /(<link\s+rel="canonical"\s+href=")[^"]*(")/i, `<link rel="canonical" href="__VALUE__" />`, meta.canonicalUrl);
  out = setValue(out, metaName("robots"), `<meta name="robots" content="__VALUE__" />`, meta.robots);

  out = setValue(out, ogProperty("og:site_name"), `<meta property="og:site_name" content="__VALUE__" />`, "Edutu");
  out = setValue(out, ogProperty("og:type"), `<meta property="og:type" content="__VALUE__" />`, meta.ogType);
  out = setValue(out, ogProperty("og:title"), `<meta property="og:title" content="__VALUE__" />`, meta.title);
  out = setValue(out, ogProperty("og:description"), `<meta property="og:description" content="__VALUE__" />`, meta.description);
  out = setValue(out, ogProperty("og:image"), `<meta property="og:image" content="__VALUE__" />`, meta.image);
  out = setValue(out, ogProperty("og:image:alt"), `<meta property="og:image:alt" content="__VALUE__" />`, meta.imageAlt);
  out = setValue(out, ogProperty("og:url"), `<meta property="og:url" content="__VALUE__" />`, meta.canonicalUrl);

  out = setValue(out, metaName("twitter:card"), `<meta name="twitter:card" content="__VALUE__" />`, "summary_large_image");
  out = setValue(out, metaName("twitter:title"), `<meta name="twitter:title" content="__VALUE__" />`, meta.title);
  out = setValue(out, metaName("twitter:description"), `<meta name="twitter:description" content="__VALUE__" />`, meta.description);
  out = setValue(out, metaName("twitter:image"), `<meta name="twitter:image" content="__VALUE__" />`, meta.image);
  out = setValue(out, metaName("twitter:image:alt"), `<meta name="twitter:image:alt" content="__VALUE__" />`, meta.imageAlt);

  if (meta.jsonLd && !/application\/ld\+json/i.test(out)) {
    const tag = `<script type="application/ld+json">${JSON.stringify(meta.jsonLd).replace(/</g, "\\u003c")}</script>`;
    out = out.replace(/<\/head>/i, `  ${tag}\n</head>`);
  }

  if (!out.includes(OG_MARKER)) {
    out = out.replace(/<\/head>/i, `${OG_MARKER}\n</head>`);
  }

  return out;
}

/** Last resort when the SPA shell is unreachable: a tiny valid document. */
export function renderStandalonePage(meta: HeadMeta): string {
  const jsonLdTag = meta.jsonLd
    ? `\n  <script type="application/ld+json">${JSON.stringify(meta.jsonLd).replace(/</g, "\\u003c")}</script>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${attr(meta.title)}</title>
  <meta name="description" content="${attr(meta.description)}">
  <link rel="canonical" href="${attr(meta.canonicalUrl)}">
  <meta name="robots" content="${attr(meta.robots)}">
  <meta property="og:site_name" content="Edutu">
  <meta property="og:type" content="${meta.ogType}">
  <meta property="og:title" content="${attr(meta.title)}">
  <meta property="og:description" content="${attr(meta.description)}">
  <meta property="og:image" content="${attr(meta.image)}">
  <meta property="og:image:alt" content="${attr(meta.imageAlt)}">
  <meta property="og:url" content="${attr(meta.canonicalUrl)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${attr(meta.title)}">
  <meta name="twitter:description" content="${attr(meta.description)}">
  <meta name="twitter:image" content="${attr(meta.image)}">${jsonLdTag}
  ${OG_MARKER}
</head>
<body>
  <main style="font-family:system-ui,-apple-system,sans-serif;max-width:640px;margin:48px auto;padding:0 20px;line-height:1.5">
    <h1>${textContent(meta.title)}</h1>
    <p>${textContent(meta.description)}</p>
    <p><a href="${attr(meta.canonicalUrl)}">Open this group on Edutu →</a></p>
  </main>
</body>
</html>`;
}

/**
 * 5-minute TTL cache of the deployed SPA shell, with two hard rules:
 *  - once a good shell has been seen it is served FOREVER on later failures
 *    (a deploy blip must not turn every group page into a mini page), and
 *  - a fetched document that already carries OG_MARKER means the CDN routed
 *    our own output back to us: treat it as a miss, never inject twice.
 */
export class SpaShellCache {
  private cached: string | null = null;
  private fetchedAt = 0;
  private inFlight: Promise<string | null> | null = null;

  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly ttlMs = 5 * 60_000,
  ) {}

  reset(): void {
    this.cached = null;
    this.fetchedAt = 0;
    this.inFlight = null;
  }

  async get(shellUrl: string): Promise<string | null> {
    const fresh = this.cached && Date.now() - this.fetchedAt < this.ttlMs;
    if (fresh) return this.cached;
    if (this.inFlight) return this.inFlight;

    this.inFlight = (async () => {
      // Hard 4s budget, same as origin/main's getSpaShell(): a slow origin must
      // never hold a crawler (or a real user) on this route.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      try {
        const response = await this.fetchImpl(shellUrl, {
          headers: { Accept: "text/html" },
          signal: controller.signal,
        });
        if (!response.ok) return this.cached;
        const html = await response.text();
        if (!html || !/<\/head>/i.test(html)) return this.cached;
        if (html.includes(OG_MARKER)) return this.cached;
        this.cached = html;
        this.fetchedAt = Date.now();
        return html;
      } catch {
        return this.cached;
      } finally {
        clearTimeout(timer);
        this.inFlight = null;
      }
    })();

    return this.inFlight;
  }
}
```

- [ ] **Step 4: Run the shell tests to verify they pass**

Run: `cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api && npx jest src/communities/spa-shell.spec.ts`

Expected: PASS — `Tests: 9 passed, 9 total`

- [ ] **Step 5: Write the failing SEO-projection tests**

Create `backend/services/services/api/src/communities/community-seo.service.spec.ts`:

```ts
import { db } from "../db";
import { CommunitySeoService } from "./community-seo.service";

jest.mock("../db", () => ({ db: { execute: jest.fn() } }));
const mockedDb = db as unknown as { execute: jest.Mock };

const groupRow = (over: Record<string, unknown> = {}) => ({
  id: "g1",
  slug: "chevening-2027",
  name: "Chevening 2027",
  description: "Crew for the 2027 Chevening cycle",
  icon_url: null,
  cover_url: "https://cdn.test/cover.png",
  visibility: "public",
  status: "active",
  member_count: 42,
  updated_at: "2026-07-20T00:00:00.000Z",
  opportunity_title: "Chevening Scholarships 2027",
  brief_content: {
    sections: [
      { heading: "What this is", bullets: [{ text: "A fully funded UK masters." }] },
      { heading: "Key dates", bullets: [{ text: "Applications close 5 November." }] },
    ],
  },
  carried_forward_slug: "chevening-2026",
  carried_forward_name: "Chevening 2026",
  ...over,
});

describe("CommunitySeoService", () => {
  let service: CommunitySeoService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new CommunitySeoService();
  });

  it("returns null for an unknown slug", async () => {
    mockedDb.execute.mockResolvedValue({ rows: [] });
    expect(await service.getPublicGroupPage("nope")).toBeNull();
  });

  it("projects a public group with a Brief teaser and lineage", async () => {
    mockedDb.execute.mockResolvedValue({ rows: [groupRow()] });
    const page = await service.getPublicGroupPage("chevening-2027");

    expect(page).toMatchObject({
      slug: "chevening-2027",
      name: "Chevening 2027",
      memberCount: 42,
      opportunityTitle: "Chevening Scholarships 2027",
      indexable: true,
      carriedForwardFrom: { slug: "chevening-2026", name: "Chevening 2026" },
    });
    expect(page!.briefTeaser).toEqual([
      "What this is: A fully funded UK masters.",
      "Key dates: Applications close 5 November.",
    ]);
  });

  it("never leaks Brief content for an unlisted group", async () => {
    mockedDb.execute.mockResolvedValue({ rows: [groupRow({ visibility: "unlisted" })] });
    const page = await service.getPublicGroupPage("chevening-2027");
    expect(page!.briefTeaser).toEqual([]);
    expect(page!.indexable).toBe(true);
  });

  it("returns null for a private group — the page must not exist", async () => {
    mockedDb.execute.mockResolvedValue({ rows: [groupRow({ visibility: "private" })] });
    expect(await service.getPublicGroupPage("secret")).toBeNull();
  });

  it("returns null for a suspended group", async () => {
    mockedDb.execute.mockResolvedValue({ rows: [groupRow({ status: "suspended" })] });
    expect(await service.getPublicGroupPage("chevening-2027")).toBeNull();
  });

  it("keeps an ARCHIVED public group indexable — the Brief is the SEO asset", async () => {
    mockedDb.execute.mockResolvedValue({ rows: [groupRow({ status: "archived" })] });
    const page = await service.getPublicGroupPage("chevening-2026");
    expect(page!.indexable).toBe(true);
    expect(page!.status).toBe("archived");
  });

  it("caps the Brief teaser at 6 lines", async () => {
    const sections = Array.from({ length: 12 }, (_, index) => ({
      heading: `H${index}`,
      bullets: [{ text: `B${index}` }],
    }));
    mockedDb.execute.mockResolvedValue({
      rows: [groupRow({ brief_content: { sections } })],
    });
    const page = await service.getPublicGroupPage("chevening-2027");
    expect(page!.briefTeaser).toHaveLength(6);
  });

  it("lists ONLY public non-suspended groups in the sitemap", async () => {
    mockedDb.execute.mockResolvedValue({
      rows: [{ slug: "chevening-2027", updated_at: "2026-07-20T00:00:00.000Z" }],
    });
    const groups = await service.listSitemapGroups();

    const text = JSON.stringify(mockedDb.execute.mock.calls[0][0]);
    expect(text).toContain("visibility = 'public'");
    expect(text).toContain("status <> 'suspended'");
    expect(groups).toEqual([
      { slug: "chevening-2027", updatedAt: "2026-07-20T00:00:00.000Z" },
    ]);
  });

  it("never throws from listSitemapGroups — a broken sitemap query must not 500 /sitemap.xml", async () => {
    mockedDb.execute.mockRejectedValue(new Error("relation does not exist"));
    expect(await service.listSitemapGroups()).toEqual([]);
  });
});
```

- [ ] **Step 6: Write the SEO projection service**

Create `backend/services/services/api/src/communities/community-seo.service.ts`:

```ts
import { Injectable, Logger } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { db } from "../db";

export interface PublicGroupPage {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  coverUrl: string | null;
  visibility: "public" | "unlisted";
  status: "active" | "archived";
  memberCount: number;
  opportunityTitle: string | null;
  /** "Heading: first bullet" lines. PUBLIC groups only — never for unlisted. */
  briefTeaser: string[];
  carriedForwardFrom: { slug: string; name: string } | null;
  indexable: boolean;
  updatedAt: string | null;
}

const MAX_TEASER_LINES = 6;
const SITEMAP_LIMIT = 5000;

interface GroupSeoRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  cover_url: string | null;
  visibility: string;
  status: string;
  member_count: number | string | null;
  updated_at: string | null;
  opportunity_title: string | null;
  brief_content: unknown;
  carried_forward_slug: string | null;
  carried_forward_name: string | null;
}

/**
 * The public, crawler-facing projection of a group.
 *
 * Safety line: chat messages NEVER appear here. Only the group's own name and
 * description, plus — for `public` groups only — a headings-and-first-bullet
 * teaser of the Brief. Unlisted groups render for link unfurls but expose no
 * Brief content. Private and suspended groups do not exist at this layer.
 */
@Injectable()
export class CommunitySeoService {
  private readonly logger = new Logger(CommunitySeoService.name);

  async getPublicGroupPage(slug: string): Promise<PublicGroupPage | null> {
    const clean = String(slug ?? "").trim().toLowerCase();
    if (!clean) return null;

    let row: GroupSeoRow | undefined;
    try {
      const result = await db.execute(sql`
        select g.id, g.slug, g.name, g.description, g.icon_url, g.cover_url,
               g.visibility, g.status, g.member_count,
               coalesce(g.last_message_at, g.created_at)::text as updated_at,
               o.title as opportunity_title,
               b.content as brief_content,
               cf.slug as carried_forward_slug,
               cf.name as carried_forward_name
        from public.community_groups g
        left join public.opportunities o on o.id = g.opportunity_id
        left join public.community_briefs b on b.group_id = g.id
        left join public.community_groups cf on cf.id = g.carried_forward_from_group_id
        where lower(g.slug) = ${clean}
        limit 1
      `);
      row = this.rows<GroupSeoRow>(result)[0];
    } catch (error) {
      this.logger.warn(
        `Group SEO lookup failed for "${clean}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }

    if (!row) return null;
    if (row.status === "suspended") return null;
    if (row.visibility !== "public" && row.visibility !== "unlisted") return null;

    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description ?? null,
      iconUrl: row.icon_url ?? null,
      coverUrl: row.cover_url ?? null,
      visibility: row.visibility,
      status: row.status === "archived" ? "archived" : "active",
      memberCount: Number(row.member_count ?? 0),
      opportunityTitle: row.opportunity_title ?? null,
      briefTeaser:
        row.visibility === "public" ? this.teaserFrom(row.brief_content) : [],
      carriedForwardFrom:
        row.carried_forward_slug && row.carried_forward_name
          ? { slug: row.carried_forward_slug, name: row.carried_forward_name }
          : null,
      // Archived public groups stay indexed on purpose: the Brief is the whole
      // long-tail SEO asset ("what wins a Chevening application").
      indexable: true,
      updatedAt: row.updated_at ?? null,
    };
  }

  /** Public groups only — unlisted is link-reachable, not actively submitted. */
  async listSitemapGroups(
    limit = SITEMAP_LIMIT,
  ): Promise<Array<{ slug: string; updatedAt: string | null }>> {
    try {
      const result = await db.execute(sql`
        select g.slug,
               coalesce(g.last_message_at, g.created_at)::text as updated_at
        from public.community_groups g
        where g.visibility = 'public'
          and g.status <> 'suspended'
        order by coalesce(g.last_message_at, g.created_at) desc
        limit ${limit}
      `);
      return this.rows<{ slug: string; updated_at: string | null }>(result).map((row) => ({
        slug: row.slug,
        updatedAt: row.updated_at ?? null,
      }));
    } catch (error) {
      // /sitemap.xml serves opportunities and events too — a group query
      // failure must degrade to "no groups", never a 500.
      this.logger.warn(
        `Sitemap group listing unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }

  private teaserFrom(content: unknown): string[] {
    const sections = (content as { sections?: unknown })?.sections;
    if (!Array.isArray(sections)) return [];

    const lines: string[] = [];
    for (const raw of sections) {
      const section = raw as { heading?: unknown; bullets?: unknown };
      const heading = typeof section.heading === "string" ? section.heading.trim() : "";
      const bullets = Array.isArray(section.bullets) ? section.bullets : [];
      const first = bullets[0] as { text?: unknown } | undefined;
      const text = typeof first?.text === "string" ? first.text.trim() : "";
      if (!heading && !text) continue;
      lines.push(heading && text ? `${heading}: ${text}` : heading || text);
      if (lines.length >= MAX_TEASER_LINES) break;
    }
    return lines;
  }

  private rows<T>(result: unknown): T[] {
    if (Array.isArray(result)) return result as T[];
    return (result as { rows?: T[] }).rows ?? [];
  }
}
```

- [ ] **Step 7: Run the SEO tests to verify they pass**

Run: `cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api && npx jest src/communities/community-seo.service.spec.ts`

Expected: PASS — `Tests: 9 passed, 9 total`

- [ ] **Step 8: Write the failing controller tests**

Create `backend/services/services/api/src/communities/community-group-og.controller.spec.ts`:

```ts
import { CommunityGroupOgController } from "./community-group-og.controller";
import { OG_MARKER, SpaShellCache } from "./spa-shell";

const SHELL = `<!doctype html><html><head><title>Edutu</title>
  <meta name="description" content="d" />
  <link rel="canonical" href="https://www.edutu.org/" />
  <script type="module" src="/assets/index.js"></script>
</head><body><div id="root"></div></body></html>`;

function makeResponse() {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader: jest.fn((key: string, value: string) => { headers[key.toLowerCase()] = value; }),
    removeHeader: jest.fn((key: string) => { delete headers[key.toLowerCase()]; }),
    status: jest.fn().mockReturnThis(),
  };
}

const page = {
  id: "g1",
  slug: "chevening-2027",
  name: "Chevening 2027",
  description: "Crew for the 2027 Chevening cycle",
  iconUrl: null,
  coverUrl: "https://cdn.test/cover.png",
  visibility: "public" as const,
  status: "active" as const,
  memberCount: 42,
  opportunityTitle: "Chevening Scholarships 2027",
  briefTeaser: ["What this is: A fully funded UK masters."],
  carriedForwardFrom: { slug: "chevening-2026", name: "Chevening 2026" },
  indexable: true,
  updatedAt: "2026-07-20T00:00:00.000Z",
};

describe("CommunityGroupOgController", () => {
  let seo: { getPublicGroupPage: jest.Mock };
  let opportunities: { getPublicAppBaseUrl: jest.Mock };
  let controller: CommunityGroupOgController;
  let shell: SpaShellCache;

  beforeEach(() => {
    seo = { getPublicGroupPage: jest.fn() };
    opportunities = { getPublicAppBaseUrl: jest.fn(() => "https://www.edutu.org") };
    shell = new SpaShellCache(
      jest.fn().mockResolvedValue({ ok: true, text: async () => SHELL }) as never,
      60_000,
    );
    controller = new CommunityGroupOgController(seo as never, opportunities as never, shell);
  });

  it("injects group meta into the SPA shell and keeps the app bootable", async () => {
    seo.getPublicGroupPage.mockResolvedValue(page);
    const res = makeResponse();

    const html = await controller.group("chevening-2027", res as never);

    expect(html).toContain("<title>Chevening 2027 — 42 members | Edutu</title>");
    expect(html).toContain("https://www.edutu.org/communities/g/chevening-2027");
    expect(html).toContain('content="https://cdn.test/cover.png"');
    expect(html).toContain('src="/assets/index.js"');
    expect(html).toContain(OG_MARKER);
    expect(res.headers["x-og-source"]).toBe("backend/og-shell");
    expect(res.headers["content-type"]).toBe("text/html; charset=utf-8");
  });

  it("mentions the lineage and the Brief teaser in the description", async () => {
    seo.getPublicGroupPage.mockResolvedValue(page);
    const html = await controller.group("chevening-2027", makeResponse() as never);
    expect(html).toContain("Carried forward from Chevening 2026");
    expect(html).toContain("A fully funded UK masters");
  });

  it("marks an unlisted group indexable but exposes no Brief", async () => {
    seo.getPublicGroupPage.mockResolvedValue({
      ...page, visibility: "unlisted", briefTeaser: [],
    });
    const html = await controller.group("chevening-2027", makeResponse() as never);
    expect(html).toContain('content="index, follow, max-image-preview:large"');
    expect(html).not.toContain("A fully funded UK masters");
  });

  it("serves a noindex not-found page for a private or missing group, leaking no name", async () => {
    seo.getPublicGroupPage.mockResolvedValue(null);
    const res = makeResponse();
    const html = await controller.group("secret-room", res as never);

    expect(html).toContain('content="noindex, nofollow"');
    expect(html).toContain("This group is private or no longer available");
    expect(html).not.toContain("secret-room");
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("falls back to a standalone page when the SPA shell is unreachable", async () => {
    seo.getPublicGroupPage.mockResolvedValue(page);
    const failing = new SpaShellCache(jest.fn().mockRejectedValue(new Error("down")) as never, 1);
    const withFailingShell = new CommunityGroupOgController(
      seo as never, opportunities as never, failing,
    );
    const res = makeResponse();

    const html = await withFailingShell.group("chevening-2027", res as never);

    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("Chevening 2027");
    expect(res.headers["x-og-source"]).toBe("backend/og-fallback");
  });

  it("strips the CSP/COOP/CORP headers helmet sets, or the SPA breaks for real users", async () => {
    seo.getPublicGroupPage.mockResolvedValue(page);
    const res = makeResponse();
    await controller.group("chevening-2027", res as never);

    expect(res.removeHeader).toHaveBeenCalledWith("Content-Security-Policy");
    expect(res.removeHeader).toHaveBeenCalledWith("Cross-Origin-Opener-Policy");
    expect(res.removeHeader).toHaveBeenCalledWith("Cross-Origin-Embedder-Policy");
    expect(res.removeHeader).toHaveBeenCalledWith("Cross-Origin-Resource-Policy");
    expect(res.removeHeader).toHaveBeenCalledWith("Origin-Agent-Cluster");
  });

  it("emits JSON-LD describing the group", async () => {
    seo.getPublicGroupPage.mockResolvedValue(page);
    const html = await controller.group("chevening-2027", makeResponse() as never);
    expect(html).toContain('<script type="application/ld+json">');
    expect(html).toContain('"@type":"Organization"');
  });
});
```

- [ ] **Step 9: Write the OG controller**

Create `backend/services/services/api/src/communities/community-group-og.controller.ts`:

```ts
import { Controller, Get, Inject, Optional, Param, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { Public } from "../auth";
import { OpportunitiesService } from "../opportunities/opportunities.service";
import { CommunitySeoService, type PublicGroupPage } from "./community-seo.service";
import { SpaShellCache, injectHeadMeta, renderStandalonePage, type HeadMeta } from "./spa-shell";

export const SPA_SHELL_CACHE = "SPA_SHELL_CACHE";

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Crawler- AND user-facing group pages.
 *
 * The root vercel.json rewrites /communities/g/:slug here UNCONDITIONALLY
 * (crawler-gated `has` rewrites are silently dropped by this deployment), so
 * this must return the real SPA with injected head meta — not a mini page.
 */
@Controller("og")
export class CommunityGroupOgController {
  constructor(
    private readonly seo: CommunitySeoService,
    private readonly opportunities: OpportunitiesService,
    // Optional + defaulted so a missing provider can never break boot
    // (constraint #10: Nest DI failures only show up at `node dist/main`).
    @Optional() @Inject(SPA_SHELL_CACHE) private readonly shell: SpaShellCache = new SpaShellCache(),
  ) {}

  private get base(): string {
    return this.opportunities.getPublicAppBaseUrl().replace(/\/$/, "");
  }

  private get shellUrl(): string {
    // The ROOT path, matching origin/main's getSpaShell(). It is never
    // rewritten to a controller, so fetching it cannot loop back into us.
    return process.env.SPA_SHELL_URL || `${this.base}/`;
  }

  private get defaultImage(): string {
    return `${this.base}/icons/icon-512x512.png`;
  }

  @Public()
  @Throttle({ default: { limit: 300, ttl: 60000 } })
  @Get("group/:slug")
  async group(
    @Param("slug") slug: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const page = await this.seo.getPublicGroupPage(slug);
    const meta = page ? this.metaFor(page) : this.notFoundMeta();

    const shellHtml = await this.shell.get(this.shellUrl);
    const html = shellHtml
      ? injectHeadMeta(shellHtml, meta)
      : renderStandalonePage(meta);

    // Helmet's CSP/COOP/CORP would break the SPA for real users on this route.
    // Same four-plus-one removals as OgController.html() on origin/main.
    res.removeHeader("Content-Security-Policy");
    res.removeHeader("Cross-Origin-Opener-Policy");
    res.removeHeader("Cross-Origin-Embedder-Policy");
    res.removeHeader("Cross-Origin-Resource-Policy");
    res.removeHeader("Origin-Agent-Cluster");

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Og-Source", shellHtml ? "backend/og-shell" : "backend/og-fallback");
    res.setHeader(
      "Cache-Control",
      page
        ? "public, max-age=0, s-maxage=300, stale-while-revalidate=600"
        : "public, max-age=0, s-maxage=60",
    );
    if (!page) res.status(404);

    return html;
  }

  private metaFor(page: PublicGroupPage): HeadMeta {
    const url = `${this.base}/communities/g/${encodeURIComponent(page.slug)}`;
    const title = `${page.name} — ${page.memberCount} member${page.memberCount === 1 ? "" : "s"} | Edutu`;

    const parts: string[] = [];
    if (page.description) parts.push(page.description);
    if (page.opportunityTitle) parts.push(`Group for ${page.opportunityTitle}.`);
    if (page.carriedForwardFrom) {
      parts.push(`Carried forward from ${page.carriedForwardFrom.name}.`);
    }
    if (page.briefTeaser.length > 0) parts.push(page.briefTeaser.join(" · "));
    if (parts.length === 0) {
      parts.push(
        "Join the crew applying together on Edutu — deadlines, an AI-maintained Brief and people who have already won.",
      );
    }

    return {
      title,
      description: truncate(parts.join(" ").replace(/\s+/g, " ").trim(), 300),
      canonicalUrl: url,
      robots: page.indexable
        ? "index, follow, max-image-preview:large"
        : "noindex, follow",
      image: page.coverUrl || page.iconUrl || this.defaultImage,
      imageAlt: page.name,
      ogType: "website",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: page.name,
        description: page.description ?? undefined,
        url,
        ...(page.coverUrl || page.iconUrl
          ? { image: page.coverUrl || page.iconUrl }
          : {}),
        memberOf: {
          "@type": "Organization",
          name: "Edutu",
          url: `${this.base}/communities`,
        },
        ...(page.briefTeaser.length > 0
          ? {
              subjectOf: {
                "@type": "CreativeWork",
                name: `${page.name} Brief`,
                text: page.briefTeaser.join(" "),
              },
            }
          : {}),
      },
    };
  }

  private notFoundMeta(): HeadMeta {
    return {
      title: "Group not available | Edutu",
      // Never echo the requested slug — a private group's slug is a secret.
      description:
        "This group is private or no longer available. Browse open groups on Edutu instead.",
      canonicalUrl: `${this.base}/communities`,
      robots: "noindex, nofollow",
      image: this.defaultImage,
      imageAlt: "Edutu",
      ogType: "website",
    };
  }
}
```

- [ ] **Step 10: Run the controller tests to verify they pass**

Run: `cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api && npx jest src/communities/community-group-og.controller.spec.ts`

Expected: PASS — `Tests: 7 passed, 7 total`

- [ ] **Step 11: Register the providers and controller**

In `backend/services/services/api/src/communities/communities.module.ts`:

```ts
import { OpportunitiesModule } from "../opportunities/opportunities.module";
import { CommunitySeoService } from "./community-seo.service";
import { CommunityGroupOgController, SPA_SHELL_CACHE } from "./community-group-og.controller";
import { SpaShellCache } from "./spa-shell";
```

- add `OpportunitiesModule` to `imports` (skip if Slice 3 already added it),
- add `CommunityGroupOgController` to `controllers`,
- add to `providers`:

```ts
    CommunitySeoService,
    { provide: SPA_SHELL_CACHE, useFactory: () => new SpaShellCache() },
```

- add `CommunitySeoService` to `exports` (the sitemap needs it).

- [ ] **Step 12: Add public groups to `/sitemap.xml`**

In `backend/services/services/api/src/app.controller.ts`:

```ts
import { CommunitySeoService } from "./communities/community-seo.service";
```

Add the constructor parameter:

```ts
    private readonly communitySeoService: CommunitySeoService,
```

Change the parallel load to include groups:

```ts
    const [opportunities, events, groups] = await Promise.all([
      this.opportunitiesService.listSitemapOpportunities(),
      this.eventsService.listSitemapEvents(),
      this.communitySeoService.listSitemapGroups(),
    ]);
```

Add the `/communities` hub entry and the per-group entries to `urls`, immediately after the `/events`
entry:

```ts
      {
        loc: toAbsoluteUrl("/communities"),
        lastmod: today,
        changefreq: "daily",
        priority: "0.9",
      },
      ...groups.map((group) => ({
        loc: toAbsoluteUrl(`/communities/g/${encodeURIComponent(group.slug)}`),
        lastmod: toLastmod(group.updatedAt),
        changefreq: "daily",
        priority: "0.7",
      })),
```

If `AppModule` does not already import `CommunitiesModule`, add it to `src/app.module.ts` imports.

- [ ] **Step 13: Verify boot, route and sitemap end to end**

Run:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npm run build
node dist/main & SERVER=$!
sleep 12
curl -s -o /dev/null -w "%{http_code} " http://localhost:3000/og/group/does-not-exist
curl -sI http://localhost:3000/og/group/does-not-exist | grep -i x-og-source
curl -s http://localhost:3000/sitemap.xml | grep -c "/communities"
kill $SERVER
```

Expected: `404 `, an `X-Og-Source: backend/og-shell` or `backend/og-fallback` line, and a count `>= 1`
for `/communities` URLs.

- [ ] **Step 14: Run the full backend suite and lint**

Run: `cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api && npx jest && npm run lint`

Expected: all suites pass; ESLint `0 problems`.

- [ ] **Step 15: Commit**

```bash
git add backend/services/services/api/src/communities/ \
        backend/services/services/api/src/app.controller.ts \
        backend/services/services/api/src/app.module.ts
git commit -m "feat(communities): server-rendered indexable group pages and sitemap entries"
```

---

## Task 9: Edge wiring — root `vercel.json`, Netlify edge function, sitemap generator

**Files:**
- Modify: `vercel.json` (repo **root** — not `edutu-web-app/vercel.json`)
- Create: `edutu-web-app/netlify/edge-functions/group-og.ts`
- Modify: `edutu-web-app/netlify.toml`
- Modify: `edutu-web-app/scripts/generate-sitemap.mjs`
- Create: `edutu-web-app/src/test/__tests__/groupSeoWiring.test.ts`

**Interfaces:**
- Consumes: `GET /og/group/:slug` (Task 8) and `GET /communities/g/:slug` on the backend host.
- Produces: production routing so `https://www.edutu.org/communities/g/<slug>` is server-rendered.

> **Constraint #5 in practice:** `npm run build` in `edutu-web-app` runs `prebuild → seo:sitemap`,
> which **overwrites** `public/sitemap.xml` and `public/robots.txt`. Never hand-edit those two files —
> edit `scripts/generate-sitemap.mjs`. (In production the served `/sitemap.xml` is the *backend* one
> anyway: both `vercel.json` and `netlify.toml` rewrite it to `edutu-platform.onrender.com`. The
> generated static file is the offline/preview fallback, so both must list groups.)

- [ ] **Step 1: Write the failing wiring test**

Create `edutu-web-app/src/test/__tests__/groupSeoWiring.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(__dirname, '../../../..');
const readJson = (path: string) => JSON.parse(readFileSync(join(repoRoot, path), 'utf8'));
const readText = (path: string) => readFileSync(join(repoRoot, path), 'utf8');

describe('group SEO deployment wiring', () => {
  it('routes group pages from the ROOT vercel.json, not the per-app one', () => {
    const root = readJson('vercel.json');
    const rewrite = (root.rewrites ?? []).find(
      (entry: { source: string }) => entry.source === '/communities/g/:slug',
    );
    expect(rewrite).toBeDefined();
    expect(rewrite.destination).toBe(
      'https://edutu-platform.onrender.com/og/group/:slug',
    );
  });

  it('never gates the group rewrite on a crawler user-agent', () => {
    // `has` conditions are silently dropped by this deployment's router — a
    // crawler-gated rewrite is a no-op in production (verified live 2026-07-24).
    const root = readJson('vercel.json');
    const rewrite = (root.rewrites ?? []).find(
      (entry: { source: string }) => entry.source === '/communities/g/:slug',
    );
    expect(rewrite.has).toBeUndefined();
  });

  it('keeps experimentalServices intact alongside the rewrites', () => {
    const root = readJson('vercel.json');
    expect(root.experimentalServices?.frontend?.entrypoint).toBe('edutu-web-app');
    expect(root.experimentalServices?.admin?.entrypoint).toBe('admin');
  });

  it('registers the Netlify edge function for the same path', () => {
    const toml = readText('edutu-web-app/netlify.toml');
    expect(toml).toContain('path = "/communities/g/*"');
    expect(toml).toContain('function = "group-og"');
  });

  it('the sitemap generator emits group URLs and does not hand-write public/sitemap.xml', () => {
    const script = readText('edutu-web-app/scripts/generate-sitemap.mjs');
    expect(script).toContain('fetchBackendGroups');
    expect(script).toContain('/communities/g/');
    expect(script).toContain('toAbsoluteUrl("/communities")');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app && npx vitest run src/test/__tests__/groupSeoWiring.test.ts`

Expected: FAIL — first assertion, `expected undefined to be defined`.

- [ ] **Step 3: Add the rewrite to the ROOT `vercel.json`**

Replace the entire contents of `/Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/vercel.json` with:

```json
{
  "experimentalServices": {
    "frontend": {
      "entrypoint": "edutu-web-app",
      "routePrefix": "/",
      "framework": "vite"
    },
    "admin": {
      "entrypoint": "admin",
      "routePrefix": "/admin",
      "framework": "vite"
    }
  },
  "rewrites": [
    {
      "source": "/communities/g/:slug",
      "destination": "https://edutu-platform.onrender.com/og/group/:slug"
    }
  ]
}
```

If the root file already carries `rewrites` entries added by a previous slice (for
`/opportunity/:id` or `/share/opportunity/:id`), **append** the group entry to that array instead of
replacing it — check first:

```bash
cat vercel.json
```

- [ ] **Step 4: Write the Netlify edge function**

Create `edutu-web-app/netlify/edge-functions/group-og.ts`:

```ts
/**
 * Per-group Open Graph / SEO injection for the Netlify deployment.
 *
 * Direct mirror of `opportunity-og.ts`: the web app is a Vite SPA, so crawlers
 * never run its JS and a shared /communities/g/<slug> link would only carry the
 * generic app-icon OG tags. This runs at the edge, asks the backend for the
 * public group projection, and rewrites the head of the served HTML.
 *
 * Real users are unaffected — the SPA still boots and takes over routing.
 */
import type { Context } from "https://edge.netlify.com";

const BACKEND = (
  Deno.env.get("BACKEND_URL") ||
  Deno.env.get("VITE_API_URL") ||
  "https://edutu-platform.onrender.com"
).replace(/\/$/, "");

const SITE = "https://www.edutu.org";
const DEFAULT_IMAGE = `${SITE}/icons/icon-512x512.png`;

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function setValue(
  html: string,
  matcher: RegExp,
  fallbackTag: string,
  value: string,
): string {
  const safe = escapeAttr(value);
  if (matcher.test(html)) {
    return html.replace(matcher, (_m, open: string, close: string) => `${open}${safe}${close}`);
  }
  return html.replace(/<\/head>/i, `  ${fallbackTag.replace("__VALUE__", safe)}\n</head>`);
}

function ogProperty(prop: string) {
  return new RegExp(`(<meta\\s+property="${prop}"\\s+content=")[\\s\\S]*?(")`, "i");
}

function metaName(name: string) {
  return new RegExp(`(<meta\\s+name="${name}"\\s+content=")[\\s\\S]*?(")`, "i");
}

export default async function handler(request: Request, context: Context) {
  const response = await context.next();
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;

  const match = new URL(request.url).pathname.match(/^\/communities\/g\/([^/]+)/);
  if (!match) return response;
  const slug = decodeURIComponent(match[1]);

  let html = await response.text();

  try {
    const res = await fetch(
      `${BACKEND}/communities/g/${encodeURIComponent(slug)}/public`,
    );
    const group = res.ok ? await res.json() : null;
    if (!group || !group.slug) return new Response(html, response);

    const memberCount = Number(group.memberCount ?? 0);
    const title = `${clean(group.name)} — ${memberCount} member${memberCount === 1 ? "" : "s"} | Edutu`;

    const parts: string[] = [];
    if (clean(group.description)) parts.push(clean(group.description));
    if (clean(group.opportunityTitle)) parts.push(`Group for ${clean(group.opportunityTitle)}.`);
    if (group.carriedForwardFrom?.name) {
      parts.push(`Carried forward from ${clean(group.carriedForwardFrom.name)}.`);
    }
    if (Array.isArray(group.briefTeaser) && group.briefTeaser.length > 0) {
      parts.push(group.briefTeaser.map(clean).join(" · "));
    }
    const description =
      truncate(parts.join(" ").trim(), 300) ||
      "Join the crew applying together on Edutu — deadlines, an AI-maintained Brief and people who have already won.";

    const image = clean(group.coverUrl) || clean(group.iconUrl) || DEFAULT_IMAGE;
    const pageUrl = `${SITE}/communities/g/${encodeURIComponent(group.slug)}`;

    html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeAttr(title)}</title>`);
    html = setValue(html, metaName("description"), `<meta name="description" content="__VALUE__" />`, description);
    html = setValue(html, /(<link\s+rel="canonical"\s+href=")[^"]*(")/i, `<link rel="canonical" href="__VALUE__" />`, pageUrl);
    html = setValue(html, metaName("robots"), `<meta name="robots" content="__VALUE__" />`,
      group.indexable ? "index, follow, max-image-preview:large" : "noindex, follow");

    html = setValue(html, ogProperty("og:title"), `<meta property="og:title" content="__VALUE__" />`, title);
    html = setValue(html, ogProperty("og:description"), `<meta property="og:description" content="__VALUE__" />`, description);
    html = setValue(html, ogProperty("og:image"), `<meta property="og:image" content="__VALUE__" />`, image);
    html = setValue(html, ogProperty("og:url"), `<meta property="og:url" content="__VALUE__" />`, pageUrl);
    html = setValue(html, ogProperty("og:type"), `<meta property="og:type" content="__VALUE__" />`, "website");
    html = setValue(html, ogProperty("og:image:alt"), `<meta property="og:image:alt" content="__VALUE__" />`, clean(group.name));

    html = setValue(html, metaName("twitter:title"), `<meta name="twitter:title" content="__VALUE__" />`, title);
    html = setValue(html, metaName("twitter:description"), `<meta name="twitter:description" content="__VALUE__" />`, description);
    html = setValue(html, metaName("twitter:image"), `<meta name="twitter:image" content="__VALUE__" />`, image);

    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: clean(group.name),
      description,
      url: pageUrl,
      image,
      memberOf: { "@type": "Organization", name: "Edutu", url: `${SITE}/communities` },
    };
    if (!/application\/ld\+json/i.test(html)) {
      html = html.replace(
        /<\/head>/i,
        `  <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>\n</head>`,
      );
    }
  } catch {
    return new Response(html, response);
  }

  const headers = new Headers(response.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "public, max-age=0, s-maxage=300, stale-while-revalidate=600");
  return new Response(html, { status: response.status, headers });
}
```

- [ ] **Step 5: Expose the JSON projection the edge function needs**

The edge function reads `GET /communities/g/:slug/public`. Add that route to the SEO controller by
appending this method to `backend/services/services/api/src/communities/community-group-og.controller.ts`
(same class):

```ts
  /**
   * JSON twin of the HTML page, for the Netlify edge function (which injects
   * into Netlify's own HTML rather than proxying to us).
   */
  @Public()
  @Throttle({ default: { limit: 300, ttl: 60000 } })
  @Get("/communities/g/:slug/public")
  async publicProjection(@Param("slug") slug: string): Promise<PublicGroupPage | null> {
    return this.seo.getPublicGroupPage(slug);
  }
```

A leading `/` on the `@Get` path makes it absolute, escaping the `og` controller prefix — verify:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npm run build && node dist/main 2>&1 | grep "communities/g" | head -3
```

Expected: a mapped-route line containing `/communities/g/:slug/public`.

- [ ] **Step 6: Register the edge function in `netlify.toml`**

Add to `edutu-web-app/netlify.toml`, directly after the existing `[[edge_functions]]` blocks:

```toml
# Per-group Open Graph for shared /communities/g/<slug> links (same idea as the
# opportunity unfurl: static SPA HTML alone carries only the generic OG image).
[[edge_functions]]
  path = "/communities/g/*"
  function = "group-og"
```

- [ ] **Step 7: Emit group URLs from the sitemap generator**

In `edutu-web-app/scripts/generate-sitemap.mjs`:

Add this function immediately after `fetchBackendEvents`:

```js
async function fetchBackendGroups() {
  if (!apiBaseUrl || typeof fetch !== "function") {
    return [];
  }

  try {
    const url = new URL("/communities/groups", apiBaseUrl);
    url.searchParams.set("limit", "500");
    url.searchParams.set("visibility", "public");

    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      return [];
    }

    return extractRows(await response.json())
      .map((row) => {
        const slug = row?.slug;
        if (!slug) return null;
        return {
          slug: String(slug),
          updatedAt:
            row.lastMessageAt ||
            row.last_message_at ||
            row.updated_at ||
            row.createdAt ||
            row.created_at ||
            null,
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}
```

Change the `Promise.all` in `main()` to:

```js
  const [snapshotOpportunities, backendOpportunities, backendEvents, backendGroups] =
    await Promise.all([
      readSnapshotOpportunities(),
      fetchBackendOpportunities(),
      fetchBackendEvents(),
      fetchBackendGroups(),
    ]);
```

Add these entries to the `urls` array, immediately after the `/events` entry:

```js
    {
      loc: toAbsoluteUrl("/communities"),
      lastmod: today,
      changefreq: "daily",
      priority: "0.9",
    },
```

and after the events `map`:

```js
    ...backendGroups.map((group) => ({
      loc: toAbsoluteUrl(`/communities/g/${encodeURIComponent(group.slug)}`),
      lastmod: toLastmod(group.updatedAt),
      changefreq: "daily",
      priority: "0.7",
    })),
```

Finally, keep `/communities/g/` crawlable in the generated `robots.txt` — the existing
`Disallow: /app/` already excludes the in-app shell, and `/communities` is **not** under `/app/`, so
no robots change is needed. Confirm by inspection of the `robots` array in the same file.

- [ ] **Step 8: Regenerate and verify the sitemap**

Run:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npm run seo:sitemap
grep -c "/communities" public/sitemap.xml
grep -c "Disallow: /communities" public/robots.txt
```

Expected: `Generated sitemap with N URLs at https://www.edutu.org.`, a `/communities` count `>= 1`,
and a `Disallow: /communities` count of `0`.

- [ ] **Step 9: Run the wiring test to verify it passes**

Run: `cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app && npx vitest run src/test/__tests__/groupSeoWiring.test.ts`

Expected: PASS — `Tests 5 passed`

- [ ] **Step 10: Post-deploy production health check (run after the backend is live on Render)**

```bash
curl -sI https://www.edutu.org/communities/g/<a-real-public-slug> | grep -i x-og-source
curl -s https://www.edutu.org/communities/g/<a-real-public-slug> | grep -A2 -i 'og:title'
curl -s https://www.edutu.org/sitemap.xml | grep -c "/communities/g/"
```

Expected: `X-Og-Source: backend/og-shell`; an `og:title` containing the group's name (**grep with
`-A2` — the shell's meta tags are multi-line**); a group-URL count `>= 1`.

- [ ] **Step 11: Commit**

```bash
git add vercel.json \
        edutu-web-app/netlify/edge-functions/group-og.ts \
        edutu-web-app/netlify.toml \
        edutu-web-app/scripts/generate-sitemap.mjs \
        edutu-web-app/public/sitemap.xml edutu-web-app/public/robots.txt \
        edutu-web-app/src/test/__tests__/groupSeoWiring.test.ts \
        backend/services/services/api/src/communities/community-group-og.controller.ts
git commit -m "feat(communities): route and index public group pages on Vercel and Netlify"
```

---

## Task 10: Launch seeding — 20 anchored groups with pre-loaded Briefs

**Files:**
- Create: `backend/services/services/api/src/communities/community-seed.service.ts`
- Create: `backend/services/services/api/src/communities/community-seed.service.spec.ts`
- Create: `backend/services/services/api/scripts/seed-launch-groups.ts`
- Modify: `backend/services/services/api/src/communities/communities.module.ts`

> **The spec said "highest `opportunity_applications` volume". The live data does not support that
> alone.** Verified against production on 2026-07-25: `opportunity_applications` holds **43 rows
> across 38 distinct opportunities** — ranking by it would mostly be a coin flip between
> one-application rows. `user_opportunity_signals` has **322 rows** and the two bookmark tables add
> 19 more. So the seeder ranks by a **composite demand score** with applications weighted highest, and
> falls back to freshness when demand data is thin. Applications remain the primary signal exactly as
> the spec intends; the composite just stops the list being noise at today's volumes.
>
> Weights: `application = 5`, `signal = 2`, `bookmark = 3`. Ties break on `close_date` ascending
> (soonest deadline first — the group with the most urgency is worth the most).

> ### Scam-gate exclusion — non-negotiable
>
> **A seeded group is an Edutu-branded endorsement.** Seeding one around a listing the scraper's scam
> gate flagged would be the worst possible launch bug: a scam wearing our badge, with a pre-written
> Brief and 20 members pushed at it.
>
> `origin/main`'s `src/scraper/opportunity-dedup.service.ts` already stores a verdict on every record.
> **Read the stored verdict — never re-run detection here.** The gate is the single source of truth
> and it uses an LLM upstream; a second, divergent implementation in the seeder is how the two drift
> apart silently.
>
> The trap: `decideScamGate` only caps `active → pending_review` at **≥2 flags**
> (`SCAM_GATE_CAP_THRESHOLD = 2`). A listing with **exactly one** flag keeps `status = 'active'` and is
> merely annotated. So `o.status = 'active'` **does not** exclude flagged listings. The seeder must
> exclude any opportunity where **any** of these is true:
>
> | Signal | Written by |
> |---|---|
> | `metadata.needs_review = true` | domain-trust gate **and** scam gate |
> | `metadata.scam_risk` present | scam gate (`{ flags, count }`) |
> | `metadata.red_flags` non-empty | the upstream LLM enrichment `extractRedFlags` reads |
>
> Belt and braces, both layers required: an SQL predicate (so flagged rows never enter the candidate
> set or the ranking) **and** a TypeScript re-check with the gate's own
> `extractRedFlags(row.metadata)` before any write (so a row that slipped past the SQL — new metadata
> shape, gate updated, `red_flags` written after selection — is still dropped). The count of rows
> dropped this way is reported as `skippedFlagged` and printed by the script.

**Interfaces:**
- Consumes: the Task-1 `seed_key` column and its partial unique index.
- Produces:
  ```ts
  export interface SeedCandidate {
    opportunityId: string; title: string; organization: string | null;
    category: string | null; closeDate: string | null; demandScore: number;
  }
  export interface SeedOutcome {
    created: number; skipped: number; skippedFlagged: number;
    groups: Array<{ opportunityId: string; groupId: string; slug: string; created: boolean }>;
  }
  export class CommunitySeedService {
    listCandidates(limit?: number): Promise<SeedCandidate[]>;
    seedGroups(input?: { limit?: number; ownerUserId?: string; dryRun?: boolean }): Promise<SeedOutcome>;
  }
  ```
- Also consumes: `extractRedFlags` from `../scraper/opportunity-dedup.service` (exists on `origin/main`).

- [ ] **Step 1: Write the failing seed tests**

Create `backend/services/services/api/src/communities/community-seed.service.spec.ts`:

```ts
import { db } from "../db";
import { CommunitySeedService } from "./community-seed.service";

jest.mock("../db", () => ({ db: { execute: jest.fn() } }));
const mockedDb = db as unknown as { execute: jest.Mock };

const collectSqlText = (expression: any): string => {
  if (!expression?.queryChunks) return "";
  return expression.queryChunks
    .map((chunk: any) =>
      Array.isArray(chunk?.value) ? chunk.value.join("") : collectSqlText(chunk),
    )
    .join("");
};

const candidate = (over: Record<string, unknown> = {}) => ({
  opportunity_id: "op-1",
  title: "Chevening Scholarships 2027",
  organization: "UK Government",
  category: "scholarships",
  close_date: "2026-11-05",
  description: "Fully funded UK master's degrees for future leaders.",
  metadata: {},
  demand_score: 17,
  ...over,
});

describe("CommunitySeedService", () => {
  let service: CommunitySeedService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new CommunitySeedService();
  });

  it("ranks candidates by a weighted composite of applications, bookmarks and signals", async () => {
    mockedDb.execute.mockResolvedValue({ rows: [candidate()] });
    await service.listCandidates(20);

    const text = collectSqlText(mockedDb.execute.mock.calls[0][0]).toLowerCase();
    expect(text).toContain("opportunity_applications");
    expect(text).toContain("user_opportunity_signals");
    expect(text).toContain("opportunity_bookmarks");
    expect(text).toContain("5 *");
    expect(text).toContain("3 *");
    expect(text).toContain("2 *");
    // Only live, still-open opportunities are worth a group.
    expect(text).toContain("o.status = 'active'");
    expect(text).toContain("o.close_date >= current_date");
  });

  // ── SCAM GATE ────────────────────────────────────────────────────────────
  it("excludes scam-gate-flagged listings in SQL, on all three stored signals", async () => {
    mockedDb.execute.mockResolvedValue({ rows: [candidate()] });
    await service.listCandidates(20);

    const text = collectSqlText(mockedDb.execute.mock.calls[0][0]).toLowerCase();
    // status='active' is NOT sufficient: decideScamGate only caps at >=2 flags,
    // so a single-flag listing stays 'active' and is merely annotated.
    expect(text).toContain("needs_review");
    expect(text).toContain("scam_risk");
    expect(text).toContain("red_flags");
  });

  it("drops a flagged row that slipped past SQL, using the gate's own extractRedFlags", async () => {
    mockedDb.execute
      .mockResolvedValueOnce({
        rows: [
          candidate({ metadata: { red_flags: ["asks for an application fee"] } }),
          candidate({ opportunity_id: "op-2", title: "MTN Scholars", metadata: {} }),
        ],
      })
      .mockResolvedValueOnce({ rows: [] })                               // no existing seeds
      .mockResolvedValueOnce({ rows: [{ id: "grp-2", slug: "mtn-scholars" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const outcome = await service.seedGroups({ limit: 20, ownerUserId: "user_admin" });

    expect(outcome.skippedFlagged).toBe(1);
    expect(outcome.created).toBe(1);
    expect(outcome.groups.find((g) => g.opportunityId === "op-1")).toMatchObject({
      created: false,
    });
  });

  it("drops a row annotated needs_review even when red_flags is absent", async () => {
    mockedDb.execute
      .mockResolvedValueOnce({ rows: [candidate({ metadata: { needs_review: true } })] })
      .mockResolvedValueOnce({ rows: [] });

    const outcome = await service.seedGroups({ limit: 20, ownerUserId: "user_admin" });

    expect(outcome.skippedFlagged).toBe(1);
    expect(outcome.created).toBe(0);
    // Nothing beyond the two SELECTs ran — no group was inserted.
    expect(mockedDb.execute).toHaveBeenCalledTimes(2);
  });

  it("skips an opportunity whose seeded group already exists (re-run safety)", async () => {
    mockedDb.execute
      .mockResolvedValueOnce({ rows: [candidate()] })                    // candidates
      .mockResolvedValueOnce({ rows: [{ seed_key: "launch-seed:op-1" }] }); // existing

    const outcome = await service.seedGroups({ limit: 20, ownerUserId: "user_admin" });

    expect(outcome.created).toBe(0);
    expect(outcome.skipped).toBe(1);
    expect(outcome.groups[0]).toMatchObject({ opportunityId: "op-1", created: false });
    // No INSERT was attempted at all.
    expect(mockedDb.execute).toHaveBeenCalledTimes(2);
  });

  it("creates a group, an owner membership and a deterministic Brief", async () => {
    mockedDb.execute
      .mockResolvedValueOnce({ rows: [candidate()] })   // candidates
      .mockResolvedValueOnce({ rows: [] })              // no existing seeds
      .mockResolvedValueOnce({                          // insert group
        rows: [{ id: "grp-1", slug: "chevening-scholarships-2027" }],
      })
      .mockResolvedValueOnce({ rows: [] })              // owner membership
      .mockResolvedValueOnce({                          // notes for the Brief
        rows: [
          { kind: "tip", body: "Start the leadership essay early." },
          { kind: "result", body: "Got in with a 2:1 and three years of work." },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });             // insert brief

    const outcome = await service.seedGroups({ limit: 20, ownerUserId: "user_admin" });

    expect(outcome.created).toBe(1);
    expect(outcome.skipped).toBe(0);

    const insertText = collectSqlText(mockedDb.execute.mock.calls[2][0]).toLowerCase();
    expect(insertText).toContain("seed_key");
    expect(insertText).toContain("on conflict");
    expect(insertText).toContain("do nothing");

    const briefText = collectSqlText(mockedDb.execute.mock.calls[5][0]).toLowerCase();
    expect(briefText).toContain("into public.community_briefs");
    expect(briefText).toContain("is_stale");
  });

  it("builds the Brief from the opportunity description AND its existing Notes", () => {
    const brief = service.buildSeedBrief(
      {
        opportunityId: "op-1",
        title: "Chevening Scholarships 2027",
        organization: "UK Government",
        category: "scholarships",
        closeDate: "2026-11-05",
        demandScore: 17,
      },
      "Fully funded UK master's degrees for future leaders.",
      [
        { kind: "tip", body: "Start the leadership essay early." },
        { kind: "question", body: "Does work experience have to be paid?" },
        { kind: "result", body: "Got in with a 2:1 and three years of work." },
      ],
    );

    const headings = brief.sections.map((section) => section.heading);
    expect(headings).toEqual([
      "What this is",
      "Key dates",
      "What wins",
      "Common mistakes",
      "Open questions",
      "Who's applying",
    ]);
    expect(JSON.stringify(brief)).toContain("Fully funded UK master's degrees");
    expect(JSON.stringify(brief)).toContain("Start the leadership essay early");
    expect(JSON.stringify(brief)).toContain("Does work experience have to be paid?");
    // Seeded lines have no chat message to cite, so citations must be empty —
    // never fabricated (spec §13, "Brief hallucination damaging trust").
    for (const section of brief.sections) {
      for (const bullet of section.bullets) {
        expect(bullet.citations).toEqual([]);
      }
    }
  });

  it("writes nothing at all in dry-run mode", async () => {
    mockedDb.execute
      .mockResolvedValueOnce({ rows: [candidate()] })
      .mockResolvedValueOnce({ rows: [] });

    const outcome = await service.seedGroups({ limit: 20, ownerUserId: "user_admin", dryRun: true });

    expect(outcome.created).toBe(0);
    expect(mockedDb.execute).toHaveBeenCalledTimes(2);
    expect(outcome.groups[0]).toMatchObject({ opportunityId: "op-1", created: false });
  });

  it("keeps going when one opportunity fails to seed", async () => {
    mockedDb.execute
      .mockResolvedValueOnce({ rows: [candidate(), candidate({ opportunity_id: "op-2", title: "MTN Scholars" })] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error("insert exploded"))               // op-1 group insert
      .mockResolvedValueOnce({ rows: [{ id: "grp-2", slug: "mtn-scholars" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const outcome = await service.seedGroups({ limit: 20, ownerUserId: "user_admin" });

    expect(outcome.created).toBe(1);
    expect(outcome.groups.map((group) => group.opportunityId)).toEqual(["op-1", "op-2"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api && npx jest src/communities/community-seed.service.spec.ts`

Expected: FAIL — `Cannot find module './community-seed.service'`

- [ ] **Step 3: Write the seed service**

Create `backend/services/services/api/src/communities/community-seed.service.ts`:

```ts
import { Injectable, Logger } from "@nestjs/common";
import { randomBytes } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
// The scraper's scam gate is the single source of truth for whether a listing
// is safe to endorse. Read its STORED verdict; never re-implement detection.
import { extractRedFlags } from "../scraper/opportunity-dedup.service";

export interface SeedCandidate {
  opportunityId: string;
  title: string;
  organization: string | null;
  category: string | null;
  closeDate: string | null;
  demandScore: number;
}

export interface SeedBriefBullet {
  text: string;
  citations: Array<{ messageId: string; excerpt: string }>;
}

export interface SeedBrief {
  sections: Array<{ heading: string; bullets: SeedBriefBullet[] }>;
}

export interface SeedOutcome {
  created: number;
  skipped: number;
  /** Rows the scraper's scam gate had flagged — never seeded. */
  skippedFlagged: number;
  groups: Array<{
    opportunityId: string;
    groupId: string;
    slug: string;
    created: boolean;
  }>;
}

interface CandidateRow {
  opportunity_id: string;
  title: string;
  organization: string | null;
  category: string | null;
  close_date: string | null;
  description: string | null;
  metadata: unknown;
  demand_score: number | string | null;
}

interface NoteRow {
  kind: string;
  body: string;
}

const DEFAULT_SEED_LIMIT = 20;
const SEED_KEY_PREFIX = "launch-seed:";
const SEED_OWNER_ENV = "COMMUNITY_SEED_OWNER_USER_ID";

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "group"
  );
}

function bullet(text: string): SeedBriefBullet {
  // A seeded line has no chat message behind it. Empty citations is the honest
  // answer; a fabricated citation is the exact failure mode spec §13 warns about.
  return { text: text.replace(/\s+/g, " ").trim(), citations: [] };
}

/**
 * Launch seeding (spec §13, empty-room risk).
 *
 * Creates one anchored group per high-demand live opportunity, each with a
 * deterministically-built Brief drawn from that opportunity's description and
 * its existing Notes. Deterministic on purpose: no LLM spend, no
 * non-reproducible output, and `is_stale = true` so Slice 4's normal
 * regeneration replaces it the moment the room produces real material.
 *
 * Safely re-runnable: every seeded group carries
 * `seed_key = 'launch-seed:<opportunityId>'`, which has a partial UNIQUE index.
 * A second run skips what exists and only fills gaps.
 */
@Injectable()
export class CommunitySeedService {
  private readonly logger = new Logger(CommunitySeedService.name);

  /**
   * SQL half of the scam-gate exclusion. Reads the verdict the scraper already
   * stored — `metadata.needs_review`, `metadata.scam_risk`, `metadata.red_flags`.
   *
   * `o.status = 'active'` is NOT sufficient on its own: decideScamGate only
   * caps active -> pending_review at SCAM_GATE_CAP_THRESHOLD (2) flags, so a
   * single-flag listing stays active and is merely annotated.
   *
   * `needs_review` is compared as text, not cast to boolean — a malformed
   * stored value must exclude the row, never throw mid-query.
   */
  private notScamFlagged() {
    return sql`
      and coalesce(o.metadata->>'needs_review', 'false') not in ('true', 't', '1')
      and o.metadata->'scam_risk' is null
      and coalesce(
            jsonb_array_length(
              case when jsonb_typeof(o.metadata->'red_flags') = 'array'
                   then o.metadata->'red_flags'
                   else '[]'::jsonb end
            ), 0) = 0
    `;
  }

  /**
   * TypeScript half, run immediately before any write. Catches a row the SQL
   * missed (metadata shape change, gate updated, red_flags written between
   * selection and insert) by asking the gate's own helper.
   */
  private isScamFlagged(metadata: unknown): boolean {
    if (extractRedFlags(metadata).length > 0) return true;
    if (!metadata || typeof metadata !== "object") return false;
    const record = metadata as Record<string, unknown>;
    if (record.scam_risk) return true;
    const needsReview = record.needs_review;
    return needsReview === true || needsReview === "true";
  }

  /**
   * Composite demand ranking. Applications are the primary signal the spec
   * names (weight 5), but at current volumes (43 rows) they cannot order 20
   * groups on their own, so bookmarks (3) and interaction signals (2) break
   * the ties. Soonest deadline wins on an exact tie.
   */
  async listCandidates(limit = DEFAULT_SEED_LIMIT): Promise<SeedCandidate[]> {
    const result = await db.execute(sql`
      with demand as (
        select o.id as opportunity_id,
               5 * coalesce(apps.n, 0)
                 + 3 * coalesce(marks.n, 0)
                 + 2 * coalesce(signals.n, 0) as demand_score
        from public.opportunities o
        left join (
          select opportunity_id, count(*)::int as n
          from public.opportunity_applications group by opportunity_id
        ) apps on apps.opportunity_id = o.id
        left join (
          select opportunity_id, count(*)::int as n from (
            select opportunity_id from public.opportunity_bookmarks
            union all
            select opportunity_id from public.bookmarks
          ) all_marks group by opportunity_id
        ) marks on marks.opportunity_id = o.id
        left join (
          select opportunity_id, count(*)::int as n
          from public.user_opportunity_signals group by opportunity_id
        ) signals on signals.opportunity_id = o.id
        where o.status = 'active'
          and (o.close_date is null or o.close_date >= current_date)
          ${this.notScamFlagged()}
      )
      select o.id as opportunity_id,
             o.title,
             o.organization,
             o.category,
             o.close_date::text as close_date,
             coalesce(o.ai_summary, o.summary, o.description) as description,
             o.metadata,
             demand.demand_score
      from demand
      join public.opportunities o on o.id = demand.opportunity_id
      order by demand.demand_score desc,
               o.close_date asc nulls last,
               o.created_at desc
      limit ${limit}
    `);

    // `description` stays on the raw row — seedGroups re-runs this same query
    // and needs it for the Brief, but callers of listCandidates only want the
    // ranking view.
    return this.rows<CandidateRow>(result).map((row) => this.toCandidate(row));
  }

  private toCandidate(row: CandidateRow): SeedCandidate {
    return {
      opportunityId: row.opportunity_id,
      title: row.title,
      organization: row.organization ?? null,
      category: row.category ?? null,
      closeDate: row.close_date ?? null,
      demandScore: Number(row.demand_score ?? 0),
    };
  }

  async seedGroups(
    input: { limit?: number; ownerUserId?: string; dryRun?: boolean } = {},
  ): Promise<SeedOutcome> {
    const limit = input.limit ?? DEFAULT_SEED_LIMIT;
    const owner = input.ownerUserId || process.env[SEED_OWNER_ENV] || "";
    if (!owner && !input.dryRun) {
      throw new Error(
        `A seed owner is required. Pass --owner=<raw Clerk sub> or set ${SEED_OWNER_ENV}.`,
      );
    }

    const rows = this.rows<CandidateRow>(
      await db.execute(sql`
        with demand as (
          select o.id as opportunity_id,
                 5 * coalesce(apps.n, 0)
                   + 3 * coalesce(marks.n, 0)
                   + 2 * coalesce(signals.n, 0) as demand_score
          from public.opportunities o
          left join (
            select opportunity_id, count(*)::int as n
            from public.opportunity_applications group by opportunity_id
          ) apps on apps.opportunity_id = o.id
          left join (
            select opportunity_id, count(*)::int as n from (
              select opportunity_id from public.opportunity_bookmarks
              union all
              select opportunity_id from public.bookmarks
            ) all_marks group by opportunity_id
          ) marks on marks.opportunity_id = o.id
          left join (
            select opportunity_id, count(*)::int as n
            from public.user_opportunity_signals group by opportunity_id
          ) signals on signals.opportunity_id = o.id
          where o.status = 'active'
            and (o.close_date is null or o.close_date >= current_date)
            ${this.notScamFlagged()}
        )
        select o.id as opportunity_id,
               o.title,
               o.organization,
               o.category,
               o.close_date::text as close_date,
               coalesce(o.ai_summary, o.summary, o.description) as description,
               o.metadata,
               demand.demand_score
        from demand
        join public.opportunities o on o.id = demand.opportunity_id
        order by demand.demand_score desc,
                 o.close_date asc nulls last,
                 o.created_at desc
        limit ${limit}
      `),
    );

    const seedKeys = rows.map((row) => `${SEED_KEY_PREFIX}${row.opportunity_id}`);
    const existing = new Set(
      this.rows<{ seed_key: string }>(
        await db.execute(sql`
          select seed_key from public.community_groups
          where seed_key = any(${seedKeys}::text[])
        `),
      ).map((row) => row.seed_key),
    );

    const outcome: SeedOutcome = { created: 0, skipped: 0, skippedFlagged: 0, groups: [] };

    for (const row of rows) {
      const seedKey = `${SEED_KEY_PREFIX}${row.opportunity_id}`;

      // A seeded group is an Edutu-branded endorsement. Never wrap one around a
      // listing the scam gate flagged, whatever the SQL let through.
      if (this.isScamFlagged(row.metadata)) {
        outcome.skippedFlagged += 1;
        this.logger.warn(
          `Refusing to seed a group for flagged opportunity ${row.opportunity_id} (${row.title}) — scam gate verdict present`,
        );
        outcome.groups.push({
          opportunityId: row.opportunity_id,
          groupId: "",
          slug: "",
          created: false,
        });
        continue;
      }

      if (existing.has(seedKey)) {
        outcome.skipped += 1;
        outcome.groups.push({
          opportunityId: row.opportunity_id,
          groupId: "",
          slug: "",
          created: false,
        });
        continue;
      }
      if (input.dryRun) {
        outcome.groups.push({
          opportunityId: row.opportunity_id,
          groupId: "",
          slug: "",
          created: false,
        });
        continue;
      }

      try {
        const created = await this.createSeededGroup(row, owner, seedKey);
        outcome.created += 1;
        outcome.groups.push({ ...created, opportunityId: row.opportunity_id, created: true });
      } catch (error) {
        // One bad row must never abort the remaining nineteen.
        this.logger.warn(
          `Could not seed a group for opportunity ${row.opportunity_id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        outcome.groups.push({
          opportunityId: row.opportunity_id,
          groupId: "",
          slug: "",
          created: false,
        });
      }
    }

    return outcome;
  }

  private async createSeededGroup(
    row: CandidateRow,
    owner: string,
    seedKey: string,
  ): Promise<{ groupId: string; slug: string }> {
    const name = row.title.slice(0, 80);
    const slug = `${slugify(name)}-${randomBytes(3).toString("hex")}`;
    // Expiry = deadline + 30 days grace (spec §6.3).
    const expiresAt = row.close_date
      ? new Date(new Date(row.close_date).getTime() + 30 * 86_400_000).toISOString()
      : null;

    const inserted = this.rows<{ id: string; slug: string }>(
      await db.execute(sql`
        insert into public.community_groups
          (space_id, slug, name, description, visibility, join_policy,
           opportunity_id, created_by, member_count, message_count,
           status, expires_at, seed_key, created_at)
        select s.id, ${slug}, ${name},
               ${`The crew applying to ${row.title}. Deadlines, a shared Brief and people who have done it before.`},
               'public', 'open', ${row.opportunity_id}, ${owner}, 1, 0,
               'active', ${expiresAt}, ${seedKey}, now()
        from public.community_spaces s
        where s.slug = ${row.category ?? "scholarships"}
           or s.slug = 'scholarships'
        order by (s.slug = ${row.category ?? "scholarships"}) desc
        limit 1
        on conflict (seed_key) where seed_key is not null do nothing
        returning id, slug
      `),
    )[0];

    if (!inserted) {
      // Another concurrent run won the race — that is a successful no-op.
      return { groupId: "", slug: "" };
    }

    await db.execute(sql`
      insert into public.community_group_members (group_id, user_id, role, joined_at)
      values (${inserted.id}, ${owner}, 'owner', now())
      on conflict (group_id, user_id) do nothing
    `);

    const notes = this.rows<NoteRow>(
      await db.execute(sql`
        select kind, body
        from public.opportunity_notes
        where opportunity_id = ${row.opportunity_id}
          and status = 'published'
        order by helpful_count desc, created_at desc
        limit 30
      `),
    );

    const brief = this.buildSeedBrief(
      this.toCandidate(row),
      row.description ?? "",
      notes,
    );

    await db.execute(sql`
      insert into public.community_briefs
        (group_id, content, citations, version, generated_at,
         generated_from_count, model, is_stale)
      values
        (${inserted.id}, ${JSON.stringify(brief)}::jsonb, '{}'::jsonb, 1, now(),
         ${notes.length}, 'seed:deterministic', true)
      on conflict (group_id) do nothing
    `);

    return { groupId: inserted.id, slug: inserted.slug };
  }

  /** The six Brief sections from spec §7, filled from real data only. */
  buildSeedBrief(
    candidate: SeedCandidate,
    description: string,
    notes: NoteRow[],
  ): SeedBrief {
    const tips = notes.filter((note) => note.kind === "tip").map((note) => note.body);
    const questions = notes.filter((note) => note.kind === "question").map((note) => note.body);
    const results = notes.filter((note) => note.kind === "result").map((note) => note.body);

    const whatThisIs = [
      candidate.organization
        ? `${candidate.title} — run by ${candidate.organization}.`
        : candidate.title,
      description.replace(/\s+/g, " ").trim().slice(0, 500),
    ].filter(Boolean);

    const keyDates = candidate.closeDate
      ? [`Applications close ${candidate.closeDate}. The group archives 30 days later.`]
      : ["No published deadline yet — the group will post one as soon as it lands."];

    return {
      sections: [
        { heading: "What this is", bullets: whatThisIs.map(bullet) },
        { heading: "Key dates", bullets: keyDates.map(bullet) },
        {
          heading: "What wins",
          bullets: (tips.length > 0
            ? tips.slice(0, 5)
            : ["Nobody has shared a winning tip yet. Be the first — post one in chat and ✦save it."]
          ).map(bullet),
        },
        {
          heading: "Common mistakes",
          bullets: [
            "Leaving the application to the final 48 hours — portals throttle and referees go quiet.",
            "Reusing a generic personal statement instead of answering this programme's actual question.",
          ].map(bullet),
        },
        {
          heading: "Open questions",
          bullets: (questions.length > 0
            ? questions.slice(0, 5)
            : ["No open questions yet. Ask yours in chat — someone here has probably already solved it."]
          ).map(bullet),
        },
        {
          heading: "Who's applying",
          bullets: (results.length > 0
            ? results.slice(0, 5)
            : [`${candidate.demandScore} demand signals so far on Edutu. Say hi and share where you are.`]
          ).map(bullet),
        },
      ],
    };
  }

  private rows<T>(result: unknown): T[] {
    if (Array.isArray(result)) return result as T[];
    return (result as { rows?: T[] }).rows ?? [];
  }
}
```

- [ ] **Step 4: Run the seed tests to verify they pass**

Run: `cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api && npx jest src/communities/community-seed.service.spec.ts`

Expected: PASS — `Tests: 9 passed, 9 total`

- [ ] **Step 5: Register the service**

In `backend/services/services/api/src/communities/communities.module.ts`, add:

```ts
import { CommunitySeedService } from "./community-seed.service";
```

and put `CommunitySeedService` in both `providers` and `exports`.

- [ ] **Step 6: Write the runner script**

Create `backend/services/services/api/scripts/seed-launch-groups.ts`:

```ts
/**
 * Launch seeding: create anchored groups for the highest-demand live
 * opportunities, each with a deterministic Brief built from that
 * opportunity's description and its existing Notes.
 *
 * SAFELY RE-RUNNABLE. Every seeded group carries a unique
 * `seed_key = 'launch-seed:<opportunityId>'`; a second run skips what exists.
 *
 *   # see what it would do, touching nothing
 *   npx ts-node -r tsconfig-paths/register scripts/seed-launch-groups.ts --dry-run
 *
 *   # do it (owner must be a RAW Clerk sub, e.g. user_2abc…)
 *   npx ts-node -r tsconfig-paths/register scripts/seed-launch-groups.ts \
 *     --owner=user_2abcDEF --limit=20
 */
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { CommunitySeedService } from "../src/communities/community-seed.service";

function flag(name: string): string | undefined {
  const match = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return match?.split("=").slice(1).join("=");
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limit = Number(flag("limit")) || 20;
  const owner = flag("owner") || process.env.COMMUNITY_SEED_OWNER_USER_ID;

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["log", "warn", "error"],
  });

  try {
    const seeder = app.get(CommunitySeedService);

    const candidates = await seeder.listCandidates(limit);
    console.log(`── Top ${candidates.length} opportunities by demand ──`);
    candidates.forEach((candidate, index) => {
      console.log(
        `  ${String(index + 1).padStart(2)}. [${candidate.demandScore}] ${candidate.title}` +
          (candidate.closeDate ? `  (closes ${candidate.closeDate})` : ""),
      );
    });

    const outcome = await seeder.seedGroups({ limit, ownerUserId: owner, dryRun });

    console.log("\n══ SEED RESULT ══");
    console.log(
      JSON.stringify(
        {
          dryRun,
          created: outcome.created,
          skipped: outcome.skipped,
          skippedFlagged: outcome.skippedFlagged,
        },
        null,
        2,
      ),
    );
    if (outcome.skippedFlagged > 0) {
      console.log(
        `\n⚠  ${outcome.skippedFlagged} opportunit${outcome.skippedFlagged === 1 ? "y was" : "ies were"} skipped: the scraper's scam gate has flagged them.`,
      );
    }
    for (const group of outcome.groups) {
      console.log(
        `  ${group.created ? "created" : "skipped"}  ${group.opportunityId}  ${group.slug}`,
      );
    }
    if (dryRun) console.log("\n(dry run — nothing was written)");
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 7: Prove re-runnability against the live database**

Run:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx ts-node -r tsconfig-paths/register scripts/seed-launch-groups.ts --dry-run
```

Expected: a ranked list of up to 20 opportunities, then
`"created": 0, "skipped": 0, "skippedFlagged": 0` and `(dry run — nothing was written)`.

Sanity-check the scam-gate exclusion while you are here — no listing in the printed ranking may be
flagged:

```sql
select count(*) as flagged_in_top_ranking
from public.opportunities o
where o.status = 'active'
  and (o.close_date is null or o.close_date >= current_date)
  and (
    coalesce(o.metadata->>'needs_review', 'false') in ('true','t','1')
    or o.metadata->'scam_risk' is not null
    or coalesce(jsonb_array_length(
         case when jsonb_typeof(o.metadata->'red_flags') = 'array'
              then o.metadata->'red_flags' else '[]'::jsonb end), 0) > 0
  );
```

Any non-zero count here is the population the seeder must be excluding. Cross-check that none of
those titles appears in the ranked list the dry run printed.

Then the real run, twice:

```bash
npx ts-node -r tsconfig-paths/register scripts/seed-launch-groups.ts --owner=<RAW_CLERK_SUB> --limit=20
npx ts-node -r tsconfig-paths/register scripts/seed-launch-groups.ts --owner=<RAW_CLERK_SUB> --limit=20
```

Expected: the first run reports `"created": 20, "skipped": 0`; **the second reports
`"created": 0, "skipped": 20`** — that is the re-runnability proof. `skippedFlagged` should be `0` on
both runs (flagged rows are excluded in SQL before ranking; a non-zero value means a row's metadata
changed between selection and insert, which is exactly what the TypeScript guard is there for).

- [ ] **Step 8: Confirm in the database**

Run:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
npx supabase db push --dry-run >/dev/null && echo "migrations current"
```

then in the Supabase SQL editor:

```sql
select count(*) as seeded_groups from public.community_groups where seed_key is not null;
select count(*) as seeded_briefs
from public.community_briefs b
join public.community_groups g on g.id = b.group_id
where g.seed_key is not null;
```

Expected: both counts equal 20.

- [ ] **Step 9: Commit**

```bash
git add backend/services/services/api/src/communities/community-seed.service.ts \
        backend/services/services/api/src/communities/community-seed.service.spec.ts \
        backend/services/services/api/scripts/seed-launch-groups.ts \
        backend/services/services/api/src/communities/communities.module.ts
git commit -m "feat(communities): re-runnable launch seeding for the 20 highest-demand opportunities"
```

---

## Task 11: Admin — Lineage & Seeding page

**Files:**
- Create: `backend/services/services/api/src/communities/community-lineage.service.ts`
- Create: `backend/services/services/api/src/communities/community-lineage.service.spec.ts`
- Create: `backend/services/services/api/src/communities/community-admin.controller.ts`
- Modify: `backend/services/services/api/src/communities/communities.module.ts`
- Create: `admin/src/lib/communitiesApi.ts`
- Create: `admin/src/pages/CommunityLineage.tsx`
- Create: `admin/src/test/__tests__/communityLineage.test.tsx`
- Modify: `admin/src/components/nav-items.tsx`, `admin/src/App.tsx`

**Interfaces:**
- Consumes: `AdminGuard` from `../auth`, the Task-1 columns.
- Produces:
  ```ts
  export interface LineageChain {
    rootGroupId: string;
    groups: Array<{ id: string; slug: string; name: string; status: string;
                    memberCount: number; carriedForwardAt: string | null }>;
  }
  export interface SeededGroupRow {
    id: string; slug: string; name: string; seedKey: string;
    opportunityTitle: string | null; memberCount: number;
    messageCount: number; hasBrief: boolean; createdAt: string;
  }
  export interface CommunityLineageResponse {
    chains: LineageChain[]; seeded: SeededGroupRow[];
    stats: { carriedForwardGroups: number; seededGroups: number; seededWithActivity: number };
  }
  // GET /admin/communities/lineage
  ```

- [ ] **Step 1: Write the failing lineage-service tests**

Create `backend/services/services/api/src/communities/community-lineage.service.spec.ts`:

```ts
import { db } from "../db";
import { CommunityLineageService } from "./community-lineage.service";

jest.mock("../db", () => ({ db: { execute: jest.fn() } }));
const mockedDb = db as unknown as { execute: jest.Mock };

describe("CommunityLineageService", () => {
  let service: CommunityLineageService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new CommunityLineageService();
  });

  it("groups carried-forward rows into ordered chains", async () => {
    mockedDb.execute
      .mockResolvedValueOnce({
        rows: [
          { id: "g1", slug: "chevening-2026", name: "Chevening 2026", status: "archived",
            member_count: 120, carried_forward_from_group_id: null, carried_forward_at: null },
          { id: "g2", slug: "chevening-2027", name: "Chevening 2027", status: "active",
            member_count: 42, carried_forward_from_group_id: "g1",
            carried_forward_at: "2026-07-20T00:00:00.000Z" },
          { id: "g3", slug: "chevening-2028", name: "Chevening 2028", status: "active",
            member_count: 3, carried_forward_from_group_id: "g2",
            carried_forward_at: "2027-07-20T00:00:00.000Z" },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ carried: 2, seeded: 0, seeded_with_activity: 0 }] });

    const result = await service.getLineage();

    expect(result.chains).toHaveLength(1);
    expect(result.chains[0].rootGroupId).toBe("g1");
    expect(result.chains[0].groups.map((group) => group.slug)).toEqual([
      "chevening-2026", "chevening-2027", "chevening-2028",
    ]);
    expect(result.stats.carriedForwardGroups).toBe(2);
  });

  it("lists seeded groups with their Brief and activity state", async () => {
    mockedDb.execute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: "g9", slug: "mtn-scholars", name: "MTN Scholars",
          seed_key: "launch-seed:op-9", opportunity_title: "MTN Foundation Scholarship",
          member_count: 7, message_count: 31, has_brief: true,
          created_at: "2026-07-25T00:00:00.000Z",
        }],
      })
      .mockResolvedValueOnce({ rows: [{ carried: 0, seeded: 20, seeded_with_activity: 6 }] });

    const result = await service.getLineage();

    expect(result.seeded).toEqual([{
      id: "g9", slug: "mtn-scholars", name: "MTN Scholars",
      seedKey: "launch-seed:op-9", opportunityTitle: "MTN Foundation Scholarship",
      memberCount: 7, messageCount: 31, hasBrief: true,
      createdAt: "2026-07-25T00:00:00.000Z",
    }]);
    expect(result.stats).toEqual({
      carriedForwardGroups: 0, seededGroups: 20, seededWithActivity: 6,
    });
  });

  it("returns an empty, non-throwing payload when the tables are missing", async () => {
    mockedDb.execute.mockRejectedValue(new Error('relation "community_groups" does not exist'));
    const result = await service.getLineage();
    expect(result).toEqual({
      chains: [], seeded: [],
      stats: { carriedForwardGroups: 0, seededGroups: 0, seededWithActivity: 0 },
    });
  });
});
```

- [ ] **Step 2: Write the lineage service**

Create `backend/services/services/api/src/communities/community-lineage.service.ts`:

```ts
import { Injectable, Logger } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { db } from "../db";

export interface LineageGroup {
  id: string;
  slug: string;
  name: string;
  status: string;
  memberCount: number;
  carriedForwardAt: string | null;
}

export interface LineageChain {
  rootGroupId: string;
  groups: LineageGroup[];
}

export interface SeededGroupRow {
  id: string;
  slug: string;
  name: string;
  seedKey: string;
  opportunityTitle: string | null;
  memberCount: number;
  messageCount: number;
  hasBrief: boolean;
  createdAt: string;
}

export interface CommunityLineageResponse {
  chains: LineageChain[];
  seeded: SeededGroupRow[];
  stats: {
    carriedForwardGroups: number;
    seededGroups: number;
    seededWithActivity: number;
  };
}

interface ChainRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  member_count: number | string | null;
  carried_forward_from_group_id: string | null;
  carried_forward_at: string | null;
}

interface SeedRow {
  id: string;
  slug: string;
  name: string;
  seed_key: string;
  opportunity_title: string | null;
  member_count: number | string | null;
  message_count: number | string | null;
  has_brief: boolean;
  created_at: string;
}

const EMPTY: CommunityLineageResponse = {
  chains: [],
  seeded: [],
  stats: { carriedForwardGroups: 0, seededGroups: 0, seededWithActivity: 0 },
};

/** Read-only admin view of season lineage and launch-seeded groups. */
@Injectable()
export class CommunityLineageService {
  private readonly logger = new Logger(CommunityLineageService.name);

  async getLineage(): Promise<CommunityLineageResponse> {
    try {
      // Every group in any carry-forward chain: the successors, plus their roots.
      const chainRows = this.rows<ChainRow>(
        await db.execute(sql`
          with successors as (
            select id, slug, name, status, member_count,
                   carried_forward_from_group_id, carried_forward_at::text
            from public.community_groups
            where carried_forward_from_group_id is not null
          ),
          roots as (
            select g.id, g.slug, g.name, g.status, g.member_count,
                   g.carried_forward_from_group_id, g.carried_forward_at::text
            from public.community_groups g
            where g.id in (select carried_forward_from_group_id from successors)
          )
          select * from roots
          union
          select * from successors
        `),
      );

      const seedRows = this.rows<SeedRow>(
        await db.execute(sql`
          select g.id, g.slug, g.name, g.seed_key,
                 o.title as opportunity_title,
                 g.member_count, g.message_count,
                 (b.group_id is not null) as has_brief,
                 g.created_at::text as created_at
          from public.community_groups g
          left join public.opportunities o on o.id = g.opportunity_id
          left join public.community_briefs b on b.group_id = g.id
          where g.seed_key is not null
          order by g.created_at desc
          limit 200
        `),
      );

      const statsRow = this.rows<{
        carried: number | string;
        seeded: number | string;
        seeded_with_activity: number | string;
      }>(
        await db.execute(sql`
          select
            count(*) filter (where carried_forward_from_group_id is not null)::int as carried,
            count(*) filter (where seed_key is not null)::int as seeded,
            count(*) filter (where seed_key is not null and message_count > 0)::int
              as seeded_with_activity
          from public.community_groups
        `),
      )[0];

      return {
        chains: this.buildChains(chainRows),
        seeded: seedRows.map((row) => ({
          id: row.id,
          slug: row.slug,
          name: row.name,
          seedKey: row.seed_key,
          opportunityTitle: row.opportunity_title ?? null,
          memberCount: Number(row.member_count ?? 0),
          messageCount: Number(row.message_count ?? 0),
          hasBrief: Boolean(row.has_brief),
          createdAt: row.created_at,
        })),
        stats: {
          carriedForwardGroups: Number(statsRow?.carried ?? 0),
          seededGroups: Number(statsRow?.seeded ?? 0),
          seededWithActivity: Number(statsRow?.seeded_with_activity ?? 0),
        },
      };
    } catch (error) {
      this.logger.warn(
        `Community lineage unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return EMPTY;
    }
  }

  /** Walk each root forward through its single successor (the unique index
   *  guarantees at most one), producing oldest-cycle-first chains. */
  private buildChains(rows: ChainRow[]): LineageChain[] {
    const byId = new Map(rows.map((row) => [row.id, row]));
    const successorOf = new Map<string, ChainRow>();
    for (const row of rows) {
      if (row.carried_forward_from_group_id) {
        successorOf.set(row.carried_forward_from_group_id, row);
      }
    }

    const chains: LineageChain[] = [];
    for (const row of rows) {
      const parentId = row.carried_forward_from_group_id;
      if (parentId && byId.has(parentId)) continue; // not a root

      const groups: LineageGroup[] = [];
      let cursor: ChainRow | undefined = row;
      const seen = new Set<string>();
      while (cursor && !seen.has(cursor.id)) {
        seen.add(cursor.id);
        groups.push({
          id: cursor.id,
          slug: cursor.slug,
          name: cursor.name,
          status: cursor.status,
          memberCount: Number(cursor.member_count ?? 0),
          carriedForwardAt: cursor.carried_forward_at ?? null,
        });
        cursor = successorOf.get(cursor.id);
      }
      if (groups.length > 1) chains.push({ rootGroupId: row.id, groups });
    }
    return chains;
  }

  private rows<T>(result: unknown): T[] {
    if (Array.isArray(result)) return result as T[];
    return (result as { rows?: T[] }).rows ?? [];
  }
}
```

- [ ] **Step 3: Run the lineage tests to verify they pass**

Run: `cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api && npx jest src/communities/community-lineage.service.spec.ts`

Expected: PASS — `Tests: 3 passed, 3 total`

- [ ] **Step 4: Write the admin controller and register it**

Create `backend/services/services/api/src/communities/community-admin.controller.ts`:

```ts
import { Controller, Get, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../auth";
import {
  CommunityLineageService,
  type CommunityLineageResponse,
} from "./community-lineage.service";

/** Own controller under the admin prefix so this slice never edits
 *  `admin/admin.controller.ts`, which four other slices are also touching. */
@Controller("admin/communities")
@UseGuards(AdminGuard)
export class CommunityAdminController {
  constructor(private readonly lineage: CommunityLineageService) {}

  @Get("lineage")
  getLineage(): Promise<CommunityLineageResponse> {
    return this.lineage.getLineage();
  }
}
```

In `communities.module.ts` add `CommunityAdminController` to `controllers` and
`CommunityLineageService` to `providers`:

```ts
import { CommunityAdminController } from "./community-admin.controller";
import { CommunityLineageService } from "./community-lineage.service";
```

- [ ] **Step 5: Write the admin API client**

Create `admin/src/lib/communitiesApi.ts`:

```ts
import { backendFetchJson } from './backend';

export interface LineageGroup {
  id: string;
  slug: string;
  name: string;
  status: string;
  memberCount: number;
  carriedForwardAt: string | null;
}

export interface LineageChain {
  rootGroupId: string;
  groups: LineageGroup[];
}

export interface SeededGroupRow {
  id: string;
  slug: string;
  name: string;
  seedKey: string;
  opportunityTitle: string | null;
  memberCount: number;
  messageCount: number;
  hasBrief: boolean;
  createdAt: string;
}

export interface CommunityLineageResponse {
  chains: LineageChain[];
  seeded: SeededGroupRow[];
  stats: {
    carriedForwardGroups: number;
    seededGroups: number;
    seededWithActivity: number;
  };
}

export async function fetchCommunityLineage(): Promise<CommunityLineageResponse> {
  return backendFetchJson<CommunityLineageResponse>('/admin/communities/lineage');
}
```

- [ ] **Step 6: Write the failing admin page test**

Create `admin/src/test/__tests__/communityLineage.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('../../lib/communitiesApi', () => ({ fetchCommunityLineage: fetchMock }));

import CommunityLineage from '../../pages/CommunityLineage';

const payload = {
  chains: [{
    rootGroupId: 'g1',
    groups: [
      { id: 'g1', slug: 'chevening-2026', name: 'Chevening 2026', status: 'archived',
        memberCount: 120, carriedForwardAt: null },
      { id: 'g2', slug: 'chevening-2027', name: 'Chevening 2027', status: 'active',
        memberCount: 42, carriedForwardAt: '2026-07-20T00:00:00.000Z' },
    ],
  }],
  seeded: [{
    id: 'g9', slug: 'mtn-scholars', name: 'MTN Scholars', seedKey: 'launch-seed:op-9',
    opportunityTitle: 'MTN Foundation Scholarship', memberCount: 7, messageCount: 31,
    hasBrief: true, createdAt: '2026-07-25T00:00:00.000Z',
  }],
  stats: { carriedForwardGroups: 1, seededGroups: 20, seededWithActivity: 6 },
};

describe('CommunityLineage', () => {
  it('renders the stat tiles, chains and seeded groups', async () => {
    fetchMock.mockResolvedValue(payload);
    render(<CommunityLineage />);

    await waitFor(() => expect(screen.getByText('Chevening 2026')).toBeInTheDocument());
    expect(screen.getByText('Chevening 2027')).toBeInTheDocument();
    expect(screen.getByText('MTN Scholars')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();          // seeded groups tile
    expect(screen.getByText('6 / 20')).toBeInTheDocument();      // activity tile
  });

  it('shows an empty state instead of an error when nothing has been carried forward', async () => {
    fetchMock.mockResolvedValue({
      chains: [], seeded: [],
      stats: { carriedForwardGroups: 0, seededGroups: 0, seededWithActivity: 0 },
    });
    render(<CommunityLineage />);
    await waitFor(() =>
      expect(screen.getByText('No group has been carried forward yet.')).toBeInTheDocument(),
    );
  });

  it('surfaces a load failure without blanking the page', async () => {
    fetchMock.mockRejectedValue(new Error('Admin session is required'));
    render(<CommunityLineage />);
    await waitFor(() =>
      expect(screen.getByText('Admin session is required')).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 7: Write the admin page**

Create `admin/src/pages/CommunityLineage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { FC } from 'react';
import { ArrowRight } from 'lucide-react';
import {
  fetchCommunityLineage,
  type CommunityLineageResponse,
} from '../lib/communitiesApi';

const CommunityLineage: FC = () => {
  const [data, setData] = useState<CommunityLineageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetchCommunityLineage()
      .then((payload) => {
        if (mounted) setData(payload);
      })
      .catch((cause: unknown) => {
        if (mounted) setError(cause instanceof Error ? cause.message : 'Could not load lineage');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Communities — Lineage &amp; Seeding</h1>
      </div>

      {error && <div className="card badge-danger">{error}</div>}
      {loading && !data && <div className="card">Loading…</div>}

      {data && (
        <>
          <div className="card">
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
              <div>
                <div className="form-label">Carried-forward groups</div>
                <div style={{ fontSize: 28, fontWeight: 600 }}>
                  {data.stats.carriedForwardGroups}
                </div>
              </div>
              <div>
                <div className="form-label">Seeded groups</div>
                <div style={{ fontSize: 28, fontWeight: 600 }}>{data.stats.seededGroups}</div>
              </div>
              <div>
                <div className="form-label">Seeded rooms with activity</div>
                <div style={{ fontSize: 28, fontWeight: 600 }}>
                  {data.stats.seededWithActivity} / {data.stats.seededGroups}
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="page-title" style={{ fontSize: 18 }}>Season chains</h2>
            {data.chains.length === 0 ? (
              <p className="empty-state">No group has been carried forward yet.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {data.chains.map((chain) => (
                  <li
                    key={chain.rootGroupId}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 0' }}
                  >
                    {chain.groups.map((group, index) => (
                      <span key={group.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        {index > 0 && <ArrowRight size={14} aria-hidden="true" />}
                        <span>
                          {group.name}{' '}
                          <span className={group.status === 'active' ? 'badge badge-success' : 'badge badge-secondary'}>
                            {group.status}
                          </span>{' '}
                          <span className="badge badge-secondary">{group.memberCount} members</span>
                        </span>
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h2 className="page-title" style={{ fontSize: 18 }}>Launch-seeded groups</h2>
            {data.seeded.length === 0 ? (
              <p className="empty-state">Nothing seeded yet. Run scripts/seed-launch-groups.ts.</p>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Group</th>
                      <th>Anchored opportunity</th>
                      <th>Members</th>
                      <th>Messages</th>
                      <th>Brief</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.seeded.map((group) => (
                      <tr key={group.id}>
                        <td>{group.name}</td>
                        <td>{group.opportunityTitle ?? '—'}</td>
                        <td>{group.memberCount}</td>
                        <td>{group.messageCount}</td>
                        <td>
                          <span className={group.hasBrief ? 'badge badge-success' : 'badge badge-warning'}>
                            {group.hasBrief ? 'yes' : 'missing'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default CommunityLineage;
```

- [ ] **Step 8: Wire the nested nav and the route**

In `admin/src/components/nav-items.tsx`, first check whether Slice 2 already added a Communities
group:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/admin && grep -n "communities" src/components/nav-items.tsx
```

**If a `{ kind: "group", id: "communities", ... }` entry exists**, add this leaf to its `children`:

```ts
      { label: "Lineage & Seeding", to: "/communities/lineage", icon: GitBranch },
```

**If it does not exist**, insert this whole group into `NAV`, immediately after the `people` group:

```ts
  {
    kind: "group",
    id: "communities",
    label: "Communities",
    icon: MessagesSquare,
    children: [
      { label: "Lineage & Seeding", to: "/communities/lineage", icon: GitBranch },
    ],
  },
```

Either way add the icons to the `lucide-react` import at the top of the file:

```ts
  GitBranch,
  MessagesSquare,
```

(`groupForPath` needs no change — it derives the active group from `children` by longest-prefix match.)

In `admin/src/App.tsx`, add the lazy import beside the others:

```ts
const CommunityLineage = lazy(() => import("./pages/CommunityLineage"));
```

and the route inside the `<Route path="/" element={<Layout />}>` block:

```tsx
          <Route path="communities/lineage" element={<CommunityLineage />} />
```

- [ ] **Step 9: Run the admin checks**

Run:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/admin
npx vitest run src/test/__tests__/communityLineage.test.tsx && npm run lint && npx tsc --noEmit -p tsconfig.json
```

Expected: `Tests 3 passed`; ESLint `0 problems`; `tsc` silent (this takes ~2 minutes — do not
interrupt it).

- [ ] **Step 10: Commit**

```bash
git add backend/services/services/api/src/communities/community-lineage.service.ts \
        backend/services/services/api/src/communities/community-lineage.service.spec.ts \
        backend/services/services/api/src/communities/community-admin.controller.ts \
        backend/services/services/api/src/communities/communities.module.ts \
        admin/src/lib/communitiesApi.ts admin/src/pages/CommunityLineage.tsx \
        admin/src/test/__tests__/communityLineage.test.tsx \
        admin/src/components/nav-items.tsx admin/src/App.tsx
git commit -m "feat(admin): communities lineage and launch-seeding overview"
```

---

## Task 12: Slice-wide verification and deploy

**Files:** none created — this task exists so nobody declares Slice 5 done on a green unit-test run alone.

- [ ] **Step 1: Run every gate**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api && npx jest && npm run lint && npm run build
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app && npx vitest run && npm run lint && npm run typecheck
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/admin && npx vitest run && npm run lint
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile && npx jest --maxWorkers=2 && npm run lint && npm run typecheck
```

Expected: four green runs. Mobile ESLint must report `0 problems` (it runs `--max-warnings 0`).

- [ ] **Step 2: Boot smoke test (constraint #10)**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npm run build && timeout 25 node dist/main; echo "exit=$?"
```

Expected: route-mapping logs including `/communities/search`, `/communities/groups/:groupId/carry-forward`,
`/og/group/:slug`, `/communities/g/:slug/public` and `/admin/communities/lineage`, then `exit=124`.

- [ ] **Step 3: Deploy in this exact order**

1. `npx supabase db push` — migration `20260725160000_communities_scale_lifecycle.sql` **first**.
   Search, carry-forward and seeding all read columns that do not exist until it lands. (Search
   degrades gracefully; carry-forward does not — its idempotency is the unique index.)
2. Push the backend to Render and wait for a healthy deploy.
3. Deploy the web app (Vercel picks up the **root** `vercel.json`; Netlify picks up
   `edutu-web-app/netlify.toml` and the new edge function).
4. Deploy the admin app.
5. Run the seeder once: `npx ts-node -r tsconfig-paths/register scripts/seed-launch-groups.ts --owner=<RAW_CLERK_SUB> --limit=20`.
6. Mobile ships on the next OTA/EAS build — nothing in this slice needs a native rebuild.

- [ ] **Step 4: Production health checks**

```bash
curl -sI https://www.edutu.org/communities/g/<seeded-slug> | grep -i x-og-source
curl -s https://www.edutu.org/communities/g/<seeded-slug> | grep -A2 -i 'og:title'
curl -s https://www.edutu.org/sitemap.xml | grep -c "/communities/g/"
curl -s -H "Authorization: Bearer <clerk-jwt>" \
  "https://edutu-platform.onrender.com/communities/search?q=chevening" | head -c 400
```

Expected: `X-Og-Source: backend/og-shell`; an `og:title` carrying the real group name (grep with
`-A2` — the shell's meta tags are multi-line); a group-URL count `>= 1`; a JSON body with
`"degraded": false`.

Then open Supabase Dashboard → Reports → Realtime and record the baseline peak concurrent
connections and daily message count, so the presence cost note in Task 5 has real numbers to be
checked against.

- [ ] **Step 5: Submit the new URLs to Google**

In Google Search Console, request indexing for `https://www.edutu.org/communities` and re-submit
`https://www.edutu.org/sitemap.xml`. Without this the group pages sit undiscovered for weeks and the
whole SEO half of this slice looks like it failed.

---

## Self-Review

**Spec coverage**

| Requirement | Where |
|---|---|
| §6.3 season carry-forward, pre-loaded Brief, lineage visible | Tasks 1, 3, 11 |
| Carry-forward idempotency (double-tap) | Task 1 unique index + Task 3 pre-check and 23505 replay, two tests |
| Carry-forward from a group with no Brief | Task 3, dedicated test |
| §3 Discover search across names, descriptions, Brief | Tasks 2, 7 |
| Search never leaks a private group | Task 2 `visible` CTE + explicit leak test |
| `pg_trgm` pattern reused, no new search technology | Task 1 migration mirrors `20260710170000`; Task 2 mirrors `hybridSearch` RRF k=60 |
| §11 row 5 web SEO group pages | Tasks 8, 9 |
| Root `vercel.json` for dynamic rewrites | Task 9, asserted by test |
| Constraint #5 sitemap regeneration | Task 9 edits `generate-sitemap.mjs`, never `public/sitemap.xml` |
| §8.1 presence on the on-screen channel only | Tasks 4, 5, 6 |
| Presence cost/limit note | Task 5 preamble (connections **and** monthly messages) |
| Presence degrades silently, never blocks send | Task 5 hook + tests; Task 6 renders `null` |
| §13 launch seeding, 20 groups, Brief from Notes + description | Task 10 |
| Seeding safely re-runnable | Task 1 `seed_key` unique index + Task 10 two-run proof |
| §9 scam gate applied to seeding — no Edutu-branded group around a flagged listing | Task 10 SQL predicate (`needs_review` / `scam_risk` / `red_flags`) **and** TS `extractRedFlags` guard, 3 tests, `skippedFlagged` reported |
| Branch from `origin/main`; working-tree greps are not evidence of absence | Prerequisite section (`git merge-base --is-ancestor` gate) |
| Admin surfacing in existing nested nav | Task 11 |
| No new notification kinds (constraint #1) | Task 3 asserts `community-invite` |
| Legacy-uuid boundary only at notifications (constraint #2) | Task 3 asserts `toLegacyUuid` on `targetUserIds`; every controller uses `@CurrentUser("authId")` |
| Realtime socket authorisation | Task 4 consumes Slice 2's `authorizeRealtime`, asserted before channel creation |
| `node dist/main` boot smoke test (constraint #10) | Tasks 2, 3, 8, 12 |

**Deliberate deviations from the spec, and why**

1. *Seeding rank.* The spec says "highest `opportunity_applications` volume". Live data is 43
   application rows across 38 opportunities — not enough to order 20 groups. Task 10 keeps
   applications as the heaviest weight (5) and adds bookmarks (3) and signals (2) as tie-breakers.
2. *Unlisted groups.* They are **excluded from in-app search** (spec §2: a group is only listed after
   5 members, and search is listing) but **are** server-rendered and indexable, per the slice brief.
   They are excluded from the sitemap — we do not actively submit them — and their Brief is never
   exposed on the public page.
3. *Carry-forward permission.* Enforced as `role = 'owner'` directly rather than through
   `assertGroupPermission`, because the locked `GroupAction` union has no carry-forward member and
   inventing one would redefine a Slice-2 type.
4. *One additive type change.* `CommunityGroup` gains an optional `carriedForwardFrom?`. Additive
   optional properties break no existing consumer; nothing is renamed or retyped.

**Placeholder scan:** every step contains complete runnable code or an exact command with expected
output. No "TBD", no "add validation here", no "similar to Task N".

**Corrections applied after the first draft** (all verified against `origin/main`, not the working tree):

1. The scraper scam gate **exists**; Task 10 now excludes flagged listings in SQL and re-checks with
   the gate's own `extractRedFlags`, reading the stored verdict rather than re-running detection.
   `SeedOutcome` gained `skippedFlagged`.
2. `og.controller.ts` on `origin/main` **is** the shell-injecting version. Task 8 now points at it as
   the reference, uses its exact `OG_MARKER = "<!--edutu-og-->"` (so either controller's loop guard
   catches the other's output), fetches the **root path** rather than `/index.html`, adds the 4 s
   `AbortController` budget, and removes `Origin-Agent-Cluster` alongside CSP/COOP/COEP/CORP.
3. Added the `origin/main` prerequisite gate above Global Constraints.

**Type consistency:** `CommunitySearchHit` / `CommunitySearchResponse` are declared identically in
Task 2 (backend) and Task 7 (`@edutu/core`). `GroupLineage` and `carriedForwardFrom` use the same
`{ id, slug, name }` shape in Tasks 2, 3 and 7; `PublicGroupPage.carriedForwardFrom` deliberately
carries only `{ slug, name }` because the public page has no use for the id, and that narrower shape
is used consistently in Tasks 8, 9 and their tests. `GroupPresenceMember` is one declaration
(`<CORE>/src/types/presence.ts`) consumed by Tasks 4, 5 and 6. `acquireGroupChannel` has one
signature, used identically in Tasks 4 and 5. `SeedOutcome` carries `created`/`skipped`/
`skippedFlagged`/`groups` in its interface block, its implementation, all six seed tests and the
runner script's printed JSON. `OG_MARKER` is one constant with one value across `spa-shell.ts`, its
spec, and the Task 8 controller.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-25-communities-slice-5-scale-lifecycle.md`. Two execution options:

**1. Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
