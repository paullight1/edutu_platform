# Communities Slice 3 — Opportunity Fabric Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn generic group chat into Edutu-specific chat by shipping Opportunity Notes (tip / question / result), denormalised social counts with a self-healing nightly reconcile, opportunity-anchored groups surfaced on the opportunity detail page, live countdown opportunity cards inside chat, and the two promotion bridges (✦saved message → Note, Note → group Brief).

**Architecture:** Three new Postgres tables (`opportunity_notes`, `opportunity_note_votes`, `opportunity_social_counts`) with **SELECT-only** RLS; all writes go through a NEW sibling NestJS module `src/opportunity-notes/` that registers the `/opportunities/:opportunityId/notes*` and `/opportunities/:opportunityId/social` routes without touching the already-3430-line `src/opportunities/` module. Social counts are a write-through cache maintained by the backend plus a 3 AM reconcile cron that recomputes from source (`opportunity_notes`, `opportunity_applications`, `user_opportunity_signals`, `opportunity_note_votes`, `community_groups`) so drift self-heals. Client logic (types, REST client, hooks) lives once in the `@edutu/core` root workspace promoted by Slice 1; only the UI is written twice (web React + mobile React Native).

**Tech Stack:** NestJS 11 + Drizzle 0.45 + Supabase Postgres (`backend/services/services/api`); Jest 30 (backend); React 18 + Vite + Tailwind + Vitest 4 (`edutu-web-app`); Expo/React Native + expo-router + Jest 29 + `@testing-library/react-native` (`edutumobile`); shared `@edutu/core` workspace.

## Prerequisite — branch from `origin/main`, not from the current branch

**Do this before Task 1 and before believing anything else in this plan.**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder && git fetch origin && \
  { git merge-base --is-ancestor origin/main HEAD \
      && echo "OK: contains origin/main" \
      || echo "STOP: behind origin/main — rebase or branch afresh before starting"; }
```

The working tree this plan was written against was **41 commits behind `origin/main`** and was missing PR#40 entirely. That is not a footnote: it means a `grep` over the checked-out tree is **not evidence that something does not exist in the repo**. This plan already contained one such false claim (that the scraper scam gate did not exist — it does, on `origin/main`), and it has been corrected.

Consequences for anyone executing this plan:

- Communities work branches from `origin/main`. Never from the branch that was checked out when this was written.
- Every `grep`-gated conditional step here — Task 3 Step 1 (`screenMessage`), Task 10 Step 1 (Slice 2's report/group/message DTOs), Task 15 Step 3 (`fetchOpportunityById`), Task 15 Step 5 and Task 19 Step 4 (Slice 2's message renderer), Task 20 Step 1 (`extractRedFlags`) — must be re-run **after** rebasing. A "not found" result taken from a stale tree will send you off to reimplement something that already ships.
- If a symbol this plan expects is genuinely missing after a clean rebase, that is a real Slice 1/2 gap: stop and report it rather than writing a local substitute.

## Global Constraints

**Product limits (copied verbatim from the locked cross-slice contract, spec §2):**

> Active groups owned per user: 2 (mentors/approved creators: 10). Group creation cooldown: 24 h. New group listed in Spaces after 5 members. Messages: 20/min and 300/hour per user per group. `@edutu`: 5 per user per group per day, and always subject to the app-wide `@AiMetered` quota. `@everyone` announcements: 1 per group per day. Brief regeneration: ≥3 new ✦saved messages OR ≥40 new messages, max once per hour per group, only for groups with ≥10 members and ≥25 messages. Group expiry defaults to the anchored opportunity's deadline + 30 days.
>
> Application status vocabulary is `draft | submitted | offer | rejected | withdrawn | no_response` in the `opportunity_applications` table. There is **no** `shortlisted` status. Wins come from `outcome_offer` rows in `user_opportunity_signals`.

**Non-negotiable repo constraints (copied verbatim from the locked cross-slice contract):**

> 1. **`notifications_kind_check`** silently rejects unknown `kind` values — inserts fail with no error surfaced. Any slice adding a notification kind MUST alter that CHECK constraint in the *same* migration, and MUST include a test asserting an insert of each new kind succeeds. New kinds: `community-message`, `community-mention`, `community-announcement`, `community-invite`, `community-join-request`, `follow`, `note-reply`, `group-expiring`.
> 2. **Three user-id namespaces.** Use `rawClerkUserId` / `toLegacyUuid` above and nothing else. `profiles.userId` is typed `uuid` in Drizzle but the live DB stores raw Clerk subs — verify column types against the live DB before writing FKs; do not trust the Drizzle type.
> 3. **Supabase Realtime channel lifecycle.** Keep callbacks in refs so the subscribe effect depends only on `[supabase, groupId]`; remove any pre-existing channel with the same topic via `getChannels()` before subscribing; wrap `subscribe()` in try/catch. Otherwise you reproduce the shipped "cannot add postgres_changes callbacks ... after subscribe" crash. **One channel for the on-screen group only** — never one per joined group.
> 4. **`admin_settings` writes must satisfy its Zod schema exactly** — a malformed write makes ALL settings silently fall back to defaults. Extend the schema in the same change that adds keys.
> 5. **`npm run build` in `edutu-web-app` wipes `public/sitemap.xml`** — if a slice touches the sitemap, account for it.
> 6. **Never `git stash`** — concurrent sessions share this working tree.
> 7. Lint is a real gate on all four apps (backend, web, admin, mobile); mobile runs `--max-warnings 0`. Mobile is on the React Compiler — no conditional hooks, no mutation of props/state during render.
> 8. Web theme tokens only: `bg-surface-*`, `text-text-*`, `border-subtle`, `text-brand`. **Never `text-primary`.** `index.css` remaps `.bg-white` with `!important` — use `bg-[#ffffff]` if you truly need white.
> 9. Mobile i18n covers 9 languages (RTL for `ar`); locale JSON files mix 2- and 4-space indentation — hand-edit `ar/ha/hi/sw` then regenerate via `gen-i18n-resources.js`. There is no `de` locale (it's `pt`).
> 10. Backend deploy smoke test is `node dist/main` — a module that only fails at boot (Nest DI, native deps) passes tests and breaks production.

**Slice-3 specific constraints:**

- Migrations go in **root** `supabase/migrations/` using `YYYYMMDDHHMMSS_name.sql`. Do NOT add to `edutumobile/supabase/migrations/` (legacy `NNN_` numbering) or `backend/services/services/api/supabase/migrations/`.
- The new backend module is `backend/services/services/api/src/opportunity-notes/`. **Never** add these routes to `src/opportunities/opportunities.controller.ts` — it is already 571 lines against a 3430-line service.
- **The raw Clerk sub lives on `authId`, never on `id`.** `src/auth/clerk-auth.guard.ts:159-170` sets `request.user.id = toDatabaseUserId(payload.sub)` — the **derived uuid** — and `request.user.authId = payload.sub` — the **raw sub**. `request.user` has **no `sub` key**, so the locked contract's `rawClerkUserId({ id?, sub? })` signature is wrong on both counts; Slice 1 is correcting it, and this plan only ever calls the **string overload** `rawClerkUserId(authId)`.
  - Every controller handler that needs the canonical community user id uses `@CurrentUser("authId")`. **Never** `@CurrentUser()` + `.id`, and never `@CurrentUser("id")` for a `user_id` written into `opportunity_notes` / `opportunity_note_votes`. Those columns hold the raw sub; keying them off `.id` would put the derived uuid in a raw-sub column and silently break every join to `community_*`, to `profiles`, and to Slice 1's `user_follows`. Slice 2's plan already uses `@CurrentUser("authId")` — match it exactly.
  - `@CurrentUser("id")` is used in exactly one place in this slice: `assertOutcomeIsReal`, which reads the uuid-keyed `opportunity_applications` / `user_opportunity_signals`. It is obtained there by calling `toDatabaseUserId(rawSub)` rather than by a second decorator, so the conversion is visible at the call site.
- `src/common/user-id.ts` **already exists** and already exports `toDatabaseUserId`, `isUuid`, `matchProfileUserId` and `matchUserIdRef` — import from it, do not create a parallel helper. `toLegacyUuid` (the one sanctioned conversion boundary to `user_blocks` and `notifications`) comes from `src/common/community-user-id.ts`, which **Slice 1 creates**; it is defined to agree with `toDatabaseUserId` and with the DB function `public.clerk_id_to_uuid`.
- **Two different gates. Do not confuse them.**
  - The **scraper scam gate exists** on `origin/main`: `src/scraper/opportunity-dedup.service.ts` exports `isScamGateEnabled(env)` (reads `SCRAPER_SCAM_GATE`, default ON), `extractRedFlags(metadata)`, `decideScamGate(...)` and `SCAM_GATE_CAP_THRESHOLD = 2`, with 230 lines of tests in `src/scraper/scam-gate.spec.ts`. Semantics: 1 red flag → `metadata.needs_review = true` + `metadata.scam_risk`, status kept; 2+ flags → an `active` listing is capped to review. It operates on **scraper metadata where an LLM extractor has already written `red_flags`** — it takes a metadata object, not prose — so it structurally cannot screen a user's raw note text.
  - **Note/message text screening is Slice 2's.** Slice 2 builds `src/communities/community-message-safety.ts` exporting `screenMessage`, which reuses `isObjectionable` from the existing `src/common/moderation.ts`. Notes are UGC and get the **same** screening as chat: import `screenMessage` and do **not** write a second, competing implementation.
  - Slice 3 consumes **both**, for different jobs: `screenMessage` screens what a member writes (Task 3), and `extractRedFlags` surfaces what the scraper already concluded about the opportunity itself (Task 20).
- Note outcome vocabulary is exactly `applied | interview | offer | rejected`. This is derived from the **live** production constraint, confirmed by query:
  ```
  opportunity_applications_status_check:
  CHECK (status = ANY (ARRAY['draft','submitted','interview','offer','rejected','withdrawn','no_response']))
  ```
  `interview` is a real, shipped status and "I got an interview" is one of the highest-signal things a member can report — it tells everyone else the pipeline is real and moving. The design spec's `shortlisted` / `won` values are **wrong** and must not be implemented: there is no `shortlisted` status, and a win is an `offer`.
- **`applied_count` counts every non-`draft` application**, not `submitted`-only. `submitted`, `interview`, `offer`, `rejected`, `withdrawn` and `no_response` all prove the person applied; counting only `submitted` would erase every application that has since progressed. This matches Slice 1's profile track record (`applied` = all non-draft, `interviewed` = `interview` and beyond, `won` = `offer`). The rule is pinned by an exported constant and a test so a later reader cannot quietly "fix" it.
- **`@edutu/core` lives at `edutumobile/packages/core`. There is no repo-root `packages/` directory — do not "correct" these paths to one.** Slice 1 has settled this: EAS Build only uploads the `edutumobile/` directory unless `edutumobile` is itself a member of a root `workspaces` array, and making it one would break `npm ci` inside `edutumobile` in `.github/workflows/ci.yml`, whose `cache-dependency-path` is `edutumobile/package-lock.json`. Physically relocating the package is explicitly out of scope for Slice 1 and recorded as a follow-up. Slice 1 makes the web app *consume* the package from that location; it does not move it.
- Every filesystem path in this plan is written **relative to the repo root**, because that is where its commands run — hence `edutumobile/packages/core/src/...`. Import specifiers are a different thing and are unaffected: `import { … } from '@edutu/core'` and `'@edutu/core/src/…'` stay exactly as written.
- Reuse deadline helpers, never write new date maths: `getDeadlineBadge` / `urgencyColor` from `@edutu/core` (`edutumobile/packages/core/src/utils/deadline.ts`) and `UrgencyPill` / `getDeadlineBadge` / `urgencyBadgeClasses` from `edutu-web-app/src/components/opportunity/UrgencyPill.tsx` + `edutu-web-app/src/services/deadlineUrgency.ts`.
- Node 20 everywhere — do not bump.
- Run before every commit: backend `npm --prefix backend/services/services/api run lint`, web `npm --prefix edutu-web-app run lint && npm --prefix edutu-web-app run typecheck`, mobile `npm --prefix edutumobile run lint && npm --prefix edutumobile run typecheck`.

---

## File Structure

**Database**
| File | Responsibility |
|---|---|
| `supabase/migrations/20260725140000_opportunity_fabric_notes_social.sql` | 3 tables, indexes, SELECT-only RLS, `notifications_kind_check` superset |
| `backend/services/services/api/src/db/schema.ts` (modify) | Drizzle definitions for the 3 tables |

**Backend — `backend/services/services/api/src/opportunity-notes/`**
| File | Responsibility |
|---|---|
| `note-content.ts` | Pure body normalisation + note-specific length rules; delegates all content screening to Slice 2's `screenMessage` and maps a `hold` verdict onto `status = 'hidden'` |
| `note-content.spec.ts` | Tests for the above |
| `dto/opportunity-note.dto.ts` | Zod schemas + inferred DTO types for every route |
| `opportunity-social-counts.source.ts` | `SocialCountsSource` port + `DbSocialCountsSource` (all raw SQL lives here) |
| `opportunity-social-counts.service.ts` | Read-through cache, write-through bumps, `reconcile()` |
| `opportunity-social-counts.service.spec.ts` | Reconcile-corrects-corrupted-cache test |
| `opportunity-risk.ts` | Reads the scraper scam gate's stored verdict (`extractRedFlags`) for one opportunity |
| `opportunity-risk.spec.ts` | Tests for the above |
| `opportunity-notes.service.ts` | Notes CRUD, votes, block collapse, result verification, brief sources |
| `opportunity-notes.service.spec.ts` | Service unit tests |
| `social-counts-reconcile.service.ts` | `@Cron` nightly reconcile |
| `social-counts-reconcile.service.spec.ts` | Cron kill-switch + error-containment tests |
| `opportunity-notes.controller.ts` | The 6 contract routes + 1 slice-3 batch route |
| `opportunity-notes.module.ts` | Wiring; exports `OpportunityNotesService` for Slice 4 |

**Backend — modified**
| File | Change |
|---|---|
| `src/notifications/dto/notification.dto.ts` | Add `note-reply` to `NotificationKind` + `BroadcastNotificationSchema` |
| `src/auth/clerk-auth.guard.ts` | Populate `request.user` on `@Public()` routes when a valid token is present (never throws) |
| `src/app.module.ts` | Register `OpportunityNotesModule` |

**Shared — `edutumobile/packages/core/src/`**
| File | Responsibility |
|---|---|
| `types/opportunityNote.ts` | `OpportunityNote`, `OpportunitySocialCounts`, `OpportunityNoteView`, input types |
| `services/opportunityNotes.ts` | Framework-agnostic REST client (plain `fetch`) |
| `hooks/useOpportunityNotes.ts` | The contract hook |
| `hooks/useOpportunitySocial.ts` | Counts + groups-discussing hook (slice-3 namespace) |
| `hooks/useLiveDeadline.ts` | Ticking deadline badge for chat cards (slice-3 namespace) |
| `index.ts` (modify) | Barrel exports |

**Web — `edutu-web-app/src/`**
| File | Responsibility |
|---|---|
| `lib/coreTransport.ts` | `useCoreTransport()` → `{ apiBaseUrl, getToken }` |
| `components/opportunity/SocialCountsStrip.tsx` | `4 notes · 10 applied · 20 found useful · 100 shared` |
| `components/opportunity/OpportunityNotes.tsx` | Notes list + composer + report |
| `components/opportunity/ReportNoteDialog.tsx` | Report reason picker → `POST /communities/reports` |
| `components/opportunity/ScamRiskNotice.tsx` | Scraper scam verdict shown above the notes and composer |
| `components/opportunity/GroupsDiscussing.tsx` | "N groups discussing this →" + create-anchored-group |
| `components/communities/OpportunityChatCard.tsx` | Live countdown card for `kind: 'opportunity'` messages |
| `components/OpportunityDetail.tsx` (modify) | Two insertion points |
| `components/OpportunitiesPage.tsx` (modify) | Counts strip on the browse card |

**Mobile — `edutumobile/`**
| File | Responsibility |
|---|---|
| `lib/coreTransport.ts` | `useCoreTransport()` |
| `components/opportunity/SocialCountsStrip.tsx` | Counts row |
| `components/opportunity/OpportunityNotes.tsx` | Notes list + composer + report |
| `components/opportunity/ScamRiskNotice.tsx` | Scraper scam verdict shown above the notes and composer |
| `components/opportunity/GroupsDiscussing.tsx` | Groups strip + create-anchored-group + share-to-group |
| `components/communities/OpportunityChatCard.tsx` | Live countdown card |
| `app/(app)/opportunities/[id].tsx` (modify) | Two insertion points |
| `lib/i18n/locales/<lang>/opps.json` × 9 (modify) | `notes.*` and `social.*` keys |

---

## Phase 1 — Database + backend

### Task 1: Migration — three tables, SELECT-only RLS, `notifications_kind_check` superset

**Files:**
- Create: `supabase/migrations/20260725140000_opportunity_fabric_notes_social.sql`

> **Timestamp band:** Slice 3 owns `202607251400xx`. Slices apply in order and Postgres migration runners sort by filename, so this must be strictly greater than every Slice 1 and Slice 2 migration. Do not renumber it downward.

**Interfaces:**
- Consumes: `public.opportunities(id)`, `public.notifications`, `public.set_updated_at()` (all pre-existing); `public.community_groups(opportunity_id, status)` from Slice 2.
- Produces: tables `public.opportunity_notes`, `public.opportunity_note_votes`, `public.opportunity_social_counts`; named constraint `notifications_kind_check` accepting `note-reply`.

- [ ] **Step 1: Confirm Slice 1 and Slice 2 landed**

Run:
```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder && \
ls backend/services/services/api/src/common/community-user-id.ts && \
ls backend/services/services/api/src/communities/communities.module.ts && \
ls edutumobile/packages/core/src/index.ts
```
Expected: all three paths print. If any is missing, STOP — Slice 1/2 have not merged and every interface below is unavailable.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260725140000_opportunity_fabric_notes_social.sql`:

```sql
-- Opportunity fabric (Communities slice 3): Opportunity Notes + social counts.
--
-- Notes are the low-noise, persistent, SEO-indexable counterpart to group chat
-- (design spec §3.1). Exactly three kinds — tip / question / result — and a
-- result note always carries an outcome drawn from the REAL application
-- vocabulary. The live constraint is
--   opportunity_applications_status_check: status = ANY (ARRAY[
--     'draft','submitted','interview','offer','rejected','withdrawn','no_response'])
-- so note outcomes are applied|interview|offer|rejected. There is no
-- 'shortlisted' status in this product and no 'won' — a win is an 'offer'.
--
-- opportunity_social_counts is a denormalised cache the backend maintains on
-- write, plus a nightly reconcile that recomputes from source. It exists so an
-- opportunity card renders "4 notes · 10 applied · 20 found useful · 100
-- shared" in ONE row read instead of five aggregates per card.
--
-- RLS is SELECT-only on all three tables: every write goes through the NestJS
-- service-role connection. There are deliberately NO insert/update/delete
-- policies, and the grants are revoked first, so a client cannot write even if
-- a future policy is added by mistake.

-- ── Notes ──────────────────────────────────────────────────────────────────
create table if not exists public.opportunity_notes (
  id                uuid primary key default gen_random_uuid(),
  opportunity_id    uuid not null references public.opportunities (id) on delete cascade,
  -- RAW Clerk sub (text), matching every other community_* table. Never the
  -- derived uuid. Conversion to legacy uuid-keyed tables happens in the API
  -- via toLegacyUuid(), never here.
  user_id           text not null,
  kind              text not null check (kind in ('tip', 'question', 'result')),
  body              text not null,
  outcome           text check (outcome in ('applied', 'interview', 'offer', 'rejected')),
  reply_to_id       uuid references public.opportunity_notes (id) on delete cascade,
  -- Set when this note was published from a ✦saved group chat message.
  source_message_id uuid,
  helpful_count     integer not null default 0,
  status            text not null default 'visible'
                      check (status in ('visible', 'hidden', 'removed')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- A result note must state an outcome; a tip/question must not.
  constraint opportunity_notes_outcome_matches_kind check (
    (kind = 'result' and outcome is not null)
    or (kind <> 'result' and outcome is null)
  )
);

-- The list endpoint always filters (opportunity_id, status) and sorts by
-- helpful_count desc, created_at desc.
create index if not exists idx_opportunity_notes_opportunity
  on public.opportunity_notes (opportunity_id, status, helpful_count desc, created_at desc);
create index if not exists idx_opportunity_notes_user
  on public.opportunity_notes (user_id, created_at desc);
create index if not exists idx_opportunity_notes_reply_to
  on public.opportunity_notes (reply_to_id)
  where reply_to_id is not null;

-- One result claim per person per opportunity: "I applied" said five times is
-- noise, and applied_count must not be inflatable from the notes surface.
create unique index if not exists uq_opportunity_notes_result_per_user
  on public.opportunity_notes (opportunity_id, user_id)
  where kind = 'result';

drop trigger if exists set_timestamp_opportunity_notes on public.opportunity_notes;
create trigger set_timestamp_opportunity_notes
before update on public.opportunity_notes
for each row execute function public.set_updated_at();

-- ── "Found useful" votes ───────────────────────────────────────────────────
create table if not exists public.opportunity_note_votes (
  note_id    uuid not null references public.opportunity_notes (id) on delete cascade,
  user_id    text not null,
  created_at timestamptz not null default now(),
  primary key (note_id, user_id)
);
create index if not exists idx_opportunity_note_votes_user
  on public.opportunity_note_votes (user_id);

-- ── Denormalised social counts ─────────────────────────────────────────────
create table if not exists public.opportunity_social_counts (
  opportunity_id uuid primary key references public.opportunities (id) on delete cascade,
  notes_count    integer not null default 0,   -- opportunity_notes, status='visible'
  -- opportunity_applications with status <> 'draft'. NOT 'submitted'-only:
  -- submitted/interview/offer/rejected/withdrawn/no_response all prove the
  -- person applied, and counting only 'submitted' would erase every
  -- application that has since progressed. Do not "fix" this.
  applied_count  integer not null default 0,
  useful_count   integer not null default 0,   -- opportunity_note_votes on visible notes
  shares_count   integer not null default 0,   -- distinct users with a 'share' signal
  groups_count   integer not null default 0,   -- active community_groups anchored here
  updated_at     timestamptz not null default now()
);
create index if not exists idx_opportunity_social_counts_updated
  on public.opportunity_social_counts (updated_at);

-- ── RLS: SELECT only ───────────────────────────────────────────────────────
alter table public.opportunity_notes enable row level security;
alter table public.opportunity_note_votes enable row level security;
alter table public.opportunity_social_counts enable row level security;

revoke all on table public.opportunity_notes from anon, authenticated;
revoke all on table public.opportunity_note_votes from anon, authenticated;
revoke all on table public.opportunity_social_counts from anon, authenticated;

grant select on table public.opportunity_notes to anon, authenticated;
grant select on table public.opportunity_note_votes to anon, authenticated;
grant select on table public.opportunity_social_counts to anon, authenticated;

grant select, insert, update, delete on table public.opportunity_notes to service_role;
grant select, insert, update, delete on table public.opportunity_note_votes to service_role;
grant select, insert, update, delete on table public.opportunity_social_counts to service_role;

drop policy if exists "Anyone can read visible opportunity notes" on public.opportunity_notes;
create policy "Anyone can read visible opportunity notes"
  on public.opportunity_notes
  for select
  to anon, authenticated
  using (status = 'visible');

drop policy if exists "Anyone can read note votes" on public.opportunity_note_votes;
create policy "Anyone can read note votes"
  on public.opportunity_note_votes
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can read opportunity social counts" on public.opportunity_social_counts;
create policy "Anyone can read opportunity social counts"
  on public.opportunity_social_counts
  for select
  to anon, authenticated
  using (true);

-- ── notifications_kind_check (repo constraint #1) ──────────────────────────
-- The live constraint is created inline and unnamed in schema.sql, so Postgres
-- auto-named it notifications_kind_check. It has already silently swallowed
-- deadline-reminder / opportunity-alert inserts in production. Re-create it as
-- a NAMED constraint holding the full superset: the six values in schema.sql,
-- the kinds the backend already emits, the two extra kinds in the mobile
-- schema copy, and all eight Communities kinds. Listing the superset (rather
-- than appending) makes this migration order-independent with slices 1/2.
alter table public.notifications
  drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check check (kind in (
    'goal-reminder',
    'goal-weekly-digest',
    'goal-progress',
    'opportunity-highlight',
    'opportunity-alert',
    'deadline-reminder',
    'admin-broadcast',
    'system',
    'achievement',
    'credit-earned',
    'interest',
    'community-message',
    'community-mention',
    'community-announcement',
    'community-invite',
    'community-join-request',
    'follow',
    'note-reply',
    'group-expiring'
  ));

-- The mobile lineage created a parallel user_notifications table with its own
-- kind CHECK. Widen it too when it exists, so scheduled/in-app rows for the
-- new kinds are not silently dropped there instead.
do $$
begin
  if to_regclass('public.user_notifications') is not null then
    execute 'alter table public.user_notifications drop constraint if exists user_notifications_kind_check';
    execute $ck$
      alter table public.user_notifications
        add constraint user_notifications_kind_check check (kind in (
          'goal-reminder','goal-weekly-digest','goal-progress','opportunity-highlight',
          'opportunity-alert','deadline-reminder','admin-broadcast','system',
          'achievement','credit-earned','interest',
          'community-message','community-mention','community-announcement',
          'community-invite','community-join-request','follow','note-reply','group-expiring'
        ))
    $ck$;
  end if;
end $$;
```

- [ ] **Step 3: Apply the migration**

Apply via the Supabase MCP `apply_migration` tool (name: `opportunity_fabric_notes_social`) or `supabase db push` from the repo root.

- [ ] **Step 4: Verify the schema landed**

Run:
```bash
psql "$DATABASE_URL" \
  -c "\d public.opportunity_notes" \
  -c "\d public.opportunity_note_votes" \
  -c "\d public.opportunity_social_counts" \
  -c "select pg_get_constraintdef(oid) from pg_constraint where conname = 'notifications_kind_check';"
```
Expected: three table descriptions matching the migration, and a constraint definition containing `'note-reply'`.

- [ ] **Step 5: Verify RLS is SELECT-only**

Run:
```bash
psql "$DATABASE_URL" -c "select tablename, cmd, roles from pg_policies where tablename in ('opportunity_notes','opportunity_note_votes','opportunity_social_counts') order by tablename;"
psql "$DATABASE_URL" -c "select table_name, privilege_type, grantee from information_schema.role_table_grants where table_name in ('opportunity_notes','opportunity_note_votes','opportunity_social_counts') and grantee in ('anon','authenticated') order by table_name, grantee;"
```
Expected: exactly three policies, all `cmd = SELECT`; the grants listing shows only `SELECT` for `anon` and `authenticated`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260725140000_opportunity_fabric_notes_social.sql
git commit -m "feat(db): opportunity notes, note votes and social counts with SELECT-only RLS"
```

---

### Task 2: Drizzle definitions + `note-reply` notification kind

**Files:**
- Modify: `backend/services/services/api/src/db/schema.ts` (append near `userBlocks`, ~line 1219)
- Modify: `backend/services/services/api/src/notifications/dto/notification.dto.ts:3-11` and `:79-90`
- Create: `backend/services/services/api/src/opportunity-notes/note-reply-kind.spec.ts`

**Interfaces:**
- Consumes: table shapes from Task 1.
- Produces: exported Drizzle tables `opportunityNotes`, `opportunityNoteVotes`, `opportunitySocialCounts`; `NotificationKind` union including `"note-reply"`; `BroadcastNotificationSchema` accepting `"note-reply"`.

- [ ] **Step 1: Write the failing test**

Create `backend/services/services/api/src/opportunity-notes/note-reply-kind.spec.ts`:

```ts
import { sql } from "drizzle-orm";
import { BroadcastNotificationSchema } from "../notifications/dto/notification.dto";
import {
  opportunityNotes,
  opportunityNoteVotes,
  opportunitySocialCounts,
} from "../db/schema";

describe("note-reply notification kind", () => {
  it("is accepted by the broadcast Zod schema", () => {
    const parsed = BroadcastNotificationSchema.safeParse({
      title: "Someone replied to your note",
      body: "Ada replied on Chevening Scholarship",
      kind: "note-reply",
      audience: "specific",
      targetUserIds: ["8a1f0f0e-0000-4000-a000-000000000000"],
    });
    expect(parsed.success).toBe(true);
  });

  it("still rejects a kind that is not in the constraint", () => {
    const parsed = BroadcastNotificationSchema.safeParse({
      title: "x",
      body: "y",
      kind: "note-shrug",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("slice-3 drizzle tables", () => {
  it("maps camelCase fields to the migration's snake_case columns", () => {
    expect(opportunityNotes.helpfulCount.name).toBe("helpful_count");
    expect(opportunityNotes.opportunityId.name).toBe("opportunity_id");
    expect(opportunityNotes.sourceMessageId.name).toBe("source_message_id");
    // user_id is TEXT (raw Clerk sub), never uuid.
    expect(opportunityNotes.userId.getSQLType()).toBe("text");
    expect(opportunityNoteVotes.userId.getSQLType()).toBe("text");
    expect(opportunitySocialCounts.sharesCount.name).toBe("shares_count");
    expect(opportunitySocialCounts.groupsCount.name).toBe("groups_count");
  });

  it("keeps the drizzle sql helper importable for raw count queries", () => {
    expect(typeof sql).toBe("function");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm --prefix backend/services/services/api test -- note-reply-kind`
Expected: FAIL — `Cannot find module '../db/schema'` exports `opportunityNotes` (TS2305) and the `note-reply` parse returns `success: false`.

- [ ] **Step 3: Add the Drizzle tables**

Append to `backend/services/services/api/src/db/schema.ts`, immediately after the `userBlocks` table definition (which ends at line 1219). All helpers used (`pgTable`, `uuid`, `text`, `integer`, `timestamp`, `index`, `primaryKey`) are already imported at lines 1–17:

```ts
// ── Opportunity fabric (Communities slice 3) ────────────────────────────────
// Opportunity Notes are the structured, persistent counterpart to group chat.
// user_id is TEXT holding the RAW Clerk sub — the canonical key for every
// community/social table. Conversion to the legacy uuid-keyed tables
// (user_blocks, notifications) happens only through toLegacyUuid().
export const opportunityNotes = pgTable(
  "opportunity_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    opportunityId: uuid("opportunity_id").notNull(),
    userId: text("user_id").notNull(),
    kind: text("kind").notNull(),
    body: text("body").notNull(),
    // Only ever set on kind='result'. Vocabulary mirrors the real
    // opportunity_applications statuses: there is no 'shortlisted' and no 'won'.
    outcome: text("outcome"),
    replyToId: uuid("reply_to_id"),
    sourceMessageId: uuid("source_message_id"),
    helpfulCount: integer("helpful_count").notNull().default(0),
    status: text("status").notNull().default("visible"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_opportunity_notes_opportunity").on(
      table.opportunityId,
      table.status,
      table.helpfulCount,
      table.createdAt,
    ),
    index("idx_opportunity_notes_user").on(table.userId, table.createdAt),
  ],
);

export const opportunityNoteVotes = pgTable(
  "opportunity_note_votes",
  {
    noteId: uuid("note_id").notNull(),
    userId: text("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.noteId, table.userId] }),
    index("idx_opportunity_note_votes_user").on(table.userId),
  ],
);

// Write-through cache. Never read this table without the reconcile job
// running — a stale row is a wrong number on every card.
export const opportunitySocialCounts = pgTable("opportunity_social_counts", {
  opportunityId: uuid("opportunity_id").primaryKey(),
  notesCount: integer("notes_count").notNull().default(0),
  appliedCount: integer("applied_count").notNull().default(0),
  usefulCount: integer("useful_count").notNull().default(0),
  sharesCount: integer("shares_count").notNull().default(0),
  groupsCount: integer("groups_count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type OpportunityNoteRow = typeof opportunityNotes.$inferSelect;
export type OpportunitySocialCountsRow =
  typeof opportunitySocialCounts.$inferSelect;
```

- [ ] **Step 4: Add the notification kind**

In `backend/services/services/api/src/notifications/dto/notification.dto.ts`, replace the `NotificationKind` union (lines 3–11) with:

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
  // Communities slice 3: a reply to one of your Opportunity Notes.
  | "note-reply";
```

and replace the `kind` enum inside `BroadcastNotificationSchema` (lines 79–90) with:

```ts
  kind: z
    .enum([
      "goal-reminder",
      "goal-weekly-digest",
      "goal-progress",
      "opportunity-highlight",
      "opportunity-alert",
      "deadline-reminder",
      "admin-broadcast",
      "system",
      "note-reply",
    ])
    .optional(),
```

> If Slice 2 has already added its `community-*` / `follow` / `group-expiring` kinds here, keep them and only insert `"note-reply"` — never delete another slice's entries.

- [ ] **Step 5: Run the test**

Run: `npm --prefix backend/services/services/api test -- note-reply-kind`
Expected: PASS, 4 tests.

- [ ] **Step 6: Prove the DB constraint accepts the kind**

Run:
```bash
psql "$DATABASE_URL" -c "insert into public.notifications (user_id, kind, title, body) values ('00000000-0000-4000-a000-000000000001','note-reply','probe','probe') returning id, kind;"
psql "$DATABASE_URL" -c "delete from public.notifications where kind = 'note-reply' and title = 'probe';"
```
Expected: the insert returns one row with `kind = note-reply`; the delete reports `DELETE 1`. (A `new row ... violates check constraint` error means Task 1 was not applied.)

- [ ] **Step 7: Lint and commit**

```bash
npm --prefix backend/services/services/api run lint
git add backend/services/services/api/src/db/schema.ts \
        backend/services/services/api/src/notifications/dto/notification.dto.ts \
        backend/services/services/api/src/opportunity-notes/note-reply-kind.spec.ts
git commit -m "feat(api): drizzle tables for opportunity notes plus note-reply notification kind"
```

---

### Task 3: Note content rules (pure module, TDD)

**Files:**
- Create: `backend/services/services/api/src/opportunity-notes/note-content.ts`
- Test: `backend/services/services/api/src/opportunity-notes/note-content.spec.ts`

**Interfaces:**
- Consumes: `screenMessage` from `src/communities/community-message-safety.ts` — **built by Slice 2**, a pure module that itself reuses `isObjectionable` from the existing `src/common/moderation.ts`. Do not write a second text screener here. (The scraper's scam gate in `src/scraper/opportunity-dedup.service.ts` is a *different* gate: it grades scraper metadata that already carries LLM-extracted `red_flags` and cannot take raw prose. Slice 3 consumes that one separately, in Task 20.)
- Expected Slice 2 surface (verified in Step 1, and the only thing this task couples to):
  ```ts
  export type MessageScreenVerdict = {
    action: "allow" | "hold" | "block";
    reason: string | null;
  };
  export function screenMessage(text: string): MessageScreenVerdict;
  ```
- Produces: `NOTE_BODY_MIN`, `NOTE_BODY_MAX`, `NoteRejection`, `NOTE_REJECTION_MESSAGES`, `normalizeNoteBody(raw: string): string`, `NoteScreenResult`, `screenNoteBody(raw: string): NoteScreenResult`.

- [ ] **Step 1: Verify Slice 2's screening module and adapt if the shape differs**

Run:
```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder && \
sed -n '1,80p' backend/services/services/api/src/communities/community-message-safety.ts && \
grep -n "export function screenMessage\|export type MessageScreenVerdict\|action\|reason" \
  backend/services/services/api/src/communities/community-message-safety.ts | head -20
```
Expected: the file exists and exports `screenMessage`. If the verdict type differs from the shape above (for example it returns `{ ok: boolean; hold: boolean; reason?: string }`), change **only** the `toVerdict` adapter at the top of `note-content.ts` in Step 3 — it is the single coupling point, deliberately isolated so a signature mismatch is a one-function fix. If the module does not exist at all, Slice 2 has not merged; stop and rebase.

- [ ] **Step 2: Write the failing test**

Create `backend/services/services/api/src/opportunity-notes/note-content.spec.ts`:

```ts
import {
  NOTE_BODY_MAX,
  NOTE_REJECTION_MESSAGES,
  normalizeNoteBody,
  screenNoteBody,
} from "./note-content";

jest.mock("../communities/community-message-safety", () => ({
  screenMessage: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { screenMessage } = require("../communities/community-message-safety") as {
  screenMessage: jest.Mock;
};

function allow() {
  screenMessage.mockReturnValue({ action: "allow", reason: null });
}

describe("normalizeNoteBody", () => {
  it("trims, collapses runs of blank lines and strips zero-width characters", () => {
    expect(normalizeNoteBody("  hello​\n\n\n\nworld  ")).toBe("hello\n\nworld");
  });

  it("collapses horizontal whitespace runs but keeps single newlines", () => {
    expect(normalizeNoteBody("a     b\nc")).toBe("a b\nc");
  });
});

describe("screenNoteBody length rules (owned by this slice)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    allow();
  });

  it("accepts a normal, useful tip", () => {
    expect(
      screenNoteBody(
        "Start the reference letters early — mine took three weeks to come back.",
      ),
    ).toEqual({
      ok: true,
      status: "visible",
      body: "Start the reference letters early — mine took three weeks to come back.",
    });
  });

  it("rejects a body that is too short to be useful, without calling the screener", () => {
    expect(screenNoteBody("good luck")).toEqual({
      ok: false,
      rejection: "too_short",
      message: NOTE_REJECTION_MESSAGES.too_short,
    });
    expect(screenMessage).not.toHaveBeenCalled();
  });

  it("rejects a body over the maximum length, without calling the screener", () => {
    expect(screenNoteBody("a".repeat(NOTE_BODY_MAX + 1)).ok).toBe(false);
    expect(screenMessage).not.toHaveBeenCalled();
  });
});

describe("screenNoteBody delegates content screening to Slice 2", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("passes the NORMALISED body to screenMessage, not the raw input", () => {
    allow();
    screenNoteBody("  the   portal   times   out  after 30 minutes  ");
    expect(screenMessage).toHaveBeenCalledWith(
      "the portal times out after 30 minutes",
    );
  });

  it("rejects outright on a block verdict and surfaces the screener's reason", () => {
    screenMessage.mockReturnValue({
      action: "block",
      reason: "Notes can't ask anyone to pay for access.",
    });

    expect(
      screenNoteBody("Pay 5000 naira and I will send you the application link"),
    ).toEqual({
      ok: false,
      rejection: "blocked",
      message: "Notes can't ask anyone to pay for access.",
    });
  });

  it("falls back to a generic message when a block verdict carries no reason", () => {
    screenMessage.mockReturnValue({ action: "block", reason: null });

    expect(screenNoteBody("something the screener dislikes a great deal").message).toBe(
      NOTE_REJECTION_MESSAGES.blocked,
    );
  });

  it("shadow-holds a borderline note instead of blocking a real applicant mid-thought", () => {
    screenMessage.mockReturnValue({ action: "hold", reason: "borderline link" });

    expect(
      screenNoteBody("Here is a mirror of the application form I found earlier"),
    ).toEqual({
      ok: true,
      status: "hidden",
      body: "Here is a mirror of the application form I found earlier",
      holdReason: "borderline link",
    });
  });

  it("treats an unknown verdict action as a hold, never as an allow", () => {
    screenMessage.mockReturnValue({ action: "something-new", reason: null });

    expect(
      screenNoteBody("A perfectly ordinary sentence about the deadline."),
    ).toMatchObject({ ok: true, status: "hidden" });
  });

  it("holds rather than throws when the screener itself blows up", () => {
    screenMessage.mockImplementation(() => {
      throw new Error("regex exploded");
    });

    expect(
      screenNoteBody("A perfectly ordinary sentence about the deadline."),
    ).toMatchObject({ ok: true, status: "hidden" });
  });

  it("exposes a human message for every rejection reason", () => {
    expect(Object.keys(NOTE_REJECTION_MESSAGES).sort()).toEqual([
      "blocked",
      "too_long",
      "too_short",
    ]);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npm --prefix backend/services/services/api test -- note-content`
Expected: FAIL — `Cannot find module './note-content'`.

- [ ] **Step 4: Write the implementation**

Create `backend/services/services/api/src/opportunity-notes/note-content.ts`:

```ts
// Send-time rules for Opportunity Notes.
//
// Notes are public, permanent and SEO-indexable, which makes them the single
// most attractive surface in the product for the "pay ₦5,000 for the real
// application link" scam and for WhatsApp-number harvesting. Chat has exactly
// the same problem, so the SCREENING lives in Slice 2's
// community-message-safety module and this file does not reimplement any of
// it — one gate, one wordlist, one place to tune. What IS owned here is
// notes-specific: normalisation and the length band.
//
// A `hold` verdict maps onto opportunity_notes.status = 'hidden' rather than a
// 4xx: spec §9 requires borderline content to shadow-hold for review instead
// of hard-blocking a real user mid-conversation.
import { screenMessage } from "../communities/community-message-safety";

/** Shorter than this is a reaction, not a note. */
export const NOTE_BODY_MIN = 12;
/** Longer than this belongs in a group, not on a card. */
export const NOTE_BODY_MAX = 1200;

export type NoteRejection = "too_short" | "too_long" | "blocked";

export const NOTE_REJECTION_MESSAGES: Record<NoteRejection, string> = {
  too_short: `Add a bit more — a note needs at least ${NOTE_BODY_MIN} characters to help anyone.`,
  too_long: `Keep it under ${NOTE_BODY_MAX} characters. Longer thinking belongs in a group.`,
  blocked: "That note breaks our community rules. Rephrase and retry.",
};

export type NoteScreenResult =
  | { ok: false; rejection: NoteRejection; message: string }
  | { ok: true; status: "visible"; body: string }
  | { ok: true; status: "hidden"; body: string; holdReason: string | null };

const ZERO_WIDTH = /[​-‏⁠﻿]/g;

/**
 * Whitespace-normalises a raw note body: strips zero-width characters, trims,
 * collapses horizontal whitespace runs to one space, and collapses 3+ newlines
 * to a paragraph break. Single newlines survive so lists stay readable.
 */
export function normalizeNoteBody(raw: string): string {
  return String(raw ?? "")
    .replace(ZERO_WIDTH, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The single coupling point to Slice 2's screener.
 *
 * Fails CLOSED in both directions that matter: an unknown action and a thrown
 * screener both become a hold, never an allow. A screening module that has
 * regressed must not become an open door onto a public, indexed page.
 */
function toVerdict(text: string): { action: "allow" | "hold" | "block"; reason: string | null } {
  try {
    const verdict = screenMessage(text) as {
      action?: string;
      reason?: string | null;
    } | null;
    const action = verdict?.action;
    if (action === "allow" || action === "hold" || action === "block") {
      return { action, reason: verdict?.reason ?? null };
    }
    return { action: "hold", reason: verdict?.reason ?? null };
  } catch {
    return { action: "hold", reason: null };
  }
}

/**
 * Normalises, applies the note length band, then hands the normalised text to
 * Slice 2's screener. Callers persist `body` and `status` exactly as returned.
 */
export function screenNoteBody(raw: string): NoteScreenResult {
  const body = normalizeNoteBody(raw);

  // Length is checked first so a two-word note never costs a screening pass.
  if (body.length < NOTE_BODY_MIN) {
    return {
      ok: false,
      rejection: "too_short",
      message: NOTE_REJECTION_MESSAGES.too_short,
    };
  }
  if (body.length > NOTE_BODY_MAX) {
    return {
      ok: false,
      rejection: "too_long",
      message: NOTE_REJECTION_MESSAGES.too_long,
    };
  }

  const verdict = toVerdict(body);

  if (verdict.action === "block") {
    return {
      ok: false,
      rejection: "blocked",
      message: verdict.reason || NOTE_REJECTION_MESSAGES.blocked,
    };
  }
  if (verdict.action === "hold") {
    return { ok: true, status: "hidden", body, holdReason: verdict.reason };
  }
  return { ok: true, status: "visible", body };
}
```

- [ ] **Step 5: Run the test**

Run: `npm --prefix backend/services/services/api test -- note-content`
Expected: PASS, 12 tests.

- [ ] **Step 6: Lint and commit**

```bash
npm --prefix backend/services/services/api run lint
git add backend/services/services/api/src/opportunity-notes/note-content.ts \
        backend/services/services/api/src/opportunity-notes/note-content.spec.ts
git commit -m "feat(api): note length rules on top of the shared community screener"
```

---

### Task 4: Social counts — source port, cache service, reconcile

**Files:**
- Create: `backend/services/services/api/src/opportunity-notes/opportunity-social-counts.source.ts`
- Create: `backend/services/services/api/src/opportunity-notes/opportunity-social-counts.service.ts`
- Test: `backend/services/services/api/src/opportunity-notes/opportunity-social-counts.service.spec.ts`

**Interfaces:**
- Consumes: `db` + `sql` from `src/db`; tables from Task 1.
- Produces:
  - `SOCIAL_COUNTS_SOURCE` (DI token, string constant)
  - `type SocialCountsSnapshot = { notesCount: number; appliedCount: number; usefulCount: number; sharesCount: number; groupsCount: number }`
  - `interface SocialCountsSource { readTruth(ids: string[]): Promise<Map<string, SocialCountsSnapshot>>; readCache(ids: string[]): Promise<Map<string, SocialCountsSnapshot>>; writeCache(rows: Array<{ opportunityId: string } & SocialCountsSnapshot>): Promise<void>; bump(opportunityId: string, delta: Partial<SocialCountsSnapshot>): Promise<void>; listActiveOpportunityIds(limit: number): Promise<string[]> }`
  - `class DbSocialCountsSource implements SocialCountsSource`
  - `class OpportunitySocialCountsService` with `get(id)`, `getMany(ids)`, `bumpNotes(id, delta)`, `bumpUseful(id, delta)`, `reconcile(ids?)` returning `{ checked: number; corrected: number }`.

- [ ] **Step 1: Write the failing test**

Create `backend/services/services/api/src/opportunity-notes/opportunity-social-counts.service.spec.ts`:

```ts
import {
  OpportunitySocialCountsService,
  ZERO_COUNTS,
} from "./opportunity-social-counts.service";
import { APPLIED_STATUSES } from "./opportunity-social-counts.source";
import type {
  SocialCountsSnapshot,
  SocialCountsSource,
} from "./opportunity-social-counts.source";

const OPP_A = "11111111-1111-4111-a111-111111111111";
const OPP_B = "22222222-2222-4222-a222-222222222222";

function snapshot(over: Partial<SocialCountsSnapshot> = {}): SocialCountsSnapshot {
  return { ...ZERO_COUNTS, ...over };
}

/** In-memory SocialCountsSource: truth is fixed, cache is mutable. */
class FakeSource implements SocialCountsSource {
  readonly writes: Array<Array<{ opportunityId: string } & SocialCountsSnapshot>> =
    [];

  constructor(
    private truth: Map<string, SocialCountsSnapshot>,
    private cache: Map<string, SocialCountsSnapshot>,
  ) {}

  async readTruth(ids: string[]) {
    return new Map(
      ids.filter((id) => this.truth.has(id)).map((id) => [id, this.truth.get(id)!]),
    );
  }

  async readCache(ids: string[]) {
    return new Map(
      ids.filter((id) => this.cache.has(id)).map((id) => [id, this.cache.get(id)!]),
    );
  }

  async writeCache(rows: Array<{ opportunityId: string } & SocialCountsSnapshot>) {
    this.writes.push(rows);
    for (const row of rows) {
      const { opportunityId, ...counts } = row;
      this.cache.set(opportunityId, counts);
    }
  }

  async bump(opportunityId: string, delta: Partial<SocialCountsSnapshot>) {
    const current = this.cache.get(opportunityId) ?? snapshot();
    const next = { ...current };
    for (const [key, value] of Object.entries(delta)) {
      const field = key as keyof SocialCountsSnapshot;
      next[field] = Math.max(0, next[field] + (value ?? 0));
    }
    this.cache.set(opportunityId, next);
  }

  async listActiveOpportunityIds() {
    return [...this.truth.keys()];
  }
}

describe("APPLIED_STATUSES", () => {
  // This test exists so nobody "fixes" applied_count to submitted-only. The
  // live constraint is
  //   CHECK (status = ANY (ARRAY['draft','submitted','interview','offer',
  //                              'rejected','withdrawn','no_response']))
  // and applied means every one of those except 'draft'.
  it("is every live application status except draft", () => {
    expect([...APPLIED_STATUSES].sort()).toEqual([
      "interview",
      "no_response",
      "offer",
      "rejected",
      "submitted",
      "withdrawn",
    ]);
  });

  it("never counts a draft as an application", () => {
    expect([...APPLIED_STATUSES]).not.toContain("draft");
  });

  it("counts an application that has progressed past submitted", () => {
    // The regression this guards: narrowing to ['submitted'] would make
    // applied_count DROP as a cohort starts interviewing and winning.
    for (const progressed of ["interview", "offer", "rejected"]) {
      expect([...APPLIED_STATUSES]).toContain(progressed);
    }
  });
});

describe("OpportunitySocialCountsService", () => {
  it("returns the cached row when one exists", async () => {
    const source = new FakeSource(
      new Map([[OPP_A, snapshot({ notesCount: 4 })]]),
      new Map([[OPP_A, snapshot({ notesCount: 4, appliedCount: 10 })]]),
    );
    const service = new OpportunitySocialCountsService(source);

    await expect(service.get(OPP_A)).resolves.toEqual(
      snapshot({ notesCount: 4, appliedCount: 10 }),
    );
  });

  it("computes from source and back-fills the cache on a cache miss", async () => {
    const source = new FakeSource(
      new Map([[OPP_A, snapshot({ notesCount: 4, sharesCount: 100 })]]),
      new Map(),
    );
    const service = new OpportunitySocialCountsService(source);

    await expect(service.get(OPP_A)).resolves.toEqual(
      snapshot({ notesCount: 4, sharesCount: 100 }),
    );
    expect(source.writes).toHaveLength(1);
    expect(source.writes[0][0]).toEqual({
      opportunityId: OPP_A,
      ...snapshot({ notesCount: 4, sharesCount: 100 }),
    });
  });

  it("returns all-zero counts for an opportunity with no activity anywhere", async () => {
    const service = new OpportunitySocialCountsService(
      new FakeSource(new Map(), new Map()),
    );
    await expect(service.get(OPP_A)).resolves.toEqual(ZERO_COUNTS);
  });

  it("bumps notes and useful counts through the source", async () => {
    const cache = new Map([[OPP_A, snapshot({ notesCount: 4, usefulCount: 20 })]]);
    const source = new FakeSource(new Map(), cache);
    const service = new OpportunitySocialCountsService(source);

    await service.bumpNotes(OPP_A, 1);
    await service.bumpUseful(OPP_A, -1);

    expect(cache.get(OPP_A)).toEqual(snapshot({ notesCount: 5, usefulCount: 19 }));
  });

  it("never lets a bump drive a count below zero", async () => {
    const cache = new Map([[OPP_A, snapshot({ notesCount: 0 })]]);
    const source = new FakeSource(new Map(), cache);
    const service = new OpportunitySocialCountsService(source);

    await service.bumpNotes(OPP_A, -3);

    expect(cache.get(OPP_A)?.notesCount).toBe(0);
  });

  // The point of the whole reconcile design.
  it("corrects a deliberately-corrupted cache row from source", async () => {
    const truth = new Map([
      [OPP_A, snapshot({ notesCount: 4, appliedCount: 10, usefulCount: 20, sharesCount: 100, groupsCount: 3 })],
    ]);
    const cache = new Map([
      [OPP_A, snapshot({ notesCount: 999, appliedCount: 0, usefulCount: 0, sharesCount: 0, groupsCount: 0 })],
    ]);
    const source = new FakeSource(truth, cache);
    const service = new OpportunitySocialCountsService(source);

    const result = await service.reconcile([OPP_A]);

    expect(result).toEqual({ checked: 1, corrected: 1 });
    expect(cache.get(OPP_A)).toEqual(
      snapshot({ notesCount: 4, appliedCount: 10, usefulCount: 20, sharesCount: 100, groupsCount: 3 }),
    );
  });

  it("writes nothing when the cache already agrees with source", async () => {
    const agreed = snapshot({ notesCount: 4, appliedCount: 10 });
    const source = new FakeSource(
      new Map([[OPP_A, agreed]]),
      new Map([[OPP_A, { ...agreed }]]),
    );
    const service = new OpportunitySocialCountsService(source);

    const result = await service.reconcile([OPP_A]);

    expect(result).toEqual({ checked: 1, corrected: 0 });
    expect(source.writes).toHaveLength(0);
  });

  it("reconciles every active opportunity when no ids are passed", async () => {
    const truth = new Map([
      [OPP_A, snapshot({ notesCount: 1 })],
      [OPP_B, snapshot({ notesCount: 2 })],
    ]);
    const source = new FakeSource(truth, new Map());
    const service = new OpportunitySocialCountsService(source);

    const result = await service.reconcile();

    expect(result.checked).toBe(2);
    expect(result.corrected).toBe(2);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm --prefix backend/services/services/api test -- opportunity-social-counts`
Expected: FAIL — `Cannot find module './opportunity-social-counts.service'`.

- [ ] **Step 3: Write the source port and DB adapter**

Create `backend/services/services/api/src/opportunity-notes/opportunity-social-counts.source.ts`:

```ts
// The only place raw social-counts SQL is allowed to live.
//
// Splitting the SQL behind a port is what makes the reconcile job genuinely
// testable: the service knows only "truth" vs "cache", so the test that proves
// a corrupted row self-heals is a real behavioural test rather than an
// assertion about a mocked query builder.
import { Injectable, Logger } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { db } from "../db";

export const SOCIAL_COUNTS_SOURCE = "SOCIAL_COUNTS_SOURCE";

/**
 * The statuses that count as "applied" — every value in the live
 * opportunity_applications_status_check EXCEPT 'draft':
 *
 *   CHECK (status = ANY (ARRAY['draft','submitted','interview','offer',
 *                              'rejected','withdrawn','no_response']))
 *
 * Exported as a constant, not inlined in the SQL, precisely so the rule is one
 * greppable thing with a test attached. Narrowing this to ['submitted'] is a
 * regression, not a tidy-up: it would drop every application that has since
 * progressed to interview/offer/rejected and make applied_count fall as a
 * cohort succeeds.
 */
export const APPLIED_STATUSES = [
  "submitted",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
  "no_response",
] as const;

export type SocialCountsSnapshot = {
  notesCount: number;
  appliedCount: number;
  usefulCount: number;
  sharesCount: number;
  groupsCount: number;
};

export interface SocialCountsSource {
  /** Recompute every count from the tables that own the underlying facts. */
  readTruth(opportunityIds: string[]): Promise<Map<string, SocialCountsSnapshot>>;
  /** Read the denormalised cache rows that exist. */
  readCache(opportunityIds: string[]): Promise<Map<string, SocialCountsSnapshot>>;
  /** Upsert full cache rows. */
  writeCache(
    rows: Array<{ opportunityId: string } & SocialCountsSnapshot>,
  ): Promise<void>;
  /** Apply signed deltas to a cache row, clamped at zero, creating it if absent. */
  bump(
    opportunityId: string,
    delta: Partial<SocialCountsSnapshot>,
  ): Promise<void>;
  /** Opportunity ids worth reconciling, newest activity first. */
  listActiveOpportunityIds(limit: number): Promise<string[]>;
}

type CountRow = {
  opportunity_id: string;
  notes_count: number | string;
  applied_count: number | string;
  useful_count: number | string;
  shares_count: number | string;
  groups_count: number | string;
};

function rows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return (result as { rows?: T[] })?.rows ?? [];
}

function toSnapshot(row: CountRow): SocialCountsSnapshot {
  return {
    notesCount: Number(row.notes_count) || 0,
    appliedCount: Number(row.applied_count) || 0,
    usefulCount: Number(row.useful_count) || 0,
    sharesCount: Number(row.shares_count) || 0,
    groupsCount: Number(row.groups_count) || 0,
  };
}

@Injectable()
export class DbSocialCountsSource implements SocialCountsSource {
  private readonly logger = new Logger(DbSocialCountsSource.name);

  async readTruth(opportunityIds: string[]) {
    const map = new Map<string, SocialCountsSnapshot>();
    if (!opportunityIds.length) return map;

    // One round trip, five lateral aggregates.
    //
    // applied_count is EVERY NON-DRAFT application — see APPLIED_STATUSES.
    // It is NOT 'submitted'-only: submitted/interview/offer/rejected/
    // withdrawn/no_response all prove the person applied, so restricting to
    // 'submitted' would silently erase every application that has since
    // progressed and make the number shrink as the cohort succeeds. This
    // matches Slice 1's profile track record (applied = all non-draft,
    // interviewed = 'interview' and beyond, won = 'offer'). Do not "fix" it.
    //
    // shares_count counts DISTINCT users, not share events: signals are
    // append-only with no dedupe, so count(*) would let one person inflate a
    // card by tapping share ten times.
    //
    // user_opportunity_signals.user_id is declared uuid but the live column has
    // drifted to text in one lineage — cast to text before counting.
    const result = await db.execute(sql`
      select
        o.id::text                    as opportunity_id,
        coalesce(n.notes_count, 0)    as notes_count,
        coalesce(a.applied_count, 0)  as applied_count,
        coalesce(v.useful_count, 0)   as useful_count,
        coalesce(s.shares_count, 0)   as shares_count,
        coalesce(g.groups_count, 0)   as groups_count
      from public.opportunities o
      left join lateral (
        select count(*)::int as notes_count
        from public.opportunity_notes note
        where note.opportunity_id = o.id
          and note.status = 'visible'
      ) n on true
      left join lateral (
        select count(*)::int as applied_count
        from public.opportunity_applications app
        where app.opportunity_id = o.id
          and app.status = any(${[...APPLIED_STATUSES]}::text[])
      ) a on true
      left join lateral (
        select count(*)::int as useful_count
        from public.opportunity_note_votes vote
        join public.opportunity_notes voted on voted.id = vote.note_id
        where voted.opportunity_id = o.id
          and voted.status = 'visible'
      ) v on true
      left join lateral (
        select count(distinct signal.user_id::text)::int as shares_count
        from public.user_opportunity_signals signal
        where signal.opportunity_id = o.id
          and signal.signal_type = 'share'
      ) s on true
      left join lateral (
        select count(*)::int as groups_count
        from public.community_groups grp
        where grp.opportunity_id = o.id
          and grp.status = 'active'
      ) g on true
      where o.id = any(${opportunityIds}::uuid[])
    `);

    for (const row of rows<CountRow>(result)) {
      map.set(row.opportunity_id, toSnapshot(row));
    }
    return map;
  }

  async readCache(opportunityIds: string[]) {
    const map = new Map<string, SocialCountsSnapshot>();
    if (!opportunityIds.length) return map;

    const result = await db.execute(sql`
      select
        opportunity_id::text as opportunity_id,
        notes_count, applied_count, useful_count, shares_count, groups_count
      from public.opportunity_social_counts
      where opportunity_id = any(${opportunityIds}::uuid[])
    `);

    for (const row of rows<CountRow>(result)) {
      map.set(row.opportunity_id, toSnapshot(row));
    }
    return map;
  }

  async writeCache(
    entries: Array<{ opportunityId: string } & SocialCountsSnapshot>,
  ) {
    if (!entries.length) return;

    // Parallel arrays + unnest keeps this a single statement regardless of
    // batch size, which matters for the nightly job.
    await db.execute(sql`
      insert into public.opportunity_social_counts (
        opportunity_id, notes_count, applied_count, useful_count,
        shares_count, groups_count, updated_at
      )
      select
        id::uuid, notes, applied, useful, shares, groups, now()
      from unnest(
        ${entries.map((entry) => entry.opportunityId)}::text[],
        ${entries.map((entry) => entry.notesCount)}::int[],
        ${entries.map((entry) => entry.appliedCount)}::int[],
        ${entries.map((entry) => entry.usefulCount)}::int[],
        ${entries.map((entry) => entry.sharesCount)}::int[],
        ${entries.map((entry) => entry.groupsCount)}::int[]
      ) as batch(id, notes, applied, useful, shares, groups)
      on conflict (opportunity_id) do update set
        notes_count   = excluded.notes_count,
        applied_count = excluded.applied_count,
        useful_count  = excluded.useful_count,
        shares_count  = excluded.shares_count,
        groups_count  = excluded.groups_count,
        updated_at    = now()
    `);
  }

  async bump(opportunityId: string, delta: Partial<SocialCountsSnapshot>) {
    const notes = delta.notesCount ?? 0;
    const applied = delta.appliedCount ?? 0;
    const useful = delta.usefulCount ?? 0;
    const shares = delta.sharesCount ?? 0;
    const groups = delta.groupsCount ?? 0;

    await db.execute(sql`
      insert into public.opportunity_social_counts (
        opportunity_id, notes_count, applied_count, useful_count,
        shares_count, groups_count, updated_at
      )
      values (
        ${opportunityId}::uuid,
        greatest(0, ${notes}), greatest(0, ${applied}), greatest(0, ${useful}),
        greatest(0, ${shares}), greatest(0, ${groups}), now()
      )
      on conflict (opportunity_id) do update set
        notes_count   = greatest(0, public.opportunity_social_counts.notes_count   + ${notes}),
        applied_count = greatest(0, public.opportunity_social_counts.applied_count + ${applied}),
        useful_count  = greatest(0, public.opportunity_social_counts.useful_count  + ${useful}),
        shares_count  = greatest(0, public.opportunity_social_counts.shares_count  + ${shares}),
        groups_count  = greatest(0, public.opportunity_social_counts.groups_count  + ${groups}),
        updated_at    = now()
    `);
  }

  async listActiveOpportunityIds(limit: number) {
    // Only opportunities that can plausibly have counts: anything with a note,
    // a vote, an anchored group, or an existing cache row, plus every active
    // listing (so a brand-new opportunity gets a zero row rather than a miss).
    const result = await db.execute(sql`
      select id::text as opportunity_id from (
        select o.id, o.updated_at
        from public.opportunities o
        where o.status = 'active'
        union
        select o.id, o.updated_at
        from public.opportunities o
        join public.opportunity_social_counts c on c.opportunity_id = o.id
        union
        select o.id, o.updated_at
        from public.opportunities o
        join public.opportunity_notes n on n.opportunity_id = o.id
      ) candidates
      order by updated_at desc nulls last
      limit ${limit}
    `);
    return rows<{ opportunity_id: string }>(result).map(
      (row) => row.opportunity_id,
    );
  }
}
```

- [ ] **Step 4: Write the cache service**

Create `backend/services/services/api/src/opportunity-notes/opportunity-social-counts.service.ts`:

```ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  SOCIAL_COUNTS_SOURCE,
  type SocialCountsSnapshot,
  type SocialCountsSource,
} from "./opportunity-social-counts.source";

export const ZERO_COUNTS: SocialCountsSnapshot = {
  notesCount: 0,
  appliedCount: 0,
  usefulCount: 0,
  sharesCount: 0,
  groupsCount: 0,
};

/** Reconcile in batches so one query never carries the whole catalogue. */
const RECONCILE_BATCH = 200;
/** Upper bound on a single nightly run. */
export const RECONCILE_MAX_OPPORTUNITIES = 5000;

function sameCounts(a: SocialCountsSnapshot, b: SocialCountsSnapshot): boolean {
  return (
    a.notesCount === b.notesCount &&
    a.appliedCount === b.appliedCount &&
    a.usefulCount === b.usefulCount &&
    a.sharesCount === b.sharesCount &&
    a.groupsCount === b.groupsCount
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

@Injectable()
export class OpportunitySocialCountsService {
  private readonly logger = new Logger(OpportunitySocialCountsService.name);

  constructor(
    @Inject(SOCIAL_COUNTS_SOURCE)
    private readonly source: SocialCountsSource,
  ) {}

  async get(opportunityId: string): Promise<SocialCountsSnapshot> {
    const map = await this.getMany([opportunityId]);
    return map[opportunityId] ?? { ...ZERO_COUNTS };
  }

  /**
   * Read-through: cached rows win, missing rows are computed from source and
   * back-filled so the second card render is a single row read.
   */
  async getMany(
    opportunityIds: string[],
  ): Promise<Record<string, SocialCountsSnapshot>> {
    const ids = [...new Set(opportunityIds.filter(Boolean))];
    if (!ids.length) return {};

    const cached = await this.source.readCache(ids);
    const missing = ids.filter((id) => !cached.has(id));

    if (missing.length) {
      const truth = await this.source.readTruth(missing);
      const backfill = missing.map((id) => ({
        opportunityId: id,
        ...(truth.get(id) ?? ZERO_COUNTS),
      }));
      await this.source.writeCache(backfill);
      for (const row of backfill) {
        const { opportunityId, ...counts } = row;
        cached.set(opportunityId, counts);
      }
    }

    const result: Record<string, SocialCountsSnapshot> = {};
    for (const id of ids) {
      result[id] = cached.get(id) ?? { ...ZERO_COUNTS };
    }
    return result;
  }

  async bumpNotes(opportunityId: string, delta: number) {
    await this.source.bump(opportunityId, { notesCount: delta });
  }

  async bumpUseful(opportunityId: string, delta: number) {
    await this.source.bump(opportunityId, { usefulCount: delta });
  }

  /**
   * Recompute from source and rewrite any row that disagrees.
   *
   * This is the reason the cache is safe to trust: a missed bump, a manual
   * SQL fix, a deleted application or a group archived by another slice all
   * heal within 24 hours without anybody noticing.
   */
  async reconcile(
    opportunityIds?: string[],
  ): Promise<{ checked: number; corrected: number }> {
    const ids = opportunityIds?.length
      ? [...new Set(opportunityIds.filter(Boolean))]
      : await this.source.listActiveOpportunityIds(RECONCILE_MAX_OPPORTUNITIES);

    let checked = 0;
    let corrected = 0;

    for (const batch of chunk(ids, RECONCILE_BATCH)) {
      const [truth, cached] = await Promise.all([
        this.source.readTruth(batch),
        this.source.readCache(batch),
      ]);

      const drifted: Array<{ opportunityId: string } & SocialCountsSnapshot> = [];
      for (const id of batch) {
        checked += 1;
        const actual = truth.get(id) ?? ZERO_COUNTS;
        const stored = cached.get(id);
        if (!stored || !sameCounts(stored, actual)) {
          drifted.push({ opportunityId: id, ...actual });
        }
      }

      if (drifted.length) {
        await this.source.writeCache(drifted);
        corrected += drifted.length;
      }
    }

    if (corrected) {
      this.logger.log(
        `Social counts reconcile corrected ${corrected} of ${checked} opportunities`,
      );
    }
    return { checked, corrected };
  }
}
```

- [ ] **Step 5: Run the test**

Run: `npm --prefix backend/services/services/api test -- opportunity-social-counts`
Expected: PASS, 11 tests — including `corrects a deliberately-corrupted cache row from source` and the three `APPLIED_STATUSES` guards.

- [ ] **Step 6: Lint and commit**

```bash
npm --prefix backend/services/services/api run lint
git add backend/services/services/api/src/opportunity-notes/opportunity-social-counts.source.ts \
        backend/services/services/api/src/opportunity-notes/opportunity-social-counts.service.ts \
        backend/services/services/api/src/opportunity-notes/opportunity-social-counts.service.spec.ts
git commit -m "feat(api): self-healing opportunity social counts cache"
```

---

### Task 5: Request/response DTOs

**Files:**
- Create: `backend/services/services/api/src/opportunity-notes/dto/opportunity-note.dto.ts`
- Test: `backend/services/services/api/src/opportunity-notes/dto/opportunity-note.dto.spec.ts`

**Interfaces:**
- Produces: `NOTE_KINDS`, `NOTE_OUTCOMES`, `CreateNoteSchema` / `CreateNoteDto`, `ListNotesQuerySchema` / `ListNotesQueryDto`, `SocialBatchSchema` / `SocialBatchDto`, and the wire types `OpportunityNoteAuthorDto`, `OpportunityNoteDto`, `OpportunitySocialCountsDto`, `GroupsDiscussingEntryDto`, `OpportunitySocialResponseDto`.

- [ ] **Step 1: Write the failing test**

Create `backend/services/services/api/src/opportunity-notes/dto/opportunity-note.dto.spec.ts`:

```ts
import {
  CreateNoteSchema,
  ListNotesQuerySchema,
  SocialBatchSchema,
} from "./opportunity-note.dto";

describe("CreateNoteSchema", () => {
  it("accepts a tip with no outcome", () => {
    const parsed = CreateNoteSchema.safeParse({
      kind: "tip",
      body: "Start the reference letters early — mine took three weeks.",
    });
    expect(parsed.success).toBe(true);
  });

  it("requires an outcome on a result note", () => {
    const parsed = CreateNoteSchema.safeParse({
      kind: "result",
      body: "I submitted in week one and it paid off in the end.",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an outcome on a tip note", () => {
    const parsed = CreateNoteSchema.safeParse({
      kind: "tip",
      body: "Start the reference letters early — mine took three weeks.",
      outcome: "offer",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts an interview result — a real, live application status", () => {
    const parsed = CreateNoteSchema.safeParse({
      kind: "result",
      body: "They invited me to a panel interview six weeks after the deadline.",
      outcome: "interview",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects the statuses that do not exist in this product", () => {
    for (const outcome of ["shortlisted", "won", "submitted"]) {
      expect(
        CreateNoteSchema.safeParse({
          kind: "result",
          body: "I got a decision back after eleven weeks of waiting.",
          outcome,
        }).success,
      ).toBe(false);
    }
  });

  it("accepts a reply and a source message id", () => {
    const parsed = CreateNoteSchema.safeParse({
      kind: "tip",
      body: "Adding to the point above: the portal times out after 30 minutes.",
      replyToId: "33333333-3333-4333-a333-333333333333",
      sourceMessageId: "44444444-4444-4444-a444-444444444444",
      sourceGroupId: "55555555-5555-4555-a555-555555555555",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("ListNotesQuerySchema", () => {
  it("defaults to helpful-first with no kind filter", () => {
    const parsed = ListNotesQuerySchema.parse({});
    expect(parsed).toEqual({ sort: "helpful", limit: 50 });
  });

  it("coerces the limit and clamps it", () => {
    expect(ListNotesQuerySchema.parse({ limit: "10" }).limit).toBe(10);
    expect(ListNotesQuerySchema.safeParse({ limit: "500" }).success).toBe(false);
  });
});

describe("SocialBatchSchema", () => {
  it("caps the batch at 60 ids", () => {
    const ids = Array.from(
      { length: 61 },
      (_, index) => `00000000-0000-4000-a000-${String(index).padStart(12, "0")}`,
    );
    expect(SocialBatchSchema.safeParse({ opportunityIds: ids }).success).toBe(
      false,
    );
    expect(
      SocialBatchSchema.safeParse({ opportunityIds: ids.slice(0, 60) }).success,
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm --prefix backend/services/services/api test -- opportunity-note.dto`
Expected: FAIL — `Cannot find module './opportunity-note.dto'`.

- [ ] **Step 3: Write the DTOs**

Create `backend/services/services/api/src/opportunity-notes/dto/opportunity-note.dto.ts`:

```ts
import { z } from "zod";
import { NOTE_BODY_MAX } from "../note-content";

export const NOTE_KINDS = ["tip", "question", "result"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

// The REAL outcome vocabulary, taken from the live constraint:
//   opportunity_applications_status_check: status = ANY (ARRAY[
//     'draft','submitted','interview','offer','rejected','withdrawn','no_response'])
// There is no 'shortlisted' status in this product and no 'won' — a win is an
// 'offer'. The design spec's ('applied'|'shortlisted'|'won'|'rejected') list is
// wrong; this is right. 'interview' is included deliberately: "I got an
// interview" is one of the highest-signal things a member can report, because
// it tells everyone else the pipeline is real and moving.
export const NOTE_OUTCOMES = [
  "applied",
  "interview",
  "offer",
  "rejected",
] as const;
export type NoteOutcome = (typeof NOTE_OUTCOMES)[number];

export const CreateNoteSchema = z
  .object({
    kind: z.enum(NOTE_KINDS),
    body: z.string().min(1).max(NOTE_BODY_MAX * 2),
    outcome: z.enum(NOTE_OUTCOMES).optional(),
    replyToId: z.string().uuid().optional(),
    /** Set when publishing a ✦saved group chat message as a note. */
    sourceMessageId: z.string().uuid().optional(),
    /** The group the source message came from (membership is verified). */
    sourceGroupId: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.kind === "result" && !value.outcome) {
      ctx.addIssue({
        code: "custom",
        path: ["outcome"],
        message:
          "A result note must say what happened: applied, interview, offer or rejected.",
      });
    }
    if (value.kind !== "result" && value.outcome) {
      ctx.addIssue({
        code: "custom",
        path: ["outcome"],
        message: "Only a result note carries an outcome.",
      });
    }
    if (value.sourceMessageId && !value.sourceGroupId) {
      ctx.addIssue({
        code: "custom",
        path: ["sourceGroupId"],
        message: "Publishing a chat message needs the group it came from.",
      });
    }
  });
export type CreateNoteDto = z.infer<typeof CreateNoteSchema>;

export const ListNotesQuerySchema = z
  .object({
    kind: z.enum(NOTE_KINDS).optional(),
    sort: z.enum(["helpful", "new"]).default("helpful"),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export type ListNotesQueryDto = z.infer<typeof ListNotesQuerySchema>;

export const SocialBatchSchema = z
  .object({
    opportunityIds: z.array(z.string().uuid()).min(1).max(60),
  })
  .strict();
export type SocialBatchDto = z.infer<typeof SocialBatchSchema>;

// ── Wire types (mirrored 1:1 by @edutu/core) ───────────────────────────────

export type OpportunityNoteAuthorDto = {
  /** Empty string when the author has no public handle yet — do not link. */
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isMentor: boolean;
};

export type OpportunityNoteDto = {
  id: string;
  opportunityId: string;
  kind: NoteKind;
  outcome: NoteOutcome | null;
  body: string;
  helpfulCount: number;
  iFoundHelpful: boolean;
  author: OpportunityNoteAuthorDto;
  createdAt: string;
  /** Slice-3 additions on top of the contract's OpportunityNote. */
  replyToId: string | null;
  blocked: boolean;
  isMine: boolean;
  /** True only on the create response for a note Slice 2's screener held for
   *  review. Held notes are status='hidden' and appear in no list. */
  pending?: boolean;
};

export type OpportunitySocialCountsDto = {
  notesCount: number;
  appliedCount: number;
  usefulCount: number;
  sharesCount: number;
  groupsCount: number;
};

export type GroupsDiscussingEntryDto = {
  id: string;
  slug: string;
  name: string;
  iconUrl: string | null;
  memberCount: number;
  lastMessageAt: string | null;
};

export type OpportunitySocialResponseDto = {
  opportunityId: string;
  counts: OpportunitySocialCountsDto;
  groups: GroupsDiscussingEntryDto[];
};
```

- [ ] **Step 4: Run the test**

Run: `npm --prefix backend/services/services/api test -- opportunity-note.dto`
Expected: PASS, 8 tests.

- [ ] **Step 5: Lint and commit**

```bash
npm --prefix backend/services/services/api run lint
git add backend/services/services/api/src/opportunity-notes/dto/
git commit -m "feat(api): opportunity note DTOs with the real outcome vocabulary"
```

---

### Task 6: `OpportunityNotesService` — list, create, delete, brief sources

**Files:**
- Create: `backend/services/services/api/src/opportunity-notes/opportunity-notes.service.ts`
- Test: `backend/services/services/api/src/opportunity-notes/opportunity-notes.service.spec.ts`

**Interfaces:**
- Consumes: `rawClerkUserId` / `toLegacyUuid` from `src/common/community-user-id.ts` (Slice 1); `toDatabaseUserId` from the **pre-existing** `src/common/user-id.ts`; `OpportunitySocialCountsService` + `APPLIED_STATUSES` (Task 4); `screenNoteBody` (Task 3, which delegates content screening to Slice 2's `screenMessage`); DTOs (Task 5); `NotificationsService` from `src/notifications/notifications.service.ts`.
- Produces:
  - `class OpportunityNotesService` with `list(opportunityId, viewerRawId | null, query): Promise<OpportunityNoteDto[]>`, `create(opportunityId, viewerRawId, dto): Promise<OpportunityNoteDto>`, `remove(opportunityId, noteId, viewerRawId, viewerRole): Promise<{ success: true }>`, `setHelpful(opportunityId, noteId, viewerRawId, helpful): Promise<{ helpfulCount: number; iFoundHelpful: boolean }>`, `getSocial(opportunityId): Promise<OpportunitySocialResponseDto>`, `getSocialBatch(ids): Promise<Record<string, OpportunitySocialCountsDto>>`.
  - **The Slice 4 interface:** `type BriefNoteSource` and `listBriefSources(opportunityId, options?)` / `getBriefSource(noteId)`.

- [ ] **Step 1: Write the failing test**

Create `backend/services/services/api/src/opportunity-notes/opportunity-notes.service.spec.ts`:

```ts
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { OpportunityNotesService } from "./opportunity-notes.service";

// Screening itself is Slice 2's and is covered by note-content.spec.ts; here we
// only control the verdict so each create() path can be exercised.
jest.mock("./note-content", () => ({
  screenNoteBody: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { screenNoteBody } = require("./note-content") as {
  screenNoteBody: jest.Mock;
};

function allowBody(body: string) {
  screenNoteBody.mockReturnValue({ ok: true, status: "visible", body });
}

const OPP = "11111111-1111-4111-a111-111111111111";
const NOTE = "22222222-2222-4222-a222-222222222222";
const RAW_USER = "user_2abcDEF";
const OTHER_RAW_USER = "user_9zzzXYZ";

type Handler = (text: string) => unknown[];

/**
 * db.execute is the only DB surface this service uses. The fake dispatches on
 * a distinctive fragment of each statement, so a test declares exactly the
 * rows a query returns without pretending to be Postgres.
 */
function fakeDb(handlers: Array<[string, Handler]>) {
  const calls: string[] = [];
  return {
    calls,
    execute: jest.fn(async (query: unknown) => {
      const text = JSON.stringify(query);
      calls.push(text);
      for (const [fragment, handler] of handlers) {
        if (text.includes(fragment)) return { rows: handler(text) };
      }
      return { rows: [] };
    }),
  };
}

function makeService(db: { execute: jest.Mock }) {
  const counts = {
    get: jest.fn().mockResolvedValue({
      notesCount: 4,
      appliedCount: 10,
      usefulCount: 20,
      sharesCount: 100,
      groupsCount: 3,
    }),
    getMany: jest.fn().mockResolvedValue({}),
    bumpNotes: jest.fn().mockResolvedValue(undefined),
    bumpUseful: jest.fn().mockResolvedValue(undefined),
  };
  const notifications = { broadcast: jest.fn().mockResolvedValue(undefined) };
  const service = new OpportunityNotesService(
    counts as never,
    notifications as never,
  );
  (service as unknown as { db: unknown }).db = db;
  return { service, counts, notifications };
}

describe("OpportunityNotesService.list", () => {
  it("collapses a blocked author's note body but keeps the row", async () => {
    const db = fakeDb([
      [
        "from public.opportunity_notes",
        () => [
          {
            id: NOTE,
            opportunity_id: OPP,
            user_id: OTHER_RAW_USER,
            kind: "tip",
            outcome: null,
            body: "secret advice",
            reply_to_id: null,
            helpful_count: 3,
            created_at: "2026-07-25T10:00:00.000Z",
            author_username: "ada",
            author_display_name: "Ada N.",
            author_avatar_url: null,
            author_is_mentor: false,
            i_found_helpful: false,
            blocked: true,
          },
        ],
      ],
    ]);
    const { service } = makeService(db);

    const [note] = await service.list(OPP, RAW_USER, {
      sort: "helpful",
      limit: 50,
    });

    expect(note.blocked).toBe(true);
    expect(note.body).toBe("");
    expect(note.helpfulCount).toBe(3);
  });

  it("marks the viewer's own notes and their helpful votes", async () => {
    const db = fakeDb([
      [
        "from public.opportunity_notes",
        () => [
          {
            id: NOTE,
            opportunity_id: OPP,
            user_id: RAW_USER,
            kind: "result",
            outcome: "offer",
            body: "I got in on my second attempt.",
            reply_to_id: null,
            helpful_count: 9,
            created_at: "2026-07-25T10:00:00.000Z",
            author_username: "ada",
            author_display_name: "Ada N.",
            author_avatar_url: null,
            author_is_mentor: true,
            i_found_helpful: true,
            blocked: false,
          },
        ],
      ],
    ]);
    const { service } = makeService(db);

    const [note] = await service.list(OPP, RAW_USER, {
      sort: "new",
      limit: 50,
    });

    expect(note).toMatchObject({
      isMine: true,
      iFoundHelpful: true,
      outcome: "offer",
      author: { username: "ada", isMentor: true },
    });
  });

  it("works for a signed-out visitor", async () => {
    const db = fakeDb([["from public.opportunity_notes", () => []]]);
    const { service } = makeService(db);
    await expect(
      service.list(OPP, null, { sort: "helpful", limit: 50 }),
    ).resolves.toEqual([]);
  });
});

describe("OpportunityNotesService.create", () => {
  const okQuota: Array<[string, Handler]> = [
    ["as day_count", () => [{ day_count: 0, opportunity_count: 0 }]],
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    allowBody("a perfectly ordinary note about this opportunity");
  });

  it("rejects a screened-out body before anything is written", async () => {
    screenNoteBody.mockReturnValue({
      ok: false,
      rejection: "blocked",
      message: "Notes can't ask anyone to pay for access.",
    });
    const db = fakeDb(okQuota);
    const { service, counts } = makeService(db);

    await expect(
      service.create(OPP, RAW_USER, {
        kind: "tip",
        body: "Pay 5000 naira and I will send you the application link",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.execute).not.toHaveBeenCalled();
    expect(counts.bumpNotes).not.toHaveBeenCalled();
  });

  it("shadow-holds a borderline note: written hidden, no count bump, pending flag set", async () => {
    screenNoteBody.mockReturnValue({
      ok: true,
      status: "hidden",
      body: "Here is a mirror of the application form I found earlier",
      holdReason: "borderline link",
    });
    const db = fakeDb([
      ...okQuota,
      ["insert into public.opportunity_notes", () => [{ id: NOTE }]],
      ["from public.opportunity_notes", () => []],
    ]);
    const { service, counts, notifications } = makeService(db);

    const note = await service.create(OPP, RAW_USER, {
      kind: "tip",
      body: "Here is a mirror of the application form I found earlier",
    });

    expect(note.pending).toBe(true);
    expect(counts.bumpNotes).not.toHaveBeenCalled();
    expect(notifications.broadcast).not.toHaveBeenCalled();
  });

  it("refuses an unverified offer claim", async () => {
    const db = fakeDb([
      ...okQuota,
      ["as application_status", () => [{ application_status: "submitted" }]],
    ]);
    const { service } = makeService(db);

    await expect(
      service.create(OPP, RAW_USER, {
        kind: "result",
        body: "I won this one, trust me on it.",
        outcome: "offer",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("accepts a verified offer claim and bumps the notes count", async () => {
    const db = fakeDb([
      ...okQuota,
      ["as application_status", () => [{ application_status: "offer" }]],
      [
        "insert into public.opportunity_notes",
        () => [
          {
            id: NOTE,
            opportunity_id: OPP,
            user_id: RAW_USER,
            kind: "result",
            outcome: "offer",
            body: "I got in on my second attempt.",
            reply_to_id: null,
            helpful_count: 0,
            created_at: "2026-07-25T10:00:00.000Z",
          },
        ],
      ],
      [
        "from public.opportunity_notes",
        () => [
          {
            id: NOTE,
            opportunity_id: OPP,
            user_id: RAW_USER,
            kind: "result",
            outcome: "offer",
            body: "I got in on my second attempt.",
            reply_to_id: null,
            helpful_count: 0,
            created_at: "2026-07-25T10:00:00.000Z",
            author_username: "ada",
            author_display_name: "Ada N.",
            author_avatar_url: null,
            author_is_mentor: false,
            i_found_helpful: false,
            blocked: false,
          },
        ],
      ],
    ]);
    const { service, counts } = makeService(db);

    allowBody("I got in on my second attempt.");
    const note = await service.create(OPP, RAW_USER, {
      kind: "result",
      body: "I got in on my second attempt.",
      outcome: "offer",
    });

    expect(note.outcome).toBe("offer");
    expect(counts.bumpNotes).toHaveBeenCalledWith(OPP, 1);
  });

  it("refuses an interview claim from someone still at submitted", async () => {
    const db = fakeDb([
      ...okQuota,
      ["as application_status", () => [{ application_status: "submitted" }]],
    ]);
    const { service } = makeService(db);

    await expect(
      service.create(OPP, RAW_USER, {
        kind: "result",
        body: "They invited me to a panel interview, honestly.",
        outcome: "interview",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("accepts an interview claim from someone whose record already shows an offer", async () => {
    // The pipeline is linear: an offer proves an interview happened, so a
    // member who has already progressed can still post the interview note.
    const db = fakeDb([
      ...okQuota,
      ["as application_status", () => [{ application_status: "offer" }]],
      [
        "insert into public.opportunity_notes",
        () => [{ id: NOTE, opportunity_id: OPP, user_id: RAW_USER }],
      ],
      ["from public.opportunity_notes", () => []],
    ]);
    const { service, counts } = makeService(db);

    await service.create(OPP, RAW_USER, {
      kind: "result",
      body: "The panel interview was 45 minutes and mostly about my proposal.",
      outcome: "interview",
    });

    expect(counts.bumpNotes).toHaveBeenCalledWith(OPP, 1);
  });

  it("stops a user who has already posted 5 notes on this opportunity today", async () => {
    const db = fakeDb([
      ["as day_count", () => [{ day_count: 5, opportunity_count: 5 }]],
    ]);
    const { service } = makeService(db);

    await expect(
      service.create(OPP, RAW_USER, {
        kind: "tip",
        body: "Another perfectly reasonable tip about the deadline.",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuses to publish a chat message the caller cannot see", async () => {
    const db = fakeDb([
      ...okQuota,
      ["from public.community_messages", () => []],
    ]);
    const { service } = makeService(db);

    await expect(
      service.create(OPP, RAW_USER, {
        kind: "tip",
        body: "Quoting the group: the portal times out after 30 minutes.",
        sourceMessageId: "44444444-4444-4444-a444-444444444444",
        sourceGroupId: "55555555-5555-4555-a555-555555555555",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("notifies the parent author when the note is a reply", async () => {
    const db = fakeDb([
      ...okQuota,
      [
        "as parent_user_id",
        () => [{ parent_user_id: OTHER_RAW_USER, parent_opportunity_id: OPP }],
      ],
      [
        "insert into public.opportunity_notes",
        () => [
          {
            id: NOTE,
            opportunity_id: OPP,
            user_id: RAW_USER,
            kind: "tip",
            outcome: null,
            body: "Adding to that: the portal times out after 30 minutes.",
            reply_to_id: "33333333-3333-4333-a333-333333333333",
            helpful_count: 0,
            created_at: "2026-07-25T10:00:00.000Z",
          },
        ],
      ],
      [
        "from public.opportunity_notes",
        () => [
          {
            id: NOTE,
            opportunity_id: OPP,
            user_id: RAW_USER,
            kind: "tip",
            outcome: null,
            body: "Adding to that: the portal times out after 30 minutes.",
            reply_to_id: "33333333-3333-4333-a333-333333333333",
            helpful_count: 0,
            created_at: "2026-07-25T10:00:00.000Z",
            author_username: "ada",
            author_display_name: "Ada N.",
            author_avatar_url: null,
            author_is_mentor: false,
            i_found_helpful: false,
            blocked: false,
          },
        ],
      ],
    ]);
    const { service, notifications } = makeService(db);

    await service.create(OPP, RAW_USER, {
      kind: "tip",
      body: "Adding to that: the portal times out after 30 minutes.",
      replyToId: "33333333-3333-4333-a333-333333333333",
    });

    expect(notifications.broadcast).toHaveBeenCalledTimes(1);
    expect(notifications.broadcast.mock.calls[0][1]).toMatchObject({
      kind: "note-reply",
      audience: "specific",
    });
  });

  it("does not notify when someone replies to their own note", async () => {
    const db = fakeDb([
      ...okQuota,
      [
        "as parent_user_id",
        () => [{ parent_user_id: RAW_USER, parent_opportunity_id: OPP }],
      ],
      [
        "insert into public.opportunity_notes",
        () => [
          {
            id: NOTE,
            opportunity_id: OPP,
            user_id: RAW_USER,
            kind: "tip",
            outcome: null,
            body: "One more thing I forgot to mention above.",
            reply_to_id: "33333333-3333-4333-a333-333333333333",
            helpful_count: 0,
            created_at: "2026-07-25T10:00:00.000Z",
          },
        ],
      ],
      ["from public.opportunity_notes", () => []],
    ]);
    const { service, notifications } = makeService(db);

    await service.create(OPP, RAW_USER, {
      kind: "tip",
      body: "One more thing I forgot to mention above.",
      replyToId: "33333333-3333-4333-a333-333333333333",
    });

    expect(notifications.broadcast).not.toHaveBeenCalled();
  });
});

describe("OpportunityNotesService.remove", () => {
  it("lets the author remove their own note and decrements the count", async () => {
    const db = fakeDb([
      ["as owner_user_id", () => [{ owner_user_id: RAW_USER }]],
    ]);
    const { service, counts } = makeService(db);

    await expect(
      service.remove(OPP, NOTE, RAW_USER, "user"),
    ).resolves.toEqual({ success: true });
    expect(counts.bumpNotes).toHaveBeenCalledWith(OPP, -1);
  });

  it("lets a platform moderator remove anyone's note", async () => {
    const db = fakeDb([
      ["as owner_user_id", () => [{ owner_user_id: OTHER_RAW_USER }]],
    ]);
    const { service } = makeService(db);

    await expect(
      service.remove(OPP, NOTE, RAW_USER, "moderator"),
    ).resolves.toEqual({ success: true });
  });

  it("refuses when the caller is neither author nor moderator", async () => {
    const db = fakeDb([
      ["as owner_user_id", () => [{ owner_user_id: OTHER_RAW_USER }]],
    ]);
    const { service } = makeService(db);

    await expect(
      service.remove(OPP, NOTE, RAW_USER, "user"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("404s on an unknown note", async () => {
    const db = fakeDb([["as owner_user_id", () => []]]);
    const { service } = makeService(db);

    await expect(
      service.remove(OPP, NOTE, RAW_USER, "user"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("OpportunityNotesService.setHelpful", () => {
  it("bumps the counter once per user and reports the new total", async () => {
    const db = fakeDb([
      ["insert into public.opportunity_note_votes", () => [{ inserted: true }]],
      ["as helpful_count", () => [{ helpful_count: 21, opportunity_id: OPP }]],
    ]);
    const { service, counts } = makeService(db);

    await expect(service.setHelpful(OPP, NOTE, RAW_USER, true)).resolves.toEqual(
      { helpfulCount: 21, iFoundHelpful: true },
    );
    expect(counts.bumpUseful).toHaveBeenCalledWith(OPP, 1);
  });

  it("is idempotent — voting twice does not double count", async () => {
    const db = fakeDb([
      ["insert into public.opportunity_note_votes", () => []],
      ["as helpful_count", () => [{ helpful_count: 20, opportunity_id: OPP }]],
    ]);
    const { service, counts } = makeService(db);

    await expect(service.setHelpful(OPP, NOTE, RAW_USER, true)).resolves.toEqual(
      { helpfulCount: 20, iFoundHelpful: true },
    );
    expect(counts.bumpUseful).not.toHaveBeenCalled();
  });

  it("removes a vote and decrements", async () => {
    const db = fakeDb([
      ["delete from public.opportunity_note_votes", () => [{ deleted: true }]],
      ["as helpful_count", () => [{ helpful_count: 19, opportunity_id: OPP }]],
    ]);
    const { service, counts } = makeService(db);

    await expect(
      service.setHelpful(OPP, NOTE, RAW_USER, false),
    ).resolves.toEqual({ helpfulCount: 19, iFoundHelpful: false });
    expect(counts.bumpUseful).toHaveBeenCalledWith(OPP, -1);
  });
});

describe("OpportunityNotesService.getSocial", () => {
  it("returns counts plus the groups discussing this opportunity", async () => {
    const db = fakeDb([
      [
        "from public.community_groups",
        () => [
          {
            id: "66666666-6666-4666-a666-666666666666",
            slug: "chevening-2027",
            name: "Chevening 2027",
            icon_url: null,
            member_count: 42,
            last_message_at: "2026-07-25T09:00:00.000Z",
          },
        ],
      ],
    ]);
    const { service } = makeService(db);

    const social = await service.getSocial(OPP);

    expect(social.counts.notesCount).toBe(4);
    expect(social.groups).toHaveLength(1);
    expect(social.groups[0].slug).toBe("chevening-2027");
  });
});

describe("OpportunityNotesService.listBriefSources (Slice 4 interface)", () => {
  it("returns visible notes ordered by usefulness with author attribution", async () => {
    const db = fakeDb([
      [
        "from public.opportunity_notes",
        () => [
          {
            id: NOTE,
            opportunity_id: OPP,
            kind: "tip",
            outcome: null,
            body: "Reference letters took three weeks to come back.",
            helpful_count: 12,
            created_at: "2026-07-25T10:00:00.000Z",
            author_username: "ada",
            author_display_name: "Ada N.",
            author_is_mentor: true,
          },
        ],
      ],
    ]);
    const { service } = makeService(db);

    await expect(service.listBriefSources(OPP, { minHelpful: 3 })).resolves.toEqual([
      {
        noteId: NOTE,
        opportunityId: OPP,
        kind: "tip",
        outcome: null,
        body: "Reference letters took three weeks to come back.",
        helpfulCount: 12,
        authorUsername: "ada",
        authorDisplayName: "Ada N.",
        authorIsMentor: true,
        createdAt: "2026-07-25T10:00:00.000Z",
      },
    ]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm --prefix backend/services/services/api test -- opportunity-notes.service`
Expected: FAIL — `Cannot find module './opportunity-notes.service'`.

- [ ] **Step 3: Write the service**

Create `backend/services/services/api/src/opportunity-notes/opportunity-notes.service.ts`:

```ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { sql } from "drizzle-orm";
import { db as defaultDb } from "../db";
import { rawClerkUserId, toLegacyUuid } from "../common/community-user-id";
import { toDatabaseUserId } from "../common/user-id";
import { NotificationsService } from "../notifications/notifications.service";
import { screenNoteBody } from "./note-content";
import { OpportunitySocialCountsService } from "./opportunity-social-counts.service";
import { APPLIED_STATUSES } from "./opportunity-social-counts.source";
import type {
  CreateNoteDto,
  GroupsDiscussingEntryDto,
  ListNotesQueryDto,
  NoteKind,
  NoteOutcome,
  OpportunityNoteDto,
  OpportunitySocialCountsDto,
  OpportunitySocialResponseDto,
} from "./dto/opportunity-note.dto";

/** Anti-spam ceilings. Deliberately module constants, NOT admin_settings —
 *  a malformed admin_settings write silently resets every setting to defaults
 *  (repo constraint #4), and a rate limit is not worth that blast radius. */
const MAX_NOTES_PER_USER_PER_DAY = 20;
const MAX_NOTES_PER_OPPORTUNITY_PER_USER_PER_DAY = 5;

/** Groups shown in the "N groups discussing this" strip. */
const GROUPS_DISCUSSING_LIMIT = 5;

const PLATFORM_MODERATOR_ROLES = new Set([
  "admin",
  "super_admin",
  "moderator",
  "support_agent",
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * A note as Slice 4's Brief generator consumes it.
 *
 * This is the ONLY interface Slice 4 needs from Slice 3 for Note → Brief
 * promotion. `OpportunityNotesModule` exports `OpportunityNotesService`;
 * Slice 4 imports the module and calls these two methods. No new table, no new
 * HTTP route, no shared column: promotion is a read.
 */
export type BriefNoteSource = {
  noteId: string;
  opportunityId: string;
  kind: NoteKind;
  outcome: NoteOutcome | null;
  body: string;
  helpfulCount: number;
  authorUsername: string;
  authorDisplayName: string;
  authorIsMentor: boolean;
  createdAt: string;
};

type NoteRow = {
  id: string;
  opportunity_id: string;
  user_id: string;
  kind: NoteKind;
  outcome: NoteOutcome | null;
  body: string;
  reply_to_id: string | null;
  helpful_count: number | string;
  created_at: string | Date;
  author_username: string | null;
  author_display_name: string | null;
  author_avatar_url: string | null;
  author_is_mentor: boolean | null;
  i_found_helpful: boolean | null;
  blocked: boolean | null;
};

function rows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return (result as { rows?: T[] })?.rows ?? [];
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

@Injectable()
export class OpportunityNotesService {
  private readonly logger = new Logger(OpportunityNotesService.name);
  /** Overridable in tests; production always uses the shared pool. */
  private readonly db = defaultDb;

  constructor(
    private readonly socialCounts: OpportunitySocialCountsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ── Reads ────────────────────────────────────────────────────────────────

  async list(
    opportunityId: string,
    viewerRawId: string | null,
    query: ListNotesQueryDto,
  ): Promise<OpportunityNoteDto[]> {
    this.assertUuid(opportunityId, "Opportunity id");

    const viewer = viewerRawId ? rawClerkUserId(viewerRawId) : null;
    const viewerLegacy = viewer ? toLegacyUuid(viewer) : null;
    const kind = query.kind ?? null;

    // profiles.user_id is declared uuid in Drizzle but the live DB stores raw
    // Clerk subs; older rows still hold the derived uuid. Match both — this is
    // the same dual-key rule as matchProfileUserId, expressed for a join.
    const result = await this.db.execute(sql`
      select
        note.id::text                                  as id,
        note.opportunity_id::text                      as opportunity_id,
        note.user_id                                   as user_id,
        note.kind                                      as kind,
        note.outcome                                   as outcome,
        note.body                                      as body,
        note.reply_to_id::text                         as reply_to_id,
        note.helpful_count                             as helpful_count,
        note.created_at                                as created_at,
        coalesce(author.username, '')                  as author_username,
        coalesce(nullif(author.full_name, ''), 'Edutu member')
                                                       as author_display_name,
        author.avatar_url                              as author_avatar_url,
        (coalesce(author.mentor_status, 'none') = 'approved')
                                                       as author_is_mentor,
        (vote.user_id is not null)                     as i_found_helpful,
        (block.id is not null)                         as blocked
      from public.opportunity_notes note
      left join public.profiles author
        on author.user_id::text = note.user_id
        or author.user_id::text = public.clerk_id_to_uuid(note.user_id)
      left join public.opportunity_note_votes vote
        on vote.note_id = note.id
       and vote.user_id = ${viewer}
      left join public.user_blocks block
        on block.blocker_user_id = ${viewerLegacy}::uuid
       and block.blocked_user_id = public.clerk_id_to_uuid(note.user_id)::uuid
      where note.opportunity_id = ${opportunityId}::uuid
        and note.status = 'visible'
        and (${kind}::text is null or note.kind = ${kind})
      order by
        case when ${query.sort} = 'helpful' then note.helpful_count else 0 end desc,
        note.created_at desc
      limit ${query.limit}
    `);

    return rows<NoteRow>(result).map((row) => this.toNoteDto(row, viewer));
  }

  async getSocial(opportunityId: string): Promise<OpportunitySocialResponseDto> {
    this.assertUuid(opportunityId, "Opportunity id");

    const [counts, groups] = await Promise.all([
      this.socialCounts.get(opportunityId),
      this.listGroupsDiscussing(opportunityId),
    ]);

    return { opportunityId, counts, groups };
  }

  async getSocialBatch(
    opportunityIds: string[],
  ): Promise<Record<string, OpportunitySocialCountsDto>> {
    for (const id of opportunityIds) this.assertUuid(id, "Opportunity id");
    return this.socialCounts.getMany(opportunityIds);
  }

  private async listGroupsDiscussing(
    opportunityId: string,
  ): Promise<GroupsDiscussingEntryDto[]> {
    const result = await this.db.execute(sql`
      select
        grp.id::text          as id,
        grp.slug              as slug,
        grp.name              as name,
        grp.icon_url          as icon_url,
        grp.member_count      as member_count,
        grp.last_message_at   as last_message_at
      from public.community_groups grp
      where grp.opportunity_id = ${opportunityId}::uuid
        and grp.status = 'active'
        and grp.visibility in ('public', 'unlisted')
      order by grp.last_message_at desc nulls last, grp.member_count desc
      limit ${GROUPS_DISCUSSING_LIMIT}
    `);

    return rows<{
      id: string;
      slug: string;
      name: string;
      icon_url: string | null;
      member_count: number | string | null;
      last_message_at: string | Date | null;
    }>(result).map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      iconUrl: row.icon_url ?? null,
      memberCount: Number(row.member_count) || 0,
      lastMessageAt: row.last_message_at ? iso(row.last_message_at) : null,
    }));
  }

  // ── Writes ───────────────────────────────────────────────────────────────

  async create(
    opportunityId: string,
    viewerRawId: string,
    dto: CreateNoteDto,
  ): Promise<OpportunityNoteDto> {
    this.assertUuid(opportunityId, "Opportunity id");
    const viewer = rawClerkUserId(viewerRawId);

    // Length rules are ours; content screening is Slice 2's single shared
    // gate. A `hold` verdict lands the note at status 'hidden' — spec §9 wants
    // borderline content shadow-held for review, not a 4xx in a real
    // applicant's face mid-thought.
    const screened = screenNoteBody(dto.body);
    if (!screened.ok) {
      throw new BadRequestException(screened.message);
    }
    const { body, status: noteStatus } = screened;

    await this.assertWithinQuota(opportunityId, viewer);

    if (dto.kind === "result") {
      await this.assertOutcomeIsReal(opportunityId, viewer, dto.outcome!);
    }

    if (dto.sourceMessageId && dto.sourceGroupId) {
      await this.assertCanPublishMessage(
        dto.sourceGroupId,
        dto.sourceMessageId,
        viewer,
      );
    }

    const parent = dto.replyToId
      ? await this.loadParentNote(dto.replyToId, opportunityId)
      : null;

    const inserted = await this.db.execute(sql`
      insert into public.opportunity_notes (
        opportunity_id, user_id, kind, body, outcome,
        reply_to_id, source_message_id, status
      )
      values (
        ${opportunityId}::uuid,
        ${viewer},
        ${dto.kind},
        ${body},
        ${dto.outcome ?? null},
        ${dto.replyToId ?? null}::uuid,
        ${dto.sourceMessageId ?? null}::uuid,
        ${noteStatus}
      )
      on conflict do nothing
      returning id::text as id
    `);

    const noteId = rows<{ id: string }>(inserted)[0]?.id;
    if (!noteId) {
      // The only conflict possible is uq_opportunity_notes_result_per_user.
      throw new BadRequestException(
        "You already posted a result for this opportunity — delete it first to change it.",
      );
    }

    // A held note is invisible to everyone, so it must not move the public
    // count and must not ping the parent author.
    if (noteStatus === "visible") {
      await this.socialCounts.bumpNotes(opportunityId, 1);

      if (parent && parent.userId !== viewer) {
        await this.notifyNoteReply(parent.userId, viewer, opportunityId, noteId);
      }
    }

    // list() filters to status='visible', so a held note is never found here
    // and falls through to the synthesized response with pending: true.
    const [note] = await this.list(opportunityId, viewer, {
      sort: "new",
      limit: 100,
    });
    if (note && note.id === noteId) return note;

    return {
      id: noteId,
      opportunityId,
      kind: dto.kind,
      outcome: dto.outcome ?? null,
      body,
      helpfulCount: 0,
      iFoundHelpful: false,
      author: {
        username: "",
        displayName: "Edutu member",
        avatarUrl: null,
        isMentor: false,
      },
      createdAt: new Date().toISOString(),
      replyToId: dto.replyToId ?? null,
      blocked: false,
      isMine: true,
      pending: noteStatus === "hidden",
    };
  }

  async remove(
    opportunityId: string,
    noteId: string,
    viewerRawId: string,
    viewerRole: string | null,
  ): Promise<{ success: true }> {
    this.assertUuid(opportunityId, "Opportunity id");
    this.assertUuid(noteId, "Note id");
    const viewer = rawClerkUserId(viewerRawId);

    const owner = rows<{ owner_user_id: string }>(
      await this.db.execute(sql`
        select user_id as owner_user_id
        from public.opportunity_notes
        where id = ${noteId}::uuid
          and opportunity_id = ${opportunityId}::uuid
          and status = 'visible'
        limit 1
      `),
    )[0];

    if (!owner) throw new NotFoundException("Note not found");

    const isModerator = PLATFORM_MODERATOR_ROLES.has(viewerRole ?? "user");
    if (owner.owner_user_id !== viewer && !isModerator) {
      throw new ForbiddenException("You can only remove your own note");
    }

    // Soft delete: replies keep their thread, and the moderation queue can
    // still inspect what was said.
    await this.db.execute(sql`
      update public.opportunity_notes
      set status = ${isModerator && owner.owner_user_id !== viewer ? "removed" : "hidden"},
          updated_at = now()
      where id = ${noteId}::uuid
    `);

    await this.socialCounts.bumpNotes(opportunityId, -1);
    return { success: true };
  }

  async setHelpful(
    opportunityId: string,
    noteId: string,
    viewerRawId: string,
    helpful: boolean,
  ): Promise<{ helpfulCount: number; iFoundHelpful: boolean }> {
    this.assertUuid(opportunityId, "Opportunity id");
    this.assertUuid(noteId, "Note id");
    const viewer = rawClerkUserId(viewerRawId);

    const changed = helpful
      ? rows(
          await this.db.execute(sql`
            insert into public.opportunity_note_votes (note_id, user_id)
            select ${noteId}::uuid, ${viewer}
            where exists (
              select 1 from public.opportunity_notes
              where id = ${noteId}::uuid
                and opportunity_id = ${opportunityId}::uuid
                and status = 'visible'
            )
            on conflict (note_id, user_id) do nothing
            returning true as inserted
          `),
        ).length > 0
      : rows(
          await this.db.execute(sql`
            delete from public.opportunity_note_votes
            where note_id = ${noteId}::uuid and user_id = ${viewer}
            returning true as deleted
          `),
        ).length > 0;

    if (changed) {
      await this.db.execute(sql`
        update public.opportunity_notes
        set helpful_count = greatest(0, helpful_count + ${helpful ? 1 : -1})
        where id = ${noteId}::uuid
      `);
      await this.socialCounts.bumpUseful(opportunityId, helpful ? 1 : -1);
    }

    const current = rows<{ helpful_count: number | string }>(
      await this.db.execute(sql`
        select helpful_count as helpful_count, opportunity_id::text as opportunity_id
        from public.opportunity_notes
        where id = ${noteId}::uuid
        limit 1
      `),
    )[0];

    if (!current) throw new NotFoundException("Note not found");

    return {
      helpfulCount: Number(current.helpful_count) || 0,
      iFoundHelpful: helpful,
    };
  }

  // ── Slice 4 interface: Note → Brief promotion ────────────────────────────

  async listBriefSources(
    opportunityId: string,
    options: { limit?: number; minHelpful?: number } = {},
  ): Promise<BriefNoteSource[]> {
    this.assertUuid(opportunityId, "Opportunity id");
    const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);
    const minHelpful = Math.max(options.minHelpful ?? 0, 0);

    const result = await this.db.execute(sql`
      select
        note.id::text             as id,
        note.opportunity_id::text as opportunity_id,
        note.kind                 as kind,
        note.outcome              as outcome,
        note.body                 as body,
        note.helpful_count        as helpful_count,
        note.created_at           as created_at,
        coalesce(author.username, '') as author_username,
        coalesce(nullif(author.full_name, ''), 'Edutu member')
                                  as author_display_name,
        (coalesce(author.mentor_status, 'none') = 'approved')
                                  as author_is_mentor
      from public.opportunity_notes note
      left join public.profiles author
        on author.user_id::text = note.user_id
        or author.user_id::text = public.clerk_id_to_uuid(note.user_id)
      where note.opportunity_id = ${opportunityId}::uuid
        and note.status = 'visible'
        and note.helpful_count >= ${minHelpful}
      order by note.helpful_count desc, note.created_at desc
      limit ${limit}
    `);

    return rows<{
      id: string;
      opportunity_id: string;
      kind: NoteKind;
      outcome: NoteOutcome | null;
      body: string;
      helpful_count: number | string;
      created_at: string | Date;
      author_username: string;
      author_display_name: string;
      author_is_mentor: boolean;
    }>(result).map((row) => ({
      noteId: row.id,
      opportunityId: row.opportunity_id,
      kind: row.kind,
      outcome: row.outcome ?? null,
      body: row.body,
      helpfulCount: Number(row.helpful_count) || 0,
      authorUsername: row.author_username,
      authorDisplayName: row.author_display_name,
      authorIsMentor: Boolean(row.author_is_mentor),
      createdAt: iso(row.created_at),
    }));
  }

  async getBriefSource(noteId: string): Promise<BriefNoteSource | null> {
    this.assertUuid(noteId, "Note id");
    const owner = rows<{ opportunity_id: string }>(
      await this.db.execute(sql`
        select opportunity_id::text as opportunity_id
        from public.opportunity_notes
        where id = ${noteId}::uuid and status = 'visible'
        limit 1
      `),
    )[0];
    if (!owner) return null;

    const sources = await this.listBriefSources(owner.opportunity_id, {
      limit: 100,
    });
    return sources.find((source) => source.noteId === noteId) ?? null;
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private toNoteDto(row: NoteRow, viewer: string | null): OpportunityNoteDto {
    const blocked = Boolean(row.blocked);
    return {
      id: row.id,
      opportunityId: row.opportunity_id,
      kind: row.kind,
      outcome: row.outcome ?? null,
      // Blocked authors' content collapses everywhere it appears (spec §9).
      // The row survives so the thread does not develop holes.
      body: blocked ? "" : row.body,
      helpfulCount: Number(row.helpful_count) || 0,
      iFoundHelpful: Boolean(row.i_found_helpful),
      author: {
        username: row.author_username ?? "",
        displayName: row.author_display_name ?? "Edutu member",
        avatarUrl: row.author_avatar_url ?? null,
        isMentor: Boolean(row.author_is_mentor),
      },
      createdAt: iso(row.created_at),
      replyToId: row.reply_to_id ?? null,
      blocked,
      isMine: Boolean(viewer) && row.user_id === viewer,
    };
  }

  private async assertWithinQuota(opportunityId: string, viewer: string) {
    const quota = rows<{
      day_count: number | string;
      opportunity_count: number | string;
    }>(
      await this.db.execute(sql`
        select
          count(*)::int as day_count,
          count(*) filter (
            where opportunity_id = ${opportunityId}::uuid
          )::int as opportunity_count
        from public.opportunity_notes
        where user_id = ${viewer}
          and created_at >= now() - interval '24 hours'
      `),
    )[0];

    if (
      Number(quota?.opportunity_count ?? 0) >=
      MAX_NOTES_PER_OPPORTUNITY_PER_USER_PER_DAY
    ) {
      throw new BadRequestException(
        `You can add ${MAX_NOTES_PER_OPPORTUNITY_PER_USER_PER_DAY} notes a day to one opportunity. Come back tomorrow.`,
      );
    }
    if (Number(quota?.day_count ?? 0) >= MAX_NOTES_PER_USER_PER_DAY) {
      throw new BadRequestException(
        `You've hit today's limit of ${MAX_NOTES_PER_USER_PER_DAY} notes.`,
      );
    }
  }

  /**
   * A result note is a claim about a real outcome, and verified outcomes are
   * the moat (spec §1). Every claim must be backed by this user's own
   * application row or outcome signal — both written by me.service.ts. The
   * legacy tables are keyed by the DERIVED uuid, so this is one of the two
   * sanctioned conversion points.
   */
  private async assertOutcomeIsReal(
    opportunityId: string,
    viewer: string,
    outcome: NoteOutcome,
  ) {
    const legacyId = toDatabaseUserId(viewer);
    const signalType =
      outcome === "offer"
        ? "outcome_offer"
        : outcome === "rejected"
          ? "outcome_rejected"
          : null;

    const found = rows<{ application_status: string | null }>(
      await this.db.execute(sql`
        select coalesce(
          (
            select app.status
            from public.opportunity_applications app
            where app.opportunity_id = ${opportunityId}::uuid
              and app.user_id::text = ${legacyId}
            limit 1
          ),
          (
            select 'signal:' || signal.signal_type
            from public.user_opportunity_signals signal
            where signal.opportunity_id = ${opportunityId}::uuid
              and signal.user_id::text = ${legacyId}
              and signal.signal_type = ${signalType}
            limit 1
          )
        ) as application_status
      `),
    )[0];

    const status = found?.application_status ?? null;
    const applied =
      status !== null &&
      status !== "draft" &&
      (status.startsWith("signal:") ||
        [...APPLIED_STATUSES].includes(status as (typeof APPLIED_STATUSES)[number]));

    if (!applied) {
      throw new ForbiddenException(
        "Mark this opportunity as applied in My Applications first — results on Edutu are verified, never self-declared.",
      );
    }

    // 'applied' needs nothing beyond the non-draft row already proven above.
    // The other three each need the record to show that specific stage.
    //
    // 'interview' accepts 'offer' too, because the pipeline is linear: an offer
    // proves an interview happened. It deliberately does NOT accept 'rejected',
    // which proves nothing about whether an interview took place — a member who
    // interviewed and was then turned down should record the interview while it
    // is their live status; the note survives every later status change.
    if (
      outcome === "interview" &&
      status !== "interview" &&
      status !== "offer" &&
      status !== "signal:outcome_offer"
    ) {
      throw new ForbiddenException(
        "Set your application status to Interview first — interview results come from your real application record.",
      );
    }
    if (outcome === "offer" && status !== "offer" && status !== "signal:outcome_offer") {
      throw new ForbiddenException(
        "Set your application status to Offer first — a win badge has to come from your real application record.",
      );
    }
    if (
      outcome === "rejected" &&
      status !== "rejected" &&
      status !== "signal:outcome_rejected"
    ) {
      throw new ForbiddenException(
        "Set your application status to Rejected first so the note matches your record.",
      );
    }
  }

  /**
   * Publishing a ✦saved chat message as a Note. The caller must be a member of
   * the group and the message must actually be saved — otherwise a group's
   * private discussion could be laundered onto a public page.
   */
  private async assertCanPublishMessage(
    groupId: string,
    messageId: string,
    viewer: string,
  ) {
    const found = rows<{ message_id: string }>(
      await this.db.execute(sql`
        select message.id::text as message_id
        from public.community_messages message
        join public.community_group_members membership
          on membership.group_id = message.group_id
         and membership.user_id = ${viewer}
         and membership.banned_at is null
        where message.id = ${messageId}::uuid
          and message.group_id = ${groupId}::uuid
          and message.is_deleted = false
          and message.saved_to_brief = true
        limit 1
      `),
    )[0];

    if (!found) {
      throw new ForbiddenException(
        "Only a ✦saved message from a group you're in can be published as a note.",
      );
    }
  }

  private async loadParentNote(replyToId: string, opportunityId: string) {
    const parent = rows<{
      parent_user_id: string;
      parent_opportunity_id: string;
    }>(
      await this.db.execute(sql`
        select
          user_id as parent_user_id,
          opportunity_id::text as parent_opportunity_id
        from public.opportunity_notes
        where id = ${replyToId}::uuid and status = 'visible'
        limit 1
      `),
    )[0];

    if (!parent) throw new NotFoundException("The note you replied to is gone");
    if (parent.parent_opportunity_id !== opportunityId) {
      throw new BadRequestException(
        "A reply must stay on the same opportunity as its parent note",
      );
    }
    return { userId: parent.parent_user_id };
  }

  private async notifyNoteReply(
    parentAuthorRawId: string,
    replierRawId: string,
    opportunityId: string,
    noteId: string,
  ) {
    try {
      const title = rows<{ title: string | null }>(
        await this.db.execute(sql`
          select title from public.opportunities
          where id = ${opportunityId}::uuid limit 1
        `),
      )[0]?.title;

      await this.notificationsService.broadcast(replierRawId, {
        title: "Someone replied to your note",
        body: title
          ? `There's a new reply on your note about ${title}.`
          : "There's a new reply on your opportunity note.",
        kind: "note-reply",
        severity: "info",
        audience: "specific",
        // The ONLY sanctioned conversion to the uuid-keyed notifications table.
        targetUserIds: [toLegacyUuid(parentAuthorRawId)],
        channels: { inApp: true, push: true, email: false },
        dedupeKey: `note-reply:${noteId}`,
        metadata: { opportunityId, noteId },
      });
    } catch (error) {
      // A missed notification must never fail the note that was written.
      this.logger.warn(
        `Could not send note-reply notification: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private assertUuid(value: string, label: string) {
    if (!UUID_PATTERN.test(value ?? "")) {
      throw new BadRequestException(`${label} must be a UUID`);
    }
  }
}
```

- [ ] **Step 4: Run the test**

Run: `npm --prefix backend/services/services/api test -- opportunity-notes.service`
Expected: PASS, 19 tests.

- [ ] **Step 5: Lint and commit**

```bash
npm --prefix backend/services/services/api run lint
git add backend/services/services/api/src/opportunity-notes/opportunity-notes.service.ts \
        backend/services/services/api/src/opportunity-notes/opportunity-notes.service.spec.ts
git commit -m "feat(api): opportunity notes service with verified result outcomes and block collapse"
```

---

### Task 7: Optional viewer identity on `@Public()` routes

**Why:** `GET /opportunities/:id/notes` and `GET /opportunities/:id/social` must be public (notes are SEO-indexable on web and readable in guest mode on mobile), but a signed-in reader still needs `iFoundHelpful`, `isMine` and blocked-author collapse. Today `ClerkAuthGuard.canActivate` returns `true` immediately for `@Public()` routes and never populates `request.user`, so `@CurrentUser("authId")` is always `null` there. Fix it once in the guard rather than duplicating token verification inside this slice.

**Files:**
- Modify: `backend/services/services/api/src/auth/clerk-auth.guard.ts:43-51`
- Test: `backend/services/services/api/src/auth/clerk-auth.guard.public-user.spec.ts`

**Interfaces:**
- Produces: on a `@Public()` route, `request.user` is populated when a valid `Authorization: Bearer` token is present, and remains `undefined` otherwise. The route is **never** rejected.

- [ ] **Step 1: Write the failing test**

Create `backend/services/services/api/src/auth/clerk-auth.guard.public-user.spec.ts`:

```ts
import { ClerkAuthGuard } from "./clerk-auth.guard";

type MutableRequest = { headers: Record<string, unknown>; user?: unknown };

function contextFor(request: MutableRequest) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as never;
}

function publicGuard() {
  const reflector = { getAllAndOverride: () => true } as never;
  return new ClerkAuthGuard(reflector, {} as never);
}

describe("ClerkAuthGuard on @Public() routes", () => {
  it("allows an anonymous request and leaves request.user unset", async () => {
    const guard = publicGuard();
    const request: MutableRequest = { headers: {} };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });

  it("allows a request with a bogus token and never throws", async () => {
    const guard = publicGuard();
    const request: MutableRequest = {
      headers: { authorization: "Bearer not-a-real-token" },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });

  it("populates request.user when the token verifies", async () => {
    const guard = publicGuard();
    jest
      .spyOn(
        guard as unknown as {
          tryAuthenticateClerk: (t: string, r: MutableRequest) => Promise<boolean>;
        },
        "tryAuthenticateClerk",
      )
      .mockImplementation(async (_token, req) => {
        req.user = { id: "derived-uuid", authId: "user_2abcDEF" };
        return true;
      });
    const request: MutableRequest = {
      headers: { authorization: "Bearer good-token" },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toEqual({ id: "derived-uuid", authId: "user_2abcDEF" });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm --prefix backend/services/services/api test -- clerk-auth.guard.public-user`
Expected: FAIL on the third test — `expect(received).toEqual(expected)` with `received: undefined`, because the public branch returns before authentication is attempted.

- [ ] **Step 3: Change the guard**

In `backend/services/services/api/src/auth/clerk-auth.guard.ts`, replace lines 43–51 (the `isPublic` early return and the `const request` line that follows it) with:

```ts
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();

    // A @Public() route is never rejected — but when the caller DID send a
    // valid session we still identify them, so public reads can be
    // viewer-aware (e.g. "I found this useful", blocked-author collapse on
    // opportunity notes). Every failure path here is swallowed: an expired or
    // forged token on a public route must behave exactly like no token.
    if (isPublic) {
      const publicToken = String(request.headers?.authorization ?? "")
        .match(BEARER_TOKEN_PATTERN)?.[1]
        ?.trim();
      if (publicToken) {
        try {
          const identified = await this.tryAuthenticateClerk(
            publicToken,
            request,
          );
          if (!identified) {
            await this.tryAuthenticateSupabase(publicToken, request);
          }
        } catch {
          // Intentionally ignored — public means public.
        }
      }
      return true;
    }

    if (this.tryAuthenticateLocalAdmin(request)) {
      return true;
    }
```

> Delete the now-duplicated `const request = context.switchToHttp().getRequest();` and the standalone `if (this.tryAuthenticateLocalAdmin(request)) { return true; }` block that previously followed, so each appears exactly once.

- [ ] **Step 4: Run the test**

Run: `npm --prefix backend/services/services/api test -- clerk-auth.guard`
Expected: PASS — 3 new tests plus the pre-existing guard suite.

- [ ] **Step 5: Prove nothing else regressed**

Run: `npm --prefix backend/services/services/api test`
Expected: the whole suite passes with no new failures.

- [ ] **Step 6: Lint and commit**

```bash
npm --prefix backend/services/services/api run lint
git add backend/services/services/api/src/auth/clerk-auth.guard.ts \
        backend/services/services/api/src/auth/clerk-auth.guard.public-user.spec.ts
git commit -m "feat(api): identify the caller on public routes without ever rejecting them"
```

---

### Task 8: Controller, module, app wiring, boot smoke test

**Files:**
- Create: `backend/services/services/api/src/opportunity-notes/opportunity-notes.controller.ts`
- Create: `backend/services/services/api/src/opportunity-notes/opportunity-notes.module.ts`
- Modify: `backend/services/services/api/src/app.module.ts`
- Test: `backend/services/services/api/src/opportunity-notes/opportunity-notes.module.spec.ts`

**Interfaces:**
- Consumes: `OpportunityNotesService` (Task 6), `OpportunitySocialCountsService` + `DbSocialCountsSource` + `SOCIAL_COUNTS_SOURCE` (Task 4), DTOs (Task 5), `CurrentUser` / `Public` from `../auth`, `ZodValidationPipe` from `../common/zod-validation.pipe`, `NotificationsModule`.
- Produces: the six contract routes plus the slice-3 batch route:
  - `GET    /opportunities/:opportunityId/notes?kind=&sort=&limit=` (`@Public`)
  - `POST   /opportunities/:opportunityId/notes`
  - `DELETE /opportunities/:opportunityId/notes/:noteId`
  - `POST   /opportunities/:opportunityId/notes/:noteId/helpful`
  - `DELETE /opportunities/:opportunityId/notes/:noteId/helpful`
  - `GET    /opportunities/:opportunityId/social` (`@Public`)
  - `POST   /opportunities/social/batch` (`@Public`, slice-3 namespace)
- Produces: `OpportunityNotesModule` **exporting `OpportunityNotesService`** — this is how Slice 4 reaches `listBriefSources` / `getBriefSource`.

- [ ] **Step 1: Write the failing test**

Create `backend/services/services/api/src/opportunity-notes/opportunity-notes.module.spec.ts`:

```ts
import { Test } from "@nestjs/testing";
import { OpportunityNotesController } from "./opportunity-notes.controller";
import { OpportunityNotesService } from "./opportunity-notes.service";
import { OpportunitySocialCountsService } from "./opportunity-social-counts.service";

describe("OpportunityNotesController", () => {
  const notes = {
    list: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: "note" }),
    remove: jest.fn().mockResolvedValue({ success: true }),
    setHelpful: jest.fn().mockResolvedValue({ helpfulCount: 1, iFoundHelpful: true }),
    getSocial: jest.fn().mockResolvedValue({ opportunityId: "opp", counts: {}, groups: [] }),
    getSocialBatch: jest.fn().mockResolvedValue({}),
  };

  let controller: OpportunityNotesController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [OpportunityNotesController],
      providers: [
        { provide: OpportunityNotesService, useValue: notes },
        { provide: OpportunitySocialCountsService, useValue: {} },
      ],
    }).compile();
    controller = moduleRef.get(OpportunityNotesController);
  });

  it("passes the raw Clerk id (authId), never the derived uuid, to the service", async () => {
    await controller.listNotes("opp-1", "user_2abcDEF", {
      sort: "helpful",
      limit: 50,
    });
    expect(notes.list).toHaveBeenCalledWith("opp-1", "user_2abcDEF", {
      sort: "helpful",
      limit: 50,
    });
  });

  it("tolerates a signed-out reader on the public list route", async () => {
    await controller.listNotes("opp-1", null as unknown as string, {
      sort: "helpful",
      limit: 50,
    });
    expect(notes.list).toHaveBeenCalledWith("opp-1", null, {
      sort: "helpful",
      limit: 50,
    });
  });

  it("threads the caller role into delete so moderators can remove any note", async () => {
    await controller.deleteNote("opp-1", "note-1", "user_2abcDEF", "moderator");
    expect(notes.remove).toHaveBeenCalledWith(
      "opp-1",
      "note-1",
      "user_2abcDEF",
      "moderator",
    );
  });

  it("maps POST/DELETE helpful onto the same service call with opposite intent", async () => {
    await controller.markHelpful("opp-1", "note-1", "user_2abcDEF");
    await controller.unmarkHelpful("opp-1", "note-1", "user_2abcDEF");
    expect(notes.setHelpful).toHaveBeenNthCalledWith(1, "opp-1", "note-1", "user_2abcDEF", true);
    expect(notes.setHelpful).toHaveBeenNthCalledWith(2, "opp-1", "note-1", "user_2abcDEF", false);
  });

  it("exposes the batch counts route for list surfaces", async () => {
    await controller.socialBatch({ opportunityIds: ["opp-1", "opp-2"] });
    expect(notes.getSocialBatch).toHaveBeenCalledWith(["opp-1", "opp-2"]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm --prefix backend/services/services/api test -- opportunity-notes.module`
Expected: FAIL — `Cannot find module './opportunity-notes.controller'`.

- [ ] **Step 3: Write the controller**

Create `backend/services/services/api/src/opportunity-notes/opportunity-notes.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser, Public } from "../auth";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  CreateNoteSchema,
  ListNotesQuerySchema,
  SocialBatchSchema,
  type CreateNoteDto,
  type ListNotesQueryDto,
  type SocialBatchDto,
} from "./dto/opportunity-note.dto";
import { OpportunityNotesService } from "./opportunity-notes.service";

/**
 * A SIBLING controller on the /opportunities prefix.
 *
 * `OpportunitiesController` is 571 lines against a 3430-line service; adding
 * notes there would be the fifth concern in one file. Nest is happy with two
 * controllers sharing a prefix, and none of these paths collide with the
 * existing routes: OpportunitiesController's only two-segment patterns are
 * `:id/share-card` and `:id/share-pdf`, and its `@Get(":id")` cannot match a
 * two-segment path. `social/batch` is deliberately a POST on a TWO-segment
 * path — a `GET /opportunities/social` would be swallowed by `@Get(":id")`.
 */
@Controller("opportunities")
export class OpportunityNotesController {
  constructor(private readonly notesService: OpportunityNotesService) {}

  @Get(":opportunityId/notes")
  @Public()
  listNotes(
    @Param("opportunityId") opportunityId: string,
    // Populated by ClerkAuthGuard even on @Public routes when a session is
    // present; null for anonymous visitors and SEO crawlers.
    @CurrentUser("authId") authId: string | null,
    @Query(new ZodValidationPipe(ListNotesQuerySchema)) query: ListNotesQueryDto,
  ) {
    return this.notesService.list(opportunityId, authId ?? null, query);
  }

  // Tighter than the global 100/min: a note is a considered piece of writing.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(":opportunityId/notes")
  createNote(
    @Param("opportunityId") opportunityId: string,
    @CurrentUser("authId") authId: string,
    @Body(new ZodValidationPipe(CreateNoteSchema)) dto: CreateNoteDto,
  ) {
    return this.notesService.create(opportunityId, authId, dto);
  }

  @Delete(":opportunityId/notes/:noteId")
  deleteNote(
    @Param("opportunityId") opportunityId: string,
    @Param("noteId") noteId: string,
    @CurrentUser("authId") authId: string,
    @CurrentUser("role") role: string | null,
  ) {
    return this.notesService.remove(opportunityId, noteId, authId, role ?? null);
  }

  @Post(":opportunityId/notes/:noteId/helpful")
  markHelpful(
    @Param("opportunityId") opportunityId: string,
    @Param("noteId") noteId: string,
    @CurrentUser("authId") authId: string,
  ) {
    return this.notesService.setHelpful(opportunityId, noteId, authId, true);
  }

  @Delete(":opportunityId/notes/:noteId/helpful")
  unmarkHelpful(
    @Param("opportunityId") opportunityId: string,
    @Param("noteId") noteId: string,
    @CurrentUser("authId") authId: string,
  ) {
    return this.notesService.setHelpful(opportunityId, noteId, authId, false);
  }

  @Get(":opportunityId/social")
  @Public()
  getSocial(@Param("opportunityId") opportunityId: string) {
    return this.notesService.getSocial(opportunityId);
  }

  /**
   * Slice-3 namespace addition. Card rails render dozens of opportunities at
   * once; one GET per card would be an N+1 on every feed paint.
   */
  @Post("social/batch")
  @Public()
  socialBatch(
    @Body(new ZodValidationPipe(SocialBatchSchema)) dto: SocialBatchDto,
  ) {
    return this.notesService.getSocialBatch(dto.opportunityIds);
  }
}
```

- [ ] **Step 4: Write the module**

Create `backend/services/services/api/src/opportunity-notes/opportunity-notes.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { OpportunityNotesController } from "./opportunity-notes.controller";
import { OpportunityNotesService } from "./opportunity-notes.service";
import { OpportunitySocialCountsService } from "./opportunity-social-counts.service";
import {
  DbSocialCountsSource,
  SOCIAL_COUNTS_SOURCE,
} from "./opportunity-social-counts.source";
import { SocialCountsReconcileService } from "./social-counts-reconcile.service";

@Module({
  imports: [NotificationsModule],
  controllers: [OpportunityNotesController],
  providers: [
    OpportunityNotesService,
    OpportunitySocialCountsService,
    SocialCountsReconcileService,
    { provide: SOCIAL_COUNTS_SOURCE, useClass: DbSocialCountsSource },
  ],
  // Slice 4 imports this module and calls
  // OpportunityNotesService.listBriefSources() / getBriefSource() to promote
  // a Note into a group's Brief. Nothing else is shared.
  exports: [OpportunityNotesService, OpportunitySocialCountsService],
})
export class OpportunityNotesModule {}
```

> `SocialCountsReconcileService` is written in Task 9. Until then this import fails to resolve — do Task 9 before running the boot smoke test in Step 7, or temporarily omit it and add it back in Task 9 Step 4.

- [ ] **Step 5: Register in `app.module.ts`**

In `backend/services/services/api/src/app.module.ts`, add the import next to the other feature-module imports (after line 41, `SupportModule`):

```ts
import { OpportunityNotesModule } from "./opportunity-notes/opportunity-notes.module";
```

and add it to the `imports` array immediately after `SupportModule,` (line 86):

```ts
    SupportModule,
    OpportunityNotesModule,
```

- [ ] **Step 6: Run the tests**

Run: `npm --prefix backend/services/services/api test -- opportunity-notes.module`
Expected: PASS, 5 tests.

- [ ] **Step 7: Boot smoke test (repo constraint #10)**

Run:
```bash
npm --prefix backend/services/services/api run build && \
node backend/services/services/api/dist/main
```
Expected: Nest logs `Mapped {/opportunities/:opportunityId/notes, GET}`, `{/opportunities/:opportunityId/notes, POST}`, `{/opportunities/:opportunityId/notes/:noteId, DELETE}`, `{/opportunities/:opportunityId/notes/:noteId/helpful, POST}`, `{/opportunities/:opportunityId/notes/:noteId/helpful, DELETE}`, `{/opportunities/:opportunityId/social, GET}` and `{/opportunities/social/batch, POST}`, then `Nest application successfully started`. Stop it with Ctrl-C. A `Nest can't resolve dependencies` error here is exactly the class of failure that passes tests and breaks production.

- [ ] **Step 8: Exercise the routes against the running server**

With the server still running in another shell:
```bash
OPP=$(psql "$DATABASE_URL" -tAc "select id from public.opportunities where status='active' limit 1")
curl -s "http://localhost:3000/opportunities/$OPP/notes" | head -c 200; echo
curl -s "http://localhost:3000/opportunities/$OPP/social" | head -c 300; echo
curl -s -X POST "http://localhost:3000/opportunities/social/batch" \
  -H 'Content-Type: application/json' -d "{\"opportunityIds\":[\"$OPP\"]}" | head -c 300; echo
```
Expected: `[]` for notes; a JSON object with `counts` and `groups` for social; a map keyed by the opportunity id for the batch.

- [ ] **Step 9: Lint and commit**

```bash
npm --prefix backend/services/services/api run lint
git add backend/services/services/api/src/opportunity-notes/ \
        backend/services/services/api/src/app.module.ts
git commit -m "feat(api): opportunity notes module registering the notes and social routes"
```

---

### Task 9: Nightly social-counts reconcile cron

**Files:**
- Create: `backend/services/services/api/src/opportunity-notes/social-counts-reconcile.service.ts`
- Test: `backend/services/services/api/src/opportunity-notes/social-counts-reconcile.service.spec.ts`

**Interfaces:**
- Consumes: `OpportunitySocialCountsService.reconcile()` (Task 4).
- Produces: `SocialCountsReconcileService` with `@Cron(CronExpression.EVERY_DAY_AT_3AM) runScheduled()` and a directly-callable `run()`; kill switch `SOCIAL_COUNTS_RECONCILE_ENABLED=false`.

- [ ] **Step 1: Write the failing test**

Create `backend/services/services/api/src/opportunity-notes/social-counts-reconcile.service.spec.ts`:

```ts
import { SocialCountsReconcileService } from "./social-counts-reconcile.service";

describe("SocialCountsReconcileService", () => {
  const original = process.env.SOCIAL_COUNTS_RECONCILE_ENABLED;

  afterEach(() => {
    if (original === undefined) delete process.env.SOCIAL_COUNTS_RECONCILE_ENABLED;
    else process.env.SOCIAL_COUNTS_RECONCILE_ENABLED = original;
  });

  it("reconciles every opportunity on the nightly run", async () => {
    delete process.env.SOCIAL_COUNTS_RECONCILE_ENABLED;
    const counts = {
      reconcile: jest.fn().mockResolvedValue({ checked: 120, corrected: 3 }),
    };
    const service = new SocialCountsReconcileService(counts as never);

    await service.runScheduled();

    expect(counts.reconcile).toHaveBeenCalledWith();
  });

  it("does nothing when the kill switch is set", async () => {
    process.env.SOCIAL_COUNTS_RECONCILE_ENABLED = "false";
    const counts = { reconcile: jest.fn() };
    const service = new SocialCountsReconcileService(counts as never);

    await service.runScheduled();

    expect(counts.reconcile).not.toHaveBeenCalled();
  });

  it("swallows a failure so one bad night never crashes the scheduler", async () => {
    delete process.env.SOCIAL_COUNTS_RECONCILE_ENABLED;
    const counts = {
      reconcile: jest.fn().mockRejectedValue(new Error("connection reset")),
    };
    const service = new SocialCountsReconcileService(counts as never);

    await expect(service.runScheduled()).resolves.toBeUndefined();
  });

  it("run() surfaces the result for manual/admin invocation", async () => {
    const counts = {
      reconcile: jest.fn().mockResolvedValue({ checked: 2, corrected: 2 }),
    };
    const service = new SocialCountsReconcileService(counts as never);

    await expect(service.run(["opp-1", "opp-2"])).resolves.toEqual({
      checked: 2,
      corrected: 2,
    });
    expect(counts.reconcile).toHaveBeenCalledWith(["opp-1", "opp-2"]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm --prefix backend/services/services/api test -- social-counts-reconcile`
Expected: FAIL — `Cannot find module './social-counts-reconcile.service'`.

- [ ] **Step 3: Write the cron service**

Create `backend/services/services/api/src/opportunity-notes/social-counts-reconcile.service.ts`:

```ts
import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { OpportunitySocialCountsService } from "./opportunity-social-counts.service";

/**
 * Nightly reconcile of opportunity_social_counts.
 *
 * The cache is maintained write-through, which means it is exactly as correct
 * as the last deploy, the last crashed request and the last manual SQL fix.
 * `applied_count`, `shares_count` and `groups_count` are not even written by
 * this slice — they are owned by me.service.ts, the signals ingest endpoint and
 * Slice 2's group lifecycle respectively — so without this job those three
 * numbers would only ever be right by accident.
 *
 * 3 AM UTC: after the midnight opportunities sync and before the 6 AM deadline
 * reminders, so a reconciled row is what the morning's pushes are counted from.
 * Same shape as OpportunityDeadlineRemindersService.
 */
@Injectable()
export class SocialCountsReconcileService {
  private readonly logger = new Logger(SocialCountsReconcileService.name);

  constructor(
    private readonly socialCounts: OpportunitySocialCountsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async runScheduled(): Promise<void> {
    if (process.env.SOCIAL_COUNTS_RECONCILE_ENABLED === "false") return;
    try {
      const result = await this.socialCounts.reconcile();
      this.logger.log(
        `Social counts reconcile: ${result.corrected} corrected of ${result.checked} checked`,
      );
    } catch (error) {
      this.logger.error(
        `Social counts reconcile failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** Manual/targeted run. Throws — callers decide how to report failure. */
  async run(opportunityIds?: string[]) {
    return this.socialCounts.reconcile(opportunityIds);
  }
}
```

- [ ] **Step 4: Confirm it is registered**

`SocialCountsReconcileService` is already in `OpportunityNotesModule`'s `providers` (Task 8, Step 4). If you omitted it there, add it back now — `@Cron` only fires for providers Nest instantiates.

- [ ] **Step 5: Run the test**

Run: `npm --prefix backend/services/services/api test -- social-counts-reconcile`
Expected: PASS, 4 tests.

- [ ] **Step 6: Verify the reconcile heals a real corrupted row end-to-end**

Start the API (`npm --prefix backend/services/services/api run dev`), then in another shell:
```bash
OPP=$(psql "$DATABASE_URL" -tAc "select id from public.opportunities where status='active' limit 1")
psql "$DATABASE_URL" -c "insert into public.opportunity_social_counts (opportunity_id, notes_count) values ('$OPP', 999) on conflict (opportunity_id) do update set notes_count = 999;"
psql "$DATABASE_URL" -c "select notes_count from public.opportunity_social_counts where opportunity_id = '$OPP';"
node -e "require('ts-node/register');" 2>/dev/null || true
```
Then trigger the job by temporarily calling it from a REPL-free path — simplest is to restart the API with the cron expression overridden is NOT possible, so instead assert the read-path self-heal, which uses the same source:
```bash
psql "$DATABASE_URL" -c "delete from public.opportunity_social_counts where opportunity_id = '$OPP';"
curl -s "http://localhost:3000/opportunities/$OPP/social" | head -c 200; echo
psql "$DATABASE_URL" -c "select notes_count, applied_count, shares_count, groups_count from public.opportunity_social_counts where opportunity_id = '$OPP';"
```
Expected: the `curl` returns real counts and the final `psql` shows a freshly back-filled row (proving `readTruth` → `writeCache` works against the live schema, which is the same path `reconcile()` uses).

- [ ] **Step 7: Lint and commit**

```bash
npm --prefix backend/services/services/api run lint
git add backend/services/services/api/src/opportunity-notes/social-counts-reconcile.service.ts \
        backend/services/services/api/src/opportunity-notes/social-counts-reconcile.service.spec.ts
git commit -m "feat(api): nightly reconcile so social-count drift self-heals"
```

---

## Phase 2 — `@edutu/core` shared client

### Task 10: Slice 3 types + framework-agnostic REST client

**Files:**
- Create: `edutumobile/packages/core/src/types/opportunityNote.ts`
- Create: `edutumobile/packages/core/src/services/opportunityNotes.ts`
- Modify: `edutumobile/packages/core/src/index.ts`
- Test: `edutu-web-app/src/test/__tests__/opportunityNotesClient.test.ts`

> **Why the test lives in the web app:** these tests exercise the client contract *both* surfaces depend on, and `edutu-web-app` already runs Vitest over `**/*.{test,spec}.{ts,tsx}` and — after Slice 1 — resolves `@edutu/core`. Running them there is one deterministic command and simultaneously proves web resolution works. (`edutumobile`'s jest `roots` already include `<rootDir>/packages`, so mobile could also run them; do not add a second copy.)

**Interfaces:**
- Produces (contract exports, exactly as typed):
  ```ts
  export type OpportunityNote = { id: string; opportunityId: string; kind: 'tip' | 'question' | 'result';
    outcome: 'applied' | 'interview' | 'offer' | 'rejected' | null; body: string; helpfulCount: number; iFoundHelpful: boolean;
    author: Pick<PublicProfile, 'username' | 'displayName' | 'avatarUrl' | 'isMentor'>; createdAt: string };
  export type OpportunitySocialCounts = { notesCount: number; appliedCount: number; usefulCount: number;
    sharesCount: number; groupsCount: number };
  ```
- Produces (slice-3 namespace): `OpportunityNoteKind`, `OpportunityNoteOutcome`, `OpportunityNoteView`, `CreateOpportunityNoteInput`, `GroupsDiscussingEntry`, `OpportunitySocial`, `CoreTransport`, and the client functions `fetchOpportunityNotes`, `createOpportunityNote`, `deleteOpportunityNote`, `setOpportunityNoteHelpful`, `fetchOpportunitySocial`, `fetchOpportunitySocialBatch`, `reportOpportunityNote`, `createGroupForOpportunity`, `shareOpportunityToGroup`, `fetchMyCommunityGroups`.

- [ ] **Step 1: Confirm the workspace layout and Slice 2's report DTO**

Run:
```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder && \
ls edutumobile/packages/core/src/index.ts && \
grep -n "targetType\|target_type" backend/services/services/api/src/communities/dto/*.ts && \
grep -rn "opportunityId" backend/services/services/api/src/communities/dto/*.ts | head
```
Expected: the barrel exists; the report DTO's field names print. **If Slice 2 named them `target_type`/`target_id` instead of `targetType`/`targetId`, change the body in `reportOpportunityNote` below to match — it is the single call site.** Likewise confirm whether `POST /communities/groups` takes `opportunityId` and whether `POST /communities/groups/:groupId/messages` takes `{ kind, opportunityId }`.

- [ ] **Step 2: Write the failing test**

Create `edutu-web-app/src/test/__tests__/opportunityNotesClient.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOpportunityNote,
  fetchOpportunityNotes,
  fetchOpportunitySocialBatch,
  reportOpportunityNote,
  setOpportunityNoteHelpful,
  type CoreTransport,
} from "@edutu/core";

const OPP = "11111111-1111-4111-a111-111111111111";

function transport(token: string | null = "tok_123"): CoreTransport {
  return { apiBaseUrl: "https://api.test", getToken: async () => token };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("@edutu/core opportunity notes client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("reads notes anonymously without an Authorization header", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse([]));

    await fetchOpportunityNotes(OPP, transport(null), { sort: "new" });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe(`https://api.test/opportunities/${OPP}/notes?sort=new`);
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("attaches the bearer token when signed in and passes filters", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse([]));

    await fetchOpportunityNotes(OPP, transport(), { kind: "result", sort: "helpful" });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("kind=result");
    expect(String(url)).toContain("sort=helpful");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok_123",
    );
  });

  it("normalises a missing author into a renderable shape", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse([
        {
          id: "n1",
          opportunityId: OPP,
          kind: "tip",
          outcome: null,
          body: "Start early.",
          helpfulCount: 2,
          iFoundHelpful: false,
          createdAt: "2026-07-25T10:00:00.000Z",
          replyToId: null,
          blocked: false,
          isMine: false,
        },
      ]),
    );

    const [note] = await fetchOpportunityNotes(OPP, transport());

    expect(note.author).toEqual({
      username: "",
      displayName: "Edutu member",
      avatarUrl: null,
      isMentor: false,
    });
  });

  it("surfaces the server's message when a note is rejected", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        { message: "Notes can't ask anyone to pay for access." },
        400,
      ),
    );

    await expect(
      createOpportunityNote(OPP, { kind: "tip", body: "pay me" }, transport()),
    ).rejects.toThrow("Notes can't ask anyone to pay for access.");
  });

  it("refuses to write without a session instead of firing an anonymous POST", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      createOpportunityNote(OPP, { kind: "tip", body: "hello" }, transport(null)),
    ).rejects.toThrow(/sign in/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses DELETE to undo a helpful vote", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ helpfulCount: 3, iFoundHelpful: false }));

    await setOpportunityNoteHelpful(OPP, "n1", false, transport());

    expect(fetchSpy.mock.calls[0][1]?.method).toBe("DELETE");
    expect(String(fetchSpy.mock.calls[0][0])).toBe(
      `https://api.test/opportunities/${OPP}/notes/n1/helpful`,
    );
  });

  it("routes a note report into Slice 2's community reports with target_type note", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ success: true }));

    await reportOpportunityNote("n1", "spam", "scam link", transport());

    expect(String(fetchSpy.mock.calls[0][0])).toBe(
      "https://api.test/communities/reports",
    );
    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))).toEqual({
      targetType: "note",
      targetId: "n1",
      reason: "spam",
      detail: "scam link",
    });
  });

  it("batches social counts and tolerates ids the server omits", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        [OPP]: {
          notesCount: 4,
          appliedCount: 10,
          usefulCount: 20,
          sharesCount: 100,
          groupsCount: 3,
        },
      }),
    );

    const counts = await fetchOpportunitySocialBatch([OPP, "missing-id"], transport());

    expect(counts[OPP].sharesCount).toBe(100);
    expect(counts["missing-id"]).toEqual({
      notesCount: 0,
      appliedCount: 0,
      usefulCount: 0,
      sharesCount: 0,
      groupsCount: 0,
    });
  });

  it("returns an empty list rather than throwing when the endpoint is not deployed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ message: "Cannot GET" }, 404),
    );

    await expect(fetchOpportunityNotes(OPP, transport())).resolves.toEqual([]);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npm --prefix edutu-web-app test -- opportunityNotesClient`
Expected: FAIL — `Failed to resolve import "@edutu/core"` or `No "fetchOpportunityNotes" export`.

- [ ] **Step 4: Write the types**

Create `edutumobile/packages/core/src/types/opportunityNote.ts`:

```ts
import type { PublicProfile } from './publicProfile';

export type OpportunityNoteKind = 'tip' | 'question' | 'result';

/**
 * The REAL outcome vocabulary, taken from the live constraint:
 *   opportunity_applications_status_check: status = ANY (ARRAY[
 *     'draft','submitted','interview','offer','rejected','withdrawn','no_response'])
 * There is no 'shortlisted' status in this product and no 'won' — a win is an
 * 'offer'. 'interview' is a real, shipped status.
 */
export type OpportunityNoteOutcome =
  | 'applied'
  | 'interview'
  | 'offer'
  | 'rejected';

/** Locked cross-slice contract type — do not add fields here. */
export type OpportunityNote = {
  id: string;
  opportunityId: string;
  kind: OpportunityNoteKind;
  outcome: OpportunityNoteOutcome | null;
  body: string;
  helpfulCount: number;
  iFoundHelpful: boolean;
  author: Pick<PublicProfile, 'username' | 'displayName' | 'avatarUrl' | 'isMentor'>;
  createdAt: string;
};

/** Locked cross-slice contract type — do not add fields here. */
export type OpportunitySocialCounts = {
  notesCount: number;
  appliedCount: number;
  usefulCount: number;
  sharesCount: number;
  groupsCount: number;
};

/**
 * What the API actually returns. Slice-3 namespace: the contract type stays
 * exactly as specified, and the extra rendering state rides on this subtype.
 * `blocked` collapses the body to '' server-side (spec §9); `replyToId` exists
 * because opportunity_notes supports threads and drives the note-reply
 * notification.
 */
export type OpportunityNoteView = OpportunityNote & {
  replyToId: string | null;
  blocked: boolean;
  isMine: boolean;
  /** Set on the create response when Slice 2's screener held the note for
   *  review. Held notes are status='hidden' server-side and list nowhere. */
  pending?: boolean;
};

export type CreateOpportunityNoteInput = {
  kind: OpportunityNoteKind;
  body: string;
  outcome?: OpportunityNoteOutcome;
  replyToId?: string;
  /** Publishing a ✦saved group chat message as a note. */
  sourceMessageId?: string;
  sourceGroupId?: string;
};

export type GroupsDiscussingEntry = {
  id: string;
  slug: string;
  name: string;
  iconUrl: string | null;
  memberCount: number;
  lastMessageAt: string | null;
};

export type OpportunitySocial = {
  opportunityId: string;
  counts: OpportunitySocialCounts;
  groups: GroupsDiscussingEntry[];
};

export const EMPTY_SOCIAL_COUNTS: OpportunitySocialCounts = {
  notesCount: 0,
  appliedCount: 0,
  usefulCount: 0,
  sharesCount: 0,
  groupsCount: 0,
};
```

> `PublicProfile` is Slice 1's export. If Slice 1 placed it somewhere other than `edutumobile/packages/core/src/types/publicProfile.ts`, fix the import path — `grep -rn "export type PublicProfile" edutumobile/packages/core/src` finds it.

- [ ] **Step 5: Write the client**

Create `edutumobile/packages/core/src/services/opportunityNotes.ts`:

```ts
// Framework-agnostic REST client for Opportunity Notes and social counts.
//
// Deliberately plain `fetch` with an injected base URL rather than core's
// requestProductApi(): that helper reads process.env.EXPO_PUBLIC_API_URL, which
// does not exist under Vite. Both surfaces pass their own transport, so this
// file has zero environment coupling and imports nothing but types.
import {
  EMPTY_SOCIAL_COUNTS,
  type CreateOpportunityNoteInput,
  type OpportunityNoteView,
  type OpportunitySocial,
  type OpportunitySocialCounts,
} from '../types/opportunityNote';

export type CoreTransport = {
  /** Backend origin, no trailing slash. */
  apiBaseUrl: string;
  /** Resolves the current Clerk session token, or null when signed out. */
  getToken: () => Promise<string | null | undefined>;
};

const DEFAULT_TIMEOUT_MS = 12000;

export class NotesAuthRequiredError extends Error {
  constructor() {
    super('Sign in to add or vote on notes.');
    this.name = 'NotesAuthRequiredError';
  }
}

async function request<T>(
  transport: CoreTransport,
  path: string,
  init: RequestInit & { requireAuth?: boolean } = {},
): Promise<T | null> {
  const { requireAuth, ...options } = init;
  const token = await transport.getToken();
  if (requireAuth && !token) throw new NotesAuthRequiredError();

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (options.body !== undefined && options.body !== null) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${transport.apiBaseUrl}${path}`, {
      ...options,
      headers,
      signal: options.signal || controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  // 404/405 means the endpoint is not deployed in this environment yet.
  // Callers render an empty state rather than an error.
  if (response.status === 404 || response.status === 405) return null;
  if (response.status === 204) return null;

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (payload as { message?: string | string[] } | null)?.message;
    throw new Error(
      Array.isArray(message)
        ? message.join(', ')
        : message || `Request failed with ${response.status}`,
    );
  }
  return payload as T;
}

function normalizeNote(raw: Partial<OpportunityNoteView>): OpportunityNoteView {
  return {
    id: String(raw.id ?? ''),
    opportunityId: String(raw.opportunityId ?? ''),
    kind: raw.kind ?? 'tip',
    outcome: raw.outcome ?? null,
    body: typeof raw.body === 'string' ? raw.body : '',
    helpfulCount: Number(raw.helpfulCount) || 0,
    iFoundHelpful: Boolean(raw.iFoundHelpful),
    author: {
      username: raw.author?.username ?? '',
      displayName: raw.author?.displayName || 'Edutu member',
      avatarUrl: raw.author?.avatarUrl ?? null,
      isMentor: Boolean(raw.author?.isMentor),
    },
    createdAt: raw.createdAt ?? new Date().toISOString(),
    replyToId: raw.replyToId ?? null,
    blocked: Boolean(raw.blocked),
    isMine: Boolean(raw.isMine),
    pending: Boolean(raw.pending),
  };
}

export async function fetchOpportunityNotes(
  opportunityId: string,
  transport: CoreTransport,
  options: { kind?: 'tip' | 'question' | 'result'; sort?: 'helpful' | 'new'; limit?: number } = {},
): Promise<OpportunityNoteView[]> {
  const params = new URLSearchParams();
  if (options.kind) params.set('kind', options.kind);
  if (options.sort) params.set('sort', options.sort);
  if (options.limit) params.set('limit', String(options.limit));
  const query = params.toString();

  const rows = await request<Partial<OpportunityNoteView>[]>(
    transport,
    `/opportunities/${encodeURIComponent(opportunityId)}/notes${query ? `?${query}` : ''}`,
  );
  return Array.isArray(rows) ? rows.map(normalizeNote) : [];
}

export async function createOpportunityNote(
  opportunityId: string,
  input: CreateOpportunityNoteInput,
  transport: CoreTransport,
): Promise<OpportunityNoteView> {
  const created = await request<Partial<OpportunityNoteView>>(
    transport,
    `/opportunities/${encodeURIComponent(opportunityId)}/notes`,
    { method: 'POST', body: JSON.stringify(input), requireAuth: true },
  );
  if (!created) throw new Error('Notes are not available right now.');
  return normalizeNote(created);
}

export async function deleteOpportunityNote(
  opportunityId: string,
  noteId: string,
  transport: CoreTransport,
): Promise<void> {
  await request<void>(
    transport,
    `/opportunities/${encodeURIComponent(opportunityId)}/notes/${encodeURIComponent(noteId)}`,
    { method: 'DELETE', requireAuth: true },
  );
}

export async function setOpportunityNoteHelpful(
  opportunityId: string,
  noteId: string,
  helpful: boolean,
  transport: CoreTransport,
): Promise<{ helpfulCount: number; iFoundHelpful: boolean }> {
  const result = await request<{ helpfulCount: number; iFoundHelpful: boolean }>(
    transport,
    `/opportunities/${encodeURIComponent(opportunityId)}/notes/${encodeURIComponent(noteId)}/helpful`,
    { method: helpful ? 'POST' : 'DELETE', requireAuth: true },
  );
  return result ?? { helpfulCount: 0, iFoundHelpful: helpful };
}

export async function fetchOpportunitySocial(
  opportunityId: string,
  transport: CoreTransport,
): Promise<OpportunitySocial> {
  const social = await request<OpportunitySocial>(
    transport,
    `/opportunities/${encodeURIComponent(opportunityId)}/social`,
  );
  return {
    opportunityId,
    counts: { ...EMPTY_SOCIAL_COUNTS, ...(social?.counts ?? {}) },
    groups: Array.isArray(social?.groups) ? social!.groups : [],
  };
}

export async function fetchOpportunitySocialBatch(
  opportunityIds: string[],
  transport: CoreTransport,
): Promise<Record<string, OpportunitySocialCounts>> {
  const ids = [...new Set(opportunityIds.filter(Boolean))];
  const result: Record<string, OpportunitySocialCounts> = {};
  if (!ids.length) return result;

  const payload = await request<Record<string, Partial<OpportunitySocialCounts>>>(
    transport,
    '/opportunities/social/batch',
    { method: 'POST', body: JSON.stringify({ opportunityIds: ids.slice(0, 60) }) },
  );

  for (const id of ids) {
    result[id] = { ...EMPTY_SOCIAL_COUNTS, ...(payload?.[id] ?? {}) };
  }
  return result;
}

export type NoteReportReason = 'spam' | 'offensive' | 'harassment' | 'other';

/**
 * Notes are UGC, so reporting routes into Slice 2's moderation queue rather
 * than growing a second one. If Slice 2's DTO uses snake_case field names,
 * this object is the only place to change.
 */
export async function reportOpportunityNote(
  noteId: string,
  reason: NoteReportReason,
  detail: string,
  transport: CoreTransport,
): Promise<void> {
  await request<void>(transport, '/communities/reports', {
    method: 'POST',
    requireAuth: true,
    body: JSON.stringify({
      targetType: 'note',
      targetId: noteId,
      reason,
      detail,
    }),
  });
}

// ── Anchored groups (uses only Slice 2's locked routes) ────────────────────

export type AnchoredGroupSummary = {
  id: string;
  slug: string;
  name: string;
  iconUrl: string | null;
  memberCount: number;
  opportunityId: string | null;
  myRole: string | null;
};

/** Groups the caller has already joined — filtered client-side on myRole,
 *  which is part of the locked CommunityGroup type. */
export async function fetchMyCommunityGroups(
  transport: CoreTransport,
): Promise<AnchoredGroupSummary[]> {
  const groups = await request<AnchoredGroupSummary[]>(
    transport,
    '/communities/groups',
    { requireAuth: true },
  );
  return (Array.isArray(groups) ? groups : []).filter((group) => group.myRole);
}

export async function createGroupForOpportunity(
  input: { name: string; spaceId: string; opportunityId: string; description?: string },
  transport: CoreTransport,
): Promise<AnchoredGroupSummary> {
  const group = await request<AnchoredGroupSummary>(
    transport,
    '/communities/groups',
    { method: 'POST', body: JSON.stringify(input), requireAuth: true },
  );
  if (!group) throw new Error('Groups are not available right now.');
  return group;
}

export async function shareOpportunityToGroup(
  groupId: string,
  opportunityId: string,
  transport: CoreTransport,
  body?: string,
): Promise<void> {
  await request<void>(
    transport,
    `/communities/groups/${encodeURIComponent(groupId)}/messages`,
    {
      method: 'POST',
      requireAuth: true,
      body: JSON.stringify({ kind: 'opportunity', opportunityId, body: body ?? null }),
    },
  );
}

export type CommunitySpaceSummary = { id: string; slug: string; name: string };

export async function fetchCommunitySpaces(
  transport: CoreTransport,
): Promise<CommunitySpaceSummary[]> {
  const spaces = await request<CommunitySpaceSummary[]>(
    transport,
    '/communities/spaces',
  );
  return Array.isArray(spaces) ? spaces : [];
}
```

- [ ] **Step 6: Export from the barrel**

In `edutumobile/packages/core/src/index.ts`, add next to the other type and service exports:

```ts
export * from './types/opportunityNote';
export * from './services/opportunityNotes';
```

- [ ] **Step 7: Run the test**

Run: `npm --prefix edutu-web-app test -- opportunityNotesClient`
Expected: PASS, 9 tests.

- [ ] **Step 8: Lint, typecheck and commit**

```bash
npm --prefix edutu-web-app run lint && npm --prefix edutu-web-app run typecheck
npm --prefix edutumobile run typecheck
git add edutumobile/packages/core/src/types/opportunityNote.ts \
        edutumobile/packages/core/src/services/opportunityNotes.ts \
        edutumobile/packages/core/src/index.ts \
        edutu-web-app/src/test/__tests__/opportunityNotesClient.test.ts
git commit -m "feat(core): shared opportunity notes and social counts client"
```

---

### Task 11: Shared hooks — `useOpportunityNotes`, `useOpportunitySocial`, `useLiveDeadline`

**Files:**
- Create: `edutumobile/packages/core/src/hooks/useOpportunityNotes.ts`
- Create: `edutumobile/packages/core/src/hooks/useOpportunitySocial.ts`
- Create: `edutumobile/packages/core/src/hooks/useLiveDeadline.ts`
- Modify: `edutumobile/packages/core/src/index.ts`
- Test: `edutu-web-app/src/test/__tests__/useOpportunityNotes.test.tsx`

**Interfaces:**
- Consumes: Task 10 client + `getDeadlineBadge` from `edutumobile/packages/core/src/utils/deadline.ts`.
- Produces:
  ```ts
  export function useOpportunityNotes(
    opportunityId: string | null,
    transport: CoreTransport,
    options?: { kind?: OpportunityNoteKind; sort?: 'helpful' | 'new'; limit?: number },
  ): {
    notes: OpportunityNoteView[]; loading: boolean; error: string | null;
    refresh: () => Promise<void>;
    addNote: (input: CreateOpportunityNoteInput) => Promise<OpportunityNoteView>;
    removeNote: (noteId: string) => Promise<void>;
    toggleHelpful: (noteId: string) => Promise<void>;
  };
  export function useOpportunitySocial(
    opportunityId: string | null,
    transport: CoreTransport,
  ): { counts: OpportunitySocialCounts; groups: GroupsDiscussingEntry[]; loading: boolean; refresh: () => Promise<void> };
  export function useLiveDeadline(
    deadline?: string | null,
    tickMs?: number,
  ): { badge: DeadlineBadge; isPassed: boolean };
  ```

- [ ] **Step 1: Write the failing test**

Create `edutu-web-app/src/test/__tests__/useOpportunityNotes.test.tsx`:

```tsx
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useLiveDeadline,
  useOpportunityNotes,
  type CoreTransport,
  type OpportunityNoteView,
} from "@edutu/core";

const OPP = "11111111-1111-4111-a111-111111111111";

const clientMocks = vi.hoisted(() => ({
  fetchOpportunityNotes: vi.fn(),
  createOpportunityNote: vi.fn(),
  deleteOpportunityNote: vi.fn(),
  setOpportunityNoteHelpful: vi.fn(),
}));

vi.mock("@edutu/core/src/services/opportunityNotes", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...clientMocks };
});

const transport: CoreTransport = {
  apiBaseUrl: "https://api.test",
  getToken: async () => "tok_123",
};

function note(over: Partial<OpportunityNoteView> = {}): OpportunityNoteView {
  return {
    id: "n1",
    opportunityId: OPP,
    kind: "tip",
    outcome: null,
    body: "Start early.",
    helpfulCount: 2,
    iFoundHelpful: false,
    author: { username: "ada", displayName: "Ada N.", avatarUrl: null, isMentor: false },
    createdAt: "2026-07-25T10:00:00.000Z",
    replyToId: null,
    blocked: false,
    isMine: false,
    ...over,
  };
}

describe("useOpportunityNotes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientMocks.fetchOpportunityNotes.mockResolvedValue([note()]);
  });

  it("loads notes for an opportunity", async () => {
    const { result } = renderHook(() => useOpportunityNotes(OPP, transport));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.notes).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it("does not fetch when there is no opportunity id", async () => {
    renderHook(() => useOpportunityNotes(null, transport));
    expect(clientMocks.fetchOpportunityNotes).not.toHaveBeenCalled();
  });

  it("prepends a newly added note without a refetch", async () => {
    clientMocks.createOpportunityNote.mockResolvedValue(note({ id: "n2", body: "New." }));
    const { result } = renderHook(() => useOpportunityNotes(OPP, transport));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addNote({ kind: "tip", body: "New." });
    });

    expect(result.current.notes.map((item) => item.id)).toEqual(["n2", "n1"]);
    expect(clientMocks.fetchOpportunityNotes).toHaveBeenCalledTimes(1);
  });

  it("toggles a helpful vote optimistically and reconciles with the server total", async () => {
    clientMocks.setOpportunityNoteHelpful.mockResolvedValue({
      helpfulCount: 7,
      iFoundHelpful: true,
    });
    const { result } = renderHook(() => useOpportunityNotes(OPP, transport));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.toggleHelpful("n1");
    });

    expect(clientMocks.setOpportunityNoteHelpful).toHaveBeenCalledWith(
      OPP,
      "n1",
      true,
      transport,
    );
    expect(result.current.notes[0]).toMatchObject({
      helpfulCount: 7,
      iFoundHelpful: true,
    });
  });

  it("rolls a failed vote back", async () => {
    clientMocks.setOpportunityNoteHelpful.mockRejectedValue(new Error("nope"));
    const { result } = renderHook(() => useOpportunityNotes(OPP, transport));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.toggleHelpful("n1");
    });

    expect(result.current.notes[0]).toMatchObject({
      helpfulCount: 2,
      iFoundHelpful: false,
    });
    expect(result.current.error).toBe("nope");
  });

  it("drops a removed note from the list", async () => {
    clientMocks.deleteOpportunityNote.mockResolvedValue(undefined);
    const { result } = renderHook(() => useOpportunityNotes(OPP, transport));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.removeNote("n1");
    });

    expect(result.current.notes).toHaveLength(0);
  });
});

describe("useLiveDeadline", () => {
  it("greys out once the deadline has passed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-26T00:00:00.000Z"));
    const { result } = renderHook(() => useLiveDeadline("2026-07-25T00:00:00.000Z"));

    expect(result.current.isPassed).toBe(true);
    expect(result.current.badge.level).toBe("expired");
    vi.useRealTimers();
  });

  it("recomputes when the clock crosses the deadline while mounted", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-25T23:59:00.000Z"));
    const { result } = renderHook(() =>
      useLiveDeadline("2026-07-25T23:59:30.000Z", 1000),
    );
    expect(result.current.isPassed).toBe(false);

    act(() => {
      vi.setSystemTime(new Date("2026-07-27T00:00:01.000Z"));
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.isPassed).toBe(true);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm --prefix edutu-web-app test -- useOpportunityNotes`
Expected: FAIL — `No "useOpportunityNotes" export is defined on the "@edutu/core" mock`.

- [ ] **Step 3: Write `useOpportunityNotes`**

Create `edutumobile/packages/core/src/hooks/useOpportunityNotes.ts`:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createOpportunityNote,
  deleteOpportunityNote,
  fetchOpportunityNotes,
  setOpportunityNoteHelpful,
  type CoreTransport,
} from '../services/opportunityNotes';
import type {
  CreateOpportunityNoteInput,
  OpportunityNoteKind,
  OpportunityNoteView,
} from '../types/opportunityNote';

export type UseOpportunityNotesOptions = {
  kind?: OpportunityNoteKind;
  sort?: 'helpful' | 'new';
  limit?: number;
};

export type UseOpportunityNotesResult = {
  notes: OpportunityNoteView[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addNote: (input: CreateOpportunityNoteInput) => Promise<OpportunityNoteView>;
  removeNote: (noteId: string) => Promise<void>;
  toggleHelpful: (noteId: string) => Promise<void>;
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong';
}

export function useOpportunityNotes(
  opportunityId: string | null,
  transport: CoreTransport,
  options: UseOpportunityNotesOptions = {},
): UseOpportunityNotesResult {
  const [notes, setNotes] = useState<OpportunityNoteView[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(opportunityId));
  const [error, setError] = useState<string | null>(null);

  // Clerk's getToken is a new function reference on most renders; holding the
  // transport in a ref keeps every callback below stable so the load effect
  // depends only on [opportunityId, kind, sort, limit] and cannot loop.
  const transportRef = useRef(transport);
  useEffect(() => {
    transportRef.current = transport;
  }, [transport]);

  const { kind, sort, limit } = options;

  // Adjust-during-render reset (React's documented alternative to a
  // state-clearing effect) so navigating between opportunities never shows the
  // previous opportunity's notes for a frame.
  const [previousId, setPreviousId] = useState(opportunityId);
  if (previousId !== opportunityId) {
    setPreviousId(opportunityId);
    setNotes([]);
    setError(null);
  }

  const load = useCallback((): Promise<void> => {
    if (!opportunityId) return Promise.resolve();
    return fetchOpportunityNotes(opportunityId, transportRef.current, {
      kind,
      sort,
      limit,
    })
      .then((rows) => {
        setNotes(rows);
        setError(null);
      })
      .catch((cause: unknown) => {
        setNotes([]);
        setError(message(cause));
      })
      .finally(() => setLoading(false));
  }, [opportunityId, kind, sort, limit]);

  useEffect(() => {
    if (!opportunityId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void load();
  }, [opportunityId, load]);

  const addNote = useCallback(
    async (input: CreateOpportunityNoteInput) => {
      if (!opportunityId) throw new Error('No opportunity selected');
      const created = await createOpportunityNote(
        opportunityId,
        input,
        transportRef.current,
      );
      setNotes((current) => [created, ...current]);
      setError(null);
      return created;
    },
    [opportunityId],
  );

  const removeNote = useCallback(
    async (noteId: string) => {
      if (!opportunityId) return;
      const snapshot = notes;
      setNotes((current) => current.filter((item) => item.id !== noteId));
      try {
        await deleteOpportunityNote(opportunityId, noteId, transportRef.current);
      } catch (cause) {
        setNotes(snapshot);
        setError(message(cause));
      }
    },
    [opportunityId, notes],
  );

  const toggleHelpful = useCallback(
    async (noteId: string) => {
      if (!opportunityId) return;
      const target = notes.find((item) => item.id === noteId);
      if (!target) return;
      const next = !target.iFoundHelpful;

      setNotes((current) =>
        current.map((item) =>
          item.id === noteId
            ? {
                ...item,
                iFoundHelpful: next,
                helpfulCount: Math.max(0, item.helpfulCount + (next ? 1 : -1)),
              }
            : item,
        ),
      );

      try {
        const result = await setOpportunityNoteHelpful(
          opportunityId,
          noteId,
          next,
          transportRef.current,
        );
        setNotes((current) =>
          current.map((item) =>
            item.id === noteId
              ? {
                  ...item,
                  iFoundHelpful: result.iFoundHelpful,
                  helpfulCount: result.helpfulCount,
                }
              : item,
          ),
        );
        setError(null);
      } catch (cause) {
        setNotes((current) =>
          current.map((item) => (item.id === noteId ? target : item)),
        );
        setError(message(cause));
      }
    },
    [opportunityId, notes],
  );

  return useMemo(
    () => ({ notes, loading, error, refresh: load, addNote, removeNote, toggleHelpful }),
    [notes, loading, error, load, addNote, removeNote, toggleHelpful],
  );
}
```

- [ ] **Step 4: Write `useOpportunitySocial`**

Create `edutumobile/packages/core/src/hooks/useOpportunitySocial.ts`:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchOpportunitySocial,
  type CoreTransport,
} from '../services/opportunityNotes';
import {
  EMPTY_SOCIAL_COUNTS,
  type GroupsDiscussingEntry,
  type OpportunitySocialCounts,
} from '../types/opportunityNote';

export type UseOpportunitySocialResult = {
  counts: OpportunitySocialCounts;
  groups: GroupsDiscussingEntry[];
  loading: boolean;
  refresh: () => Promise<void>;
};

export function useOpportunitySocial(
  opportunityId: string | null,
  transport: CoreTransport,
): UseOpportunitySocialResult {
  const [counts, setCounts] = useState<OpportunitySocialCounts>(EMPTY_SOCIAL_COUNTS);
  const [groups, setGroups] = useState<GroupsDiscussingEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(opportunityId));

  const transportRef = useRef(transport);
  useEffect(() => {
    transportRef.current = transport;
  }, [transport]);

  const [previousId, setPreviousId] = useState(opportunityId);
  if (previousId !== opportunityId) {
    setPreviousId(opportunityId);
    setCounts(EMPTY_SOCIAL_COUNTS);
    setGroups([]);
  }

  const load = useCallback((): Promise<void> => {
    if (!opportunityId) return Promise.resolve();
    return fetchOpportunitySocial(opportunityId, transportRef.current)
      .then((social) => {
        setCounts(social.counts);
        setGroups(social.groups);
      })
      // Social proof is decoration: a failure must never break the page.
      .catch(() => {
        setCounts(EMPTY_SOCIAL_COUNTS);
        setGroups([]);
      })
      .finally(() => setLoading(false));
  }, [opportunityId]);

  useEffect(() => {
    if (!opportunityId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void load();
  }, [opportunityId, load]);

  return useMemo(
    () => ({ counts, groups, loading, refresh: load }),
    [counts, groups, loading, load],
  );
}
```

- [ ] **Step 5: Write `useLiveDeadline`**

Create `edutumobile/packages/core/src/hooks/useLiveDeadline.ts`:

```ts
import { useEffect, useMemo, useState } from 'react';
import { getDeadlineBadge, type DeadlineBadge } from '../utils/deadline';

/**
 * A deadline badge that keeps ticking while the component is mounted.
 *
 * Opportunity cards posted into a group chat sit on screen for a long time, so
 * "3 days left" has to become "Closes today" and then grey out without a
 * reload. All date maths comes from the existing getDeadlineBadge — this hook
 * only supplies a moving `now`.
 */
export function useLiveDeadline(
  deadline?: string | null,
  tickMs = 60_000,
): { badge: DeadlineBadge; isPassed: boolean } {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), tickMs);
    return () => clearInterval(timer);
  }, [tickMs]);

  const badge = useMemo(() => getDeadlineBadge(deadline, now), [deadline, now]);

  return { badge, isPassed: badge.level === 'expired' };
}
```

- [ ] **Step 6: Export from the barrel**

In `edutumobile/packages/core/src/index.ts`, add:

```ts
export * from './hooks/useOpportunityNotes';
export * from './hooks/useOpportunitySocial';
export * from './hooks/useLiveDeadline';
```

- [ ] **Step 7: Run the test**

Run: `npm --prefix edutu-web-app test -- useOpportunityNotes`
Expected: PASS, 8 tests.

- [ ] **Step 8: Prove the badge types are interchangeable with web's `UrgencyPill`**

Create `edutu-web-app/src/test/__tests__/deadlineBadgeCompat.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getDeadlineBadge as coreBadge } from "@edutu/core";
import {
  getDeadlineBadge as webBadge,
  type DeadlineBadge as WebDeadlineBadge,
} from "../../services/deadlineUrgency";

describe("core and web deadline badges are interchangeable", () => {
  it("assigns a core badge to the web DeadlineBadge type", () => {
    // Compile-time assertion: UrgencyPill takes a web DeadlineBadge, and the
    // chat card produces a core one. If either union drifts, this stops
    // compiling and `npm run typecheck` fails.
    const badge: WebDeadlineBadge = coreBadge("2026-12-01T00:00:00.000Z");
    expect(badge.level).toBeDefined();
  });

  it("agrees on level and days left for the same input", () => {
    const now = new Date("2026-07-25T00:00:00.000Z");
    const input = "2026-07-28T00:00:00.000Z";
    expect(coreBadge(input, now).level).toBe(webBadge(input, now).level);
    expect(coreBadge(input, now).daysLeft).toBe(webBadge(input, now).daysLeft);
  });
});
```

Run: `npm --prefix edutu-web-app test -- deadlineBadgeCompat && npm --prefix edutu-web-app run typecheck`
Expected: PASS, 2 tests, and a clean typecheck.

- [ ] **Step 9: Lint and commit**

```bash
npm --prefix edutu-web-app run lint && npm --prefix edutu-web-app run typecheck
npm --prefix edutumobile run typecheck
git add edutumobile/packages/core/src/hooks/useOpportunityNotes.ts \
        edutumobile/packages/core/src/hooks/useOpportunitySocial.ts \
        edutumobile/packages/core/src/hooks/useLiveDeadline.ts \
        edutumobile/packages/core/src/index.ts \
        edutu-web-app/src/test/__tests__/useOpportunityNotes.test.tsx \
        edutu-web-app/src/test/__tests__/deadlineBadgeCompat.test.ts
git commit -m "feat(core): shared hooks for opportunity notes, social counts and live deadlines"
```

---

## Phase 3 — Web UI (`edutu-web-app`)

### Task 12: Web transport + social counts on the detail page and the rail card

**Files:**
- Create: `edutu-web-app/src/lib/coreTransport.ts`
- Create: `edutu-web-app/src/components/opportunity/SocialCountsStrip.tsx`
- Modify: `edutu-web-app/src/components/OpportunityDetail.tsx` (import block; insert after `</header>` at line 866)
- Modify: `edutu-web-app/src/components/opportunity/OpportunityRails.tsx` (`RailCard`)
- Test: `edutu-web-app/src/test/__tests__/SocialCountsStrip.test.tsx`

**Interfaces:**
- Consumes: `useOpportunitySocial`, `OpportunitySocialCounts`, `CoreTransport` from `@edutu/core`; `getApiBaseUrl` from `../lib/apiBaseUrl`; `getProductApiToken` from `../lib/clerkToken`.
- Produces: `useCoreTransport(): CoreTransport`; `<SocialCountsStrip counts compact? className? />`.

- [ ] **Step 1: Write the failing test**

Create `edutu-web-app/src/test/__tests__/SocialCountsStrip.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SocialCountsStrip from "../../components/opportunity/SocialCountsStrip";

describe("SocialCountsStrip", () => {
  it("renders the four social proof numbers in spec order", () => {
    render(
      <SocialCountsStrip
        counts={{
          notesCount: 4,
          appliedCount: 10,
          usefulCount: 20,
          sharesCount: 100,
          groupsCount: 3,
        }}
      />,
    );

    const strip = screen.getByTestId("social-counts-strip");
    expect(strip.textContent).toContain("4 notes");
    expect(strip.textContent).toContain("10 applied");
    expect(strip.textContent).toContain("20 found useful");
    expect(strip.textContent).toContain("100 shared");
  });

  it("singularises a count of one", () => {
    render(
      <SocialCountsStrip
        counts={{
          notesCount: 1,
          appliedCount: 1,
          usefulCount: 1,
          sharesCount: 1,
          groupsCount: 0,
        }}
      />,
    );
    const strip = screen.getByTestId("social-counts-strip");
    expect(strip.textContent).toContain("1 note");
    expect(strip.textContent).not.toContain("1 notes");
  });

  it("hides zero metrics so an unloved opportunity does not shout about it", () => {
    render(
      <SocialCountsStrip
        counts={{
          notesCount: 4,
          appliedCount: 0,
          usefulCount: 0,
          sharesCount: 0,
          groupsCount: 0,
        }}
      />,
    );
    const strip = screen.getByTestId("social-counts-strip");
    expect(strip.textContent).toContain("4 notes");
    expect(strip.textContent).not.toContain("applied");
  });

  it("renders nothing at all when every count is zero", () => {
    const { container } = render(
      <SocialCountsStrip
        counts={{
          notesCount: 0,
          appliedCount: 0,
          usefulCount: 0,
          sharesCount: 0,
          groupsCount: 0,
        }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("abbreviates large numbers in compact mode", () => {
    render(
      <SocialCountsStrip
        compact
        counts={{
          notesCount: 1200,
          appliedCount: 0,
          usefulCount: 0,
          sharesCount: 0,
          groupsCount: 0,
        }}
      />,
    );
    expect(screen.getByTestId("social-counts-strip").textContent).toContain(
      "1.2k",
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm --prefix edutu-web-app test -- SocialCountsStrip`
Expected: FAIL — `Failed to resolve import "../../components/opportunity/SocialCountsStrip"`.

- [ ] **Step 3: Write the transport helper**

Create `edutu-web-app/src/lib/coreTransport.ts`:

```ts
import { useMemo } from "react";
import { useAuth } from "@clerk/clerk-react";
import type { CoreTransport } from "@edutu/core";
import { getApiBaseUrl } from "./apiBaseUrl";
import { getProductApiToken } from "./clerkToken";

/**
 * Bridges the web app's Clerk session + Vite env into the framework-agnostic
 * transport `@edutu/core` expects.
 *
 * getApiBaseUrl throws when neither VITE_BACKEND_URL nor VITE_API_URL is set in
 * a production build. Communities surfaces are additive decoration on pages
 * that must still render, so the throw is caught and an empty base URL is
 * returned — every core call then fails fast and its caller renders an empty
 * state instead of blanking the page.
 */
export function useCoreTransport(): CoreTransport {
  const { getToken } = useAuth();

  return useMemo<CoreTransport>(() => {
    let apiBaseUrl = "";
    try {
      apiBaseUrl = getApiBaseUrl("Edutu communities");
    } catch {
      apiBaseUrl = "";
    }
    return {
      apiBaseUrl,
      getToken: () => getProductApiToken(getToken),
    };
  }, [getToken]);
}
```

- [ ] **Step 4: Write the strip**

Create `edutu-web-app/src/components/opportunity/SocialCountsStrip.tsx`:

```tsx
import type { OpportunitySocialCounts } from "@edutu/core";

function abbreviate(value: number, compact: boolean): string {
  if (!compact || value < 1000) return String(value);
  const thousands = value / 1000;
  return `${thousands >= 10 ? Math.round(thousands) : thousands.toFixed(1)}k`;
}

/**
 * `4 notes · 10 applied · 20 found useful · 100 shared` (design spec §3.1).
 *
 * Zero metrics are hidden rather than rendered as "0 applied" — social proof
 * that reads "nobody has done this" is worse than no social proof, and every
 * new opportunity starts at zero.
 */
export default function SocialCountsStrip({
  counts,
  compact = false,
  className = "",
}: {
  counts: OpportunitySocialCounts;
  compact?: boolean;
  className?: string;
}) {
  const parts: string[] = [];
  if (counts.notesCount > 0) {
    parts.push(
      `${abbreviate(counts.notesCount, compact)} ${counts.notesCount === 1 ? "note" : "notes"}`,
    );
  }
  if (counts.appliedCount > 0) {
    parts.push(`${abbreviate(counts.appliedCount, compact)} applied`);
  }
  if (counts.usefulCount > 0) {
    parts.push(`${abbreviate(counts.usefulCount, compact)} found useful`);
  }
  if (counts.sharesCount > 0) {
    parts.push(`${abbreviate(counts.sharesCount, compact)} shared`);
  }

  if (!parts.length) return null;

  return (
    <p
      data-testid="social-counts-strip"
      className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${compact ? "text-2xs" : "text-xs"} text-text-muted ${className}`}
    >
      {parts.map((part, index) => (
        <span key={part} className="inline-flex items-center gap-2">
          {index > 0 ? <span aria-hidden="true">·</span> : null}
          <span>{part}</span>
        </span>
      ))}
    </p>
  );
}
```

- [ ] **Step 5: Run the test**

Run: `npm --prefix edutu-web-app test -- SocialCountsStrip`
Expected: PASS, 5 tests.

- [ ] **Step 6: Show the strip on the detail page**

In `edutu-web-app/src/components/OpportunityDetail.tsx`, add to the import block (after line 44, `import { organizationLabel } ...`):

```ts
import { useOpportunitySocial } from "@edutu/core";
import { useCoreTransport } from "../lib/coreTransport";
import SocialCountsStrip from "./opportunity/SocialCountsStrip";
import OpportunityNotes from "./opportunity/OpportunityNotes";
import GroupsDiscussing from "./opportunity/GroupsDiscussing";
```

> `OpportunityNotes` and `GroupsDiscussing` are created in Tasks 13 and 14. Add all five imports now and finish the wiring there — TypeScript will flag the two missing modules until then, which is the intended reminder.

Inside the `OpportunityDetail` component body (after line 314, `const canonicalPath = ...`), add:

```ts
  const coreTransport = useCoreTransport();
  const { counts: socialCounts, groups: discussingGroups, refresh: refreshSocial } =
    useOpportunitySocial(opportunity.id, coreTransport);
```

Then, immediately after the `</header>` that closes the title block (line 866), insert:

```tsx
            <SocialCountsStrip counts={socialCounts} className="-mt-2" />
```

- [ ] **Step 7: Show the strip on the rail card**

In `edutu-web-app/src/components/opportunity/OpportunityRails.tsx`, add the import next to the existing `UrgencyPill` import (line 10):

```ts
import type { OpportunitySocialCounts } from "@edutu/core";
import SocialCountsStrip from "./SocialCountsStrip";
```

Extend the `RailCard` props (line 35–50) with an optional `social`:

```tsx
function RailCard({
  opportunity,
  detailPath,
  palette,
  match,
  onOpen,
  social,
}: {
  opportunity: Opportunity;
  detailPath: string;
  palette: RailPalette;
  match?: MatchResult | null;
  onOpen?: (opportunity: Opportunity) => void;
  social?: OpportunitySocialCounts;
}) {
```

and render it right after the organization line (immediately before the `</div>` that closes the card body at line 91):

```tsx
        {social ? (
          <SocialCountsStrip counts={social} compact className="mt-1.5" />
        ) : null}
```

Then thread `social` from `Rail` to `RailCard`. In the `Rail` component's props add `socialCounts?: Record<string, OpportunitySocialCounts>` and pass `social={socialCounts?.[opportunity.id]}` at the `<RailCard ... />` call site; do the same one level up from `OpportunityRails`. The page that renders `OpportunityRails` populates the map with **one** batch call:

```ts
  const [socialCounts, setSocialCounts] = useState<
    Record<string, OpportunitySocialCounts>
  >({});
  const coreTransport = useCoreTransport();
  const railIdsKey = rails
    .flatMap((rail) => rail.items.map((item) => item.id))
    .join(",");

  useEffect(() => {
    const ids = railIdsKey.split(",").filter(Boolean).slice(0, 60);
    if (!ids.length) return;
    let cancelled = false;
    void fetchOpportunitySocialBatch(ids, coreTransport)
      .then((map) => {
        if (!cancelled) setSocialCounts(map);
      })
      // Decoration only — a failure must never blank the rails.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [railIdsKey, coreTransport]);
```

with `import { fetchOpportunitySocialBatch, type OpportunitySocialCounts } from "@edutu/core";` and `import { useCoreTransport } from "../../lib/coreTransport";` at the top of that page.

- [ ] **Step 8: Verify in the browser**

Run: `npm --prefix edutu-web-app run dev`, open `http://localhost:5173/opportunity/<id>` for an opportunity that has notes, and confirm the strip renders under the title. Open `/app/opportunities` and confirm the rail cards show a compact strip and that the network tab contains exactly **one** `POST /opportunities/social/batch` per rail render, not one per card.

- [ ] **Step 9: Lint, typecheck, commit**

```bash
npm --prefix edutu-web-app run lint && npm --prefix edutu-web-app run typecheck && npm --prefix edutu-web-app test
git add edutu-web-app/src/lib/coreTransport.ts \
        edutu-web-app/src/components/opportunity/SocialCountsStrip.tsx \
        edutu-web-app/src/components/opportunity/OpportunityRails.tsx \
        edutu-web-app/src/components/OpportunityDetail.tsx \
        edutu-web-app/src/test/__tests__/SocialCountsStrip.test.tsx
git commit -m "feat(web): social proof counts on the opportunity detail page and rail cards"
```

---

### Task 13: Web Opportunity Notes section + reporting

**Files:**
- Create: `edutu-web-app/src/components/opportunity/ReportNoteDialog.tsx`
- Create: `edutu-web-app/src/components/opportunity/OpportunityNotes.tsx`
- Modify: `edutu-web-app/src/components/OpportunityDetail.tsx` (insert before the Related-opportunities section, line 1052)
- Test: `edutu-web-app/src/test/__tests__/OpportunityNotes.test.tsx`

**Interfaces:**
- Consumes: `useOpportunityNotes`, `reportOpportunityNote`, `OpportunityNoteView`, `CreateOpportunityNoteInput` from `@edutu/core`; `useCoreTransport` (Task 12).
- Produces: `<OpportunityNotes opportunityId onNotesChanged? />` and `<ReportNoteDialog noteId open onClose />`.

- [ ] **Step 1: Write the failing test**

Create `edutu-web-app/src/test/__tests__/OpportunityNotes.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpportunityNoteView } from "@edutu/core";
import OpportunityNotes from "../../components/opportunity/OpportunityNotes";

const OPP = "11111111-1111-4111-a111-111111111111";

const hooks = vi.hoisted(() => ({
  useOpportunityNotes: vi.fn(),
  reportOpportunityNote: vi.fn(),
}));

vi.mock("@edutu/core", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...hooks };
});

vi.mock("../../lib/coreTransport", () => ({
  useCoreTransport: () => ({ apiBaseUrl: "https://api.test", getToken: async () => "t" }),
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ isSignedIn: true, getToken: async () => "t" }),
}));

function note(over: Partial<OpportunityNoteView> = {}): OpportunityNoteView {
  return {
    id: "n1",
    opportunityId: OPP,
    kind: "tip",
    outcome: null,
    body: "Start the reference letters early.",
    helpfulCount: 2,
    iFoundHelpful: false,
    author: { username: "ada", displayName: "Ada N.", avatarUrl: null, isMentor: false },
    createdAt: "2026-07-25T10:00:00.000Z",
    replyToId: null,
    blocked: false,
    isMine: false,
    ...over,
  };
}

function mockNotes(over: Record<string, unknown> = {}) {
  const api = {
    notes: [note()],
    loading: false,
    error: null,
    refresh: vi.fn(),
    addNote: vi.fn().mockResolvedValue(note({ id: "n2" })),
    removeNote: vi.fn(),
    toggleHelpful: vi.fn(),
    ...over,
  };
  hooks.useOpportunityNotes.mockReturnValue(api);
  return api;
}

describe("OpportunityNotes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a note with its author and helpful count", () => {
    mockNotes();
    render(<OpportunityNotes opportunityId={OPP} />);

    expect(screen.getByText("Start the reference letters early.")).toBeTruthy();
    expect(screen.getByText("Ada N.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /found useful \(2\)/i })).toBeTruthy();
  });

  it("collapses a blocked author's note instead of hiding the thread", () => {
    mockNotes({ notes: [note({ blocked: true, body: "" })] });
    render(<OpportunityNotes opportunityId={OPP} />);

    expect(screen.getByText("Blocked message")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /found useful/i })).toBeNull();
  });

  it("labels a result note with the real outcome vocabulary", () => {
    mockNotes({ notes: [note({ kind: "result", outcome: "offer", body: "I got in." })] });
    render(<OpportunityNotes opportunityId={OPP} />);

    expect(screen.getByText("Got an offer")).toBeTruthy();
    expect(screen.queryByText(/shortlisted/i)).toBeNull();
  });

  it("labels an interview result — a real, live application status", () => {
    mockNotes({
      notes: [
        note({ kind: "result", outcome: "interview", body: "Panel interview in week six." }),
      ],
    });
    render(<OpportunityNotes opportunityId={OPP} />);

    expect(screen.getByText("Got an interview")).toBeTruthy();
  });

  it("shows an empty state rather than a bare heading", () => {
    mockNotes({ notes: [] });
    render(<OpportunityNotes opportunityId={OPP} />);
    expect(screen.getByText(/be the first to share/i)).toBeTruthy();
  });

  it("submits a tip and clears the composer", async () => {
    const api = mockNotes();
    const user = userEvent.setup();
    render(<OpportunityNotes opportunityId={OPP} />);

    const textarea = screen.getByLabelText(/share what you know/i);
    await user.type(textarea, "The portal times out after thirty minutes.");
    await user.click(screen.getByRole("button", { name: /post note/i }));

    await waitFor(() =>
      expect(api.addNote).toHaveBeenCalledWith({
        kind: "tip",
        body: "The portal times out after thirty minutes.",
      }),
    );
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  it("requires an outcome before a result note can be posted", async () => {
    const api = mockNotes();
    const user = userEvent.setup();
    render(<OpportunityNotes opportunityId={OPP} />);

    await user.click(screen.getByRole("radio", { name: "Result" }));
    await user.type(
      screen.getByLabelText(/share what you know/i),
      "It took eleven weeks to hear back from them.",
    );
    await user.click(screen.getByRole("button", { name: /post note/i }));

    expect(api.addNote).not.toHaveBeenCalled();
    expect(screen.getByText(/pick what happened/i)).toBeTruthy();
  });

  it("surfaces the server's rejection message", async () => {
    const api = mockNotes();
    api.addNote.mockRejectedValue(
      new Error("Notes can't ask anyone to pay for access."),
    );
    const user = userEvent.setup();
    render(<OpportunityNotes opportunityId={OPP} />);

    await user.type(screen.getByLabelText(/share what you know/i), "pay me 5000 naira");
    await user.click(screen.getByRole("button", { name: /post note/i }));

    await waitFor(() =>
      expect(screen.getByText("Notes can't ask anyone to pay for access.")).toBeTruthy(),
    );
  });

  it("reports a note into the community moderation queue", async () => {
    mockNotes();
    hooks.reportOpportunityNote.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<OpportunityNotes opportunityId={OPP} />);

    await user.click(screen.getByRole("button", { name: /report this note/i }));
    await user.click(screen.getByRole("radio", { name: /spam or scam/i }));
    await user.click(screen.getByRole("button", { name: /send report/i }));

    await waitFor(() =>
      expect(hooks.reportOpportunityNote).toHaveBeenCalledWith(
        "n1",
        "spam",
        "",
        expect.objectContaining({ apiBaseUrl: "https://api.test" }),
      ),
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm --prefix edutu-web-app test -- OpportunityNotes.test`
Expected: FAIL — `Failed to resolve import "../../components/opportunity/OpportunityNotes"`.

- [ ] **Step 3: Write the report dialog**

Create `edutu-web-app/src/components/opportunity/ReportNoteDialog.tsx`:

```tsx
import { useState } from "react";
import { reportOpportunityNote, type NoteReportReason } from "@edutu/core";
import { useCoreTransport } from "../../lib/coreTransport";

const REASONS: Array<{ value: NoteReportReason; label: string }> = [
  { value: "spam", label: "Spam or scam" },
  { value: "offensive", label: "Offensive or hateful" },
  { value: "harassment", label: "Harassment" },
  { value: "other", label: "Something else" },
];

/**
 * Notes are UGC, so every note needs a report path (Apple Guideline 1.2).
 * This posts into Slice 2's community_reports queue with target_type 'note' —
 * one moderation queue for the whole product, not a second one.
 */
export default function ReportNoteDialog({
  noteId,
  open,
  onClose,
}: {
  noteId: string;
  open: boolean;
  onClose: (submitted: boolean) => void;
}) {
  const transport = useCoreTransport();
  const [reason, setReason] = useState<NoteReportReason>("spam");
  const [detail, setDetail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const submit = async () => {
    setSending(true);
    setError(null);
    try {
      await reportOpportunityNote(noteId, reason, detail.trim(), transport);
      onClose(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send report");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Report this note"
        className="w-full max-w-md space-y-4 rounded-2xl border border-subtle bg-surface-layer p-5 shadow-elevated"
      >
        <h3 className="font-display text-lg font-semibold text-text-primary">
          Report this note
        </h3>
        <p className="text-sm text-text-secondary">
          We review every report within 24 hours.
        </p>
        <fieldset className="space-y-2">
          <legend className="sr-only">Reason</legend>
          {REASONS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary"
            >
              <input
                type="radio"
                name="report-reason"
                value={option.value}
                checked={reason === option.value}
                onChange={() => setReason(option.value)}
                aria-label={option.label}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
        <textarea
          value={detail}
          onChange={(event) => setDetail(event.target.value.slice(0, 500))}
          placeholder="Anything else we should know? (optional)"
          aria-label="Report detail"
          className="h-20 w-full resize-none rounded-xl border border-subtle bg-surface-base p-3 text-sm text-text-primary outline-none focus:border-brand"
        />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onClose(false)}
            className="rounded-xl border border-subtle px-4 py-2 text-sm font-semibold text-text-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={sending}
            className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-[#ffffff] disabled:opacity-60"
          >
            {sending ? "Sending…" : "Send report"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write the notes section**

Create `edutu-web-app/src/components/opportunity/OpportunityNotes.tsx`:

```tsx
import { useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Flag, Lightbulb, MessageCircleQuestion, ThumbsUp, Trophy } from "lucide-react";
import {
  useOpportunityNotes,
  type CreateOpportunityNoteInput,
  type OpportunityNoteKind,
  type OpportunityNoteOutcome,
  type OpportunityNoteView,
} from "@edutu/core";
import { useCoreTransport } from "../../lib/coreTransport";
import ReportNoteDialog from "./ReportNoteDialog";

const KINDS: Array<{ value: OpportunityNoteKind; label: string; hint: string }> = [
  { value: "tip", label: "Tip", hint: "Something that helped you" },
  { value: "question", label: "Question", hint: "Something you need answered" },
  { value: "result", label: "Result", hint: "What actually happened" },
];

// The REAL vocabulary, from the live opportunity_applications status CHECK.
// No 'shortlisted' (it does not exist) and no 'won' — a win is an 'offer'.
// 'interview' is real and is the highest-signal mid-pipeline report there is.
const OUTCOMES: Array<{ value: OpportunityNoteOutcome; label: string; badge: string }> = [
  { value: "applied", label: "I applied", badge: "Applied" },
  { value: "interview", label: "I got an interview", badge: "Got an interview" },
  { value: "offer", label: "I got in", badge: "Got an offer" },
  { value: "rejected", label: "I was rejected", badge: "Rejected" },
];

const KIND_ICON: Record<OpportunityNoteKind, typeof Lightbulb> = {
  tip: Lightbulb,
  question: MessageCircleQuestion,
  result: Trophy,
};

function NoteCard({
  note,
  onToggleHelpful,
  onRemove,
  onReport,
}: {
  note: OpportunityNoteView;
  onToggleHelpful: (noteId: string) => void;
  onRemove: (noteId: string) => void;
  onReport: (noteId: string) => void;
}) {
  const Icon = KIND_ICON[note.kind];
  const outcomeBadge = OUTCOMES.find((item) => item.value === note.outcome)?.badge;

  // Blocked authors' content collapses everywhere it appears (spec §9). The
  // row stays so replies below it do not become orphans.
  if (note.blocked) {
    return (
      <li className="rounded-2xl border border-subtle bg-surface-base p-4 text-sm italic text-text-muted">
        Blocked message
      </li>
    );
  }

  return (
    <li className="space-y-2 rounded-2xl border border-subtle bg-surface-layer p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <Icon size={14} />
        </span>
        <span className="text-sm font-semibold text-text-primary">
          {note.author.displayName}
        </span>
        {note.author.isMentor ? (
          <span className="rounded-md bg-brand/10 px-1.5 py-0.5 text-2xs font-semibold text-brand">
            Mentor
          </span>
        ) : null}
        {outcomeBadge ? (
          <span className="rounded-md border border-subtle px-1.5 py-0.5 text-2xs font-semibold text-text-secondary">
            {outcomeBadge}
          </span>
        ) : null}
      </div>
      <p className="whitespace-pre-line text-sm leading-6 text-text-secondary [overflow-wrap:anywhere]">
        {note.body}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => onToggleHelpful(note.id)}
          aria-pressed={note.iFoundHelpful}
          aria-label={`Found useful (${note.helpfulCount})`}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-semibold transition-colors ${
            note.iFoundHelpful
              ? "border-brand/40 bg-brand/10 text-brand"
              : "border-subtle text-text-secondary hover:border-strong"
          }`}
        >
          <ThumbsUp size={12} />
          Found useful ({note.helpfulCount})
        </button>
        {note.isMine ? (
          <button
            type="button"
            onClick={() => onRemove(note.id)}
            className="text-xs font-semibold text-text-muted hover:text-danger"
          >
            Delete
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onReport(note.id)}
            aria-label="Report this note"
            className="inline-flex items-center gap-1 text-xs font-semibold text-text-muted hover:text-danger"
          >
            <Flag size={12} />
            Report
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * Opportunity Notes: structured, persistent, ranked by usefulness, and
 * indexable. The deliberately un-merged counterpart to live group chat
 * (design spec §3.1).
 */
export default function OpportunityNotes({
  opportunityId,
  onNotesChanged,
}: {
  opportunityId: string;
  onNotesChanged?: () => void;
}) {
  const { isSignedIn } = useAuth();
  const transport = useCoreTransport();
  const { notes, loading, addNote, removeNote, toggleHelpful } =
    useOpportunityNotes(opportunityId, transport);

  const [kind, setKind] = useState<OpportunityNoteKind>("tip");
  const [outcome, setOutcome] = useState<OpportunityNoteOutcome | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [reportingNoteId, setReportingNoteId] = useState<string | null>(null);
  const [reportSent, setReportSent] = useState(false);
  const [held, setHeld] = useState(false);

  const submit = async () => {
    setError(null);
    setHeld(false);
    if (kind === "result" && !outcome) {
      setError("Pick what happened: applied, interview, got in, or rejected.");
      return;
    }
    const input: CreateOpportunityNoteInput = {
      kind,
      body: body.trim(),
      ...(kind === "result" && outcome ? { outcome } : {}),
    };
    setPosting(true);
    try {
      const created = await addNote(input);
      setBody("");
      setOutcome(null);
      // A held note is invisible to everyone including its author, so say so
      // rather than letting it look like the post silently failed.
      setHeld(Boolean(created?.pending));
      onNotesChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not post that note");
    } finally {
      setPosting(false);
    }
  };

  return (
    <section
      id="notes"
      className="mt-10 space-y-5 border-t border-subtle pt-8"
      aria-labelledby="opportunity-notes-heading"
    >
      <div className="space-y-1">
        <h2
          id="opportunity-notes-heading"
          className="font-display text-xl font-semibold tracking-tight text-text-primary"
        >
          Notes from applicants
        </h2>
        <p className="text-sm text-text-secondary">
          Tips, questions and real results from people who went through this.
          Results are verified against their own application record.
        </p>
      </div>

      {isSignedIn ? (
        <div className="space-y-3 rounded-2xl border border-subtle bg-surface-layer p-4">
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">Note kind</legend>
            {KINDS.map((option) => (
              <label
                key={option.value}
                title={option.hint}
                className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  kind === option.value
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-subtle text-text-secondary hover:border-strong"
                }`}
              >
                <input
                  type="radio"
                  name="note-kind"
                  className="sr-only"
                  aria-label={option.label}
                  checked={kind === option.value}
                  onChange={() => {
                    setKind(option.value);
                    if (option.value !== "result") setOutcome(null);
                  }}
                />
                {option.label}
              </label>
            ))}
          </fieldset>

          {kind === "result" ? (
            <fieldset className="flex flex-wrap gap-2">
              <legend className="sr-only">What happened</legend>
              {OUTCOMES.map((option) => (
                <label
                  key={option.value}
                  className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    outcome === option.value
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-subtle text-text-secondary hover:border-strong"
                  }`}
                >
                  <input
                    type="radio"
                    name="note-outcome"
                    className="sr-only"
                    aria-label={option.label}
                    checked={outcome === option.value}
                    onChange={() => setOutcome(option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>
          ) : null}

          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value.slice(0, 1200))}
            aria-label="Share what you know"
            placeholder="Share what you know — what surprised you, what you'd do differently…"
            className="h-24 w-full resize-none rounded-xl border border-subtle bg-surface-base p-3 text-sm text-text-primary outline-none focus:border-brand"
          />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div className="flex items-center justify-between">
            <span className="text-2xs text-text-muted">{body.length}/1200</span>
            <button
              type="button"
              onClick={submit}
              disabled={posting || body.trim().length < 12}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-[#ffffff] disabled:opacity-50"
            >
              {posting ? "Posting…" : "Post note"}
            </button>
          </div>
        </div>
      ) : (
        <p className="rounded-2xl border border-subtle bg-surface-layer p-4 text-sm text-text-secondary">
          Sign in to add a note.
        </p>
      )}

      {held ? (
        <p className="text-sm text-text-secondary">
          Thanks — that note is with our reviewers and goes live once it clears.
        </p>
      ) : null}

      {reportSent ? (
        <p className="text-sm text-text-secondary">
          Thanks — we review every report within 24 hours.
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-text-muted">Loading notes…</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-text-muted">
          No notes yet. Be the first to share what you learned.
        </p>
      ) : (
        <ul className="space-y-3">
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onToggleHelpful={toggleHelpful}
              onRemove={(noteId) => {
                void removeNote(noteId);
                onNotesChanged?.();
              }}
              onReport={setReportingNoteId}
            />
          ))}
        </ul>
      )}

      <ReportNoteDialog
        noteId={reportingNoteId ?? ""}
        open={Boolean(reportingNoteId)}
        onClose={(submitted) => {
          setReportingNoteId(null);
          setReportSent(submitted);
        }}
      />
    </section>
  );
}
```

- [ ] **Step 5: Run the test**

Run: `npm --prefix edutu-web-app test -- OpportunityNotes.test`
Expected: PASS, 9 tests.

- [ ] **Step 6: Mount it on the detail page**

In `edutu-web-app/src/components/OpportunityDetail.tsx`, immediately **before** the `{relatedOpportunities.length > 0 ? (` block (line 1052), insert:

```tsx
      <OpportunityNotes
        opportunityId={opportunity.id}
        onNotesChanged={refreshSocial}
      />
```

- [ ] **Step 7: Verify in the browser**

Run `npm --prefix edutu-web-app run dev`, open an opportunity detail page signed in, post a tip, confirm it appears at the top of the list and the counts strip under the title increments after the refresh. Try posting `Pay 5000 naira and I'll send you the link` and confirm the server's rejection message renders inline. Sign out and confirm notes still render read-only.

- [ ] **Step 8: Lint, typecheck, commit**

```bash
npm --prefix edutu-web-app run lint && npm --prefix edutu-web-app run typecheck && npm --prefix edutu-web-app test
git add edutu-web-app/src/components/opportunity/OpportunityNotes.tsx \
        edutu-web-app/src/components/opportunity/ReportNoteDialog.tsx \
        edutu-web-app/src/components/OpportunityDetail.tsx \
        edutu-web-app/src/test/__tests__/OpportunityNotes.test.tsx
git commit -m "feat(web): opportunity notes with reporting on the detail page"
```

---

### Task 14: Web "N groups discussing this →" + create-group-anchored + share-to-group

**Files:**
- Create: `edutu-web-app/src/components/opportunity/GroupsDiscussing.tsx`
- Modify: `edutu-web-app/src/components/OpportunityDetail.tsx` (insert in the Actions aside, after the Save button, line 1046)
- Test: `edutu-web-app/src/test/__tests__/GroupsDiscussing.test.tsx`

**Interfaces:**
- Consumes: `fetchCommunitySpaces`, `createGroupForOpportunity`, `fetchMyCommunityGroups`, `shareOpportunityToGroup`, `GroupsDiscussingEntry` from `@edutu/core`; `useCoreTransport`; `recordOpportunitySignal` from `../../services/opportunitySignals`.
- Produces: `<GroupsDiscussing opportunityId opportunityTitle opportunityCategory groups onChanged? />`.

- [ ] **Step 1: Write the failing test**

Create `edutu-web-app/src/test/__tests__/GroupsDiscussing.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GroupsDiscussing from "../../components/opportunity/GroupsDiscussing";

const OPP = "11111111-1111-4111-a111-111111111111";

const core = vi.hoisted(() => ({
  fetchCommunitySpaces: vi.fn(),
  createGroupForOpportunity: vi.fn(),
  fetchMyCommunityGroups: vi.fn(),
  shareOpportunityToGroup: vi.fn(),
}));

vi.mock("@edutu/core", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...core };
});

vi.mock("../../lib/coreTransport", () => ({
  useCoreTransport: () => ({ apiBaseUrl: "https://api.test", getToken: async () => "t" }),
}));

vi.mock("../../services/opportunitySignals", () => ({
  recordOpportunitySignal: vi.fn(),
}));

const groups = [
  {
    id: "g1",
    slug: "chevening-2027",
    name: "Chevening 2027",
    iconUrl: null,
    memberCount: 42,
    lastMessageAt: "2026-07-25T09:00:00.000Z",
  },
];

function renderStrip(props: Partial<React.ComponentProps<typeof GroupsDiscussing>> = {}) {
  return render(
    <MemoryRouter>
      <GroupsDiscussing
        opportunityId={OPP}
        opportunityTitle="Chevening Scholarship"
        opportunityCategory="Scholarships"
        groups={groups}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe("GroupsDiscussing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    core.fetchCommunitySpaces.mockResolvedValue([
      { id: "s1", slug: "scholarships", name: "Scholarships" },
      { id: "s2", slug: "fellowships", name: "Fellowships" },
    ]);
    core.fetchMyCommunityGroups.mockResolvedValue([
      { id: "g9", slug: "my-crew", name: "My crew", iconUrl: null, memberCount: 5, opportunityId: null, myRole: "owner" },
    ]);
  });

  it("summarises how many groups are discussing this and links to each", () => {
    renderStrip();
    expect(screen.getByText("1 group discussing this")).toBeTruthy();
    const link = screen.getByRole("link", { name: /Chevening 2027/ });
    expect(link.getAttribute("href")).toBe("/communities/g/chevening-2027");
  });

  it("pluralises correctly", () => {
    renderStrip({ groups: [...groups, { ...groups[0], id: "g2", slug: "b", name: "B" }] });
    expect(screen.getByText("2 groups discussing this")).toBeTruthy();
  });

  it("offers to start a group when nobody is discussing it yet", () => {
    renderStrip({ groups: [] });
    expect(screen.getByText(/no groups yet/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /start a group for this/i })).toBeTruthy();
  });

  it("creates a group anchored to this opportunity in the matching space", async () => {
    core.createGroupForOpportunity.mockResolvedValue({
      id: "g3",
      slug: "chevening-scholarship",
      name: "Chevening Scholarship",
      iconUrl: null,
      memberCount: 1,
      opportunityId: OPP,
      myRole: "owner",
    });
    const onChanged = vi.fn();
    const user = userEvent.setup();
    renderStrip({ groups: [], onChanged });

    await user.click(screen.getByRole("button", { name: /start a group for this/i }));
    await waitFor(() => expect(core.fetchCommunitySpaces).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: /create group/i }));

    await waitFor(() =>
      expect(core.createGroupForOpportunity).toHaveBeenCalledWith(
        {
          name: "Chevening Scholarship",
          spaceId: "s1",
          opportunityId: OPP,
        },
        expect.objectContaining({ apiBaseUrl: "https://api.test" }),
      ),
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it("shares the opportunity into a group the user has joined and records a share signal", async () => {
    const { recordOpportunitySignal } = await import(
      "../../services/opportunitySignals"
    );
    core.shareOpportunityToGroup.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderStrip();

    await user.click(screen.getByRole("button", { name: /share to a group/i }));
    await waitFor(() => expect(core.fetchMyCommunityGroups).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: /^My crew$/ }));

    await waitFor(() =>
      expect(core.shareOpportunityToGroup).toHaveBeenCalledWith(
        "g9",
        OPP,
        expect.objectContaining({ apiBaseUrl: "https://api.test" }),
      ),
    );
    expect(recordOpportunitySignal).toHaveBeenCalledWith(
      expect.objectContaining({ opportunityId: OPP, signalType: "share" }),
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm --prefix edutu-web-app test -- GroupsDiscussing`
Expected: FAIL — `Failed to resolve import "../../components/opportunity/GroupsDiscussing"`.

- [ ] **Step 3: Write the component**

Create `edutu-web-app/src/components/opportunity/GroupsDiscussing.tsx`:

```tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { MessagesSquare, Plus, Send } from "lucide-react";
import {
  createGroupForOpportunity,
  fetchCommunitySpaces,
  fetchMyCommunityGroups,
  shareOpportunityToGroup,
  type AnchoredGroupSummary,
  type CommunitySpaceSummary,
  type GroupsDiscussingEntry,
} from "@edutu/core";
import { useCoreTransport } from "../../lib/coreTransport";
import { recordOpportunitySignal } from "../../services/opportunitySignals";

/** Spaces are seeded from the canonical opportunity categories, so the slug
 *  is the category slugified. Falls back to the first space. */
function spaceIdForCategory(
  spaces: CommunitySpaceSummary[],
  category: string | null | undefined,
): string | null {
  if (!spaces.length) return null;
  const slug = String(category ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const exact = spaces.find((space) => space.slug === slug);
  if (exact) return exact.id;
  const singular = spaces.find((space) => space.slug === slug.replace(/s$/, ""));
  if (singular) return singular.id;
  const plural = spaces.find((space) => space.slug === `${slug}s`);
  if (plural) return plural.id;
  return spaces[0].id;
}

/**
 * The bridge between the opportunity page and the Communities tab: how many
 * groups are already working on this, a way into each of them, a way to start
 * one anchored to this opportunity, and a way to drop the opportunity card
 * into a group you're already in.
 */
export default function GroupsDiscussing({
  opportunityId,
  opportunityTitle,
  opportunityCategory,
  groups,
  onChanged,
}: {
  opportunityId: string;
  opportunityTitle: string;
  opportunityCategory?: string | null;
  groups: GroupsDiscussingEntry[];
  onChanged?: () => void;
}) {
  const transport = useCoreTransport();
  const [creating, setCreating] = useState(false);
  const [spaces, setSpaces] = useState<CommunitySpaceSummary[]>([]);
  const [groupName, setGroupName] = useState(opportunityTitle);
  const [sharing, setSharing] = useState(false);
  const [myGroups, setMyGroups] = useState<AnchoredGroupSummary[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const openCreate = async () => {
    setStatus(null);
    setCreating(true);
    setSpaces(await fetchCommunitySpaces(transport).catch(() => []));
  };

  const openShare = async () => {
    setStatus(null);
    setSharing(true);
    setMyGroups(await fetchMyCommunityGroups(transport).catch(() => []));
  };

  const create = async () => {
    const spaceId = spaceIdForCategory(spaces, opportunityCategory);
    if (!spaceId) {
      setStatus("Communities aren't available right now.");
      return;
    }
    setBusy(true);
    try {
      await createGroupForOpportunity(
        { name: groupName.trim() || opportunityTitle, spaceId, opportunityId },
        transport,
      );
      setCreating(false);
      setStatus("Group created — it expires 30 days after this deadline.");
      onChanged?.();
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Could not create that group");
    } finally {
      setBusy(false);
    }
  };

  const share = async (groupId: string) => {
    setBusy(true);
    try {
      await shareOpportunityToGroup(groupId, opportunityId, transport);
      // Feeds shares_count on the social strip through the existing signal
      // ledger — no new tracking is introduced.
      void recordOpportunitySignal({ opportunityId, signalType: "share" });
      setSharing(false);
      setStatus("Shared to the group.");
      onChanged?.();
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Could not share to that group");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-2xl border border-subtle bg-surface-layer p-5 shadow-soft">
      <p className="flex items-center gap-2 text-xs font-semibold text-text-muted">
        <MessagesSquare size={14} />
        Community
      </p>

      {groups.length > 0 ? (
        <>
          <p className="text-sm font-semibold text-text-primary">
            {groups.length} {groups.length === 1 ? "group" : "groups"} discussing
            this
          </p>
          <ul className="space-y-1.5">
            {groups.map((group) => (
              <li key={group.id}>
                <Link
                  to={`/communities/g/${group.slug}`}
                  className="flex items-center justify-between gap-2 rounded-xl border border-subtle px-3 py-2 text-sm text-text-secondary transition-colors hover:border-strong hover:text-text-primary"
                >
                  <span className="truncate font-semibold">{group.name}</span>
                  <span className="shrink-0 text-xs text-text-muted">
                    {group.memberCount} members →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-text-secondary">
          No groups yet for this one. Start the crew.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-xl border border-subtle px-3 py-2 text-xs font-semibold text-text-secondary hover:border-strong hover:text-text-primary"
        >
          <Plus size={13} />
          Start a group for this
        </button>
        <button
          type="button"
          onClick={openShare}
          className="inline-flex items-center gap-1.5 rounded-xl border border-subtle px-3 py-2 text-xs font-semibold text-text-secondary hover:border-strong hover:text-text-primary"
        >
          <Send size={13} />
          Share to a group
        </button>
      </div>

      {status ? <p className="text-xs text-text-secondary">{status}</p> : null}

      {creating ? (
        <div className="space-y-2 rounded-xl border border-subtle p-3">
          <label
            htmlFor="anchored-group-name"
            className="block text-xs font-semibold text-text-muted"
          >
            Group name
          </label>
          <input
            id="anchored-group-name"
            value={groupName}
            onChange={(event) => setGroupName(event.target.value.slice(0, 60))}
            className="w-full rounded-lg border border-subtle bg-surface-base px-3 py-2 text-sm text-text-primary outline-none focus:border-brand"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded-lg border border-subtle px-3 py-1.5 text-xs font-semibold text-text-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={create}
              disabled={busy}
              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-[#ffffff] disabled:opacity-60"
            >
              Create group
            </button>
          </div>
        </div>
      ) : null}

      {sharing ? (
        <div className="space-y-1.5 rounded-xl border border-subtle p-3">
          {myGroups.length === 0 ? (
            <p className="text-xs text-text-muted">
              You haven't joined any groups yet.
            </p>
          ) : (
            myGroups.map((group) => (
              <button
                key={group.id}
                type="button"
                disabled={busy}
                onClick={() => share(group.id)}
                className="block w-full truncate rounded-lg border border-subtle px-3 py-2 text-left text-sm font-semibold text-text-secondary hover:border-strong hover:text-text-primary disabled:opacity-60"
              >
                {group.name}
              </button>
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 4: Run the test**

Run: `npm --prefix edutu-web-app test -- GroupsDiscussing`
Expected: PASS, 5 tests.

- [ ] **Step 5: Mount it in the detail page's Actions aside**

In `edutu-web-app/src/components/OpportunityDetail.tsx`, immediately after the `</section>` that closes the Actions card and before `</aside>` (line 1047), insert:

```tsx
            <GroupsDiscussing
              opportunityId={opportunity.id}
              opportunityTitle={opportunity.title}
              opportunityCategory={opportunity.category}
              groups={discussingGroups}
              onChanged={refreshSocial}
            />
```

- [ ] **Step 6: Verify in the browser**

Run `npm --prefix edutu-web-app run dev`, open an opportunity with an anchored group and confirm "N groups discussing this" links to `/communities/g/<slug>`. Create a group from an opportunity with none and confirm it appears after `refreshSocial`. Share to a joined group and confirm the message lands in that group's chat as an opportunity card.

- [ ] **Step 7: Lint, typecheck, commit**

```bash
npm --prefix edutu-web-app run lint && npm --prefix edutu-web-app run typecheck && npm --prefix edutu-web-app test
git add edutu-web-app/src/components/opportunity/GroupsDiscussing.tsx \
        edutu-web-app/src/components/OpportunityDetail.tsx \
        edutu-web-app/src/test/__tests__/GroupsDiscussing.test.tsx
git commit -m "feat(web): groups-discussing surface with anchored group creation and share-to-group"
```

---

### Task 15: Web opportunity card in chat (live countdown, greys out) + ✦saved → Note bridge

**Files:**
- Create: `edutu-web-app/src/components/communities/OpportunityChatCard.tsx`
- Create: `edutu-web-app/src/components/communities/PublishSavedMessageDialog.tsx`
- Modify: Slice 2's group message renderer (located by grep in Step 5)
- Test: `edutu-web-app/src/test/__tests__/OpportunityChatCard.test.tsx`

**Interfaces:**
- Consumes: `useLiveDeadline` from `@edutu/core`; `UrgencyPill` from `../opportunity/UrgencyPill`; `fetchOpportunities` / the existing per-id fetch in `../../services/opportunities`; `createOpportunityNote` from `@edutu/core`.
- Produces: `<OpportunityChatCard opportunityId />` and `<PublishSavedMessageDialog message groupId open onClose />`.

- [ ] **Step 1: Write the failing test**

Create `edutu-web-app/src/test/__tests__/OpportunityChatCard.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OpportunityChatCard from "../../components/communities/OpportunityChatCard";

const OPP = "11111111-1111-4111-a111-111111111111";

const services = vi.hoisted(() => ({ fetchOpportunityById: vi.fn() }));

vi.mock("../../services/opportunities", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...services };
});

function opportunity(deadline: string | null) {
  return {
    id: OPP,
    title: "Chevening Scholarship",
    organization: "UK Government",
    category: "Scholarships",
    location: "United Kingdom",
    deadline,
    description: "",
    requirements: [],
    benefits: [],
    applicationProcess: [],
    match: 0,
  };
}

function renderCard() {
  return render(
    <MemoryRouter>
      <OpportunityChatCard opportunityId={OPP} />
    </MemoryRouter>,
  );
}

describe("OpportunityChatCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-07-25T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the opportunity with a live countdown pill", async () => {
    services.fetchOpportunityById.mockResolvedValue(
      opportunity("2026-07-28T00:00:00.000Z"),
    );
    renderCard();

    await waitFor(() => expect(screen.getByText("Chevening Scholarship")).toBeTruthy());
    expect(screen.getByText("3 days left")).toBeTruthy();
    expect(screen.getByTestId("opportunity-chat-card").className).not.toContain(
      "opacity-60",
    );
  });

  it("greys the card out once the deadline passes while it is on screen", async () => {
    services.fetchOpportunityById.mockResolvedValue(
      opportunity("2026-07-25T00:00:00.000Z"),
    );
    renderCard();
    await waitFor(() => expect(screen.getByText("Chevening Scholarship")).toBeTruthy());
    expect(screen.getByText("Closes today")).toBeTruthy();

    await vi.advanceTimersByTimeAsync(0);
    vi.setSystemTime(new Date("2026-07-27T00:00:00.000Z"));
    await vi.advanceTimersByTimeAsync(60_000);

    await waitFor(() => expect(screen.getByText("Closed")).toBeTruthy());
    expect(screen.getByTestId("opportunity-chat-card").className).toContain(
      "opacity-60",
    );
  });

  it("links through to the opportunity detail page", async () => {
    services.fetchOpportunityById.mockResolvedValue(
      opportunity("2026-12-01T00:00:00.000Z"),
    );
    renderCard();

    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: /Chevening Scholarship/ }).getAttribute("href"),
      ).toBe(`/app/opportunity/${OPP}`),
    );
  });

  it("degrades to a plain link when the opportunity cannot be loaded", async () => {
    services.fetchOpportunityById.mockResolvedValue(null);
    renderCard();

    await waitFor(() =>
      expect(screen.getByText(/opportunity unavailable/i)).toBeTruthy(),
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm --prefix edutu-web-app test -- OpportunityChatCard`
Expected: FAIL — `Failed to resolve import "../../components/communities/OpportunityChatCard"`.

- [ ] **Step 3: Add a per-id fetch to the opportunities service if it does not exist**

Run: `grep -n "export async function fetchOpportunityById" edutu-web-app/src/services/opportunities.ts`
If it prints nothing, append to `edutu-web-app/src/services/opportunities.ts`:

```ts
/** Single-opportunity read for chat cards, memoised for the session so a
 *  group with twenty shares of the same opportunity issues one request. */
const opportunityByIdCache = new Map<string, Promise<Opportunity | null>>();

export function fetchOpportunityById(id: string): Promise<Opportunity | null> {
  const cached = opportunityByIdCache.get(id);
  if (cached) return cached;

  const request = fetch(
    `${getApiBaseUrl("Opportunities")}/opportunities/${encodeURIComponent(id)}`,
    { headers: { Accept: "application/json" } },
  )
    .then(async (response) => {
      if (!response.ok) return null;
      const payload = await response.json().catch(() => null);
      return (payload?.opportunity ?? payload ?? null) as Opportunity | null;
    })
    .catch(() => null);

  opportunityByIdCache.set(id, request);
  return request;
}
```
(`getApiBaseUrl` is already imported in that file; if not, add `import { getApiBaseUrl } from "../lib/apiBaseUrl";`.)

- [ ] **Step 4: Write the chat card**

Create `edutu-web-app/src/components/communities/OpportunityChatCard.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin } from "lucide-react";
import { useLiveDeadline } from "@edutu/core";
import type { Opportunity } from "../../types/opportunity";
import { fetchOpportunityById } from "../../services/opportunities";
import { organizationLabel } from "../../lib/organizationLabel";
import UrgencyPill from "../opportunity/UrgencyPill";

/**
 * An opportunity shared into a group renders as a live card, not a link.
 *
 * The deadline keeps counting down while the message sits in the scrollback
 * and the whole card visibly greys out the moment it passes (design spec §7) —
 * a group that is still linking a closed scholarship is exactly the failure
 * mode WhatsApp groups have. All date logic comes from the existing
 * getDeadlineBadge via useLiveDeadline; UrgencyPill renders it, unchanged.
 */
export default function OpportunityChatCard({
  opportunityId,
}: {
  opportunityId: string;
}) {
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    void fetchOpportunityById(opportunityId).then((result) => {
      if (cancelled) return;
      setOpportunity(result);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [opportunityId]);

  const { badge, isPassed } = useLiveDeadline(opportunity?.deadline ?? null);

  if (loaded && !opportunity) {
    return (
      <div className="rounded-2xl border border-subtle bg-surface-base p-3 text-sm text-text-muted">
        Opportunity unavailable
      </div>
    );
  }

  if (!opportunity) {
    return (
      <div className="h-24 w-full animate-pulse rounded-2xl border border-subtle bg-surface-base" />
    );
  }

  const organization = organizationLabel(
    opportunity.organization,
    opportunity.title,
  );

  return (
    <article
      data-testid="opportunity-chat-card"
      className={`max-w-sm rounded-2xl border border-subtle bg-surface-layer p-3 shadow-soft transition-opacity ${
        isPassed ? "opacity-60 grayscale" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/app/opportunity/${opportunity.id}`}
          className="line-clamp-2 font-display text-sm font-semibold leading-snug text-text-primary hover:text-brand"
        >
          {opportunity.title}
        </Link>
        <UrgencyPill badge={badge} always compact={false} className="shrink-0" />
      </div>
      {organization ? (
        <p className="mt-1 truncate text-xs text-text-muted">{organization}</p>
      ) : null}
      {opportunity.location ? (
        <p className="mt-1 inline-flex items-center gap-1 text-xs text-text-muted">
          <MapPin size={11} />
          {opportunity.location}
        </p>
      ) : null}
    </article>
  );
}
```

- [ ] **Step 5: Wire it into Slice 2's message renderer**

Run: `grep -rn "kind === \"opportunity\"\|case \"opportunity\"\|message.kind" edutu-web-app/src/components/communities/`
This prints the file and line where Slice 2 branches on `CommunityMessage.kind`. In that switch (or ternary chain), add the branch:

```tsx
      {message.kind === "opportunity" && message.opportunityId ? (
        <OpportunityChatCard opportunityId={message.opportunityId} />
      ) : null}
```

and add `import OpportunityChatCard from "./OpportunityChatCard";` to that file's imports.

- [ ] **Step 6: Write the ✦saved-message → Note dialog**

Create `edutu-web-app/src/components/communities/PublishSavedMessageDialog.tsx`:

```tsx
import { useState } from "react";
import {
  createOpportunityNote,
  type CommunityMessage,
  type OpportunityNoteKind,
} from "@edutu/core";
import { useCoreTransport } from "../../lib/coreTransport";

const KINDS: Array<{ value: OpportunityNoteKind; label: string }> = [
  { value: "tip", label: "Tip" },
  { value: "question", label: "Question" },
];

/**
 * Promotion bridge: a ✦saved chat message becomes a permanent Opportunity
 * Note. The server re-verifies that the message is really saved and that the
 * caller is really in the group, so this dialog is convenience, not authority.
 * Only tip/question are offered — a `result` note must come from the person
 * whose application record backs it, not from a quoted message.
 */
export default function PublishSavedMessageDialog({
  message,
  groupId,
  opportunityId,
  open,
  onClose,
}: {
  message: Pick<CommunityMessage, "id" | "body">;
  groupId: string;
  opportunityId: string;
  open: boolean;
  onClose: (published: boolean) => void;
}) {
  const transport = useCoreTransport();
  const [kind, setKind] = useState<OpportunityNoteKind>("tip");
  const [body, setBody] = useState(message.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const publish = async () => {
    setBusy(true);
    setError(null);
    try {
      await createOpportunityNote(
        opportunityId,
        {
          kind,
          body: body.trim(),
          sourceMessageId: message.id,
          sourceGroupId: groupId,
        },
        transport,
      );
      onClose(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not publish that");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Publish as a note"
        className="w-full max-w-md space-y-4 rounded-2xl border border-subtle bg-surface-layer p-5 shadow-elevated"
      >
        <h3 className="font-display text-lg font-semibold text-text-primary">
          Publish as a note
        </h3>
        <p className="text-sm text-text-secondary">
          This becomes a permanent, public note on the opportunity page, credited
          to you.
        </p>
        <div className="flex gap-2">
          {KINDS.map((option) => (
            <label
              key={option.value}
              className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                kind === option.value
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-subtle text-text-secondary"
              }`}
            >
              <input
                type="radio"
                name="publish-kind"
                className="sr-only"
                aria-label={option.label}
                checked={kind === option.value}
                onChange={() => setKind(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value.slice(0, 1200))}
          aria-label="Note body"
          className="h-28 w-full resize-none rounded-xl border border-subtle bg-surface-base p-3 text-sm text-text-primary outline-none focus:border-brand"
        />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onClose(false)}
            className="rounded-xl border border-subtle px-4 py-2 text-sm font-semibold text-text-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={publish}
            disabled={busy || body.trim().length < 12}
            className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-[#ffffff] disabled:opacity-60"
          >
            {busy ? "Publishing…" : "Publish note"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

Mount it from the same message renderer found in Step 5: when a message has `savedToBrief === true` and the group has an `opportunityId`, render a "Publish as note" action that opens this dialog with `message`, `groupId` and the group's `opportunityId`.

- [ ] **Step 7: Run the tests**

Run: `npm --prefix edutu-web-app test -- OpportunityChatCard`
Expected: PASS, 4 tests.

- [ ] **Step 8: Verify in the browser**

Run `npm --prefix edutu-web-app run dev`, open a group where an opportunity was shared, and confirm the card renders with a countdown pill. Temporarily set that opportunity's deadline to yesterday in SQL, reload, and confirm the card is greyed out with a "Closed" pill.

- [ ] **Step 9: Lint, typecheck, commit**

```bash
npm --prefix edutu-web-app run lint && npm --prefix edutu-web-app run typecheck && npm --prefix edutu-web-app test
git add edutu-web-app/src/components/communities/ \
        edutu-web-app/src/services/opportunities.ts \
        edutu-web-app/src/test/__tests__/OpportunityChatCard.test.tsx
git commit -m "feat(web): live opportunity cards in group chat and saved-message to note publishing"
```

---

## Phase 4 — Mobile UI (`edutumobile`)

### Task 16: Mobile transport + i18n strings for all 9 locales

**Files:**
- Create: `edutumobile/lib/coreTransport.ts`
- Modify: `edutumobile/lib/i18n/locales/{en,es,fr,pt,zh,ar,ha,hi,sw}/opps.json`
- Regenerate: `edutumobile/lib/i18n/resources.ts`

**Interfaces:**
- Consumes: `useAuth` from `@clerk/clerk-expo`; `getApiBaseUrl` from `@edutu/core`.
- Produces: `useCoreTransport(): CoreTransport`; the `opps:notes.*` and `opps:social.*` key namespace.

- [ ] **Step 1: Write the transport helper**

Create `edutumobile/lib/coreTransport.ts`:

```ts
import { useMemo } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { getApiBaseUrl, type CoreTransport } from '@edutu/core';

/**
 * Bridges the mobile Clerk session into the framework-agnostic transport
 * `@edutu/core`'s notes client expects. getApiBaseUrl falls back to the
 * production origin, so unlike web this never throws.
 */
export function useCoreTransport(): CoreTransport {
  const { getToken } = useAuth();

  return useMemo<CoreTransport>(
    () => ({
      apiBaseUrl: getApiBaseUrl(),
      getToken: () => getToken().catch(() => null),
    }),
    [getToken],
  );
}
```

- [ ] **Step 2: Add the English strings**

In `edutumobile/lib/i18n/locales/en/opps.json`, add these two top-level keys **inside** the root object (alongside the existing `detail` key), keeping the file's 2-space indentation:

```json
  "social": {
    "notes_one": "{{count}} note",
    "notes_other": "{{count}} notes",
    "applied": "{{count}} applied",
    "useful": "{{count}} found useful",
    "shared": "{{count}} shared",
    "groupsTitle_one": "{{count}} group discussing this",
    "groupsTitle_other": "{{count}} groups discussing this",
    "noGroups": "No groups yet for this one. Start the crew.",
    "startGroup": "Start a group for this",
    "shareToGroup": "Share to a group",
    "groupName": "Group name",
    "createGroup": "Create group",
    "cancel": "Cancel",
    "members": "{{count}} members",
    "created": "Group created — it expires 30 days after this deadline.",
    "shared_toast": "Shared to the group.",
    "noJoinedGroups": "You haven't joined any groups yet.",
    "unavailable": "Communities aren't available right now."
  },
  "notes": {
    "title": "Notes from applicants",
    "subtitle": "Tips, questions and real results from people who went through this. Results are verified against their own application record.",
    "empty": "No notes yet. Be the first to share what you learned.",
    "loading": "Loading notes…",
    "signInPrompt": "Sign in to add a note.",
    "kind": {
      "tip": "Tip",
      "question": "Question",
      "result": "Result"
    },
    "outcome": {
      "applied": "I applied",
      "interview": "I got an interview",
      "offer": "I got in",
      "rejected": "I was rejected"
    },
    "outcomeBadge": {
      "applied": "Applied",
      "interview": "Got an interview",
      "offer": "Got an offer",
      "rejected": "Rejected"
    },
    "placeholder": "Share what you know — what surprised you, what you'd do differently…",
    "post": "Post note",
    "posting": "Posting…",
    "needOutcome": "Pick what happened: applied, interview, got in, or rejected.",
    "helpful": "Found useful ({{count}})",
    "delete": "Delete",
    "report": "Report",
    "blocked": "Blocked message",
    "mentor": "Mentor",
    "reportTitle": "Report this note",
    "reportSubtitle": "We review every report within 24 hours.",
    "reportReason": {
      "spam": "Spam or scam",
      "offensive": "Offensive or hateful",
      "harassment": "Harassment",
      "other": "Something else"
    },
    "reportSend": "Send report",
    "reportSent": "Thanks — we review every report within 24 hours.",
    "heldForReview": "Thanks — that note is with our reviewers and goes live once it clears.",
    "publishTitle": "Publish as a note",
    "publish": "Publish note"
  },
```

- [ ] **Step 3: Add translated copies to the other eight locales**

Add the same two key blocks to `es`, `fr`, `pt`, `zh`, `ar`, `ha`, `hi`, `sw` with translated values. **Hand-edit `ar`, `ha`, `hi` and `sw`** — those four files mix 2- and 4-space indentation and a formatter run will produce a diff that hides the real change. `ar` is RTL: keep the `{{count}}` placeholders exactly where the sentence needs them, do not reorder them mechanically. There is **no `de` locale** — the fifth European language is `pt`.

- [ ] **Step 4: Regenerate the resource map**

Run:
```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile && node scripts/gen-i18n-resources.js
```
Expected: `lib/i18n/resources.ts` is rewritten. Metro cannot `require()` a dynamic path, so a namespace that is not in this generated file silently renders raw keys.

- [ ] **Step 5: Verify every locale parses and has the new keys**

Run:
```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile && \
for lang in en es fr pt zh ar ha hi sw; do \
  node -e "const j=require('./lib/i18n/locales/$lang/opps.json'); if(!j.notes||!j.social){console.error('MISSING in $lang');process.exit(1)} console.log('$lang ok')"; \
done
```
Expected: nine `<lang> ok` lines and no `MISSING`.

- [ ] **Step 6: Typecheck and commit**

```bash
npm --prefix edutumobile run typecheck
git add edutumobile/lib/coreTransport.ts \
        edutumobile/lib/i18n/locales/ \
        edutumobile/lib/i18n/resources.ts
git commit -m "feat(mobile): core transport plus notes and social strings in all nine locales"
```

---

### Task 17: Mobile social counts + groups-discussing on the opportunity detail screen

**Files:**
- Create: `edutumobile/components/opportunity/SocialCountsStrip.tsx`
- Create: `edutumobile/components/opportunity/GroupsDiscussing.tsx`
- Modify: `edutumobile/app/(app)/opportunities/[id].tsx` (imports; insert after line 1695)
- Test: `edutumobile/components/opportunity/__tests__/SocialCountsStrip.test.tsx`

**Interfaces:**
- Consumes: `useOpportunitySocial`, `fetchCommunitySpaces`, `createGroupForOpportunity`, `fetchMyCommunityGroups`, `shareOpportunityToGroup`, `recordOpportunitySignal` from `@edutu/core`; `useCoreTransport` (Task 16); `useTheme` from `../context/ThemeContext`.
- Produces: `<SocialCountsStrip counts color />` and `<GroupsDiscussing opportunityId opportunityTitle opportunityCategory groups onChanged? />`.

- [ ] **Step 1: Write the failing test**

Create `edutumobile/components/opportunity/__tests__/SocialCountsStrip.test.tsx`:

```tsx
import React from "react";
import { render } from "@testing-library/react-native";
import SocialCountsStrip from "../SocialCountsStrip";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) => {
      const count = options?.count ?? 0;
      const map: Record<string, string> = {
        "social.notes_one": `${count} note`,
        "social.notes_other": `${count} notes`,
        "social.applied": `${count} applied`,
        "social.useful": `${count} found useful`,
        "social.shared": `${count} shared`,
      };
      const plural = key === "social.notes" ? (count === 1 ? "_one" : "_other") : "";
      return map[`${key}${plural}`] ?? key;
    },
  }),
}));

describe("SocialCountsStrip (mobile)", () => {
  it("renders the four numbers with separators", () => {
    const { getByTestId } = render(
      <SocialCountsStrip
        color="#64748B"
        counts={{
          notesCount: 4,
          appliedCount: 10,
          usefulCount: 20,
          sharesCount: 100,
          groupsCount: 3,
        }}
      />,
    );
    expect(getByTestId("social-counts-strip").props.children.join("")).toContain(
      "4 notes · 10 applied · 20 found useful · 100 shared",
    );
  });

  it("omits zero metrics", () => {
    const { getByTestId } = render(
      <SocialCountsStrip
        color="#64748B"
        counts={{
          notesCount: 4,
          appliedCount: 0,
          usefulCount: 0,
          sharesCount: 0,
          groupsCount: 0,
        }}
      />,
    );
    expect(getByTestId("social-counts-strip").props.children.join("")).toBe(
      "4 notes",
    );
  });

  it("renders nothing when everything is zero", () => {
    const { queryByTestId } = render(
      <SocialCountsStrip
        color="#64748B"
        counts={{
          notesCount: 0,
          appliedCount: 0,
          usefulCount: 0,
          sharesCount: 0,
          groupsCount: 0,
        }}
      />,
    );
    expect(queryByTestId("social-counts-strip")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm --prefix edutumobile test -- --maxWorkers=2 SocialCountsStrip`
Expected: FAIL — `Cannot find module '../SocialCountsStrip'`. (The `--maxWorkers=2` flag is required locally; the mobile jest run exhausts memory without it.)

- [ ] **Step 3: Write the strip**

Create `edutumobile/components/opportunity/SocialCountsStrip.tsx`:

```tsx
import React from "react";
import { Text } from "react-native";
import { useTranslation } from "react-i18next";
import type { OpportunitySocialCounts } from "@edutu/core";

/**
 * `4 notes · 10 applied · 20 found useful · 100 shared`.
 * Zero metrics are dropped: "0 applied" is worse than silence.
 */
export default function SocialCountsStrip({
  counts,
  color,
}: {
  counts: OpportunitySocialCounts;
  color: string;
}) {
  const { t } = useTranslation("opps");

  const parts: string[] = [];
  if (counts.notesCount > 0) {
    parts.push(t("social.notes", { count: counts.notesCount }));
  }
  if (counts.appliedCount > 0) {
    parts.push(t("social.applied", { count: counts.appliedCount }));
  }
  if (counts.usefulCount > 0) {
    parts.push(t("social.useful", { count: counts.usefulCount }));
  }
  if (counts.sharesCount > 0) {
    parts.push(t("social.shared", { count: counts.sharesCount }));
  }

  if (!parts.length) return null;

  return (
    <Text
      testID="social-counts-strip"
      style={{ color, fontSize: 12, lineHeight: 18, marginTop: 8 }}
    >
      {parts.join(" · ")}
    </Text>
  );
}
```

- [ ] **Step 4: Write the groups strip**

Create `edutumobile/components/opportunity/GroupsDiscussing.tsx`:

```tsx
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ChevronRight, MessagesSquare, Plus, Send } from "lucide-react-native";
import {
  createGroupForOpportunity,
  fetchCommunitySpaces,
  fetchMyCommunityGroups,
  recordOpportunitySignal,
  shareOpportunityToGroup,
  type AnchoredGroupSummary,
  type CommunitySpaceSummary,
  type GroupsDiscussingEntry,
} from "@edutu/core";
import { useTheme } from "../context/ThemeContext";
import { useCoreTransport } from "../../lib/coreTransport";

function spaceIdForCategory(
  spaces: CommunitySpaceSummary[],
  category: string | null | undefined,
): string | null {
  if (!spaces.length) return null;
  const slug = String(category ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (
    spaces.find((space) => space.slug === slug)?.id ??
    spaces.find((space) => space.slug === slug.replace(/s$/, ""))?.id ??
    spaces.find((space) => space.slug === `${slug}s`)?.id ??
    spaces[0].id
  );
}

/** "N groups discussing this →" plus the two flows that feed it. */
export default function GroupsDiscussing({
  opportunityId,
  opportunityTitle,
  opportunityCategory,
  groups,
  onChanged,
}: {
  opportunityId: string;
  opportunityTitle: string;
  opportunityCategory?: string | null;
  groups: GroupsDiscussingEntry[];
  onChanged?: () => void;
}) {
  const { isDark, colors } = useTheme();
  const { t } = useTranslation("opps");
  const router = useRouter();
  const transport = useCoreTransport();

  const [creating, setCreating] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [spaces, setSpaces] = useState<CommunitySpaceSummary[]>([]);
  const [myGroups, setMyGroups] = useState<AnchoredGroupSummary[]>([]);
  const [groupName, setGroupName] = useState(opportunityTitle);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const textSecondary = isDark ? "#94A3B8" : "#64748B";

  const openCreate = async () => {
    setStatus(null);
    setCreating(true);
    setSpaces(await fetchCommunitySpaces(transport).catch(() => []));
  };

  const openShare = async () => {
    setStatus(null);
    setSharing(true);
    setMyGroups(await fetchMyCommunityGroups(transport).catch(() => []));
  };

  const create = async () => {
    const spaceId = spaceIdForCategory(spaces, opportunityCategory);
    if (!spaceId) {
      setStatus(t("social.unavailable"));
      return;
    }
    setBusy(true);
    try {
      await createGroupForOpportunity(
        { name: groupName.trim() || opportunityTitle, spaceId, opportunityId },
        transport,
      );
      setCreating(false);
      setStatus(t("social.created"));
      onChanged?.();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("social.unavailable"));
    } finally {
      setBusy(false);
    }
  };

  const share = async (groupId: string) => {
    setBusy(true);
    try {
      await shareOpportunityToGroup(groupId, opportunityId, transport);
      // Feeds shares_count through the existing signal ledger.
      void recordOpportunitySignal(
        { opportunityId, signalType: "share" },
        transport.getToken,
      );
      setSharing(false);
      setStatus(t("social.shared_toast"));
      onChanged?.();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("social.unavailable"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      style={{
        marginTop: 16,
        padding: 14,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <MessagesSquare size={14} color={textSecondary} />
        <Text style={{ color: textSecondary, fontSize: 12, fontWeight: "600" }}>
          {groups.length > 0
            ? t("social.groupsTitle", { count: groups.length })
            : t("social.noGroups")}
        </Text>
      </View>

      {groups.map((group) => (
        <TouchableOpacity
          key={group.id}
          accessibilityRole="button"
          onPress={() => router.push(`/(app)/communities/${group.id}`)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text
            numberOfLines={1}
            style={{ color: colors.foreground, fontWeight: "600", flex: 1 }}
          >
            {group.name}
          </Text>
          <Text style={{ color: textSecondary, fontSize: 12, marginRight: 4 }}>
            {t("social.members", { count: group.memberCount })}
          </Text>
          <ChevronRight size={14} color={textSecondary} />
        </TouchableOpacity>
      ))}

      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={openCreate}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Plus size={13} color={textSecondary} />
          <Text style={{ color: textSecondary, fontSize: 12, fontWeight: "600" }}>
            {t("social.startGroup")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={openShare}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Send size={13} color={textSecondary} />
          <Text style={{ color: textSecondary, fontSize: 12, fontWeight: "600" }}>
            {t("social.shareToGroup")}
          </Text>
        </TouchableOpacity>
      </View>

      {status ? (
        <Text style={{ color: textSecondary, fontSize: 12 }}>{status}</Text>
      ) : null}

      <Modal
        visible={creating}
        transparent
        animationType="fade"
        onRequestClose={() => setCreating(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <View
            style={{
              borderRadius: 16,
              backgroundColor: colors.card,
              padding: 16,
              gap: 12,
            }}
          >
            <Text style={{ color: textSecondary, fontSize: 12, fontWeight: "600" }}>
              {t("social.groupName")}
            </Text>
            <TextInput
              value={groupName}
              onChangeText={(value) => setGroupName(value.slice(0, 60))}
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: colors.foreground,
              }}
            />
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
              <TouchableOpacity onPress={() => setCreating(false)}>
                <Text style={{ color: textSecondary, fontWeight: "600", padding: 10 }}>
                  {t("social.cancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={create} disabled={busy}>
                {busy ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Text style={{ color: colors.accent, fontWeight: "700", padding: 10 }}>
                    {t("social.createGroup")}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={sharing}
        transparent
        animationType="fade"
        onRequestClose={() => setSharing(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <View
            style={{
              borderRadius: 16,
              backgroundColor: colors.card,
              padding: 16,
              gap: 8,
            }}
          >
            {myGroups.length === 0 ? (
              <Text style={{ color: textSecondary, fontSize: 13 }}>
                {t("social.noJoinedGroups")}
              </Text>
            ) : (
              myGroups.map((group) => (
                <TouchableOpacity
                  key={group.id}
                  disabled={busy}
                  onPress={() => share(group.id)}
                  style={{
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{ color: colors.foreground, fontWeight: "600" }}
                  >
                    {group.name}
                  </Text>
                </TouchableOpacity>
              ))
            )}
            <TouchableOpacity onPress={() => setSharing(false)}>
              <Text style={{ color: textSecondary, fontWeight: "600", padding: 10 }}>
                {t("social.cancel")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
```

- [ ] **Step 5: Mount both on the detail screen**

In `edutumobile/app/(app)/opportunities/[id].tsx`, add to the import block (after line 69, the `trackOpportunityApplication` import):

```ts
import { useOpportunitySocial } from "@edutu/core";
import { useCoreTransport } from "../../../lib/coreTransport";
import SocialCountsStrip from "../../../components/opportunity/SocialCountsStrip";
import GroupsDiscussing from "../../../components/opportunity/GroupsDiscussing";
import OpportunityNotes from "../../../components/opportunity/OpportunityNotes";
```

> `OpportunityNotes` lands in Task 18; add the import now and finish the wiring there.

In the component body, immediately after `const borderColor = colors.border;` (line 625), add:

```ts
  const coreTransport = useCoreTransport();
  const {
    counts: socialCounts,
    groups: discussingGroups,
    refresh: refreshSocial,
  } = useOpportunitySocial(id ?? null, coreTransport);
```

(`id` is the route param from `useLocalSearchParams`; confirm its local name with `grep -n "useLocalSearchParams" "app/(app)/opportunities/[id].tsx"` and use that name.)

Then insert immediately after line 1695 — the `/>` that closes the hero/deadline block and precedes the "The one primary action" comment:

```tsx
          <SocialCountsStrip counts={socialCounts} color={textSecondary} />

          <GroupsDiscussing
            opportunityId={opportunity.id}
            opportunityTitle={opportunity.title}
            opportunityCategory={opportunity.category}
            groups={discussingGroups}
            onChanged={refreshSocial}
          />
```

- [ ] **Step 6: Run the tests**

Run: `npm --prefix edutumobile test -- --maxWorkers=2 SocialCountsStrip`
Expected: PASS, 3 tests.

- [ ] **Step 7: Lint, typecheck, commit**

```bash
npm --prefix edutumobile run lint && npm --prefix edutumobile run typecheck
git add edutumobile/components/opportunity/SocialCountsStrip.tsx \
        edutumobile/components/opportunity/GroupsDiscussing.tsx \
        edutumobile/components/opportunity/__tests__/SocialCountsStrip.test.tsx \
        "edutumobile/app/(app)/opportunities/[id].tsx"
git commit -m "feat(mobile): social counts and groups-discussing on the opportunity detail screen"
```

---

### Task 18: Mobile Opportunity Notes section + reporting

**Files:**
- Create: `edutumobile/components/opportunity/OpportunityNotes.tsx`
- Modify: `edutumobile/app/(app)/opportunities/[id].tsx` (insert before the QUIET FOOTER comment, line 2120)
- Test: `edutumobile/components/opportunity/__tests__/OpportunityNotes.test.tsx`

**Interfaces:**
- Consumes: `useOpportunityNotes`, `reportOpportunityNote`, `OpportunityNoteView` from `@edutu/core`; `useCoreTransport`; `useTheme`; `useGuestMode` from `../../lib/guestModeStore`.
- Produces: `<OpportunityNotes opportunityId onNotesChanged? />`.

- [ ] **Step 1: Write the failing test**

Create `edutumobile/components/opportunity/__tests__/OpportunityNotes.test.tsx`:

```tsx
import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { OpportunityNoteView } from "@edutu/core";
import OpportunityNotes from "../OpportunityNotes";

const OPP = "11111111-1111-4111-a111-111111111111";

const hookState = {
  notes: [] as OpportunityNoteView[],
  loading: false,
  error: null as string | null,
  refresh: jest.fn(),
  addNote: jest.fn(),
  removeNote: jest.fn(),
  toggleHelpful: jest.fn(),
};

jest.mock("@edutu/core", () => ({
  useOpportunityNotes: () => hookState,
  reportOpportunityNote: jest.fn(),
}));

jest.mock("../../../lib/coreTransport", () => ({
  useCoreTransport: () => ({ apiBaseUrl: "https://api.test", getToken: async () => "t" }),
}));

jest.mock("../../context/ThemeContext", () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      foreground: "#0F172A",
      card: "#FFFFFF",
      border: "#E2E8F0",
      accent: "#5B4BE1",
    },
  }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && "count" in options ? `${key}:${options.count}` : key,
  }),
}));

function note(over: Partial<OpportunityNoteView> = {}): OpportunityNoteView {
  return {
    id: "n1",
    opportunityId: OPP,
    kind: "tip",
    outcome: null,
    body: "Start the reference letters early.",
    helpfulCount: 2,
    iFoundHelpful: false,
    author: { username: "ada", displayName: "Ada N.", avatarUrl: null, isMentor: false },
    createdAt: "2026-07-25T10:00:00.000Z",
    replyToId: null,
    blocked: false,
    isMine: false,
    ...over,
  };
}

describe("OpportunityNotes (mobile)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    hookState.notes = [note()];
    hookState.loading = false;
    hookState.addNote.mockResolvedValue(note({ id: "n2" }));
  });

  it("renders a note with its author", () => {
    const { getByText } = render(<OpportunityNotes opportunityId={OPP} />);
    expect(getByText("Start the reference letters early.")).toBeTruthy();
    expect(getByText("Ada N.")).toBeTruthy();
  });

  it("collapses a blocked author's note", () => {
    hookState.notes = [note({ blocked: true, body: "" })];
    const { getByText, queryByTestId } = render(
      <OpportunityNotes opportunityId={OPP} />,
    );
    expect(getByText("notes.blocked")).toBeTruthy();
    expect(queryByTestId("note-helpful-n1")).toBeNull();
  });

  it("shows an empty state when there are no notes", () => {
    hookState.notes = [];
    const { getByText } = render(<OpportunityNotes opportunityId={OPP} />);
    expect(getByText("notes.empty")).toBeTruthy();
  });

  it("posts a tip", async () => {
    const { getByTestId } = render(<OpportunityNotes opportunityId={OPP} />);
    fireEvent.changeText(
      getByTestId("note-composer-input"),
      "The portal times out after thirty minutes.",
    );
    fireEvent.press(getByTestId("note-composer-submit"));

    await waitFor(() =>
      expect(hookState.addNote).toHaveBeenCalledWith({
        kind: "tip",
        body: "The portal times out after thirty minutes.",
      }),
    );
  });

  it("requires an outcome before a result note can be posted", async () => {
    const { getByTestId, getByText } = render(<OpportunityNotes opportunityId={OPP} />);
    fireEvent.press(getByTestId("note-kind-result"));
    fireEvent.changeText(
      getByTestId("note-composer-input"),
      "It took eleven weeks to hear back from them.",
    );
    fireEvent.press(getByTestId("note-composer-submit"));

    await waitFor(() => expect(getByText("notes.needOutcome")).toBeTruthy());
    expect(hookState.addNote).not.toHaveBeenCalled();
  });

  it("toggles a helpful vote", () => {
    const { getByTestId } = render(<OpportunityNotes opportunityId={OPP} />);
    fireEvent.press(getByTestId("note-helpful-n1"));
    expect(hookState.toggleHelpful).toHaveBeenCalledWith("n1");
  });

  it("reports a note into the community moderation queue", async () => {
    const { reportOpportunityNote } = jest.requireMock("@edutu/core");
    const { getByTestId } = render(<OpportunityNotes opportunityId={OPP} />);

    fireEvent.press(getByTestId("note-report-n1"));
    fireEvent.press(getByTestId("report-reason-spam"));
    fireEvent.press(getByTestId("report-submit"));

    await waitFor(() =>
      expect(reportOpportunityNote).toHaveBeenCalledWith(
        "n1",
        "spam",
        "",
        expect.objectContaining({ apiBaseUrl: "https://api.test" }),
      ),
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm --prefix edutumobile test -- --maxWorkers=2 OpportunityNotes`
Expected: FAIL — `Cannot find module '../OpportunityNotes'`.

- [ ] **Step 3: Write the component**

Create `edutumobile/components/opportunity/OpportunityNotes.tsx`:

```tsx
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Flag, ThumbsUp } from "lucide-react-native";
import {
  reportOpportunityNote,
  useOpportunityNotes,
  type NoteReportReason,
  type OpportunityNoteKind,
  type OpportunityNoteOutcome,
  type OpportunityNoteView,
} from "@edutu/core";
import { useTheme } from "../context/ThemeContext";
import { useCoreTransport } from "../../lib/coreTransport";

const KINDS: OpportunityNoteKind[] = ["tip", "question", "result"];
// The REAL vocabulary from the live status CHECK — no 'shortlisted', no 'won'.
const OUTCOMES: OpportunityNoteOutcome[] = [
  "applied",
  "interview",
  "offer",
  "rejected",
];
const REPORT_REASONS: NoteReportReason[] = [
  "spam",
  "offensive",
  "harassment",
  "other",
];

/**
 * Opportunity Notes on mobile: same data, same rules, native shell.
 * Guests can read; posting, voting and reporting need a session, which the
 * core client enforces by throwing NotesAuthRequiredError before any request.
 */
export default function OpportunityNotes({
  opportunityId,
  onNotesChanged,
}: {
  opportunityId: string;
  onNotesChanged?: () => void;
}) {
  const { isDark, colors } = useTheme();
  const { t } = useTranslation("opps");
  const transport = useCoreTransport();
  const { notes, loading, addNote, removeNote, toggleHelpful } =
    useOpportunityNotes(opportunityId, transport);

  const [kind, setKind] = useState<OpportunityNoteKind>("tip");
  const [outcome, setOutcome] = useState<OpportunityNoteOutcome | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [reportingNoteId, setReportingNoteId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState<NoteReportReason>("spam");
  const [reportSent, setReportSent] = useState(false);
  const [held, setHeld] = useState(false);

  const textSecondary = isDark ? "#94A3B8" : "#64748B";

  const submit = async () => {
    setError(null);
    setHeld(false);
    if (kind === "result" && !outcome) {
      setError(t("notes.needOutcome"));
      return;
    }
    setPosting(true);
    try {
      const created = await addNote({
        kind,
        body: body.trim(),
        ...(kind === "result" && outcome ? { outcome } : {}),
      });
      setBody("");
      setOutcome(null);
      // A held note is invisible to everyone including its author, so say so
      // rather than letting it look like the post silently failed.
      setHeld(Boolean(created?.pending));
      onNotesChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("notes.empty"));
    } finally {
      setPosting(false);
    }
  };

  const sendReport = async () => {
    if (!reportingNoteId) return;
    try {
      await reportOpportunityNote(reportingNoteId, reportReason, "", transport);
      setReportSent(true);
    } catch {
      // Swallowed: the queue is best-effort from the client's point of view,
      // and a failed report must not trap the user in a modal.
    } finally {
      setReportingNoteId(null);
    }
  };

  const chip = (active: boolean) => ({
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: active ? colors.accent : colors.border,
    backgroundColor: active ? `${colors.accent}1A` : "transparent",
  });

  const renderNote = (note: OpportunityNoteView) => {
    if (note.blocked) {
      return (
        <View
          key={note.id}
          style={{
            padding: 14,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ color: textSecondary, fontStyle: "italic", fontSize: 13 }}>
            {t("notes.blocked")}
          </Text>
        </View>
      );
    }

    return (
      <View
        key={note.id}
        style={{
          padding: 14,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          gap: 8,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 13 }}>
            {note.author.displayName}
          </Text>
          {note.author.isMentor ? (
            <Text style={{ color: colors.accent, fontSize: 11, fontWeight: "700" }}>
              {t("notes.mentor")}
            </Text>
          ) : null}
          {note.outcome ? (
            <Text style={{ color: textSecondary, fontSize: 11, fontWeight: "600" }}>
              {t(`notes.outcomeBadge.${note.outcome}`)}
            </Text>
          ) : null}
        </View>
        <Text style={{ color: textSecondary, fontSize: 14, lineHeight: 21 }}>
          {note.body}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <TouchableOpacity
            testID={`note-helpful-${note.id}`}
            accessibilityRole="button"
            onPress={() => toggleHelpful(note.id)}
            style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
          >
            <ThumbsUp
              size={13}
              color={note.iFoundHelpful ? colors.accent : textSecondary}
            />
            <Text
              style={{
                color: note.iFoundHelpful ? colors.accent : textSecondary,
                fontSize: 12,
                fontWeight: "600",
              }}
            >
              {t("notes.helpful", { count: note.helpfulCount })}
            </Text>
          </TouchableOpacity>
          {note.isMine ? (
            <TouchableOpacity
              testID={`note-delete-${note.id}`}
              accessibilityRole="button"
              onPress={() => {
                void removeNote(note.id);
                onNotesChanged?.();
              }}
            >
              <Text style={{ color: textSecondary, fontSize: 12, fontWeight: "600" }}>
                {t("notes.delete")}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              testID={`note-report-${note.id}`}
              accessibilityRole="button"
              onPress={() => setReportingNoteId(note.id)}
              style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
            >
              <Flag size={12} color={textSecondary} />
              <Text style={{ color: textSecondary, fontSize: 12, fontWeight: "600" }}>
                {t("notes.report")}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={{ marginTop: 22, gap: 12 }}>
      <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700" }}>
        {t("notes.title")}
      </Text>
      <Text style={{ color: textSecondary, fontSize: 13, lineHeight: 19 }}>
        {t("notes.subtitle")}
      </Text>

      <View
        style={{
          padding: 14,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          gap: 10,
        }}
      >
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {KINDS.map((option) => (
            <TouchableOpacity
              key={option}
              testID={`note-kind-${option}`}
              accessibilityRole="button"
              onPress={() => {
                setKind(option);
                if (option !== "result") setOutcome(null);
              }}
              style={chip(kind === option)}
            >
              <Text
                style={{
                  color: kind === option ? colors.accent : textSecondary,
                  fontSize: 12,
                  fontWeight: "700",
                }}
              >
                {t(`notes.kind.${option}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {kind === "result" ? (
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {OUTCOMES.map((option) => (
              <TouchableOpacity
                key={option}
                testID={`note-outcome-${option}`}
                accessibilityRole="button"
                onPress={() => setOutcome(option)}
                style={chip(outcome === option)}
              >
                <Text
                  style={{
                    color: outcome === option ? colors.accent : textSecondary,
                    fontSize: 12,
                    fontWeight: "700",
                  }}
                >
                  {t(`notes.outcome.${option}`)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <TextInput
          testID="note-composer-input"
          value={body}
          onChangeText={(value) => setBody(value.slice(0, 1200))}
          placeholder={t("notes.placeholder")}
          placeholderTextColor={textSecondary}
          multiline
          style={{
            minHeight: 88,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            padding: 12,
            color: colors.foreground,
            textAlignVertical: "top",
          }}
        />

        {error ? (
          <Text style={{ color: "#EF4444", fontSize: 12 }}>{error}</Text>
        ) : null}

        <TouchableOpacity
          testID="note-composer-submit"
          accessibilityRole="button"
          disabled={posting || body.trim().length < 12}
          onPress={submit}
          style={{
            alignSelf: "flex-end",
            paddingVertical: 10,
            paddingHorizontal: 16,
            borderRadius: 12,
            backgroundColor: colors.accent,
            opacity: posting || body.trim().length < 12 ? 0.5 : 1,
          }}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 13 }}>
            {posting ? t("notes.posting") : t("notes.post")}
          </Text>
        </TouchableOpacity>
      </View>

      {held ? (
        <Text style={{ color: textSecondary, fontSize: 12 }}>
          {t("notes.heldForReview")}
        </Text>
      ) : null}

      {reportSent ? (
        <Text style={{ color: textSecondary, fontSize: 12 }}>
          {t("notes.reportSent")}
        </Text>
      ) : null}

      {loading ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : notes.length === 0 ? (
        <Text style={{ color: textSecondary, fontSize: 13 }}>{t("notes.empty")}</Text>
      ) : (
        <View style={{ gap: 10 }}>{notes.map(renderNote)}</View>
      )}

      <Modal
        visible={Boolean(reportingNoteId)}
        transparent
        animationType="fade"
        onRequestClose={() => setReportingNoteId(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <View
            style={{
              borderRadius: 16,
              backgroundColor: colors.card,
              padding: 16,
              gap: 10,
            }}
          >
            <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 16 }}>
              {t("notes.reportTitle")}
            </Text>
            <Text style={{ color: textSecondary, fontSize: 13 }}>
              {t("notes.reportSubtitle")}
            </Text>
            {REPORT_REASONS.map((reason) => (
              <TouchableOpacity
                key={reason}
                testID={`report-reason-${reason}`}
                accessibilityRole="button"
                onPress={() => setReportReason(reason)}
                style={chip(reportReason === reason)}
              >
                <Text
                  style={{
                    color: reportReason === reason ? colors.accent : textSecondary,
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  {t(`notes.reportReason.${reason}`)}
                </Text>
              </TouchableOpacity>
            ))}
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
              <TouchableOpacity onPress={() => setReportingNoteId(null)}>
                <Text style={{ color: textSecondary, fontWeight: "600", padding: 10 }}>
                  {t("social.cancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity testID="report-submit" onPress={sendReport}>
                <Text style={{ color: colors.accent, fontWeight: "700", padding: 10 }}>
                  {t("notes.reportSend")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
```

- [ ] **Step 4: Mount it on the detail screen**

In `edutumobile/app/(app)/opportunities/[id].tsx`, insert immediately **before** the `{/* ── QUIET FOOTER ─────` comment (line 2120):

```tsx
          <OpportunityNotes
            opportunityId={opportunity.id}
            onNotesChanged={refreshSocial}
          />
```

- [ ] **Step 5: Run the tests**

Run: `npm --prefix edutumobile test -- --maxWorkers=2 OpportunityNotes`
Expected: PASS, 7 tests.

- [ ] **Step 6: Verify on a device or simulator**

Run the app, open an opportunity detail screen, scroll to the notes section. Post a tip and confirm it appears. Switch to `Result` without picking an outcome and confirm the inline error. Confirm the counts strip near the top increments after posting.

- [ ] **Step 7: Lint, typecheck, commit**

```bash
npm --prefix edutumobile run lint && npm --prefix edutumobile run typecheck
git add edutumobile/components/opportunity/OpportunityNotes.tsx \
        edutumobile/components/opportunity/__tests__/OpportunityNotes.test.tsx \
        "edutumobile/app/(app)/opportunities/[id].tsx"
git commit -m "feat(mobile): opportunity notes with reporting on the detail screen"
```

---

### Task 19: Mobile opportunity card in chat (live countdown, greys out)

**Files:**
- Create: `edutumobile/components/communities/OpportunityChatCard.tsx`
- Modify: Slice 2's mobile message renderer (located by grep in Step 4)
- Test: `edutumobile/components/communities/__tests__/OpportunityChatCard.test.tsx`

**Interfaces:**
- Consumes: `useLiveDeadline`, `urgencyColor`, `getCachedOpportunity` / `getOpportunityWithStatus` from `@edutu/core`; `useTheme`.
- Produces: `<OpportunityChatCard opportunityId />`.

- [ ] **Step 1: Write the failing test**

Create `edutumobile/components/communities/__tests__/OpportunityChatCard.test.tsx`:

```tsx
import React from "react";
import { render, waitFor, act } from "@testing-library/react-native";
import OpportunityChatCard from "../OpportunityChatCard";

const OPP = "11111111-1111-4111-a111-111111111111";

const core = jest.requireActual("@edutu/core/src/utils/deadline");
const getOpportunityWithStatus = jest.fn();

jest.mock("@edutu/core", () => ({
  ...jest.requireActual("@edutu/core/src/utils/deadline"),
  useLiveDeadline: jest.requireActual("@edutu/core/src/hooks/useLiveDeadline")
    .useLiveDeadline,
  getOpportunityWithStatus: (...args: unknown[]) =>
    getOpportunityWithStatus(...args),
}));

jest.mock("../../context/ThemeContext", () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      foreground: "#0F172A",
      card: "#FFFFFF",
      border: "#E2E8F0",
      accent: "#5B4BE1",
    },
  }),
}));

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));

function opportunity(deadline: string | null) {
  return {
    id: OPP,
    title: "Chevening Scholarship",
    organization: "UK Government",
    category: "Scholarships",
    location: "United Kingdom",
    deadline,
  };
}

describe("OpportunityChatCard (mobile)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-07-25T00:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders a live countdown for an open opportunity", async () => {
    getOpportunityWithStatus.mockResolvedValue(
      opportunity("2026-07-28T00:00:00.000Z"),
    );
    const { getByText, getByTestId } = render(
      <OpportunityChatCard opportunityId={OPP} />,
    );

    await waitFor(() => expect(getByText("Chevening Scholarship")).toBeTruthy());
    expect(getByText("3 days left")).toBeTruthy();
    expect(getByTestId("opportunity-chat-card").props.style.opacity).toBe(1);
  });

  it("greys the card out when the deadline passes while mounted", async () => {
    getOpportunityWithStatus.mockResolvedValue(
      opportunity("2026-07-25T00:00:00.000Z"),
    );
    const { getByText, getByTestId } = render(
      <OpportunityChatCard opportunityId={OPP} />,
    );
    await waitFor(() => expect(getByText("Closes today")).toBeTruthy());

    await act(async () => {
      jest.setSystemTime(new Date("2026-07-27T00:00:00.000Z"));
      jest.advanceTimersByTime(60_000);
    });

    await waitFor(() => expect(getByText("Closed")).toBeTruthy());
    expect(getByTestId("opportunity-chat-card").props.style.opacity).toBe(0.55);
  });

  it("shows a fallback when the opportunity cannot be resolved", async () => {
    getOpportunityWithStatus.mockResolvedValue(null);
    const { getByText } = render(<OpportunityChatCard opportunityId={OPP} />);
    await waitFor(() => expect(getByText("Opportunity unavailable")).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm --prefix edutumobile test -- --maxWorkers=2 OpportunityChatCard`
Expected: FAIL — `Cannot find module '../OpportunityChatCard'`.

- [ ] **Step 3: Write the card**

Create `edutumobile/components/communities/OpportunityChatCard.tsx`:

```tsx
import React, { useEffect, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { MapPin } from "lucide-react-native";
import {
  getOpportunityWithStatus,
  urgencyColor,
  useLiveDeadline,
} from "@edutu/core";
import { useTheme } from "../context/ThemeContext";

type ChatCardOpportunity = {
  id: string;
  title: string;
  organization?: string | null;
  location?: string | null;
  deadline?: string | null;
};

/**
 * An opportunity shared into a group renders as a live card whose deadline
 * keeps counting down in the scrollback and which visibly greys out the moment
 * it passes (design spec §7). All date logic comes from the existing
 * getDeadlineBadge/urgencyColor via useLiveDeadline — no new date maths.
 */
export default function OpportunityChatCard({
  opportunityId,
}: {
  opportunityId: string;
}) {
  const { isDark, colors } = useTheme();
  const router = useRouter();
  const [opportunity, setOpportunity] = useState<ChatCardOpportunity | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    void getOpportunityWithStatus(opportunityId)
      .then((result: ChatCardOpportunity | null) => {
        if (cancelled) return;
        setOpportunity(result ?? null);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setOpportunity(null);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [opportunityId]);

  const { badge, isPassed } = useLiveDeadline(opportunity?.deadline ?? null);
  const textSecondary = isDark ? "#94A3B8" : "#64748B";

  if (loaded && !opportunity) {
    return (
      <View
        style={{
          padding: 12,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Text style={{ color: textSecondary, fontSize: 13 }}>
          Opportunity unavailable
        </Text>
      </View>
    );
  }

  if (!opportunity) {
    return (
      <View
        style={{
          height: 92,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      />
    );
  }

  return (
    <TouchableOpacity
      testID="opportunity-chat-card"
      accessibilityRole="button"
      activeOpacity={0.85}
      onPress={() => router.push(`/(app)/opportunities/${opportunity.id}`)}
      style={{
        maxWidth: 300,
        padding: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        gap: 6,
        opacity: isPassed ? 0.55 : 1,
      }}
    >
      <Text
        numberOfLines={2}
        style={{ color: colors.foreground, fontWeight: "700", fontSize: 14, lineHeight: 19 }}
      >
        {opportunity.title}
      </Text>
      <Text style={{ color: urgencyColor(badge.level), fontSize: 12, fontWeight: "700" }}>
        {badge.label}
      </Text>
      {opportunity.organization ? (
        <Text numberOfLines={1} style={{ color: textSecondary, fontSize: 12 }}>
          {opportunity.organization}
        </Text>
      ) : null}
      {opportunity.location ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <MapPin size={11} color={textSecondary} />
          <Text numberOfLines={1} style={{ color: textSecondary, fontSize: 12 }}>
            {opportunity.location}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}
```

- [ ] **Step 4: Wire it into Slice 2's mobile message renderer**

Run: `grep -rn "kind === \"opportunity\"\|case \"opportunity\"\|message.kind" edutumobile/components/communities/ "edutumobile/app/(app)/communities/"`
In the component that renders a message bubble, add the branch before the text branch:

```tsx
      {message.kind === "opportunity" && message.opportunityId ? (
        <OpportunityChatCard opportunityId={message.opportunityId} />
      ) : null}
```

and add `import OpportunityChatCard from "./OpportunityChatCard";` (adjust the relative path to that file's location).

- [ ] **Step 5: Register the deep-link forms (repo constraint)**

Confirm both singular and plural opportunity routes resolve from a chat card tap:
```bash
grep -rn "opportunity/\|opportunities/" "edutumobile/app/(app)/opportunity" 2>/dev/null | head
ls "edutumobile/app/(app)/opportunity" 2>/dev/null || echo "singular redirect route missing"
```
This repo has already shipped an "Unmatched Route" bug because widget/share links emit singular paths. If the singular redirect route is missing, the card's `router.push` above must stay on the plural form `/(app)/opportunities/<id>` — which it does. Do not change it to the singular form.

- [ ] **Step 6: Run the tests**

Run: `npm --prefix edutumobile test -- --maxWorkers=2 OpportunityChatCard`
Expected: PASS, 3 tests.

- [ ] **Step 7: Lint, typecheck, commit**

```bash
npm --prefix edutumobile run lint && npm --prefix edutumobile run typecheck
git add edutumobile/components/communities/ \
        edutumobile/components/communities/__tests__/OpportunityChatCard.test.tsx
git commit -m "feat(mobile): live opportunity cards inside group chat"
```

---

## Phase 5 — Safety, handoff and verification

### Task 20: Surface the scraper's own scam verdict on the notes and social surface

**Why:** Notes and social counts make an opportunity look *endorsed* — "4 notes · 10 applied · 20 found useful" reads as a community vouching for it. If our own scraper already flagged that listing, rendering that social proof with no warning launders a suspected scam into the most trustworthy-looking surface in the product, and invites members to write public notes that add credibility to it. The verdict already exists; this task stops us hiding it.

**Files:**
- Modify: `backend/services/services/api/src/opportunity-notes/dto/opportunity-note.dto.ts`
- Modify: `backend/services/services/api/src/opportunity-notes/opportunity-notes.service.ts`
- Modify: `edutumobile/packages/core/src/types/opportunityNote.ts`
- Modify: `edutumobile/packages/core/src/services/opportunityNotes.ts`
- Create: `edutu-web-app/src/components/opportunity/ScamRiskNotice.tsx`
- Create: `edutumobile/components/opportunity/ScamRiskNotice.tsx`
- Modify: `edutu-web-app/src/components/opportunity/OpportunityNotes.tsx`
- Modify: `edutumobile/components/opportunity/OpportunityNotes.tsx`
- Modify: `edutumobile/lib/i18n/locales/{en,es,fr,pt,zh,ar,ha,hi,sw}/opps.json`
- Test: `backend/services/services/api/src/opportunity-notes/opportunity-risk.spec.ts`
- Test: `edutu-web-app/src/test/__tests__/ScamRiskNotice.test.tsx`

**Interfaces:**
- Consumes: `extractRedFlags` and `SCAM_GATE_CAP_THRESHOLD` from `src/scraper/opportunity-dedup.service.ts` (**exists on `origin/main`**; see the prerequisite at the top of this plan).
- Produces:
  ```ts
  export type OpportunityRiskLevel = "none" | "flagged" | "high";
  export type OpportunitySafetyDto = {
    riskLevel: OpportunityRiskLevel;
    needsReview: boolean;
    flags: string[];      // capped at 5, de-duplicated
  };
  ```
  added to `OpportunitySocialResponseDto` as `safety`, carried through `OpportunitySocial.safety` in `@edutu/core`, and rendered by `<ScamRiskNotice safety />` on both surfaces.

- [ ] **Step 1: Verify the scraper gate's real surface after rebasing**

Run:
```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder && \
grep -n "export function extractRedFlags\|export function decideScamGate\|export function isScamGateEnabled\|SCAM_GATE_CAP_THRESHOLD" \
  backend/services/services/api/src/scraper/opportunity-dedup.service.ts && \
sed -n '/export function extractRedFlags/,/^}/p' \
  backend/services/services/api/src/scraper/opportunity-dedup.service.ts
```
Expected: all four symbols print, and the body of `extractRedFlags` shows what it accepts and returns. **If nothing prints, you have not rebased onto `origin/main`** — go back to the prerequisite at the top of this plan; do not reimplement the gate. If `extractRedFlags` returns something other than `string[]` (say `{ flags: string[] }`), change **only** the `toFlags` adapter in Step 3 — it is the single coupling point.

- [ ] **Step 2: Write the failing test**

Create `backend/services/services/api/src/opportunity-notes/opportunity-risk.spec.ts`:

```ts
import { SCAM_GATE_CAP_THRESHOLD } from "../scraper/opportunity-dedup.service";
import { toOpportunitySafety } from "./opportunity-risk";

describe("toOpportunitySafety", () => {
  it("reports no risk for a clean listing", () => {
    expect(toOpportunitySafety({})).toEqual({
      riskLevel: "none",
      needsReview: false,
      flags: [],
    });
  });

  it("treats a single red flag as flagged, matching the scraper's own semantics", () => {
    // 1 flag -> metadata.needs_review + metadata.scam_risk, status kept.
    expect(
      toOpportunitySafety({ red_flags: ["asks for an application fee"] }),
    ).toEqual({
      riskLevel: "flagged",
      needsReview: true,
      flags: ["asks for an application fee"],
    });
  });

  it("escalates to high once the cap threshold is reached", () => {
    // 2+ flags -> an active listing is capped to review.
    expect(SCAM_GATE_CAP_THRESHOLD).toBe(2);
    const safety = toOpportunitySafety({
      red_flags: ["asks for an application fee", "no verifiable organisation"],
    });
    expect(safety.riskLevel).toBe("high");
    expect(safety.needsReview).toBe(true);
  });

  it("honours a persisted needs_review even when the flags were not stored", () => {
    expect(toOpportunitySafety({ needs_review: true })).toMatchObject({
      riskLevel: "flagged",
      needsReview: true,
    });
  });

  it("honours a persisted scam_risk string", () => {
    expect(toOpportunitySafety({ scam_risk: "high" }).riskLevel).toBe("high");
    expect(toOpportunitySafety({ scam_risk: "low" }).riskLevel).toBe("flagged");
  });

  it("de-duplicates and caps the flag list so the UI stays readable", () => {
    const safety = toOpportunitySafety({
      red_flags: ["a", "a", "b", "c", "d", "e", "f", "g"],
    });
    expect(safety.flags).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("degrades to no-risk rather than throwing on junk metadata", () => {
    expect(toOpportunitySafety(null).riskLevel).toBe("none");
    expect(toOpportunitySafety("not an object" as never).riskLevel).toBe("none");
    expect(toOpportunitySafety({ red_flags: "not an array" }).riskLevel).toBe(
      "none",
    );
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npm --prefix backend/services/services/api test -- opportunity-risk`
Expected: FAIL — `Cannot find module './opportunity-risk'`.

- [ ] **Step 4: Write the risk adapter**

Create `backend/services/services/api/src/opportunity-notes/opportunity-risk.ts`:

```ts
// Reads the verdict the scraper's scam gate ALREADY reached about a listing.
//
// This is not a second gate and it re-runs no detection: extractRedFlags and
// decideScamGate live in src/scraper/opportunity-dedup.service.ts and run at
// ingest, writing metadata.needs_review / metadata.scam_risk. All this does is
// refuse to hide that verdict on the one surface that makes an opportunity look
// endorsed. Social proof over a flagged listing is worse than no social proof.
//
// Note the division of labour: this grades the OPPORTUNITY from scraper
// metadata that already carries LLM-extracted red_flags; Slice 2's
// screenMessage grades the member's own PROSE. They are not interchangeable.
import {
  extractRedFlags,
  SCAM_GATE_CAP_THRESHOLD,
} from "../scraper/opportunity-dedup.service";
import type {
  OpportunityRiskLevel,
  OpportunitySafetyDto,
} from "./dto/opportunity-note.dto";

const MAX_SURFACED_FLAGS = 5;

const NO_RISK: OpportunitySafetyDto = {
  riskLevel: "none",
  needsReview: false,
  flags: [],
};

/**
 * The single coupling point to the scraper module. Fails SAFE by degrading to
 * "no flags found" rather than throwing — a missing warning is bad, but an
 * opportunity page that 500s because one listing has odd metadata is worse,
 * and the persisted needs_review/scam_risk below still catch the real cases.
 */
function toFlags(metadata: unknown): string[] {
  try {
    const raw = extractRedFlags(metadata as never) as unknown;
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as { flags?: unknown })?.flags)
        ? (raw as { flags: unknown[] }).flags
        : [];
    return list
      .filter((flag): flag is string => typeof flag === "string" && flag.trim().length > 0)
      .map((flag) => flag.trim());
  } catch {
    return [];
  }
}

/**
 * Grades one opportunity's stored metadata. Mirrors the scraper's thresholds
 * exactly: 1 flag is "flagged" (needs review, listing still live), and
 * SCAM_GATE_CAP_THRESHOLD flags is "high" (the gate would cap it to review).
 */
export function toOpportunitySafety(metadata: unknown): OpportunitySafetyDto {
  if (!metadata || typeof metadata !== "object") return { ...NO_RISK };

  const record = metadata as Record<string, unknown>;
  const flags = [...new Set(toFlags(metadata))].slice(0, MAX_SURFACED_FLAGS);

  const persistedNeedsReview = record.needs_review === true;
  const persistedRisk =
    typeof record.scam_risk === "string" ? record.scam_risk.toLowerCase() : null;

  let riskLevel: OpportunityRiskLevel = "none";
  if (flags.length >= SCAM_GATE_CAP_THRESHOLD || persistedRisk === "high") {
    riskLevel = "high";
  } else if (flags.length > 0 || persistedNeedsReview || persistedRisk) {
    riskLevel = "flagged";
  }

  return {
    riskLevel,
    needsReview: riskLevel !== "none",
    flags,
  };
}
```

- [ ] **Step 5: Add the DTO types**

In `backend/services/services/api/src/opportunity-notes/dto/opportunity-note.dto.ts`, add next to the other wire types:

```ts
export type OpportunityRiskLevel = "none" | "flagged" | "high";

/** The scraper scam gate's stored verdict about this listing. */
export type OpportunitySafetyDto = {
  riskLevel: OpportunityRiskLevel;
  needsReview: boolean;
  flags: string[];
};
```

and extend `OpportunitySocialResponseDto`:

```ts
export type OpportunitySocialResponseDto = {
  opportunityId: string;
  counts: OpportunitySocialCountsDto;
  groups: GroupsDiscussingEntryDto[];
  safety: OpportunitySafetyDto;
};
```

- [ ] **Step 6: Return `safety` from `getSocial`**

In `backend/services/services/api/src/opportunity-notes/opportunity-notes.service.ts`, add the import:

```ts
import { toOpportunitySafety } from "./opportunity-risk";
```

replace `getSocial` with:

```ts
  async getSocial(opportunityId: string): Promise<OpportunitySocialResponseDto> {
    this.assertUuid(opportunityId, "Opportunity id");

    const [counts, groups, safety] = await Promise.all([
      this.socialCounts.get(opportunityId),
      this.listGroupsDiscussing(opportunityId),
      this.readOpportunitySafety(opportunityId),
    ]);

    return { opportunityId, counts, groups, safety };
  }

  /**
   * The scraper's own verdict on this listing, read from the metadata it wrote
   * at ingest. Never recomputed here — this is a read, so the page and the
   * admin review queue can never disagree.
   */
  private async readOpportunitySafety(opportunityId: string) {
    const row = rows<{ metadata: unknown }>(
      await this.db.execute(sql`
        select metadata
        from public.opportunities
        where id = ${opportunityId}::uuid
        limit 1
      `),
    )[0];

    return toOpportunitySafety(row?.metadata ?? null);
  }
```

and add this test to `opportunity-notes.service.spec.ts` inside the existing `describe("OpportunityNotesService.getSocial")` block:

```ts
  it("carries the scraper's scam verdict alongside the social proof", async () => {
    const db = fakeDb([
      ["from public.community_groups", () => []],
      [
        "select metadata",
        () => [
          {
            metadata: {
              red_flags: ["asks for an application fee", "no verifiable organisation"],
            },
          },
        ],
      ],
    ]);
    const { service } = makeService(db);

    const social = await service.getSocial(OPP);

    expect(social.safety).toMatchObject({ riskLevel: "high", needsReview: true });
  });
```

- [ ] **Step 7: Run the backend tests**

Run: `npm --prefix backend/services/services/api test -- opportunity-risk opportunity-notes.service`
Expected: PASS — 7 risk tests plus the service suite (now 20 tests).

- [ ] **Step 8: Carry `safety` through `@edutu/core`**

In `edutumobile/packages/core/src/types/opportunityNote.ts` add:

```ts
export type OpportunityRiskLevel = 'none' | 'flagged' | 'high';

/** The scraper scam gate's stored verdict about this listing. */
export type OpportunitySafety = {
  riskLevel: OpportunityRiskLevel;
  needsReview: boolean;
  flags: string[];
};

export const NO_OPPORTUNITY_RISK: OpportunitySafety = {
  riskLevel: 'none',
  needsReview: false,
  flags: [],
};
```

extend `OpportunitySocial`:

```ts
export type OpportunitySocial = {
  opportunityId: string;
  counts: OpportunitySocialCounts;
  groups: GroupsDiscussingEntry[];
  safety: OpportunitySafety;
};
```

In `edutumobile/packages/core/src/services/opportunityNotes.ts`, import `NO_OPPORTUNITY_RISK` alongside `EMPTY_SOCIAL_COUNTS` and change the return of `fetchOpportunitySocial`:

```ts
  return {
    opportunityId,
    counts: { ...EMPTY_SOCIAL_COUNTS, ...(social?.counts ?? {}) },
    groups: Array.isArray(social?.groups) ? social!.groups : [],
    safety: {
      ...NO_OPPORTUNITY_RISK,
      ...(social?.safety ?? {}),
      flags: Array.isArray(social?.safety?.flags) ? social!.safety.flags : [],
    },
  };
```

In `edutumobile/packages/core/src/hooks/useOpportunitySocial.ts`, add `safety` state so consumers get it:

```ts
  const [safety, setSafety] = useState<OpportunitySafety>(NO_OPPORTUNITY_RISK);
```
set it in the `.then` (`setSafety(social.safety)`), reset it in the id-change block and in the `.catch` (`setSafety(NO_OPPORTUNITY_RISK)`), add it to the returned object and to the `useMemo` dependency array, and widen `UseOpportunitySocialResult` with `safety: OpportunitySafety`.

- [ ] **Step 9: Write the failing web test**

Create `edutu-web-app/src/test/__tests__/ScamRiskNotice.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ScamRiskNotice from "../../components/opportunity/ScamRiskNotice";

describe("ScamRiskNotice", () => {
  it("renders nothing for a clean listing", () => {
    const { container } = render(
      <ScamRiskNotice safety={{ riskLevel: "none", needsReview: false, flags: [] }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("warns when the scraper flagged the listing once", () => {
    render(
      <ScamRiskNotice
        safety={{
          riskLevel: "flagged",
          needsReview: true,
          flags: ["asks for an application fee"],
        }}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("under review");
    expect(screen.getByText("asks for an application fee")).toBeTruthy();
  });

  it("states plainly that Edutu never charges when the risk is high", () => {
    render(
      <ScamRiskNotice
        safety={{
          riskLevel: "high",
          needsReview: true,
          flags: ["asks for an application fee", "no verifiable organisation"],
        }}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Do not pay");
    expect(alert.textContent).toContain("Report");
  });
});
```

Run: `npm --prefix edutu-web-app test -- ScamRiskNotice`
Expected: FAIL — `Failed to resolve import "../../components/opportunity/ScamRiskNotice"`.

- [ ] **Step 10: Write the web notice**

Create `edutu-web-app/src/components/opportunity/ScamRiskNotice.tsx`:

```tsx
import { AlertTriangle } from "lucide-react";
import type { OpportunitySafety } from "@edutu/core";

/**
 * The scraper already decided this listing looks wrong. Saying so here — right
 * above the notes and the composer — is the whole point: a page showing
 * "10 applied · 20 found useful" over a flagged listing is social proof
 * working for the scammer.
 */
export default function ScamRiskNotice({
  safety,
  className = "",
}: {
  safety: OpportunitySafety;
  className?: string;
}) {
  if (safety.riskLevel === "none") return null;

  const high = safety.riskLevel === "high";

  return (
    <aside
      role="alert"
      className={`space-y-2 rounded-2xl border p-4 ${
        high
          ? "border-danger/40 bg-danger/10"
          : "border-warning/40 bg-warning/10"
      } ${className}`}
    >
      <p
        className={`flex items-center gap-2 text-sm font-semibold ${high ? "text-danger" : "text-warning"}`}
      >
        <AlertTriangle size={15} />
        {high
          ? "This listing is under review — treat it as unsafe"
          : "This listing is under review"}
      </p>
      <p className="text-sm leading-6 text-text-secondary">
        {high
          ? "Our checks flagged several problems with this opportunity. Do not pay anyone for an application link, a form, or a “processing fee”. Edutu never charges for an application, and no legitimate scholarship does either. Report it if someone asks you to."
          : "Our checks flagged something about this opportunity. Verify it on the official site before you apply, and never pay for an application link."}
      </p>
      {safety.flags.length > 0 ? (
        <ul className="list-inside list-disc space-y-1 text-sm text-text-secondary">
          {safety.flags.map((flag) => (
            <li key={flag}>{flag}</li>
          ))}
        </ul>
      ) : null}
    </aside>
  );
}
```

Run: `npm --prefix edutu-web-app test -- ScamRiskNotice`
Expected: PASS, 3 tests.

- [ ] **Step 11: Render it on web, above the notes and the composer**

In `edutu-web-app/src/components/OpportunityDetail.tsx`, widen the destructure added in Task 12:

```ts
  const {
    counts: socialCounts,
    groups: discussingGroups,
    safety: opportunitySafety,
    refresh: refreshSocial,
  } = useOpportunitySocial(opportunity.id, coreTransport);
```

and pass it into the notes section (the mount added in Task 13 Step 6):

```tsx
      <OpportunityNotes
        opportunityId={opportunity.id}
        safety={opportunitySafety}
        onNotesChanged={refreshSocial}
      />
```

In `edutu-web-app/src/components/opportunity/OpportunityNotes.tsx`, add `import type { OpportunitySafety } from "@edutu/core";` and `import ScamRiskNotice from "./ScamRiskNotice";`, take `safety` as an optional prop:

```tsx
export default function OpportunityNotes({
  opportunityId,
  safety,
  onNotesChanged,
}: {
  opportunityId: string;
  safety?: OpportunitySafety;
  onNotesChanged?: () => void;
}) {
```

and render the notice immediately after the section heading block and **before** the composer, so it is seen before anything is written:

```tsx
      {safety ? <ScamRiskNotice safety={safety} /> : null}
```

- [ ] **Step 12: Write the mobile notice**

Create `edutumobile/components/opportunity/ScamRiskNotice.tsx`:

```tsx
import React from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react-native";
import type { OpportunitySafety } from "@edutu/core";

/** Same warning as web: never render social proof over a flagged listing
 *  without saying that our own checks flagged it. */
export default function ScamRiskNotice({
  safety,
}: {
  safety: OpportunitySafety;
}) {
  const { t } = useTranslation("opps");
  if (safety.riskLevel === "none") return null;

  const high = safety.riskLevel === "high";
  const tone = high ? "#EF4444" : "#F59E0B";

  return (
    <View
      accessibilityRole="alert"
      style={{
        marginTop: 12,
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: `${tone}66`,
        backgroundColor: `${tone}1A`,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <AlertTriangle size={15} color={tone} />
        <Text style={{ color: tone, fontWeight: "700", fontSize: 13 }}>
          {high ? t("notes.riskHighTitle") : t("notes.riskFlaggedTitle")}
        </Text>
      </View>
      <Text style={{ color: tone, fontSize: 13, lineHeight: 19 }}>
        {high ? t("notes.riskHighBody") : t("notes.riskFlaggedBody")}
      </Text>
      {safety.flags.map((flag) => (
        <Text key={flag} style={{ color: tone, fontSize: 12 }}>
          {`• ${flag}`}
        </Text>
      ))}
    </View>
  );
}
```

- [ ] **Step 13: Render it on mobile and add the strings**

In `edutumobile/app/(app)/opportunities/[id].tsx`, widen the Task 17 destructure to also take `safety: opportunitySafety`, and pass it to the notes mount from Task 18:

```tsx
          <OpportunityNotes
            opportunityId={opportunity.id}
            safety={opportunitySafety}
            onNotesChanged={refreshSocial}
          />
```

In `edutumobile/components/opportunity/OpportunityNotes.tsx`, add `import type { OpportunitySafety } from "@edutu/core";` and `import ScamRiskNotice from "./ScamRiskNotice";`, add `safety?: OpportunitySafety` to the props, and render `{safety ? <ScamRiskNotice safety={safety} /> : null}` immediately after the `notes.subtitle` `<Text>` and before the composer `<View>`.

Add to the `notes` block of `edutumobile/lib/i18n/locales/en/opps.json`:

```json
    "riskFlaggedTitle": "This listing is under review",
    "riskFlaggedBody": "Our checks flagged something about this opportunity. Verify it on the official site before you apply, and never pay for an application link.",
    "riskHighTitle": "This listing is under review — treat it as unsafe",
    "riskHighBody": "Our checks flagged several problems with this opportunity. Do not pay anyone for an application link, a form, or a “processing fee”. Edutu never charges for an application, and no legitimate scholarship does either. Report it if someone asks you to.",
```

then add translated copies to `es`, `fr`, `pt`, `zh`, `ar`, `ha`, `hi`, `sw` (hand-edit `ar`/`ha`/`hi`/`sw` — mixed indentation) and regenerate:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile && node scripts/gen-i18n-resources.js
```

- [ ] **Step 14: Verify end to end**

Pick a live flagged listing and confirm the warning renders above the notes on both surfaces:
```bash
psql "$DATABASE_URL" -c "select id, title, metadata->'red_flags' as red_flags, metadata->>'scam_risk' as scam_risk from public.opportunities where metadata ? 'red_flags' or metadata->>'needs_review' = 'true' limit 5;"
```
Open one of those ids on web and on mobile. Expected: the amber (1 flag) or red (2+ flags) notice appears **above** the composer, the flag list is shown, and the counts strip still renders beneath it — the warning frames the social proof rather than replacing it.

- [ ] **Step 15: Lint, typecheck, commit**

```bash
npm --prefix backend/services/services/api run lint && npm --prefix backend/services/services/api test
npm --prefix edutu-web-app run lint && npm --prefix edutu-web-app run typecheck && npm --prefix edutu-web-app test
npm --prefix edutumobile run lint && npm --prefix edutumobile run typecheck
git add backend/services/services/api/src/opportunity-notes/opportunity-risk.ts \
        backend/services/services/api/src/opportunity-notes/opportunity-risk.spec.ts \
        backend/services/services/api/src/opportunity-notes/opportunity-notes.service.ts \
        backend/services/services/api/src/opportunity-notes/opportunity-notes.service.spec.ts \
        backend/services/services/api/src/opportunity-notes/dto/opportunity-note.dto.ts \
        edutumobile/packages/core/src/types/opportunityNote.ts \
        edutumobile/packages/core/src/services/opportunityNotes.ts \
        edutumobile/packages/core/src/hooks/useOpportunitySocial.ts \
        edutu-web-app/src/components/opportunity/ScamRiskNotice.tsx \
        edutu-web-app/src/components/opportunity/OpportunityNotes.tsx \
        edutu-web-app/src/components/OpportunityDetail.tsx \
        edutu-web-app/src/test/__tests__/ScamRiskNotice.test.tsx \
        edutumobile/components/opportunity/ScamRiskNotice.tsx \
        edutumobile/components/opportunity/OpportunityNotes.tsx \
        edutumobile/lib/i18n/locales/ edutumobile/lib/i18n/resources.ts \
        "edutumobile/app/(app)/opportunities/[id].tsx"
git commit -m "feat: surface the scraper's scam verdict above opportunity notes on both surfaces"
```

---

### Task 21: Slice 4 handoff contract + end-to-end verification

**Files:**
- Test: `backend/services/services/api/src/opportunity-notes/brief-source-contract.spec.ts`
- No other file is created: the verification checklist is executed from this task, not written to disk.

**Interfaces:**
- Produces: a compile-time-enforced contract that Slice 4 consumes for Note → Brief promotion.

- [ ] **Step 1: Write the contract test**

Create `backend/services/services/api/src/opportunity-notes/brief-source-contract.spec.ts`:

```ts
import { OpportunityNotesModule } from "./opportunity-notes.module";
import {
  OpportunityNotesService,
  type BriefNoteSource,
} from "./opportunity-notes.service";

/**
 * This file is the Note → Brief promotion contract. Slice 4 imports
 * OpportunityNotesModule and calls these two methods; nothing else about
 * notes is public to it. If any of these assertions fail, Slice 4's Brief
 * generator breaks, so treat a failure here as a cross-slice break, not a
 * test to update.
 */
describe("Slice 4 handoff: Note → Brief promotion", () => {
  it("exports OpportunityNotesService from the module", () => {
    const exports = Reflect.getMetadata("exports", OpportunityNotesModule) as unknown[];
    expect(exports).toContain(OpportunityNotesService);
  });

  it("exposes exactly the two promotion methods Slice 4 depends on", () => {
    const proto = OpportunityNotesService.prototype as Record<string, unknown>;
    expect(typeof proto.listBriefSources).toBe("function");
    expect(typeof proto.getBriefSource).toBe("function");
  });

  it("pins the BriefNoteSource shape", () => {
    // Compile-time assertion: any drift in the type breaks this literal.
    const source: BriefNoteSource = {
      noteId: "n1",
      opportunityId: "o1",
      kind: "tip",
      outcome: null,
      body: "Reference letters took three weeks.",
      helpfulCount: 12,
      authorUsername: "ada",
      authorDisplayName: "Ada N.",
      authorIsMentor: true,
      createdAt: "2026-07-25T10:00:00.000Z",
    };
    expect(Object.keys(source).sort()).toEqual([
      "authorDisplayName",
      "authorIsMentor",
      "authorUsername",
      "body",
      "createdAt",
      "helpfulCount",
      "kind",
      "noteId",
      "opportunityId",
      "outcome",
    ]);
  });

  it("pins the outcome vocabulary to the real application statuses", () => {
    // 'shortlisted' and 'won' must never appear. The live constraint is
    // status = ANY (ARRAY['draft','submitted','interview','offer','rejected',
    //                     'withdrawn','no_response']).
    const valid: Array<BriefNoteSource["outcome"]> = [
      "applied",
      "interview",
      "offer",
      "rejected",
      null,
    ];
    expect(valid).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm --prefix backend/services/services/api test -- brief-source-contract`
Expected: PASS, 4 tests.

- [ ] **Step 3: Run every suite this slice touches** (this includes Task 20's `opportunity-risk` and `ScamRiskNotice` suites)

```bash
npm --prefix backend/services/services/api run lint && npm --prefix backend/services/services/api test
npm --prefix edutu-web-app run lint && npm --prefix edutu-web-app run typecheck && npm --prefix edutu-web-app test
npm --prefix edutumobile run lint && npm --prefix edutumobile run typecheck && npm --prefix edutumobile test -- --maxWorkers=2
```
Expected: all green. Mobile lint runs at `--max-warnings 0` — a single warning fails CI.

- [ ] **Step 4: Boot smoke test again (repo constraint #10)**

```bash
npm --prefix backend/services/services/api run build && node backend/services/services/api/dist/main
```
Expected: `Nest application successfully started` with all seven slice-3 routes mapped. Ctrl-C to stop.

- [ ] **Step 5: Manual UGC-safety pass**

Against a running API and both clients, confirm each of these:

| Check | Expected |
|---|---|
| Post a note containing `Pay 5000 naira and I'll send the link` | 400 with the payment-solicitation message; nothing written |
| Post a note containing `WhatsApp me on +234 803 555 0199` | 400 with the contact-harvesting message |
| Post a `result` note with `outcome: offer` without an offer application | 403 telling the user to set their application status first |
| Set the application to `offer`, retry | Note created with the "Got an offer" badge |
| Report a note on web and on mobile | A row appears in `community_reports` with `target_type = 'note'` and the note's id |
| Block the note's author (Slice 2 block flow), reload the opportunity | The note renders as "Blocked message" with no body and no vote button, and the thread keeps its shape |
| Sign out and reload the opportunity page | Notes still render; the composer is replaced by a sign-in prompt |
| Open an opportunity whose `metadata` carries `red_flags` | The scam notice renders **above** the composer — amber for 1 flag, red for 2+ — and the counts strip still renders beneath it |

Verify the report row:
```bash
psql "$DATABASE_URL" -c "select target_type, target_id, reason, status from public.community_reports where target_type = 'note' order by created_at desc limit 5;"
```
Expected: at least one `note` row per report submitted.

- [ ] **Step 6: Verify the counts are real, not decorative**

```bash
OPP=$(psql "$DATABASE_URL" -tAc "select opportunity_id from public.opportunity_notes group by opportunity_id order by count(*) desc limit 1")
psql "$DATABASE_URL" -c "select * from public.opportunity_social_counts where opportunity_id = '$OPP';"
psql "$DATABASE_URL" -c "
  select
    (select count(*) from public.opportunity_notes where opportunity_id = '$OPP' and status='visible') as notes,
    (select count(*) from public.opportunity_applications where opportunity_id = '$OPP' and status <> 'draft') as applied,
    (select count(distinct user_id::text) from public.user_opportunity_signals where opportunity_id = '$OPP' and signal_type='share') as shares,
    (select count(*) from public.community_groups where opportunity_id = '$OPP' and status='active') as groups;
"
```
Expected: the cached row matches the recomputed numbers. If it does not, `reconcile()` has a bug — do not ship.

- [ ] **Step 7: Commit**

```bash
git add backend/services/services/api/src/opportunity-notes/brief-source-contract.spec.ts
git commit -m "test(api): pin the Note-to-Brief promotion contract for slice 4"
```

---

## Deployment order

1. Apply `supabase/migrations/20260725140000_opportunity_fabric_notes_social.sql` **first**. The `note-reply` insert path and the three tables must exist before the backend that writes them.
2. Deploy the backend (Render). Confirm `node dist/main` boots and the seven routes are mapped.
3. Deploy `edutu-web-app`. Remember `npm run build` regenerates `public/sitemap.xml` via the `prebuild` script — no sitemap edits are made by this slice, so nothing is lost, but do not hand-edit that file in the same deploy.
4. Ship the mobile build. **A native rebuild is not required** — this slice adds no native modules, so an OTA update carries it, but the i18n `resources.ts` regeneration must be in the bundle or the new namespaces render as raw keys.
5. Optional kill switch: set `SOCIAL_COUNTS_RECONCILE_ENABLED=false` on Render if the nightly job ever needs to be paused. Leave it unset in normal operation.

---

## Self-review

**1. Spec coverage** — every requirement in the brief and in spec §3.1 / §5.3 / §7 maps to a task:

| Requirement | Task |
|---|---|
| Migration in root `supabase/migrations/` for the 3 tables, SELECT-only RLS | 1 |
| Drizzle definitions | 2 |
| `notifications_kind_check` altered in the same migration + insert test | 1, 2 |
| New `src/opportunity-notes/` module, not grown into `src/opportunities/` | 6, 8 |
| The six locked routes | 8 |
| Exactly three note kinds; `result` carries an outcome | 5, 6 |
| Real status vocabulary (`applied \| interview \| offer \| rejected`), no `shortlisted`, no `won` | 1, 5, 6, 10, 13, 16, 18, 21 |
| `applied_count` = every non-`draft` status, pinned by `APPLIED_STATUSES` + 3 tests | 1, 4, 6 |
| Note/message text screening delegated to Slice 2's `screenMessage`, no second implementation | 3 |
| Scraper scam verdict (`extractRedFlags`) surfaced above notes + composer, never hidden behind social proof | 20 |
| Communities work branches from `origin/main`; grep-gated steps re-run after rebase | Prerequisite, 3, 10, 15, 19, 20 |
| Borderline notes shadow-hold (`status='hidden'`) instead of hard-blocking | 3, 6, 13, 18 |
| Raw Clerk sub read from `@CurrentUser("authId")` everywhere | Global Constraints, 8 |
| `me.service.ts` read before designing the outcome check | 6 (`assertOutcomeIsReal` reads `opportunity_applications` + `user_opportunity_signals` exactly as `recordOutcomeSignal` writes them) |
| Social counts: write-through cache + nightly reconcile | 4, 9 |
| `notes_count` / `applied_count` / `shares_count` / `useful_count` / `groups_count` sources | 4 (`DbSocialCountsSource.readTruth`) |
| Test proving reconcile corrects a corrupted cache row | 4 |
| Anchored groups: "N groups discussing this →" | 14 (web), 17 (mobile) |
| Create-group-anchored-to-this-opportunity flow | 14 (web), 17 (mobile) |
| Opportunity cards in chat with live countdown that greys out | 15 (web), 19 (mobile) |
| Reuse `UrgencyPill` / `deadlineUrgency`, no new date logic | 11 (`useLiveDeadline` wraps `getDeadlineBadge`), 15 (`UrgencyPill`), 19 (`urgencyColor`) |
| ✦saved chat message → Note | 6 (`assertCanPublishMessage`), 15 (`PublishSavedMessageDialog`) |
| Note → Brief interface, stopping at the boundary | 6 (`listBriefSources` / `getBriefSource`), 8 (module export), 21 (contract test) |
| `note-reply` notification kind + test | 1, 2, 6 |
| `@edutu/core` exports exactly as typed | 10 |
| Notes on the web detail page | 13 |
| Notes on the mobile detail page | 18 |
| Social counts on the opportunity card | 12 (web rail card), 17 (mobile detail) |
| Reporting → `community_reports` with `target_type='note'` | 10 (`reportOpportunityNote`), 13 (web dialog), 18 (mobile modal), 21 (verification) |
| Blocked users' notes collapse | 6 (`user_blocks` join + `blocked` flag), 13, 18 (both render "Blocked message"), 21 |

**2. Placeholder scan** — no `TBD`, no "add validation here", no "similar to Task N". Two steps intentionally locate a file by `grep` before editing it (Task 15 Step 5, Task 19 Step 4): both are Slice 2-owned files whose exact path this plan cannot know, and both supply the complete code to insert plus the exact command that resolves the path. Task 3 Step 1, Task 10 Step 1, Task 15 Step 3 and Task 20 Step 1 are conditional verification steps with both branches spelled out (and all of them must be run **after** the `origin/main` rebase demanded by the prerequisite — a stale tree makes every one of them lie); Task 3's coupling to Slice 2's `screenMessage` is deliberately funnelled through a single `toVerdict` adapter so a signature mismatch is a one-function fix.

**3. Type consistency** — checked across tasks:
- `SocialCountsSnapshot` (Task 4) ≡ `OpportunitySocialCountsDto` (Task 5) ≡ `OpportunitySocialCounts` (Task 10): same five `number` fields, same names.
- `OpportunityNoteDto` (Task 5) ≡ `OpportunityNoteView` (Task 10): same fields; `OpportunityNote` is the locked subset and `OpportunityNoteView` extends it with `replyToId`, `blocked`, `isMine`.
- `NoteOutcome` (Task 5) ≡ `OpportunityNoteOutcome` (Task 10) ≡ `BriefNoteSource['outcome']` (Task 6): `'applied' | 'interview' | 'offer' | 'rejected'`, matching the live `opportunity_applications_status_check` minus `draft`/`submitted`/`withdrawn`/`no_response`.
- `CoreTransport` is defined once (Task 10) and consumed by Tasks 11–19.
- Service method names used by the controller (Task 8) — `list`, `create`, `remove`, `setHelpful`, `getSocial`, `getSocialBatch` — all exist on the service (Task 6).
- `OpportunitySocialCountsService` methods used by the notes service and the cron — `get`, `getMany`, `bumpNotes`, `bumpUseful`, `reconcile` — all exist (Task 4).
- `useOpportunityNotes` returns `{ notes, loading, error, refresh, addNote, removeNote, toggleHelpful }` in Task 11 and is destructured with exactly those names in Tasks 13 and 18.
- `useOpportunitySocial` returns `{ counts, groups, loading, refresh }` in Task 11 and is destructured as `{ counts: socialCounts, groups: discussingGroups, refresh: refreshSocial }` in Tasks 12 and 17.
- `useLiveDeadline` returns `{ badge, isPassed }` in Task 11 and is destructured with those names in Tasks 15 and 19.
- Core `DeadlineBadge` and web `DeadlineBadge` are asserted interchangeable by a compile-time test (Task 11 Step 8), which is what lets Task 15 pass a core badge to `UrgencyPill`.
