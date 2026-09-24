import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { OpportunitiesService } from "./opportunities.service";
import { OpportunityEmbeddingService } from "./opportunity-embedding.service";
import { OpportunityShareCardService } from "./opportunity-share-card.service";
import { ScraperService } from "../scraper/scraper.service";
import {
  buildOpportunityContentUpdate,
  type OpportunityRecord,
} from "./opportunity-content-refinement";
import { refineOpportunityContent } from "./opportunity-content-normalizer";
import {
  buildOpportunityEnhancementReview,
  buildSelectedEnhancementUpdate,
  signOpportunityEnhancementPreview,
  verifyOpportunityEnhancementPreviewToken,
  type OpportunityEnhancementFieldName,
  type OpportunityEnhancementPreview,
  type OpportunityEnhancementQuality,
  type OpportunityEnhancementValues,
} from "./opportunity-enhancement-review";
import {
  OpportunityEnhancementReviewRepository,
  type OpportunityEnhancementPersistencePayload,
} from "./opportunity-enhancement-review.repository";
import { OpportunitySourceEvidenceService } from "./opportunity-source-evidence.service";
import type { ApplyOpportunityEnhancementDto } from "./opportunity-enhancement-review.dto";

const REVIEW_TTL_MS = 20 * 60 * 1_000;

function metadataOf(record: OpportunityRecord): Record<string, any> {
  const value = record?.metadata;
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function firstValue(record: OpportunityRecord, ...keys: string[]): unknown {
  const metadata = metadataOf(record);
  for (const key of keys) {
    for (const candidate of [record?.[key], metadata?.[key]]) {
      if (candidate !== undefined && candidate !== null && candidate !== "") {
        return candidate;
      }
    }
  }
  return undefined;
}

function stringList(record: OpportunityRecord, ...keys: string[]): string[] {
  for (const key of keys) {
    const value = firstValue(record, key);
    if (!Array.isArray(value)) continue;
    const cleaned = Array.from(
      new Set(
        value
          .filter((entry): entry is string => typeof entry === "string")
          .map((entry) => entry.trim())
          .filter(Boolean),
      ),
    );
    if (cleaned.length > 0) return cleaned;
  }
  return [];
}

function toVersion(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value || ""));
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function sourceUrlOf(record: OpportunityRecord): string {
  return String(
    firstValue(
      record,
      "source_url",
      "sourceUrl",
      "application_url",
      "applicationUrl",
      "apply_url",
      "applyUrl",
      "canonical_url",
      "canonicalUrl",
    ) || "",
  ).trim();
}

function applicationUrlOf(record: OpportunityRecord): unknown {
  return firstValue(
    record,
    "application_url",
    "applicationUrl",
    "apply_url",
    "applyUrl",
    "canonical_url",
    "canonicalUrl",
  );
}

function valuesFromRecord(
  record: OpportunityRecord,
): OpportunityEnhancementValues {
  return {
    summary: firstValue(record, "summary"),
    description: firstValue(record, "description"),
    organization: firstValue(record, "organization"),
    location: firstValue(record, "location"),
    deadline: firstValue(record, "close_date", "closeDate", "deadline"),
    applicationUrl: applicationUrlOf(record),
    sourceUrl: firstValue(record, "source_url", "sourceUrl"),
    fundingType: firstValue(record, "funding_type", "fundingType"),
    targetRegion: firstValue(record, "target_region", "targetRegion"),
    eligibilityCriteria: firstValue(
      record,
      "eligibility_criteria",
      "eligibilityCriteria",
    ),
    eligibility: firstValue(record, "eligibility"),
    requirements: stringList(record, "requirements"),
    benefits: stringList(record, "benefits"),
    applicationProcess: stringList(
      record,
      "application_process",
      "applicationProcess",
    ),
    skills: stringList(record, "skills"),
    tags: stringList(record, "tags"),
  };
}

function missingFieldsFor(record: OpportunityRecord): string[] {
  const values = valuesFromRecord(record);
  return [
    ...(String(values.summary || "").trim().length >= 50 ? [] : ["summary"]),
    ...(String(values.description || "").trim().length >= 240
      ? []
      : ["description"]),
    ...(values.applicationUrl ? [] : ["application_url"]),
    ...(Array.isArray(values.requirements) && values.requirements.length
      ? []
      : ["requirements"]),
    ...(Array.isArray(values.benefits) && values.benefits.length
      ? []
      : ["benefits"]),
    ...(values.deadline ? [] : ["deadline"]),
  ];
}

function qualityFromRecord(
  record: OpportunityRecord,
): OpportunityEnhancementQuality {
  const metadata = metadataOf(record);
  const stored = Number(
    record.quality_score ??
      record.qualityScore ??
      metadata.extraction_quality_score ??
      metadata.quality_score,
  );
  if (Number.isFinite(stored) && stored >= 0) {
    return {
      score: Math.min(100, stored),
      missingFields: Array.isArray(metadata.extraction_missing_fields)
        ? metadata.extraction_missing_fields.map(String)
        : missingFieldsFor(record),
    };
  }

  const values = valuesFromRecord(record);
  const content = refineOpportunityContent(
    {
      summary: values.summary,
      description: values.description,
      requirements: values.requirements,
      benefits: values.benefits,
      applicationProcess: values.applicationProcess,
    },
    { sourceBacked: true },
  );
  return {
    score: content.qualityScore,
    missingFields: missingFieldsFor(record),
  };
}

function proposedValues(
  original: OpportunityRecord,
  candidate: OpportunityRecord,
  sourceBacked: boolean,
): OpportunityEnhancementValues {
  const raw = valuesFromRecord(candidate);
  const refinement = buildOpportunityContentUpdate(original, candidate);
  const safe = refinement.update;

  if (!sourceBacked) {
    return {
      ...raw,
      summary: refinement.content.summary,
      description: refinement.content.description,
    };
  }

  return {
    summary: refinement.content.summary,
    description: refinement.content.description,
    organization: safe.organization,
    location: safe.location,
    deadline: safe.deadline,
    applicationUrl: safe.applyUrl,
    sourceUrl: safe.sourceUrl,
    fundingType: safe.fundingType,
    targetRegion: safe.targetRegion,
    eligibilityCriteria: safe.eligibilityCriteria,
    eligibility: safe.eligibility,
    requirements: refinement.content.requirements,
    benefits: refinement.content.benefits,
    applicationProcess: refinement.content.applicationProcess,
    skills: safe.skills,
    tags: safe.tags,
  };
}

function scraperInput(record: OpportunityRecord): Record<string, unknown> {
  const metadata = metadataOf(record);
  return {
    ...record,
    source_url: sourceUrlOf(record),
    sourceUrl: sourceUrlOf(record),
    application_url: applicationUrlOf(record),
    apply_url: applicationUrlOf(record),
    requirements: stringList(record, "requirements"),
    benefits: stringList(record, "benefits"),
    application_process: stringList(
      record,
      "application_process",
      "applicationProcess",
    ),
    eligibility:
      firstValue(record, "eligibility") || metadata.eligibility || {},
  };
}

function signingSecret(): string {
  return String(
    process.env.OPPORTUNITY_REVIEW_SECRET ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.CLERK_SECRET_KEY ||
      "",
  ).trim();
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function selectedPayload(
  current: OpportunityRecord,
  preview: OpportunityEnhancementPreview,
  selected: Partial<Record<OpportunityEnhancementFieldName, unknown>>,
): OpportunityEnhancementPersistencePayload {
  const metadata = metadataOf(current);
  const nextMetadata: Record<string, unknown> = { ...metadata };
  const payload: OpportunityEnhancementPersistencePayload = {};

  if (Object.prototype.hasOwnProperty.call(selected, "summary")) {
    payload.summary = String(selected.summary || "");
  }
  if (Object.prototype.hasOwnProperty.call(selected, "description")) {
    payload.description = String(selected.description || "");
  }
  if (Object.prototype.hasOwnProperty.call(selected, "organization")) {
    payload.organization = selected.organization
      ? String(selected.organization)
      : null;
  }
  if (Object.prototype.hasOwnProperty.call(selected, "location")) {
    payload.location = selected.location ? String(selected.location) : null;
  }
  if (Object.prototype.hasOwnProperty.call(selected, "deadline")) {
    const deadline = selected.deadline ? String(selected.deadline) : null;
    payload.closeDate = deadline;
    payload.deadline = asDate(deadline);
  }
  if (Object.prototype.hasOwnProperty.call(selected, "applicationUrl")) {
    const url = selected.applicationUrl
      ? String(selected.applicationUrl)
      : null;
    payload.applicationUrl = url;
    payload.applyUrl = url;
  }
  if (Object.prototype.hasOwnProperty.call(selected, "sourceUrl")) {
    payload.sourceUrl = selected.sourceUrl ? String(selected.sourceUrl) : null;
  }
  if (Object.prototype.hasOwnProperty.call(selected, "fundingType")) {
    payload.fundingType = selected.fundingType
      ? String(selected.fundingType)
      : null;
    nextMetadata.funding_type = payload.fundingType;
  }
  if (Object.prototype.hasOwnProperty.call(selected, "targetRegion")) {
    payload.targetRegion = selected.targetRegion
      ? String(selected.targetRegion)
      : null;
    nextMetadata.target_region = payload.targetRegion;
  }
  if (Object.prototype.hasOwnProperty.call(selected, "eligibilityCriteria")) {
    payload.eligibilityCriteria = selected.eligibilityCriteria
      ? String(selected.eligibilityCriteria)
      : null;
    nextMetadata.eligibility_criteria = payload.eligibilityCriteria;
  }
  if (Object.prototype.hasOwnProperty.call(selected, "eligibility")) {
    payload.eligibility =
      selected.eligibility && typeof selected.eligibility === "object"
        ? (selected.eligibility as Record<string, unknown>)
        : null;
    nextMetadata.eligibility = payload.eligibility;
  }
  if (Object.prototype.hasOwnProperty.call(selected, "skills")) {
    payload.skills = Array.isArray(selected.skills)
      ? selected.skills.map(String)
      : [];
  }
  if (Object.prototype.hasOwnProperty.call(selected, "tags")) {
    payload.tags = Array.isArray(selected.tags)
      ? selected.tags.map(String)
      : [];
  }
  if (Object.prototype.hasOwnProperty.call(selected, "requirements")) {
    nextMetadata.requirements = Array.isArray(selected.requirements)
      ? selected.requirements.map(String)
      : [];
  }
  if (Object.prototype.hasOwnProperty.call(selected, "benefits")) {
    nextMetadata.benefits = Array.isArray(selected.benefits)
      ? selected.benefits.map(String)
      : [];
  }
  if (Object.prototype.hasOwnProperty.call(selected, "applicationProcess")) {
    nextMetadata.application_process = Array.isArray(
      selected.applicationProcess,
    )
      ? selected.applicationProcess.map(String)
      : [];
  }

  const mergedRecord: OpportunityRecord = {
    ...current,
    ...payload,
    summary: payload.summary ?? current.summary,
    description: payload.description ?? current.description,
    close_date: payload.closeDate ?? current.close_date,
    application_url: payload.applicationUrl ?? current.application_url,
    metadata: nextMetadata,
  };
  const values = valuesFromRecord(mergedRecord);
  const content = refineOpportunityContent(
    {
      summary: values.summary,
      description: values.description,
      requirements: values.requirements,
      benefits: values.benefits,
      applicationProcess: values.applicationProcess,
    },
    { sourceBacked: preview.sourceBacked, allowUnverifiedLists: true },
  );
  const missingFields = missingFieldsFor(mergedRecord);

  payload.qualityScore = content.qualityScore;
  payload.validationStatus = content.needsReview ? "needs_review" : "valid";
  payload.metadata = {
    ...nextMetadata,
    extraction_quality_score: content.qualityScore,
    extraction_missing_fields: missingFields,
    needs_review: content.needsReview,
    content_refined_at: new Date().toISOString(),
    opportunity_ai_review: {
      version: preview.version,
      reviewed_at: new Date().toISOString(),
      preview_created_at: preview.createdAt,
      source_backed: preview.sourceBacked,
      selected_fields: Object.keys(selected),
    },
  };

  return payload;
}

@Injectable()
export class OpportunityEnhancementReviewService {
  constructor(
    private readonly opportunitiesService: OpportunitiesService,
    private readonly scraperService: ScraperService,
    private readonly evidenceService: OpportunitySourceEvidenceService,
    private readonly repository: OpportunityEnhancementReviewRepository,
    private readonly embeddingService: OpportunityEmbeddingService,
    private readonly shareCardService: OpportunityShareCardService,
  ) {}

  async createPreview(id: string) {
    const original = (await this.opportunitiesService.findOne(
      id,
    )) as OpportunityRecord | null;
    if (!original) throw new NotFoundException("Opportunity not found");

    const secret = signingSecret();
    if (!secret) {
      throw new ServiceUnavailableException(
        "Opportunity AI review is not configured safely.",
      );
    }

    const evidence = await this.evidenceService.inspect(sourceUrlOf(original));
    let candidate = original;
    let aiError: string | null = null;
    let previewResult: any = null;

    try {
      previewResult = await this.scraperService.enhancePreviewOpportunity(
        scraperInput(original),
      );
      if (!previewResult?.success || !previewResult?.opportunity) {
        aiError = String(
          previewResult?.error || "The AI provider did not return a proposal.",
        );
      } else {
        candidate = previewResult.opportunity as OpportunityRecord;
      }
    } catch (error) {
      aiError = error instanceof Error ? error.message : String(error);
    }

    candidate = {
      ...candidate,
      metadata: {
        ...metadataOf(candidate),
        ai_source_text_used: evidence.sourceBacked,
      },
    };

    const createdAt = new Date();
    const beforeQuality = qualityFromRecord(original);
    const afterQuality: OpportunityEnhancementQuality = {
      score: Number(
        previewResult?.completeness?.score ??
          qualityFromRecord(candidate).score,
      ),
      missingFields: Array.isArray(previewResult?.completeness?.missingFields)
        ? previewResult.completeness.missingFields.map(String)
        : missingFieldsFor(candidate),
    };
    const baseUpdatedAt = toVersion(
      original.updated_at ?? original.updatedAt ?? original.created_at,
    );
    if (!baseUpdatedAt) {
      throw new ConflictException(
        "This opportunity has no stable edit version. Refresh it and try again.",
      );
    }

    const preview = buildOpportunityEnhancementReview({
      opportunityId: id,
      baseUpdatedAt,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + REVIEW_TTL_MS).toISOString(),
      sourceBacked: evidence.sourceBacked,
      before: valuesFromRecord(original),
      proposed: proposedValues(original, candidate, evidence.sourceBacked),
      beforeQuality,
      afterQuality,
      diagnostics: {
        aiAttempted: true,
        aiFallback: Boolean(aiError || !evidence.sourceBacked),
        aiError,
        sourceBacked: evidence.sourceBacked,
        evidenceError: evidence.error,
        sourceUrl: evidence.sourceUrl || sourceUrlOf(original) || null,
        sourceDomain: evidence.sourceDomain,
        sourceTextLength: evidence.sourceTextLength,
      },
    });

    return {
      success: true,
      preview,
      previewToken: signOpportunityEnhancementPreview(preview, secret),
    };
  }

  async applyPreview(id: string, body: ApplyOpportunityEnhancementDto) {
    const secret = signingSecret();
    if (!secret) {
      throw new ServiceUnavailableException(
        "Opportunity AI review is not configured safely.",
      );
    }

    let preview: OpportunityEnhancementPreview;
    try {
      preview = verifyOpportunityEnhancementPreviewToken(
        body.previewToken,
        secret,
      );
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "Invalid enhancement preview.",
      );
    }

    if (preview.opportunityId !== id) {
      throw new BadRequestException(
        "This preview was issued for a different opportunity id.",
      );
    }

    const current = (await this.opportunitiesService.findOne(
      id,
    )) as OpportunityRecord | null;
    if (!current) throw new NotFoundException("Opportunity not found");

    const currentVersion = toVersion(
      current.updated_at ?? current.updatedAt ?? current.created_at,
    );
    if (!currentVersion || currentVersion !== preview.baseUpdatedAt) {
      throw new ConflictException(
        "This opportunity changed after the AI preview was created. Reopen AI Improve to review the latest version.",
      );
    }

    let selected: Partial<Record<OpportunityEnhancementFieldName, unknown>>;
    try {
      selected = buildSelectedEnhancementUpdate(preview, {
        selectedFields: body.selectedFields,
        edits: body.edits,
      });
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "Invalid selected changes.",
      );
    }

    const payload = selectedPayload(current, preview, selected);
    const applied = await this.repository.apply(
      id,
      preview.baseUpdatedAt,
      payload,
    );
    if (!applied) {
      throw new ConflictException(
        "This opportunity changed while the review was being applied. Reopen AI Improve and try again.",
      );
    }

    await this.opportunitiesService.invalidateCatalogCache();
    const opportunity = (await this.opportunitiesService.findOne(
      id,
    )) as OpportunityRecord | null;
    if (!opportunity) throw new NotFoundException("Opportunity not found");

    void this.embeddingService.embedOpportunity(id);
    await this.shareCardService.ensureShareCardForOpportunity(opportunity, {
      force: true,
    });

    return {
      success: true,
      opportunity,
      appliedFields: Object.keys(selected) as OpportunityEnhancementFieldName[],
    };
  }
}
