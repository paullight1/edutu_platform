# Opportunity Share Completion — Design

**Date:** 2026-07-22
**Status:** Approved (design), pending spec review

## Problem

When a user shares an opportunity, the result is often incomplete:

1. **Thin share text.** Opportunities with sparse `metadata` produce a share
   message missing the fields that matter — benefits, eligibility, and sometimes
   the deadline. Example of a weak share (real): a scholarship whose shared text
   only carried Type + Deadline, with no benefit/eligibility, so the reader
   couldn't judge whether it was worth pursuing.
2. **Generic preview image.** Links (`edutu.org/opportunity/<id>`), *especially
   when shared from the web app*, unfurl with the generic Edutu icon instead of
   the real application flyer or an opportunity-specific card.

## Goals

- Every shared opportunity reads as complete: benefits and eligibility are always
  present (grounded, never fabricated), deadline is honest.
- Every `edutu.org/opportunity/*` link unfurls with an opportunity-specific
  image — the source flyer when it exists, otherwise the opportunity's own
  branded 4:5 card. **Never the generic Edutu icon** (except true failure).

## Non-goals

- No batch backfill of existing opportunities in this pass (on-demand only).
- No change to the scraper's image-claiming logic.
- No new share entry points; we improve the existing web/mobile/backend flow.

## Current system (as-is)

- **Canonical share text:** `backend/.../opportunities/opportunity-share-text.ts`
  → `buildOpportunityShareText(opportunity, shareUrl)`. Emits `*title*`, summary,
  conditional fact rows (Type/Duration/Audience), an **always-on** `*Deadline:*`
  row, `*What You'll Gain:*` bullets, then `*Apply here:*` + url. Web
  (`edutu-web-app/src/services/opportunityShare.ts`) and mobile
  (`edutumobile/lib/shareOpportunity.ts`) call the backend and prefer its
  `shareText`; their local builders are fallbacks only.
- **Branded card:** `backend/.../opportunities/opportunity-share-card.service.ts`
  → `OpportunityShareCardService`. 1080×1350 (4:5) SVG→PNG, cached in Supabase
  Storage bucket `opportunity-share-cards`, stored at `metadata.share_card`.
  `ensureImageFallback` backfills `image_url` to the card when no real image.
- **OG unfurl:** `edutu-web-app/netlify/edge-functions/opportunity-og.ts`
  (route `/opportunity/*`) and backend `og.controller.ts`. Image priority ends in
  `DEFAULT_IMAGE = ${SITE}/icons/icon-512x512.png` — this is the generic icon the
  user is seeing.
- **Data shape:** `opportunities` columns are `title, summary, description,
  category, organization, location, application_url, image_url, eligibility jsonb,
  stipend, currency, open_date, close_date, metadata jsonb, ...`. `benefits`,
  `requirements`, `duration`, `target_audience`, `source_image_url`, `share_card`
  live inside `metadata`. `deadline` == `close_date`.

## Part A — AI text completion

### Trigger & caching

- Runs inside the backend share path (share-card build / share-text build), so
  web, mobile, and OG all benefit from one enrichment.
- **On-demand only.** First time an opportunity is shared, if it is missing any of
  `benefits`, `eligibility`, or `summary`, run one AI enrichment call.
- Cache the result at `metadata.ai_enriched = { summary?, benefits?, eligibility?,
  model, sourceHash, createdAt }`. `sourceHash` is a hash of the grounding inputs
  (`title|summary|description|organization`). Skip the AI call when a cached
  `ai_enriched` exists whose `sourceHash` matches. One AI call per opportunity,
  reused everywhere.
- Enrichment failures are swallowed (log + proceed with whatever real data
  exists) — sharing must never break because AI was slow/unavailable.

### What the AI fills

- **Only genuinely missing fields.** Real existing `benefits`/`eligibility`/
  `summary` are never overwritten.
- Grounded **strictly** in `title + summary + description + organization`. The
  prompt instructs: derive only from the provided text; if a field cannot be
  grounded, return it empty rather than guessing.
- Output shape: `summary` (1–2 sentences), `benefits` (2–4 concise bullets),
  `eligibility` (2–4 concise bullets). Validated with Zod; nulls stripped before
  parse (existing `stripNulls` pattern).
- Provider: reuse the existing AI routing (DeepSeek default per `ai_routes`);
  add a route key so it can be overridden from the DB later.

### Deadlines — hard guardrail

- **AI is never asked for a deadline.** The deadline is only ever the real
  `close_date`.
- When `close_date` is absent, the share text and card **omit the deadline row
  entirely** (no "Rolling", no fabricated date). `buildOpportunityShareText` and
  the card's fact grid change from always-on Deadline to conditional.

### Merge

- Share text, branded card, and OG all read
  `field ?? metadata.benefits ?? metadata.ai_enriched.benefits` (real data first,
  AI last). This ordering guarantees AI only ever fills blanks.

## Part B — Preview image never generic

Change the image resolver in **both** `opportunity-og.ts` (Netlify edge) and
backend `og.controller.ts` to this priority for every `/opportunity/:id`:

1. `metadata.source_image_url` / `source_image_url` (real application flyer)
2. → `image_url` / `imageUrl`
3. → `share_image_url` / `metadata.share_card.url`
4. → **branded 4:5 card, generated on demand if missing** (call/ensure the
   share-card service so a card always exists)
5. → generic icon **only** if card generation itself fails (true last resort)

The current code stops at step 3 then jumps to the icon; the fix is to *ensure*
the card exists at step 4 rather than treating it as optional. When the branded
card is the chosen image, keep emitting `og:image:width=1080 /
og:image:height=1350`.

Web-app share flow (`opportunityShare.ts`) already points at `/opportunity/<id>`
and prefers backend payloads — no change needed there beyond the backend now
guaranteeing an image.

## Files touched

- `backend/.../opportunities/opportunity-share-text.ts` — conditional deadline row.
- `backend/.../opportunities/opportunity-share-card.service.ts` — conditional
  deadline tile; consume `ai_enriched`; expose an "ensure card exists" path for OG.
- `backend/.../opportunities/` — new AI enrichment helper
  (`opportunity-share-enrich.ts`) + wire into share-card/share-text build.
- `backend/.../opportunities/og.controller.ts` — image priority + ensure-card.
- `edutu-web-app/netlify/edge-functions/opportunity-og.ts` — image priority
  (call backend ensure-card endpoint / rely on backend-guaranteed image).
- Public projection already hoists `source_image_url` + `share_image_url`; verify
  `ai_enriched`-derived `benefits`/`eligibility` reach clients if needed.

## Testing

- Unit: `buildOpportunityShareText` omits Deadline when `close_date` null; keeps
  it when present. Includes AI-enriched benefits/eligibility only when real ones
  absent; real data wins.
- Unit: enrichment helper returns empty (not fabricated) for ungroundable fields;
  caches by `sourceHash`; never overwrites real fields.
- Unit/integration: OG resolver returns source flyer > image_url > card, and
  ensures a card (never icon) when none of the first three exist.
- Existing backend test suite stays green (`--maxWorkers=2` locally).

## Risks

- **AI latency on first share.** Mitigated: enrichment is best-effort and cached;
  a slow/failed call falls back to real-only data and still shares.
- **Card generation cost at OG time.** Mitigated: cards are cached by fingerprint;
  first unfurl generates once, subsequent ones hit cache.
- **Hallucination.** Mitigated by grounding-only prompt, blank-over-guess policy,
  and the absolute deadline guardrail.
