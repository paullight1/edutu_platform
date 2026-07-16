# Product

## Register

product

> Note: `/`, `/about`, `/impact`, `/download`, `/blog` and other public pages are brand-register marketing surfaces; the `/app/*` workspace is the product register. Default is product; treat marketing routes as brand per task.

## Users

Young, ambitious people — primarily African students and early-career talent (16–30) — hunting for scholarships, fellowships, internships, grants, and global programs. Often on mid-range Android phones over patchy data; many discover Edutu through shared opportunity links on WhatsApp/Instagram. Their job-to-be-done: find opportunities they actually qualify for, keep deadlines from slipping, and get help applying.

## Product Purpose

Edutu is an AI opportunity coach: a personalized feed of verified opportunities (scraped + curated), deadline tracking, application co-pilot, CV tools, roadmaps, and an AI coach. Success = users discovering opportunities they'd have missed and submitting applications on time. Web app is a PWA (installable), with native mobile apps (Expo) heading to the stores.

## Brand Personality

Hopeful · ambitious · trustworthy. The voice of a coach who believes in you and is serious about outcomes — optimistic energy without hype, safe with your future. Never corporate-cold, never influencer-loud.

## Anti-references

- Generic SaaS landing-page grammar: uppercase tracked eyebrows over every section, identical icon-card grids, gradient text, hero-metric templates.
- Scholarship-scam aesthetics: flashing urgency, fake counters, too-good-to-be-true promises. Trust is the currency.
- Western-default imagery that ignores who the users actually are.

## Design Principles

1. **Committed brand blue is the identity.** The token system (`--color-brand-*`, Outfit, surface/text/border tokens, dark mode + theme packs) already exists — extend it, never fork it.
2. **Fast on cheap phones.** Design for mid-range Android on 3G: light payloads, no decorative bloat, offline-tolerant.
3. **Every claim is real.** Live counts over vanity metrics, honest "coming soon" over fake badges, real deadlines over manufactured urgency.
4. **The opportunity is the hero.** UI serves discovery — imagery and layout should showcase actual product value (feeds, deadlines, matches), not abstractions.
5. **Warmth through type and copy, not clutter.** One typeface (Outfit), confident scale contrast, human copy.

## Accessibility & Inclusion

WCAG 2.1 AA: body text ≥4.5:1, visible focus states, full keyboard paths, `prefers-reduced-motion` alternatives for all animation. Dark mode is first-class (class-based, token-driven). Copy in plain English (i18n exists on mobile; web is English-first). Touch targets ≥44px on marketing and app surfaces alike.
