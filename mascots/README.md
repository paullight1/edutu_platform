# Edutu Mascot Library

A reusable mascot system for Edutu product, social media, campaigns, opportunity announcements and community communications.

## What is here

- **96 individual mascot masters** in `characters/`.
- **12 persona/use-case categories**: students, graduates, developers, creators, entrepreneurs, mentors, researchers, opportunities, scholarships, community, career and reactions.
- Transparent, editable **SVG masters** designed at a 1200×1200 square artboard.
- Social-ready transparent **PNG exports** generated at 1200×1200.
- `manifest.json` for programmatic search/filtering.
- `CATALOG.md` and a contact sheet for fast browsing.
- Download packs under `exports/packs/`, including one complete pack and smaller category PNG packs.
- Deterministic generator and verifier under `tools/`.

## Use

Choose a mascot by persona + action + emotion. Filenames are predictable:

`edutu-{persona}-{action}-{emotion}.svg`

Examples: `edutu-student-reading-happy.svg`, `edutu-developer-laptop-focused.svg`, `edutu-scholarship-certificate-proud.svg`.

For social posts, use the transparent PNG export. For Canva/Figma/web or future edits, use the SVG master.

## Rebuild

```bash
python mascots/tools/generate_mascots.py
python mascots/tools/verify_assets.py
```

Requires Python, CairoSVG and Pillow for PNG/contact-sheet export. The SVG masters themselves have no runtime dependency.

## Brand rule

Variation is encouraged in people, hair, skin tone, clothes, props, pose and emotion. Do **not** introduce unrelated illustration systems. New characters should retain the shared Edutu visual DNA documented in `reference/style-guide.md`.
