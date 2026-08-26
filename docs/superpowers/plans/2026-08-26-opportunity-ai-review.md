# Opportunity AI Before-and-After Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the admin's silent saved-opportunity AI overwrite with a source-aware before-and-after review, preserve structured opportunity content, and expose safe structured fields to learner detail pages.

**Architecture:** Add a pure review-contract module and a stateless signed-preview service around the existing opportunity enrichment pipeline. The backend produces non-persisting proposals and applies only signed, selected fields; the admin renders a dedicated comparison modal and a queued bulk-review flow. Existing metadata is deep-merged, while the public projection promotes learner-safe structured fields before stripping internal metadata.

**Tech Stack:** NestJS, TypeScript, Zod, Drizzle/PostgreSQL, Supabase, Node `crypto`, React 19, Vite, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-26-opportunity-ai-review-design.md`

## Global Constraints

- Opening an AI review must never write to the database.
- Unsupported, unresolved and unchanged fields are never selectable.
- Existing verified facts remain authoritative unless useful source text supports a replacement.
- Preview tokens expire after 20 minutes and fail closed when unsigned, expired, stale or tampered.
- Apply operations persist only signed selected fields; client edits are limited to summary, description and structured text lists.
- Ordinary partial edits must preserve unrelated metadata and existing structured fields.
- The public response must expose safe structured content without exposing internal metadata or verification internals.
- The admin-facing workflow must not silently auto-apply AI changes, including bulk review and share preparation.

---

### Task 1: Pure enhancement-review contract and signed token

**Files:**
- Create: `backend/services/services/api/src/opportunities/opportunity-enhancement-review.ts`
- Create: `backend/services/services/api/src/opportunities/opportunity-enhancement-review.spec.ts`

**Interfaces:**
- Consumes: `OpportunityRecord` and `OpportunityContentUpdateResult` from the existing content-refinement layer.
- Produces: `OpportunityEnhancementFieldName`, `OpportunityEnhancementReviewField`, `OpportunityEnhancementPreview`, `buildOpportunityEnhancementReview()`, `signOpportunityEnhancementPreview()`, `verifyOpportunityEnhancementPreviewToken()`, and `buildSelectedEnhancementUpdate()`.

- [ ] **Step 1: Write failing tests for field classification**

Create tests proving that editorial summary/description changes are selectable, source-backed hard facts are selectable, unsupported hard facts are disabled, unchanged fields are disabled, and default selection contains only selectable changed fields.

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
cd backend/services/services/api
npm test -- opportunity-enhancement-review.spec.ts --runInBand
```

Expected: failure because `opportunity-enhancement-review.ts` does not exist.

- [ ] **Step 3: Implement minimal field policy and review builder**

Implement explicit field descriptors for summary, description, organization, location, deadline, application URL, source URL, funding type, target region, eligibility criteria, eligibility, requirements, benefits, application process, skills and tags. Normalise arrays/objects before equality checks. Mark hard facts selectable only when the proposal is source-backed; retain existing values as `existing_verified`; mark rejected new facts as `unsupported`.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Use the same command and require all review-builder tests to pass.

- [ ] **Step 5: Write failing tests for token integrity and selected updates**

Add tests for valid token round-trip, tampered signature, expired token, missing secret, selected-field filtering, and rejection of edits to non-editorial hard facts.

- [ ] **Step 6: Run focused tests and confirm RED**

Expected: new token/update tests fail because signing and selection functions are absent.

- [ ] **Step 7: Implement HMAC token and selected-update builder**

Use `createHmac('sha256', secret)` and `timingSafeEqual`. Encode `{ version, opportunityId, baseUpdatedAt, createdAt, expiresAt, fields, proposed, sourceBacked }` as base64url JSON plus signature. Permit edits only for `summary`, `description`, `requirements`, `benefits`, `applicationProcess`, `skills` and `tags`.

- [ ] **Step 8: Run focused tests and confirm GREEN**

- [ ] **Step 9: Commit**

```bash
git add backend/services/services/api/src/opportunities/opportunity-enhancement-review.ts backend/services/services/api/src/opportunities/opportunity-enhancement-review.spec.ts
git commit -m "feat(opportunities): add signed enhancement review contract"
```

### Task 2: Non-persisting proposal service and review endpoints

**Files:**
- Modify: `backend/services/services/api/src/opportunities/opportunities.service.ts`
- Create: `backend/services/services/api/src/opportunities/opportunity-enhancement-review.service.ts`
- Create: `backend/services/services/api/src/opportunities/opportunity-enhancement-review.service.spec.ts`
- Modify: `backend/services/services/api/src/opportunities/opportunities.controller.ts`
- Modify: `backend/services/services/api/src/opportunities/opportunities.module.ts`
- Modify: `backend/services/services/api/src/opportunities/dto/create-opportunity.dto.ts`

**Interfaces:**
- Consumes: Task 1 review/token functions and existing `buildOpportunityContentUpdate()`.
- Produces: `OpportunitiesService.previewOpportunityEnhancement(id)`, `OpportunityEnhancementReviewService.createPreview(id)`, `OpportunityEnhancementReviewService.applyPreview(id, body)`, `POST /opportunities/admin/:id/enhance-preview`, and `POST /opportunities/admin/:id/apply-enhancement`.

- [ ] **Step 1: Write failing service tests for non-persisting preview**

Test that `createPreview()` loads the current record, requests a candidate, returns before/after scores and a signed token, and never invokes any persistence method. Test source failure returns honest diagnostics and no selectable unsupported facts.

- [ ] **Step 2: Run focused service tests and confirm RED**

```bash
cd backend/services/services/api
npm test -- opportunity-enhancement-review.service.spec.ts --runInBand
```

- [ ] **Step 3: Refactor candidate generation without changing current enhancement behaviour**

Extract the source-text resolution, prompt generation, AI call, list normalisation, summary/description normalisation, deadline parsing and candidate construction from `enhanceOpportunity()` into `previewOpportunityEnhancement(id)`. The new method returns the original record, candidate record, source URL, source-text length, AI error/fallback state and before/after quality data without writing. `enhanceOpportunity()` must call this method and continue its existing controlled persistence path.

- [ ] **Step 4: Implement preview orchestration**

Create `OpportunityEnhancementReviewService.createPreview()` using `previewOpportunityEnhancement()` and `buildOpportunityContentUpdate()`. Resolve the signing secret from `OPPORTUNITY_REVIEW_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` or `CLERK_SECRET_KEY`; fail closed when unavailable.

- [ ] **Step 5: Run preview tests and confirm GREEN**

- [ ] **Step 6: Write failing apply tests**

Test successful selected-field persistence, preservation of unselected fields, metadata deep merge, stale `updated_at` conflict, expired/tampered token rejection and refresh hooks after success.

- [ ] **Step 7: Run apply tests and confirm RED**

- [ ] **Step 8: Implement apply persistence**

Verify the token and current version, build the selected update, merge existing metadata with updated structured arrays and review audit metadata, update the row once, invalidate caches, refresh embeddings and regenerate the share card. Return `409 Conflict` for stale previews.

- [ ] **Step 9: Add controller DTO validation and routes**

Add a Zod schema containing `previewToken`, `selectedFields`, and optional permitted `edits`. Register both AdminGuard-protected routes before generic parameter routes. Register/export the service in `OpportunitiesModule`.

- [ ] **Step 10: Run focused controller/service tests and backend build**

```bash
cd backend/services/services/api
npm test -- opportunity-enhancement-review --runInBand
npm run build
```

- [ ] **Step 11: Commit**

```bash
git add backend/services/services/api/src/opportunities
git commit -m "feat(opportunities): add non-persisting AI review endpoints"
```

### Task 3: Structured-edit preservation and learner-safe projection

**Files:**
- Modify: `backend/services/services/api/src/opportunities/dto/create-opportunity.dto.ts`
- Modify: `backend/services/services/api/src/opportunities/opportunities.service.ts`
- Create: `backend/services/services/api/src/opportunities/opportunity-metadata-merge.spec.ts`
- Modify: `backend/services/services/api/src/opportunities/public-opportunity-projection.ts`
- Create or modify: `backend/services/services/api/src/opportunities/public-opportunity-projection.spec.ts`

**Interfaces:**
- Consumes: current create/update service paths and opportunity metadata.
- Produces: structured DTO fields, a metadata-preserving partial-update path, and public top-level `requirements`, `benefits`, `application_process`, `eligibility`, `eligibility_criteria`, `funding_type`, `target_region`, `source_domain`, `content_updated_at`.

- [ ] **Step 1: Write failing metadata-preservation tests**

Prove that updating only title/summary leaves existing requirements, benefits, application process, application fee, content-refinement diagnostics and unrelated metadata unchanged. Prove explicitly supplied structured lists replace only their matching keys.

- [ ] **Step 2: Run tests and confirm RED**

```bash
cd backend/services/services/api
npm test -- opportunity-metadata-merge.spec.ts --runInBand
```

- [ ] **Step 3: Expand DTOs and implement metadata patch merge**

Accept structured fields and legacy aliases. Ensure partial payload construction omits absent list keys instead of emitting empty arrays. Merge the generated metadata patch into the stored metadata before canonical Supabase or Drizzle update.

- [ ] **Step 4: Run metadata tests and confirm GREEN**

- [ ] **Step 5: Write failing public projection tests**

Prove safe structured fields are promoted from metadata, malformed list values become empty arrays, source domain is derived from the canonical/source/application URL, and internal metadata/quality/verification fields remain absent.

- [ ] **Step 6: Run projection tests and confirm RED**

- [ ] **Step 7: Implement safe field promotion**

Normalise list/object/string values and promote only the approved learner-facing fields before removing metadata.

- [ ] **Step 8: Run focused tests and confirm GREEN**

- [ ] **Step 9: Commit**

```bash
git add backend/services/services/api/src/opportunities
git commit -m "fix(opportunities): preserve and project structured content"
```

### Task 4: Admin before-and-after modal

**Files:**
- Create: `admin/src/pages/opportunities/opportunity-enhancement-review.ts`
- Create: `admin/src/pages/opportunities/AiEnhancementReviewModal.tsx`
- Create: `admin/src/pages/opportunities/AiEnhancementReviewModal.spec.tsx`

**Interfaces:**
- Consumes: backend review response from Task 2.
- Produces: typed `OpportunityEnhancementPreviewResponse`, `OpportunityEnhancementApplyRequest`, and `AiEnhancementReviewModal` props `{ preview, busy, onApply, onDiscard, onClose }`.

- [ ] **Step 1: Write failing modal tests**

Test before/after rendering, quality score comparison, source/fallback diagnostics, disabled unsupported/unresolved fields, default selection, editable summary/list values, apply-selected payload, apply-all-source-backed behaviour, discard callback and no automatic apply on mount.

- [ ] **Step 2: Run modal tests and confirm RED**

```bash
cd admin
npm test -- AiEnhancementReviewModal.spec.tsx
```

- [ ] **Step 3: Implement response types and pure display helpers**

Provide field labels, status labels, editable-field checks, array text conversion and safe value rendering.

- [ ] **Step 4: Implement minimal accessible modal**

Use semantic dialog markup, labelled checkboxes, status badges, two-column before/after layout, editable textareas only for permitted fields, and busy-state button disabling.

- [ ] **Step 5: Run modal tests and confirm GREEN**

- [ ] **Step 6: Commit**

```bash
git add admin/src/pages/opportunities/opportunity-enhancement-review.ts admin/src/pages/opportunities/AiEnhancementReviewModal.tsx admin/src/pages/opportunities/AiEnhancementReviewModal.spec.tsx
git commit -m "feat(admin): add opportunity AI comparison modal"
```

### Task 5: Integrate human review, complete cards and structured editor

**Files:**
- Modify: `admin/src/pages/Opportunities.tsx`
- Create: `admin/src/pages/opportunities/OpportunityReviewContent.tsx`
- Create: `admin/src/pages/opportunities/OpportunityReviewContent.spec.tsx`
- Modify: `admin/src/index.css`

**Interfaces:**
- Consumes: Task 4 modal and Task 2 endpoints.
- Produces: single and queued bulk review handlers, full expanded-card content and structured form payloads.

- [ ] **Step 1: Write failing content renderer tests**

Test that full summary/description are rendered without 170-character truncation, paragraph breaks are preserved, requirements/benefits/application steps appear, and long content uses disclosure rather than destructive ellipsis.

- [ ] **Step 2: Run content tests and confirm RED**

```bash
cd admin
npm test -- OpportunityReviewContent.spec.tsx
```

- [ ] **Step 3: Implement full content renderer**

Render structured sections from top-level or metadata values, source/application links and diagnostics. Use local expand/collapse state with full text retained in the DOM only when expanded.

- [ ] **Step 4: Run content tests and confirm GREEN**

- [ ] **Step 5: Replace the single-record auto-save handler**

Change `handleEnhanceOpportunity()` to request `/enhance-preview`, store the response and open `AiEnhancementReviewModal`. Add apply/discard/close handlers and error handling. Applying refreshes the list only after the backend confirms success.

- [ ] **Step 6: Replace bulk automatic completion with queued review**

Queue selected IDs and open one review at a time. Apply or discard advances to the next record. Remove the automatic call loop.

- [ ] **Step 7: Remove hidden share-time persistence**

Stop calling the saved-opportunity enhancement endpoint during share preparation; use the current record and existing share-card service.

- [ ] **Step 8: Integrate complete expanded cards**

Replace the truncated paragraph with `OpportunityReviewContent` and retain current actions/status presentation.

- [ ] **Step 9: Expand form state and fields**

Add source URL, funding type, target region, eligibility criteria, requirements, benefits, application process, skills and tags. Parse one-item-per-line textareas into arrays. Increase summary to a multiline 320-character field and description rows to at least 10.

- [ ] **Step 10: Run admin tests, lint and build**

```bash
cd admin
npm test
npm run lint
npm run build
```

- [ ] **Step 11: Commit**

```bash
git add admin/src/pages/Opportunities.tsx admin/src/pages/opportunities admin/src/index.css
git commit -m "feat(admin): require review before applying opportunity AI changes"
```

### Task 6: Web regression coverage and end-to-end verification

**Files:**
- Modify or create: `edutu-web-app/src/services/__tests__/opportunities.test.ts`
- Modify only if a failing test proves necessary: `edutu-web-app/src/services/opportunities.ts`
- Modify only if a failing test proves necessary: `edutu-web-app/src/components/OpportunityDetailLegacy.tsx`

**Interfaces:**
- Consumes: Task 3 public projection.
- Produces: regression proof that top-level structured response fields populate the existing Opportunity model and detail sections.

- [ ] **Step 1: Write failing web mapper test**

Supply a backend row with top-level requirements, benefits, application process, eligibility, funding and target region. Assert the normalised opportunity carries all structured sections and retains paragraph breaks in description.

- [ ] **Step 2: Run focused test and confirm RED or document existing GREEN**

```bash
cd edutu-web-app
npm test -- opportunities
```

If the test is already green because the mapper supports the promoted fields, keep the regression test and make no production change. If it fails, make the smallest mapper correction.

- [ ] **Step 3: Run web tests, typecheck and build**

```bash
cd edutu-web-app
npm test
npm run typecheck
npm run build
```

- [ ] **Step 4: Run backend full verification**

```bash
cd backend/services/services/api
npm run lint
npm test -- --runInBand
npm run build
```

- [ ] **Step 5: Run repository diff review**

Confirm changes are confined to the approved docs, opportunities backend, admin opportunities UI and focused web regression tests. Search for accidental secrets, unsigned tokens, hidden automatic `/enhance` calls in admin review/share paths, and literal truncation of expanded content.

- [ ] **Step 6: Commit final regression tests**

```bash
git add edutu-web-app/src/services/__tests__/opportunities.test.ts edutu-web-app/src/services/opportunities.ts edutu-web-app/src/components/OpportunityDetailLegacy.tsx
git commit -m "test(web): cover structured opportunity detail content"
```

- [ ] **Step 7: Open pull request and verify exact head**

Open a pull request from `agent/opportunity-ai-review` to `main`, wait for every configured check, inspect failures by job and do not claim completion until the exact head SHA is green or remaining external blockers are reported explicitly.
