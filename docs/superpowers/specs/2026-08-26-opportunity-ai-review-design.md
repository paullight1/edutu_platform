# Opportunity AI Before-and-After Review Design

## Status

Approved for implementation on 26 August 2026.

## Problem

The opportunity-review workflow currently gives administrators too little information to make a safe publishing decision:

- expanded admin cards still reduce the record to a short `summary || description` excerpt;
- the editor omits structured content such as requirements, benefits, funding and application steps;
- the saved-opportunity AI action writes immediately, while its UI reports success even when the provider fell back or made no useful change;
- ordinary edits can replace enriched metadata with a thinner metadata object;
- learner-facing API responses remove the metadata where requirements, benefits and application steps are stored, so the web detail page receives empty arrays and renders only one paragraph.

The result is a misleading review experience: an administrator can approve an incomplete record without seeing the full content, and an AI action can appear successful without showing what changed or whether the source supported the proposed facts.

## Goals

1. Replace the single-record automatic AI overwrite with a before-and-after review.
2. Make every proposed field independently reviewable.
3. Keep unsupported facts unselectable and protect existing verified facts.
4. Prevent stale previews from overwriting newer edits.
5. Preserve structured metadata during ordinary create and edit operations.
6. Show the complete stored opportunity in the admin card and editor.
7. Promote safe structured fields into the public opportunity response so learner detail pages can render them.
8. Keep the existing automatic enrichment endpoint available for controlled backfill/internal workflows, while the human-facing admin action uses the review flow.

## Non-goals

- Replacing the Crawl4AI extraction system.
- Creating a new database table for previews.
- Allowing AI to invent deadlines, funding, eligibility, provider names or URLs.
- Publishing an opportunity automatically after AI review.
- Reworking the whole admin Opportunities page into a new application.

## User flow

### Opening a review

When an administrator clicks **AI improve** on one opportunity, the admin calls:

`POST /opportunities/admin/:id/enhance-preview`

The backend fetches the current record, attempts source-backed enrichment without persisting it, applies the existing factual-safety policy, calculates the before-and-after field changes, signs the proposal and returns a review payload.

The response contains:

- current opportunity version (`updated_at`);
- source URL and source domain;
- whether useful source text was found;
- AI provider/fallback diagnostics;
- quality score before and after;
- missing fields before and after;
- one review item per supported field;
- a signed, expiring preview token.

Opening the modal never changes the database.

### Reviewing fields

The modal renders two columns, **Before** and **After**. Each field is labelled with one of:

- `source_backed`: the proposed factual value is supported by useful source text;
- `editorial`: wording or formatting changed without adding a new hard fact;
- `existing_verified`: the current hard fact is retained;
- `unresolved`: the source did not provide a reliable value;
- `unsupported`: a proposed hard fact was rejected by the safety policy;
- `unchanged`: no meaningful difference exists.

Only selectable fields have a checkbox. Source-backed facts and editorial changes are selected by default. Unsupported, unresolved and unchanged fields are disabled.

Summary, description and structured text lists can be edited in the modal. Hard factual values—deadline, provider, source URL, application URL, funding type, target region, location and eligibility facts—are read-only in the review modal. Administrators can still change them through the normal manual editor.

### Applying a review

The modal calls:

`POST /opportunities/admin/:id/apply-enhancement`

with:

- the signed preview token;
- selected field names;
- permitted editorial edits.

The server verifies:

1. the token signature;
2. token expiry;
3. opportunity ID;
4. current record `updated_at` equals the preview base version;
5. every selected field was selectable in the signed proposal;
6. edits are limited to editable editorial/list fields.

The server applies only the selected fields, deep-merges metadata, recalculates quality diagnostics, refreshes embeddings/share assets and returns the updated opportunity. A version mismatch returns `409 Conflict` and instructs the administrator to reopen the review.

### Discarding

Discard closes the modal without a write. In a bulk-selected workflow, discard advances to the next selected opportunity. The existing bulk automatic-complete action is replaced by a queued human review so no selected record is silently overwritten.

## Backend architecture

### Non-persisting candidate generation

`OpportunitiesService` receives a public method that performs the current source resolution and AI generation steps but returns a candidate object without writing it. The existing `enhanceOpportunity()` method reuses that method and preserves its current controlled automatic behaviour for backfills and internal callers.

This removes duplicated AI prompts and keeps the review and automatic paths on the same extraction logic.

### Pure review contract

A focused module, `opportunity-enhancement-review.ts`, owns:

- field names and field policy;
- before/after value normalisation;
- change detection;
- default selection decisions;
- signed token payload shape;
- allowed editorial edit fields;
- application of a selected proposal to an opportunity update.

Pure functions are tested without database or AI mocks.

### Review service

`OpportunityEnhancementReviewService` orchestrates:

- loading the current record;
- requesting a non-persisting candidate;
- passing current and candidate values through `buildOpportunityContentUpdate()`;
- building a review payload;
- signing/verifying proposal tokens;
- stale-version checks;
- selected-field persistence;
- metadata deep merge and cache/embedding/share refresh.

The signed token is stateless, avoiding a new preview table. The signing key is derived from `OPPORTUNITY_REVIEW_SECRET`, falling back to existing backend-only service secrets. Preview creation fails closed if no backend secret is available.

Tokens expire after 20 minutes and contain only the proposal data necessary to apply the review.

## Admin architecture

### Review modal

A new `AiEnhancementReviewModal` component owns presentation and local selection/edit state. The parent page owns network requests and queue progression.

The component provides:

- quality score comparison;
- source and fallback diagnostics;
- field-level status badges;
- before/after values;
- editable summary, description and list proposals;
- **Apply selected changes**;
- **Apply all source-backed changes**;
- **Discard**;
- accessible labels, focusable controls and busy states.

### Opportunities page integration

The page changes its single-record AI handler from the automatic endpoint to the preview endpoint. It stores the active review and opens the modal. Applying or discarding advances a bulk review queue when one exists.

Sharing no longer triggers a hidden saved-record enhancement before opening the share chooser.

### Complete card content

Expanded cards render:

- full summary;
- full description with paragraph breaks;
- organization, location and deadline;
- requirements;
- benefits/funding;
- eligibility;
- application process;
- source/application links;
- quality and source diagnostics.

Long sections use disclosure controls rather than destructive string truncation.

### Structured editor

The form gains fields for:

- source URL;
- funding type;
- target region;
- eligibility criteria;
- requirements;
- benefits;
- application process;
- skills;
- tags.

List fields use one item per line. Summary becomes a multiline field with a 320-character editorial limit, while full description remains unrestricted by an artificial 150-character constraint.

## Data preservation

Create/update DTOs accept structured opportunity fields and their legacy aliases. `toCanonicalOpportunityPayload()` produces a metadata patch rather than unconditional empty arrays during partial updates. The update path deep-merges the patch into existing metadata.

Editing a title or deadline must not remove requirements, benefits, application steps, source evidence, content-refinement diagnostics, application-fee metadata or unrelated metadata keys.

## Public response

The public projection continues to remove internal metadata, scores, provider IDs and verification errors. Before removing metadata, it promotes these safe learner-facing fields:

- `requirements`;
- `benefits`;
- `application_process`;
- `eligibility`;
- `eligibility_criteria`;
- `funding_type`;
- `target_region`;
- `source_domain`;
- `content_updated_at`.

The existing web mapper already accepts top-level structured arrays; regression tests prove the detail page receives them.

## Error handling

- AI/source unavailable: return a review with honest fallback diagnostics and no selectable unsupported facts.
- No meaningful changes: return a review whose fields are unchanged and disable apply.
- Missing signing secret: return service unavailable; never create an unsigned proposal.
- Expired/tampered token: return bad request.
- Stale opportunity version: return conflict and require a fresh preview.
- Apply failure: leave modal open and preserve the administrator's selections.

## Security and factual safety

- AdminGuard protects both endpoints.
- Preview tokens are HMAC-signed and short-lived.
- Hard facts are selectable only when source-backed or already verified.
- Existing verified values remain authoritative.
- The apply endpoint trusts the signed proposal, not arbitrary client-provided after-values.
- Editable client values are restricted to editorial text and structured text lists.
- URLs continue through existing URL normalisation and safety checks.

## Testing strategy

### Backend unit tests

- preview generation performs no persistence;
- hard unsupported facts are disabled;
- editorial fields are selectable;
- token tampering and expiry fail;
- stale versions fail with conflict;
- only selected fields are persisted;
- metadata deep merge preserves unrelated keys;
- public projection exposes safe structured fields and still removes internal metadata.

### Admin component tests

- modal renders before and after values;
- unsupported/unresolved controls are disabled;
- apply emits only selected fields and permitted edits;
- apply-all-source-backed selects the correct fields;
- opening/closing the modal performs no save by itself.

### Integration and regression checks

- admin tests, lint and build;
- backend focused tests, full unit suite, lint and build;
- web opportunity service/detail tests and build;
- CI status on the exact pull-request head.

## Rollout

1. Deploy backend and admin together because the new UI depends on the new endpoints.
2. Confirm a known thin opportunity produces a non-persisting review.
3. Apply selected changes and verify metadata is retained.
4. Confirm the public opportunity endpoint exposes structured sections.
5. Run bounded enrichment backfill only through the existing controlled backfill route; human review remains mandatory for the admin-facing workflow.
