# Edutu — Cross-Platform Illustrated State System

**Date:** 2026-08-03
**Scope:** `packages/ux-state/` (new) · `edutumobile/` · `edutu-web-app/`
**Status:** Implemented. The system and the high-traffic flows are shipped —
26 shared scenes, both renderers, web's state contract, and 11 migrated screens
(6 web, 5 mobile). `edutu-web-app/src/components/ui/EmptyState.tsx` is deleted.

Deferred per §9, with the baseline measured on 2026-08-03:
202 `Alert.alert` calls across 41 files, 45 files rendering a raw
`ActivityIndicator`, the three lint guardrails (which can only be enabled once
those counts reach zero), mobile's profile / settings / wallet / onboarding /
admin flows, and every web screen beyond the six. Detail screens
(`opportunities/[id]`, `copilot/[id]`, `goals/[id]`, `roadmap/[id]`) and
`app/(app)/roadmaps.tsx` are also outstanding — see the migration plan's Scope
section for why they were held back.
**Supersedes in part:** `2026-08-01-mobile-ux-state-system-design.md` §4 (illustration
tiers) and §4.2. That spec's feedback layer, guardrails and full-adoption plan
remain in force as the follow-on work — see §9.

---

## 1. Problem

Every user-facing state in both Edutu apps is either an unstyled OS primitive or a
32px glyph in a tinted circle. Neither app has a picture that carries meaning.

**Mobile** has an approved state spec and a shipped foundation — `ScreenState`,
`StateView`, `StateScene`, `stateTokens`, `motion.ts`, `feedback.ts` — but
**adoption is zero**: no screen calls `StateView`, 206 `Alert.alert` calls remain
across 41 files, 45 files render a raw `ActivityIndicator`, and only 2 of 8
planned hero scenes exist.

**Web** has no state taxonomy at all. `src/components/ui/EmptyState.tsx` provides
nine static variants, each a lucide glyph in a `bg-brand/10` circle, consumed by
five screens. A failed fetch and an empty result render identically. There is no
`loading`, `offline`, `locked` or `denied` state anywhere.

The two apps also have no shared visual vocabulary, so any illustration work done
on one will not reach the other.

## 2. Goals & non-goals

### Goals

- Every user state in both apps renders a **branded, coloured, animated
  illustration** — not a glyph, not a spinner, not an OS alert.
- Each illustration is **authored once** and rendered by both apps, so the two
  cannot drift.
- Every scene is correct in mobile's 18 palettes (9 theme packs × light/dark) and
  in web light/dark, **by construction rather than by inspection**.
- Reduced motion is honoured by default, not by each author's memory.
- The high-traffic flows on both apps actually use the system.

### Non-goals

- **No layout or IA changes.** No screen is restructured, no navigation changes.
  This work replaces state surfaces only.
- **No new npm dependencies.** Everything needed is installed:
  `react-native-svg` + `react-native-reanimated@4` on mobile, `framer-motion` on
  web. The shared package has zero runtime dependencies.
- **No data-layer changes.** `useScreenState()` adapts the flags screens already
  track.
- The `Alert.alert` migration, the `ActivityIndicator` migration, the lint
  guardrails, and the profile/settings/onboarding/admin flows are **out of scope
  here** and remain owned by the 2026-08-01 spec (§9).

## 3. Visual direction

Chosen from four candidates rendered side by side in light and dark
(`.superpowers/brainstorm/…/illustration-style.html`).

**Bold duotone.** Two tones of a per-state hue, chunky rounded shapes, no
outlines, generous negative space. The most memorable of the four and the
strongest pull toward the primary action.

### 3.1 The volume dial

Bold duotone at full strength is wrong when the user is stuck rather than
invited: a saturated rose slab filling the screen on every failure reads as the
app being angry at the user, and failure states are seen far more often than
empty states.

So every scene carries `volume: 'invite' | 'calm'`:

| Volume | `hero` shape | `mark` | Decorative layers | Used by |
|---|---|---|---|---|
| `invite` | saturated hue | soft tone | kept | the 8 per-flow empties, `success` |
| `calm` | soft tone | saturated hue | dropped | error×5, offline, locked×3, denied×4, partial, refreshing, loading, `emptyFiltered` |

This is a **paint-resolution rule, not separate art**. The same geometry serves
both volumes. It lives in one function so it cannot drift as scenes are added.

## 4. Architecture

### 4.1 The shared package

```
packages/ux-state/                 ← new, repo root, pure TS, zero runtime deps
  package.json                     @edutu/ux-state
  src/
    state/
      ScreenState.ts               the state union
      deriveState.ts               pure flags → ScreenState
      useScreenState.ts            React hook wrapper
      index.ts
    scenes/
      types.ts                     Layer · Paint · AnimId · SceneSpec
      motion.ts                    the 8 named motions (declarations only)
      volume.ts                    volume → paint resolution
      <26 scene files>.ts
      index.ts                     SCENES registry, keyed by SceneKey
```

The **state contract ships in the same package as the geometry**.
`ScreenState.ts` is already pure TypeScript with a 110-line test suite; if web
hand-copies the union the two apps diverge within a month.
`edutumobile/components/state/ScreenState.ts` becomes a thin re-export so
existing imports and tests keep working unchanged.

### 4.2 Reaching both apps

There is no monorepo. `@edutu/core` lives *inside* `edutumobile/` and is consumed
only by mobile. `@edutu/ux-state` is wired the same way `@edutu/core` already is,
plus a web side:

**mobile**
- `metro.config.js` — add `path.resolve(__dirname, '../packages/ux-state')` to `watchFolders`
- `package.json` — `"@edutu/ux-state": "file:../packages/ux-state"`
- `package.json` Jest `moduleNameMapper` — `^@edutu/ux-state(/.*)?$` → the source path
- `tsconfig.json` — `paths` entry

**web**
- `vite.config.ts` — `resolve.alias` entry **and** `server.fs.allow` (an
  out-of-root import breaks the dev server, not the production build)
- `tsconfig.json` — `paths` entry

### 4.3 How a scene is described

Geometry carries **no colours and no animation code** — only paint *roles* and
motion *names*:

```ts
type Paint  = 'hero' | 'mark' | 'plate' | 'ink' | 'inkSoft' | 'surface' | 'surfaceLine';
type AnimId = 'float' | 'flyIn' | 'blip' | 'shiver' | 'drawOn' | 'pulse' | 'orbit' | 'scan';
type HueRole = 'flow' | 'neutral' | 'danger' | 'offline' | 'locked' | 'denied' | 'success';

type Layer =
  | { t: 'rect';   x: number; y: number; w: number; h: number; r: number;
      fill?: Paint; stroke?: Paint; sw?: number; op?: number; anim?: AnimId; decor?: true }
  | { t: 'circle'; cx: number; cy: number; r: number;
      fill?: Paint; stroke?: Paint; sw?: number; op?: number; anim?: AnimId; decor?: true }
  | { t: 'path';   d: string;
      fill?: Paint; stroke?: Paint; sw?: number; op?: number; anim?: AnimId; decor?: true }
  | { t: 'group';  children: Layer[]; anim?: AnimId; origin?: [number, number] };

interface SceneSpec {
  viewBox: [number, number];
  hue: HueRole;
  volume: 'invite' | 'calm';
  layers: Layer[];
}
```

Three consequences follow, and they are the point of the whole design:

1. **Colour never enters the package.** Each app resolves `Paint → colour` from
   its own tokens — mobile from `components/state/stateTokens.ts` (already
   zero-hex and 18-palette safe), web from the `--color-brand-*` CSS vars in
   `src/index.css`. This is what makes every palette correct by construction.
2. **The volume dial is a resolver.** `volume.ts` maps
   `(volume, hue, themeTokens) → Record<Paint, string>` and drops `decor: true`
   layers when `calm`. One rule, 26 scenes.
3. **Motion is shared by name, implemented twice.** Each app implements the 8
   named motions *once*. Adding scene 27 costs zero animation code.

### 4.4 Per-app renderers

One file per app converts a `SceneSpec` into pixels; it is the only place either
app knows about SVG.

| | Mobile | Web |
|---|---|---|
| File | `edutumobile/components/state/SceneRenderer.tsx` | `edutu-web-app/src/components/state/SceneRenderer.tsx` |
| Layers | `react-native-svg` | inline `<svg>` |
| Paint source | `stateTokens.ts` | CSS custom properties |
| Motion | Reanimated worklets | framer-motion variants |
| Reduced motion | existing `useMotion()` | `prefers-reduced-motion` |

Under reduced motion, every `AnimId` collapses to the entry fade at zero duration
and **no loop is started** — enforced in the renderer, so a scene author cannot
regress it.

### 4.5 Sizes

Three stages — `inline` 96px, `section` 168px, `hero` 240px — all rendering the
same geometry. Because everything is SVG, no separate small-size art exists.

## 5. The 26 scenes

**Per-flow empty — 8, `invite`, hue `flow`:**

| Scene | Owning screens |
|---|---|
| `emptyHome` | `(app)/index`, web `Dashboard` |
| `emptyDiscovery` | `opportunities/index`, `opportunities/featured`, web `OpportunitiesPage` |
| `emptySaved` | `saved/index`, web `SavedPage` |
| `emptyApplied` | `applied`, `deadlines`, web `ApplicationsPage`, web `DeadlinesPage` |
| `emptyGoals` | `goals/*`, `roadmaps`, `roadmap/[id]`, web `GoalsPage`, web `RoadmapsPage` |
| `emptyCoach` | `chat`, `cv/index` (follow-on) |
| `emptyWallet` | `wallet`, `referrals` (follow-on) |
| `emptyCommunity` | community surfaces (follow-on) |

`emptyCoach`, `emptyWallet` and `emptyCommunity` are authored now but first
consumed by the deferred flows in §9 — authoring all eight together is what keeps
the set looking like one family.

**Shared — 18:**

| Scene | Hue | Volume |
|---|---|---|
| `loading`, `refreshing`, `partial`, `emptyFiltered` | `neutral` | `calm` |
| `errorNetwork`, `errorAuth`, `errorNotFound`, `errorServer`, `errorTimeout` | `danger` | `calm` |
| `offline` | `offline` | `calm` |
| `lockedPro`, `lockedGuest`, `lockedModule` | `locked` | `calm` |
| `deniedNotifications`, `deniedCamera`, `deniedCalendar`, `deniedPhotos` | `denied` | `calm` |
| `success` | `success` | `invite` |

`emptyFiltered` is deliberately `neutral`, not `danger`: a filter that matched
nothing is not a failure, and borrowing the error hue teaches users to read their
own search as something the app got wrong.

### 5.1 The two existing scenes are rebuilt

`edutumobile/components/state/scenes/NoOpportunitiesScene.tsx` and
`NothingSavedScene.tsx` are hand-composed React Native views in the previous
visual style. They are re-authored as `emptyDiscovery` and `emptySaved` geometry
and the originals deleted. Keeping them would leave two scenes that can never
render on web and do not match the other 24.

### 5.2 Tier 3 is removed

`components/state/IconTile.tsx` is deleted. Every state renders a drawn scene;
small slots use the `inline` stage. This is the deliberate departure from the
2026-08-01 spec, which left ~15 states as glyph tiles.

## 6. Web gains the contract mobile already has

Web currently cannot distinguish a failed fetch from an empty result. It gains,
importing the union from `@edutu/ux-state`:

- `src/components/state/StateView.tsx` — `ScreenState → scene + copy + actions`,
  mirroring mobile's, in Tailwind
- `src/components/state/InlineError.tsx` — themed failure strip with retry
- `useScreenState()` — shared, from the package

`src/components/ui/EmptyState.tsx` and its nine variants are **absorbed and
deleted** in the same commit as its five consumers migrate. A leftover primitive
is a decoy that the next screen adopts.

Web's `ToastProvider`, `Skeleton`, `LoadingFallback`, `CelebrationBurst` and
`OfflineBanner` are unchanged; this work does not touch web's feedback layer.

One new token is required: `--color-scene-soft` (light and dark) alongside the
existing `--color-brand-*` block in `src/index.css`, to carry the duotone's soft
tone.

## 7. Migration coverage

**Mobile — 5 flows, one commit each:**

| Flow | Screens |
|---|---|
| Home | `(app)/index` |
| Discovery | `opportunities/index`, `opportunities/featured` |
| Opportunity & apply | `opportunities/[id]`, `copilot/[id]`, `applied` |
| Saved & deadlines | `saved/index`, `deadlines` |
| Goals & roadmaps | `goals/index`, `goals/[id]`, `roadmaps`, `roadmap/[id]` |

**Web — 6 screens, one commit each:**
`Dashboard` · `OpportunitiesPage` · `SavedPage` · `GoalsPage` · `RoadmapsPage` ·
`ApplicationsPage` and `DeadlinesPage`

The first five web screens are exactly the current consumers of
`ui/EmptyState.tsx`, so its deletion is fully covered.

## 8. Testing

- **Scene registry test** — all 26 keys resolve; every layer's `fill`/`stroke` is
  a valid `Paint` and every `anim` a valid `AnimId`. This is the mechanical
  guard that keeps a raw colour or a bespoke animation out of the package.
- **Volume resolver test** — `invite` and `calm` produce the expected paint
  mapping, and `calm` drops `decor` layers.
- **Mobile (Jest)** — `StateView` renders every `kind`/`reason`/`cause` variant
  with its expected scene, copy and actions; theme-matrix smoke across 9 packs ×
  light/dark; reduced-motion assertion (zero durations, no loops started).
- **Web (Vitest)** — the same per-variant render tests, plus light/dark.
- Both apps' lint and typecheck are already CI-gated; the new package must pass
  under both toolchains.

## 9. Explicitly deferred

These remain owned by `2026-08-01-mobile-ux-state-system-design.md` and are **not**
part of this work. Recorded here so the follow-on session does not rediscover them:

- The 206 `Alert.alert` call sites across 41 files → `notify()`
- The 45 files rendering a raw `ActivityIndicator`
- The three lint guardrails (ban `Alert.alert`, ban raw `ActivityIndicator`, ban
  hex literals in `components/state/`) — these can only be enabled once the
  counts reach zero
- Mobile flows: profile, settings, wallet, referrals, onboarding, auth, admin
- Web screens beyond the six in §7

## 10. Risks

| Risk | Mitigation |
|---|---|
| **Metro resolving a package outside the app root** is the classic Expo footgun — symlink/haste resolution, plus Jest needing its own mapper | Do the plumbing first with one throwaway scene, and prove `npm test` *and* a device build both resolve it before authoring 26 scenes |
| Vite `server.fs.allow` for an out-of-root import breaks `npm run dev` but not `npm run build` — easy to miss in CI | Verify in the dev server explicitly, not only in the production build |
| **Concurrent sessions share this working tree**; it already carries ~50 modified files from other work | One flow per commit, small and scoped. Never `git stash` — read prior file state via `git show HEAD:<path>` |
| 26 scenes is a lot of drawing; quality drifts by scene 20 | Author the 8 per-flow empties first — highest value, most seen — then the 18 shared, which are far more formulaic |
| Rebuilding two just-shipped RN scenes as SVG is visible churn | They are three days old and no screen consumes them yet; the alternative is two permanent one-offs invisible to web |
| Loud duotone on failure states reading as hostile | Resolved by the volume dial (§3.1), fixed as a rule rather than a per-scene judgement |
| Animation cost on low-end Android | Entry-only by default; loops confined to the 8 `invite` scenes and gated on reduced motion |

## 11. Sequencing

1. Package skeleton + both apps' plumbing, proven end-to-end with one throwaway scene
2. `types.ts`, `motion.ts`, `volume.ts` + their tests
3. Both `SceneRenderer`s and the 8 named motions per platform
4. The 8 per-flow empty scenes, then the 18 shared scenes
5. Web `StateView`, `InlineError`, `useScreenState` wiring
6. Migrate mobile's 5 flows — one commit each
7. Migrate web's 6 screens — one commit each
8. Delete `IconTile.tsx`, web `ui/EmptyState.tsx`, and the two superseded RN scenes

Detailed task breakdown belongs to the implementation plan, not this spec.
