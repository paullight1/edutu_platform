# Opportunity Content Quality and Progressive Disclosure

**Status:** Approved for implementation  
**Date:** 2026-08-23  
**Scope:** Edutu opportunity ingestion, saved-opportunity enrichment, catalogue backfill, and mobile opportunity detail presentation.

## Problem

Opportunity detail pages can display one long, unstructured paragraph copied from an aggregator or source page. The copy may contain adverts, navigation labels, social prompts, duplicated sentences, raw links, and repeated calls to apply. Even when the underlying facts are useful, the presentation forces learners to scan an oversized block before reaching requirements, benefits, or application steps.

The problem is systemic rather than cosmetic:

1. Some extractors flatten all whitespace and destroy source paragraph boundaries.
2. Structured sections are not always extracted into requirements, benefits, and application steps.
3. The saved-opportunity AI enhancer can infer plausible structured facts when source text is unavailable.
4. Older catalogue rows remain noisy after the extraction logic improves.
5. The mobile About section expands the complete description by default.

## Product Goals

- Present a concise, readable summary before detailed copy.
- Preserve meaningful paragraph breaks and separate structured facts.
- Remove advert and page-chrome noise without changing factual content.
- Keep deadlines, official URLs, funding, location/region, and eligibility fail-closed.
- Use progressive disclosure so long About copy starts compact with **View more** and **Show less** controls.
- Reprocess existing poor-quality catalogue rows through the same guarded pipeline.
- Preserve the existing admin endpoint and UI contracts.

## Non-goals

- Rewriting opportunities into marketing copy.
- Guessing missing deadlines, funding, benefits, or eligibility conditions.
- Changing opportunity ranking, matching, or application tracking.
- Automatically publishing rows that still require editorial review.

## Content Pipeline

### 1. Source extraction

The Crawl4AI extractor removes script, navigation, advert, social, newsletter, related-content, and footer containers before reading copy. Paragraph elements remain separate. Labeled headings such as **Eligibility**, **Benefits**, and **How to apply** are converted to structured arrays.

### 2. Deterministic cleanup

A shared rule set:

- decodes HTML entities;
- removes control characters and HTML tags;
- rejects advert, cookie, navigation, social, newsletter, and repeated CTA lines;
- strips raw URLs from narrative copy;
- deduplicates normalized paragraphs and list entries;
- groups long flattened copy into readable two-sentence paragraphs;
- creates a 20–55 word summary from verified narrative content when needed;
- computes content quality and review diagnostics.

This stage never invents information.

### 3. AI/source enrichment guard

The existing source-fetching AI enhancer remains the provider-backed enrichment step. A runtime policy wraps its current endpoint, then applies deterministic cleanup and factual safeguards before the result is considered complete.

Structured lists generated during a run are accepted only when useful source-page text was actually available. When source text was unavailable, the system retains cleaned pre-existing lists and rejects newly inferred requirements, benefits, or application steps.

### 4. Persistence

The guarded persistence layer merges rather than replaces operational metadata. It keeps classification locks, verification state, provenance, and scraper diagnostics while adding:

- `content_format_version`;
- `content_refined_at`;
- cleaned requirements, benefits, and application process;
- extraction quality score;
- missing-field diagnostics;
- review state and protected-field audit data.

### 5. Mobile presentation

The About section remains open by default, but long content is clipped to a compact initial height. A learner can reveal the complete content with **View more** and return to the compact version with **Show less**. Short descriptions do not receive an unnecessary toggle.

The mobile display layer also performs defensive cleanup for cached and offline rows so legacy advert text does not reappear while the server catalogue is being backfilled.

## Factual Safety Rules

| Field | Existing value | New source-backed value | New value without source evidence |
|---|---|---|---|
| Deadline | Preserve existing | Accept only when previously missing | Clear/reject |
| Official application URL | Preserve existing | Accept only when previously missing | Clear/reject |
| Source URL | Preserve existing | Accept only when previously missing | Clear/reject |
| Funding type/amount | Preserve existing | Accept only when previously missing | Clear/reject |
| Target region/location | Preserve existing | Accept only when previously missing | Clear/reject |
| Eligibility | Preserve existing | Accept only when previously missing | Clear/reject |
| Requirements/benefits/steps | Preserve cleaned originals | Replace with source-backed extraction | Reject new inferred lists |
| Summary/description | Clean and reformat | Clean source-backed editorial copy | Allow only as reviewable prose; no hard-field promotion |

## Existing Catalogue Backfill

`POST /opportunities/admin/enrichment/backfill` keeps its route but now scans active, closed, and reviewable catalogue rows for presentation noise and content quality. It skips good rows before provider spend, processes qualifying rows sequentially, and returns scanned, skipped, cleaned, failed, and needs-review counts.

The backfill limit is clamped to 1–500 per run. Repeated runs are safe because clean rows fall below the refinement predicate and are skipped.

## Acceptance Criteria

- A description containing advert/navigation/social noise renders without that noise.
- Repeated paragraphs appear once.
- Long flattened text contains readable paragraph breaks.
- The mobile About section shows **View more** for long content and no toggle for short content.
- Existing deadlines, URLs, funding, and eligibility survive an AI enhancement unchanged.
- Newly suggested hard facts are persisted only when source text supported them.
- Existing metadata and classification locks remain intact.
- Python, backend, and mobile tests cover cleanup, source evidence, fail-closed behavior, and progressive disclosure.
