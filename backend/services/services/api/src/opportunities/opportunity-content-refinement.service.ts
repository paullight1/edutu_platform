import { Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { opportunities } from "../db/schema";
import { OpportunitiesService } from "./opportunities.service";
import { OpportunityEmbeddingService } from "./opportunity-embedding.service";
import { OpportunityShareCardService } from "./opportunity-share-card.service";
import {
  buildOpportunityContentUpdate,
  contentUpdateChanged,
  shouldRefineOpportunity,
  type OpportunityContentUpdateResult,
  type OpportunityRecord,
} from "./opportunity-content-refinement";

type AiEnhance = (id: string) => Promise<any>;

interface RefineOptions {
  aiEnhance?: AiEnhance;
  forceAi?: boolean;
}

interface BackfillHooks {
  aiEnhance?: AiEnhance;
}

interface BackfillOptions {
  limit?: number;
}

function recordValue(
  record: OpportunityRecord,
  ...keys: string[]
): unknown {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function metadataOf(record: OpportunityRecord): Record<string, any> {
  const value = record?.metadata;
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function toDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (value instanceof Date) return value;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function toDateOnly(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  const match = text.match(/^\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime())
    ? undefined
    : parsed.toISOString().slice(0, 10);
}

export function buildRefinedOpportunityMetadata(
  original: OpportunityRecord,
  candidate: OpportunityRecord,
  refinement: OpportunityContentUpdateResult,
): Record<string, any> {
  const originalMetadata = metadataOf(original);
  const candidateMetadata = metadataOf(candidate);
  const selected = refinement.update;
  const existingRefinement =
    candidateMetadata.content_refinement &&
    typeof candidateMetadata.content_refinement === "object" &&
    !Array.isArray(candidateMetadata.content_refinement)
      ? candidateMetadata.content_refinement
      : {};

  return {
    ...originalMetadata,
    ...candidateMetadata,
    requirements: refinement.content.requirements,
    benefits: refinement.content.benefits,
    application_process: refinement.content.applicationProcess,
    eligibility:
      selected.eligibility ?? originalMetadata.eligibility ?? null,
    eligibility_criteria:
      selected.eligibilityCriteria ??
      originalMetadata.eligibility_criteria ??
      null,
    funding_type:
      selected.fundingType ?? originalMetadata.funding_type ?? null,
    target_region:
      selected.targetRegion ?? originalMetadata.target_region ?? null,
    extraction_quality_score: refinement.content.qualityScore,
    extraction_missing_fields: [
      ...(refinement.content.summary ? [] : ["summary"]),
      ...(refinement.content.description ? [] : ["description"]),
      ...(refinement.content.requirements.length ? [] : ["requirements"]),
      ...(refinement.content.benefits.length ? [] : ["benefits"]),
      ...(refinement.content.applicationProcess.length
        ? []
        : ["application_process"]),
    ],
    needs_review: refinement.content.needsReview,
    content_format_version: "opportunity-content-v2",
    content_refined_at: new Date().toISOString(),
    content_refinement: {
      ...existingRefinement,
      version: "opportunity-content-v2",
      source_backed: refinement.sourceBacked,
      protected_fields: refinement.protectedFields,
      ...refinement.content.diagnostics,
    },
  };
}

@Injectable()
export class OpportunityContentRefinementService {
  private readonly logger = new Logger(OpportunityContentRefinementService.name);

  constructor(
    private readonly opportunitiesService: OpportunitiesService,
    private readonly embeddingService: OpportunityEmbeddingService,
    private readonly shareCardService: OpportunityShareCardService,
  ) {}

  async refineOpportunity(id: string, options: RefineOptions = {}) {
    const original = (await this.opportunitiesService.findOne(id)) as
      | OpportunityRecord
      | null;
    if (!original) return null;

    const shouldUseAi = Boolean(
      options.aiEnhance &&
        (options.forceAi === true || shouldRefineOpportunity(original)),
    );
    let aiAttempted = false;
    let aiError: string | null = null;
    let candidate = original;

    if (shouldUseAi && options.aiEnhance) {
      aiAttempted = true;
      try {
        const upstream = await options.aiEnhance(id);
        if (upstream && upstream.success === false) {
          aiError = String(
            upstream.error || "The upstream AI enhancement did not complete.",
          );
        }
        candidate =
          ((await this.opportunitiesService.findOne(id)) as
            | OpportunityRecord
            | null) || original;
      } catch (error) {
        aiError = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Source enrichment failed for ${id}; deterministic cleanup will continue: ${aiError}`,
        );
        candidate = original;
      }
    }

    const refinement = buildOpportunityContentUpdate(original, candidate);
    const changed = contentUpdateChanged(candidate, refinement.update);

    // Persist after every provider attempt even when the copy is unchanged:
    // the upstream enhancer may have proposed a different deadline, URL,
    // funding value or eligibility rule, and those protected facts must be
    // restored to the pre-enrichment value.
    const shouldPersist = changed || aiAttempted;
    const opportunity = shouldPersist
      ? await this.persistRefinement(id, original, candidate, refinement)
      : candidate;

    return {
      success: true,
      opportunity,
      completeness: {
        score: refinement.content.qualityScore,
        needsReview: refinement.content.needsReview,
      },
      contentRefinement: {
        version: "opportunity-content-v2",
        aiAttempted,
        aiFallback: Boolean(
          aiError || (aiAttempted && !refinement.sourceBacked),
        ),
        aiError,
        sourceBacked: refinement.sourceBacked,
        changed,
        protectedFields: refinement.protectedFields,
        diagnostics: refinement.content.diagnostics,
      },
    };
  }

  private async persistRefinement(
    id: string,
    original: OpportunityRecord,
    candidate: OpportunityRecord,
    refinement: OpportunityContentUpdateResult,
  ): Promise<OpportunityRecord> {
    const selected = refinement.update;
    const deadline = selected.deadline;
    const payload: Partial<typeof opportunities.$inferInsert> = {
      summary: refinement.content.summary,
      description: refinement.content.description,
      organization: selected.organization,
      skills: Array.isArray(selected.skills) ? selected.skills : [],
      eligibilityCriteria: selected.eligibilityCriteria,
      eligibility: selected.eligibility,
      fundingType: selected.fundingType,
      targetRegion: selected.targetRegion,
      sourceUrl: selected.sourceUrl,
      applyUrl: selected.applyUrl,
      applicationUrl: selected.applyUrl,
      qualityScore: refinement.content.qualityScore,
      validationStatus: refinement.content.needsReview
        ? "needs_review"
        : "valid",
      metadata: buildRefinedOpportunityMetadata(
        original,
        candidate,
        refinement,
      ),
      updatedAt: new Date(),
    };

    if (deadline !== undefined) {
      payload.closeDate = toDateOnly(deadline);
      payload.deadline = toDate(deadline);
    }

    // Preserve the distinction between the canonical application URL and the
    // legacy apply_url alias whenever the original row carried both.
    const originalApplicationUrl = recordValue(
      original,
      "application_url",
      "applicationUrl",
    );
    const originalApplyUrl = recordValue(original, "apply_url", "applyUrl");
    if (originalApplicationUrl !== undefined) {
      payload.applicationUrl = String(originalApplicationUrl);
    }
    if (originalApplyUrl !== undefined) {
      payload.applyUrl = String(originalApplyUrl);
    }

    const definedPayload = Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined),
    ) as Partial<typeof opportunities.$inferInsert>;

    await db
      .update(opportunities)
      .set(definedPayload)
      .where(eq(opportunities.id, id))
      .execute();

    await this.opportunitiesService.invalidateCatalogCache();
    const updated = (await this.opportunitiesService.findOne(id)) as
      | OpportunityRecord
      | null;
    const opportunity = updated || { ...candidate, ...definedPayload };

    void this.embeddingService.embedOpportunity(id);
    void this.shareCardService
      .ensureShareCardForOpportunity(opportunity, { force: true })
      .catch((error) =>
        this.logger.warn(
          `Opportunity share card refresh failed for ${id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ),
      );

    return opportunity;
  }

  /**
   * Reprocess the existing catalogue through the same guarded route used by the
   * admin's single-row AI Complete action. Rows already meeting the content
   * quality threshold are skipped before any provider call.
   */
  async backfill(
    options: BackfillOptions = {},
    hooks: BackfillHooks = {},
  ): Promise<{
    scanned: number;
    processed: number;
    enhanced: number;
    failed: number;
    skipped: number;
    cleaned: number;
    needsReview: number;
  }> {
    const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 500);
    const pageSize = Math.min(Math.max(limit, 50), 200);
    const result = {
      scanned: 0,
      processed: 0,
      enhanced: 0,
      failed: 0,
      skipped: 0,
      cleaned: 0,
      needsReview: 0,
    };

    // Gather a stable set before writing. The admin list may be ordered by an
    // update timestamp, so mutating rows while paginating could otherwise move
    // them between pages and skip untouched records.
    const candidateIds: string[] = [];
    let page = 1;
    let exhausted = false;

    while (candidateIds.length < limit && !exhausted) {
      const response = (await this.opportunitiesService.findAdminList({
        limit: pageSize,
        page,
        includeExpired: true,
      })) as any;
      const rows: OpportunityRecord[] = Array.isArray(response)
        ? response
        : Array.isArray(response?.data)
          ? response.data
          : [];

      if (rows.length === 0) break;
      exhausted = response?.hasMore === false || rows.length < pageSize;
      page += 1;

      for (const row of rows) {
        if (candidateIds.length >= limit) break;
        result.scanned += 1;
        if (!row?.id || !shouldRefineOpportunity(row)) {
          result.skipped += 1;
          continue;
        }
        candidateIds.push(String(row.id));
      }
    }

    for (let index = 0; index < candidateIds.length; index += 1) {
      const id = candidateIds[index];
      result.processed += 1;
      try {
        const outcome = await this.refineOpportunity(id, {
          aiEnhance: hooks.aiEnhance,
          forceAi: false,
        });
        if (!outcome?.success) {
          result.failed += 1;
          continue;
        }
        result.enhanced += 1;
        if (outcome.contentRefinement?.changed) result.cleaned += 1;
        if (outcome.completeness?.needsReview) result.needsReview += 1;
      } catch (error) {
        result.failed += 1;
        this.logger.warn(
          `Opportunity content backfill failed for ${id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      if (index < candidateIds.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }

    this.logger.log(
      `Opportunity content backfill: scanned=${result.scanned} processed=${result.processed} enhanced=${result.enhanced} cleaned=${result.cleaned} skipped=${result.skipped} failed=${result.failed} needsReview=${result.needsReview}`,
    );
    return result;
  }
}
