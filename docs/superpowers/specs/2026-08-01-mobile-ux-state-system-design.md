# Edutu Mobile — UX State System Design

**Date:** 2026-08-01
**Scope:** `edutumobile/` — all 60 screens, all flows
**Status:** Approved for planning

---

## 1. Problem

Edutu Mobile does not have a state-design problem. It has a **state-adoption
problem**. Four state primitives already exist and almost nothing uses them.

| Primitive | Exists | Screens using it |
|---|---|---|
| `components/ui/EmptyState.tsx` | yes | 2 |
| `components/ui/LottieState.tsx` | yes | **0 — dead code** |
| `components/ui/LoadState.tsx` | yes | ~4 |
| `components/ui/Skeleton.tsx` | yes | 2 |
| `components/ui/LottieRefresh.tsx` | yes | **0 — dead code** |
| `components/ui/SuccessDialog.tsx` | yes (uncommitted) | **0** |
| `components/ui/BrandedLoader.tsx` | yes | ~6 |

**50 of 60 screens use none of them** and hand-roll their states instead.

### 1.1 Measured gaps

1. **193 `Alert.alert` calls across 30 files.** Every success, error, confirm and
   destructive action routes through the grey OS modal. Heaviest:
   `roadmap-templates/[id]` (18), `cv/index` (15), `opportunities/[id]` (12),
   `creator-dashboard` (12), `roadmaps` (10), `goals/[id]` (10),
   `profile/settings` (10). Classification: ~21 confirms, 11 destructive,
   **~161 one-button notifications** — overwhelmingly errors of the form
   `Alert.alert(t('states.error'), t('alerts.saveFailed'))`, which block the
   user and offer no recovery path.
2. **43 files render raw `ActivityIndicator`** — the unstyled OS spinner — while
   `BrandedLoader` and a five-shape skeleton set sit unused.
3. **`EmptyState` is theme-blind.** It hardcodes `#F8FAFC` titles, `#94A3B8`
   body and per-variant slate hex. The app ships **9 theme packages × light/dark
   = 18 palettes**; the component is correct in exactly one. The same hardcoding
   appears in the inline `EmptySection` in `app/(app)/goals/index.tsx` and
   elsewhere.
4. **No illustration assets.** Four Lottie JSONs at 2.7–3.5 KB (placeholder-grade
   geometry), three onboarding PNGs, five discovery PNGs. Every empty state in
   the app is a 32px lucide glyph in a tinted circle.
5. **Haptics are solved and stay as-is.** `lib/haptics.ts` already defines the
   full vocabulary (light/medium/heavy/selection/success/warning/error), gates
   every call on a persisted Settings toggle, and is adopted across 19 files.
   No new haptics module is needed — the state and feedback layers consume it.
6. **`reducedMotion` is in `ThemeContext` but only 16 files read it**, and no
   wrapper enforces it — so every new animation is an accessibility regression
   by default.
7. **Entire state classes are absent app-wide:** first-run vs. filtered empty,
   error taxonomy (401/403/404/timeout/500/offline all render identically),
   stale/partial data, optimistic + pending, permission-denied, and a consistent
   gated/locked state (currently split across `ModuleLockOverlay`, `AuthWall`
   and `ProGate`).

### 1.2 The asset that already exists

The newest work in the repo (`7ca3359`, `b65c91a`) established a genuine house
illustration language: `components/onboarding/SlideVisuals.tsx` (535 lines),
`components/ui/WelcomeIllustration.tsx` (406), `components/onboarding/OpportunityOrbit.tsx`
(240). These are not static art — they are **animated scenes composed in code**
from RN views, lucide glyphs, Reanimated, gradients and glass cards, each driven
by a per-concept hue defined in `components/onboarding/onboardingTokens.ts`.

They are theme-reactive by construction, which the PNG and Lottie assets are not.
**The state system extends this language rather than importing a foreign one.**

---

## 2. Goals & non-goals

### Goals

- Every screen and flow renders its states through one contract.
- Every state is correct in all 18 palettes, in light and dark.
- Every state carries an illustration that communicates more than its copy.
- `Alert.alert` reaches zero call sites.
- Motion and haptics become a shared vocabulary, not per-screen improvisation.
- Reduced-motion is honored by default rather than by memory.
- Regression is prevented mechanically, not by review discipline.

### Non-goals

- **Core layouts do not change.** No screen is restructured, no navigation
  changes, no information architecture is revised. This work replaces state
  surfaces and feedback, nothing else.
- No new npm dependencies. Everything required is installed:
  `lucide-react-native`, `@hugeicons/core-free-icons`, `react-native-svg`,
  `react-native-reanimated@4`, `expo-haptics`, `expo-blur`,
  `expo-linear-gradient`, `lottie-react-native`.
- No data-layer rewrite. `useScreenState()` adapts existing fetch patterns.
- No copy rewrite beyond the strings each state needs.

---

## 3. Architecture

Four new modules, one contract, consumed by every screen.

```
lib/
  feedback.ts        — notify() façade; routes feedback to a surface
  motion.ts          — durations, easings, springs, choreography
  haptics.ts         — the haptic vocabulary
components/state/
  stateTokens.ts     — per-state hue + surface tokens (extends onboardingTokens)
  ScreenState.ts     — the state union + useScreenState()
  StateView.tsx      — state → scene + copy + actions
  StateScene.tsx     — Tier 2 parameterized scene primitive
  IconTile.tsx       — Tier 3 glyph tile
  scenes/            — Tier 1 hero scenes (8 files)
  InlineError.tsx    — in-context failure + retry
  ConfirmSheet.tsx   — themed confirm / destructive bottom sheet
```

### 3.1 The state contract — `ScreenState.ts`

```ts
export type ScreenState =
  | { kind: 'loading' }
  | { kind: 'refreshing' }
  | { kind: 'empty'; reason: 'firstRun' | 'filtered' }
  | { kind: 'partial'; staleAt: number }
  | { kind: 'error'; cause: 'network' | 'auth' | 'notFound' | 'server' | 'timeout' }
  | { kind: 'offline' }
  | { kind: 'locked'; reason: 'pro' | 'guest' | 'module' }
  | { kind: 'denied'; permission: 'notifications' | 'camera' | 'calendar' | 'photos' }
  | { kind: 'ready' };
```

**Contract:** screens *declare* a state; they never *compose* one. All rendering
decisions — which scene tier, which hue, which copy key, which actions — live in
`StateView`. A screen's state code becomes:

```tsx
const state = useScreenState({ data, error, loading, refreshing, filtersActive });
if (state.kind !== 'ready') return <StateView state={state} onRetry={refetch} />;
```

`useScreenState()` derives the union from the flags screens already track, so
adoption does not require touching data logic. `empty:firstRun` vs
`empty:filtered` is disambiguated by the `filtersActive` input — the distinction
that today does not exist anywhere in the app.

### 3.2 Design tokens — `stateTokens.ts`

Extends `onboardingTokens.ts` with the same per-concept hue idea already proven
in the onboarding flow (discover/blue, match/green, coach/amber, deadlines/rose):

| State | Hue role |
|---|---|
| `empty:firstRun` | the owning flow's hue (discovery blue, goals green, …) |
| `empty:filtered` | neutral slate — a filter result is not a failure |
| `error` | rose |
| `offline` | slate |
| `locked` | violet |
| `denied` | amber |
| `success` | emerald |

Every value resolves through `useTheme().colors` and `useTheme().isDark`. No
hex literal appears in any state component — this is what makes all 18 palettes
correct by construction rather than by inspection.

---

## 4. Illustration system — three tiers

Nobody hand-animates 40 distinct scenes. The tiers allocate effort to the
moments that decide retention.

### Tier 1 — Hero scenes (8)

Full `SlideVisuals`-grade animated compositions, one file each in
`components/state/scenes/`. Reserved for:

1. Home first-run (nothing personalized yet)
2. Zero opportunities matched
3. Zero saved
4. Zero goals / no roadmap
5. Offline
6. Hard error (server/timeout)
7. Pro gate
8. Celebration / milestone

Each is built from RN views + glyphs + Reanimated + gradient/glass, hue-driven,
and gated on `useReducedMotion()`.

### Tier 2 — `StateScene.tsx` (~20 states)

One parameterized primitive:

```tsx
<StateScene
  arrangement="orbit" | "stack" | "scatter" | "pulse" | "scan"
  glyphs={[…]}            // lucide or hugeicons (per-subpath imports only)
  hue={token}
  size={…}
/>
```

Configured per state rather than authored per state. Delivers most of the visual
impact at a fraction of the cost, and every instance is theme-reactive and
entry-animated.

### Tier 3 — `IconTile.tsx` (~15 states)

A refined glyph tile for low-stakes inline slots (collapsed sections, admin
tables). Themed and entry-animated, but no composed scene.

### 4.1 Icon discipline

`components/ui/icons.ts` already documents the rule: Hugeicons must be imported
per-subpath (`@hugeicons/core-free-icons/CompassIcon`), never from the package
root, because the root barrel is a single ~6.2 MB module and Metro does not
tree-shake it. **All new icon imports follow this rule.** Hugeicons remains
reserved for Edutu's own voice (the AI read, assist actions, decision strip);
the rest of the state system stays on `lucide-react-native`.

### 4.2 Removals

`EmptyState.tsx`, `LottieState.tsx` and `LottieRefresh.tsx` are absorbed and
**deleted**, not deprecated — a dead primitive left in place is a decoy that
gets adopted by the next screen. Their two current consumers
(`app/(app)/index.tsx`, `app/(app)/saved/index.tsx`) migrate to `StateView`.
The four Lottie JSONs under `assets/lottie/` are dropped from the bundle.

`LoadState.tsx`, `Skeleton.tsx` and `BrandedLoader.tsx` are retained;
`StateView` renders skeletons for `loading` where a screen has a known shape and
`BrandedLoader` where it does not.

---

## 5. Feedback layer — four surfaces, one façade

### 5.1 Routing policy

| Class | Surface | Behavior |
|---|---|---|
| Routine success, reversible action | **Toast** | non-blocking, optional Undo, light haptic |
| Operation failure | **Inline recovery** | renders at the point of failure; the triggering button becomes a retry |
| Confirm (21) and destructive (11) | **`ConfirmSheet`** | themed bottom sheet; destructive never gets default focus; warning haptic |
| Milestone | **`SuccessDialog`** | illustration + celebration; milestones only |

**Milestones are:** roadmap created, application submitted, payment succeeded,
Pro unlocked, goal completed, CV exported. Everything else that currently raises
a success alert becomes a toast. A dialog that fires on every save stops meaning
anything.

### 5.2 The façade — `lib/feedback.ts`

A single `notify()` entry point that routes by class:

```ts
notify.success({ message, undo? })
notify.failure({ message, retry, anchor })   // resolves to inline recovery
notify.confirm({ title, body, confirmLabel, destructive? }): Promise<boolean>
notify.milestone({ kind, title, body })
```

This is what makes 193 call sites tractable: each migration is a one-line
substitution, and the routing policy lives in one file that can be revised
later without touching 30 screens.

### 5.3 Component work

- **`ToastContext`** gains: action button (Undo/Retry), leading icon, haptic,
  and a queue (today a second toast clobbers the first).
- **`InlineError.tsx`** — themed error strip + retry affordance, sized for both
  full-section and inline-row use.
- **`ConfirmSheet.tsx`** — matches the existing sheet family (`UpgradeSheet`,
  `CreditPackSheet`, `CoverLetterSheet`, `AITailorModal`), so it is a native
  idiom rather than a new one.
- **`SuccessDialog.tsx`** — already built with 11 kinds; wired up and restricted
  to the milestone list.

---

## 6. Motion & haptics

### 6.1 `lib/motion.ts`

Shared durations, easings, springs, and a 40ms stagger for list/section entry.
**Every export is gated on `useReducedMotion()`**, so honoring the setting is the
default rather than something each screen must remember. This closes the gap
where `reducedMotion` exists in `ThemeContext` but only 16 files consult it.

### 6.2 `lib/haptics.ts` — existing, unchanged

Already implemented and adopted in 19 files. It exposes
`light · medium · heavy · selection · success · warning · error`, mirrors the
persisted `hapticsEnabled` Settings flag in memory so each call is a cheap
synchronous check, and is fire-and-forget so a haptic can never throw into the
UI.

**No new module.** The state and feedback layers import it and apply this
mapping:

| Token | State-system trigger |
|---|---|
| `selection` | filter chip, tab, segmented control |
| `light` | card press, list row |
| `medium` | sheet open, retry pressed |
| `success` | milestone dialog presented |
| `warning` | destructive confirm presented |
| `error` | operation failure surfaced |

---

## 7. Coverage — every screen, 8 flows

All 56 rendering screens are assigned a tier and a state set. (The repo's 60
`.tsx` files under `app/` include four `_layout.tsx` route layouts, which render
no states and are out of scope.) Consumer surfaces get Tiers 1–2; admin gets
Tier 3.

| Flow | Screens | Tier |
|---|---|---|
| **Onboarding & auth** | `index`, `get-started`, `onboarding-welcome`, `onboarding`, `invite`, `(auth)/sign-in`, `(auth)/sign-up`, `(auth)/reset-password` | 1–2 |
| **Home & discovery** | `(app)/index`, `opportunities/index`, `opportunities/featured`, `saved-searches` | 1 |
| **Opportunity & apply** | `opportunities/[id]`, `opportunity/[id]`, `opportunities/submit`, `opportunities/submissions`, `copilot/[id]`, `applied`, `my-opportunities` | 1–2 |
| **Saved, applied, deadlines** | `saved/index`, `deadlines` | 1–2 |
| **Goals & roadmaps** | `goals/index`, `goals/add`, `goals/[id]`, `goals/my-list`, `goals/all-roadmaps`, `goal/[id]`, `roadmaps`, `roadmap/[id]`, `roadmap-templates/index`, `roadmap-templates/[id]` | 1–2 |
| **AI coach & CV** | `chat`, `cv/index`, `profile/documents`, `feature/[id]` | 1–2 |
| **Profile, settings, money** | `profile/index`, `profile/edit`, `profile/view`, `profile/settings`, `profile/security`, `wallet`, `referrals`, `paywall`, `notifications`, `help`, `contact`, `privacy`, `creator-apply`, `creator-dashboard`, `mentor-apply` | 2–3 |
| **Admin** | `admin/creator-applications`, `admin/pricing`, `admin/app-control`, `admin/testimonials`, `admin/premium-features`, `admin/roadmap/create` | 3 |

The 50 screens currently using no state primitive are all covered here.

### 7.1 Gated-state consolidation

`ModuleLockOverlay`, `AuthWallContext` and the Pro gate currently present three
different locked experiences. All three route through
`StateView state={{ kind: 'locked', reason }}` so a user meets one locked
language regardless of why they were stopped. The underlying gating logic is
unchanged — only the presentation is unified.

---

## 8. Guardrails

Without mechanical enforcement, screen 61 reintroduces the problem. Added to
`eslint.config.js`:

1. **`no-restricted-imports` / `no-restricted-syntax`: `Alert.alert` is banned.**
   Error-level, no exemptions.
2. **Raw `ActivityIndicator` is banned** outside `components/state/` and
   `components/ui/BrandedLoader.tsx`.
3. **Hex colour literals are banned inside `components/state/`** — every colour
   must come from `useTheme()` or `stateTokens`.

`npm run lint` already runs with `--max-warnings 0` and is CI-gated, so these
land as hard failures.

---

## 9. Testing

- **Per-state render tests** for `StateView` — every `kind`/`reason`/`cause`
  variant renders its expected scene, copy and actions.
- **Theme matrix smoke test** — `StateView` renders across all 9 packages × 2
  modes (18 palettes) without a hardcoded colour leaking through.
- **Reduced-motion assertion** — with `reducedMotion: true`, `motion.ts`
  returns zero-duration animations and no scene starts a repeating loop.
- **Feedback routing tests** — `notify.*` dispatches to the correct surface.
- **Migration guard** — a repo-wide test asserting zero `Alert.alert`
  occurrences, so the count cannot creep back.

Existing Jest config already roots `components/`, `lib/`, `app/` and
`constants/`, so no harness changes are required.

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| 193 call-site migration is large and touches 30 files | The `notify()` façade makes each site a one-line change; the lint ban proves completeness |
| Concurrent sessions share this working tree | Migrate flow-by-flow in small commits; never `git stash` (see project memory) |
| Tier 1 scenes are expensive to author | Only 8 exist; Tier 2 absorbs the long tail |
| Animation cost on low-end Android | All scenes Reanimated-worklet driven, entry-only where possible, loops confined to Tier 1 and gated on reduced-motion |
| Success alerts demoted to toasts may feel like a downgrade | Milestone list is explicit and reviewable in §5.1 |
| Deleting `EmptyState`/`LottieState` breaks 2 consumers | Both migrate in the same commit as the deletion |

---

## 11. Sequencing

1. **Foundation** — `stateTokens`, `ScreenState`, `motion`, `haptics`, `feedback`
2. **Primitives** — `StateView`, `StateScene`, `IconTile`, `InlineError`,
   `ConfirmSheet`, Toast upgrade, `SuccessDialog` wiring
3. **Tier 1 scenes** — the 8 heroes
4. **Flow migration** — one flow per commit, in the §7 order (highest-traffic
   first: home & discovery → opportunity & apply → saved/deadlines → goals →
   AI/CV → profile/money → onboarding/auth → admin)
5. **Removals** — delete absorbed primitives and Lottie assets
6. **Guardrails** — enable the three lint rules once the count reaches zero
7. **Tests** — per §9

Detailed task breakdown belongs to the implementation plan, not this spec.
