# Group Discussions — Design

**Date:** 2026-08-03
**Status:** Approved (design), pending implementation plan
**Supersedes for this scope:** the group-chat portion of
`2026-07-25-communities-groups-design.md` (Slice 2). That spec remains the
long-range target; this one is the shippable subset agreed on 2026-08-03.

---

## 1. Why

Today "Group Discussion" is a single line of configuration. In
`edutumobile/app/(app)/opportunities/index.tsx` the `discussion` tile carries
`route: 'https://whatsapp.com/channel/0029VbCHBEVJJhzPcbBboP3y'` with
`external: true`. Tapping it leaves the app. There is no discussions code, no
table, and no way for a user to talk to anyone about an opportunity inside
Edutu.

That costs three things: every conversation about an Edutu opportunity happens
somewhere Edutu cannot see, cannot search and cannot learn from; a user who
does not use WhatsApp has no community at all; and the most valuable artifact
of a cohort — what people actually asked and answered about a specific
scholarship — is lost the moment the deadline passes.

## 2. Scope

Chosen deliberately over the full five-slice Communities line.

**In:** an in-app Discussions browse page; group chat; groups optionally
anchored to an opportunity; a create-group form; a join-request form; a
per-group custom question set; a WhatsApp-channel banner; and the moderation
kit an App Store review requires for user-generated content.

**Out (deferred to the Communities slices):** `@username` identity and public
profiles, the follow graph, the contact relay, the AI-maintained Brief,
`@edutu` in-group agent turns, Opportunity Notes, denormalised social counts,
web parity, and the admin console surface. None are prerequisites for the
above; each is a separate slice with its own written plan.

**Deferred deliberately, not forgotten:** group image/file upload. It needs a
storage bucket, a moderation path for images, and a size/abuse policy. Text
first.

## 3. Constraints inherited from this repo

These are not preferences. Each traces to a specific past incident recorded in
project memory, and violating any of them reintroduces a known bug class.

1. **Write through NestJS, read through Supabase Realtime. RLS is `SELECT`-only
   and the client never writes.** Chosen because this repo's RLS and
   id-namespace history makes client-write RLS its single largest bug surface.
2. **Every new table keys `user_id text` = the raw Clerk sub**, never a
   generated UUID. One conversion boundary, `src/common/community-user-id.ts`.
   `profiles.userId` is typed `uuid` in Drizzle while the live DB stores raw
   Clerk subs — the Drizzle type must not be trusted when writing FKs.
3. **All new tables are prefixed `community_group*`.** `community_posts`,
   `community_comments`, `community_post_reactions` and `community_stories`
   already exist and mean *success stories / marketplace*. A bare
   `community_messages` would read as belonging to that feature.
4. **One realtime channel, for the on-screen group only.** Never one channel
   per joined group: the Communities analysis puts that ceiling at roughly 25
   concurrent users, against ~12k–25k DAU for the on-screen-only pattern.
   Subscription lifecycle follows the pattern in the deep-link/realtime crash
   fixes — subscribe on focus, unsubscribe on blur, never on unmount alone.
5. **Branch from `origin/main`, in a fresh worktree.** The current working
   branch is 41 commits behind `origin/main`, and this tree is shared by
   concurrent sessions. Never `git stash` or `git checkout .` here.
6. **Nine locales.** No user-visible string is hardcoded. New keys go in a new
   `community` namespace in `lib/i18n/locales/en/`, mirrored to the other
   eight; the locale JSONs mix 2- and 4-space indentation, so insert textually
   at an anchor rather than reformatting. Run
   `node scripts/gen-i18n-resources.js` after.

## 4. Data model

Six tables. All `user_id` columns are `text`.

### `community_groups`
`id uuid pk` · `slug text unique` · `name text` · `description text` ·
`opportunity_id uuid null → opportunities(id)` · `owner_id text` ·
`visibility text ('public'|'private')` · `join_policy text ('open'|'request')` ·
`cover_emoji text` · `accent text` · `expires_at timestamptz null` ·
`archived_at timestamptz null` · `member_count int` · `message_count int` ·
`last_message_at timestamptz null` · `created_at`.

`opportunity_id` is nullable: one table serves both an anchored group ("Chevening
2027 applicants") and a standing one ("CS scholarships, West Africa"). An
anchored group inherits that opportunity's deadline as `expires_at`.

### `community_group_members`
`group_id` · `user_id text` · `role ('owner'|'mod'|'member')` ·
`status ('active'|'pending'|'removed'|'banned')` · `joined_at` ·
unique `(group_id, user_id)`.

Role and status are separate columns on purpose. A removed owner and an active
member are different facts, and collapsing them into one enum has to be undone
the first time a mod is banned.

### `community_group_messages`
`id uuid pk` · `group_id` · `user_id text` · `body text` ·
`kind ('text'|'system'|'opportunity')` · `opportunity_id uuid null` ·
`created_at` · `deleted_at timestamptz null` · `deleted_by text null`.

Soft delete only. A hard delete destroys the moderation record that App Store
review asks about, and breaks the reply context of surrounding messages.
`kind='system'` carries joins, departures and archival so the transcript
explains itself. `kind='opportunity'` is a shared opportunity card.

### `community_join_requests`
`id` · `group_id` · `user_id text` · `answers jsonb` · `status` ·
`decided_by text null` · `decided_at null` · `created_at`.

`answers` holds the responses to the group's custom questions.

### `community_group_forms`
`group_id pk` · `questions jsonb` · `updated_at`.

`questions` is a constrained array, validated by Zod on write: at most 5
entries, each `{ id, type: 'short_text'|'long_text'|'single_select', label
(≤60 chars), required bool, options?: string[] (≤6, single_select only) }`.
A fixed schema, not a form engine — the builder, the renderer and the response
viewer each stay small enough to test exhaustively.

### `community_reports`
`id` · `target_type ('message'|'group')` · `target_id` · `reporter_id text` ·
`reason text` · `status ('open'|'actioned'|'dismissed')` · `created_at`.

RLS: `community_groups`, `community_group_members` and
`community_group_messages` are `SELECT`-able by members of the group, with
public groups readable by any signed-in user — these three are what Realtime
reads. `community_join_requests` is `SELECT`-able by the requesting user and
the group's owner/mods only.

`community_group_forms` follows the group's own visibility — public group, or
active member. An earlier draft restricted it to owner/mods, which would have
made request-to-join groups unjoinable: a prospective joiner has to read the
screening questions in order to answer them. Visibility controls
discoverability and `join_policy` controls entry, so a request-to-join group
is necessarily a public one, and its questions are necessarily readable by the
people being asked to answer them.

**`community_reports` gets no `SELECT` policy at all** — a reporter must never be able to enumerate
reports, and members must never see who reported them. It is read exclusively
by the service role. No table gets an `INSERT`/`UPDATE`/`DELETE` policy,
because every write goes through the backend.

## 5. Backend

New Nest module at `backend/services/services/api/src/communities/`, following
the existing controller + service + Zod-DTO shape.

| Method | Route | Notes |
|---|---|---|
| GET | `/communities/groups` | browse; filters: mine, opportunity, query |
| GET | `/communities/groups/:id` | includes viewer's membership state |
| POST | `/communities/groups` | rate-limited, see below |
| PATCH | `/communities/groups/:id` | owner/mod |
| POST | `/communities/groups/:id/join` | open policy → active; request policy → pending |
| GET/POST | `/communities/groups/:id/form` | owner reads/writes custom questions |
| GET | `/communities/groups/:id/requests` | owner queue |
| POST | `/communities/groups/:id/requests/:rid` | approve / reject |
| DELETE | `/communities/groups/:id/members/:uid` | leave, or owner removes |
| GET | `/communities/groups/:id/messages` | first page; realtime carries the rest |
| POST | `/communities/groups/:id/messages` | screened, see below |
| DELETE | `/communities/messages/:id` | author or owner/mod; soft delete |
| POST | `/communities/reports` | message or group |

**Creation limit:** 2 active groups per user — the number the Communities spec
settled — raised to 10 for a mentor. "Mentor" here means an approved row in the
existing `creator_applications` / `creator_profiles` pipeline; if the
implementation finds that signal is not queryable from this service without a
new join, the limit is a flat 2 for everyone and the raise becomes a follow-up.
It is not worth a schema change to grant eight extra groups. Enforced in the
service against a count of non-archived owned groups, never in the client.

**Send-time screening:** every message body passes a text screener reusing the
scraper scam-gate's threshold and vocabulary. It is a *separate* implementation
from the scraper gate, which grades metadata that already carries
LLM-extracted `red_flags` and cannot screen raw prose. A message that trips the
screener is rejected with a human message, never silently dropped.

## 6. Mobile surfaces

| Route | Purpose |
|---|---|
| `/discussions` | browse: your groups, groups for opportunities you saved, public groups, WhatsApp banner |
| `/discussions/[id]` | chat, or the join gate for non-members |
| `/discussions/new` | create-group form |
| `/discussions/[id]/settings` | owner: details + custom questions builder |
| `/discussions/[id]/requests` | owner: join-request queue |

`app/(app)/opportunities/index.tsx` — the `discussion` tile drops
`external: true` and its hardcoded URL, and routes to `/discussions`. The
opportunity detail screen gains an entry point to that opportunity's anchored
group (or to creating one).

**WhatsApp banner.** A dismissible banner on `/discussions` linking to the
existing channel. It keeps the channel — an audience that already exists — but
demotes it from *being* the feature to *one more room*. Dismissal persists in
AsyncStorage.

## 7. Design principles applied

DESIGN.md is the binding contract. Two of its listed debts are exactly the
traps a groups feature falls into, so they are constraints here, not aspirations.

**Against card monoculture (§5.1).** A groups browse page defaults to a grid of
identical rounded rectangles. It will not be one. Your groups render as list
rows with avatar-stack, last message and unread state; opportunity-anchored
groups render as a horizontal rail tied to the opportunity's deadline colour;
discovery renders as inline sections. Three affordances, not one grid.

**Against the modal reflex (§5.2).** All three forms are *content*, not
interruption, so all three are screens: create, settings/builder, and the
request queue. The join-request form is the one exception worth arguing — it is
a short interruption to a browse flow — and it is an inline expansion on the
group's join gate, not a modal.

**Colour stays Restrained (§1).** Groups are not an AI moment and not a
celebration, so no saturated field. Accent carries unread state, the active
composer, and selection only. Deadline colour on an anchored group comes from
the shared urgency ramp so it agrees with every other deadline in the app.

**Every state ships (§3).** Each interactive component gets default / pressed /
disabled / loading / error. The empty states teach: a 30–34pt icon at ~50%
opacity, one line, one CTA — never a bare sentence. Chat gets a skeleton, not a
floating spinner.

**Motion conveys state (§2).** Message entrance is a single `FadeInDown`
stagger within one list; the composer's send is `AnimatedPressable` with
haptics through the façade; `reducedMotion` is honoured per component.

**Content rules (§4).** Deadlines relative on the urgency ramp. Errors human —
a rejected message says why in a sentence, never a Postgres code. Icon-only
controls carry `accessibilityLabel`. Every string through i18n.

## 8. Safety

Required for App Store review of user-generated content, and specified as
shipping in the first release rather than a follow-up:

- **Report** a message or a group, from a long-press and from the group header.
- **Block** a user, reusing the existing `user_blocks` table; blocked users'
  messages are filtered from the reader's transcript.
- **Owner tools:** remove a member, soft-delete any message in their group.
- **Send-time screening** as described in §5.
- **A no-tolerance notice** shown before a user's first post, acknowledged once
  and recorded.

**Who acts on a report.** §2 puts the admin console out of scope, which would
leave `community_reports` accumulating rows nobody reads — a moderation queue
with no moderator is worse than none, because it implies a response that never
comes. So the first release does two things instead: a report immediately and
automatically hides the reported message from the reporter (client-side, via
the same filter that hides blocked users), and it notifies the group owner, who
already has remove-member and delete-message powers. Rows still accrue for a
later admin surface, but no one waits on one. The owner is the moderator at
this scale; Edutu-level triage arrives with the admin slice.

## 9. Testing

- **Backend:** Nest specs per endpoint group — the creation rate limit, the
  join-policy branch, screening rejection, soft delete preserving the row, and
  authorisation (a non-member cannot read a private group's messages).
- **Mobile:** Jest + RTL per screen — browse renders the three affordances and
  the banner; the join gate shows the request form for a request-policy group;
  the builder refuses a 6th question; the chat subscribes on focus and
  unsubscribes on blur.
- **Locale parity:** the new `community` namespace asserted key-identical
  across all nine locales, as the voice work now does.
- **Gates:** `npx tsc --noEmit`, `npx eslint --max-warnings 0`, and the mobile
  suite must be no worse than the pre-existing baseline (currently 9 failing
  suites, all environment/mock failures unrelated to this work).

## 10. Build order

Each stage is reviewable and leaves the app working.

1. Migration + Nest module + specs — no UI.
2. `/discussions` browse + `/discussions/[id]` chat with realtime + the tile
   re-route + the WhatsApp banner.
3. The three forms: create, custom-question builder, join request + queue.
4. Safety kit: report, block, owner tools, screening, first-post notice.
5. Opportunity-detail entry point + auto-archive on expiry.
