# Edutu Design System

The Edutu experience is anchored in a mobile-first, high-clarity design language inspired by modern productivity apps such as Linear, Arc, and Notion. The system balances an expressive brand personality with interface calm that keeps learners focused and confident across light and dark themes.

## Design Principles

1. **Momentum by default** – Every surface should make progress tangible with clear hierarchy, motion that guides, and contextual cues that reduce friction.
2. **Confident calm** – Favour soft layers, generous breathing room, and rounded geometry that feels trustworthy on handheld devices.
3. **Human + AI harmony** – Blend expressive gradients and accent cues with neutral surfaces so that AI guidance and human community coexist without visual noise.
4. **Touch-first ergonomics** – Components respect thumb reach and include large tap areas, consistent spacing tokens, and safe-area handling.
5. **Accessible continuity** – Light and dark modes share the same semantic tokens, providing predictable contrast and state cues.

## Foundations

### Color Tokens

| Token | Description | Light | Dark |
| ----- | ----------- | ----- | ---- |
| `--color-brand-*` | Primary violet brand ramp used for highlights, CTAs, and focus rings | Vibrant indigo ramp (50 → 950) | Mirrored ramp automatically inverted through CSS variables |
| `--color-accent-*` | Warm secondary ramp for gradients, progress, and celebratory moments | Tangerine ramp (50 → 950) | Same ramp for consistency |
| `--color-neutral-*` | Neutral base surfaces and text (0 → 950) | Slate-inspired neutrals | Inverted ramp for dark mode legibility |
| `--surface-*` | Surface stack controlling depth | `body`, `layer`, `elevated`, `brand`, `overlay` | Each token switches values in `.dark` mode |
| `--text-*` | Semantic text colors (`primary`, `secondary`, `muted`, `inverse`, `link`) | Derived from neutral ramp | Automatically inverted |
| `--border-*` | Border states (`subtle`, `default`, `strong`, `focus`) | Soft blues/slates | Deep slates with luminous focus rings |

The Tailwind configuration consumes these CSS variables, letting you write `bg-surface-layer`, `text-soft`, `border-subtle`, `bg-brand-600`, etc. You get automatic dark-mode parity because the underlying CSS variables switch within `.dark`.

### Typography

- **Primary families:** `Outfit` for display headlines, `Inter` for body text, `JetBrains Mono` for code states (if needed).
- **Scale:** XS (12/16), SM (14/20), Base (16/24), LG (18/28), XL (20/30), 2XL (24/32), 3XL (30/36), 4XL (36/42).
- **Letter-spacing:** Tight headlines at `-0.02em`; normal body copy at `0`; supporting uppercase at `0.08em`.
- **Weights:** `400` (regular), `500` (medium), `600` (semibold), `700` (bold). Headlines sit at 600 to keep a softer tone.

### Spatial System

- **Spacing tokens:** `xs` 4px, `sm` 8px, `md` 16px, `lg` 24px, `xl` 32px, `2xl` 48px. Most vertical rhythm uses multiples of 8 for mobile ergonomics.
- **Radii:** `xs` 6px, `sm` 8px, `md` 12px, `lg` 16px, `xl` 24px, `pill` full radius. Cards default to 16px or 20px depending on density.
- **Elevation:** Soft shadows rely on CSS custom properties (`--shadow-soft`, `--shadow-elevated`, etc.) so dark mode receives richer depth without harsh contrast.
- **Motion:** `--transition-fast` (120ms), `--transition-medium` (200ms), `--transition-slow` (320ms) all use a `cubic-bezier(0.4, 0, 0.2, 1)` ease for fluidity.

### Iconography

Lucide icons supply crisp, consistent line-art. Icons are sized at 16, 18, or 24px depending on context. Icon buttons retain a 48px hit target for touch comfort.

## Components & Patterns

### Buttons

- Base class handles focus states, disabled behavior, and subtle scale feedback.
- Variants:
  - `primary`: brand-filled with inverse text.
  - `secondary`: neutral surface with brand outline hover.
- Sizes: `sm`, `md`, `lg`. Large CTA buttons are used for onboarding and hero moments.

### Cards

- Default card uses `bg-surface-layer`, `border-subtle`, and `shadow-soft`.
- Hover states elevate to `shadow-elevated`.
- Cards are the workhorse for dashboard modules, feature tiles, testimonials.

### Screen Shell

- Each screen wraps content in `min-h-screen bg-surface-body text-strong transition-theme`.
- Padding defaults to `px-4` with safe bottom spacing for navigation overlays.
- Mobile-first: layout stacks by default and expands to grid/flex on `md` or `lg` breakpoints.

### Form Elements

- Inputs default to pill-shaped (12px radius) with border-subtle outlines.
- Focus states adopt brand focus rings (`--shadow-focus`) for accessibility.
- Icons inside inputs sit at `px-4` using absolute positioning, keeping copy aligned.

### Navigation

- Bottom navigation uses `bg-surface-layer`, soft borders, and brand highlights for the active state.
- Buttons adopt pill silhouettes to mimic modern mobile nav bars (Vision OS / iOS inspiration).

## Theme Behaviour

Dark mode is controlled through `useDarkMode`, persisting the choice in `localStorage` and toggling the `.dark` class on both `html` and `body`. All color evaluations reference CSS variables, guaranteeing parity between themes without component-level overrides.

## Implementation Notes

- **Tailwind config:** exposes semantic colors (`brand`, `accent`, `surface`, `text`, `border`, `success`, `warning`, `danger`, `info`) using the `withOpacity` helper so utilities can include transparency (e.g. `bg-brand-600/10`).
- **Global CSS:** sets up CSS variables for light and dark modes, typography defaults, scrollbar styling, and focus handling.
- **Tokens file (`src/design-system/tokens.ts`):** stores the canonical definition of palettes and spatial scales. Useful as the source of truth for future native/mobile clients.

## Usage Guidelines

1. **Prefer semantic tokens** – Reach for `bg-surface-layer`, `text-soft`, `border-subtle`, `text-muted` instead of hard-coding grays and hex values.
2. **Compose with utility primitives** – Combine Tailwind utilities purposefully; avoid long chains of ad-hoc colors.
3. **Respect spacing rhythm** – Start with `py-6 px-4` for mobile containers and scale up at breakpoints (`md:px-6`, `lg:px-8`).
4. **Preserve tap targets** – Buttons and interactive elements must provide at least `min-h-[44px]` and `min-w-[44px]`.
5. **Elevate sparingly** – Use `shadow-elevated` for the hero card, modals, and floating actions. Default to `shadow-soft`.
6. **Adopt gradients intentionally** – Brand/accent gradients highlight hero CTAs, weekly snapshot cards, and celebration states.

## Next Steps

- Continue migrating legacy components off direct `bg-gray-*` classes to semantic tokens.
- Build a shared `Screen` layout component to encapsulate safe-area padding and scrolling for mobile.
- Extend tokens to support status chips (`info`, `success`, `warning`) and chart palettes as more analytics modules ship.
- Derive a Figma library from these tokens for cross-platform consistency.

Keeping the system codified here ensures the Edutu experience remains cohesive as new features ship rapidly across platforms. Designers and engineers should treat this document as the living source of truth. Update it whenever tokens, foundations, or component patterns evolve.
