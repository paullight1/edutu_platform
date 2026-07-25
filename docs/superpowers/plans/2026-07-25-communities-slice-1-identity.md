# Edutu Communities — Slice 1: Identity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every Edutu user a claimable `@username`, a public profile at `/u/:username` on web and mobile, an asymmetric follow graph, verified `Applied N · Won N` outcomes derived from the real applications pipeline, and a PII-safe contact relay — plus the `@edutu/core` shared-package promotion that slices 2–5 build on.

**Architecture:** A new NestJS `social/` module owns every `/social/*` route and is the only writer to the identity columns and the follow graph; RLS on new tables is SELECT-only. Identity lives on the existing `profiles` row (no second identity table). Verified outcomes are computed on read from `opportunity_applications` and `outcome_offer` rows in `user_opportunity_signals` — never stored, never self-reported. Client code (types, API client, `useProfile`, `useFollow`) lives once in `@edutu/core` under a new framework-agnostic `social` subpath consumed by both `edutumobile` and `edutu-web-app`; only the UI is written twice.

**Tech Stack:** NestJS 11 + Drizzle ORM 0.45 + `pg` (backend), Postgres/Supabase (migrations in root `supabase/migrations/`), Zod 4 DTOs, Jest 30 (backend), React 18 + Vite 5 + react-router 6 + Tailwind (web), Expo + expo-router + React Native (mobile), Vitest (web tests), Brevo transactional email.

---

## Prerequisite — branch from `origin/main`, not from the current branch

**This plan was written against a working tree that is 41 commits behind `origin/main` and is missing
PR#40 (the user-trust masterplan) entirely.** Every "this does not exist yet, so create it" claim below
was derived by grepping *that* stale tree. A grep over the checked-out tree is **not** evidence that
something is absent from the repository.

Before Task 1, cut your branch from `origin/main` and confirm it:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
git fetch origin
git merge-base --is-ancestor origin/main HEAD && echo "BASE OK" || echo "BASE STALE — rebase onto origin/main before starting"
```

Expected: `BASE OK`. On `BASE STALE`, **stop** and rebase onto `origin/main` before writing a line of
code. Building Slice 1 on the stale base means re-creating files that already exist upstream and
producing conflicts that later slices inherit.

### Re-verify these existence claims after rebasing

Each row is a step in this plan that asserts a symbol is absent and therefore creates it. Re-check
each one against `origin/main` — read-only, no checkout:

| Claim in this plan | Verify with | If it EXISTS upstream |
|---|---|---|
| **Task 1** — `src/common/community-user-id.ts` does not exist (load-bearing: slices 2–5 all import it) | `git show origin/main:backend/services/services/api/src/common/community-user-id.ts` | Import `rawClerkUserId` / `toLegacyUuid` from it. Do **not** create a second copy — two id helpers that can drift is the exact failure this file exists to prevent. Reconcile the signature against the widening documented in Task 1. |
| **Task 10** — `edutumobile/packages/core/src/social/` does not exist, and the root `package.json` has no `workspaces` array (load-bearing: four slices depend on the package being consumable by both apps) | `git show origin/main:edutumobile/packages/core/package.json` and `git show origin/main:package.json` | Extend what is there. If `workspaces` already exists, **add** the entry rather than replacing the array wholesale — Step 4 shows a full-file replacement that assumes the current two-key file. |
| **Task 7** — `src/auth/optional-auth.decorator.ts` does not exist | `git show origin/main:backend/services/services/api/src/auth/optional-auth.decorator.ts` | Use the upstream decorator; skip creating it and skip the `clerk-auth.guard.ts` edit if the guard already honours it. |
| **Task 9** — `src/support/brevo-mailer.service.ts` does not exist (the Brevo transport is still inline in `support.service.ts`) | `git show origin/main:backend/services/services/api/src/support/brevo-mailer.service.ts` | Inject the existing service; skip the extraction and keep only the `SupportModule` export check. |
| **Task 2** — `profiles` has no `username` / `headline` / `privacy`; `user_follows` and `social_contact_messages` do not exist; `notifications_kind_check` allows nine kinds | `git show origin/main:supabase/migrations/ \| grep -i 'social\|follow\|username'`, then re-run the live-DB queries in the Slice-1-specific constraints below | Fold into the existing migration instead of adding a competing one. The live-DB column facts must be re-confirmed regardless — the tree is stale, the database is not. |
| **Task 4** — `src/social/` does not exist | `git ls-tree origin/main backend/services/services/api/src/social` | Extend the existing module; keep the locked route paths. |

**Read-only checks against the stale tree, recorded 2026-07-25 (re-run them after rebasing):** all six
paths above were absent, and the root `package.json` had only `devDependencies`. If a symbol is still
missing after a clean rebase, that is a real gap and this plan builds it. If it is present, import it.

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

Application status vocabulary in the `opportunity_applications` table, verified against production
on 2026-07-25 (`opportunity_applications_status_check`):

```
draft | submitted | interview | offer | rejected | withdrawn | no_response
```

There is **no** `shortlisted` status — but `interview` already exists and *is* the intermediate tier,
so no constraint change is needed to use it.

**The track record is three tiers.** `PublicProfile.outcomes` is:

```ts
outcomes: { applied: number; interviewed: number; won: number } | null;   // null when hidden
```

Counting rules, implemented exactly in Task 6:

| Tier | Statuses counted | Why |
|---|---|---|
| `applied` | every non-`draft` status — `submitted`, `interview`, `offer`, `rejected`, `withdrawn`, `no_response` | Counting only `submitted` makes applications that *progressed* vanish: a user with 10 interviews would read "Applied 0" |
| `interviewed` | `interview`, `offer` | "interview and beyond" |
| `won` | `offer` | |

Progression is more credible — and more motivating — than a binary applied/won, and it gives the many
users who reach an interview but never get an offer something real and verified to show. The opt-in
is per-user and unchanged: `outcomes` is `null` when hidden, **never zeroed**.

> `opportunity_applications` is **not** declared in `db/schema.ts` — `me.service.ts` reads it through
> the Supabase client directly. Task 6 therefore counts with one raw grouped SQL statement rather
> than adding a competing Drizzle table definition.

### Non-negotiable repo constraints (from the contract — verbatim)

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

### Slice-1-specific constraints

- **Controllers read the raw Clerk sub with `@CurrentUser("authId")`. Never `@CurrentUser()` and then
  `.id`.** `clerk-auth.guard.ts:159-170` sets `id: toDatabaseUserId(payload.sub)` (the **derived
  uuid**) and `authId: payload.sub` (the **raw Clerk sub**). Reading `.id` silently keys every
  `community_*` row on the wrong namespace — the exact bug class this rule exists to prevent. Every
  controller signature in this plan uses `@CurrentUser("authId") rawUserId: string`, and every service
  takes `rawUserId: string`, not a user object. **Slice 2's plan already assumes this convention; the
  two plans must agree.** Do not "simplify" it back.
- **Migrations go in root `supabase/migrations/`** with the timestamp format `YYYYMMDDHHMMSS_name.sql`,
  and Slice 1 owns the `202607251200xx` band. Never add to `edutumobile/supabase/migrations/`
  (legacy `NNN_` numbering).
- **RLS is SELECT-only.** Every new table grants SELECT to `anon`/`authenticated` and explicitly no
  INSERT/UPDATE/DELETE. All writes go through the backend service-role connection.
- **New `profiles` columns are backend-owned.** `20260619140744_harden_profile_self_service_privileges.sql`
  grants column-level INSERT/UPDATE on `profiles` to `authenticated`. Do **not** add `username`,
  `username_changed_at`, `headline`, or `privacy` to those grants — the 30-day cooldown and the
  reserved-word blocklist are only enforceable server-side.
- **Live-DB facts verified 2026-07-25** (do not re-derive from Drizzle types):
  | Column | Drizzle says | Live DB is |
  |---|---|---|
  | `profiles.user_id` | `uuid` | `text` (31/34 rows hold a raw Clerk sub) |
  | `profiles.bio` | *(absent)* | **already exists**, `text`, all null |
  | `profiles.avatar_url` | *(absent)* | already exists, `text` |
  | `opportunity_applications.user_id` | *(table not declared in Drizzle at all)* | `text` — 2/43 raw Clerk, 41/43 derived uuid |
  | `user_opportunity_signals.user_id` | `uuid` | `text` — 0/322 raw Clerk, all derived uuid |
  | `notifications.user_id` | `uuid` | `uuid` |
  | `user_blocks.*_user_id` | `uuid` | `uuid` |
  Because `opportunity_applications` holds **both** id shapes, the outcome query must match both
  representations. This is the one place where the contract's "raw Clerk sub everywhere" rule cannot
  apply — that is a pre-existing legacy table, not a new `community_*` table.
- **`citext` is not installed** on the live database (`pg_available_extensions` says 1.6 available,
  `installed_version` null). The migration installs it into the `extensions` schema and references the
  type as `extensions.citext` so it resolves regardless of the connecting role's `search_path`.
- **`@edutu/core` is not framework-agnostic today.** Nine files under `packages/core/src/services/`
  import `@react-native-async-storage/async-storage`, `cv.ts` imports `react-native`'s `Share`, and
  `uploads.ts` requires `expo-file-system/legacy`. Its root barrel (`src/index.ts`) re-exports several of
  them. **The web app must never import the root barrel** — it imports the new `social` subpath only.
- **`process.env` does not exist in Vite.** `packages/core/src/services/productApi.ts` reads
  `process.env.EXPO_PUBLIC_API_URL`; the new `social` subpath must not touch `process.env` at all —
  each app injects its base URL and token getter via `configureSocialApi()`.
- **Do not run `git stash`, and do not touch files outside the ones each task names** — four other
  slices are being implemented against this same tree.

---

## File Structure

### Backend (`backend/services/services/api/`)

| File | Responsibility |
|---|---|
| `src/common/community-user-id.ts` | **NEW.** `rawClerkUserId`, `toLegacyUuid`, `legacyUserIdCandidates`, `matchesAnyUserId`. The only id-conversion site for the whole Communities domain. Imported by slices 2–5. |
| `src/common/community-user-id.spec.ts` | **NEW.** Round-trip and precedence tests. |
| `src/auth/optional-auth.decorator.ts` | **NEW.** `@OptionalAuth()` — populate `request.user` on a `@Public()` route when a valid token happens to be present. |
| `src/auth/clerk-auth.guard.ts` | **MODIFY.** Honour `@OptionalAuth()`; best-effort, never throws. |
| `src/auth/index.ts` | **MODIFY.** Re-export the new decorator. |
| `src/db/schema.ts` | **MODIFY.** New `profiles` columns; new `userFollows` and `socialContactMessages` tables. `opportunity_applications` is deliberately left undeclared. |
| `src/social/username.ts` | **NEW.** Pure username rules: normalise, validate, reserved blocklist, cooldown maths. No I/O. |
| `src/social/username.spec.ts` | **NEW.** |
| `src/social/dto/social.dto.ts` | **NEW.** Zod schemas for every `/social/*` request body + query. |
| `src/social/social.service.ts` | **NEW.** Username claim, profile patch, public-profile projection, follow graph. |
| `src/social/social.service.spec.ts` | **NEW.** |
| `src/social/outcomes.service.ts` | **NEW.** `Applied N · Won N` from the live pipeline, privacy-gated. |
| `src/social/outcomes.service.spec.ts` | **NEW.** |
| `src/social/contact-relay.service.ts` | **NEW.** Brevo relay + durable rate limits + PII containment. |
| `src/social/contact-relay.service.spec.ts` | **NEW.** |
| `src/social/social.controller.ts` | **NEW.** The nine locked routes. |
| `src/social/social.module.ts` | **NEW.** |
| `src/social/testing/mock-db.ts` | **NEW.** Shared Drizzle-builder mock for the three social specs. Not a spec file, so Jest will not collect it. |
| `src/support/brevo-mailer.service.ts` | **NEW.** Extracted Brevo transport. |
| `src/support/support.service.ts` | **MODIFY.** Use the extracted transport. |
| `src/support/support.module.ts` | **MODIFY.** Provide + export `BrevoMailerService`. |
| `src/notifications/dto/notification.dto.ts` | **MODIFY.** `NOTIFICATION_KINDS` runtime array, `follow` added. |
| `src/notifications/notification-kinds.spec.ts` | **NEW.** Proves the migration's CHECK constraint is a superset of every kind the app can emit. |
| `src/app.module.ts` | **MODIFY.** Register `SocialModule`. |

### Database

| File | Responsibility |
|---|---|
| `supabase/migrations/20260725120000_social_identity.sql` | Identity columns, `user_follows`, `social_contact_messages`, `notifications_kind_check`, RLS + grants. One migration, one deploy. |

### Shared package (`edutumobile/packages/core/`)

| File | Responsibility |
|---|---|
| `src/social/types.ts` | **NEW.** `PublicProfile`, `ProfilePrivacy`, `ViewerRelation`, `PublicProfileResponse`, `UsernameAvailability`, `FollowResult`, `ProfileSummary`. |
| `src/social/client.ts` | **NEW.** `configureSocialApi`, the nine request functions, a shared in-flight cache. Depends on nothing but the platform `fetch`. |
| `src/social/useProfile.ts` | **NEW.** `useProfile(username)`. `react` only. |
| `src/social/useFollow.ts` | **NEW.** `useFollow(username)`. `react` only. |
| `src/social/index.ts` | **NEW.** Barrel — the entire published Slice 1 surface. |
| `package.json` | **MODIFY.** Add the `./social` export map entry. |

### Web (`edutu-web-app/`)

| File | Responsibility |
|---|---|
| `src/components/PublicProfilePage.tsx` | **NEW.** `/u/:username`. |
| `src/components/SocialApiBootstrap.tsx` | **NEW.** Calls `configureSocialApi` once inside the Clerk tree. |
| `src/components/UsernameSettingsPanel.tsx` | **NEW.** Claim/change handle, headline, bio, three privacy toggles. |
| `src/components/SettingsPage.tsx` | **MODIFY.** Mount the panel. |
| `src/App.tsx` | **MODIFY.** Register `/u/:username` and mount `SocialApiBootstrap`. |
| `vite.config.ts`, `vitest.config.ts`, `tsconfig.app.json` | **MODIFY.** Resolve `@edutu/core/social`. |
| `src/components/__tests__/PublicProfilePage.test.tsx` | **NEW.** |

### Mobile (`edutumobile/`)

| File | Responsibility |
|---|---|
| `app/(app)/u/[username].tsx` | **NEW.** Public profile screen. |
| `app/user/[username].tsx` | **NEW.** Singular deep-link bridge → `/u/[username]`. |
| `app/(app)/profile/username.tsx` | **NEW.** Claim/change handle + headline/bio + privacy toggles. |
| `app/(app)/profile/edit.tsx` | **MODIFY.** Row linking to the new screen. |
| `app/_layout.tsx` | **MODIFY.** `configureSocialApi` bootstrap. |
| `lib/i18n/locales/<lang>/profile.json` × 9 | **MODIFY.** New `social` block. |
| `__tests__/social-profile.test.tsx` | **NEW.** |

---

## Task list

| # | Task | Independently shippable deliverable |
|---|---|---|
| 1 | Canonical Communities user-id helper | `rawClerkUserId` / `toLegacyUuid` / `legacyUserIdCandidates` / `matchesAnyUserId`, tested |
| 2 | Migration + Drizzle schema + notification-kind proof | Identity columns, `user_follows`, `social_contact_messages`, widened CHECK constraint |
| 3 | Username rules (pure) | Normalisation, validation, blocklist, cooldown |
| 4 | `social` module skeleton + username availability & claim | `GET /social/me/username-availability`, `PATCH /social/me/username`, boots under `node dist/main` |
| 5 | `PATCH /social/me/profile` | headline / bio / privacy |
| 6 | Verified outcomes | `Applied N · Won N`, opt-in, `null` when hidden |
| 7 | `GET /social/u/:username` | Public profile projection + `@OptionalAuth()` |
| 8 | Follow graph + `follow` notification | 4 follow routes |
| 9 | Contact relay | `POST /social/u/:username/contact` via Brevo, rate-limited, no PII leak |
| 10 | `@edutu/core` promotion + `social` subpath | `PublicProfile`, `useProfile`, `useFollow` published |
| 11 | Web `/u/:username` + handle claim | Public profile page + settings panel |
| 12 | Mobile `/u/[username]` + handle claim | Screen, deep-link bridge, settings screen, 9 locales |

---

## Task 1: Canonical Communities user-id helper

**Files:**
- Create: `backend/services/services/api/src/common/community-user-id.ts`
- Test: `backend/services/services/api/src/common/community-user-id.spec.ts`

**Interfaces:**
- Consumes: `toDatabaseUserId` from the **existing** `backend/services/services/api/src/common/user-id.ts`.
- Produces — **imported by slices 2, 3, 4 and 5; do not redefine:**
  ```ts
  /** Shaped like what ClerkAuthGuard actually writes to `request.user`. */
  export type CommunityUserLike = {
    authId?: string | null;   // the RAW Clerk sub — the field you want
    id?: string | null;       // the DERIVED uuid — a last-resort fallback only
    sub?: string | null;      // a raw JWT payload passed straight in
  };
  export function rawClerkUserId(user: CommunityUserLike | string): string;
  export function toLegacyUuid(rawClerkId: string): string;
  export function legacyUserIdCandidates(rawClerkId: string): string[];
  export function matchesAnyUserId(column: AnyColumn, ids: readonly string[]): SQL;
  ```

> **Why a separate file, and not an edit to `common/user-id.ts`.** `common/user-id.ts` already exists
> and already exports `toDatabaseUserId`, `isUuid`, `matchProfileUserId` and `matchUserIdRef`. It is
> imported by the auth guard, the profile service, the notifications service and a dozen others; it
> describes the **legacy** dual-key world. `community-user-id.ts` is a thin layer *on top of* it that
> declares the **new** rule for one domain: raw Clerk sub everywhere, one named conversion boundary.
> It **imports** `toDatabaseUserId` rather than reimplementing it — there must never be two hash
> implementations that can drift. Keeping it separate means "which file did you import from" is
> itself the signal for which id namespace you are in.
>
> **Signature correction to the contract.** The contract types the parameter as
> `{ id?: string; sub?: string }`. That is wrong for this repo:
> `clerk-auth.guard.ts:159-170` sets `id: toDatabaseUserId(payload.sub)` — the **derived uuid** — and
> `authId: payload.sub` — the **raw Clerk sub**. Accepting only `{ id, sub }` would silently return
> the uuid for every real caller and key every community table on the wrong namespace. The signature
> here is a strict **widening** (`authId` added, `null` allowed), so anything satisfying the contract
> type still compiles. Precedence is `authId → sub → id`, and `id` is a fallback for hand-built
> objects only — production controllers pass `@CurrentUser("authId")` as a plain string.

- [ ] **Step 1: Write the failing test**

Create `backend/services/services/api/src/common/community-user-id.spec.ts`:

```ts
import { sql } from "drizzle-orm";
import { profiles } from "../db/schema";
import { toDatabaseUserId } from "./user-id";
import {
  legacyUserIdCandidates,
  matchesAnyUserId,
  rawClerkUserId,
  toLegacyUuid,
} from "./community-user-id";

const RAW = "user_2abcDEF1234567890";

describe("rawClerkUserId", () => {
  /**
   * The exact object `ClerkAuthGuard.tryAuthenticateClerk` assigns to
   * `request.user` (clerk-auth.guard.ts:159-170). This is the regression test
   * for the whole id-namespace rule: if it ever returns the uuid, every
   * community table is keyed on the wrong namespace.
   */
  const REQUEST_USER_FROM_GUARD = {
    id: toDatabaseUserId(RAW), // derived uuid — NOT what we want
    authId: RAW, // raw Clerk sub — what we want
    email: "amara@example.com",
    firstName: "Amara",
    lastName: "Okafor",
    role: "user",
    authProvider: "clerk",
  };

  it("returns the raw Clerk sub, NOT the derived uuid, for a real request.user", () => {
    expect(rawClerkUserId(REQUEST_USER_FROM_GUARD)).toBe(RAW);
    expect(rawClerkUserId(REQUEST_USER_FROM_GUARD)).not.toBe(
      toDatabaseUserId(RAW),
    );
    expect(rawClerkUserId(REQUEST_USER_FROM_GUARD)).not.toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-/i,
    );
  });

  it("accepts the contract's { id, sub } shape", () => {
    expect(rawClerkUserId({ id: "ignored", sub: RAW })).toBe(RAW);
  });

  it("falls back to id when nothing else is present", () => {
    expect(rawClerkUserId({ id: RAW })).toBe(RAW);
  });

  it("accepts a bare string", () => {
    expect(rawClerkUserId(`  ${RAW}  `)).toBe(RAW);
  });

  it("throws rather than returning an empty key", () => {
    expect(() => rawClerkUserId({ id: "   " })).toThrow(
      "No authenticated user id on the request",
    );
    expect(() => rawClerkUserId("")).toThrow(
      "No authenticated user id on the request",
    );
  });
});

describe("toLegacyUuid", () => {
  it("matches the derived uuid the rest of the backend already writes", () => {
    expect(toLegacyUuid(RAW)).toBe(toDatabaseUserId(RAW));
  });

  it("is idempotent for something that is already a uuid", () => {
    const uuid = toDatabaseUserId(RAW);
    expect(toLegacyUuid(uuid)).toBe(uuid);
  });
});

describe("legacyUserIdCandidates", () => {
  it("returns both representations for a raw Clerk sub", () => {
    expect(legacyUserIdCandidates(RAW)).toEqual([RAW, toDatabaseUserId(RAW)]);
  });

  it("collapses to one entry when the id is already a uuid", () => {
    const uuid = toDatabaseUserId(RAW);
    expect(legacyUserIdCandidates(uuid)).toEqual([uuid]);
  });
});

describe("matchesAnyUserId", () => {
  const render = (node: unknown): string => {
    const value = node as { queryChunks?: unknown[]; value?: unknown; name?: string };
    if (!value || typeof value !== "object") return String(node ?? "");
    if (Array.isArray(value.queryChunks)) return value.queryChunks.map(render).join("");
    if (Array.isArray(value.value)) return value.value.join("");
    if (typeof value.name === "string") return value.name;
    if (value.value !== undefined) return String(value.value);
    return "";
  };

  it("ORs one comparison per candidate id and casts the column to text", () => {
    const rendered = render(
      matchesAnyUserId(profiles.userId, [RAW, toDatabaseUserId(RAW)]),
    );
    expect(rendered).toContain("::text");
    expect(rendered).toContain(" or ");
    expect(rendered).toContain(RAW);
    expect(rendered).toContain(toDatabaseUserId(RAW));
  });

  it("emits a never-true predicate for an empty candidate list", () => {
    expect(render(matchesAnyUserId(profiles.userId, []))).toContain("false");
  });

  it("is a valid drizzle SQL node", () => {
    expect(matchesAnyUserId(profiles.userId, [RAW])).toBeInstanceOf(
      (sql`x`).constructor,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/common/community-user-id.spec.ts
```

Expected: FAIL — `Cannot find module './community-user-id' from 'src/common/community-user-id.spec.ts'`.

- [ ] **Step 3: Write the implementation**

Create `backend/services/services/api/src/common/community-user-id.ts`:

```ts
import { sql, type AnyColumn, type SQL } from "drizzle-orm";
// Deliberately built ON TOP of the existing legacy helper rather than beside
// it: there must never be two implementations of the clerk-id → uuid hash.
import { toDatabaseUserId } from "./user-id";

/**
 * The shape `ClerkAuthGuard` actually puts on `request.user`
 * (clerk-auth.guard.ts:159-170):
 *   - `authId` — the RAW auth subject (Clerk `user_…` sub, or a Supabase uuid)
 *   - `id`     — the DERIVED uuid produced by `toDatabaseUserId(authId)`
 * `sub` is accepted too so a raw JWT payload can be passed straight in.
 *
 * Controllers should not pass this object at all — they pass
 * `@CurrentUser("authId")` as a plain string. This type exists for the handful
 * of internal callers that already hold a user object.
 */
export type CommunityUserLike = {
  authId?: string | null;
  id?: string | null;
  sub?: string | null;
};

/**
 * The ONE canonical id for every community/social table: the raw Clerk sub.
 *
 * Precedence is `authId → sub → id`, because `request.user.id` is the derived
 * uuid — reading it first would key every `community_*` row on the wrong
 * namespace, which is the exact class of bug that has already cost this repo
 * four production incidents.
 */
export function rawClerkUserId(user: CommunityUserLike | string): string {
  const raw =
    typeof user === "string"
      ? user.trim()
      : (user?.authId?.trim() || user?.sub?.trim() || user?.id?.trim() || "");

  if (!raw) {
    throw new Error("No authenticated user id on the request");
  }
  return raw;
}

/**
 * The ONLY sanctioned conversion boundary to legacy uuid-keyed tables
 * (`user_blocks`, `notifications`, and `profiles` as typed in Drizzle).
 * Nowhere else.
 */
export function toLegacyUuid(rawClerkId: string): string {
  return toDatabaseUserId(rawClerkId);
}

/**
 * Both representations of one user, for the two legacy tables that hold a
 * MIX of them. Verified against the live DB on 2026-07-25:
 *   - `opportunity_applications.user_id` — 2/43 raw Clerk sub, 41/43 derived uuid
 *   - `user_opportunity_signals.user_id` — 0/322 raw Clerk sub, all derived uuid
 * Matching a single representation under-counts verified outcomes, which is
 * worse than showing none: a real winner would render as `Applied 0 · Won 0`.
 *
 * Use this ONLY for those pre-existing tables. New `community_*`,
 * `user_follows` and `opportunity_notes` rows are always keyed on the raw sub,
 * so they need exactly one id and must not go through here.
 */
export function legacyUserIdCandidates(rawClerkId: string): string[] {
  const legacy = toLegacyUuid(rawClerkId);
  return legacy === rawClerkId ? [rawClerkId] : [rawClerkId, legacy];
}

/**
 * `(col::text = $1 or col::text = $2)` for the candidate list above. The
 * `::text` cast is deliberate: `user_opportunity_signals.user_id` is typed
 * `uuid` in `db/schema.ts` but is `text` in the live database, so an
 * un-cast comparison can be planned against the wrong type.
 */
export function matchesAnyUserId(
  column: AnyColumn,
  ids: readonly string[],
): SQL {
  if (ids.length === 0) return sql`(false)`;
  return sql`(${sql.join(
    ids.map((id) => sql`${column}::text = ${id}`),
    sql` or `,
  )})`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/common/community-user-id.spec.ts
```

Expected: PASS — `Tests: 11 passed, 11 total`.

- [ ] **Step 5: Lint**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx eslint src/common/community-user-id.ts src/common/community-user-id.spec.ts
```

Expected: no output (exit 0).

- [ ] **Step 6: Commit**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
git add backend/services/services/api/src/common/community-user-id.ts \
        backend/services/services/api/src/common/community-user-id.spec.ts
git commit -m "feat(social): canonical Communities user-id helper"
```

---

## Task 2: Migration, Drizzle schema, and the notification-kind proof

**Files:**
- Create: `supabase/migrations/20260725120000_social_identity.sql`
- Modify: `backend/services/services/api/src/db/schema.ts`
- Modify: `backend/services/services/api/src/notifications/dto/notification.dto.ts`
- Test: `backend/services/services/api/src/notifications/notification-kinds.spec.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces — **consumed by tasks 4–9 and by slices 2–5:**
  ```ts
  // src/db/schema.ts
  export type ProfilePrivacy = { publicProfile: boolean; allowContact: boolean; showOutcomes: boolean };
  export const DEFAULT_PROFILE_PRIVACY: ProfilePrivacy;
  // profiles gains: avatarUrl, bio, username, usernameChangedAt, headline, privacy
  export const userFollows;            // id, followerUserId, followeeUserId, createdAt  (text ids = raw Clerk sub)
  export const socialContactMessages;  // id, senderUserId, recipientUserId, subject, createdAt
  // src/notifications/dto/notification.dto.ts
  export const NOTIFICATION_KINDS: readonly string[];
  export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
  ```
  The SQL `notifications_kind_check` constraint is widened here to cover **all eight** Communities
  kinds at once. Slices 2–5 therefore need **no** constraint migration of their own — they only add
  their kind to `NOTIFICATION_KINDS`. This is deliberate: five separate `drop constraint … add
  constraint` migrations racing each other is precisely how a previously-added kind gets dropped.

- [ ] **Step 1: Write the failing test**

Create `backend/services/services/api/src/notifications/notification-kinds.spec.ts`:

```ts
import { readFileSync } from "fs";
import { join } from "path";
import { NOTIFICATION_KINDS } from "./dto/notification.dto";

// src/notifications → src → api → services → services → backend → repo root
const MIGRATION_PATH = join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "..",
  "..",
  "supabase",
  "migrations",
  "20260725120000_social_identity.sql",
);

/**
 * Present in the live `notifications_kind_check` on 2026-07-25. Dropping any
 * of these silently kills a shipped notification path — the constraint fails
 * the INSERT and nothing surfaces the error.
 */
const LIVE_KINDS_BEFORE = [
  "goal-reminder",
  "goal-weekly-digest",
  "goal-progress",
  "opportunity-highlight",
  "admin-broadcast",
  "system",
  "deadline-reminder",
  "opportunity-alert",
  "interest",
];

/** Spec §10 — every kind Communities will ever emit, slices 1 through 5. */
const COMMUNITY_KINDS = [
  "community-message",
  "community-mention",
  "community-announcement",
  "community-invite",
  "community-join-request",
  "follow",
  "note-reply",
  "group-expiring",
];

function allowedKindsFromMigration(): string[] {
  const sqlText = readFileSync(MIGRATION_PATH, "utf8");
  const block = sqlText.match(
    /add constraint notifications_kind_check[\s\S]*?array\[([\s\S]*?)\]::text\[\]/i,
  );
  if (!block) {
    throw new Error(
      "Could not find the notifications_kind_check ARRAY[...] literal in the migration",
    );
  }
  return [...block[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

describe("notifications_kind_check", () => {
  it("keeps every kind that was already live", () => {
    const allowed = allowedKindsFromMigration();
    for (const kind of LIVE_KINDS_BEFORE) {
      expect(allowed).toContain(kind);
    }
  });

  it("allows all eight Communities kinds, including follow", () => {
    const allowed = allowedKindsFromMigration();
    for (const kind of COMMUNITY_KINDS) {
      expect(allowed).toContain(kind);
    }
  });

  it("allows every kind the backend can actually emit", () => {
    const allowed = allowedKindsFromMigration();
    for (const kind of NOTIFICATION_KINDS) {
      expect(allowed).toContain(kind);
    }
  });

  it("lists no kind twice", () => {
    const allowed = allowedKindsFromMigration();
    expect(new Set(allowed).size).toBe(allowed.length);
  });

  it("exposes 'follow' on the NotificationKind union so Slice 1 can emit it", () => {
    expect(NOTIFICATION_KINDS).toContain("follow");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/notifications/notification-kinds.spec.ts
```

Expected: FAIL — `Module '"./dto/notification.dto"' has no exported member 'NOTIFICATION_KINDS'`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260725120000_social_identity.sql`:

```sql
-- Edutu Communities — Slice 1 (Identity).
-- Public @usernames, follow graph, contact relay ledger, and the widened
-- notifications kind constraint.
--
-- Verified against the live database on 2026-07-25 before writing:
--   * profiles.user_id  is TEXT (Drizzle types it uuid — the Drizzle type is wrong)
--   * profiles.bio      ALREADY EXISTS (text, entirely null) — do not redefine it
--   * profiles.avatar_url ALREADY EXISTS
--   * citext is available (1.6) but NOT installed
--   * notifications_kind_check currently allows 9 kinds, listed verbatim below

-- citext gives us case-insensitive uniqueness for handles without a functional
-- index. Installed into `extensions` (Supabase convention) and referenced
-- fully-qualified so it resolves whatever the connecting role's search_path is.
create extension if not exists citext with schema extensions;

------------------------------------------------------------------------------
-- 1. Identity columns on profiles
------------------------------------------------------------------------------

alter table public.profiles
  add column if not exists username extensions.citext,
  add column if not exists username_changed_at timestamptz,
  add column if not exists headline text,
  add column if not exists bio text,
  add column if not exists privacy jsonb not null
    default '{"publicProfile": true, "allowContact": false, "showOutcomes": false}'::jsonb;

comment on column public.profiles.username is
  '3-24 chars of [a-z0-9_], case-insensitive unique. Backend-owned: the 30-day change cooldown and the reserved-word blocklist are only enforceable server-side.';
comment on column public.profiles.privacy is
  '{publicProfile, allowContact, showOutcomes}. Defaults: profile public, outcomes hidden, contact off (spec §4).';

-- Format is enforced in SQL as well as in the service so a stray psql session
-- cannot mint a handle the router would then fail to match.
alter table public.profiles
  drop constraint if exists profiles_username_format_check;
alter table public.profiles
  add constraint profiles_username_format_check
  check (username is null or username::text ~ '^[a-z0-9_]{3,24}$');

alter table public.profiles
  drop constraint if exists profiles_headline_length_check;
alter table public.profiles
  add constraint profiles_headline_length_check
  check (headline is null or char_length(headline) <= 120);

alter table public.profiles
  drop constraint if exists profiles_bio_length_check;
alter table public.profiles
  add constraint profiles_bio_length_check
  check (bio is null or char_length(bio) <= 280);

-- Partial unique index, mirroring profiles_referral_code_key: every existing
-- row has username IS NULL, and NULLs must not collide with each other.
create unique index if not exists profiles_username_key
  on public.profiles (username)
  where username is not null;

-- Column-level grants: username / username_changed_at / headline / privacy are
-- deliberately NOT granted to `authenticated`. 20260619140744 lets clients
-- write bio and avatar_url directly through the Data API; the identity columns
-- must stay backend-only or the cooldown and blocklist are trivially bypassed.
revoke insert, update on column public.profiles.username from authenticated, anon;
revoke insert, update on column public.profiles.username_changed_at from authenticated, anon;
revoke insert, update on column public.profiles.headline from authenticated, anon;
revoke insert, update on column public.profiles.privacy from authenticated, anon;

------------------------------------------------------------------------------
-- 2. user_follows — asymmetric follow graph
------------------------------------------------------------------------------
-- Shape mirrors public.user_blocks (id, <actor>_user_id, <target>_user_id,
-- created_at + a unique pair index + an index on the actor). The one
-- deliberate difference: user_blocks keys on uuid, this keys on TEXT holding
-- the RAW Clerk sub, per spec §5.4. No FK to profiles: profiles.user_id is
-- text but a follow may legitimately be created before the followee's profile
-- row exists, and the backend already validates the target on write.

create table if not exists public.user_follows (
  id uuid primary key default gen_random_uuid(),
  follower_user_id text not null,
  followee_user_id text not null,
  created_at timestamptz not null default now(),
  constraint user_follows_no_self_follow
    check (follower_user_id <> followee_user_id)
);

create unique index if not exists uq_user_follows_pair
  on public.user_follows (follower_user_id, followee_user_id);
create index if not exists idx_user_follows_follower
  on public.user_follows (follower_user_id, created_at desc);
create index if not exists idx_user_follows_followee
  on public.user_follows (followee_user_id, created_at desc);

alter table public.user_follows enable row level security;

-- RLS is SELECT-only for this whole domain. Every write goes through the
-- backend service-role connection, which is what makes rate limits, block
-- checks and notification fan-out un-bypassable.
revoke all on table public.user_follows from anon, authenticated;
grant select on table public.user_follows to anon, authenticated;
grant all on table public.user_follows to service_role;

drop policy if exists user_follows_select on public.user_follows;
create policy user_follows_select on public.user_follows
  for select to anon, authenticated using (true);

drop policy if exists user_follows_service_role_all on public.user_follows;
create policy user_follows_service_role_all on public.user_follows
  for all to service_role using (true) with check (true);

------------------------------------------------------------------------------
-- 3. social_contact_messages — durable rate limit + abuse audit for the relay
------------------------------------------------------------------------------
-- The relay is a spam vector, so its limits cannot live in process memory:
-- Render runs more than one instance and restarts reset it. Bodies are NOT
-- stored — only enough to rate-limit and to answer an abuse report.

create table if not exists public.social_contact_messages (
  id uuid primary key default gen_random_uuid(),
  sender_user_id text not null,
  recipient_user_id text not null,
  subject text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_social_contact_sender
  on public.social_contact_messages (sender_user_id, created_at desc);
create index if not exists idx_social_contact_pair
  on public.social_contact_messages (sender_user_id, recipient_user_id, created_at desc);

alter table public.social_contact_messages enable row level security;

-- No client read either: this table is a moderation record, not public data.
revoke all on table public.social_contact_messages from anon, authenticated;
grant all on table public.social_contact_messages to service_role;

drop policy if exists social_contact_messages_service_role_all
  on public.social_contact_messages;
create policy social_contact_messages_service_role_all
  on public.social_contact_messages
  for all to service_role using (true) with check (true);

------------------------------------------------------------------------------
-- 4. notifications_kind_check
------------------------------------------------------------------------------
-- This CHECK constraint silently rejects unknown kinds: the INSERT fails and
-- nothing surfaces it. It has already swallowed deadline-reminder inserts in
-- production. All eight Communities kinds are added HERE, in Slice 1, rather
-- than one per slice — five migrations racing to drop-and-recreate the same
-- constraint is exactly how a previously-added kind gets lost. Slices 2-5 add
-- their kind to NOTIFICATION_KINDS in TypeScript and need no migration.

alter table public.notifications
  drop constraint if exists notifications_kind_check;

alter table public.notifications
  add constraint notifications_kind_check check (kind = any (array[
    -- already live on 2026-07-25 — every one of these is a shipped path
    'goal-reminder',
    'goal-weekly-digest',
    'goal-progress',
    'opportunity-highlight',
    'admin-broadcast',
    'system',
    'deadline-reminder',
    'opportunity-alert',
    'interest',
    -- Communities, spec §10
    'community-message',
    'community-mention',
    'community-announcement',
    'community-invite',
    'community-join-request',
    'follow',
    'note-reply',
    'group-expiring'
  ]::text[]));
```

- [ ] **Step 4: Add the runtime kind list to the notifications DTO**

In `backend/services/services/api/src/notifications/dto/notification.dto.ts`, replace the
`NotificationKind` type declaration (the `export type NotificationKind = | "goal-reminder" | … ;`
union at the top of the file) with:

```ts
/**
 * Single source of truth for notification kinds. It is a runtime array, not a
 * bare type union, so `notification-kinds.spec.ts` can assert that the live
 * `notifications_kind_check` constraint allows every one of them. Adding a kind
 * here without adding it to that constraint makes the INSERT fail silently.
 */
export const NOTIFICATION_KINDS = [
  "goal-reminder",
  "goal-weekly-digest",
  "goal-progress",
  "opportunity-highlight",
  "opportunity-alert",
  "deadline-reminder",
  "admin-broadcast",
  "system",
  // Present in the live CHECK constraint since the interest-alert engine
  // shipped; it was missing from this union, which is why it could never be
  // sent from the admin broadcast form.
  "interest",
  // Slice 1 (Identity).
  "follow",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
```

Then, further down the same file, replace the inline `kind: z.enum([...])` inside
`BroadcastNotificationSchema` with:

```ts
  kind: z.enum(NOTIFICATION_KINDS).optional(),
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/notifications/notification-kinds.spec.ts
```

Expected: PASS — `Tests: 5 passed, 5 total`.

- [ ] **Step 6: Add the Drizzle definitions**

In `backend/services/services/api/src/db/schema.ts`, add these fields to the existing `profiles`
table object, immediately after the `email: text("email"),` line:

```ts
  avatarUrl: text("avatar_url"),
  // Public identity (spec §5.1). `username` is `extensions.citext` in the
  // database; Drizzle has no citext type and `text` round-trips it correctly.
  // NOTE: `userId` above is typed `uuid` here but is TEXT in the live DB — do
  // not add a FK against it and do not trust that type.
  username: text("username"),
  usernameChangedAt: timestamp("username_changed_at", { withTimezone: true }),
  headline: text("headline"),
  bio: text("bio"),
  privacy: jsonb("privacy")
    .$type<ProfilePrivacy>()
    .default({
      publicProfile: true,
      allowContact: false,
      showOutcomes: false,
    })
    .notNull(),
```

Add this immediately **above** the `export const profiles = pgTable(` line:

```ts
/** `profiles.privacy` — spec §4: profile public, outcomes hidden, contact off. */
export type ProfilePrivacy = {
  publicProfile: boolean;
  allowContact: boolean;
  showOutcomes: boolean;
};

export const DEFAULT_PROFILE_PRIVACY: ProfilePrivacy = {
  publicProfile: true,
  allowContact: false,
  showOutcomes: false,
};
```

Add the three new tables at the end of `schema.ts`:

```ts
// Asymmetric follow graph (spec §5.1). Modelled on `userBlocks`, but keyed on
// TEXT holding the RAW Clerk sub — the canonical id for every table in this
// domain (spec §5.4). Never put a derived uuid in here.
export const userFollows = pgTable(
  "user_follows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    followerUserId: text("follower_user_id").notNull(),
    followeeUserId: text("followee_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_user_follows_pair").on(
      table.followerUserId,
      table.followeeUserId,
    ),
    index("idx_user_follows_follower").on(
      table.followerUserId,
      table.createdAt,
    ),
    index("idx_user_follows_followee").on(
      table.followeeUserId,
      table.createdAt,
    ),
  ],
);

// Ledger behind the contact relay's rate limits. Deliberately stores no message
// body — just enough to enforce the limits across instances and restarts, and
// to answer an abuse report.
export const socialContactMessages = pgTable(
  "social_contact_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    senderUserId: text("sender_user_id").notNull(),
    recipientUserId: text("recipient_user_id").notNull(),
    subject: text("subject").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_social_contact_sender").on(table.senderUserId, table.createdAt),
    index("idx_social_contact_pair").on(
      table.senderUserId,
      table.recipientUserId,
      table.createdAt,
    ),
  ],
);
```

> **Deliberately NOT added: `opportunity_applications`.** It is owned by `me.service.ts` through the
> Supabase client and has never been declared in Drizzle. Adding a competing definition here would
> invite drift (the admin edit-opportunity 500 was caused by exactly that) and would collide with
> Slice 3, which also reads that table. Task 6 counts it with one raw grouped SQL statement instead.

- [ ] **Step 7: Type-check and lint the backend**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx tsc --noEmit -p tsconfig.json && npm run lint
```

Expected: both exit 0 with no diagnostics.

- [ ] **Step 8: Run the whole backend suite (nothing may regress)**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npm test
```

Expected: PASS, with `notification-kinds.spec.ts` among the passing suites and no new failures.

- [ ] **Step 9: Apply the migration and verify the constraint against the live database**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
npx supabase db push
```

Expected: `Applying migration 20260725120000_social_identity.sql...` then `Finished supabase db push.`

Then prove the `follow` kind actually inserts — the constraint test above reads the migration file,
this proves the deployed database agrees. Run it inside a transaction that is rolled back:

```bash
psql "$DATABASE_URL" <<'SQL'
begin;
insert into public.notifications (user_id, kind, title, body)
values ('00000000-0000-4000-a000-000000000000', 'follow', 'test', 'test')
returning kind;
insert into public.notifications (user_id, kind, title, body)
values ('00000000-0000-4000-a000-000000000000', 'community-mention', 'test', 'test')
returning kind;
rollback;
SQL
```

Expected: two rows returned (`follow`, then `community-mention`), then `ROLLBACK`. A
`new row for relation "notifications" violates check constraint "notifications_kind_check"` means the
migration did not apply — re-run `supabase db push` before continuing.

- [ ] **Step 10: Verify the identity columns landed**

```bash
psql "$DATABASE_URL" -c "select column_name, data_type from information_schema.columns where table_schema='public' and table_name='profiles' and column_name in ('username','username_changed_at','headline','bio','privacy') order by column_name;"
```

Expected exactly five rows: `bio|text`, `headline|text`, `privacy|jsonb`, `username|USER-DEFINED`,
`username_changed_at|timestamp with time zone`.

- [ ] **Step 11: Commit**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
git add supabase/migrations/20260725120000_social_identity.sql \
        backend/services/services/api/src/db/schema.ts \
        backend/services/services/api/src/notifications/dto/notification.dto.ts \
        backend/services/services/api/src/notifications/notification-kinds.spec.ts
git commit -m "feat(social): identity columns, user_follows, contact ledger, follow notification kind"
```

---

## Task 3: Username rules (pure functions, no I/O)

**Files:**
- Create: `backend/services/services/api/src/social/username.ts`
- Test: `backend/services/services/api/src/social/username.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces — used by Task 4 and by the web/mobile claim UIs (Tasks 11–12) via the API:
  ```ts
  export const USERNAME_MIN_LENGTH = 3;
  export const USERNAME_MAX_LENGTH = 24;
  export const USERNAME_PATTERN: RegExp;              // /^[a-z0-9_]{3,24}$/
  export const USERNAME_CHANGE_COOLDOWN_DAYS = 30;
  export const RESERVED_USERNAMES: ReadonlySet<string>;
  export type UsernameRejectionReason =
    | "empty" | "too_short" | "too_long" | "invalid_characters"
    | "reserved" | "no_letters_or_digits";
  export type UsernameValidation =
    | { ok: true; username: string }
    | { ok: false; reason: UsernameRejectionReason; message: string };
  export function normalizeUsername(input: string): string;
  export function validateUsername(input: string): UsernameValidation;
  export function usernameCooldownRemainingDays(
    changedAt: Date | string | null | undefined,
    now?: Date,
  ): number;
  ```

- [ ] **Step 1: Write the failing test**

Create `backend/services/services/api/src/social/username.spec.ts`:

```ts
import {
  RESERVED_USERNAMES,
  USERNAME_CHANGE_COOLDOWN_DAYS,
  normalizeUsername,
  usernameCooldownRemainingDays,
  validateUsername,
} from "./username";

describe("normalizeUsername", () => {
  it("lowercases, trims and drops a leading @", () => {
    expect(normalizeUsername("  @Amara_O  ")).toBe("amara_o");
  });

  it("strips zero-width and non-breaking whitespace pasted from chat apps", () => {
    expect(normalizeUsername("​amara ")).toBe("amara");
  });

  it("leaves an already-normal handle untouched", () => {
    expect(normalizeUsername("amara_o")).toBe("amara_o");
  });
});

describe("validateUsername", () => {
  it("accepts a well-formed handle", () => {
    expect(validateUsername("amara_o")).toEqual({ ok: true, username: "amara_o" });
  });

  it("accepts the boundary lengths", () => {
    expect(validateUsername("abc").ok).toBe(true);
    expect(validateUsername("a".repeat(24)).ok).toBe(true);
  });

  it("normalises before validating", () => {
    expect(validateUsername("@Amara_O")).toEqual({ ok: true, username: "amara_o" });
  });

  it("rejects an empty handle", () => {
    expect(validateUsername("   ")).toMatchObject({ ok: false, reason: "empty" });
  });

  it("rejects a handle shorter than 3 characters", () => {
    expect(validateUsername("ab")).toMatchObject({ ok: false, reason: "too_short" });
  });

  it("rejects a handle longer than 24 characters", () => {
    expect(validateUsername("a".repeat(25))).toMatchObject({
      ok: false,
      reason: "too_long",
    });
  });

  it("rejects characters outside [a-z0-9_]", () => {
    for (const bad of ["amara.o", "amara-o", "amara o", "amará", "amara!"]) {
      expect(validateUsername(bad)).toMatchObject({
        ok: false,
        reason: "invalid_characters",
      });
    }
  });

  it("rejects a handle made only of underscores", () => {
    expect(validateUsername("____")).toMatchObject({
      ok: false,
      reason: "no_letters_or_digits",
    });
  });

  it("rejects reserved handles that would shadow a route", () => {
    for (const reserved of ["admin", "app", "communities", "settings", "u", "edutu"]) {
      expect(validateUsername(reserved)).toMatchObject({
        ok: false,
        reason: "reserved",
      });
    }
  });

  it("rejects reserved handles case-insensitively", () => {
    expect(validateUsername("@Admin")).toMatchObject({ ok: false, reason: "reserved" });
  });

  it("returns a message a user can act on", () => {
    const result = validateUsername("ab");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("3");
    }
  });

  it("reserves every first path segment the web router owns", () => {
    // Guards against a handle that would make /u/<name> unreachable or make a
    // marketing page look like a profile.
    for (const route of ["opportunities", "dashboard", "blog", "upgrade", "g"]) {
      expect(RESERVED_USERNAMES.has(route)).toBe(true);
    }
  });
});

describe("usernameCooldownRemainingDays", () => {
  const now = new Date("2026-07-25T12:00:00.000Z");

  it("is 0 when the handle has never been changed", () => {
    expect(usernameCooldownRemainingDays(null, now)).toBe(0);
    expect(usernameCooldownRemainingDays(undefined, now)).toBe(0);
  });

  it("is 0 once the full cooldown has elapsed", () => {
    const long = new Date(
      now.getTime() - (USERNAME_CHANGE_COOLDOWN_DAYS + 1) * 86400000,
    );
    expect(usernameCooldownRemainingDays(long, now)).toBe(0);
  });

  it("is 30 immediately after a change", () => {
    expect(usernameCooldownRemainingDays(now, now)).toBe(30);
  });

  it("rounds a partial day up, so 'in 1 day' never reads as 0", () => {
    const twentyNineAndAHalf = new Date(now.getTime() - 29.5 * 86400000);
    expect(usernameCooldownRemainingDays(twentyNineAndAHalf, now)).toBe(1);
  });

  it("accepts an ISO string, which is what Postgres hands back", () => {
    const tenDaysAgo = new Date(now.getTime() - 10 * 86400000).toISOString();
    expect(usernameCooldownRemainingDays(tenDaysAgo, now)).toBe(20);
  });

  it("is 0 for an unparseable value rather than locking the user out", () => {
    expect(usernameCooldownRemainingDays("not-a-date", now)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/social/username.spec.ts
```

Expected: FAIL — `Cannot find module './username' from 'src/social/username.spec.ts'`.

- [ ] **Step 3: Write the implementation**

Create `backend/services/services/api/src/social/username.ts`:

```ts
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 24;
export const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;
export const USERNAME_CHANGE_COOLDOWN_DAYS = 30;

const DAY_MS = 86_400_000;

/**
 * Handles that must never belong to a user.
 *
 * Three groups:
 *  1. Every first path segment the web router already owns, so `/u/:username`
 *     stays unambiguous and no handle can impersonate a product page.
 *  2. Brand and staff terms, so nobody can pass themselves off as Edutu.
 *  3. Values that break string handling downstream (`null`, `undefined`).
 */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  // 1 — web routes (edutu-web-app/src/App.tsx) + mobile deep-link roots
  "about", "admin", "api", "app", "apps", "auth", "beliefs", "blog", "careers",
  "chat", "coach", "communities", "community", "contact", "cv", "dashboard",
  "deadlines", "developer", "developers", "docs", "download", "events", "g",
  "goals", "group", "groups", "help", "impact", "invite", "login", "logout",
  "me", "mentor", "mentors", "new", "notifications", "onboarding",
  "opportunities", "opportunity", "personalization", "premium", "pricing",
  "privacy", "pro", "profile", "roadmap", "roadmaps", "robots", "saved",
  "saved-searches", "scholarship-api", "scholarship-engine", "search",
  "settings", "share", "signin", "signout", "signup", "sitemap", "social",
  "submit-opportunity", "support", "templates", "terms", "u", "upgrade",
  "user", "users", "wallet", "what-we-believe",
  // 2 — brand and staff
  "edutu", "edutuapp", "edutuhq", "edutuofficial", "edututeam", "official",
  "moderator", "mod", "staff", "team", "security", "billing", "payments",
  "no_reply", "noreply", "postmaster", "webmaster", "www",
  // 3 — values that break string handling
  "null", "undefined", "nan", "none", "true", "false",
]);

export type UsernameRejectionReason =
  | "empty"
  | "too_short"
  | "too_long"
  | "invalid_characters"
  | "reserved"
  | "no_letters_or_digits";

export type UsernameValidation =
  | { ok: true; username: string }
  | { ok: false; reason: UsernameRejectionReason; message: string };

/**
 * Canonical form. Users paste handles with a leading `@`, mixed case, and —
 * routinely, from WhatsApp — zero-width and non-breaking spaces. Normalising
 * first means the blocklist and the citext unique index both see the same
 * string the router will later match.
 */
export function normalizeUsername(input: string): string {
  return (input ?? "")
    .replace(/[​-‏⁠﻿ ]/g, "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

export function validateUsername(input: string): UsernameValidation {
  const username = normalizeUsername(input);

  if (!username) {
    return { ok: false, reason: "empty", message: "Pick a username." };
  }
  if (username.length < USERNAME_MIN_LENGTH) {
    return {
      ok: false,
      reason: "too_short",
      message: `Usernames need at least ${USERNAME_MIN_LENGTH} characters.`,
    };
  }
  if (username.length > USERNAME_MAX_LENGTH) {
    return {
      ok: false,
      reason: "too_long",
      message: `Usernames can be at most ${USERNAME_MAX_LENGTH} characters.`,
    };
  }
  if (!USERNAME_PATTERN.test(username)) {
    return {
      ok: false,
      reason: "invalid_characters",
      message: "Use only lowercase letters, numbers and underscores.",
    };
  }
  if (!/[a-z0-9]/.test(username)) {
    return {
      ok: false,
      reason: "no_letters_or_digits",
      message: "Usernames need at least one letter or number.",
    };
  }
  if (RESERVED_USERNAMES.has(username)) {
    return {
      ok: false,
      reason: "reserved",
      message: "That username is reserved. Try another one.",
    };
  }

  return { ok: true, username };
}

/**
 * Whole days left before the handle may change again. Rounds UP, so the last
 * partial day still reads as "1 day" instead of "0" while the write is
 * still refused.
 */
export function usernameCooldownRemainingDays(
  changedAt: Date | string | null | undefined,
  now: Date = new Date(),
): number {
  if (!changedAt) return 0;

  const changed =
    changedAt instanceof Date ? changedAt : new Date(String(changedAt));
  if (Number.isNaN(changed.getTime())) return 0;

  const unlocksAt =
    changed.getTime() + USERNAME_CHANGE_COOLDOWN_DAYS * DAY_MS;
  const remainingMs = unlocksAt - now.getTime();
  if (remainingMs <= 0) return 0;

  return Math.ceil(remainingMs / DAY_MS);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/social/username.spec.ts
```

Expected: PASS — `Tests: 18 passed, 18 total`.

- [ ] **Step 5: Lint**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx eslint src/social
```

Expected: no output (exit 0).

- [ ] **Step 6: Commit**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
git add backend/services/services/api/src/social/username.ts \
        backend/services/services/api/src/social/username.spec.ts
git commit -m "feat(social): username normalisation, validation and change cooldown"
```

---

## Task 4: `social` module skeleton — username availability and claim

**Files:**
- Create: `backend/services/services/api/src/social/testing/mock-db.ts`
- Create: `backend/services/services/api/src/social/dto/social.dto.ts`
- Create: `backend/services/services/api/src/social/social.service.ts`
- Create: `backend/services/services/api/src/social/social.controller.ts`
- Create: `backend/services/services/api/src/social/social.module.ts`
- Test: `backend/services/services/api/src/social/social.service.spec.ts`
- Modify: `backend/services/services/api/src/app.module.ts`

**Interfaces:**
- Consumes: `rawClerkUserId`, `legacyUserIdCandidates`, `matchesAnyUserId` (Task 1);
  `profiles`, `ProfilePrivacy`, `DEFAULT_PROFILE_PRIVACY` (Task 2);
  `validateUsername`, `usernameCooldownRemainingDays`, `USERNAME_CHANGE_COOLDOWN_DAYS` (Task 3).
- Produces:
  ```ts
  // social.service.ts
  export type UsernameAvailability = {
    username: string; available: boolean;
    reason: UsernameRejectionReason | "taken" | null; message: string | null;
  };
  export class SocialService {
    checkUsernameAvailability(rawUserId: string, input: string): Promise<UsernameAvailability>;
    claimUsername(rawUserId: string, input: string): Promise<{ username: string; usernameChangedAt: string }>;
  }
  // testing/mock-db.ts — reused by Tasks 6 and 9's specs
  export function createMockDb(): MockDb;
  export function renderSql(node: unknown): string;
  ```
- Routes live: `GET /social/me/username-availability?username=`, `PATCH /social/me/username`.

- [ ] **Step 1: Write the shared Drizzle mock**

Create `backend/services/services/api/src/social/testing/mock-db.ts`. This is not a `.spec.ts` file,
so Jest's `testRegex` will not collect it as a suite:

```ts
import { getTableName } from "drizzle-orm";

export type RecordedCall = {
  op: "select" | "insert" | "update" | "delete";
  table: string;
  where: string;
  values?: unknown;
  set?: unknown;
};

/**
 * Flattens a Drizzle SQL node into a comparable string with parameter values
 * inlined, so a test can assert WHICH id a query filtered on — the single most
 * common source of bugs in this codebase.
 */
export function renderSql(node: unknown): string {
  if (node === null || node === undefined) return "";
  if (typeof node !== "object") return String(node);

  const value = node as {
    queryChunks?: unknown[];
    value?: unknown;
    name?: string;
  };

  if (Array.isArray(value.queryChunks)) {
    return value.queryChunks.map(renderSql).join("");
  }
  if (Array.isArray(value.value)) return value.value.join("");
  if (typeof value.name === "string") return value.name;
  if (value.value !== undefined) return String(value.value);
  return "";
}

export type MockDb = {
  db: {
    select: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  calls: RecordedCall[];
  /** Results handed to consecutive terminal SELECTs, in call order. */
  queueSelects: (...results: unknown[][]) => void;
  /** Results handed to consecutive `.returning()` clauses, in call order. */
  queueReturning: (...results: unknown[][]) => void;
  /** Makes the next terminal query reject — used for unique-violation paths. */
  failNext: (error: unknown) => void;
  reset: () => void;
};

export function createMockDb(): MockDb {
  const calls: RecordedCall[] = [];
  let selectResults: unknown[][] = [];
  let selectIndex = 0;
  let returningResults: unknown[][] = [];
  let returningIndex = 0;
  let nextError: unknown = null;

  const settle = (rows: unknown[]) => {
    if (nextError) {
      const error = nextError;
      nextError = null;
      return Promise.reject(error);
    }
    return Promise.resolve(rows);
  };

  const thenable = (call: RecordedCall, rows: () => unknown[]) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    const resolve = () => {
      calls.push(call);
      return settle(rows());
    };
    Object.assign(chain, {
      from: (table: unknown) => {
        call.table = getTableName(table as never);
        return self();
      },
      leftJoin: self,
      innerJoin: self,
      where: (condition: unknown) => {
        call.where = renderSql(condition);
        return self();
      },
      orderBy: self,
      groupBy: self,
      limit: self,
      offset: self,
      onConflictDoNothing: self,
      onConflictDoUpdate: self,
      returning: () => {
        const result = returningResults[returningIndex++] ?? [];
        return {
          execute: () => {
            calls.push(call);
            return settle(result);
          },
          then: (ok: never, err: never) => {
            calls.push(call);
            return settle(result).then(ok, err);
          },
        };
      },
      execute: resolve,
      then: (ok: never, err: never) => resolve().then(ok, err),
    });
    return chain;
  };

  const db = {
    select: jest.fn(() =>
      thenable({ op: "select", table: "", where: "" }, () => {
        const result = selectResults[selectIndex++] ?? [];
        return result;
      }),
    ),
    insert: jest.fn((table: unknown) => {
      const call: RecordedCall = {
        op: "insert",
        table: getTableName(table as never),
        where: "",
      };
      const chain = thenable(call, () => []);
      return {
        ...chain,
        values: (values: unknown) => {
          call.values = values;
          return chain;
        },
      };
    }),
    update: jest.fn((table: unknown) => {
      const call: RecordedCall = {
        op: "update",
        table: getTableName(table as never),
        where: "",
      };
      const chain = thenable(call, () => []);
      return {
        set: (set: unknown) => {
          call.set = set;
          return chain;
        },
      };
    }),
    delete: jest.fn((table: unknown) => {
      const call: RecordedCall = {
        op: "delete",
        table: getTableName(table as never),
        where: "",
      };
      return thenable(call, () => []);
    }),
  };

  return {
    db,
    calls,
    queueSelects: (...results: unknown[][]) => {
      selectResults = results;
      selectIndex = 0;
    },
    queueReturning: (...results: unknown[][]) => {
      returningResults = results;
      returningIndex = 0;
    },
    failNext: (error: unknown) => {
      nextError = error;
    },
    reset: () => {
      calls.length = 0;
      selectResults = [];
      selectIndex = 0;
      returningResults = [];
      returningIndex = 0;
      nextError = null;
    },
  };
}
```

- [ ] **Step 2: Write the failing test**

Create `backend/services/services/api/src/social/social.service.spec.ts`:

```ts
import { BadRequestException, ConflictException } from "@nestjs/common";
import { createMockDb } from "./testing/mock-db";
import { toDatabaseUserId } from "../common/user-id";

const mockDb = createMockDb();
jest.mock("../db", () => ({ db: mockDb.db }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SocialService } = require("./social.service") as typeof import("./social.service");

// Services take the RAW Clerk sub as a plain string — exactly what the
// controller gets from `@CurrentUser("authId")`. Never a user object, and
// never `request.user.id` (that is the DERIVED uuid).
const RAW = "user_2abcDEF1234567890";

describe("SocialService username", () => {
  let service: InstanceType<typeof SocialService>;

  beforeEach(() => {
    mockDb.reset();
    jest.clearAllMocks();
    service = new SocialService();
  });

  describe("checkUsernameAvailability", () => {
    it("reports a free, well-formed handle as available", async () => {
      mockDb.queueSelects([]); // nobody holds it
      const result = await service.checkUsernameAvailability(VIEWER, "@Amara_O");
      expect(result).toEqual({
        username: "amara_o",
        available: true,
        reason: null,
        message: null,
      });
    });

    it("reports a taken handle as unavailable without touching the format rules", async () => {
      mockDb.queueSelects([{ userId: "user_someone_else" }]);
      const result = await service.checkUsernameAvailability(VIEWER, "amara_o");
      expect(result.available).toBe(false);
      expect(result.reason).toBe("taken");
      expect(result.message).toContain("taken");
    });

    it("treats the caller's own current handle as available", async () => {
      mockDb.queueSelects([{ userId: RAW }]);
      const result = await service.checkUsernameAvailability(VIEWER, "amara_o");
      expect(result.available).toBe(true);
    });

    it("rejects a reserved handle without querying the database", async () => {
      const result = await service.checkUsernameAvailability(VIEWER, "settings");
      expect(result).toMatchObject({ available: false, reason: "reserved" });
      expect(mockDb.db.select).not.toHaveBeenCalled();
    });

    it("rejects an invalid handle without querying the database", async () => {
      const result = await service.checkUsernameAvailability(VIEWER, "am");
      expect(result).toMatchObject({ available: false, reason: "too_short" });
      expect(mockDb.db.select).not.toHaveBeenCalled();
    });
  });

  describe("claimUsername", () => {
    it("writes the normalised handle and stamps the cooldown", async () => {
      mockDb.queueSelects(
        [{ userId: RAW, username: null, usernameChangedAt: null }], // own profile
        [], // handle free
      );
      mockDb.queueReturning([
        { username: "amara_o", usernameChangedAt: new Date("2026-07-25T12:00:00Z") },
      ]);

      const result = await service.claimUsername(VIEWER, " @Amara_O ");

      expect(result.username).toBe("amara_o");
      expect(result.usernameChangedAt).toBe("2026-07-25T12:00:00.000Z");

      const update = mockDb.calls.find((call) => call.op === "update");
      expect(update?.table).toBe("profiles");
      expect((update?.set as { username: string }).username).toBe("amara_o");
      expect((update?.set as { usernameChangedAt: Date }).usernameChangedAt)
        .toBeInstanceOf(Date);
    });

    it("filters the profile update on BOTH id representations", async () => {
      mockDb.queueSelects(
        [{ userId: RAW, username: null, usernameChangedAt: null }],
        [],
      );
      mockDb.queueReturning([
        { username: "amara_o", usernameChangedAt: new Date() },
      ]);

      await service.claimUsername(VIEWER, "amara_o");

      const update = mockDb.calls.find((call) => call.op === "update");
      expect(update?.where).toContain(RAW);
      expect(update?.where).toContain(toDatabaseUserId(RAW));
    });

    it("refuses an invalid handle with 400", async () => {
      await expect(service.claimUsername(VIEWER, "no.dots")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("refuses a handle somebody else holds with 409", async () => {
      mockDb.queueSelects(
        [{ userId: RAW, username: null, usernameChangedAt: null }],
        [{ userId: "user_someone_else" }],
      );
      await expect(service.claimUsername(VIEWER, "amara_o")).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it("refuses a change inside the 30-day cooldown and says how long is left", async () => {
      const changedAt = new Date(Date.now() - 5 * 86400000);
      mockDb.queueSelects([
        { userId: RAW, username: "old_handle", usernameChangedAt: changedAt },
      ]);

      await expect(service.claimUsername(VIEWER, "new_handle")).rejects.toMatchObject(
        {
          response: {
            code: "username_cooldown",
            cooldownDaysRemaining: 25,
          },
        },
      );
    });

    it("allows re-saving the SAME handle inside the cooldown (a no-op, not a change)", async () => {
      const changedAt = new Date(Date.now() - 5 * 86400000);
      mockDb.queueSelects([
        { userId: RAW, username: "amara_o", usernameChangedAt: changedAt },
      ]);

      const result = await service.claimUsername(VIEWER, "@Amara_O");
      expect(result.username).toBe("amara_o");
      expect(mockDb.db.update).not.toHaveBeenCalled();
    });

    it("maps a unique-index race to 409 rather than a 500", async () => {
      mockDb.queueSelects(
        [{ userId: RAW, username: null, usernameChangedAt: null }],
        [],
      );
      mockDb.failNext(
        Object.assign(new Error("duplicate key value"), { code: "23505" }),
      );

      await expect(service.claimUsername(VIEWER, "amara_o")).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/social/social.service.spec.ts
```

Expected: FAIL — `Cannot find module './social.service'`.

- [ ] **Step 4: Write the DTOs**

Create `backend/services/services/api/src/social/dto/social.dto.ts`:

```ts
import { z } from "zod";

export const UsernameQuerySchema = z.object({
  // Deliberately loose: the service returns a structured *reason* for a bad
  // handle so the claim UI can explain it. A 400 from the pipe here would show
  // the user a generic validation error instead.
  username: z.string().trim().min(1).max(64),
});
export type UsernameQueryDto = z.infer<typeof UsernameQuerySchema>;

export const ClaimUsernameSchema = z.object({
  username: z.string().trim().min(1).max(64),
});
export type ClaimUsernameDto = z.infer<typeof ClaimUsernameSchema>;

export const UpdateSocialProfileSchema = z
  .object({
    headline: z.string().trim().max(120).nullable().optional(),
    bio: z.string().trim().max(280).nullable().optional(),
    privacy: z
      .object({
        publicProfile: z.boolean().optional(),
        allowContact: z.boolean().optional(),
        showOutcomes: z.boolean().optional(),
      })
      .optional(),
  })
  .refine(
    (dto) =>
      dto.headline !== undefined ||
      dto.bio !== undefined ||
      dto.privacy !== undefined,
    { message: "Nothing to update" },
  );
export type UpdateSocialProfileDto = z.infer<typeof UpdateSocialProfileSchema>;

export const ContactMessageSchema = z.object({
  subject: z.string().trim().min(3).max(120),
  message: z.string().trim().min(10).max(2000),
});
export type ContactMessageDto = z.infer<typeof ContactMessageSchema>;

export const FollowListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().trim().max(64).optional(),
});
export type FollowListQueryDto = z.infer<typeof FollowListQuerySchema>;
```

- [ ] **Step 5: Write the service**

Create `backend/services/services/api/src/social/social.service.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { profiles } from "../db/schema";
import {
  legacyUserIdCandidates,
  matchesAnyUserId,
  rawClerkUserId,
  type CommunityUserLike,
} from "../common/community-user-id";
import {
  USERNAME_CHANGE_COOLDOWN_DAYS,
  normalizeUsername,
  usernameCooldownRemainingDays,
  validateUsername,
  type UsernameRejectionReason,
} from "./username";

export type UsernameAvailability = {
  username: string;
  available: boolean;
  reason: UsernameRejectionReason | "taken" | null;
  message: string | null;
};

/** Postgres unique_violation. A concurrent claim of the same handle. */
const PG_UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === PG_UNIQUE_VIOLATION
  );
}

@Injectable()
export class SocialService {
  private readonly logger = new Logger(SocialService.name);

  /**
   * `profiles.user_id` is TEXT in the live database and holds the raw Clerk sub
   * for 31 of 34 rows, with a handful of legacy derived-uuid rows left over
   * from before 20260713131522. Match both, always.
   */
  private ownProfileFilter(rawUserId: string) {
    return matchesAnyUserId(
      profiles.userId,
      legacyUserIdCandidates(rawUserId),
    );
  }

  private async requireOwnProfile(rawUserId: string) {
    const [row] = await db
      .select({
        userId: profiles.userId,
        username: profiles.username,
        usernameChangedAt: profiles.usernameChangedAt,
      })
      .from(profiles)
      .where(this.ownProfileFilter(rawUserId))
      .limit(1)
      .execute();

    if (!row) {
      // ClerkAuthGuard upserts a profile row on the first authenticated
      // request, so this is only reachable if that write failed.
      throw new NotFoundException(
        "We could not find your profile. Reopen the app and try again.",
      );
    }
    return row;
  }

  async checkUsernameAvailability(
    // The RAW Clerk sub, straight from `@CurrentUser("authId")`.
    user: string,
    input: string,
  ): Promise<UsernameAvailability> {
    const rawUserId = rawClerkUserId(user);
    const validation = validateUsername(input);

    if (!validation.ok) {
      return {
        username: normalizeUsername(input),
        available: false,
        reason: validation.reason,
        message: validation.message,
      };
    }

    const [holder] = await db
      .select({ userId: profiles.userId })
      .from(profiles)
      .where(eq(profiles.username, validation.username))
      .limit(1)
      .execute();

    const heldBySomeoneElse =
      Boolean(holder) &&
      !legacyUserIdCandidates(rawUserId).includes(String(holder.userId));

    if (heldBySomeoneElse) {
      return {
        username: validation.username,
        available: false,
        reason: "taken",
        message: "That username is taken. Try another one.",
      };
    }

    return {
      username: validation.username,
      available: true,
      reason: null,
      message: null,
    };
  }

  async claimUsername(
    // The RAW Clerk sub, straight from `@CurrentUser("authId")`.
    user: string,
    input: string,
  ): Promise<{ username: string; usernameChangedAt: string }> {
    const rawUserId = rawClerkUserId(user);
    const validation = validateUsername(input);

    if (!validation.ok) {
      throw new BadRequestException({
        code: validation.reason,
        message: validation.message,
      });
    }
    const username = validation.username;

    const profile = await this.requireOwnProfile(rawUserId);

    // Re-saving the handle you already have is a no-op, not a change. Without
    // this the settings screen would refuse its own current value for 30 days.
    if (profile.username && normalizeUsername(profile.username) === username) {
      return {
        username,
        usernameChangedAt: profile.usernameChangedAt
          ? new Date(profile.usernameChangedAt).toISOString()
          : new Date(0).toISOString(),
      };
    }

    const cooldownDaysRemaining = usernameCooldownRemainingDays(
      profile.usernameChangedAt,
    );
    if (cooldownDaysRemaining > 0) {
      throw new ConflictException({
        code: "username_cooldown",
        cooldownDaysRemaining,
        message: `You can change your username again in ${cooldownDaysRemaining} day${
          cooldownDaysRemaining === 1 ? "" : "s"
        }. Handles are stable for ${USERNAME_CHANGE_COOLDOWN_DAYS} days so people can find you.`,
      });
    }

    const [holder] = await db
      .select({ userId: profiles.userId })
      .from(profiles)
      .where(
        and(
          eq(profiles.username, username),
          ne(sql`${profiles.userId}::text`, rawUserId),
        ),
      )
      .limit(1)
      .execute();

    if (holder) {
      throw new ConflictException({
        code: "username_taken",
        message: "That username is taken. Try another one.",
      });
    }

    try {
      const [updated] = await db
        .update(profiles)
        .set({ username, usernameChangedAt: new Date() })
        .where(this.ownProfileFilter(rawUserId))
        .returning({
          username: profiles.username,
          usernameChangedAt: profiles.usernameChangedAt,
        })
        .execute();

      if (!updated) {
        throw new NotFoundException(
          "We could not find your profile. Reopen the app and try again.",
        );
      }

      return {
        username: String(updated.username),
        usernameChangedAt: new Date(
          updated.usernameChangedAt ?? Date.now(),
        ).toISOString(),
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        // Two people claimed the same handle in the same instant; the partial
        // unique index is the arbiter, not the SELECT above.
        throw new ConflictException({
          code: "username_taken",
          message: "That username was just taken. Try another one.",
        });
      }
      throw error;
    }
  }
}
```

- [ ] **Step 6: Write the controller and module**

Create `backend/services/services/api/src/social/social.controller.ts`:

```ts
import { Body, Controller, Get, Patch, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser } from "../auth/current-user.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  ClaimUsernameSchema,
  UsernameQuerySchema,
  type ClaimUsernameDto,
  type UsernameQueryDto,
} from "./dto/social.dto";
import { SocialService } from "./social.service";

@Controller("social")
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  // The claim UI checks on every keystroke (debounced), so this needs a much
  // higher ceiling than a write route.
  @Get("me/username-availability")
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  usernameAvailability(
    // `authId` is the RAW Clerk sub. `@CurrentUser()` + `.id` hands back the
    // DERIVED uuid and would key every social row on the wrong namespace.
    // Do not "simplify" this.
    @CurrentUser("authId") rawUserId: string,
    @Query(new ZodValidationPipe(UsernameQuerySchema)) query: UsernameQueryDto,
  ) {
    return this.socialService.checkUsernameAvailability(
      rawUserId,
      query.username,
    );
  }

  @Patch("me/username")
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  claimUsername(
    @CurrentUser("authId") rawUserId: string,
    @Body(new ZodValidationPipe(ClaimUsernameSchema)) dto: ClaimUsernameDto,
  ) {
    return this.socialService.claimUsername(rawUserId, dto.username);
  }
}
```

Create `backend/services/services/api/src/social/social.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { SocialController } from "./social.controller";
import { SocialService } from "./social.service";

@Module({
  controllers: [SocialController],
  providers: [SocialService],
  exports: [SocialService],
})
export class SocialModule {}
```

- [ ] **Step 7: Register the module**

In `backend/services/services/api/src/app.module.ts`, add the import beside the other feature
modules (after the `SupportModule` import line):

```ts
import { SocialModule } from "./social/social.module";
```

and add `SocialModule,` to the `imports:` array immediately after `SupportModule,`.

- [ ] **Step 8: Run the test to verify it passes**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/social/social.service.spec.ts
```

Expected: PASS — `Tests: 11 passed, 11 total`.

- [ ] **Step 9: Prove the module boots (the deploy smoke test)**

A module that only fails at boot — a Nest DI cycle, a missing provider — passes every unit test and
breaks production. Build and boot it:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npm run build && node dist/main
```

Expected: Nest logs `[RoutesResolver] SocialController {/social}` followed by
`Mapped {/social/me/username-availability, GET} route` and
`Mapped {/social/me/username, PATCH} route`, then `Nest application successfully started`.
Stop it with Ctrl-C. Any `Nest can't resolve dependencies` error is a blocker — fix before committing.

- [ ] **Step 10: Lint and full suite**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npm run lint && npm test
```

Expected: lint exits 0; the suite passes with no new failures.

- [ ] **Step 11: Commit**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
git add backend/services/services/api/src/social \
        backend/services/services/api/src/app.module.ts
git commit -m "feat(social): social module with username availability and claim"
```

---

## Task 5: `PATCH /social/me/profile` — headline, bio, privacy

**Files:**
- Modify: `backend/services/services/api/src/social/social.service.ts`
- Modify: `backend/services/services/api/src/social/social.controller.ts`
- Test: `backend/services/services/api/src/social/social.service.spec.ts`

**Interfaces:**
- Consumes: `UpdateSocialProfileDto` (Task 4), `ProfilePrivacy` / `DEFAULT_PROFILE_PRIVACY` (Task 2).
- Produces:
  ```ts
  export type SocialProfileSettings = {
    username: string | null;
    headline: string | null;
    bio: string | null;
    privacy: ProfilePrivacy;
    usernameChangedAt: string | null;
    cooldownDaysRemaining: number;
  };
  class SocialService {
    getSocialProfileSettings(rawUserId: string): Promise<SocialProfileSettings>;
    updateSocialProfile(rawUserId: string, dto: UpdateSocialProfileDto): Promise<SocialProfileSettings>;
  }
  ```
- Route live: `PATCH /social/me/profile`. (`getSocialProfileSettings` is returned by the same route
  so the claim UI has one round trip; there is no extra endpoint in the locked route list.)

- [ ] **Step 1: Write the failing test**

Append to `backend/services/services/api/src/social/social.service.spec.ts`:

```ts
describe("SocialService.updateSocialProfile", () => {
  let service: InstanceType<typeof SocialService>;

  beforeEach(() => {
    mockDb.reset();
    jest.clearAllMocks();
    service = new SocialService();
  });

  const existing = {
    userId: RAW,
    username: "amara_o",
    usernameChangedAt: null,
    headline: null,
    bio: null,
    privacy: { publicProfile: true, allowContact: false, showOutcomes: false },
  };

  it("writes headline and bio", async () => {
    mockDb.queueSelects([existing]);
    mockDb.queueReturning([
      {
        ...existing,
        headline: "Chasing a fully-funded MSc in Public Health",
        bio: "Lagos.",
      },
    ]);

    const result = await service.updateSocialProfile(VIEWER, {
      headline: "Chasing a fully-funded MSc in Public Health",
      bio: "Lagos.",
    });

    expect(result.headline).toBe("Chasing a fully-funded MSc in Public Health");
    expect(result.bio).toBe("Lagos.");
  });

  it("MERGES a partial privacy patch instead of replacing the object", async () => {
    mockDb.queueSelects([
      {
        ...existing,
        privacy: { publicProfile: true, allowContact: false, showOutcomes: false },
      },
    ]);
    mockDb.queueReturning([
      {
        ...existing,
        privacy: { publicProfile: true, allowContact: false, showOutcomes: true },
      },
    ]);

    await service.updateSocialProfile(VIEWER, { privacy: { showOutcomes: true } });

    const update = mockDb.calls.find((call) => call.op === "update");
    expect((update?.set as { privacy: unknown }).privacy).toEqual({
      publicProfile: true,
      allowContact: false,
      showOutcomes: true,
    });
  });

  it("falls back to the documented defaults when privacy is null in the row", async () => {
    mockDb.queueSelects([{ ...existing, privacy: null }]);
    mockDb.queueReturning([{ ...existing }]);

    await service.updateSocialProfile(VIEWER, { privacy: { allowContact: true } });

    const update = mockDb.calls.find((call) => call.op === "update");
    expect((update?.set as { privacy: unknown }).privacy).toEqual({
      publicProfile: true,
      allowContact: true,
      showOutcomes: false,
    });
  });

  it("stores an empty headline as NULL, not as an empty string", async () => {
    mockDb.queueSelects([{ ...existing, headline: "old" }]);
    mockDb.queueReturning([{ ...existing, headline: null }]);

    await service.updateSocialProfile(VIEWER, { headline: "   " });

    const update = mockDb.calls.find((call) => call.op === "update");
    expect((update?.set as { headline: unknown }).headline).toBeNull();
  });

  it("never lets the client write username through this route", async () => {
    mockDb.queueSelects([existing]);
    mockDb.queueReturning([existing]);

    await service.updateSocialProfile(VIEWER, {
      bio: "hi",
    } as never);

    const update = mockDb.calls.find((call) => call.op === "update");
    expect(Object.keys(update?.set as object)).not.toContain("username");
    expect(Object.keys(update?.set as object)).not.toContain("usernameChangedAt");
  });

  it("reports the remaining username cooldown so the UI can disable the field", async () => {
    const changedAt = new Date(Date.now() - 3 * 86400000);
    mockDb.queueSelects([{ ...existing, usernameChangedAt: changedAt }]);
    mockDb.queueReturning([{ ...existing, usernameChangedAt: changedAt }]);

    const result = await service.updateSocialProfile(VIEWER, { bio: "hi" });
    expect(result.cooldownDaysRemaining).toBe(27);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/social/social.service.spec.ts -t "updateSocialProfile"
```

Expected: FAIL — `service.updateSocialProfile is not a function`.

- [ ] **Step 3: Write the implementation**

In `backend/services/services/api/src/social/social.service.ts`, extend the imports:

```ts
import {
  DEFAULT_PROFILE_PRIVACY,
  profiles,
  type ProfilePrivacy,
} from "../db/schema";
import type { UpdateSocialProfileDto } from "./dto/social.dto";
```

(replace the existing `import { profiles } from "../db/schema";` line with the block above)

and add these members to the class:

```ts
export type SocialProfileSettings = {
  username: string | null;
  headline: string | null;
  bio: string | null;
  privacy: ProfilePrivacy;
  usernameChangedAt: string | null;
  cooldownDaysRemaining: number;
};
```

(place the type just below `UsernameAvailability`, then inside the class:)

```ts
  /**
   * `privacy` is jsonb with a column default, but rows written before this
   * migration — or by a client that set it to SQL NULL — can still read back
   * null. Normalise on every read so a missing key never silently reads as
   * `false` (which would, for `publicProfile`, hide every legacy profile).
   */
  private normalizePrivacy(value: unknown): ProfilePrivacy {
    const raw = (value ?? {}) as Partial<ProfilePrivacy>;
    return {
      publicProfile:
        typeof raw.publicProfile === "boolean"
          ? raw.publicProfile
          : DEFAULT_PROFILE_PRIVACY.publicProfile,
      allowContact:
        typeof raw.allowContact === "boolean"
          ? raw.allowContact
          : DEFAULT_PROFILE_PRIVACY.allowContact,
      showOutcomes:
        typeof raw.showOutcomes === "boolean"
          ? raw.showOutcomes
          : DEFAULT_PROFILE_PRIVACY.showOutcomes,
    };
  }

  private toSettings(row: {
    username?: unknown;
    headline?: unknown;
    bio?: unknown;
    privacy?: unknown;
    usernameChangedAt?: unknown;
  }): SocialProfileSettings {
    const usernameChangedAt = row.usernameChangedAt
      ? new Date(row.usernameChangedAt as string).toISOString()
      : null;
    return {
      username: row.username ? String(row.username) : null,
      headline: row.headline ? String(row.headline) : null,
      bio: row.bio ? String(row.bio) : null,
      privacy: this.normalizePrivacy(row.privacy),
      usernameChangedAt,
      cooldownDaysRemaining: usernameCooldownRemainingDays(
        row.usernameChangedAt as string | null,
      ),
    };
  }

  private readonly settingsColumns = {
    userId: profiles.userId,
    username: profiles.username,
    usernameChangedAt: profiles.usernameChangedAt,
    headline: profiles.headline,
    bio: profiles.bio,
    privacy: profiles.privacy,
  };

  async getSocialProfileSettings(
    user: string,
  ): Promise<SocialProfileSettings> {
    const rawUserId = rawClerkUserId(user);
    const [row] = await db
      .select(this.settingsColumns)
      .from(profiles)
      .where(this.ownProfileFilter(rawUserId))
      .limit(1)
      .execute();

    if (!row) {
      throw new NotFoundException(
        "We could not find your profile. Reopen the app and try again.",
      );
    }
    return this.toSettings(row);
  }

  async updateSocialProfile(
    user: string,
    dto: UpdateSocialProfileDto,
  ): Promise<SocialProfileSettings> {
    const rawUserId = rawClerkUserId(user);

    const [current] = await db
      .select(this.settingsColumns)
      .from(profiles)
      .where(this.ownProfileFilter(rawUserId))
      .limit(1)
      .execute();

    if (!current) {
      throw new NotFoundException(
        "We could not find your profile. Reopen the app and try again.",
      );
    }

    // Explicit allow-list. `username` and `usernameChangedAt` are NOT settable
    // here — the cooldown and the blocklist only exist on the claim path.
    const patch: {
      headline?: string | null;
      bio?: string | null;
      privacy?: ProfilePrivacy;
    } = {};

    if (dto.headline !== undefined) {
      patch.headline = dto.headline?.trim() ? dto.headline.trim() : null;
    }
    if (dto.bio !== undefined) {
      patch.bio = dto.bio?.trim() ? dto.bio.trim() : null;
    }
    if (dto.privacy !== undefined) {
      // MERGE, never replace: the settings screen sends one toggle at a time,
      // and a replace would silently reset the other two.
      patch.privacy = {
        ...this.normalizePrivacy(current.privacy),
        ...dto.privacy,
      };
    }

    const [updated] = await db
      .update(profiles)
      .set(patch)
      .where(this.ownProfileFilter(rawUserId))
      .returning(this.settingsColumns)
      .execute();

    if (!updated) {
      throw new NotFoundException(
        "We could not find your profile. Reopen the app and try again.",
      );
    }
    return this.toSettings(updated);
  }
```

- [ ] **Step 4: Add the route**

In `backend/services/services/api/src/social/social.controller.ts`, extend the imports with
`UpdateSocialProfileSchema` / `UpdateSocialProfileDto` from `./dto/social.dto`, then add:

```ts
  @Patch("me/profile")
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  updateProfile(
    // RAW Clerk sub — see the note on usernameAvailability above.
    @CurrentUser("authId") rawUserId: string,
    @Body(new ZodValidationPipe(UpdateSocialProfileSchema))
    dto: UpdateSocialProfileDto,
  ) {
    return this.socialService.updateSocialProfile(rawUserId, dto);
  }

  @Get("me/profile")
  profileSettings(@CurrentUser("authId") rawUserId: string) {
    return this.socialService.getSocialProfileSettings(rawUserId);
  }
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/social/social.service.spec.ts
```

Expected: PASS — `Tests: 17 passed, 17 total`.

- [ ] **Step 6: Lint and commit**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npm run lint
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
git add backend/services/services/api/src/social
git commit -m "feat(social): PATCH /social/me/profile for headline, bio and privacy"
```

---

## Task 6: Verified outcomes — `Applied N · Interviewed N · Won N`

**Files:**
- Create: `backend/services/services/api/src/social/outcomes.service.ts`
- Test: `backend/services/services/api/src/social/outcomes.service.spec.ts`
- Modify: `backend/services/services/api/src/social/social.module.ts`

**Interfaces:**
- Consumes: `legacyUserIdCandidates` (Task 1); `ProfilePrivacy` (Task 2); the live
  `opportunity_applications` table via raw SQL (it is **not** declared in Drizzle).
- Produces:
  ```ts
  export type VerifiedOutcomes = { applied: number; interviewed: number; won: number };
  export const APPLIED_STATUSES: readonly string[];      // every non-draft status
  export const INTERVIEWED_STATUSES: readonly string[];  // interview and beyond
  export const WON_STATUSES: readonly string[];          // offer
  export class OutcomesService {
    getOutcomes(rawUserId: string): Promise<VerifiedOutcomes>;
    getVisibleOutcomes(rawUserId: string, privacy: ProfilePrivacy): Promise<VerifiedOutcomes | null>;
  }
  ```
  `getVisibleOutcomes` returns **`null`** — not `{applied: 0, interviewed: 0, won: 0}` — when
  `showOutcomes` is off. A zero is a claim ("this person has applied to nothing"); `null` is an
  absence. Slice 3's Notes and Slice 2's member lists must preserve that distinction.

### The three tiers, and why

Progression is more credible — and more motivating — than a binary applied/won, and it gives the many
users who reach an interview but never get an offer something real and verified to show.

| Tier | Statuses | Trap it avoids |
|---|---|---|
| `applied` | `submitted`, `interview`, `offer`, `rejected`, `withdrawn`, `no_response` — i.e. **every non-`draft` status** | Counting only `submitted` would make applications that *progressed* vanish: a user with 10 interviews would read "Applied 0" |
| `interviewed` | `interview`, `offer` | "interview and beyond", not "interview exactly" |
| `won` | `offer` | |

All three come from one grouped read of `opportunity_applications` — our own pipeline, never
self-reported, so the "cannot be faked" property that makes this the strongest identity primitive in
this market holds.

> **Why raw SQL.** `opportunity_applications` is not declared in `db/schema.ts`; `me.service.ts` reads
> it through the Supabase client. Declaring a competing Drizzle table would invite the schema drift
> that already produced a production 500 on admin opportunity edits, and Slice 3 reads the same table.
> One `db.execute(sql\`…\`)` grouped by status answers all three tiers in a single round trip.
>
> **Why both id shapes.** `opportunity_applications.user_id` is `text` and holds a **mix**: verified on
> 2026-07-25, 2 of 43 rows hold a raw Clerk sub and 41 hold the derived uuid. Matching one shape
> under-counts, which is worse than showing nothing — a genuine winner would render as `Won 0`.

- [ ] **Step 1: Write the failing test**

Create `backend/services/services/api/src/social/outcomes.service.spec.ts`:

```ts
import { toDatabaseUserId } from "../common/user-id";

const execute = jest.fn();
jest.mock("../db", () => ({ db: { execute } }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  OutcomesService,
  APPLIED_STATUSES,
  INTERVIEWED_STATUSES,
  WON_STATUSES,
} = require("./outcomes.service") as typeof import("./outcomes.service");

const RAW = "user_2abcDEF1234567890";
const LEGACY = toDatabaseUserId(RAW);

/** `db.execute` on node-postgres resolves to `{ rows: [...] }`. */
const rows = (counts: Record<string, number>) => ({
  rows: Object.entries(counts).map(([status, total]) => ({ status, total })),
});

describe("OutcomesService tier definitions", () => {
  it("counts every non-draft status as applied", () => {
    expect([...APPLIED_STATUSES].sort()).toEqual(
      [
        "interview",
        "no_response",
        "offer",
        "rejected",
        "submitted",
        "withdrawn",
      ].sort(),
    );
    expect(APPLIED_STATUSES).not.toContain("draft");
  });

  it("counts interview and beyond as interviewed", () => {
    expect([...INTERVIEWED_STATUSES].sort()).toEqual(["interview", "offer"]);
  });

  it("counts only offer as won", () => {
    expect([...WON_STATUSES]).toEqual(["offer"]);
  });
});

describe("OutcomesService.getOutcomes", () => {
  let service: InstanceType<typeof OutcomesService>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OutcomesService();
  });

  /**
   * The single test that pins all three rules at once. One application in every
   * status: 7 rows, of which 6 are non-draft, 2 are interview-or-beyond, 1 is an
   * offer. Any off-by-one-tier mistake fails here.
   */
  it("turns one application per status into {applied: 6, interviewed: 2, won: 1}", async () => {
    execute.mockResolvedValue(
      rows({
        draft: 1,
        submitted: 1,
        interview: 1,
        offer: 1,
        rejected: 1,
        withdrawn: 1,
        no_response: 1,
      }),
    );

    await expect(service.getOutcomes(RAW)).resolves.toEqual({
      applied: 6,
      interviewed: 2,
      won: 1,
    });
  });

  it("never counts drafts", async () => {
    execute.mockResolvedValue(rows({ draft: 9 }));
    await expect(service.getOutcomes(RAW)).resolves.toEqual({
      applied: 0,
      interviewed: 0,
      won: 0,
    });
  });

  it("counts an offer in all three tiers", async () => {
    execute.mockResolvedValue(rows({ offer: 3 }));
    await expect(service.getOutcomes(RAW)).resolves.toEqual({
      applied: 3,
      interviewed: 3,
      won: 3,
    });
  });

  it("counts a rejection as applied but not interviewed", async () => {
    execute.mockResolvedValue(rows({ rejected: 4 }));
    await expect(service.getOutcomes(RAW)).resolves.toEqual({
      applied: 4,
      interviewed: 0,
      won: 0,
    });
  });

  it("counts a withdrawal as applied — the application was really made", async () => {
    execute.mockResolvedValue(rows({ withdrawn: 2 }));
    await expect(service.getOutcomes(RAW)).resolves.toEqual({
      applied: 2,
      interviewed: 0,
      won: 0,
    });
  });

  it("ignores an unknown status rather than throwing", async () => {
    execute.mockResolvedValue(rows({ submitted: 1, something_new: 5 }));
    await expect(service.getOutcomes(RAW)).resolves.toEqual({
      applied: 1,
      interviewed: 0,
      won: 0,
    });
  });

  it("returns zeroes for a user with no applications", async () => {
    execute.mockResolvedValue({ rows: [] });
    await expect(service.getOutcomes(RAW)).resolves.toEqual({
      applied: 0,
      interviewed: 0,
      won: 0,
    });
  });

  it("coerces a string count — pg returns bigint as a string", async () => {
    execute.mockResolvedValue({
      rows: [{ status: "submitted", total: "12" }],
    });
    await expect(service.getOutcomes(RAW)).resolves.toEqual({
      applied: 12,
      interviewed: 0,
      won: 0,
    });
  });

  it("queries BOTH id representations — the live table holds a mix", async () => {
    execute.mockResolvedValue({ rows: [] });
    await service.getOutcomes(RAW);

    const rendered = renderSql(execute.mock.calls[0][0]);
    expect(rendered).toContain(RAW);
    expect(rendered).toContain(LEGACY);
    expect(rendered).toContain("opportunity_applications");
    expect(rendered).toContain("group by");
  });

  it("issues exactly ONE database round trip", async () => {
    execute.mockResolvedValue({ rows: [] });
    await service.getOutcomes(RAW);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

describe("OutcomesService.getVisibleOutcomes", () => {
  let service: InstanceType<typeof OutcomesService>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OutcomesService();
  });

  it("returns null — not zeroes — when the user has outcomes hidden", async () => {
    const result = await service.getVisibleOutcomes(RAW, {
      publicProfile: true,
      allowContact: false,
      showOutcomes: false,
    });
    expect(result).toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });

  it("returns the real totals when the user has opted in", async () => {
    execute.mockResolvedValue({
      rows: [
        { status: "submitted", total: 5 },
        { status: "interview", total: 1 },
        { status: "offer", total: 1 },
      ],
    });
    await expect(
      service.getVisibleOutcomes(RAW, {
        publicProfile: true,
        allowContact: false,
        showOutcomes: true,
      }),
    ).resolves.toEqual({ applied: 7, interviewed: 2, won: 1 });
  });

  it("degrades to null rather than breaking the profile when the query fails", async () => {
    execute.mockRejectedValue(new Error("connection reset"));
    await expect(
      service.getVisibleOutcomes(RAW, {
        publicProfile: true,
        allowContact: false,
        showOutcomes: true,
      }),
    ).resolves.toBeNull();
  });
});

/** Flattens a Drizzle SQL node with its parameter values inlined. */
function renderSql(node: unknown): string {
  if (node === null || node === undefined) return "";
  if (typeof node !== "object") return String(node);
  const value = node as {
    queryChunks?: unknown[];
    value?: unknown;
    name?: string;
  };
  if (Array.isArray(value.queryChunks)) {
    return value.queryChunks.map(renderSql).join("");
  }
  if (Array.isArray(value.value)) return value.value.join("");
  if (typeof value.name === "string") return value.name;
  if (value.value !== undefined) return String(value.value);
  return "";
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/social/outcomes.service.spec.ts
```

Expected: FAIL — `Cannot find module './outcomes.service'`.

- [ ] **Step 3: Write the implementation**

Create `backend/services/services/api/src/social/outcomes.service.ts`:

```ts
import { Injectable, Logger } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { db } from "../db";
import type { ProfilePrivacy } from "../db/schema";
import { legacyUserIdCandidates } from "../common/community-user-id";

export type VerifiedOutcomes = {
  applied: number;
  interviewed: number;
  won: number;
};

/**
 * Every non-`draft` status. A draft is an intention, not an application —
 * everything else was really sent.
 *
 * Counting only `submitted` would be wrong in the most visible possible way:
 * an application that PROGRESSED (to interview, offer, rejected…) leaves the
 * `submitted` bucket, so a user with 10 interviews would render "Applied 0".
 *
 * Verified against the live `opportunity_applications_status_check` on
 * 2026-07-25. There is no `shortlisted` status; `interview` is that tier.
 */
export const APPLIED_STATUSES = [
  "submitted",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
  "no_response",
] as const;

/** Interview AND BEYOND — an offer implies an interview happened. */
export const INTERVIEWED_STATUSES = ["interview", "offer"] as const;

/** A win. */
export const WON_STATUSES = ["offer"] as const;

@Injectable()
export class OutcomesService {
  private readonly logger = new Logger(OutcomesService.name);

  /**
   * Verified track record, computed on read from our own pipeline. Never
   * stored, never self-reported — that is the entire point of the badge.
   *
   * One grouped statement: `opportunity_applications` is not declared in
   * `db/schema.ts` (me.service.ts owns it through the Supabase client), and
   * adding a competing Drizzle definition would invite schema drift and collide
   * with Slice 3, which reads the same table.
   */
  async getOutcomes(rawUserId: string): Promise<VerifiedOutcomes> {
    // The column is TEXT and holds a MIX of the raw Clerk sub and the derived
    // uuid (2/43 vs 41/43 on 2026-07-25). Matching one shape under-counts.
    const ids = legacyUserIdCandidates(rawUserId);
    const idMatch = sql.join(
      ids.map((id) => sql`user_id::text = ${id}`),
      sql` or `,
    );

    const result = await db.execute<{
      status: string;
      total: number | string;
    }>(sql`
      select status, count(*)::int as total
      from public.opportunity_applications
      where (${idMatch})
      group by status
    `);

    const byStatus = new Map<string, number>();
    for (const row of result.rows ?? []) {
      byStatus.set(String(row.status), Number(row.total) || 0);
    }

    const sum = (statuses: readonly string[]) =>
      statuses.reduce(
        (total, status) => total + (byStatus.get(status) ?? 0),
        0,
      );

    return {
      applied: sum(APPLIED_STATUSES),
      interviewed: sum(INTERVIEWED_STATUSES),
      won: sum(WON_STATUSES),
    };
  }

  /**
   * Privacy-gated variant. Returns `null` when the user has outcomes hidden —
   * NOT `{applied: 0, interviewed: 0, won: 0}`. A zero is a claim about
   * someone; an absence is not. Callers must render null as "no track record
   * shown", never as zeroes.
   */
  async getVisibleOutcomes(
    rawUserId: string,
    privacy: ProfilePrivacy,
  ): Promise<VerifiedOutcomes | null> {
    if (!privacy?.showOutcomes) return null;
    try {
      return await this.getOutcomes(rawUserId);
    } catch (error) {
      // A profile must still render if the outcomes query fails.
      this.logger.warn(
        `Could not compute outcomes for ${rawUserId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }
}
```

- [ ] **Step 4: Register the provider**

In `backend/services/services/api/src/social/social.module.ts`, import `OutcomesService` from
`./outcomes.service` and add it to both `providers` and `exports`.

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/social/outcomes.service.spec.ts
```

Expected: PASS — `Tests: 16 passed, 16 total`.

- [ ] **Step 6: Sanity-check the tiers against real data**

```bash
psql "$DATABASE_URL" -c "select status, count(*) from public.opportunity_applications group by status order by status;"
```

Expected: a breakdown across `draft` / `submitted` / `interview` / … . The sum of every non-`draft`
row is the platform-wide `applied` total; `interview + offer` is the `interviewed` total; `offer`
alone is the `won` total. Those three numbers are what every profile page must add up to.

- [ ] **Step 7: Lint and commit**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npm run lint
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
git add backend/services/services/api/src/social
git commit -m "feat(social): three-tier verified outcomes (applied/interviewed/won)"
```

---

## Task 7: `GET /social/u/:username` — the public profile

**Files:**
- Create: `backend/services/services/api/src/auth/optional-auth.decorator.ts`
- Modify: `backend/services/services/api/src/auth/clerk-auth.guard.ts`
- Modify: `backend/services/services/api/src/auth/index.ts`
- Modify: `backend/services/services/api/src/social/social.service.ts`
- Modify: `backend/services/services/api/src/social/social.controller.ts`
- Test: `backend/services/services/api/src/social/social.service.spec.ts`

**Interfaces:**
- Consumes: `OutcomesService` (Task 6), `isApprovedMentor` from `../common/mentor-access`,
  `userBlocks` + `userFollows` + `profiles` (schema), `toLegacyUuid` (Task 1).
- Produces — **the shape `@edutu/core`'s `PublicProfile` mirrors exactly (Task 10):**
  ```ts
  export type ViewerRelation = { isSelf: boolean; isFollowing: boolean };
  export type PublicProfileResponse = {
    username: string; displayName: string; avatarUrl: string | null;
    headline: string | null; bio: string | null; country: string | null;
    isMentor: boolean; followerCount: number; followingCount: number;
    outcomes: { applied: number; won: number } | null;
    allowContact: boolean;
    viewer: ViewerRelation;
  };
  class SocialService { getPublicProfile(viewerRawId: string | null, username: string): Promise<PublicProfileResponse>; }
  ```
  Also published for slices 2 and 5: `@OptionalAuth()` from `src/auth` — pair it with `@Public()` on a
  route that should render signed-out but personalise when a token happens to be present
  (Slice 2's `GET /communities/invites/:token`, Slice 5's SEO group pages).

- [ ] **Step 1: Write the failing test**

Append to `backend/services/services/api/src/social/social.service.spec.ts`:

```ts
describe("SocialService.getPublicProfile", () => {
  let service: InstanceType<typeof SocialService>;
  let outcomes: { getVisibleOutcomes: jest.Mock };

  const TARGET_RAW = "user_targetXYZ";

  const targetRow = {
    userId: TARGET_RAW,
    username: "amara_o",
    fullName: "Amara Okafor",
    avatarUrl: "https://cdn.example/a.png",
    headline: "Chasing a fully-funded MSc",
    bio: "Lagos.",
    country: "Nigeria",
    creatorStatus: "none",
    mentorStatus: "approved",
    privacy: { publicProfile: true, allowContact: true, showOutcomes: true },
  };

  beforeEach(() => {
    mockDb.reset();
    jest.clearAllMocks();
    outcomes = { getVisibleOutcomes: jest.fn().mockResolvedValue({ applied: 12, won: 1 }) };
    service = new SocialService(outcomes as never);
  });

  it("projects exactly the PublicProfile shape", async () => {
    mockDb.queueSelects(
      [targetRow],
      [], // blocks
      [{ total: 40 }], // followers
      [{ total: 3 }], // following
      [], // viewer follow edge
    );

    const result = await service.getPublicProfile({ authId: RAW }, "@Amara_O");

    expect(result).toEqual({
      username: "amara_o",
      displayName: "Amara Okafor",
      avatarUrl: "https://cdn.example/a.png",
      headline: "Chasing a fully-funded MSc",
      bio: "Lagos.",
      country: "Nigeria",
      isMentor: true,
      followerCount: 40,
      followingCount: 3,
      outcomes: { applied: 12, won: 1 },
      allowContact: true,
      viewer: { isSelf: false, isFollowing: false },
    });
  });

  it("omits outcomes (null, not zeroes) when the owner hides them", async () => {
    outcomes.getVisibleOutcomes.mockResolvedValue(null);
    mockDb.queueSelects(
      [{ ...targetRow, privacy: { publicProfile: true, allowContact: true, showOutcomes: false } }],
      [],
      [{ total: 0 }],
      [{ total: 0 }],
      [],
    );

    const result = await service.getPublicProfile(null, "amara_o");
    expect(result.outcomes).toBeNull();
  });

  it("falls back to the handle when the profile has no full name", async () => {
    mockDb.queueSelects(
      [{ ...targetRow, fullName: null }],
      [],
      [{ total: 0 }],
      [{ total: 0 }],
      [],
    );
    const result = await service.getPublicProfile(null, "amara_o");
    expect(result.displayName).toBe("amara_o");
  });

  it("marks an approved CREATOR as a mentor too", async () => {
    mockDb.queueSelects(
      [{ ...targetRow, mentorStatus: "none", creatorStatus: "approved" }],
      [],
      [{ total: 0 }],
      [{ total: 0 }],
      [],
    );
    const result = await service.getPublicProfile(null, "amara_o");
    expect(result.isMentor).toBe(true);
  });

  it("404s on an unknown handle", async () => {
    mockDb.queueSelects([]);
    await expect(service.getPublicProfile(null, "nobody")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("404s on a private profile for a stranger", async () => {
    mockDb.queueSelects([
      { ...targetRow, privacy: { publicProfile: false, allowContact: false, showOutcomes: false } },
    ]);
    await expect(service.getPublicProfile({ authId: RAW }, "amara_o")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("still shows a private profile to its OWNER", async () => {
    mockDb.queueSelects(
      [
        {
          ...targetRow,
          userId: RAW,
          privacy: { publicProfile: false, allowContact: false, showOutcomes: false },
        },
      ],
      [],
      [{ total: 0 }],
      [{ total: 0 }],
      [],
    );
    const result = await service.getPublicProfile({ authId: RAW }, "amara_o");
    expect(result.viewer.isSelf).toBe(true);
  });

  it("404s when either side has blocked the other", async () => {
    mockDb.queueSelects([targetRow], [{ id: "block-1" }]);
    await expect(service.getPublicProfile({ authId: RAW }, "amara_o")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("checks blocks against the LEGACY uuid namespace, which is what user_blocks holds", async () => {
    mockDb.queueSelects([targetRow], [{ id: "block-1" }]);
    await service.getPublicProfile({ authId: RAW }, "amara_o").catch(() => undefined);

    const blockQuery = mockDb.calls.find((call) => call.table === "user_blocks");
    expect(blockQuery?.where).toContain(toDatabaseUserId(RAW));
    expect(blockQuery?.where).toContain(toDatabaseUserId(TARGET_RAW));
    expect(blockQuery?.where).not.toContain("user_targetXYZ");
  });

  it("reports isFollowing for a signed-in viewer who follows the target", async () => {
    mockDb.queueSelects(
      [targetRow],
      [],
      [{ total: 1 }],
      [{ total: 0 }],
      [{ id: "follow-1" }],
    );
    const result = await service.getPublicProfile({ authId: RAW }, "amara_o");
    expect(result.viewer.isFollowing).toBe(true);
  });

  it("does not query blocks or follows at all for a signed-out visitor", async () => {
    mockDb.queueSelects([targetRow], [{ total: 1 }], [{ total: 0 }]);
    const result = await service.getPublicProfile(null, "amara_o");

    expect(result.viewer).toEqual({ isSelf: false, isFollowing: false });
    expect(mockDb.calls.some((call) => call.table === "user_blocks")).toBe(false);
    expect(mockDb.calls.some((call) => call.table === "user_follows" && call.where.includes(RAW))).toBe(false);
  });
});
```

Add `NotFoundException` to the `@nestjs/common` import at the top of the spec file.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/social/social.service.spec.ts -t "getPublicProfile"
```

Expected: FAIL — `service.getPublicProfile is not a function`.

- [ ] **Step 3: Add the `@OptionalAuth()` decorator**

Create `backend/services/services/api/src/auth/optional-auth.decorator.ts`:

```ts
import { SetMetadata } from "@nestjs/common";

export const IS_OPTIONAL_AUTH_KEY = "isOptionalAuth";

/**
 * Pair with `@Public()`. The route stays reachable signed-out, but if the
 * request DOES carry a valid token, `request.user` is populated so the handler
 * can personalise the response (viewer relations, member state, …).
 *
 * Deliberately opt-in rather than applied to every public route: verifying a
 * token costs a JWKS round trip on a cold cache, and the hot public catalog
 * routes must not pay for it.
 */
export const OptionalAuth = () => SetMetadata(IS_OPTIONAL_AUTH_KEY, true);
```

Add to `backend/services/services/api/src/auth/index.ts`:

```ts
export * from "./optional-auth.decorator";
```

In `backend/services/services/api/src/auth/clerk-auth.guard.ts`, add the import:

```ts
import { IS_OPTIONAL_AUTH_KEY } from "./optional-auth.decorator";
```

then replace the early-return block inside `canActivate`:

```ts
    if (isPublic) {
      return true;
    }
```

with:

```ts
    if (isPublic) {
      const optionalAuth = this.reflector.getAllAndOverride<boolean>(
        IS_OPTIONAL_AUTH_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (optionalAuth) {
        await this.attachOptionalUser(context.switchToHttp().getRequest());
      }
      return true;
    }
```

and add this private method to the class (next to `tryAuthenticateClerk`):

```ts
  /**
   * Best-effort authentication for `@Public() @OptionalAuth()` routes. Never
   * throws: an unauthenticated visitor must still receive the public response.
   */
  private async attachOptionalUser(request: any): Promise<void> {
    try {
      if (this.tryAuthenticateLocalAdmin(request)) return;

      const authHeader = request?.headers?.authorization;
      if (typeof authHeader !== "string") return;

      const token = authHeader.match(BEARER_TOKEN_PATTERN)?.[1]?.trim();
      if (!token) return;

      if (await this.tryAuthenticateClerk(token, request)) return;
      await this.tryAuthenticateSupabase(token, request);
    } catch {
      // Ignore — the route is public.
    }
  }
```

- [ ] **Step 4: Implement `getPublicProfile`**

In `backend/services/services/api/src/social/social.service.ts`, extend the imports:

```ts
import { and, count, eq, ne, or, sql } from "drizzle-orm";
import {
  DEFAULT_PROFILE_PRIVACY,
  profiles,
  userBlocks,
  userFollows,
  type ProfilePrivacy,
} from "../db/schema";
import { isApprovedMentor } from "../common/mentor-access";
import { toLegacyUuid } from "../common/community-user-id";
import { OutcomesService } from "./outcomes.service";
```

Give the class a constructor:

```ts
  constructor(private readonly outcomesService: OutcomesService) {}
```

Add the types just below `SocialProfileSettings`:

```ts
export type ViewerRelation = { isSelf: boolean; isFollowing: boolean };

export type PublicProfileResponse = {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  headline: string | null;
  bio: string | null;
  country: string | null;
  isMentor: boolean;
  followerCount: number;
  followingCount: number;
  outcomes: { applied: number; won: number } | null;
  allowContact: boolean;
  viewer: ViewerRelation;
};
```

and add these members to the class:

```ts
  /**
   * Resolves a handle to the profile row. `username` is `extensions.citext`, so
   * the comparison is already case-insensitive in the database — but the input
   * is normalised first anyway so `@Amara_O` and whitespace both resolve.
   */
  private async findByUsername(username: string) {
    const handle = normalizeUsername(username);
    if (!handle) return null;

    const [row] = await db
      .select({
        userId: profiles.userId,
        username: profiles.username,
        fullName: profiles.fullName,
        avatarUrl: profiles.avatarUrl,
        headline: profiles.headline,
        bio: profiles.bio,
        country: profiles.country,
        creatorStatus: profiles.creatorStatus,
        mentorStatus: profiles.mentorStatus,
        privacy: profiles.privacy,
      })
      .from(profiles)
      .where(eq(profiles.username, handle))
      .limit(1)
      .execute();

    return row ?? null;
  }

  /**
   * `user_blocks` is uuid-keyed (verified against the live DB) — this is the
   * sanctioned legacy conversion boundary, and the only place in this module
   * that calls `toLegacyUuid`.
   */
  private async isBlockedEitherWay(
    viewerRawId: string,
    targetRawId: string,
  ): Promise<boolean> {
    const viewer = toLegacyUuid(viewerRawId);
    const target = toLegacyUuid(targetRawId);

    const [row] = await db
      .select({ id: userBlocks.id })
      .from(userBlocks)
      .where(
        or(
          and(
            eq(userBlocks.blockerUserId, viewer),
            eq(userBlocks.blockedUserId, target),
          ),
          and(
            eq(userBlocks.blockerUserId, target),
            eq(userBlocks.blockedUserId, viewer),
          ),
        ),
      )
      .limit(1)
      .execute();

    return Boolean(row);
  }

  private async countFollowers(targetRawId: string): Promise<number> {
    const [row] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(userFollows)
      .where(eq(userFollows.followeeUserId, targetRawId))
      .execute();
    return Number(row?.total ?? 0);
  }

  private async countFollowing(targetRawId: string): Promise<number> {
    const [row] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(userFollows)
      .where(eq(userFollows.followerUserId, targetRawId))
      .execute();
    return Number(row?.total ?? 0);
  }

  private async isFollowing(
    followerRawId: string,
    followeeRawId: string,
  ): Promise<boolean> {
    const [row] = await db
      .select({ id: userFollows.id })
      .from(userFollows)
      .where(
        and(
          eq(userFollows.followerUserId, followerRawId),
          eq(userFollows.followeeUserId, followeeRawId),
        ),
      )
      .limit(1)
      .execute();
    return Boolean(row);
  }

  async getPublicProfile(
    // RAW Clerk sub of the signed-in viewer, or null for a public visitor.
    viewer: string | null,
    username: string,
  ): Promise<PublicProfileResponse> {
    const row = await this.findByUsername(username);
    // 404, never 403: telling a stranger "this handle exists but is private"
    // is itself a disclosure, and it lets someone enumerate handles.
    const notFound = new NotFoundException("Profile not found");
    if (!row) throw notFound;

    const targetRawId = String(row.userId);
    const viewerRawId = viewer ? rawClerkUserId(viewer) : null;
    const isSelf = Boolean(
      viewerRawId &&
        legacyUserIdCandidates(viewerRawId).includes(targetRawId),
    );

    const privacy = this.normalizePrivacy(row.privacy);
    if (!privacy.publicProfile && !isSelf) throw notFound;

    if (viewerRawId && !isSelf) {
      if (await this.isBlockedEitherWay(viewerRawId, targetRawId)) {
        throw notFound;
      }
    }

    const [followerCount, followingCount, outcomes] = await Promise.all([
      this.countFollowers(targetRawId),
      this.countFollowing(targetRawId),
      this.outcomesService.getVisibleOutcomes(targetRawId, privacy),
    ]);

    const following =
      viewerRawId && !isSelf
        ? await this.isFollowing(viewerRawId, targetRawId)
        : false;

    return {
      username: String(row.username),
      displayName: row.fullName?.trim() || String(row.username),
      avatarUrl: row.avatarUrl ?? null,
      headline: row.headline ?? null,
      bio: row.bio ?? null,
      country: row.country ?? null,
      isMentor: isApprovedMentor({
        creatorStatus: row.creatorStatus,
        mentorStatus: row.mentorStatus,
      }),
      followerCount,
      followingCount,
      outcomes,
      // Never advertise "contact me" to a signed-out visitor who cannot be
      // rate-limited by user id.
      allowContact: privacy.allowContact && Boolean(viewerRawId) && !isSelf,
      viewer: { isSelf, isFollowing: following },
    };
  }
```

> `Promise.all` ordering note: the spec's `queueSelects` hands results out in the order the terminal
> queries actually run. `countFollowers` is issued before `countFollowing`, which is before the
> outcomes queries (mocked out in this spec), which is before the viewer follow-edge lookup.

- [ ] **Step 5: Add the route**

In `backend/services/services/api/src/social/social.controller.ts`, extend the imports with
`Param` from `@nestjs/common` and `OptionalAuth`, `Public` from `../auth`, then add:

```ts
  // Public so shared links and crawlers resolve; @OptionalAuth means a
  // signed-in viewer still gets `viewer.isFollowing` in one round trip.
  @Get("u/:username")
  @Public()
  @OptionalAuth()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  publicProfile(
    // Null for a signed-out visitor: @OptionalAuth only populates request.user
    // when a valid token happens to be present.
    @CurrentUser("authId") viewerRawId: string | null,
    @Param("username") username: string,
  ) {
    return this.socialService.getPublicProfile(viewerRawId, username);
  }
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/social src/auth
```

Expected: PASS — `social.service.spec.ts` now at 28 tests, `admin.guard.spec.ts` unchanged.

- [ ] **Step 7: Verify the route end to end**

Start the API locally, then:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/social/u/definitely-not-a-real-handle
```

Expected: `404`. It must **not** be `401` — a `401` means `@Public()` did not take effect and every
shared profile link would break for signed-out visitors.

- [ ] **Step 8: Lint, full suite, boot check, commit**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npm run lint && npm test && npm run build && node dist/main
```

Expected: lint 0, suite green, and `Mapped {/social/u/:username, GET} route` in the boot log. Ctrl-C.

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
git add backend/services/services/api/src/social backend/services/services/api/src/auth
git commit -m "feat(social): public profile endpoint with optional-auth viewer context"
```

---

## Task 8: Follow graph and the `follow` notification

**Files:**
- Modify: `backend/services/services/api/src/social/social.service.ts`
- Modify: `backend/services/services/api/src/social/social.controller.ts`
- Modify: `backend/services/services/api/src/social/social.module.ts`
- Test: `backend/services/services/api/src/social/social.service.spec.ts`

**Interfaces:**
- Consumes: `NotificationsService.broadcast` from `../notifications/notifications.service`;
  `NotificationKind` (Task 2) now includes `"follow"`; `userFollows` (Task 2).
- Produces:
  ```ts
  export type FollowResult = { following: boolean; followerCount: number };
  export type ProfileSummary = {
    username: string; displayName: string; avatarUrl: string | null;
    headline: string | null; isMentor: boolean;
  };
  export type FollowListPage = { items: ProfileSummary[]; nextCursor: string | null };
  class SocialService {
    followUser(viewerRawId: string, username: string, actorName?: string | null): Promise<FollowResult>;
    unfollowUser(viewerRawId: string, username: string): Promise<FollowResult>;
    listFollowers(username: string, query: FollowListQueryDto): Promise<FollowListPage>;
    listFollowing(username: string, query: FollowListQueryDto): Promise<FollowListPage>;
  }
  ```
- Routes live: `POST`/`DELETE /social/u/:username/follow`, `GET /social/u/:username/followers`,
  `GET /social/u/:username/following`.

- [ ] **Step 1: Write the failing test**

Append to `backend/services/services/api/src/social/social.service.spec.ts`:

```ts
describe("SocialService follow graph", () => {
  let service: InstanceType<typeof SocialService>;
  let outcomes: { getVisibleOutcomes: jest.Mock };
  let notifications: { broadcast: jest.Mock };

  const TARGET_RAW = "user_targetXYZ";
  const targetRow = {
    userId: TARGET_RAW,
    username: "amara_o",
    fullName: "Amara Okafor",
    avatarUrl: null,
    headline: null,
    bio: null,
    country: null,
    creatorStatus: "none",
    mentorStatus: "none",
    privacy: { publicProfile: true, allowContact: false, showOutcomes: false },
  };

  beforeEach(() => {
    mockDb.reset();
    jest.clearAllMocks();
    outcomes = { getVisibleOutcomes: jest.fn().mockResolvedValue(null) };
    notifications = { broadcast: jest.fn().mockResolvedValue(undefined) };
    service = new SocialService(outcomes as never, notifications as never);
  });

  it("inserts the edge keyed on RAW Clerk subs on both sides", async () => {
    mockDb.queueSelects([targetRow], [], [{ total: 1 }]);
    mockDb.queueReturning([{ id: "follow-1" }]);

    const result = await service.followUser({ authId: RAW }, "amara_o");

    expect(result).toEqual({ following: true, followerCount: 1 });

    const insert = mockDb.calls.find((call) => call.op === "insert");
    expect(insert?.table).toBe("user_follows");
    expect(insert?.values).toEqual({
      followerUserId: RAW,
      followeeUserId: TARGET_RAW,
    });
  });

  it("sends a `follow` notification to the followee", async () => {
    mockDb.queueSelects([targetRow], [], [{ total: 1 }]);
    mockDb.queueReturning([{ id: "follow-1" }]);

    await service.followUser({ authId: RAW, firstName: "Paul" }, "amara_o");

    expect(notifications.broadcast).toHaveBeenCalledTimes(1);
    const [actorId, dto] = notifications.broadcast.mock.calls[0];
    expect(actorId).toBe(TARGET_RAW);
    expect(dto).toMatchObject({
      audience: "specific",
      targetUserIds: [TARGET_RAW],
      kind: "follow",
    });
    expect(dto.dedupeKey).toBe(`follow:${RAW}:${TARGET_RAW}`);
  });

  it("does NOT re-notify when the follow already existed", async () => {
    mockDb.queueSelects([targetRow], [], [{ total: 1 }]);
    mockDb.queueReturning([]); // onConflictDoNothing inserted no row

    const result = await service.followUser({ authId: RAW }, "amara_o");

    expect(result.following).toBe(true);
    expect(notifications.broadcast).not.toHaveBeenCalled();
  });

  it("never fails the follow because the notification failed", async () => {
    notifications.broadcast.mockRejectedValue(new Error("brevo down"));
    mockDb.queueSelects([targetRow], [], [{ total: 1 }]);
    mockDb.queueReturning([{ id: "follow-1" }]);

    await expect(service.followUser({ authId: RAW }, "amara_o")).resolves.toEqual({
      following: true,
      followerCount: 1,
    });
  });

  it("refuses a self-follow with 400", async () => {
    mockDb.queueSelects([{ ...targetRow, userId: RAW }]);
    await expect(service.followUser({ authId: RAW }, "amara_o")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("404s when either side has blocked the other", async () => {
    mockDb.queueSelects([targetRow], [{ id: "block-1" }]);
    await expect(service.followUser({ authId: RAW }, "amara_o")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(mockDb.db.insert).not.toHaveBeenCalled();
  });

  it("deletes the edge on unfollow and returns the new count", async () => {
    mockDb.queueSelects([targetRow], [{ total: 0 }]);

    const result = await service.unfollowUser({ authId: RAW }, "amara_o");

    expect(result).toEqual({ following: false, followerCount: 0 });
    const del = mockDb.calls.find((call) => call.op === "delete");
    expect(del?.table).toBe("user_follows");
    expect(del?.where).toContain(RAW);
    expect(del?.where).toContain(TARGET_RAW);
  });

  it("unfollowing someone you do not follow is a no-op, not an error", async () => {
    mockDb.queueSelects([targetRow], [{ total: 3 }]);
    await expect(service.unfollowUser({ authId: RAW }, "amara_o")).resolves.toEqual({
      following: false,
      followerCount: 3,
    });
  });

  it("lists followers as profile summaries with a cursor", async () => {
    mockDb.queueSelects(
      [targetRow],
      [
        {
          username: "kwame",
          fullName: "Kwame A",
          avatarUrl: null,
          headline: "Chasing Chevening",
          creatorStatus: "none",
          mentorStatus: "approved",
          createdAt: new Date("2026-07-20T10:00:00Z"),
        },
      ],
    );

    const page = await service.listFollowers("amara_o", { limit: 1 });

    expect(page.items).toEqual([
      {
        username: "kwame",
        displayName: "Kwame A",
        avatarUrl: null,
        headline: "Chasing Chevening",
        isMentor: true,
      },
    ]);
    expect(page.nextCursor).toBeNull();
  });

  it("returns a nextCursor only when another page exists", async () => {
    const row = (n: number) => ({
      username: `u${n}`,
      fullName: `U ${n}`,
      avatarUrl: null,
      headline: null,
      creatorStatus: "none",
      mentorStatus: "none",
      createdAt: new Date(`2026-07-2${n}T10:00:00Z`),
    });
    // limit 1 => the service asks for 2 and trims
    mockDb.queueSelects([targetRow], [row(1), row(2)]);

    const page = await service.listFollowers("amara_o", { limit: 1 });

    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBe("2026-07-21T10:00:00.000Z");
  });

  it("404s the follower list for an unknown handle", async () => {
    mockDb.queueSelects([]);
    await expect(service.listFollowers("nobody", {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/social/social.service.spec.ts -t "follow graph"
```

Expected: FAIL — `service.followUser is not a function`.

- [ ] **Step 3: Implement the follow graph**

In `backend/services/services/api/src/social/social.service.ts`, extend the imports:

```ts
import { and, desc, eq, isNotNull, lt, ne, or, sql } from "drizzle-orm";
import { NotificationsService } from "../notifications/notifications.service";
import type { FollowListQueryDto } from "./dto/social.dto";
```

Extend the constructor:

```ts
  constructor(
    private readonly outcomesService: OutcomesService,
    private readonly notificationsService: NotificationsService,
  ) {}
```

Add the types next to `PublicProfileResponse`:

```ts
export type FollowResult = { following: boolean; followerCount: number };

export type ProfileSummary = {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  headline: string | null;
  isMentor: boolean;
};

export type FollowListPage = {
  items: ProfileSummary[];
  nextCursor: string | null;
};

const DEFAULT_FOLLOW_PAGE_SIZE = 25;
```

and add these members to the class:

```ts
  /**
   * Shared preamble for both follow writes: resolve the handle, refuse a
   * self-follow, and honour blocks. Blocks 404 rather than 403 for the same
   * reason `getPublicProfile` does — a 403 confirms the account exists.
   */
  private async resolveFollowTarget(
    viewer: string,
    username: string,
  ): Promise<{ viewerRawId: string; targetRawId: string }> {
    const row = await this.findByUsername(username);
    if (!row) throw new NotFoundException("Profile not found");

    const viewerRawId = rawClerkUserId(viewer);
    const targetRawId = String(row.userId);

    if (legacyUserIdCandidates(viewerRawId).includes(targetRawId)) {
      throw new BadRequestException({
        code: "cannot_follow_self",
        message: "You cannot follow yourself.",
      });
    }
    if (await this.isBlockedEitherWay(viewerRawId, targetRawId)) {
      throw new NotFoundException("Profile not found");
    }

    return { viewerRawId, targetRawId };
  }

  async followUser(
    viewer: string,
    username: string,
    // Only used for the notification copy. Passed explicitly rather than read
    // off a user object, so the service never touches `request.user.id`.
    actorName?: string | null,
  ): Promise<FollowResult> {
    const { viewerRawId, targetRawId } = await this.resolveFollowTarget(
      viewer,
      username,
    );

    // onConflictDoNothing + returning() gives us idempotency AND tells us
    // whether this was a NEW follow, which is what gates the notification.
    const inserted = await db
      .insert(userFollows)
      .values({ followerUserId: viewerRawId, followeeUserId: targetRawId })
      .onConflictDoNothing()
      .returning({ id: userFollows.id })
      .execute();

    const followerCount = await this.countFollowers(targetRawId);

    if (inserted.length > 0) {
      await this.notifyNewFollower(actorName, viewerRawId, targetRawId);
    }

    return { following: true, followerCount };
  }

  /**
   * Fire-and-forget by design: a notification failure must never make the user
   * think the follow did not happen. `broadcast` converts the raw sub to the
   * uuid `notifications.user_id` needs via its own `toDatabaseUserId` call, so
   * the raw id is what goes in.
   */
  private async notifyNewFollower(
    rawActorName: string | null | undefined,
    viewerRawId: string,
    targetRawId: string,
  ): Promise<void> {
    const actorName = rawActorName?.trim() || "Someone";
    try {
      await this.notificationsService.broadcast(targetRawId, {
        audience: "specific",
        targetUserIds: [targetRawId],
        kind: "follow",
        severity: "info",
        title: `${actorName} started following you`,
        body: "They will see your wins and group activity.",
        dedupeKey: `follow:${viewerRawId}:${targetRawId}`,
        channels: { inApp: true, push: true, email: false },
        metadata: { followerUserId: viewerRawId },
      });
    } catch (error) {
      this.logger.warn(
        `Could not notify ${targetRawId} of a new follower: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async unfollowUser(
    viewer: string,
    username: string,
  ): Promise<FollowResult> {
    const { viewerRawId, targetRawId } = await this.resolveFollowTarget(
      viewer,
      username,
    );

    await db
      .delete(userFollows)
      .where(
        and(
          eq(userFollows.followerUserId, viewerRawId),
          eq(userFollows.followeeUserId, targetRawId),
        ),
      )
      .execute();

    return {
      following: false,
      followerCount: await this.countFollowers(targetRawId),
    };
  }

  private async listFollowEdges(
    username: string,
    direction: "followers" | "following",
    query: FollowListQueryDto,
  ): Promise<FollowListPage> {
    const row = await this.findByUsername(username);
    if (!row) throw new NotFoundException("Profile not found");

    const targetRawId = String(row.userId);
    const limit = query.limit ?? DEFAULT_FOLLOW_PAGE_SIZE;

    // followers: rows where the target is the followee, joined to the FOLLOWER
    // following: rows where the target is the follower, joined to the FOLLOWEE
    const anchorColumn =
      direction === "followers"
        ? userFollows.followeeUserId
        : userFollows.followerUserId;
    const otherColumn =
      direction === "followers"
        ? userFollows.followerUserId
        : userFollows.followeeUserId;

    const cursorDate = query.cursor ? new Date(query.cursor) : null;
    const hasCursor = Boolean(cursorDate && !Number.isNaN(cursorDate.getTime()));

    const rows = await db
      .select({
        username: profiles.username,
        fullName: profiles.fullName,
        avatarUrl: profiles.avatarUrl,
        headline: profiles.headline,
        creatorStatus: profiles.creatorStatus,
        mentorStatus: profiles.mentorStatus,
        createdAt: userFollows.createdAt,
      })
      .from(userFollows)
      // Straight text join: user_follows always holds the raw Clerk sub, and
      // 31 of 34 profile rows are keyed the same way. The handful of legacy
      // derived-uuid profile rows simply do not join — they have no handle and
      // therefore no profile page to link to anyway.
      .innerJoin(
        profiles,
        sql`${profiles.userId}::text = ${otherColumn}`,
      )
      .where(
        and(
          eq(anchorColumn, targetRawId),
          isNotNull(profiles.username),
          hasCursor ? lt(userFollows.createdAt, cursorDate as Date) : undefined,
        ),
      )
      .orderBy(desc(userFollows.createdAt))
      .limit(limit + 1)
      .execute();

    const page = rows.slice(0, limit);
    const nextCursor =
      rows.length > limit && page.length > 0
        ? new Date(page[page.length - 1].createdAt as Date).toISOString()
        : null;

    return {
      items: page.map((item) => ({
        username: String(item.username),
        displayName: item.fullName?.trim() || String(item.username),
        avatarUrl: item.avatarUrl ?? null,
        headline: item.headline ?? null,
        isMentor: isApprovedMentor({
          creatorStatus: item.creatorStatus,
          mentorStatus: item.mentorStatus,
        }),
      })),
      nextCursor,
    };
  }

  listFollowers(
    username: string,
    query: FollowListQueryDto,
  ): Promise<FollowListPage> {
    return this.listFollowEdges(username, "followers", query);
  }

  listFollowing(
    username: string,
    query: FollowListQueryDto,
  ): Promise<FollowListPage> {
    return this.listFollowEdges(username, "following", query);
  }
```

- [ ] **Step 4: Add the routes and wire the module**

In `backend/services/services/api/src/social/social.controller.ts`, add `Delete`, `HttpCode`,
`HttpStatus`, `Post` to the `@nestjs/common` import and `FollowListQuerySchema` /
`FollowListQueryDto` to the DTO import, then add:

```ts
  @Post("u/:username/follow")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  follow(
    @CurrentUser("authId") rawUserId: string,
    @Param("username") username: string,
    // Notification copy only — read explicitly so the service never has to
    // reach into a user object.
    @CurrentUser("firstName") actorName?: string,
  ) {
    return this.socialService.followUser(rawUserId, username, actorName);
  }

  @Delete("u/:username/follow")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  unfollow(
    @CurrentUser("authId") rawUserId: string,
    @Param("username") username: string,
  ) {
    return this.socialService.unfollowUser(rawUserId, username);
  }

  @Get("u/:username/followers")
  @Public()
  @OptionalAuth()
  followers(
    @Param("username") username: string,
    @Query(new ZodValidationPipe(FollowListQuerySchema))
    query: FollowListQueryDto,
  ) {
    return this.socialService.listFollowers(username, query);
  }

  @Get("u/:username/following")
  @Public()
  @OptionalAuth()
  following(
    @Param("username") username: string,
    @Query(new ZodValidationPipe(FollowListQuerySchema))
    query: FollowListQueryDto,
  ) {
    return this.socialService.listFollowing(username, query);
  }
```

In `backend/services/services/api/src/social/social.module.ts`, import
`NotificationsModule` from `../notifications/notifications.module` and add it to `imports`.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/social
```

Expected: PASS — `social.service.spec.ts` now at 39 tests.

- [ ] **Step 6: Verify the notification actually lands (the constraint is the whole risk here)**

With the API running locally and two test accounts, follow one from the other, then:

```bash
psql "$DATABASE_URL" -c "select kind, title, created_at from public.notifications where kind = 'follow' order by created_at desc limit 3;"
```

Expected: at least one row. **Zero rows means the CHECK constraint rejected the insert silently** —
re-run Task 2 Step 9 before continuing. This is the exact failure mode that swallowed
`deadline-reminder` in production.

- [ ] **Step 7: Lint, full suite, boot check, commit**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npm run lint && npm test && npm run build && node dist/main
```

Expected: green; boot log shows all four follow routes mapped. Ctrl-C.

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
git add backend/services/services/api/src/social
git commit -m "feat(social): follow graph, follower lists and the follow notification"
```

---

## Task 9: Contact relay — `POST /social/u/:username/contact`

**Files:**
- Create: `backend/services/services/api/src/support/brevo-mailer.service.ts`
- Modify: `backend/services/services/api/src/support/support.service.ts`
- Modify: `backend/services/services/api/src/support/support.module.ts`
- Create: `backend/services/services/api/src/social/contact-relay.service.ts`
- Test: `backend/services/services/api/src/social/contact-relay.service.spec.ts`
- Modify: `backend/services/services/api/src/social/social.controller.ts`
- Modify: `backend/services/services/api/src/social/social.module.ts`

**Interfaces:**
- Consumes: `socialContactMessages` (Task 2), `ContactMessageDto` (Task 4), `SocialService`'s
  private handle lookup — exposed here as a small public helper.
- Produces:
  ```ts
  // support/brevo-mailer.service.ts — reusable by any module that sends email
  export type BrevoAddress = { email: string; name?: string };
  export type BrevoEmail = {
    to: BrevoAddress[]; subject: string; htmlContent: string;
    replyTo?: BrevoAddress; sender?: BrevoAddress;
  };
  export class BrevoMailerService {
    isConfigured(): boolean;
    send(email: BrevoEmail): Promise<void>;
  }
  // social/contact-relay.service.ts
  export const CONTACT_DAILY_LIMIT = 5;
  export class ContactRelayService {
    export type ContactSender = { rawUserId: string; email?: string | null; firstName?: string | null };
    sendContactMessage(sender: ContactSender, username: string, dto: ContactMessageDto): Promise<{ ok: true }>;
  }
  ```
- Route live: `POST /social/u/:username/contact`.

**The security property this task must not break:** the sender never learns the recipient's email
address, and the recipient's address never appears in any HTTP response, log line, or error message.

- [ ] **Step 1: Write the failing test**

Create `backend/services/services/api/src/social/contact-relay.service.spec.ts`:

```ts
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { createMockDb } from "./testing/mock-db";
import { toDatabaseUserId } from "../common/user-id";

const mockDb = createMockDb();
jest.mock("../db", () => ({ db: mockDb.db }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ContactRelayService, CONTACT_DAILY_LIMIT } =
  require("./contact-relay.service") as typeof import("./contact-relay.service");

const SENDER_RAW = "user_senderABC";
const TARGET_RAW = "user_targetXYZ";
const SENDER = { authId: SENDER_RAW, email: "paul@example.com", firstName: "Paul" };

const RECIPIENT_EMAIL = "amara@private.example";

const targetRow = {
  userId: TARGET_RAW,
  username: "amara_o",
  fullName: "Amara Okafor",
  email: RECIPIENT_EMAIL,
  privacy: { publicProfile: true, allowContact: true, showOutcomes: false },
};

const DTO = { subject: "Chevening question", message: "How did you frame your leadership essay?" };

describe("ContactRelayService", () => {
  let service: InstanceType<typeof ContactRelayService>;
  let mailer: { isConfigured: jest.Mock; send: jest.Mock };

  beforeEach(() => {
    mockDb.reset();
    jest.clearAllMocks();
    mailer = {
      isConfigured: jest.fn().mockReturnValue(true),
      send: jest.fn().mockResolvedValue(undefined),
    };
    service = new ContactRelayService(mailer as never);
  });

  const happyPathSelects = () =>
    mockDb.queueSelects(
      [targetRow], // handle lookup
      [], // blocks
      [{ total: 0 }], // sender's messages in the last 24h
      [{ total: 0 }], // sender -> this recipient in the last 24h
    );

  it("emails the recipient with the SENDER as reply-to", async () => {
    happyPathSelects();

    await expect(service.sendContactMessage(SENDER, "amara_o", DTO)).resolves.toEqual({
      ok: true,
    });

    expect(mailer.send).toHaveBeenCalledTimes(1);
    const email = mailer.send.mock.calls[0][0];
    expect(email.to).toEqual([{ email: RECIPIENT_EMAIL, name: "Amara Okafor" }]);
    expect(email.replyTo).toEqual({ email: "paul@example.com", name: "Paul" });
    expect(email.subject).toContain("Chevening question");
  });

  it("NEVER returns the recipient's address to the sender", async () => {
    happyPathSelects();
    const result = await service.sendContactMessage(SENDER, "amara_o", DTO);
    expect(JSON.stringify(result)).not.toContain(RECIPIENT_EMAIL);
    expect(JSON.stringify(result)).not.toContain("@private.example");
  });

  it("does not put the recipient's address in the email body either", async () => {
    happyPathSelects();
    await service.sendContactMessage(SENDER, "amara_o", DTO);
    const email = mailer.send.mock.calls[0][0];
    expect(email.htmlContent).not.toContain(RECIPIENT_EMAIL);
  });

  it("escapes HTML in the message so the relay is not an injection vector", async () => {
    happyPathSelects();
    await service.sendContactMessage(SENDER, "amara_o", {
      subject: "hi",
      message: '<img src=x onerror="alert(1)"> hello there',
    });
    const email = mailer.send.mock.calls[0][0];
    expect(email.htmlContent).not.toContain("<img");
    expect(email.htmlContent).toContain("&lt;img");
  });

  it("records the send in the ledger without storing the body", async () => {
    happyPathSelects();
    await service.sendContactMessage(SENDER, "amara_o", DTO);

    const insert = mockDb.calls.find((call) => call.op === "insert");
    expect(insert?.table).toBe("social_contact_messages");
    expect(insert?.values).toEqual({
      senderUserId: SENDER_RAW,
      recipientUserId: TARGET_RAW,
      subject: "Chevening question",
    });
    expect(JSON.stringify(insert?.values)).not.toContain("leadership essay");
  });

  it("403s when the recipient has contact turned off (the default)", async () => {
    mockDb.queueSelects([
      {
        ...targetRow,
        privacy: { publicProfile: true, allowContact: false, showOutcomes: false },
      },
    ]);
    await expect(
      service.sendContactMessage(SENDER, "amara_o", DTO),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("404s an unknown handle", async () => {
    mockDb.queueSelects([]);
    await expect(
      service.sendContactMessage(SENDER, "nobody", DTO),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("404s when either side has blocked the other", async () => {
    mockDb.queueSelects([targetRow], [{ id: "block-1" }]);
    await expect(
      service.sendContactMessage(SENDER, "amara_o", DTO),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("400s a self-contact", async () => {
    mockDb.queueSelects([{ ...targetRow, userId: SENDER_RAW }]);
    await expect(
      service.sendContactMessage(SENDER, "amara_o", DTO),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("400s when the sender has no email on the session", async () => {
    mockDb.queueSelects([targetRow], []);
    await expect(
      service.sendContactMessage({ authId: SENDER_RAW }, "amara_o", DTO),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("429s past the daily cap across all recipients", async () => {
    mockDb.queueSelects([targetRow], [], [{ total: CONTACT_DAILY_LIMIT }]);
    await expect(
      service.sendContactMessage(SENDER, "amara_o", DTO),
    ).rejects.toMatchObject({ response: { code: "contact_daily_limit" } });
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("429s a second message to the SAME recipient inside 24h", async () => {
    mockDb.queueSelects([targetRow], [], [{ total: 1 }], [{ total: 1 }]);
    await expect(
      service.sendContactMessage(SENDER, "amara_o", DTO),
    ).rejects.toMatchObject({ response: { code: "contact_recipient_limit" } });
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("does not write the ledger row when the send fails", async () => {
    happyPathSelects();
    mailer.send.mockRejectedValue(new Error("brevo 502"));

    await expect(
      service.sendContactMessage(SENDER, "amara_o", DTO),
    ).rejects.toThrow();
    expect(mockDb.db.insert).not.toHaveBeenCalled();
  });

  it("counts the rate-limit window against the RAW sender id", async () => {
    happyPathSelects();
    await service.sendContactMessage(SENDER, "amara_o", DTO);

    const ledgerReads = mockDb.calls.filter(
      (call) => call.op === "select" && call.table === "social_contact_messages",
    );
    expect(ledgerReads).toHaveLength(2);
    for (const read of ledgerReads) {
      expect(read.where).toContain(SENDER_RAW);
      expect(read.where).not.toContain(toDatabaseUserId(SENDER_RAW));
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/social/contact-relay.service.spec.ts
```

Expected: FAIL — `Cannot find module './contact-relay.service'`.

- [ ] **Step 3: Extract the Brevo transport**

Create `backend/services/services/api/src/support/brevo-mailer.service.ts`:

```ts
import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";

export type BrevoAddress = { email: string; name?: string };

export type BrevoEmail = {
  to: BrevoAddress[];
  subject: string;
  htmlContent: string;
  replyTo?: BrevoAddress;
  sender?: BrevoAddress;
};

/**
 * The single Brevo transactional-email transport. Extracted from
 * SupportService so the contact relay reuses one code path — one place that
 * knows the API shape, one place that handles a missing key, one place that
 * maps a Brevo failure to an HTTP status.
 */
@Injectable()
export class BrevoMailerService {
  private readonly logger = new Logger(BrevoMailerService.name);

  isConfigured(): boolean {
    return Boolean(process.env.BREVO_API_KEY);
  }

  async send(email: BrevoEmail): Promise<void> {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      this.logger.error(
        `BREVO_API_KEY not configured — "${email.subject}" was NOT delivered.`,
      );
      throw new ServiceUnavailableException(
        "Email is temporarily unavailable. Please try again later.",
      );
    }

    const sender = email.sender ?? {
      name: "Edutu",
      email: process.env.BREVO_SENDER_EMAIL || "no-reply@edutu.org",
    };

    let response: Response;
    try {
      response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": apiKey,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          sender,
          to: email.to,
          ...(email.replyTo ? { replyTo: email.replyTo } : {}),
          subject: email.subject,
          htmlContent: email.htmlContent,
        }),
      });
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error.message : "Brevo request failed",
      );
      throw new BadGatewayException(
        "Could not send your message right now. Please try again shortly.",
      );
    }

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      // Recipient addresses are NEVER logged — see contact-relay.service.ts.
      this.logger.error(`Brevo ${response.status}: ${detail}`);
      throw new BadGatewayException(
        "Could not send your message right now. Please try again shortly.",
      );
    }
  }

  /** Shared HTML escape for every caller building an email body. */
  escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}
```

In `backend/services/services/api/src/support/support.service.ts`, inject the mailer and replace the
`fetch` block. Change the class declaration to:

```ts
@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(private readonly mailer: BrevoMailerService) {}
```

(add `import { BrevoMailerService } from "./brevo-mailer.service";` at the top), and replace the whole
body of `submit` from `const apiKey = process.env.BREVO_API_KEY;` down to the closing brace with:

```ts
    const subject =
      dto.type === "bug" ? `[Bug] ${dto.subject}` : `[Support] ${dto.subject}`;

    await this.mailer.send({
      to: [{ email: SUPPORT_INBOX, name: "Edutu Support" }],
      replyTo: dto.name?.trim()
        ? { email: dto.email.trim(), name: dto.name.trim() }
        : { email: dto.email.trim() },
      sender: {
        name: "Edutu Support",
        email: process.env.BREVO_SENDER_EMAIL || "no-reply@edutu.org",
      },
      subject,
      htmlContent: this.buildEmailHtml(dto),
    });

    this.logger.log(
      `Support ${dto.type} delivered from ${dto.email} — "${dto.subject}"`,
    );
    return { ok: true };
```

In `backend/services/services/api/src/support/support.module.ts`, add `BrevoMailerService` to both
`providers` and `exports`.

- [ ] **Step 4: Write the relay**

Create `backend/services/services/api/src/social/contact-relay.service.ts`:

```ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { and, eq, gte, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  DEFAULT_PROFILE_PRIVACY,
  profiles,
  socialContactMessages,
  userBlocks,
  type ProfilePrivacy,
} from "../db/schema";
import {
  legacyUserIdCandidates,
  rawClerkUserId,
  toLegacyUuid,
} from "../common/community-user-id";
import { BrevoMailerService } from "../support/brevo-mailer.service";
import { normalizeUsername } from "./username";
import type { ContactMessageDto } from "./dto/social.dto";

/** Messages one sender may relay in 24 hours, across all recipients. */
export const CONTACT_DAILY_LIMIT = 5;
/** Messages one sender may relay to ONE recipient in 24 hours. */
export const CONTACT_PER_RECIPIENT_LIMIT = 1;

const DAY_MS = 86_400_000;

/**
 * Built explicitly by the controller from three `@CurrentUser(...)` reads.
 * `rawUserId` is `@CurrentUser("authId")` — the RAW Clerk sub, never
 * `request.user.id` (which is the derived uuid).
 */
export type ContactSender = {
  rawUserId: string;
  email?: string | null;
  firstName?: string | null;
};

@Injectable()
export class ContactRelayService {
  private readonly logger = new Logger(ContactRelayService.name);

  constructor(private readonly mailer: BrevoMailerService) {}

  /**
   * Relays a message to a user by handle. The sender NEVER learns the
   * recipient's address: it appears only in the Brevo payload, never in the
   * response, never in a log line, and never in the rendered email body.
   * This is what makes "send emails" safe to expose in a market full of
   * scholarship scammers.
   */
  async sendContactMessage(
    sender: ContactSender,
    username: string,
    dto: ContactMessageDto,
  ): Promise<{ ok: true }> {
    const senderRawId = rawClerkUserId(sender.rawUserId);
    const handle = normalizeUsername(username);
    const notFound = new NotFoundException("Profile not found");

    const [target] = await db
      .select({
        userId: profiles.userId,
        username: profiles.username,
        fullName: profiles.fullName,
        email: profiles.email,
        privacy: profiles.privacy,
      })
      .from(profiles)
      .where(eq(profiles.username, handle))
      .limit(1)
      .execute();

    if (!target) throw notFound;

    const targetRawId = String(target.userId);
    if (legacyUserIdCandidates(senderRawId).includes(targetRawId)) {
      throw new BadRequestException({
        code: "cannot_contact_self",
        message: "You cannot send yourself a message.",
      });
    }

    const privacy = this.normalizePrivacy(target.privacy);
    if (!privacy.allowContact) {
      throw new ForbiddenException({
        code: "contact_disabled",
        message: "This person is not accepting messages right now.",
      });
    }

    if (await this.isBlockedEitherWay(senderRawId, targetRawId)) {
      throw notFound;
    }

    const senderEmail = sender.email?.trim();
    if (!senderEmail) {
      // Without a reply-to the recipient cannot answer, which makes the relay
      // a one-way spam channel.
      throw new BadRequestException({
        code: "sender_email_required",
        message:
          "Add an email address to your account before sending messages.",
      });
    }

    if (!target.email?.trim()) {
      throw new ServiceUnavailableException({
        code: "recipient_unreachable",
        message: "This person cannot be reached by email right now.",
      });
    }

    await this.assertWithinLimits(senderRawId, targetRawId);

    // Send FIRST, ledger SECOND: a ledger row for a message that never left
    // would burn the sender's daily quota on a failure that was not theirs.
    await this.mailer.send({
      to: [
        {
          email: target.email.trim(),
          ...(target.fullName?.trim() ? { name: target.fullName.trim() } : {}),
        },
      ],
      replyTo: {
        email: senderEmail,
        ...(sender.firstName?.trim() ? { name: sender.firstName.trim() } : {}),
      },
      sender: {
        name: "Edutu",
        email: process.env.BREVO_SENDER_EMAIL || "no-reply@edutu.org",
      },
      subject: `[Edutu] ${dto.subject}`,
      htmlContent: this.buildRelayHtml(sender, dto),
    });

    await db
      .insert(socialContactMessages)
      .values({
        senderUserId: senderRawId,
        recipientUserId: targetRawId,
        subject: dto.subject,
      })
      .execute();

    // Log the handle, never the address.
    this.logger.log(`Contact relayed from ${senderRawId} to @${handle}`);
    return { ok: true };
  }

  private normalizePrivacy(value: unknown): ProfilePrivacy {
    const raw = (value ?? {}) as Partial<ProfilePrivacy>;
    return {
      publicProfile:
        typeof raw.publicProfile === "boolean"
          ? raw.publicProfile
          : DEFAULT_PROFILE_PRIVACY.publicProfile,
      allowContact:
        typeof raw.allowContact === "boolean"
          ? raw.allowContact
          : DEFAULT_PROFILE_PRIVACY.allowContact,
      showOutcomes:
        typeof raw.showOutcomes === "boolean"
          ? raw.showOutcomes
          : DEFAULT_PROFILE_PRIVACY.showOutcomes,
    };
  }

  private async isBlockedEitherWay(
    senderRawId: string,
    targetRawId: string,
  ): Promise<boolean> {
    const sender = toLegacyUuid(senderRawId);
    const target = toLegacyUuid(targetRawId);
    const [row] = await db
      .select({ id: userBlocks.id })
      .from(userBlocks)
      .where(
        or(
          and(
            eq(userBlocks.blockerUserId, sender),
            eq(userBlocks.blockedUserId, target),
          ),
          and(
            eq(userBlocks.blockerUserId, target),
            eq(userBlocks.blockedUserId, sender),
          ),
        ),
      )
      .limit(1)
      .execute();
    return Boolean(row);
  }

  /**
   * Durable limits, not in-memory ones: Render runs more than one instance and
   * restarts would otherwise hand a spammer a fresh quota.
   */
  private async assertWithinLimits(
    senderRawId: string,
    targetRawId: string,
  ): Promise<void> {
    const since = new Date(Date.now() - DAY_MS);

    const [daily] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(socialContactMessages)
      .where(
        and(
          eq(socialContactMessages.senderUserId, senderRawId),
          gte(socialContactMessages.createdAt, since),
        ),
      )
      .execute();

    if (Number(daily?.total ?? 0) >= CONTACT_DAILY_LIMIT) {
      throw new HttpException(
        {
          code: "contact_daily_limit",
          message: `You can send ${CONTACT_DAILY_LIMIT} messages a day. Try again tomorrow.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const [perRecipient] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(socialContactMessages)
      .where(
        and(
          eq(socialContactMessages.senderUserId, senderRawId),
          eq(socialContactMessages.recipientUserId, targetRawId),
          gte(socialContactMessages.createdAt, since),
        ),
      )
      .execute();

    if (Number(perRecipient?.total ?? 0) >= CONTACT_PER_RECIPIENT_LIMIT) {
      throw new HttpException(
        {
          code: "contact_recipient_limit",
          message:
            "You have already messaged this person today. Give them a chance to reply.",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private buildRelayHtml(
    sender: ContactSender,
    dto: ContactMessageDto,
  ): string {
    const escape = (value: string) => this.mailer.escapeHtml(value);
    const from = escape(sender.firstName?.trim() || "An Edutu member");
    const body = escape(dto.message.trim()).replace(/\r?\n/g, "<br />");

    // The recipient's own address is deliberately absent from this body — the
    // template must never echo it back into anything the sender can see.
    return [
      "<div style=\"margin:0;padding:24px 12px;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;\">",
      '<div style="max-width:560px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">',
      '<div style="background-color:#101828;padding:20px 28px;">',
      '<span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">edutu</span>',
      "</div>",
      '<div style="padding:28px;">',
      `<h1 style="margin:0 0 6px 0;font-size:20px;line-height:1.3;color:#101828;">${from} sent you a message</h1>`,
      `<p style="margin:0 0 18px 0;font-size:13px;color:#6b7280;">Subject: ${escape(dto.subject.trim())}</p>`,
      `<p style="margin:0;font-size:15px;line-height:1.6;color:#374151;">${body}</p>`,
      "</div>",
      '<div style="padding:16px 28px;border-top:1px solid #e5e7eb;">',
      '<p style="margin:0;font-size:12px;line-height:1.6;color:#98a2b3;">',
      "Reply to this email to answer them directly. Your address stays private until you do. ",
      "Turn messages off any time in Settings.",
      "</p>",
      "</div>",
      "</div>",
      "</div>",
    ].join("");
  }
}
```

- [ ] **Step 5: Add the route and wire the module**

In `backend/services/services/api/src/social/social.controller.ts`, add `ContactMessageSchema` /
`ContactMessageDto` to the DTO import, inject `ContactRelayService` in the constructor, and add:

```ts
  // Spam vector: a hard per-IP throttle on top of the durable per-user limits
  // inside the service.
  @Post("u/:username/contact")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  contact(
    @CurrentUser("authId") rawUserId: string,
    @CurrentUser("email") senderEmail: string | undefined,
    @CurrentUser("firstName") senderFirstName: string | undefined,
    @Param("username") username: string,
    @Body(new ZodValidationPipe(ContactMessageSchema)) dto: ContactMessageDto,
  ) {
    return this.contactRelayService.sendContactMessage(
      { rawUserId, email: senderEmail, firstName: senderFirstName },
      username,
      dto,
    );
  }
```

In `backend/services/services/api/src/social/social.module.ts`, import `SupportModule` from
`../support/support.module`, add it to `imports`, and add `ContactRelayService` to `providers`.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npx jest src/social src/support
```

Expected: PASS — `contact-relay.service.spec.ts` at 14 tests.

- [ ] **Step 7: Prove the response body carries no address, against the running API**

```bash
curl -s -X POST http://localhost:3000/social/u/<a-handle-with-contact-on>/contact \
  -H "Authorization: Bearer $CLERK_TEST_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"subject":"Chevening question","message":"How did you frame the leadership essay?"}'
```

Expected: exactly `{"ok":true}`. Any email address in that body is a **blocker** — stop and fix.

- [ ] **Step 8: Lint, full suite, boot check, commit**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api
npm run lint && npm test && npm run build && node dist/main
```

Expected: green; `Mapped {/social/u/:username/contact, POST} route` in the boot log. Ctrl-C.

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
git add backend/services/services/api/src/social backend/services/services/api/src/support
git commit -m "feat(social): PII-safe contact relay over the shared Brevo transport"
```

---

## Task 10: `@edutu/core` workspace promotion + the `social` subpath

> **This is the highest-risk task in the whole Communities programme.** Slices 2, 3, 4 and 5 all
> assume `@edutu/core` is consumable by both apps. Read the decision gate in Step 1 **before**
> writing any code, and hold to the timebox.

**Files:**
- Modify: `package.json` (repo root)
- Create: `edutumobile/packages/core/src/social/types.ts`
- Create: `edutumobile/packages/core/src/social/client.ts`
- Create: `edutumobile/packages/core/src/social/useProfile.ts`
- Create: `edutumobile/packages/core/src/social/useFollow.ts`
- Create: `edutumobile/packages/core/src/social/index.ts`
- Modify: `edutumobile/packages/core/package.json`
- Modify: `edutu-web-app/vite.config.ts`
- Modify: `edutu-web-app/vitest.config.ts`
- Modify: `edutu-web-app/tsconfig.app.json`
- Test: `edutumobile/__tests__/social-client.test.ts`

**Interfaces:**
- Consumes: the HTTP contract from Tasks 4–9.
- Produces — **the exact Slice 1 `@edutu/core` surface every later slice imports:**
  ```ts
  export type PublicProfile = {
    username: string; displayName: string; avatarUrl: string | null;
    headline: string | null; bio: string | null; country: string | null;
    isMentor: boolean; followerCount: number; followingCount: number;
    outcomes: { applied: number; won: number } | null;   // null when hidden
    allowContact: boolean;
  };
  export function useProfile(username: string): { profile: PublicProfile | null; loading: boolean; error: string | null };
  export function useFollow(username: string): { isFollowing: boolean; toggle: () => Promise<void>; pending: boolean };
  ```
  plus, in the same barrel: `ProfilePrivacy`, `ViewerRelation`, `PublicProfileResponse`,
  `ProfileSummary`, `FollowListPage`, `FollowResult`, `UsernameAvailability`,
  `SocialProfileSettings`, `SocialApiError`, `configureSocialApi`, `isSocialApiConfigured`, and the
  ten request functions.

### The constraint that shapes this task

`@edutu/core` is **not** framework-agnostic today, and cannot be made so inside Slice 1:

| Reality | Consequence |
|---|---|
| Nine files under `src/services/` import `@react-native-async-storage/async-storage` (`swrCache`, `opportunities`, `offlineActions`, `signalQueue`, `cv`, `notifications`, `dismissedOpportunities`, …) | The web app can never import the **root barrel** `@edutu/core` |
| `src/services/cv.ts` imports `react-native`'s `Share`; `src/services/uploads.ts` requires `expo-file-system/legacy` | Same |
| `src/index.ts` re-exports several of those files | Same |
| `src/services/productApi.ts` reads `process.env.EXPO_PUBLIC_API_URL` | `process` is undefined in a Vite bundle — the shared code must take its base URL by injection |
| EAS Build only uploads the `edutumobile/` directory unless `edutumobile` is itself a member of a root `workspaces` array; making it one would break `npm ci` inside `edutumobile` in `.github/workflows/ci.yml` (`cache-dependency-path: edutumobile/package-lock.json`) | **The package directory must stay at `edutumobile/packages/core`.** Physically relocating it to a repo-root `packages/` is out of scope for Slice 1 and is recorded as a follow-up. |

So the promotion is: **declare the package as a root npm workspace where it already lives, and add a
new subpath (`./social`) that is genuinely framework-agnostic** — `react` and the platform `fetch`,
nothing else. Both apps consume the subpath. The web app never touches the root barrel.

- [ ] **Step 1: Record the decision gate (do this first, in writing)**

Copy this table into the PR description before starting. It is the go/no-go the rest of the task is
judged against.

| Phase | What lands | Go criteria (all must pass) | If it fails |
|---|---|---|---|
| **A — must land.** Timebox **2 h**. | Root `workspaces` entry, `src/social/*`, `./social` export map, web Vite/vitest/tsconfig resolution | (1) `cd edutu-web-app && npx tsc -b` exits 0; (2) `cd edutu-web-app && npm run build` exits 0 and the bundle contains no `AsyncStorage`; (3) `cd edutu-web-app && npx vitest run` green; (4) `cd edutumobile && npm run typecheck && npx jest __tests__/social-client.test.ts` green | Go to **Fallback** |
| **B — optional.** Timebox **1 h**. | `"@edutu/core": "file:../edutumobile/packages/core"` in `edutu-web-app/package.json` so resolution no longer depends on the bundler alias | `cd edutu-web-app && rm -rf node_modules && npm install && npm run build` exits 0 | Revert `edutu-web-app/package.json` + its lockfile; **keep Phase A**. Phase A is fully functional without B. |
| **C — out of scope.** | Relocating the directory to repo-root `packages/core` | — | Do not attempt. Blocked by EAS Build monorepo detection (see the table above). File as a follow-up issue. |

**Fallback (documented, and acceptable — do not burn the slice fighting the bundler):**
copy `src/social/types.ts` and `src/social/client.ts` verbatim into
`edutu-web-app/src/services/social/`, and duplicate the two hooks as
`edutu-web-app/src/hooks/useProfile.ts` and `edutu-web-app/src/hooks/useFollow.ts`. The mobile
package stays the source of truth. Then add `edutu-web-app/src/services/social/__tests__/contract.test.ts`
asserting that the web copy's `PublicProfile` key list is identical to the backend's response keys,
so the two cannot drift silently. **Trigger the fallback if any of:** (a) the Vite dev server cannot
serve the aliased file after `server.fs.allow` is set; (b) `vite build` cannot resolve the alias;
(c) `tsc -b` cannot resolve the path mapping; (d) the 2 h Phase A timebox elapses. Slice 2 must not
be blocked on this.

- [ ] **Step 2: Write the failing test**

Create `edutumobile/__tests__/social-client.test.ts`:

```ts
import {
  SocialApiError,
  configureSocialApi,
  fetchPublicProfile,
  followUser,
  invalidateProfile,
  isSocialApiConfigured,
  unfollowUser,
} from '@edutu/core/src/social';

const PROFILE = {
  username: 'amara_o',
  displayName: 'Amara Okafor',
  avatarUrl: null,
  headline: 'Chasing a fully-funded MSc',
  bio: null,
  country: 'Nigeria',
  isMentor: true,
  followerCount: 40,
  followingCount: 3,
  outcomes: { applied: 12, won: 1 },
  allowContact: true,
  viewer: { isSelf: false, isFollowing: false },
};

describe('@edutu/core social client', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    invalidateProfile('amara_o');
    (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
    configureSocialApi({
      baseUrl: 'https://api.test/',
      getToken: async () => 'token-123',
    });
  });

  const ok = (body: unknown) =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    });

  it('reports itself configured', () => {
    expect(isSocialApiConfigured()).toBe(true);
  });

  it('strips the trailing slash from the base URL and sends the bearer token', async () => {
    fetchMock.mockReturnValue(ok(PROFILE));
    await fetchPublicProfile('amara_o');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.test/social/u/amara_o');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-123');
  });

  it('URL-encodes the handle', async () => {
    fetchMock.mockReturnValue(ok(PROFILE));
    await fetchPublicProfile('a b');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/social/u/a%20b');
  });

  it('omits Authorization entirely for a signed-out visitor', async () => {
    configureSocialApi({ baseUrl: 'https://api.test', getToken: async () => null });
    fetchMock.mockReturnValue(ok(PROFILE));
    await fetchPublicProfile('amara_o');

    const init = fetchMock.mock.calls[0][1];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('shares ONE in-flight request between concurrent callers', async () => {
    fetchMock.mockReturnValue(ok(PROFILE));
    await Promise.all([fetchPublicProfile('amara_o'), fetchPublicProfile('amara_o')]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('preserves outcomes: null rather than coercing it to zeroes', async () => {
    fetchMock.mockReturnValue(ok({ ...PROFILE, outcomes: null }));
    const profile = await fetchPublicProfile('amara_o');
    expect(profile.outcomes).toBeNull();
  });

  it('throws a SocialApiError carrying the status and the server code', async () => {
    fetchMock.mockReturnValue(
      Promise.resolve({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ code: 'username_taken', message: 'That username is taken.' }),
      }),
    );

    await expect(fetchPublicProfile('amara_o')).rejects.toBeInstanceOf(SocialApiError);
    await expect(fetchPublicProfile('amara_o')).rejects.toMatchObject({
      status: 409,
      code: 'username_taken',
      message: 'That username is taken.',
    });
  });

  it('invalidates the cached profile after a follow so counts re-fetch', async () => {
    fetchMock.mockReturnValueOnce(ok(PROFILE));
    await fetchPublicProfile('amara_o');

    fetchMock.mockReturnValueOnce(ok({ following: true, followerCount: 41 }));
    await followUser('amara_o');

    fetchMock.mockReturnValueOnce(ok({ ...PROFILE, followerCount: 41 }));
    const refreshed = await fetchPublicProfile('amara_o');
    expect(refreshed.followerCount).toBe(41);
  });

  it('uses DELETE for unfollow', async () => {
    fetchMock.mockReturnValue(ok({ following: false, followerCount: 39 }));
    await unfollowUser('amara_o');
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
  });

  it('throws a clear error when the app forgot to configure it', async () => {
    configureSocialApi(null as never);
    await expect(fetchPublicProfile('amara_o')).rejects.toThrow(
      'configureSocialApi',
    );
  });

  it('imports nothing from react-native or AsyncStorage', () => {
    // The web app bundles this module. A single RN import breaks `vite build`.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path');
    const dir = path.join(__dirname, '..', 'packages', 'core', 'src', 'social');
    for (const file of fs.readdirSync(dir)) {
      const source = fs.readFileSync(path.join(dir, file), 'utf8');
      expect(source).not.toMatch(/react-native/);
      expect(source).not.toMatch(/AsyncStorage/);
      expect(source).not.toMatch(/expo-/);
      expect(source).not.toMatch(/process\.env/);
    }
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile
npx jest __tests__/social-client.test.ts --maxWorkers=2
```

Expected: FAIL — `Cannot find module '@edutu/core/src/social'`.

- [ ] **Step 4: Declare the root workspace**

Replace `package.json` at the repo root with:

```json
{
  "name": "edutu-monorepo",
  "private": true,
  "workspaces": [
    "edutumobile/packages/core"
  ],
  "devDependencies": {
    "supabase": "^2.98.2"
  }
}
```

> Only the shared package is a workspace member. `edutumobile`, `edutu-web-app`, `admin` and the
> backend each keep their own `package-lock.json` and their own `npm ci` in
> `.github/workflows/ci.yml`. Adding them here would change the install topology for every deploy
> target at once — and would break EAS Build, as noted in Step 1's Phase C.

- [ ] **Step 5: Write the shared types**

Create `edutumobile/packages/core/src/social/types.ts`:

```ts
/**
 * Slice 1 identity types. Framework-agnostic on purpose: this file is bundled
 * by Vite for the web app as well as by Metro for the mobile app, so it must
 * import nothing at all.
 */

export type ProfilePrivacy = {
  publicProfile: boolean;
  allowContact: boolean;
  showOutcomes: boolean;
};

/**
 * `outcomes` is `null` — never `{applied: 0, won: 0}` — when the owner has the
 * track record hidden. A zero is a claim about someone; an absence is not.
 * Render null as "no track record shown".
 */
export type PublicProfile = {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  headline: string | null;
  bio: string | null;
  country: string | null;
  isMentor: boolean;
  followerCount: number;
  followingCount: number;
  outcomes: { applied: number; won: number } | null;
  allowContact: boolean;
};

export type ViewerRelation = { isSelf: boolean; isFollowing: boolean };

/** What `GET /social/u/:username` actually returns. */
export type PublicProfileResponse = PublicProfile & { viewer: ViewerRelation };

export type ProfileSummary = Pick<
  PublicProfile,
  'username' | 'displayName' | 'avatarUrl' | 'headline' | 'isMentor'
>;

export type FollowListPage = {
  items: ProfileSummary[];
  nextCursor: string | null;
};

export type FollowResult = { following: boolean; followerCount: number };

export type UsernameAvailability = {
  username: string;
  available: boolean;
  reason: string | null;
  message: string | null;
};

export type SocialProfileSettings = {
  username: string | null;
  headline: string | null;
  bio: string | null;
  privacy: ProfilePrivacy;
  usernameChangedAt: string | null;
  cooldownDaysRemaining: number;
};

export type ContactMessageInput = { subject: string; message: string };
```

- [ ] **Step 6: Write the shared client**

Create `edutumobile/packages/core/src/social/client.ts`:

```ts
import type {
  ContactMessageInput,
  FollowListPage,
  FollowResult,
  PublicProfileResponse,
  SocialProfileSettings,
  UsernameAvailability,
} from './types';

export type SocialApiConfig = {
  /** Product API origin, with or without a trailing slash. */
  baseUrl: string;
  /** Resolves the current auth token, or null when signed out. */
  getToken: () => Promise<string | null | undefined>;
};

/**
 * Injected by each app at boot rather than read from the environment:
 * `process.env` does not exist in a Vite bundle and `import.meta.env` does not
 * exist under Metro, so there is no expression that works in both.
 */
let config: SocialApiConfig | null = null;

export function configureSocialApi(next: SocialApiConfig): void {
  config = next;
}

export function isSocialApiConfigured(): boolean {
  return Boolean(config?.baseUrl);
}

export class SocialApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'SocialApiError';
    this.status = status;
    this.code = code;
  }
}

const REQUEST_TIMEOUT_MS = 12000;

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!config?.baseUrl) {
    throw new Error(
      'Social API is not configured. Call configureSocialApi({ baseUrl, getToken }) at app start.',
    );
  }

  const token = await config.getToken().catch(() => null);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) || {}),
  };
  // Omitted entirely when signed out — an empty bearer would 401 a @Public route.
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller =
    typeof AbortController === 'undefined' ? null : new AbortController();
  const timer = controller
    ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    : null;

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl.replace(/\/$/, '')}${path}`, {
      ...init,
      headers,
      ...(controller ? { signal: controller.signal } : {}),
    });
  } catch (error) {
    throw new SocialApiError(
      error instanceof Error && error.name === 'AbortError'
        ? 'The request timed out. Check your connection and try again.'
        : 'Could not reach Edutu. Check your connection and try again.',
      0,
    );
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
      code?: string;
      error?: string;
    } | null;
    const message = Array.isArray(body?.message)
      ? body?.message.join(', ')
      : body?.message || body?.error || `Request failed (${response.status})`;
    throw new SocialApiError(message, response.status, body?.code);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// --- profile read, with a shared in-flight cache -----------------------------
// useProfile and useFollow mount on the same screen and want the same payload.
// One promise per handle means one network request.

const inFlight = new Map<string, Promise<PublicProfileResponse>>();

export function invalidateProfile(username: string): void {
  inFlight.delete(username.trim().toLowerCase());
}

export function fetchPublicProfile(
  username: string,
): Promise<PublicProfileResponse> {
  const key = username.trim().toLowerCase();
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = request<PublicProfileResponse>(
    `/social/u/${encodeURIComponent(username.trim())}`,
  ).finally(() => {
    // Only de-duplicates concurrent callers; it is not a stale cache.
    inFlight.delete(key);
  });

  inFlight.set(key, promise);
  return promise;
}

// --- follow ------------------------------------------------------------------

export async function followUser(username: string): Promise<FollowResult> {
  const result = await request<FollowResult>(
    `/social/u/${encodeURIComponent(username.trim())}/follow`,
    { method: 'POST' },
  );
  invalidateProfile(username);
  return result;
}

export async function unfollowUser(username: string): Promise<FollowResult> {
  const result = await request<FollowResult>(
    `/social/u/${encodeURIComponent(username.trim())}/follow`,
    { method: 'DELETE' },
  );
  invalidateProfile(username);
  return result;
}

function followListPath(
  username: string,
  direction: 'followers' | 'following',
  options: { limit?: number; cursor?: string },
): string {
  const params: string[] = [];
  if (options.limit) params.push(`limit=${options.limit}`);
  if (options.cursor) params.push(`cursor=${encodeURIComponent(options.cursor)}`);
  const query = params.length ? `?${params.join('&')}` : '';
  return `/social/u/${encodeURIComponent(username.trim())}/${direction}${query}`;
}

export function fetchFollowers(
  username: string,
  options: { limit?: number; cursor?: string } = {},
): Promise<FollowListPage> {
  return request<FollowListPage>(followListPath(username, 'followers', options));
}

export function fetchFollowing(
  username: string,
  options: { limit?: number; cursor?: string } = {},
): Promise<FollowListPage> {
  return request<FollowListPage>(followListPath(username, 'following', options));
}

// --- own identity ------------------------------------------------------------

export function checkUsernameAvailability(
  username: string,
): Promise<UsernameAvailability> {
  return request<UsernameAvailability>(
    `/social/me/username-availability?username=${encodeURIComponent(username)}`,
  );
}

export function claimUsername(
  username: string,
): Promise<{ username: string; usernameChangedAt: string }> {
  return request(`/social/me/username`, {
    method: 'PATCH',
    body: JSON.stringify({ username }),
  });
}

export function fetchSocialProfileSettings(): Promise<SocialProfileSettings> {
  return request<SocialProfileSettings>('/social/me/profile');
}

export function updateSocialProfile(patch: {
  headline?: string | null;
  bio?: string | null;
  privacy?: Partial<{
    publicProfile: boolean;
    allowContact: boolean;
    showOutcomes: boolean;
  }>;
}): Promise<SocialProfileSettings> {
  return request<SocialProfileSettings>('/social/me/profile', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function sendContactMessage(
  username: string,
  input: ContactMessageInput,
): Promise<{ ok: true }> {
  return request(`/social/u/${encodeURIComponent(username.trim())}/contact`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
```

- [ ] **Step 7: Write the two published hooks**

Create `edutumobile/packages/core/src/social/useProfile.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPublicProfile, invalidateProfile } from './client';
import type { PublicProfile, PublicProfileResponse } from './types';

export type UseProfileResult = {
  profile: PublicProfile | null;
  loading: boolean;
  error: string | null;
  /** Full response, including the viewer relation. */
  response: PublicProfileResponse | null;
  refresh: () => void;
};

/**
 * React-Compiler safe: no conditional hooks, nothing mutated during render, and
 * the effect depends only on `[username, reloadToken]`.
 */
export function useProfile(username: string): UseProfileResult {
  const [response, setResponse] = useState<PublicProfileResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(username));
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!username) {
      setResponse(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchPublicProfile(username)
      .then((next) => {
        if (cancelled) return;
        setResponse(next);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setResponse(null);
        setError(
          cause instanceof Error ? cause.message : 'Could not load this profile.',
        );
      })
      .then(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [username, reloadToken]);

  const refresh = useCallback(() => {
    invalidateProfile(username);
    setReloadToken((token) => token + 1);
  }, [username]);

  return { profile: response, loading, error, response, refresh };
}
```

Create `edutumobile/packages/core/src/social/useFollow.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { followUser, unfollowUser } from './client';
import { useProfile } from './useProfile';

export type UseFollowResult = {
  isFollowing: boolean;
  toggle: () => Promise<void>;
  pending: boolean;
  followerCount: number;
  error: string | null;
};

/**
 * Optimistic follow toggle. Shares `useProfile`'s in-flight request, so
 * mounting both on one screen still costs a single round trip.
 */
export function useFollow(username: string): UseFollowResult {
  const { response } = useProfile(username);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync from the server payload whenever it arrives or changes.
  useEffect(() => {
    if (!response) return;
    setIsFollowing(response.viewer.isFollowing);
    setFollowerCount(response.followerCount);
  }, [response]);

  const toggle = useCallback(async () => {
    if (!username || pending) return;

    const next = !isFollowing;
    setPending(true);
    setError(null);
    // Optimistic: the button must respond instantly on a 3G connection.
    setIsFollowing(next);
    setFollowerCount((count) => Math.max(0, count + (next ? 1 : -1)));

    try {
      const result = next
        ? await followUser(username)
        : await unfollowUser(username);
      setIsFollowing(result.following);
      setFollowerCount(result.followerCount);
    } catch (cause: unknown) {
      // Roll back to the server's last known truth.
      setIsFollowing(!next);
      setFollowerCount((count) => Math.max(0, count + (next ? -1 : 1)));
      setError(
        cause instanceof Error ? cause.message : 'Could not update follow.',
      );
    } finally {
      setPending(false);
    }
  }, [isFollowing, pending, username]);

  return { isFollowing, toggle, pending, followerCount, error };
}
```

Create `edutumobile/packages/core/src/social/index.ts`:

```ts
export * from './types';
export * from './client';
export * from './useProfile';
export * from './useFollow';
```

- [ ] **Step 8: Publish the subpath**

In `edutumobile/packages/core/package.json`, add this entry to the `exports` map, immediately after
the `"."` entry:

```json
        "./social": {
            "types": "./src/social/index.ts",
            "default": "./src/social/index.ts",
            "react-native": "./src/social/index.ts"
        },
```

Do **not** add `./social` to `src/index.ts` — the root barrel pulls in AsyncStorage and must stay
mobile-only.

- [ ] **Step 9: Run the mobile test to verify it passes**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile
npx jest __tests__/social-client.test.ts --maxWorkers=2
```

Expected: PASS — `Tests: 11 passed, 11 total`. The last test (`imports nothing from react-native or
AsyncStorage`) is the one that protects the web build; if it fails, the web bundle is broken.

- [ ] **Step 10: Teach the web app to resolve the subpath**

In `edutu-web-app/vite.config.ts`, replace the `resolve` block with:

```ts
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      // The shared Slice 1 identity code. Aliased to the SOURCE file, never to
      // the package root: `@edutu/core`'s root barrel re-exports AsyncStorage-
      // backed services and would break this build.
      '@edutu/core/social': resolve(
        __dirname,
        '../edutumobile/packages/core/src/social/index.ts',
      ),
    },
  },
  server: {
    fs: {
      // The aliased source lives outside this project root.
      allow: ['..'],
    },
  },
```

Apply the identical `resolve.alias` addition to `edutu-web-app/vitest.config.ts`.

In `edutu-web-app/tsconfig.app.json`, add to `compilerOptions`:

```json
    "baseUrl": ".",
    "paths": {
      "@edutu/core/social": ["../edutumobile/packages/core/src/social/index.ts"]
    },
```

- [ ] **Step 11: Run the Phase A go/no-go gate**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npx tsc -b && npm run build && npx vitest run
```

Expected: `tsc -b` silent; `vite build` prints `✓ built in …`; vitest green.

Then prove no React Native code reached the bundle:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
grep -rl "AsyncStorage\|react-native" dist/assets | head
```

Expected: **no output.** Any hit means the root barrel leaked in — find the offending import and
point it at `@edutu/core/social`.

> `npm run build` wipes `edutu-web-app/public/sitemap.xml` (its `prebuild` regenerates it). That is
> pre-existing behaviour; do not commit the regenerated file as part of this task.

- [ ] **Step 12: Decide on Phase B**

If Step 11 passed, optionally spend up to 1 h adding the real dependency. In
`edutu-web-app/package.json` add to `dependencies`:

```json
    "@edutu/core": "file:../edutumobile/packages/core",
```

then:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
rm -rf node_modules && npm install && npm run build
```

Expected: install succeeds and the build still passes. **If either fails, revert
`edutu-web-app/package.json` and `edutu-web-app/package-lock.json` and stop** — Phase A already
delivers the shared code, and a broken web install blocks the Netlify deploy for everyone.

- [ ] **Step 13: Verify the mobile app is unharmed**

The mobile app must keep resolving `@edutu/core` exactly as before — the root `workspaces` entry
changes nothing for it, because it installs independently:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile
npm run typecheck && npm run lint && npx jest --maxWorkers=2
```

Expected: typecheck 0, lint 0 (it runs `--max-warnings 0`), full mobile suite green.

- [ ] **Step 14: Commit**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
git add package.json \
        edutumobile/packages/core/src/social \
        edutumobile/packages/core/package.json \
        edutumobile/__tests__/social-client.test.ts \
        edutu-web-app/vite.config.ts \
        edutu-web-app/vitest.config.ts \
        edutu-web-app/tsconfig.app.json
git commit -m "feat(core): promote @edutu/core to a root workspace and publish the social subpath"
```

---

## Task 11: Web — `/u/:username` and the handle-claim panel

**Files:**
- Create: `edutu-web-app/src/components/SocialApiBootstrap.tsx`
- Create: `edutu-web-app/src/components/PublicProfilePage.tsx`
- Create: `edutu-web-app/src/components/UsernameSettingsPanel.tsx`
- Modify: `edutu-web-app/src/App.tsx`
- Modify: `edutu-web-app/src/components/SettingsPage.tsx`
- Test: `edutu-web-app/src/components/__tests__/PublicProfilePage.test.tsx`

**Interfaces:**
- Consumes: `useProfile`, `useFollow`, `configureSocialApi`, `fetchSocialProfileSettings`,
  `updateSocialProfile`, `checkUsernameAvailability`, `claimUsername`, `sendContactMessage`,
  `SocialApiError` from `@edutu/core/social` (Task 10); `getApiBaseUrl` from `../lib/apiBaseUrl`;
  `Seo`, `PublicHeader`, `SiteFooter` (existing components).
- Produces: the `/u/:username` route.

**Theme rules for every line of JSX below:** `bg-surface-layer` / `bg-surface-body`,
`text-text-primary` / `text-text-secondary` / `text-text-muted`, `border-subtle`, `text-brand`.
**Never `text-primary`.** If you need literal white, `bg-[#ffffff]` — `index.css` remaps `.bg-white`
with `!important`.

- [ ] **Step 1: Write the failing test**

Create `edutu-web-app/src/components/__tests__/PublicProfilePage.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  useProfile: vi.fn(),
  useFollow: vi.fn(),
  sendContactMessage: vi.fn(),
}));

vi.mock('@edutu/core/social', () => ({
  useProfile: mocks.useProfile,
  useFollow: mocks.useFollow,
  sendContactMessage: mocks.sendContactMessage,
  SocialApiError: class extends Error {},
}));

import PublicProfilePage from '../PublicProfilePage';

const PROFILE = {
  username: 'amara_o',
  displayName: 'Amara Okafor',
  avatarUrl: null,
  headline: 'Chasing a fully-funded MSc in Public Health',
  bio: 'Lagos. Public health.',
  country: 'Nigeria',
  isMentor: true,
  followerCount: 40,
  followingCount: 3,
  outcomes: { applied: 12, won: 1 },
  allowContact: true,
};

const renderAt = (handle = 'amara_o') =>
  render(
    <MemoryRouter initialEntries={[`/u/${handle}`]}>
      <Routes>
        <Route path="/u/:username" element={<PublicProfilePage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('PublicProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useFollow.mockReturnValue({
      isFollowing: false,
      toggle: vi.fn(),
      pending: false,
      followerCount: 40,
      error: null,
    });
  });

  it('renders the handle, name, headline and mentor badge', async () => {
    mocks.useProfile.mockReturnValue({ profile: PROFILE, loading: false, error: null });
    renderAt();

    expect(await screen.findByText('Amara Okafor')).toBeInTheDocument();
    expect(screen.getByText('@amara_o')).toBeInTheDocument();
    expect(
      screen.getByText('Chasing a fully-funded MSc in Public Health'),
    ).toBeInTheDocument();
    expect(screen.getByText(/mentor/i)).toBeInTheDocument();
  });

  it('renders verified outcomes as "Applied 12 · Won 1"', async () => {
    mocks.useProfile.mockReturnValue({ profile: PROFILE, loading: false, error: null });
    renderAt();

    expect(await screen.findByTestId('outcome-applied')).toHaveTextContent('12');
    expect(screen.getByTestId('outcome-won')).toHaveTextContent('1');
  });

  it('renders NOTHING for outcomes when they are hidden — never zeroes', async () => {
    mocks.useProfile.mockReturnValue({
      profile: { ...PROFILE, outcomes: null },
      loading: false,
      error: null,
    });
    renderAt();

    await screen.findByText('Amara Okafor');
    expect(screen.queryByTestId('outcome-applied')).not.toBeInTheDocument();
    expect(screen.queryByTestId('outcome-won')).not.toBeInTheDocument();
    expect(screen.queryByText('Applied 0')).not.toBeInTheDocument();
  });

  it('shows a not-found state for a missing profile', async () => {
    mocks.useProfile.mockReturnValue({
      profile: null,
      loading: false,
      error: 'Profile not found',
    });
    renderAt('nobody');

    expect(
      await screen.findByText(/this profile doesn't exist or is private/i),
    ).toBeInTheDocument();
  });

  it('calls the follow toggle when the button is pressed', async () => {
    const toggle = vi.fn();
    mocks.useProfile.mockReturnValue({ profile: PROFILE, loading: false, error: null });
    mocks.useFollow.mockReturnValue({
      isFollowing: false,
      toggle,
      pending: false,
      followerCount: 40,
      error: null,
    });
    renderAt();

    await userEvent.click(await screen.findByRole('button', { name: /follow/i }));
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('reads "Following" once followed', async () => {
    mocks.useProfile.mockReturnValue({ profile: PROFILE, loading: false, error: null });
    mocks.useFollow.mockReturnValue({
      isFollowing: true,
      toggle: vi.fn(),
      pending: false,
      followerCount: 41,
      error: null,
    });
    renderAt();

    expect(
      await screen.findByRole('button', { name: /following/i }),
    ).toBeInTheDocument();
  });

  it('hides the message button when the owner has contact off', async () => {
    mocks.useProfile.mockReturnValue({
      profile: { ...PROFILE, allowContact: false },
      loading: false,
      error: null,
    });
    renderAt();

    await screen.findByText('Amara Okafor');
    expect(screen.queryByRole('button', { name: /message/i })).not.toBeInTheDocument();
  });

  it('relays a message and confirms it without revealing an address', async () => {
    mocks.sendContactMessage.mockResolvedValue({ ok: true });
    mocks.useProfile.mockReturnValue({ profile: PROFILE, loading: false, error: null });
    renderAt();

    await userEvent.click(await screen.findByRole('button', { name: /message/i }));
    await userEvent.type(screen.getByLabelText(/subject/i), 'Chevening question');
    await userEvent.type(
      screen.getByLabelText(/message/i),
      'How did you frame the leadership essay?',
    );
    await userEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() =>
      expect(mocks.sendContactMessage).toHaveBeenCalledWith('amara_o', {
        subject: 'Chevening question',
        message: 'How did you frame the leadership essay?',
      }),
    );
    expect(await screen.findByText(/message sent/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/@[a-z0-9.-]+\.(com|org|example)/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npx vitest run src/components/__tests__/PublicProfilePage.test.tsx
```

Expected: FAIL — `Failed to resolve import "../PublicProfilePage"`.

- [ ] **Step 3: Write the bootstrap component**

Create `edutu-web-app/src/components/SocialApiBootstrap.tsx`:

```tsx
import { useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";
import { configureSocialApi } from "@edutu/core/social";
import { getApiBaseUrl } from "../lib/apiBaseUrl";

/**
 * `@edutu/core/social` takes its base URL and token getter by injection, because
 * `import.meta.env` does not exist under Metro and `process.env` does not exist
 * under Vite. Mounted inside the Clerk tree so `getToken` is the real one; it
 * returns null when signed out, which is exactly what the public profile route
 * needs.
 */
export default function SocialApiBootstrap() {
  const { getToken } = useAuth();

  useEffect(() => {
    let baseUrl: string;
    try {
      baseUrl = getApiBaseUrl("Social API");
    } catch {
      // Unconfigured environment: leave the client unconfigured so calls fail
      // with a clear message instead of hitting the wrong origin.
      return;
    }
    configureSocialApi({
      baseUrl,
      getToken: () => getToken().catch(() => null),
    });
  }, [getToken]);

  return null;
}
```

- [ ] **Step 4: Write the public profile page**

Create `edutu-web-app/src/components/PublicProfilePage.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { BadgeCheck, MapPin, MessageSquare, Trophy, Send } from "lucide-react";
import { useFollow, useProfile, sendContactMessage } from "@edutu/core/social";
import PublicHeader from "./PublicHeader";
import SiteFooter from "./SiteFooter";
import Seo from "./Seo";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col">
      <span className="font-display text-xl font-semibold text-text-primary">
        {value}
      </span>
      <span className="text-xs uppercase tracking-[0.14em] text-text-muted">
        {label}
      </span>
    </div>
  );
}

function ContactForm({
  username,
  onSent,
}: {
  username: string;
  onSent: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSending(true);
    setError(null);
    try {
      await sendContactMessage(username, { subject, message });
      onSent();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not send your message.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="mt-4 rounded-2xl border border-subtle bg-surface-layer p-5"
    >
      <label
        htmlFor="contact-subject"
        className="block text-xs font-semibold uppercase tracking-[0.14em] text-text-muted"
      >
        Subject
      </label>
      <input
        id="contact-subject"
        value={subject}
        onChange={(event) => setSubject(event.target.value)}
        maxLength={120}
        required
        className="mt-1 w-full rounded-xl border border-subtle bg-surface-body px-3 py-2 text-sm text-text-primary outline-none focus:border-brand"
      />

      <label
        htmlFor="contact-message"
        className="mt-4 block text-xs font-semibold uppercase tracking-[0.14em] text-text-muted"
      >
        Message
      </label>
      <textarea
        id="contact-message"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        rows={5}
        maxLength={2000}
        required
        className="mt-1 w-full rounded-xl border border-subtle bg-surface-body px-3 py-2 text-sm text-text-primary outline-none focus:border-brand"
      />

      {error ? (
        <p className="mt-3 text-sm text-text-secondary" role="alert">
          {error}
        </p>
      ) : null}

      <p className="mt-3 text-xs text-text-muted">
        Edutu delivers this for you. You never see their email address, and they
        never see yours unless they reply.
      </p>

      <button
        type="submit"
        disabled={sending}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-text-inverse disabled:opacity-60"
      >
        <Send size={15} />
        {sending ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}

export default function PublicProfilePage() {
  const { username = "" } = useParams<{ username: string }>();
  const { profile, loading, error } = useProfile(username);
  const { isFollowing, toggle, pending, followerCount } = useFollow(username);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactSent, setContactSent] = useState(false);

  if (loading) {
    return (
      <>
        <PublicHeader />
        <main className="mx-auto w-full max-w-3xl px-4 py-16">
          <div className="h-40 animate-pulse rounded-2xl border border-subtle bg-surface-layer" />
        </main>
        <SiteFooter />
      </>
    );
  }

  if (error || !profile) {
    return (
      <>
        <Seo
          title="Profile not found | Edutu"
          description="This Edutu profile is not available."
          path={`/u/${username}`}
          noindex
        />
        <PublicHeader />
        <main className="mx-auto w-full max-w-3xl px-4 py-20 text-center">
          <h1 className="font-display text-2xl font-semibold text-text-primary">
            Profile not available
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            This profile doesn&apos;t exist or is private.
          </p>
        </main>
        <SiteFooter />
      </>
    );
  }

  return (
    <>
      <Seo
        title={`${profile.displayName} (@${profile.username}) | Edutu`}
        description={
          profile.headline ||
          `${profile.displayName} on Edutu — scholarships, fellowships and opportunities for ambitious African students.`
        }
        path={`/u/${profile.username}`}
        image={profile.avatarUrl}
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "ProfilePage",
          mainEntity: {
            "@type": "Person",
            name: profile.displayName,
            alternateName: `@${profile.username}`,
            description: profile.headline ?? undefined,
            image: profile.avatarUrl ?? undefined,
            address: profile.country ?? undefined,
          },
        }}
      />
      <PublicHeader />

      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <section className="rounded-3xl border border-subtle bg-surface-layer p-6 shadow-soft">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt=""
                className="h-20 w-20 shrink-0 rounded-2xl object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-brand/10 font-display text-2xl font-semibold text-brand">
                {profile.displayName.slice(0, 1).toUpperCase()}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-semibold tracking-tight text-text-primary">
                  {profile.displayName}
                </h1>
                {profile.isMentor ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand">
                    <BadgeCheck size={13} />
                    Mentor
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-sm text-text-muted">
                @{profile.username}
              </p>

              {profile.headline ? (
                <p className="mt-3 text-base text-text-secondary">
                  {profile.headline}
                </p>
              ) : null}

              {profile.country ? (
                <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-text-muted">
                  <MapPin size={13} />
                  {profile.country}
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-end gap-8">
            <Stat label="Followers" value={followerCount} />
            <Stat label="Following" value={profile.followingCount} />
            {/* Absent, not zeroed, when the owner keeps the track record private. */}
            {profile.outcomes ? (
              <>
                <div data-testid="outcome-applied">
                  <Stat label="Applied" value={profile.outcomes.applied} />
                </div>
                <div
                  data-testid="outcome-won"
                  className="rounded-2xl bg-brand/10 px-4 py-2"
                >
                  <span className="flex items-center gap-1.5 font-display text-xl font-semibold text-brand">
                    <Trophy size={16} />
                    {profile.outcomes.won}
                  </span>
                  <span className="text-xs uppercase tracking-[0.14em] text-text-muted">
                    Won
                  </span>
                </div>
              </>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void toggle()}
              disabled={pending}
              className={
                isFollowing
                  ? "rounded-xl border border-subtle bg-surface-body px-4 py-2 text-sm font-semibold text-text-primary disabled:opacity-60"
                  : "rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-text-inverse disabled:opacity-60"
              }
            >
              {isFollowing ? "Following" : "Follow"}
            </button>

            {profile.allowContact ? (
              <button
                type="button"
                onClick={() => setContactOpen((open) => !open)}
                className="inline-flex items-center gap-2 rounded-xl border border-subtle bg-surface-body px-4 py-2 text-sm font-semibold text-text-primary"
              >
                <MessageSquare size={15} />
                Message
              </button>
            ) : null}
          </div>

          {contactSent ? (
            <p className="mt-4 rounded-xl border border-subtle bg-surface-body px-4 py-3 text-sm text-text-secondary">
              Message sent. They will reply straight to your inbox.
            </p>
          ) : null}

          {contactOpen && !contactSent && profile.allowContact ? (
            <ContactForm
              username={profile.username}
              onSent={() => {
                setContactSent(true);
                setContactOpen(false);
              }}
            />
          ) : null}
        </section>

        {profile.bio ? (
          <section className="mt-6 rounded-3xl border border-subtle bg-surface-layer p-6">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
              About
            </h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-text-secondary">
              {profile.bio}
            </p>
          </section>
        ) : null}
      </main>

      <SiteFooter />
    </>
  );
}
```

- [ ] **Step 5: Write the settings panel**

Create `edutu-web-app/src/components/UsernameSettingsPanel.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import {
  checkUsernameAvailability,
  claimUsername,
  fetchSocialProfileSettings,
  updateSocialProfile,
  type SocialProfileSettings,
} from "@edutu/core/social";

type Availability = { available: boolean; message: string | null } | null;

export default function UsernameSettingsPanel() {
  const [settings, setSettings] = useState<SocialProfileSettings | null>(null);
  const [handle, setHandle] = useState("");
  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [availability, setAvailability] = useState<Availability>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchSocialProfileSettings()
      .then((next) => {
        if (cancelled) return;
        setSettings(next);
        setHandle(next.username ?? "");
        setHeadline(next.headline ?? "");
        setBio(next.bio ?? "");
      })
      .catch(() => {
        if (!cancelled) setSettings(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced availability check. 400ms is long enough that a fast typist
  // triggers one request per handle, not one per keystroke.
  useEffect(() => {
    const candidate = handle.trim();
    if (!candidate || candidate === settings?.username) {
      setAvailability(null);
      return;
    }
    const timer = setTimeout(() => {
      checkUsernameAvailability(candidate)
        .then((result) =>
          setAvailability({
            available: result.available,
            message: result.message,
          }),
        )
        .catch(() => setAvailability(null));
    }, 400);
    return () => clearTimeout(timer);
  }, [handle, settings?.username]);

  const save = useCallback(async () => {
    setSaving(true);
    setStatus(null);
    try {
      const candidate = handle.trim();
      if (candidate && candidate !== settings?.username) {
        await claimUsername(candidate);
      }
      const next = await updateSocialProfile({ headline, bio });
      setSettings(next);
      setStatus("Saved");
    } catch (cause) {
      setStatus(
        cause instanceof Error ? cause.message : "Could not save your profile.",
      );
    } finally {
      setSaving(false);
    }
  }, [bio, handle, headline, settings?.username]);

  const togglePrivacy = useCallback(
    async (key: "publicProfile" | "allowContact" | "showOutcomes") => {
      if (!settings) return;
      const next = !settings.privacy[key];
      // Optimistic so the switch does not lag on a slow connection.
      setSettings({
        ...settings,
        privacy: { ...settings.privacy, [key]: next },
      });
      try {
        const saved = await updateSocialProfile({ privacy: { [key]: next } });
        setSettings(saved);
      } catch {
        setSettings(settings);
        setStatus("Could not update that setting.");
      }
    },
    [settings],
  );

  const cooldown = settings?.cooldownDaysRemaining ?? 0;

  return (
    <section className="mb-6 rounded-2xl border border-subtle bg-surface-layer p-5 shadow-soft">
      <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-muted">
        Public profile
      </h2>
      <p className="mt-1 text-sm text-text-muted">
        Your handle is your page at edutu.org/u/&lt;username&gt;.
      </p>

      <label
        htmlFor="social-handle"
        className="mt-4 block text-xs font-semibold uppercase tracking-[0.14em] text-text-muted"
      >
        Username
      </label>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-sm text-text-muted">@</span>
        <input
          id="social-handle"
          value={handle}
          disabled={cooldown > 0}
          onChange={(event) => setHandle(event.target.value)}
          maxLength={24}
          className="w-full max-w-xs rounded-xl border border-subtle bg-surface-body px-3 py-2 text-sm text-text-primary outline-none focus:border-brand disabled:opacity-60"
        />
      </div>
      <p className="mt-1 text-xs text-text-muted">
        {cooldown > 0
          ? `You can change your username again in ${cooldown} day${cooldown === 1 ? "" : "s"}.`
          : "3–24 characters. Lowercase letters, numbers and underscores."}
      </p>
      {availability ? (
        <p className="mt-1 text-xs text-text-secondary">
          {availability.available ? "Available" : availability.message}
        </p>
      ) : null}

      <label
        htmlFor="social-headline"
        className="mt-4 block text-xs font-semibold uppercase tracking-[0.14em] text-text-muted"
      >
        What I&apos;m chasing
      </label>
      <input
        id="social-headline"
        value={headline}
        onChange={(event) => setHeadline(event.target.value)}
        maxLength={120}
        placeholder="Chasing a fully-funded MSc in Public Health"
        className="mt-1 w-full rounded-xl border border-subtle bg-surface-body px-3 py-2 text-sm text-text-primary outline-none focus:border-brand"
      />

      <label
        htmlFor="social-bio"
        className="mt-4 block text-xs font-semibold uppercase tracking-[0.14em] text-text-muted"
      >
        About
      </label>
      <textarea
        id="social-bio"
        value={bio}
        onChange={(event) => setBio(event.target.value)}
        rows={3}
        maxLength={280}
        className="mt-1 w-full rounded-xl border border-subtle bg-surface-body px-3 py-2 text-sm text-text-primary outline-none focus:border-brand"
      />

      <div className="mt-5 space-y-3">
        {(
          [
            ["publicProfile", "Public profile", "Anyone with your link can see your page."],
            ["allowContact", "Let people message me", "Relayed by Edutu. Your address stays private."],
            ["showOutcomes", "Show my track record", "Applied and won counts, from your real applications."],
          ] as const
        ).map(([key, label, hint]) => (
          <label key={key} className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={settings?.privacy[key] ?? false}
              onChange={() => void togglePrivacy(key)}
              className="mt-1 h-4 w-4 accent-[rgb(var(--color-brand-600))]"
            />
            <span>
              <span className="block text-sm font-medium text-text-primary">
                {label}
              </span>
              <span className="block text-xs text-text-muted">{hint}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-text-inverse disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {status ? (
          <span className="text-sm text-text-secondary">{status}</span>
        ) : null}
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Register the route and mount the panel**

In `edutu-web-app/src/App.tsx`:

1. Add the lazy import next to the other page imports:
   ```ts
   const PublicProfilePage = lazy(() => import("./components/PublicProfilePage"));
   ```
2. Add the eager import next to `GoogleOneTapGate`:
   ```ts
   import SocialApiBootstrap from "./components/SocialApiBootstrap";
   ```
3. Render the bootstrap immediately after `<GoogleOneTapGate />`:
   ```tsx
   <SocialApiBootstrap />
   ```
4. Add the route beside `/blog/:slug`, i.e. before the `path="*"` catch-all:
   ```tsx
   <Route path="/u/:username" element={<PublicProfilePage />} />
   ```

In `edutu-web-app/src/components/SettingsPage.tsx`, add
`import UsernameSettingsPanel from "./UsernameSettingsPanel";` and render `<UsernameSettingsPanel />`
immediately above `<AppearanceSettings />`.

- [ ] **Step 7: Run the test to verify it passes**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npx vitest run src/components/__tests__/PublicProfilePage.test.tsx
```

Expected: PASS — `Tests: 8 passed`.

- [ ] **Step 8: Check the theme-token rule automatically**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
grep -n "text-primary\b\|bg-white\b" src/components/PublicProfilePage.tsx src/components/UsernameSettingsPanel.tsx
```

Expected: **no output.** `text-text-primary` is fine; a bare `text-primary` or `bg-white` is a
blocker (`index.css` overrides `.bg-white` with `!important`).

- [ ] **Step 9: Lint, typecheck, build, full suite**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npm run lint && npm run typecheck && npx vitest run && npm run build
```

Expected: lint 0 (it runs `--max-warnings 0`), typecheck 0, tests green, build succeeds. Do **not**
stage the regenerated `public/sitemap.xml`.

- [ ] **Step 10: Eyeball it in the browser**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npm run dev
```

Open `http://localhost:5173/u/<a-real-handle>` **signed out**. Expected: the page renders with the
handle, headline and follower counts, and the Follow button is present. Then sign in and reload:
the Follow button must reflect your real state. A blank page or a 401 in the console means
`@Public()`/`@OptionalAuth()` on the backend route did not take effect (Task 7 Step 7).

- [ ] **Step 11: Commit**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
git add edutu-web-app/src/components/PublicProfilePage.tsx \
        edutu-web-app/src/components/UsernameSettingsPanel.tsx \
        edutu-web-app/src/components/SocialApiBootstrap.tsx \
        edutu-web-app/src/components/SettingsPage.tsx \
        edutu-web-app/src/components/__tests__/PublicProfilePage.test.tsx \
        edutu-web-app/src/App.tsx
git commit -m "feat(web): public profile page at /u/:username and handle-claim settings"
```

---

## Task 12: Mobile — `/u/[username]`, deep-link bridge and handle claim

**Files:**
- Create: `edutumobile/components/SocialApiBootstrap.tsx`
- Create: `edutumobile/app/(app)/u/[username].tsx`
- Create: `edutumobile/app/user/[username].tsx`
- Create: `edutumobile/app/(app)/profile/username.tsx`
- Modify: `edutumobile/app/_layout.tsx`
- Modify: `edutumobile/app/(app)/profile/edit.tsx`
- Modify: `edutumobile/lib/i18n/locales/{en,fr,es,pt,ar,ha,hi,sw,zh}/profile.json`
- Test: `edutumobile/__tests__/social-profile.test.tsx`

**Interfaces:**
- Consumes: `useProfile`, `useFollow`, `configureSocialApi`, `fetchSocialProfileSettings`,
  `updateSocialProfile`, `claimUsername` from `@edutu/core/src/social` (Task 10);
  `ScreenHeader` from `../../../components/ui/ScreenHeader`; `useTheme` from
  `../../../components/context/ThemeContext`; `getConfig` from `../../../lib/config`.
- Produces: the `/u/:username` mobile route and the `edutu://user/<handle>` bridge.

> **Constraints that apply to every line below.** Mobile lint runs `--max-warnings 0` and the app is
> on the React Compiler: no conditional hooks, no mutation of props or state during render. i18n
> covers 9 languages (`ar` is RTL). New keys go into the **existing `profile` namespace**, which
> means `lib/i18n/resources.ts` does **not** need regenerating — it already imports
> `locales/<lang>/profile.json`. All nine `profile.json` files use 2-space indentation (verified),
> so no hand-indentation dance is needed for this namespace.

- [ ] **Step 1: Write the failing test**

Create `edutumobile/__tests__/social-profile.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mockUseProfile = jest.fn();
const mockUseFollow = jest.fn();

jest.mock('@edutu/core/src/social', () => ({
  useProfile: (username: string) => mockUseProfile(username),
  useFollow: (username: string) => mockUseFollow(username),
  configureSocialApi: jest.fn(),
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ username: 'amara_o' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  Redirect: ({ href }: { href: string }) => <>{href}</>,
}));

import PublicProfileScreen from '../app/(app)/u/[username]';

const PROFILE = {
  username: 'amara_o',
  displayName: 'Amara Okafor',
  avatarUrl: null,
  headline: 'Chasing a fully-funded MSc',
  bio: null,
  country: 'Nigeria',
  isMentor: true,
  followerCount: 40,
  followingCount: 3,
  outcomes: { applied: 12, won: 1 },
  allowContact: false,
};

describe('PublicProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFollow.mockReturnValue({
      isFollowing: false,
      toggle: jest.fn(),
      pending: false,
      followerCount: 40,
      error: null,
    });
  });

  it('renders the handle, display name and mentor badge', () => {
    mockUseProfile.mockReturnValue({ profile: PROFILE, loading: false, error: null });
    const { getByText } = render(<PublicProfileScreen />);

    expect(getByText('Amara Okafor')).toBeTruthy();
    expect(getByText('@amara_o')).toBeTruthy();
    expect(getByText('Mentor')).toBeTruthy();
  });

  it('renders verified outcomes', () => {
    mockUseProfile.mockReturnValue({ profile: PROFILE, loading: false, error: null });
    const { getByTestId } = render(<PublicProfileScreen />);

    expect(getByTestId('outcome-applied').props.children).toBe(12);
    expect(getByTestId('outcome-won').props.children).toBe(1);
  });

  it('renders NO outcome tiles when the owner hides them', () => {
    mockUseProfile.mockReturnValue({
      profile: { ...PROFILE, outcomes: null },
      loading: false,
      error: null,
    });
    const { queryByTestId } = render(<PublicProfileScreen />);

    expect(queryByTestId('outcome-applied')).toBeNull();
    expect(queryByTestId('outcome-won')).toBeNull();
  });

  it('calls toggle when Follow is pressed', async () => {
    const toggle = jest.fn();
    mockUseProfile.mockReturnValue({ profile: PROFILE, loading: false, error: null });
    mockUseFollow.mockReturnValue({
      isFollowing: false,
      toggle,
      pending: false,
      followerCount: 40,
      error: null,
    });

    const { getByTestId } = render(<PublicProfileScreen />);
    fireEvent.press(getByTestId('follow-button'));

    await waitFor(() => expect(toggle).toHaveBeenCalledTimes(1));
  });

  it('shows an empty state for a missing profile', () => {
    mockUseProfile.mockReturnValue({
      profile: null,
      loading: false,
      error: 'Profile not found',
    });
    const { getByTestId } = render(<PublicProfileScreen />);
    expect(getByTestId('profile-not-found')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile
npx jest __tests__/social-profile.test.tsx --maxWorkers=2
```

Expected: FAIL — `Cannot find module '../app/(app)/u/[username]'`.

- [ ] **Step 3: Write the bootstrap**

Create `edutumobile/components/SocialApiBootstrap.tsx`:

```tsx
import { useEffect } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { configureSocialApi } from '@edutu/core/src/social';
import { getConfig } from '../lib/config';

/**
 * `@edutu/core/src/social` takes its base URL and token getter by injection so
 * the same file bundles under Metro and Vite. Mount inside the Clerk provider.
 */
export default function SocialApiBootstrap() {
  const { getToken } = useAuth();

  useEffect(() => {
    configureSocialApi({
      baseUrl: getConfig().apiBaseUrl,
      getToken: () => getToken().catch(() => null),
    });
  }, [getToken]);

  return null;
}
```

In `edutumobile/app/_layout.tsx`, import it and render `<SocialApiBootstrap />` inside the existing
`<ClerkProvider>` subtree, immediately above the navigation stack.

- [ ] **Step 4: Write the public profile screen**

Create `edutumobile/app/(app)/u/[username].tsx`:

```tsx
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BadgeCheck, MapPin, Trophy } from 'lucide-react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useFollow, useProfile } from '@edutu/core/src/social';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { useTheme } from '../../../components/context/ThemeContext';

export default function PublicProfileScreen() {
  const { t } = useTranslation('profile');
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ username?: string }>();
  const username = typeof params.username === 'string' ? params.username : '';

  // Hooks are unconditional — the React Compiler rejects conditional hooks.
  const { profile, loading, error } = useProfile(username);
  const { isFollowing, toggle, pending, followerCount } = useFollow(username);

  const renderStat = (label: string, value: number, testID?: string) => (
    <View style={styles.stat}>
      <Text testID={testID} style={[styles.statValue, { color: colors.foreground }]}>
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title={profile ? `@${profile.username}` : t('social.title')} showBack />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : null}

      {!loading && (error || !profile) ? (
        <View testID="profile-not-found" style={styles.center}>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {t('social.notFound')}
          </Text>
        </View>
      ) : null}

      {!loading && profile ? (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.headerRow}>
              {profile.avatarUrl ? (
                <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.muted }]}>
                  <Text style={[styles.avatarInitial, { color: colors.accent }]}>
                    {profile.displayName.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
              )}

              <View style={styles.headerText}>
                <View style={styles.nameRow}>
                  <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
                    {profile.displayName}
                  </Text>
                  {profile.isMentor ? (
                    <View style={[styles.badge, { backgroundColor: colors.muted }]}>
                      <BadgeCheck size={12} color={colors.accent} />
                      <Text style={[styles.badgeText, { color: colors.accent }]}>
                        {t('social.mentor')}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.handle, { color: colors.mutedForeground }]}>
                  @{profile.username}
                </Text>
              </View>
            </View>

            {profile.headline ? (
              <Text style={[styles.headline, { color: colors.textSecondary }]}>
                {profile.headline}
              </Text>
            ) : null}

            {profile.country ? (
              <View style={styles.countryRow}>
                <MapPin size={12} color={colors.mutedForeground} />
                <Text style={[styles.country, { color: colors.mutedForeground }]}>
                  {profile.country}
                </Text>
              </View>
            ) : null}

            <View style={styles.statsRow}>
              {renderStat(t('social.followers'), followerCount)}
              {renderStat(t('social.followingCount'), profile.followingCount)}
              {/* Absent, never zeroed, when the owner hides the track record. */}
              {profile.outcomes ? renderStat(t('social.applied'), profile.outcomes.applied, 'outcome-applied') : null}
              {profile.outcomes ? (
                <View style={[styles.stat, styles.wonStat, { backgroundColor: colors.muted }]}>
                  <View style={styles.wonRow}>
                    <Trophy size={14} color={colors.accent} />
                    <Text testID="outcome-won" style={[styles.statValue, { color: colors.accent }]}>
                      {profile.outcomes.won}
                    </Text>
                  </View>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
                    {t('social.won')}
                  </Text>
                </View>
              ) : null}
            </View>

            {!profile.outcomes ? (
              <Text style={[styles.hiddenNote, { color: colors.mutedForeground }]}>
                {t('social.trackRecordHidden')}
              </Text>
            ) : null}

            <TouchableOpacity
              testID="follow-button"
              accessibilityRole="button"
              disabled={pending}
              onPress={() => {
                void toggle();
              }}
              style={[
                styles.followButton,
                isFollowing
                  ? { backgroundColor: colors.muted, borderColor: colors.border, borderWidth: 1 }
                  : { backgroundColor: colors.accent },
                pending ? styles.disabled : null,
              ]}
            >
              <Text
                style={[
                  styles.followText,
                  { color: isFollowing ? colors.foreground : '#FFFFFF' },
                ]}
              >
                {isFollowing ? t('social.following') : t('social.follow')}
              </Text>
            </TouchableOpacity>
          </View>

          {profile.bio ? (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
                {t('social.bio')}
              </Text>
              <Text style={[styles.bio, { color: colors.textSecondary }]}>{profile.bio}</Text>
            </View>
          ) : null}
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { fontSize: 14, textAlign: 'center' },
  content: { padding: 16, gap: 12 },
  card: { borderRadius: 20, borderWidth: 1, padding: 16 },
  headerRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  avatar: { width: 64, height: 64, borderRadius: 18 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 24, fontWeight: '700' },
  headerText: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  name: { fontSize: 19, fontWeight: '700', flexShrink: 1 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  handle: { fontSize: 13, marginTop: 2 },
  headline: { fontSize: 15, marginTop: 12, lineHeight: 21 },
  countryRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  country: { fontSize: 12 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, marginTop: 18, alignItems: 'flex-end' },
  stat: { minWidth: 64 },
  wonStat: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  wonRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statValue: { fontSize: 20, fontWeight: '700' },
  statLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 2 },
  hiddenNote: { fontSize: 12, marginTop: 12 },
  followButton: { marginTop: 18, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  followText: { fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.6 },
  sectionTitle: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: '600' },
  bio: { fontSize: 14, lineHeight: 21, marginTop: 8 },
});
```

- [ ] **Step 5: Add the singular deep-link bridge**

Create `edutumobile/app/user/[username].tsx`:

```tsx
import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Shares and notifications emit BOTH `edutu://u/<handle>` and
 * `edutu://user/<handle>`. The real screen is `/(app)/u/[username]`, which
 * expo-router exposes at `/u/<handle>` — the singular/plural mismatch is what
 * produced this repo's shipped "Unmatched Route" bug for opportunity links, so
 * register both from day one.
 */
export default function UserDeepLinkRedirect() {
  const { username } = useLocalSearchParams<{ username?: string }>();
  return <Redirect href={username ? `/u/${username}` : '/'} />;
}
```

- [ ] **Step 6: Add the handle-claim screen**

Create `edutumobile/app/(app)/profile/username.tsx`:

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  claimUsername,
  fetchSocialProfileSettings,
  updateSocialProfile,
  type SocialProfileSettings,
} from '@edutu/core/src/social';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { useTheme } from '../../../components/context/ThemeContext';

type PrivacyKey = 'publicProfile' | 'allowContact' | 'showOutcomes';

export default function UsernameSettingsScreen() {
  const { t } = useTranslation('profile');
  const { colors } = useTheme();

  const [settings, setSettings] = useState<SocialProfileSettings | null>(null);
  const [handle, setHandle] = useState('');
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSocialProfileSettings()
      .then((next) => {
        if (cancelled) return;
        setSettings(next);
        setHandle(next.username ?? '');
        setHeadline(next.headline ?? '');
        setBio(next.bio ?? '');
      })
      .catch(() => {
        if (!cancelled) setStatus(t('social.loadFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const save = useCallback(async () => {
    setSaving(true);
    setStatus(null);
    try {
      const candidate = handle.trim();
      if (candidate && candidate !== settings?.username) {
        await claimUsername(candidate);
      }
      const next = await updateSocialProfile({ headline, bio });
      setSettings(next);
      setHandle(next.username ?? '');
      setStatus(t('social.saved'));
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : t('social.saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [bio, handle, headline, settings?.username, t]);

  const togglePrivacy = useCallback(
    async (key: PrivacyKey) => {
      if (!settings) return;
      const previous = settings;
      const next = !settings.privacy[key];
      setSettings({ ...settings, privacy: { ...settings.privacy, [key]: next } });
      try {
        const saved = await updateSocialProfile({ privacy: { [key]: next } });
        setSettings(saved);
      } catch {
        setSettings(previous);
        setStatus(t('social.saveFailed'));
      }
    },
    [settings, t],
  );

  const cooldown = settings?.cooldownDaysRemaining ?? 0;

  const row = (key: PrivacyKey, label: string) => (
    <View key={key} style={styles.switchRow}>
      <Text style={[styles.switchLabel, { color: colors.foreground }]}>{label}</Text>
      <Switch
        value={settings?.privacy[key] ?? false}
        onValueChange={() => {
          void togglePrivacy(key);
        }}
        trackColor={{ true: colors.accent, false: colors.muted }}
      />
    </View>
  );

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title={t('social.title')} showBack />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>{t('social.handle')}</Text>
          <TextInput
            value={handle}
            editable={cooldown === 0}
            onChangeText={setHandle}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={24}
            placeholder="amara_o"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
          />
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            {cooldown > 0 ? t('social.cooldown', { count: cooldown }) : t('social.handleHint')}
          </Text>

          <Text style={[styles.label, { color: colors.mutedForeground }]}>{t('social.headline')}</Text>
          <TextInput
            value={headline}
            onChangeText={setHeadline}
            maxLength={120}
            style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
          />

          <Text style={[styles.label, { color: colors.mutedForeground }]}>{t('social.bio')}</Text>
          <TextInput
            value={bio}
            onChangeText={setBio}
            maxLength={280}
            multiline
            numberOfLines={3}
            style={[styles.input, styles.multiline, { color: colors.foreground, borderColor: colors.border }]}
          />
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
            {t('social.privacyTitle')}
          </Text>
          {row('publicProfile', t('social.publicProfile'))}
          {row('allowContact', t('social.allowContact'))}
          {row('showOutcomes', t('social.showOutcomes'))}
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          disabled={saving}
          onPress={() => {
            void save();
          }}
          style={[styles.saveButton, { backgroundColor: colors.accent }, saving ? styles.disabled : null]}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.saveText}>{t('social.save')}</Text>
          )}
        </TouchableOpacity>

        {status ? (
          <Text style={[styles.status, { color: colors.mutedForeground }]}>{status}</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  card: { borderRadius: 20, borderWidth: 1, padding: 16 },
  label: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '600', marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginTop: 6 },
  multiline: { minHeight: 76, textAlignVertical: 'top' },
  hint: { fontSize: 12, marginTop: 6 },
  sectionTitle: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: '600' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  switchLabel: { fontSize: 15, flex: 1, paddingRight: 12 },
  saveButton: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  saveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.6 },
  status: { fontSize: 13, textAlign: 'center' },
});
```

In `edutumobile/app/(app)/profile/edit.tsx`, add a navigation row to the new screen alongside the
existing rows (import `useRouter` from `expo-router` if it is not already imported):

```tsx
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => router.push('/(app)/profile/username')}
          style={[styles.row, { borderColor: colors.border }]}
        >
          <Text style={[styles.rowLabel, { color: colors.foreground }]}>
            {t('social.title')}
          </Text>
          <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>
            {t('social.noHandle')}
          </Text>
        </TouchableOpacity>
```

(reuse whatever row/label style names already exist in that file; do not invent new StyleSheet keys
if equivalents are present).

- [ ] **Step 7: Add the i18n keys to all nine locales**

Add this `"social"` block as a new top-level key inside `lib/i18n/locales/en/profile.json`
(2-space indentation, matching the file):

```json
  "social": {
    "title": "Public profile",
    "handle": "Username",
    "handleHint": "3–24 characters. Lowercase letters, numbers and underscores.",
    "headline": "What I'm chasing",
    "bio": "About",
    "save": "Save",
    "saved": "Saved",
    "saveFailed": "Could not save. Try again.",
    "loadFailed": "Could not load your profile.",
    "cooldown": "You can change your username again in {{count}} days.",
    "privacyTitle": "Privacy",
    "publicProfile": "Public profile",
    "allowContact": "Let people message me",
    "showOutcomes": "Show my track record",
    "follow": "Follow",
    "following": "Following",
    "mentor": "Mentor",
    "followers": "Followers",
    "followingCount": "Following",
    "applied": "Applied",
    "won": "Won",
    "trackRecordHidden": "Track record hidden",
    "notFound": "This profile doesn't exist or is private.",
    "noHandle": "Claim your username"
  }
```

`fr/profile.json`:

```json
  "social": {
    "title": "Profil public",
    "handle": "Nom d'utilisateur",
    "handleHint": "3 à 24 caractères. Minuscules, chiffres et tirets bas.",
    "headline": "Ce que je vise",
    "bio": "À propos",
    "save": "Enregistrer",
    "saved": "Enregistré",
    "saveFailed": "Échec de l'enregistrement. Réessayez.",
    "loadFailed": "Impossible de charger votre profil.",
    "cooldown": "Vous pourrez changer de nom d'utilisateur dans {{count}} jours.",
    "privacyTitle": "Confidentialité",
    "publicProfile": "Profil public",
    "allowContact": "Autoriser les messages",
    "showOutcomes": "Afficher mon parcours",
    "follow": "Suivre",
    "following": "Abonné",
    "mentor": "Mentor",
    "followers": "Abonnés",
    "followingCount": "Abonnements",
    "applied": "Candidatures",
    "won": "Obtenues",
    "trackRecordHidden": "Parcours masqué",
    "notFound": "Ce profil n'existe pas ou est privé.",
    "noHandle": "Choisir un nom d'utilisateur"
  }
```

`es/profile.json`:

```json
  "social": {
    "title": "Perfil público",
    "handle": "Nombre de usuario",
    "handleHint": "3 a 24 caracteres. Minúsculas, números y guiones bajos.",
    "headline": "Lo que busco",
    "bio": "Sobre mí",
    "save": "Guardar",
    "saved": "Guardado",
    "saveFailed": "No se pudo guardar. Inténtalo de nuevo.",
    "loadFailed": "No se pudo cargar tu perfil.",
    "cooldown": "Podrás cambiar tu nombre de usuario en {{count}} días.",
    "privacyTitle": "Privacidad",
    "publicProfile": "Perfil público",
    "allowContact": "Permitir mensajes",
    "showOutcomes": "Mostrar mi trayectoria",
    "follow": "Seguir",
    "following": "Siguiendo",
    "mentor": "Mentor",
    "followers": "Seguidores",
    "followingCount": "Siguiendo",
    "applied": "Solicitudes",
    "won": "Ganadas",
    "trackRecordHidden": "Trayectoria oculta",
    "notFound": "Este perfil no existe o es privado.",
    "noHandle": "Elige tu nombre de usuario"
  }
```

`pt/profile.json`:

```json
  "social": {
    "title": "Perfil público",
    "handle": "Nome de usuário",
    "handleHint": "3 a 24 caracteres. Minúsculas, números e sublinhados.",
    "headline": "O que eu busco",
    "bio": "Sobre",
    "save": "Salvar",
    "saved": "Salvo",
    "saveFailed": "Não foi possível salvar. Tente de novo.",
    "loadFailed": "Não foi possível carregar seu perfil.",
    "cooldown": "Você poderá mudar seu nome de usuário em {{count}} dias.",
    "privacyTitle": "Privacidade",
    "publicProfile": "Perfil público",
    "allowContact": "Permitir mensagens",
    "showOutcomes": "Mostrar meu histórico",
    "follow": "Seguir",
    "following": "Seguindo",
    "mentor": "Mentor",
    "followers": "Seguidores",
    "followingCount": "Seguindo",
    "applied": "Candidaturas",
    "won": "Conquistadas",
    "trackRecordHidden": "Histórico oculto",
    "notFound": "Este perfil não existe ou é privado.",
    "noHandle": "Escolha seu nome de usuário"
  }
```

`ar/profile.json` (RTL — no layout changes needed; the app already flips for `ar`):

```json
  "social": {
    "title": "الملف الشخصي العام",
    "handle": "اسم المستخدم",
    "handleHint": "من 3 إلى 24 حرفًا. حروف صغيرة وأرقام وشرطة سفلية.",
    "headline": "ما أسعى إليه",
    "bio": "نبذة",
    "save": "حفظ",
    "saved": "تم الحفظ",
    "saveFailed": "تعذّر الحفظ. حاول مرة أخرى.",
    "loadFailed": "تعذّر تحميل ملفك الشخصي.",
    "cooldown": "يمكنك تغيير اسم المستخدم بعد {{count}} يومًا.",
    "privacyTitle": "الخصوصية",
    "publicProfile": "ملف شخصي عام",
    "allowContact": "السماح بالرسائل",
    "showOutcomes": "إظهار سجلّي",
    "follow": "متابعة",
    "following": "تتم المتابعة",
    "mentor": "مرشد",
    "followers": "المتابعون",
    "followingCount": "يتابع",
    "applied": "تقديمات",
    "won": "قبول",
    "trackRecordHidden": "السجل مخفي",
    "notFound": "هذا الملف غير موجود أو خاص.",
    "noHandle": "اختر اسم المستخدم"
  }
```

`ha/profile.json`:

```json
  "social": {
    "title": "Bayanan martaba na jama'a",
    "handle": "Sunan mai amfani",
    "handleHint": "Haruffa 3 zuwa 24. Ƙananan haruffa, lambobi da layin ƙasa.",
    "headline": "Abin da nake nema",
    "bio": "Game da ni",
    "save": "Ajiye",
    "saved": "An ajiye",
    "saveFailed": "Ba a iya ajiyewa ba. Sake gwadawa.",
    "loadFailed": "Ba a iya ɗaukar bayananka ba.",
    "cooldown": "Za ka iya canza sunan mai amfani bayan kwana {{count}}.",
    "privacyTitle": "Sirri",
    "publicProfile": "Bayanan jama'a",
    "allowContact": "Bar mutane su aiko saƙo",
    "showOutcomes": "Nuna tarihina",
    "follow": "Bi",
    "following": "Ana bi",
    "mentor": "Mai jagora",
    "followers": "Mabiya",
    "followingCount": "Ana bi",
    "applied": "An nema",
    "won": "An samu",
    "trackRecordHidden": "An ɓoye tarihi",
    "notFound": "Wannan bayanan ba su nan ko na sirri ne.",
    "noHandle": "Zaɓi sunan mai amfani"
  }
```

`hi/profile.json`:

```json
  "social": {
    "title": "सार्वजनिक प्रोफ़ाइल",
    "handle": "यूज़रनेम",
    "handleHint": "3–24 अक्षर। छोटे अक्षर, अंक और अंडरस्कोर।",
    "headline": "मैं क्या खोज रहा/रही हूँ",
    "bio": "परिचय",
    "save": "सेव करें",
    "saved": "सेव हो गया",
    "saveFailed": "सेव नहीं हो सका। फिर कोशिश करें।",
    "loadFailed": "आपकी प्रोफ़ाइल लोड नहीं हो सकी।",
    "cooldown": "आप {{count}} दिन बाद यूज़रनेम बदल सकते हैं।",
    "privacyTitle": "प्राइवेसी",
    "publicProfile": "सार्वजनिक प्रोफ़ाइल",
    "allowContact": "लोगों को संदेश भेजने दें",
    "showOutcomes": "मेरा रिकॉर्ड दिखाएँ",
    "follow": "फ़ॉलो करें",
    "following": "फ़ॉलो कर रहे हैं",
    "mentor": "मेंटर",
    "followers": "फ़ॉलोअर्स",
    "followingCount": "फ़ॉलोइंग",
    "applied": "आवेदन",
    "won": "मिले",
    "trackRecordHidden": "रिकॉर्ड छिपा है",
    "notFound": "यह प्रोफ़ाइल मौजूद नहीं है या निजी है।",
    "noHandle": "अपना यूज़रनेम चुनें"
  }
```

`sw/profile.json`:

```json
  "social": {
    "title": "Wasifu wa umma",
    "handle": "Jina la mtumiaji",
    "handleHint": "Herufi 3 hadi 24. Herufi ndogo, tarakimu na mistari ya chini.",
    "headline": "Ninachotafuta",
    "bio": "Kunihusu",
    "save": "Hifadhi",
    "saved": "Imehifadhiwa",
    "saveFailed": "Imeshindikana kuhifadhi. Jaribu tena.",
    "loadFailed": "Imeshindikana kupakia wasifu wako.",
    "cooldown": "Utaweza kubadilisha jina lako baada ya siku {{count}}.",
    "privacyTitle": "Faragha",
    "publicProfile": "Wasifu wa umma",
    "allowContact": "Ruhusu watu wanitumie ujumbe",
    "showOutcomes": "Onyesha rekodi yangu",
    "follow": "Fuata",
    "following": "Unafuata",
    "mentor": "Mshauri",
    "followers": "Wafuasi",
    "followingCount": "Anaofuata",
    "applied": "Maombi",
    "won": "Zilizopatikana",
    "trackRecordHidden": "Rekodi imefichwa",
    "notFound": "Wasifu huu haupo au ni wa faragha.",
    "noHandle": "Chagua jina lako la mtumiaji"
  }
```

`zh/profile.json`:

```json
  "social": {
    "title": "公开主页",
    "handle": "用户名",
    "handleHint": "3–24 个字符，仅限小写字母、数字和下划线。",
    "headline": "我在追求什么",
    "bio": "简介",
    "save": "保存",
    "saved": "已保存",
    "saveFailed": "保存失败，请重试。",
    "loadFailed": "无法加载你的资料。",
    "cooldown": "你可在 {{count}} 天后再次更改用户名。",
    "privacyTitle": "隐私",
    "publicProfile": "公开主页",
    "allowContact": "允许他人给我发消息",
    "showOutcomes": "展示我的战绩",
    "follow": "关注",
    "following": "已关注",
    "mentor": "导师",
    "followers": "粉丝",
    "followingCount": "关注中",
    "applied": "已申请",
    "won": "已获得",
    "trackRecordHidden": "战绩已隐藏",
    "notFound": "该主页不存在或为私密。",
    "noHandle": "设置你的用户名"
  }
```

Verify every file is still valid JSON with the same key set:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile
for lang in en fr es pt ar ha hi sw zh; do
  node -e "const k=Object.keys(require('./lib/i18n/locales/$lang/profile.json').social||{}); console.log('$lang', k.length)"
done
```

Expected: nine lines, every one reading `24`. A different count, or a JSON parse error, is a blocker.

> No `resources.ts` regeneration is needed: `social` is a new key **inside** the existing `profile`
> namespace, and `lib/i18n/resources.ts` already imports every `locales/<lang>/profile.json`. Run
> `node scripts/gen-i18n-resources.js` only if you add a whole new namespace file.

- [ ] **Step 8: Run the test to verify it passes**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile
npx jest __tests__/social-profile.test.tsx --maxWorkers=2
```

Expected: PASS — `Tests: 5 passed, 5 total`.

- [ ] **Step 9: Lint, typecheck, full suite**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile
npm run lint && npm run typecheck && npx jest --maxWorkers=2
```

Expected: lint 0 (it runs `--max-warnings 0`), typecheck 0, suite green. React Compiler warnings
about conditional hooks or render-time mutation are **failures** here, not warnings.

- [ ] **Step 10: Verify BOTH deep-link forms on a device or simulator**

With the dev client running:

```bash
npx uri-scheme open "edutu://u/<a-real-handle>" --ios
npx uri-scheme open "edutu://user/<a-real-handle>" --ios
```

Expected: both land on the profile screen. If either shows **"Unmatched Route"**, the bridge file is
missing or misnamed — this is the shipped bug class the bridge exists to prevent.

- [ ] **Step 11: Commit**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
git add "edutumobile/app/(app)/u" \
        edutumobile/app/user \
        "edutumobile/app/(app)/profile/username.tsx" \
        "edutumobile/app/(app)/profile/edit.tsx" \
        edutumobile/app/_layout.tsx \
        edutumobile/components/SocialApiBootstrap.tsx \
        edutumobile/lib/i18n/locales \
        edutumobile/__tests__/social-profile.test.tsx
git commit -m "feat(mobile): public profile screen, deep-link bridge and handle claim"
```

---

## Deploy order (do not reorder)

1. **Migration first.** `supabase db push` (Task 2 Step 9). The backend's `follow` notification and
   every identity read depend on columns that must already exist.
2. **Backend second.** Deploy to Render, then confirm with
   `curl -s -o /dev/null -w '%{http_code}\n' https://edutu-platform.onrender.com/social/u/nobody`
   → expect `404`, not `401` and not `502`.
3. **Web and mobile third**, in either order. Both degrade gracefully if the backend is behind:
   `useProfile` surfaces the error state, and the settings panel simply fails to load.

Backend environment: no new variables. `BREVO_API_KEY` and `BREVO_SENDER_EMAIL` are already required
by `/support`; the contact relay reuses them, so if `/support` works the relay works.

---

## Self-review

### 1. Spec coverage

| Spec requirement | Task |
|---|---|
| §4 handle, unique, 30-day change cooldown | 2 (column + unique index), 3 (rules), 4 (claim + cooldown) |
| §4 display name, avatar, country, one-line "what I'm chasing" | 5 (headline), 7 (projection) |
| §4 verified track record `Applied 12 · Won 1` from `opportunity_applications` + `outcome_offer` | 6 |
| §4 "no `shortlisted` status; do not assume one" | 6 — `APPLIED_STATUSES` has no `shortlisted`; the live-DB divergence (`interview`) is documented in Global Constraints |
| §4 follow (asymmetric) → notifications | 8 |
| §4 contact → backend-relayed Brevo, sender never sees the address | 9 |
| §4 mentor badge from `creator_applications` / `profiles.mentor_status` | 7 (via existing `isApprovedMentor`) |
| §4 privacy defaults: profile public, outcomes hidden, contact off; all togglable | 2 (column default), 5 (toggles), 11/12 (UI) |
| §5.1 `username` / `headline` / `bio` / `privacy` on `profiles` | 2 |
| §5.1 `user_follows` mirroring `user_blocks` | 2 |
| §5.4 raw Clerk sub everywhere, one conversion boundary | 1, enforced by assertions in the specs for Tasks 4, 6, 7, 8, 9 |
| §5.4 "verify column types against the live DB" | Done — the divergence table is in Global Constraints |
| §8 `@edutu/core` promoted to a root workspace, framework-agnostic, consumed by both | 10 |
| §8 documented shared-types-only fallback, timeboxed | 10 Step 1 |
| §10 `follow` notification kind + CHECK constraint in the same migration + a test | 2 (+ live verification in 8 Step 6) |
| §11 web `/u/:username` and mobile `app/(app)/u/[username].tsx` | 11, 12 |
| Contract: both singular and plural deep-link forms | 12 Step 5 |
| Contract: RLS SELECT-only on new tables | 2 |
| §12 id-namespace tests | 1, plus the explicit id assertions in Tasks 4, 6, 8, 9 |

Gaps deliberately left to other slices: `GET /social/u/:username/followers|following` render no UI in
Slice 1 (the endpoints exist and are tested; a "People" surface is Slice 2's Communities tab).
Blocking a user from the profile page reuses the existing `user_blocks` moderation flow, which
Slice 2 owns end to end.

### 2. Placeholder scan

Searched this plan for `TBD`, `TODO`, `implement later`, `add validation`, `handle edge cases`,
`similar to Task`, and `write tests for the above`. **None present.** Every code step contains the
complete file or the exact block to insert, and every command lists its expected output.

### 3. Type consistency

- `PublicProfile` (Task 10) has exactly the ten fields the contract fixes; `PublicProfileResponse`
  adds `viewer` only, and the backend's `PublicProfileResponse` (Task 7) is field-for-field identical.
- `outcomes` is `{ applied: number; won: number } | null` in the backend projection (Task 7), the
  service (Task 6, `VerifiedOutcomes | null`), the shared type (Task 10) and both UIs (Tasks 11, 12).
  Every layer preserves `null`; no layer coerces it to zeroes — asserted in Tasks 6, 10, 11 and 12.
- `ProfileSummary` (Task 8, backend) and `ProfileSummary` (Task 10, shared) both carry exactly
  `username | displayName | avatarUrl | headline | isMentor`.
- `SocialProfileSettings` is the same six fields in Task 5 (backend) and Task 10 (shared), and is what
  Tasks 11 and 12 consume.
- `ProfilePrivacy` is the same three booleans in Task 2 (Drizzle `$type`), Task 5, Task 6, Task 9 and
  Task 10.
- `rawClerkUserId` / `toLegacyUuid` / `legacyUserIdCandidates` / `matchesAnyUserId` keep the same
  signatures from Task 1 through Tasks 4, 6, 7, 8 and 9.
- `FollowResult` is `{ following: boolean; followerCount: number }` in Task 8 and Task 10.
- `NOTIFICATION_KINDS` (Task 2) is the single runtime list the Task 2 spec checks against the
  migration and that Task 8 emits `"follow"` from.
- `configureSocialApi({ baseUrl, getToken })` has one signature, used identically by
  `SocialApiBootstrap` on web (Task 11) and mobile (Task 12).

### 4. Base-branch assumptions

Every "create this file" step was derived from a tree 41 commits behind `origin/main`. The six
existence claims that drive file creation are enumerated in the Prerequisite section with a
`git show origin/main:<path>` check each, and the two load-bearing ones — Task 1's
`community-user-id.ts` and Task 10's `@edutu/core` promotion — carry explicit "import it, do not
duplicate it" instructions for the case where they already exist upstream. The live-DB facts in
Global Constraints are unaffected by the stale checkout (they were read from production, not from
the tree) but are re-confirmed by the psql verification steps in Task 2 and Task 6 regardless.
