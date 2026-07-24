# Edutu — Design System

The system of record for how Edutu looks and moves. Derived from the shipped
code (`edutumobile`, `edutu-web-app`, `admin`), not aspiration.
Register: **product** — design serves the task (see PRODUCT.md).

> Replaces a Webflow-derived scaffold that shipped in the initial commit and
> described a different product entirely.

---

## 1. Foundations

### Color

Theme is **runtime-switchable**, not static: `ThemeContext` exposes
`colors.*`, `isDark`, `reducedMotion`, `highContrast`, plus 9 color packs
(default **Ocean Breeze**). Never hardcode a hex a token covers.

| Role | Token | Default |
|---|---|---|
| Accent (actions, selection, state) | `colors.accent` | `#6366F1`, lifted to `#A5B4FC` on dark |
| App field | `colors.background` | navy `#020617` → `#0F172A` / near-white |
| Raised surface | `colors.card` | white 3% on dark / `#FFFFFF` |
| Hairline | `colors.border` | `#1E293B` / `#E2E8F0` |
| Ink | `textPrimary` / `textSecondary` | ≥4.5:1 in both themes |

Strategy: **Restrained** by default — accent carries primary actions, current
selection, and state only. **Committed** is earned by exactly two surfaces:
AI moments (coach, tailoring) and celebrations (Pro, streaks, goal complete).
Nothing else gets a saturated field.

Semantics are fixed: deadlines use the urgency ramp (`urgencyColor(level)`,
green → amber → red), success green, destructive red. Fit is expressed as
**tiers, not raw percentages** (`MATCH_TIER_KEY`) — a percentage reads as
win-odds and erodes trust.

### Typography

One system sans, fixed pt scale (no fluid clamps — RN, consistent DPI).
Steps: 11 (tab label) · 13 (meta) · 15 (body) · 17 (row title) · 20–24
(screen title) · 28+ (moment). Weights 600–900 carry hierarchy; 900 is
dark-mode-only for brand marks (dark-on-light reads heavier at equal weight).
`numberOfLines` on every string that can grow — titles 2, meta 1.

### Shape & depth

Radius 16 (cards) · 22–33 (pills/bubbles) · 999 (full), always with
`borderCurve: "continuous"`. Depth comes from the glass stack and hairlines,
not heavy shadows; the one deep shadow in the system is the floating nav pill.

### Icons

**lucide-react-native**, one family, no exceptions. Sizes 9 (badge) · 14
(inline) · 16–18 (row) · 24 (tab) · 30–34 (empty-state hero). Icon-only
controls **require** `accessibilityLabel`. Empty states get a 30–34pt icon at
~50% opacity — never a bare sentence.

---

## 2. Motion

Reanimated. Product discipline: **motion conveys state, never decorates.**
150–250 ms for transitions; springs for physical objects.

| Situation | Spec |
|---|---|
| List entrance | `FadeInDown.delay(index * 60).duration(350).springify()` — stagger within one list only |
| Physical objects (nav pill, sheets, rings) | `withSpring({ damping: 20–26, stiffness: 210–230 })` |
| Press feedback | `AnimatedPressable` scale 0.94–0.97 + `haptics` |
| Value change | `AnimatedCounter`, never an instant number swap |
| Loading | Skeleton or `BrandedLoader` in place — never a spinner floating in content |

`reducedMotion` is honored per component (static end-state). No orchestrated
page-load sequences: the app loads into a task.

---

## 3. Component vocabulary

Use these before inventing anything.

- `AnimatedPressable` — every tappable surface larger than an icon
- `EmptyState` — teaches the interface: big icon + one line + one CTA
- `BrandedLoader` / skeletons — loading
- `AnimatedCounter`, `ProgressBar`, `Badge`, `Card`, `GlassView`
- `CvModalBackdrop` — blurred + dimmed scrim, tap-to-dismiss (the pattern
  every overlay should adopt)
- `haptics` façade — respects the Settings toggle; never call Haptics directly

**Every interactive component ships default / pressed / disabled / loading /
error.** Half-built states are the most common review rejection.

### Navigation

Four tabs (Home · Discover · Plan · Me) plus one contextual circle that morphs
per tab (AI / Create / Edit). Four nav styles are user-selectable; the default
floating **glass pill** compacts 66→48pt on scroll-down and restores on
scroll-up (`lib/navScrollStore.ts`) — labels fade before height collapses.

---

## 4. Content rules

- **Fit, not odds**: tier language over match percentages.
- **Never fabricate user facts.** AI surfaces ask ("How much time did that
  save?") rather than invent. Product integrity, not style.
- **Deadlines are relative** ("12d left", "Today", "Closed") on the urgency
  ramp; absolute dates are secondary.
- **Errors are human** — no raw JSON, no Postgres codes in user-facing copy.
- i18n across 9 languages; keys live in `lib/i18n/locales/en/*` (others fall
  back to en), Arabic is RTL. No user-visible string is hardcoded.
- Exports use human filenames: `{Full Name} - CV - {Org}.pdf`.

---

## 5. Known debts (fix on contact)

Honest list — these are why the app can read generic despite good bones.

1. **Card monoculture.** Home stacks category tiles → featured card →
   quick-action cards → best-shot cards → recommended cards. Identical card
   grids are a banned pattern. Vary the affordance: rails, list rows,
   full-bleed editorial blocks, inline sections.
2. **Modal reflex.** Tailoring picker, tailor result, AI draft, LinkedIn
   import, template preview, coach sheet. Most are content, not interruption —
   they should be screens or inline sections. Exhaust inline before modal.
3. **Hero-metric moment.** The tailor result (big ring number + supporting
   stats + gradient field) is the canonical SaaS cliché sitting on our most
   important AI surface. Rebuild around the *checklist* — the actionable
   content — with the score as a quiet supporting signal.
4. **Text-dense opportunity detail.** The screen users spend the most time on
   is a wall of prose with weak hierarchy and little scannable structure.
5. **Vocabulary drift.** CV screens grew private toast/sheet/backdrop
   components; Home/Discover/Profile style rows three different ways. Promote
   the good ones into `components/ui/` and converge.
