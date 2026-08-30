# Edutu Mascot Library — Implementation Plan

**Goal:** turn the existing Edutu illustration/mascot direction into a reusable branded character system for social media and product communications.

## Deliverables

- root `/mascots` directory
- 96 unique character variants across 12 categories
- editable SVG master per asset
- transparent 1200×1200 PNG export per asset
- searchable manifest and browsing catalog
- visual DNA/style guide
- deterministic generator/verifier
- contact sheet, complete download pack, SVG pack and category PNG packs

## Verification

Generation must fail verification if asset count/category count changes unexpectedly, an SVG cannot be parsed, a PNG is not 1200×1200 with alpha, or packs are incomplete.

## Delivery

Changes live on `feat/mascot-library`. GitHub Actions materializes the generated assets into the same branch after the tested generator changes. `main` remains untouched until review/merge.
