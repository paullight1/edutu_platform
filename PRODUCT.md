# Product

## Register

**Product** — Edutu is an app UI (mobile + web) where design serves the task: discovering opportunities, planning applications, coaching via AI. Marketing surfaces (landing page, blog) flip to brand register per task.

## Users & Purpose

- **Who**: Ambitious young people (17–28), primarily in African markets, on mid-range Android and iOS devices, often on unstable connections. They juggle school/work and use Edutu in short, purposeful sessions.
- **Job to be done**: Find real scholarships/internships/fellowships, understand fit, plan and execute applications before deadlines, and get personal AI coaching (chat, voice, CV, roadmaps).
- **Workflow context**: Task-driven; speed and clarity beat spectacle. Offline resilience matters. AI moments (chat, voice mode, match insights) are the product's signature and may be more expressive.

## Brand Personality

Encouraging, credible, sharp. A trusted older-sibling mentor — warm but never childish, ambitious but never corporate-cold. Three words: **empowering, focused, modern**.

## Visual System (established — do not reinvent)

- Accent: indigo `#6366F1` family (dark-mode accent lift `#A5B4FC`); deep navy field `#020617`/`#0F172A` for dark surfaces and brand moments.
- Mobile: theme packs via `ThemeContext` (`colors.*` tokens, `isDark`), glass/blur bottom nav (Liquid Glass on iOS 26+, BlurView fallback), lucide icons, rounded-continuous corners, reanimated for motion.
- Web: CSS-var theme tokens (`bg-surface-*`, `text-text-*`, `border-subtle`, `text-brand`), Tailwind `darkMode: 'class'`.
- Typography: system sans, fixed rem/pt scale, weights 600–900 for hierarchy.

## Anti-references

- Generic SaaS gradient-splash dashboards; hero-metric cards everywhere.
- Childish gamification aesthetics (Duolingo-owl energy) — Edutu users are preparing for real stakes.
- Over-decorated AI "magic sparkle" clutter; AI surfaces should feel calm and capable (ChatGPT/Gemini voice-mode restraint), not carnival.

## Accessibility

- Respect `reducedMotion` and `highContrast` from ThemeContext on mobile; `prefers-reduced-motion` on web.
- Body text contrast ≥ 4.5:1 in both themes; accessibility labels on all icon-only controls; i18n across 9 languages (RTL for Arabic).
