# Edutu Web Community Parity + SEO Design

**Date:** 2026-08-21  
**Status:** Approved design, ready for implementation planning after written-spec review  
**Primary surface:** `edutu-web-app`  
**Supporting surfaces:** `backend/services/services/api`, existing community-call web feature  
**Reference implementation:** current `edutumobile` community/discussions feature on `main`  
**Prior product spec:** `docs/superpowers/specs/2026-07-25-communities-groups-design.md`

---

## 1. Problem

Edutu currently has two different community realities:

1. `edutu-web-app/src/components/CommunityPage.tsx` is a public marketing/story page. It looks like a community product, but it does not expose the real group-discussion experience.
2. `edutumobile/app/(app)/discussions/**` already contains the real member product: Explore, Groups, Chats/DMs, group creation, membership gates, resources, moderation, profile content, and group administration.

The backend already carries the important community rules in `backend/services/services/api/src/communities/**`. The web app should therefore become another client of the same domain, not a separate community implementation.

The public `/community` route also needs to do real acquisition work. Community names and public group pages should be search- and share-friendly instead of existing only inside authenticated client-side routes.

## 2. Goals

Build a production-quality web community experience that:

- keeps `/community` as a public, indexable acquisition surface;
- adds the full signed-in community product at `/app/community/**`;
- ports the currently shipped mobile community behavior rather than reviving unshipped ideas from older plans;
- reuses the existing NestJS community APIs and existing web community-call stack;
- preserves server-side membership, moderation, privacy, and archive semantics exactly;
- gives public groups SEO-ready titles, descriptions, canonical URLs, Open Graph metadata, and crawlable public summaries;
- makes Community a first-class destination in the web workspace navigation;
- improves the visual hierarchy, interaction density, responsive behavior, accessibility, and trustworthiness of the current community presentation;
- removes or replaces unsupported hard-coded social proof from the public community page unless live data can substantiate it.

## 3. Non-goals

This port does **not**:

- change the opportunity UI work being handled separately;
- introduce a second web-only community database or authorization model;
- expose private group messages, private member lists, DMs, join-request answers, or private cover assets to public crawlers;
- implement old community-plan features that are not currently shipped on mobile/backend, such as an AI Brief or public opportunity Notes, merely because they exist in the July design document;
- rebuild the existing web community-call media/signaling stack;
- turn Edutu into a generic social network with public follower counts, algorithmic social feeds, or vanity engagement mechanics;
- use fake member/win/mentor counts or fabricated testimonials to make the page look more active.

## 4. Settled architecture

### 4.1 Two web surfaces

The approved model is deliberately split:

- **`/community`** — public, indexable, acquisition-focused.
- **`/app/community/**`** — authenticated member workspace, `noindex`.

A signed-out visitor sees a strong invitation to join. A signed-in visitor sees an “Open community” CTA that enters the authenticated product.

This avoids making SEO depend on auth state while keeping the member product free to use application-specific navigation and private data.

### 4.2 Mobile is the behavioral reference, not the component source

React Native UI components are not copied into React DOM. The web app reproduces the same domain behavior using web-native components and the existing Edutu web design system.

Behavioral contracts come from:

- `edutumobile/packages/core/src/services/communities.ts`
- `edutumobile/packages/core/src/services/communityDms.ts`
- `edutumobile/packages/core/src/services/communityRealtime.ts`
- `edutumobile/packages/core/src/services/communityAuthz.ts`
- `edutumobile/app/(app)/discussions/**`
- `backend/services/services/api/src/communities/**`

### 4.3 Browser community client

The mobile `@edutu/core` client cannot be imported directly into Vite as-is because its transport is Expo-environment-specific (`EXPO_PUBLIC_API_URL`). The web app will get a focused browser community client under `edutu-web-app/src/features/community/api/`.

The browser client must:

- use the web app's `getApiBaseUrl(...)`, Clerk token getter, `getLocalDevAuthHeaders`, and timeout helpers;
- preserve backend human-readable refusal messages;
- expose status through a `CommunityApiError` equivalent so 401/403/404 and domain refusals are distinguishable;
- use the same JSON shapes and field semantics as mobile;
- validate attachment resource URLs before opening them;
- never silently turn a join/moderation refusal into an empty result.

No direct Supabase writes are introduced. Mutations continue through the backend.

## 5. Route map

### 5.1 Public routes

| Route | Purpose | Indexing |
|---|---|---|
| `/community` | Public community landing/discovery | index |
| `/community/groups/:slug` | Public summary of one active public group | index |

`/community/groups/:slug` must never render private messages or authenticated member data. It is a safe summary page with group name, description, category/context, member count when available, deadline/activity cues, and a join/open CTA.

### 5.2 Authenticated routes

| Route | Purpose |
|---|---|
| `/app/community` | canonical entry; redirect/render Explore |
| `/app/community/explore` | discover public/visible groups |
| `/app/community/groups` | active memberships plus invited/pending sections |
| `/app/community/groups/new` | full-page group creation |
| `/app/community/groups/:id` | group workspace: Posts / Resources / About |
| `/app/community/groups/:id/settings` | owner/mod settings |
| `/app/community/groups/:id/requests` | owner/mod join-request queue |
| `/app/community/chats` | accepted DM conversations |
| `/app/community/dm/new` | start permitted DM flow |
| `/app/community/dm/:id` | direct conversation |
| `/app/community/profile` | signed-in member community profile/content |

All authenticated routes use `ProtectedRoute` / `AppWorkspaceRoute` and are `noindex`.

Existing `/communities/calls/:callId` remains the call destination. Group call cards link into it rather than creating a duplicate route.

## 6. Public SEO contract

### 6.1 `/community`

The public page gets a query-relevant title and accurate description, for example:

- title pattern: `Scholarship & Career Community for African Learners | Edutu`
- description: concise language about joining peers to discuss scholarships, fellowships, internships, applications, and career opportunities.

Requirements:

- exactly one meaningful `<h1>`;
- canonical `/community` URL;
- Open Graph and Twitter metadata;
- public CTA linking to `/app/community` for signed-in users and auth-with-return-path for signed-out users;
- no unsupported hard-coded member, mentor, or win totals.

### 6.2 Public group metadata endpoint

The current authenticated `communities/groups` API is not suitable for crawlers. Add a deliberately small read-only public projection in the backend:

- `GET /public/communities/groups?limit=...`
- `GET /public/communities/groups/:slug`

The public list and detail endpoints return **only groups that are public, not archived, and not past `expiresAt`**. Private, unlisted, archived, expired, and missing groups are omitted from the list and return 404 from the detail endpoint.

The projection contains only fields safe for anonymous display:

```ts
interface PublicCommunityGroupSummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  coverEmoji: string;
  memberCount: number;
  messageCount: number;
  opportunityId: string | null;
  expiresAt: string | null;
  createdAt: string;
}
```

It must not expose owner IDs, membership rows, member identities, invitation data, join answers, messages, signed storage URLs, or moderation fields.

### 6.3 Dynamic group title/meta

`/community/groups/:slug` uses:

- title: `${group.name} Community | Edutu`
- description: normalized group description, falling back to a factual sentence using the group name and Edutu community context;
- canonical: `/community/groups/${group.slug}`;
- OG/Twitter title + description;
- generated/default Edutu image unless a cover image is explicitly public-safe.

Because the app is a Vite SPA, dynamic group metadata must follow the existing Netlify edge-meta pattern used by opportunity pages. Add a focused community-group edge function rather than relying solely on client-side `document.title` changes.

The public group page emits a minimal `BreadcrumbList` plus a `CollectionPage`/`WebPage` JSON-LD representation. It must not model private chat messages as public `DiscussionForumPosting` content.

## 7. Authenticated information architecture

### 7.1 Main workspace navigation

Community becomes a first-class `AppWorkspaceShell` destination:

- desktop primary navigation: Home, Opportunities, **Community**, Deadlines;
- mobile web primary navigation: Home, Explore, **Community**, Dates.

Use a `UsersRound`/community-appropriate icon. Active route matching includes every `/app/community/**` path.

### 7.2 Community sub-navigation

The community product has three primary destinations matching mobile's mental model:

1. **Explore**
2. **Groups**
3. **Chats**

Desktop/tablet: horizontal segmented/tab navigation near the community header.  
Mobile web: compact sticky bottom/sub-navigation above the browser/app safe area, not a second oversized global bar.

Profile is reachable from the community header/action area rather than competing with the three primary destinations.

## 8. Functional parity

### 8.1 Explore

Port the shipped mobile Explore behavior:

- load visible non-archived groups;
- search communities by name/description;
- focus filters: All, Scholarships, Careers, Study Help;
- surface current membership state on cards;
- open a group into the correct membership gate;
- actionable network/empty/loading states;
- manual refresh;
- do not port mobile-control campaign banners as a dependency of the initial web parity release.

Web improvement over mobile:

- cards may use a responsive two/three-column grid on large screens, but must become dense list/card rows on narrow screens;
- group purpose and membership state must be readable without hover;
- show useful context such as members, activity, expiry, and linked-opportunity cue without overloading cards.

### 8.2 My Groups

The Groups view separates relationship states:

- **Active groups** — actual joined rooms;
- **Invitations** — accept through the existing join route; decline by using the existing self-removal membership route so the invitation becomes `removed`;
- **Pending requests** — waiting state, not “joined”;
- removed/banned semantics remain governed by backend and are not presented as retryable membership.

Active rows show:

- group identity/avatar/emoji;
- latest activity;
- unread count where determinable;
- member count;
- expiry/archive state;
- linked opportunity cue if present.

A persistent but restrained “Create community” action opens the full-page creation route.

### 8.3 Group creation

Mirror mobile's server-aligned fields and limits:

- name: 3–60 characters;
- description: max 280 characters;
- cover emoji from a bounded palette;
- optional cover image using private upload reservation flow;
- optional linked opportunity;
- visibility: public/private;
- join policy: open/request.

Visibility and join policy remain separate controls. The web must explain them in plain language.

If a group is created from an opportunity context, the opportunity link is locked at creation just as on mobile.

Creation is a page, not a modal. On success it replaces/navigates to the new group. Backend human-readable refusal messages are shown directly.

### 8.4 Group workspace

The group route uses three content tabs:

- **Posts** — live/paginated group messages;
- **Resources** — durable shared image/PDF resources;
- **About** — group details, members, membership/admin actions and linked opportunity context.

Desktop layout:

- main conversation/content column up to ~760px;
- optional right context rail ~300px for About/member/admin context where it reduces scrolling;
- no permanently open third navigation column inside the already-sidebared workspace.

Mobile layout:

- one-column content;
- tabs remain visible but compact;
- composer remains reachable above safe area / bottom browser UI.

### 8.5 Membership gates

Preserve mobile/backend semantics exactly:

- `active`: can read and post;
- `invited`: may preview as allowed by current backend/mobile behavior and accept invitation;
- `pending`: cannot read protected messages; sees waiting state;
- `removed`: may only rejoin if backend rules allow;
- `banned`: terminal client state; no fake “try again” action.

Private groups are not made discoverable to anonymous/public web users.

### 8.6 Posts, realtime and composer

Web posts support the currently shipped durable behavior:

- newest/history loading with keyset pagination (`before` + `beforeId`);
- Supabase Realtime for new messages where the current backend/RLS contract permits it;
- server-side author summaries only;
- text messages;
- reply context;
- image and PDF attachments through signed reservation/resource URLs;
- deleted-message tombstones;
- report/delete/block/unblock actions according to role and ownership;
- scheduled/live call cards linked to the existing web community-call feature.

A first-post safety notice equivalent to mobile must gate the first message before the composer can send.

Do **not** represent a device-local pin as a group-wide durable pin. If the backend has no durable pin contract, web omits that group-wide affordance instead of making a local browser preference look shared.

### 8.7 Resources

Resources are not a cosmetic tab over the message list. Use the existing resources endpoint/cursor and render:

- thumbnail/type indicator;
- safe file name;
- sender display name/avatar when provided;
- source message/story context when available;
- timestamp;
- explicit download/open action that resolves the private URL immediately before use.

Invalid or expired attachment metadata renders an unavailable state rather than opening arbitrary URLs.

### 8.8 About, members and admin

About shows:

- name, description, cover identity;
- member/message counts;
- visibility and join policy in human terms;
- linked opportunity;
- archive/expiry status;
- member roster when authorized.

Owner/mod administration ports the current mobile/backend capabilities:

- invite members;
- review join requests;
- role changes as permitted;
- remove members;
- edit group details/cover;
- configure screening form where mobile currently supports it;
- archive with explicit irreversible wording.

Client role rendering must consume the backend/mobile authorization contract rather than re-derive a second incompatible role model.

### 8.9 Chats / DMs

Port the current mobile DM model:

- accepted-conversation inbox;
- avatar/display name;
- last-message preview and time;
- unread emphasis/count;
- open conversation;
- start conversation through the existing permitted flow;
- hide/remove a conversation from the inbox using backend behavior;
- network/empty states that lead users back to Explore rather than dead-end them.

No email or other private profile fields are exposed in chat UI.

### 8.10 Community profile

The initial web parity target is the signed-in member's own community profile, matching current mobile behavior:

- avatar/name/supporting profile line;
- link to existing profile editing/settings;
- Posts / Resources switcher;
- cursor-based load-more for community content;
- accurate counts derived from returned rows.

Public `@username` social profiles from older community plans are not part of this port unless they are already live in backend/mobile at implementation time.

### 8.11 Community calls

Reuse `edutu-web-app/src/features/community-calls/**`.

Group pages may:

- list scheduled/current calls from the existing API;
- render call cards in Posts/About where appropriate;
- open `/communities/calls/:callId`.

Do not create a second mediasoup/signaling client.

## 9. Visual and UX direction

### 9.1 Community visual identity

Authenticated community gets a scoped warm sub-palette inspired by the current mobile experience while remaining recognizably Edutu:

- light background: warm off-white around `#FFF9F1`;
- primary community accent: warm orange around `#F45B16`;
- foreground: deep warm neutral/brown rather than pure black;
- cards: white/surface-layer;
- borders: warm low-contrast peach/neutral;
- dark mode: map through existing Edutu dark tokens rather than hard-coding light colors.

The public `/community` page may use broader editorial visuals, but the authenticated app becomes calmer and more task-oriented.

### 9.2 Typography and hierarchy

Target scales:

- page title: 26–30px mobile, 32–36px desktop, weight 700–800;
- section title: 18–22px mobile, 20–24px desktop;
- card/group title: 15–17px, semibold/bold;
- message/body: 15–16px with 1.5–1.65 line height;
- secondary/meta: 12–14px, never used for essential actions.

Long group names and message content must wrap predictably. Critical labels must not be truncated into ambiguity.

### 9.3 Density and sizing

- primary touch/click targets: minimum 44px;
- search fields: 48–52px;
- group rows: approximately 72–88px depending on metadata;
- radii: mostly 14–20px inside the app, avoiding marketing-style 28–32px everywhere;
- desktop content max-width: roughly 1180–1240px;
- conversation line length constrained for reading quality.

### 9.4 Interaction rules

- loading uses content-shaped skeletons, not centered blocking spinners;
- empty states explain what users can do next;
- destructive actions require confirmation where irreversible;
- optimistic UI is only used where failure can be cleanly rolled back;
- server refusal messages remain visible because many explain exactly how a user can recover;
- membership/action state is visible without hover;
- mobile scrolling must not be blocked by nested horizontal carousels unless the content truly requires horizontal exploration.

## 10. Trust improvements to the public community page

The current public page contains hard-coded examples such as `50K+ Members`, `800+ Mentors`, `3.2K Wins shared`, and testimonial-style quotes. These must be treated as claims, not decoration.

Implementation rule:

- if a number or quote has a trustworthy live/configured source, render it;
- otherwise replace it with qualitative product proof, real public-group cards, and clear feature explanations.

A better first impression is credibility plus useful product visibility, not larger unsupported numbers.

## 11. State, persistence and unread behavior

- Use server data as the source of truth for group membership, DMs, moderation and resources.
- Use local browser persistence only for UX state that is explicitly device-local (for example last viewed tab) unless a server endpoint exists.
- Unread state may initially mirror the mobile read-marker approach where the backend lacks a durable read model, but UI copy must not imply cross-device synchronization unless it is real.
- If web discovers an existing backend unread endpoint while implementing, prefer it and document the contract in tests.

## 12. Error and privacy behavior

- 401: route/recover through sign-in with return path.
- 403: show the backend sentence; do not replace with generic “not allowed”.
- 404 on public group: render public not-found page and `noindex`.
- 404 on authenticated group: explain the group is unavailable and link back to community.
- network failure: keep already-rendered content when safe and show retry affordance.
- private/unlisted groups: never leak existence through public metadata endpoints.
- signed attachment URLs: short-lived, resolved only after authorization and origin validation.
- pending/banned users: never receive message data merely because the UI hides it.

## 13. Accessibility

Minimum requirements:

- semantic nav/tab roles and `aria-current` / selected state;
- visible focus rings;
- every icon-only action has an accessible label;
- unread indicators are announced in text, not color alone;
- moderation/destructive confirmations are keyboard accessible;
- composer, search and form fields have persistent labels or accessible names;
- message action menus are reachable by keyboard;
- reduced-motion preference disables nonessential transitions;
- color contrast meets WCAG AA for body/action text.

## 14. Testing strategy

Implementation is test-first.

### 14.1 Browser client tests

Cover:

- group list/detail parsing;
- preserved backend error message + status;
- join outcomes (`active`, `pending`);
- invitation acceptance and decline;
- message keyset pagination forwarding both cursor fields;
- attachment serialization/origin checks;
- block/report/delete requests;
- DM list/detail/hide behavior;
- public projection refusing private/unlisted/archived/expired groups.

### 14.2 Component/route tests

Cover:

- `/app/community` requires auth;
- public `/community` remains accessible signed out;
- workspace Community navigation active state;
- Explore search/filter states;
- Groups separates active/invited/pending;
- pending and banned membership gates do not render protected message UI;
- creation validation mirrors backend limits;
- group tabs and admin controls follow role;
- DM empty/error/unread states;
- public group page uses dynamic title/description and hides private data;
- authenticated pages set `noindex`.

### 14.3 SEO/edge tests

Cover:

- public group slug extraction;
- HTML metadata escaping;
- title/description fallback;
- private/unlisted/archived/expired/missing group response does not inject indexable metadata;
- canonical URL uses the normalized slug;
- `/community` metadata remains static and accurate.

### 14.4 Verification gates

At minimum for touched web code:

```bash
cd edutu-web-app
npm test
npm run typecheck
npm run lint
npm run build
```

For backend public metadata additions:

```bash
cd backend/services/services/api
npm run test -- communities
npm run lint
npm run build
```

If the repository's actual targeted test syntax differs, the implementation plan must use the scripts present on the implementation branch rather than inventing commands.

## 15. Delivery slices

This design is one product, but implementation should be reviewed in independently testable slices:

1. **Foundation + navigation + browser API client** — routes, shell entry, error contract, types.
2. **Explore + My Groups + creation** — discovery, membership-state lists, create flow.
3. **Group workspace** — posts, membership gates, resources, about, attachments, moderation, realtime.
4. **Chats + profile + admin flows** — DM inbox/conversation, own profile, join requests/settings/member management.
5. **Public SEO + trust polish** — public group projection, edge metadata, public landing CTA/claims, dynamic group pages.
6. **Cross-surface verification** — calls integration, responsive/a11y audit, lint/typecheck/build, backend tests, production-readiness review.

A slice is not complete while it has unresolved P0/P1 findings.

## 16. Acceptance criteria

The work is complete when all of the following are true:

- Community is reachable as a first-class item from authenticated web navigation.
- `/app/community` provides Explore, Groups and Chats with responsive desktop/mobile web UX.
- Users can discover, create, join/request/accept, enter and leave/manage groups according to the existing backend rules.
- Group messages, resources, attachments and moderation work without direct client writes.
- Membership gates prevent pending/banned/private-state leaks.
- DM inbox and conversations work from the web.
- The signed-in community profile renders real posts/resources.
- Existing web community calls remain the only call implementation and are reachable from groups.
- `/community` remains public and has accurate, search-oriented metadata.
- active public groups can have indexable `/community/groups/:slug` summary pages with dynamic SEO titles/descriptions.
- private/unlisted/archived/expired/authenticated community data is not indexed or leaked by public metadata endpoints.
- hard-coded unsupported community metrics/claims are removed or connected to a trustworthy source.
- keyboard, screen-reader, reduced-motion and responsive checks pass for the touched surfaces.
- targeted tests, web typecheck/lint/build, and backend community tests pass, or any genuinely external blocker is explicitly evidenced.

---

## Design compatibility note

This document is a **current-state web parity delta** over the approved July community design. Where the July design describes ideas that are already implemented in mobile/backend, this port should preserve them. Where it describes features that are not currently shipped, this document intentionally does not treat them as prerequisites for the web release.
