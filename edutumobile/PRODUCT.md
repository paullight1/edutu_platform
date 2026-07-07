# Product

## Register

product

## Users

Ambitious students and young professionals (strong African/emerging-market focus) hunting scholarships, fellowships, internships and grants. They check Edutu on their phone between classes and work — short, glanceable sessions where a missed deadline is the worst possible outcome. Home-screen widgets are their earliest-warning surface: seen dozens of times a day without opening the app.

## Product Purpose

Edutu finds, ranks and tracks life-changing opportunities for each user (personalized match scores, deadline tracking, AI guidance, application roadmaps). Success = users discover the right opportunity early enough to apply well. The widget suite exists to surface the top match, the nearest deadlines, and what's trending — at a glance, always current, one tap from action.

## Brand Personality

Aspirational, trustworthy, energetic. "Your ambitious friend who knows about every scholarship." Deep navy (#171A4F) and brand blue (#3563E9) carry trust; the logo's teal→amber gradient arrow carries upward momentum. Voice is direct and encouraging, never bureaucratic.

## Anti-references

- Generic RSS-ticker widgets (grey text on white, no hierarchy, no identity).
- Corporate LMS / government-portal aesthetics (Edutu is the opposite of a bureaucracy).
- Loud gamification (badges, confetti, streak-shaming). Urgency comes from real deadlines, not manufactured pressure.
- Wordmark-stamped branding — the logo mark alone identifies Edutu on widgets; never the word "Edutu" as a label.

## Design Principles

1. **A missed deadline is a design failure.** Deadline recency/urgency is the primary visual signal everywhere; countdowns must always be current.
2. **Glanceable in one second.** One clear hero fact per size; detail scales with widget area, never crowds it.
3. **The logo is the brand.** The mark (transparent `assets/logo1.png`) appears once per widget; no "Edutu" text labels.
4. **Native-adaptive.** Widgets follow the phone's light/dark theme; navy is the dark surface, white the light one; urgency colors (red/amber/green) are identical across iOS, Android, and the in-app deadline system (`packages/core/src/utils/deadline.ts`).
5. **Every pixel is a tap target.** Widgets always deep-link somewhere specific (opportunity detail, deadlines list, chat) — never dead ends.

## Accessibility & Inclusion

Text contrast ≥ 4.5:1 on both navy and white surfaces. Urgency never encoded by color alone (always paired with countdown text). Minimum widget text 11pt/sp. System font stacks (SF/Roboto) for legibility at small sizes.
