# Web opportunities freshness: shuffle everywhere, compact category cards, slider rails

Date: 2026-07-23
Scope: `edutu-web-app` only.

## Problem

1. `/opportunities` renders in stable server order under the default "Recommended"
   sort, so returning users see an identical list and assume nothing is new.
2. On mobile, the 4 category "collection" cards at the top of `/opportunities`
   stack icon-above-text and are too tall.
3. There is no horizontal discovery surface on the opportunities page — users
   never see "latest", "expiring soon", or "recommended" strips.

## Decisions (approved by user 2026-07-23)

- **Shuffle**: fresh shuffle on every page visit (per-mount seed), stable while
  browsing so pagination never jumps. Personalized users get a tier shuffle
  (shuffle within match-score tiers via the existing `personalizeFeed`) so top
  matches stay near the top; non-personalized get a full seeded shuffle.
- **Rails**: three horizontal snap-scroll rails at the top of `/opportunities`
  on all screen sizes — "Recommended for you" (personalized only), "Just
  added", "Closing soon". Swipe on mobile, arrow buttons on desktop.
- **Category cards**: keep the 2-column grid on mobile but compact each card —
  icon chip left, label right, description hidden below `sm`.

## Design

### Shared shuffle lib — `src/lib/opportunityShuffle.ts`

Extract the Dashboard's proven helpers (currently private in `Dashboard.tsx`):
`createOpportunityShuffleSeed()`, `seededRandom(seed)`,
`shuffleOpportunityFeed(items, seed)`. Dashboard imports from the lib instead
of keeping local copies. Unit tests in
`src/test/__tests__/opportunityShuffle.test.ts` (determinism per seed,
different order across seeds, permutation invariants, empty/single lists).

### OpportunitiesPage ordering

- Per-mount seed: `useState(() => createOpportunityShuffleSeed())`.
- When `sortOption === "recommended"`:
  - personalized: `personalizeFeed(filtered, { seed })` (tier shuffle,
    replaces the current plain score sort);
  - otherwise: `shuffleOpportunityFeed(filtered, seed)`.
- Explicit sorts (deadline / newest / funding) stay deterministic.
- The manual Refresh button also re-seeds, so "Refresh" visibly reorders.

### Rails — `src/components/OpportunityRails.tsx`

Props: opportunities (open, non-dismissed), matchInsights, isPersonalized,
detail base path, trackInteraction hook. Rendered on the browse landing only
(no category filter, no search, not loading, data present).

- **Recommended for you** — top 12 by `personalizeFeed` order (only when
  personalized).
- **Just added** — top 12 by `lastUpdated || createdAt` desc.
- **Closing soon** — open items with a real future deadline, nearest first,
  top 12. Rolling deadlines excluded.
- A rail renders only if it has ≥ 4 items.

Card: compact 248px snap-start card reusing the existing palette system —
image strip (16/9, `ImageWithFallback`) with `UrgencyPill`, category chip,
2-line title, org line, deadline row. Whole card is a `Link` to the detail
page (state-primed like `OpportunityCard`), fires `trackInteraction(view)`
and is wrapped in `ImpressionTracker` (surface `web_browse_rail`).
Desktop: prev/next arrow buttons scrolling by ~80% of the viewport width;
hidden on touch/small screens. Scrollbar hidden, `snap-x snap-mandatory`.

### Compact CollectionCard

Mobile: `flex-row items-center gap-2.5 p-2.5`, icon chip `h-8 w-8`
(icon 16px), description `hidden sm:block`, arrow stays absolute top-right.
`sm:` and up unchanged (current side-by-side layout already).

## Not in scope

- Mobile app (Expo) surfaces; saved/applied/deadlines lists (user-curated
  order must stay stable); backend ordering changes.

## Verification

`npm run typecheck`, `npm run lint` (0-warning gate), `vitest` suite,
`npm run build` (restore `public/sitemap.xml` if the build wipes it).
