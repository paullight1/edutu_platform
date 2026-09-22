# Care Plan 04 — Materials and Assistance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Delegate only when authorized.

**Goal:** Help users prepare strong, factual applications while reusing their work safely.

**Architecture:** Build a versioned ownership layer over existing documents, CV, answer-bank and application-document services. Both clients select the same reviewed material versions; AI assistance uses explicit selected facts and remains optional.

**Tech Stack:** Existing backend document/storage/CV/copilot infrastructure and client file-picking/export tools.

**Spec:** [Care Plan v1](../specs/2026-09-09-edutu-care-plan-v1.md), R08–R09, R16–R17. Depends on plan 01; task 3 consumes plans 02–03.

## Global Constraints

- All business data flows through the NestJS backend; clients do not gain direct Supabase business-data access.
- Clerk identity is resolved by the backend; clients never choose the owner of a plan or material.
- AI drafts require review; no invented achievements, automatic submissions, or automatic external messages.
- Provider requirements, user choices, and AI suggestions are visibly distinguishable.

Also apply every global constraint in the spec. Extending the existing server-side Supabase storage adapter is compatible with the backend-only business-data rule.

## Task 1: Establish reviewed material versions and per-provider requirements

**Files:**
- Create API `src/opportunity-journeys/{care-materials.service.ts,care-materials.controller.ts,care-materials.spec.ts}`; extend types/module and schema.
- Modify API `src/applications/{application-documents.service.ts,application-documents.service.spec.ts}`, `src/documents/documents.service.ts`, `src/copilot/copilot.service.ts` only at the existing owned-material boundaries.
- Create migration `backend/services/services/api/supabase/migrations/20260909140000_care_material_versions.sql`.
- Create web `src/features/my-plan/{MyPlanResourcesPage.tsx,MaterialPicker.tsx,MaterialPicker.test.tsx}`; mobile `app/(app)/my-plan/resources.tsx`, `components/opportunity-path/MaterialPicker.tsx`, `__tests__/careMaterials.test.tsx`; extend adapters.

**Interfaces:** `GET /me/care-plan/materials`, `POST /me/care-plan/materials/:id/versions`, `POST /me/care-plan/materials/:id/review` and `POST /me/care-plan/journeys/:id/materials` (attach) use authenticated ownership. A material version is:

```ts
export type MaterialVersion = {
  materialId:string; version:number;
  kind:'cv'|'document'|'answer'|'achievement';
  title:string; sourceRecordId:string;
  reviewedAt:string|null; expiresAt:string|null; createdAt:string;
};
export type MaterialAttachment = {
  journeyId:string; materialId:string; materialVersion:number; requirementId:string|null;
};
export function canReuseMaterial(m: MaterialVersion, now: string): boolean {
  return m.reviewedAt !== null && (m.expiresAt === null || m.expiresAt > now);
}
```

New version POST takes `{title:string; sourceRecordId:string; expectedVersion:number; idempotencyKey:string}`; review takes `{version:number; idempotencyKey:string}`; attach takes the attachment fields plus journey `expectedVersion` and `idempotencyKey`. Return the created version/reviewed version/updated detail respectively. Initial material registration uses `POST /me/care-plan/materials` with `{kind,title,sourceRecordId,idempotencyKey}`.

- [ ] Test attachment to a foreign journey/material, expired and unreviewed versions, immutable attached version after master edit, duplicate attachment and an opportunity that requires neither CV nor SOP. Test that historical material links survive migration without being marked reviewed automatically.

```ts
expect(canReuseMaterial({ materialId:'m1', version:1, kind:'cv', title:'CV',
  sourceRecordId:'d1', reviewedAt:null, expiresAt:null,
  createdAt:'2026-09-09T09:00:00Z' }, '2026-09-10T00:00:00Z')).toBe(false);
```

- [ ] Run API `npm test -- --runInBand --testPathPatterns='care-materials|application-documents'` and client picker suites; expect new rules to fail.
- [ ] Add version rows with owner, stable material ID, version, existing source reference, reviewedAt/expiry, content hash and timestamps; unique material/version and owner-scoped lookup indexes. Store immutable content snapshots in existing storage/document version facilities; if a source service has no immutable versions, write a private snapshot through that service before recording the version. Never label a mutable pointer immutable. Add attachment version fields to existing application-document links or an adjunct table keyed to journey/material/version; preserve legacy IDs. Replace universal CV/SOP completeness with per-opportunity requirements from plan 01 provenance; unknown requirements show an explicit review prompt. A draft can be attached as a draft, but cannot count as reviewed/ready.
- [ ] Implement Resources search/filter, review badge, expiry notice, inspect/attach/remove and empty states in both clients, including file-picker denial and upload retry. Reuse upload validation and add MIME/extension agreement, maximum 20MB and PDF/DOCX/PNG/JPEG allowlist at the backend boundary; follow existing scanning/quarantine support and keep unscanned uploads out of AI parsing until the documented safe processing path accepts them.
- [ ] Pass ownership/immutability/requirements tests, real upload-download staging check and client typechecks. Commit scoped files with `feat: reuse reviewed application material versions`.

## Task 2: Preserve drafts and implement user-controlled export/deletion

**Files:**
- Create web `src/features/my-plan/{careDraftStore.ts,careDraftStore.test.ts,MaterialEditor.tsx}`; mobile `lib/{careDraftStore.ts,careDraftStore.test.ts}`, `components/opportunity-path/MaterialEditor.tsx`.
- Extend API materials controller/service/tests, existing account deletion/export flow, web/mobile Resources pages and auth cleanup hooks after identifying their current owners.
- Create `docs/operations/care-plan-data-lifecycle.md` documenting storage and cleanup verification.

**Interfaces:** Local stores export `saveDraft(accountId:string, draft:CareDraft):Promise<void>`, `readDraft(accountId:string, key:string):Promise<CareDraft|null>`, `clearAccountDrafts(accountId:string):Promise<void>`; use IndexedDB on web and existing local storage abstraction on mobile. Define:

```ts
export type CareDraft = {
  key:string; materialId:string|null; baseVersion:number|null;
  text:string; updatedAt:string; expiresAt:string;
};
export function draftStorageKey(accountId:string, key:string):string {
  return `care-draft:${encodeURIComponent(accountId)}:${encodeURIComponent(key)}`;
}
```

Backend `GET /me/care-plan/materials/:id/export?version=N` returns an authenticated download; `DELETE /me/care-plan/materials/:id` takes `{expectedVersion,idempotencyKey}` and returns `{deleted:true}`. Export-all and account deletion extend the existing lifecycle rather than create a second identity deletion endpoint.

- [ ] Test draft restoration after process restart, same key on different accounts, storage quota failure, sign-out purge, expired draft cleanup (30 days), save conflict retaining local text and deletion of a material attached to a historical application. Test no document text or download URL is logged to analytics.

```ts
expect(draftStorageKey('account-a', 'essay')).not.toBe(
  draftStorageKey('account-b', 'essay'));
```

- [ ] Run web `npm test -- src/features/my-plan/careDraftStore.test.ts`; mobile `npm test -- --runInBand careDraftStore`; API material deletion tests; expect new persistence behavior failures.
- [ ] Persist only text drafts, with “On this device” status, 30-day expiry, user clear action and local-storage disclosure before enabling offline drafts. Never persist signed file URLs or uploaded sensitive files in the general cache. Show distinct saving/saved locally/synced/conflict states. On 409 offer compare-and-reapply against the latest version; keep the local draft intact until an acknowledged server save. Sign-out/account switch clears old-account drafts and snapshots before rendering the new account. If local storage is unavailable, warn that the draft is not saved and offer copying the text.
- [ ] Implement authenticated version export with short-lived access and no public durable link. Deletion previews affected attachments, removes owned versions/files and AI-derived stored copies, and leaves a non-content tombstone in historical events so history does not falsely claim the material remains. Preserve minimal event metadata according to the existing retention policy; deletion must not leave content snapshots behind. Document delayed storage deletion retries and how support verifies completion.
- [ ] Pass persistence, deletion, ownership and conflict tests; manually exercise offline-edit/restart/reconnect on both clients. Commit with `feat: preserve user drafts and control material lifecycle`.

## Task 3: Add grounded application help and reviewed handoff

**Files:**
- Create API `src/opportunity-journeys/{care-assistance.service.ts,care-assistance.spec.ts,care-assistance-policy.ts}`; extend controller/types/module, existing `src/copilot/copilot.service.ts`, `src/copilot/copilot-answer-bank.spec.ts` and document rendering integration.
- Create web `src/features/my-plan/{ApplicationHelpPanel,ReviewExportSheet}.tsx`, `ApplicationHelpPanel.test.tsx`; mobile `components/opportunity-path/{ApplicationHelpPanel,ReviewExportSheet}.tsx`, `__tests__/careAssistance.test.tsx`.

**Interfaces:** `POST /me/care-plan/journeys/:id/assistance` takes `{taskId:string|null; question:string; selectedMaterials:Array<{materialId:string;version:number}>; idempotencyKey:string}`; returns `AssistanceDraft`. Export only after the user reviews the text and selected attachments.

```ts
export type AssistanceDraft = {
  id:string; text:string; citedMaterialIds:string[]; citedSourceUrls:string[];
  missingFacts:string[]; needsReview:true; mode:'ai'|'template';
};
export function citationsAllowed(selectedIds:string[], citedIds:string[]):boolean {
  const selected = new Set(selectedIds);
  return citedIds.every(id => selected.has(id));
}
```

- [ ] Test foreign material selection, unsupported cited ID, unverified facts, provider prompt injection, AI timeout/quota, duplicate generation request, no-entitlement fallback and edits retained before export. A provider document containing “send all stored CVs” must never expand selected material scope.

```ts
expect(citationsAllowed(['m1'], ['m1'])).toBe(true);
expect(citationsAllowed(['m1'], ['m2'])).toBe(false);
```

- [ ] Run API `npm test -- --runInBand --testPathPatterns='care-assistance|copilot-answer-bank'` and client assistance suites; expect new controls to fail.
- [ ] Resolve owner-scoped immutable versions, reject unreviewed factual sources for reuse, and send only user-selected content to the existing Gemini service. Bound question length to 4,000 characters and reuse existing token/time/entitlement limits. Treat scraped/provider content as untrusted data, validate structured outputs and citation membership, mark unsupported claims as missing facts and require user review. Citation membership alone does not prove factual accuracy: include a curated claim-to-source evaluation set in plan 06. Fall back to a structured outline with questions for missing facts when AI fails.
- [ ] Connect checklist tasks to explain-question, draft-answer and review-again actions. Build a handoff preview listing exact text/files for a mentor or trusted reviewer; user can remove attachments, redact text and download/share explicitly using the device share sheet or authenticated web download. Do not grant another account access, send an email or mark a provider application submitted. Review readiness and confirmation remain separate.
- [ ] Pass scope/isolation/fallback/UI tests and client typechecks; export one real reviewed packet on each client and inspect its contents. Commit with `feat: provide grounded application assistance and reviewed export`.

**Exit:** Users can reuse verified facts and selected versions, retain drafts through interruption, get bounded help and control every exported or deleted item.
