# Opportunity Content UX Implementation Plan

## Task 1 — Establish deterministic content contracts

**Files**
- `backend/services/services/api/src/opportunities/opportunity-content-normalizer.ts`
- `backend/services/services/api/src/opportunities/opportunity-content-normalizer.spec.ts`

**Work**
- Add prose and structured-list cleaners.
- Add summary generation, quality scoring, and review diagnostics.
- Test advert removal, deduplication, paragraphing, summary length, and source-evidence gating.

## Task 2 — Guard saved-opportunity AI enrichment

**Files**
- `backend/services/services/api/src/opportunities/opportunity-content-refinement.ts`
- `backend/services/services/api/src/opportunities/opportunity-content-refinement.service.ts`
- `backend/services/services/api/src/opportunities/opportunity-content-refinement-policy.ts`
- corresponding `*.spec.ts` files
- `backend/services/services/api/src/opportunities/opportunities.module.ts`

**Work**
- Wrap the current enhancer without changing endpoint contracts.
- Preserve existing hard facts and clear unsupported newly introduced facts.
- Merge operational metadata and refresh embeddings/share cards.
- Replace the old skills-only backfill with content-quality scanning.
- Install and restore the runtime policy with module lifecycle hooks.

## Task 3 — Improve source extraction

**Files**
- `crawl4ai-scraper/extractors/scholarship_extractor.py`
- `crawl4ai-scraper/processors/data_cleaner.py`
- `crawl4ai-scraper/database/supabase_client.py`
- `crawl4ai-scraper/tests/test_scholarship_extractor.py`
- `crawl4ai-scraper/tests/test_data_cleaner.py`
- `crawl4ai-scraper/tests/test_supabase_client.py`

**Work**
- Preserve paragraphs while removing page chrome.
- Extract eligibility, benefits, and application steps from labeled sections.
- Store summaries and content diagnostics in canonical payloads.
- Keep URLs, deadlines, category logic, validation, and deduplication behavior compatible.

## Task 4 — Add mobile progressive disclosure

**Files**
- `edutumobile/lib/opportunityDisplay.ts`
- `edutumobile/lib/__tests__/opportunityDisplay.test.ts`
- `edutumobile/components/opportunity/CollapsibleSection.tsx`
- `edutumobile/components/opportunity/__tests__/CollapsibleSection.test.tsx`
- `edutumobile/components/opportunity/RequirementChecklist.tsx`

**Work**
- Defensively clean legacy/offline opportunity text.
- Automatically clip long default-open narrative sections.
- Add accessible View more/Show less controls.
- Clean and deduplicate requirement checklist items.

## Task 5 — Verification and rollout

- Run backend normalizer/refinement unit tests.
- Run scraper unit tests.
- Run mobile helper/component tests and TypeScript checks.
- Run repository lint/build gates for affected workspaces.
- Open a pull request from `agent/opportunity-content-ux`.
- After deployment, run the admin content backfill in bounded batches and review the `needsReview` cohort before publication changes.

## Task 6 — Refine the opportunity-detail decision journey

**Files**
- `edutumobile/app/(app)/opportunities/[id].tsx`
- `edutumobile/components/opportunity/OpportunityApplicationSupportActions.tsx`
- `edutumobile/components/opportunity/CollapsibleSection.tsx`
- `edutumobile/components/opportunity/RequirementChecklist.tsx`
- `edutumobile/lib/opportunityDisplay.ts`
- corresponding mobile tests

**Work**
- Put source-backed facts, requirements, benefits, and application steps before optional AI assistance.
- Suppress summaries that substantially repeat the full description.
- Cap and deduplicate tags so they do not interrupt the decision flow.
- Use progressive disclosure for long About content and the application-support toolset.
- Consolidate fit guidance, next-move coaching, Ask Edutu, CV review, and roadmap generation under one Help me apply section.
- Preserve guest gating, authenticated AI actions, save/share/apply behavior, and evidence boundaries.
- Extract the application-support action block so the route remains within the repository's approved file-size budget.

### Current verification status

- The content-quality foundation was completed separately in PR #64.
- The mobile decision-journey follow-up is tracked in PR #66.
- Focused opportunity-detail regression tests pass: 10/10.
- ESLint passes for the changed mobile screen, extracted component, and regression test.
- Mobile TypeScript checking passes.
- Repository large-file governance passes after the component extraction; the budget was not increased.
- The temporary branch-scoped repair workflow and script removed themselves after committing the verified implementation.
- A fresh full repository CI run is required on this normal repository-authored head before PR #66 is considered complete.
