# Edutu Communities — Design Spec

**Date:** 2026-07-25
**Status:** Approved design, pending implementation plans (one per slice)
**Surfaces:** `edutumobile` + `edutu-web-app` (full parity), `backend/services/services/api`, `admin`

---

## 1. Why this exists

Ambitious African students already organise around scholarships — in WhatsApp and Telegram groups. Those groups fail in four specific, structural ways. Edutu is the only product positioned to fix all four, because it already owns the opportunity graph, deadlines, the scam gate, and the applications pipeline.

| How today's groups fail | Edutu's structural fix |
|---|---|
| Good advice scrolls away; a week-3 joiner gets nothing | **The Brief** — an AI-maintained, cited, durable digest per group |
| You cannot tell a winner from a guesser | **Verified outcomes** on profiles, sourced from the real applications pipeline — never self-reported |
| Scams ("pay ₦5,000 for the application link") | The existing scam gate, applied to links posted *in chat* |
| Groups outlive their deadline and rot into graveyards | Groups are **time-boxed to the deadline they serve**, then auto-archive read-only — and carry forward to next season |

Fixes 2 and 4 are not replicable by a generic chat app at any price. They are the moat.

## 2. Product decisions (settled)

| Decision | Choice | Rationale |
|---|---|---|
| Content model | **Chat stream + pinned AI Brief** | Chat speed users already know, plus knowledge that survives. Pure chat loses knowledge daily; pure forum feels dead before critical mass. |
| Surfaces | **Mobile + web, full parity** | No user locked out; desktop typing matters for long positioning advice. Cost is mitigated by a shared logic package (§8). |
| Transport | **Write via backend, read via Supabase Realtime** | NestJS owns validation, rate limits, moderation, AI triggering, metering, push fan-out. RLS becomes SELECT-only — no client writes at all — which collapses this repo's largest historical bug surface. No WebSocket infra to operate on Render. |
| Gating | **Free to join and post. AI metered. Creation rate-limited.** | The network effect *is* the product; a paywalled empty group is worthless. AI-in-group rides the **existing** `@AiMetered` quota — it consumes the same daily allowance as coach chat rather than introducing a second meter. |

**Concrete limits (defaults, admin-tunable via `admin_settings`):**

| Limit | Value |
|---|---|
| Active groups owned per user | 2 (mentors/approved creators: 10) |
| Group creation cooldown | 24 h |
| New group listed in Spaces | after 5 members (unlisted + link-reachable before that) |
| Messages per user per group | 20 / min, 300 / hour |
| `@edutu` invocations | 5 / user / group / day, and always subject to the app-wide `@AiMetered` quota |
| `@everyone` announcements | 1 / group / day |

> `admin_settings` writes must satisfy its Zod schema exactly — a malformed write makes **all** settings silently fall back to defaults. Extend the schema in the same change that adds these keys.

## 3. Information architecture

```
COMMUNITIES  (new tab — mobile + web)
├── For you        joined groups · unread · ⏳ closing soon
├── Spaces         Scholarships · Fellowships · Internships · Grants
│                  Programs · Exchange · Contests · Jobs
│                  └─ per space: Trending · New · Closing soon · Mentor rooms
├── Discover       search · "groups for the 6 opportunities you saved"
└── People         mentors · verified winners · who you follow
```

**Space → Group → messages.** A user-created "topic" *is* a group. A group optionally **anchors** to one opportunity (`opportunity_id`), or stands alone as a season/track crew ("Chevening 2027", "IELTS prep — Sept sitting").

**Group anatomy:** icon + name + member count + ⏳ expiry chip · pinned **Brief** · anchored opportunity card · tabs `Chat / Brief / Files / Members` · composer sends text, images, **opportunity cards**, and invite links.

### 3.1 Two surfaces, deliberately not merged

Live chat and per-opportunity reviews are different shapes. Merging them ruins both.

- **Opportunity Notes** — on the opportunity detail page. Structured, persistent, ranked by usefulness. Exactly three kinds: **Tip**, **Question**, **Result** (`I applied` / `I got in`). Low-noise, high-signal, SEO-indexable on web. This is where the social counts live.
- **Groups** — the Communities tab. Live, fast, social.
- **The bridge:** opportunity detail shows `12 notes · 3 groups discussing this →`. A Note can be promoted into a group's Brief; a ✦saved chat message can be published as a Note.

Social proof on an opportunity card reads: `4 notes · 10 applied · 20 found useful · 100 shared`.

## 4. Identity

Public profile at `@username`. **No friend requests** — view, follow, or contact.

- Handle (unique, immutable-ish with a 30-day change cooldown), display name, avatar, country, one-line *what I'm chasing*
- **Track record, verified from our own data:** `Applied 12 · Won 1`. Opt-in per tier. Derived from the live `opportunity_applications` table (`status = 'submitted'` and beyond) and the `outcome_offer` rows already written into `user_opportunity_signals` by `me.service.ts`. A `✓ Won Chevening 2024` badge cannot be faked and is the single strongest identity primitive in this market.
  - The real status vocabulary is `draft | submitted | offer | rejected | withdrawn | no_response`. There is **no** `shortlisted` status today. Displaying an intermediate "Shortlisted" tier requires adding it to the `opportunity_applications` status CHECK constraint first — treat as an optional Slice 3 extension, not an assumption.
- **Follow** (asymmetric) → their group activity and wins appear in notifications
- **Contact** → backend-relayed email through the existing Brevo `/support` path. The sender never sees the recipient's address. Satisfies "send emails" without handing PII to scammers.
- **Mentor badge** for approved mentors — rides existing `creator_applications` (`application_kind = 'mentor'`, `profiles.mentor_status`)

Privacy defaults: profile public, outcomes hidden, contact off. All three user-togglable.

## 5. Data model

All new tables prefixed `community_` — the names `community`/`CommunityStory` are already taken by the success-stories/marketplace code in `edutumobile/packages/core/src/services/community.ts` and `edutu-web-app/src/services/communityMarketplaceSupabase.ts`. Do not overload them.

### 5.1 Identity

Extend `profiles` (one identity, not a second one):

| Column | Type | Notes |
|---|---|---|
| `username` | `citext unique` | 3–24 chars, `[a-z0-9_]`, reserved-word blocklist |
| `headline` | `text` | "Chasing a fully-funded MSc in Public Health" |
| `bio` | `text` | 280 chars |
| `privacy` | `jsonb` | `{publicProfile, allowContact, showOutcomes}` |

New table `user_follows` — mirrors the existing `user_blocks` shape: `(id, follower_user_id, followee_user_id, created_at)`, unique on the pair, index on follower.

### 5.2 Community core

| Table | Key columns |
|---|---|
| `community_spaces` | `id, slug, name, icon, sort_order, is_active` — seeded from the canonical opportunity categories so Spaces ≡ categories |
| `community_groups` | `id, space_id, slug, name, description, icon_url, cover_url, visibility ('public'\|'unlisted'\|'private'), join_policy ('open'\|'request'\|'invite'), opportunity_id (nullable FK), rules, created_by, member_count, message_count, last_message_at, expires_at, archived_at, status ('active'\|'archived'\|'suspended'), created_at` |
| `community_group_members` | `group_id, user_id, role ('owner'\|'admin'\|'mod'\|'member'), joined_at, last_read_at, muted_until, banned_at, banned_reason, notify ('all'\|'mentions'\|'none')` — unique `(group_id, user_id)` |
| `community_messages` | `id, group_id, user_id, kind ('text'\|'image'\|'opportunity'\|'system'\|'announcement'\|'ai'), body, attachments jsonb, opportunity_id, reply_to_id, saved_to_brief bool, is_deleted, deleted_by, deleted_reason, created_at, edited_at` — index `(group_id, created_at DESC)` |
| `community_message_reactions` | `message_id, user_id, emoji` — unique triple |
| `community_invites` | `id, group_id, token_hash, token_prefix, created_by, role_on_join, max_uses, uses, expires_at, revoked_at` |
| `community_join_requests` | `id, group_id, user_id, message, status, decided_by, decided_at` |
| `community_briefs` | `group_id (unique), content jsonb, citations jsonb, version, generated_at, generated_from_count, model, is_stale` |
| `community_reports` | `id, target_type ('message'\|'group'\|'profile'\|'note'), target_id, reporter_user_id, reason, detail, status, resolved_by, resolved_at, action_taken` — generalises the roadmap-only reports pattern |

### 5.3 Opportunity fabric

| Table | Key columns |
|---|---|
| `opportunity_notes` | `id, opportunity_id, user_id, kind ('tip'\|'question'\|'result'), body, outcome ('applied'\|'shortlisted'\|'won'\|'rejected'\|null), reply_to_id, helpful_count, status, created_at` |
| `opportunity_note_votes` | `note_id, user_id` — unique pair (a "found useful" vote) |
| `opportunity_social_counts` | `opportunity_id (PK), notes_count, applied_count, useful_count, shares_count, groups_count, updated_at` |

No new tracking is introduced — both counts derive from tables that already exist: `applied_count` from `opportunity_applications` (`status = 'submitted'` and beyond), `shares_count` from the share signals in `user_opportunity_signals`. `opportunity_social_counts` is a denormalised cache the backend maintains on write, plus a nightly reconcile job that recomputes from source, so a card renders in one join and drift self-heals.

### 5.4 The user-id rule (this repo's #1 landmine)

Three id namespaces exist today (raw Clerk sub / `clerk_id_to_uuid` safe-uuid / profile row), and four separate production incidents have come from mixing them.

**Rule for this domain, no exceptions:** every `community_*`, `user_follows`, and `opportunity_notes` table declares `user_id text` holding the **raw Clerk sub**, matching the canonicalisation already applied to `profiles` (`matchProfileUserId`). No dual-matching helpers inside the domain. Conversion happens at exactly one boundary — the join to legacy uuid-keyed tables (`user_blocks`, `notifications`) — via a single documented helper.

Note the known divergence: `profiles.userId` is typed `uuid` in `db/schema.ts` but the live DB holds raw Clerk subs. The migration must not assume the Drizzle type is accurate; verify column types against the live DB before writing FKs.

## 6. Access control, invites, expiry

### 6.1 Roles

| Role | Can |
|---|---|
| `owner` | Everything below, plus delete group, transfer ownership, set expiry |
| `admin` | Edit details/icon/rules, create + revoke invites, promote mods, post announcements, ban/remove members |
| `mod` | Delete messages, mute members, pin, resolve reports |
| `member` | Post, react, share opportunities, ✦save-to-brief |

Enforced server-side in a single `assertGroupPermission(userId, groupId, action)` guard. Never in the client, never in RLS.

### 6.2 Invite links

`https://edutu.org/g/<token>` → web landing page showing icon, name, member count, Brief teaser, and rules → opens `edutu://group/<token>` when the app is installed, otherwise the install path. Mentor closed rooms are `visibility: 'private'` + `join_policy: 'invite'`.

Tokens are random 22-char, stored **hashed** with the existing `API_KEY_PEPPER` pattern (a `token_prefix` column supports admin lookup without storing the secret). Every invite is revocable and supports `max_uses` + `expires_at` + `role_on_join`.

Deep-link gotcha: this repo's widget/share links are singular (`edutu://opportunity/<id>`) and required redirect routes. Register `/g/[token]` on both singular and plural forms from day one.

### 6.3 Expiry — the anti-graveyard mechanic

`community_groups.expires_at` defaults to the anchored opportunity's deadline + 30 days grace (owner-editable; standalone groups may set any date or none).

At expiry, a cron (same pattern as `opportunity-deadline-reminders.service.ts`) posts a system message and flips the group **read-only, not deleted** — `status = 'archived'`. The Brief stays permanently readable and searchable.

The owner may then **carry forward**: a new group for the next cycle is created pre-loaded with the previous Brief. "Chevening 2027" is born knowing everything the 2026 cohort learned. This converts dead groups from a liability into the product's most valuable asset.

## 7. AI in group

**`@edutu` mention** → an agent turn on the existing `chat.service.ts` loop with a *restricted* tool set: `searchOpportunities`, `getOpportunity`, `explainFit`, `deadlineCheck`, `draftAnswer`. Context = group name + anchored opportunity + current Brief + last N messages. Rate-limited per user per group; metered through `@AiMetered`.

> **Security constraint — group chat is untrusted input.** Any member can craft text to hijack the agent. Group-mode tools may read only public opportunity data and the *asking* user's own profile — never another member's account, documents, credits, or applications. Extend the existing `coach-tools.untrusted.spec.ts` with group-mode injection cases.

**The Brief** regenerates on debounce, with concrete triggers: **≥3 new ✦saved messages** *or* **≥40 new messages** since the last generation, **at most once per hour per group**, and only once a group passes an activity floor of **≥10 members and ≥25 messages** (below that there is nothing worth summarising and the tokens are wasted). A mod can force a regeneration manually, subject to the same hourly cap. Uses the cheap default model from the `ai_routes` table (DeepSeek). Sections: *What this is · Key dates · What wins · Common mistakes · Open questions · Who's applying*.

**Every line cites the message it came from** — tap the citation, jump to the message. Citation is the entire reason members will trust a machine-written summary of human advice. A Brief without citations is worse than no Brief.

**Opportunity in, opportunity out:** share any opportunity as a live card whose deadline counts down inside the chat and visibly greys out when it passes. `/recommend` returns 3 matches based on the group's anchor plus *aggregate* member signals — never an individual member's private profile. Mods may enable a weekly "3 new matching opportunities" bot post, riding the existing saved-search alert engine.

## 8. Sharing logic across web and mobile

`@edutu/core` exists today but is mobile-local (`"@edutu/core": "file:./packages/core"`); the web app cannot consume it.

Slice 1 promotes it to a root npm workspace package that both apps depend on, kept framework-agnostic (`react` + `@supabase/supabase-js` only, no `react-native` imports). Communities transport, optimistic send, permission predicates, unread accounting, and Brief rendering live there. Only the UI is written twice.

**Fallback** if the Metro/Vite build reconciliation proves costly: share types and the API client only, duplicate hooks. Decide this in Slice 1 with a timebox — do not let it block Slice 2.

### 8.1 Realtime discipline

**Do not hold a realtime channel open per joined group.** One channel for the group currently on screen; every other group's unreads arrive by push notification plus a foreground refresh. Twenty joined groups per user × the user base would exceed Supabase realtime connection limits and drain battery on the mid-range Android devices this product targets.

Channel lifecycle must follow the documented fix from `useCredits`/`useProStatus`: keep callbacks in refs so subscribe effects depend only on `[supabase, groupId]`; remove any pre-existing channel with the same topic via `getChannels()` before subscribing; wrap `subscribe()` in try/catch so a binding error can never reach the ErrorBoundary.

## 9. Safety and moderation

Non-negotiable and shipped in Slice 2, not later — this is what gets an app rejected under Apple Guideline 1.2.

1. **Report** any target (message, group, profile, note) → `community_reports` → queue in the existing admin panel under the App section
2. **Block** a user — extend `user_blocks`; blocked users' content collapses to "Blocked message" everywhere it appears
3. **Mod actions** — mute, kick, ban per group; platform-wide ban by staff
4. **Send-time filters** — the existing scam gate applied to URLs posted in chat; abuse classifier; phone/WhatsApp-number harvesting detection; per-user and per-group rate limits. Borderline content **shadow-holds for review** rather than hard-blocking a real user mid-conversation
5. **Published 24-hour action SLA** on reports, with an in-app statement of it

Images ride the existing `uploads` service. v1 image safety = report + admin queue + block + rate limit. A vision moderation pass is deferred (cost) and tracked as a follow-up; revisit if image abuse appears.

`@everyone` announcements: admin/mod only, max 1 per day per group, pushed to members subject to their notification preferences and quiet hours.

## 10. Notifications

New kinds: `community-message`, `community-mention`, `community-announcement`, `community-invite`, `community-join-request`, `follow`, `note-reply`, `group-expiring`.

> **Blocking gotcha:** the live DB has a `notifications_kind_check` CHECK constraint that **silently rejects unknown kinds** — this exact bug already swallowed `deadline-reminder` inserts in production. Every new kind must be added to that constraint in the same migration that introduces it, and a test must assert an insert of each kind succeeds.

Defaults: push for mentions and announcements only; all-messages is opt-in per group. Batch per group ("12 new messages in Chevening 2027"), never per message. Honour the existing quiet-hours engine and `notification_preferences`.

## 11. Rollout — five independently shippable slices

| # | Slice | Contents | Why here |
|---|---|---|---|
| 1 | **Identity** | usernames, public profiles, follow, verified outcomes, contact relay, `@edutu/core` workspace promotion | Everything depends on it and it ships user value standalone |
| 2 | **Groups core** | spaces, create/join, chat + images, roles, invites + private mentor rooms, announcements, expiry + archive, realtime, notifications, **full moderation** | The big one; store-shippable on its own |
| 3 | **Opportunity fabric** | opportunity cards in chat, anchored groups, Notes, social counts, "3 groups discussing this" | Turns generic chat into Edutu-specific chat |
| 4 | **AI** | The Brief, `@edutu`, `/recommend`, group digest | The moat — but worthless until slices 2 and 3 have produced data |
| 5 | **Scale & lifecycle** | season carry-forward, group search, web SEO group pages, presence/typing | Compounding growth |

Each slice gets its own implementation plan. Slice 1 is the scope of the first plan.

## 12. Testing strategy

- **Permission matrix** — table-driven tests over (role × action × group state) including archived and suspended groups
- **Id-namespace** — assert every community table write/read round-trips a raw Clerk sub, and that the one legacy-join helper is the only conversion site
- **RLS** — prove SELECT-only: assert an anon/authenticated client cannot INSERT, UPDATE, or DELETE any `community_*` row, and cannot SELECT a private group it is not a member of
- **Moderation filters** — scam-link, contact-harvesting, and abuse cases with known-good and known-bad fixtures
- **Notification kinds** — assert each new kind inserts successfully against the CHECK constraint
- **Realtime lifecycle** — assert remount does not throw the documented `postgres_changes after subscribe` error
- **Brief generation** — deterministic with a mocked model; assert every rendered line carries a resolvable citation
- **Prompt injection** — group-mode agent cases attempting to read another member's data

## 13. Open risks

| Risk | Mitigation |
|---|---|
| Supabase realtime connection limits at scale | One-channel-on-screen discipline (§8.1); monitor concurrent connections; the write path is already backend-owned, so swapping fan-out later is contained |
| Moderation load exceeds available staff | Rate limits + unlisted-until-5-members + shadow-hold reduce inflow; admin queue is prioritised by report count |
| Empty-room problem at launch | Seed anchored groups for the 20 live opportunities with the highest `opportunity_applications` volume, each pre-loaded with a Brief generated from that opportunity's existing Notes and description |
| Brief hallucination damaging trust | Mandatory citations; mods can unsave any source message and force regeneration; Brief is visibly labelled AI-generated with a timestamp |
| `@edutu/core` workspace promotion fights Metro/Vite | Timeboxed in Slice 1 with a documented shared-types-only fallback |
