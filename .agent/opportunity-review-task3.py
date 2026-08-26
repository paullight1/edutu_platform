from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    if text.count(old) != 1:
        raise RuntimeError(f"Expected one match in {path}, found {text.count(old)}")
    target.write_text(text.replace(old, new), encoding="utf-8")


def replace_regex(path: str, pattern: str, replacement: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"Expected one regex match in {path}, found {count}")
    target.write_text(updated, encoding="utf-8")


write(
    "backend/services/services/api/src/opportunities/opportunity-metadata-merge.ts",
    r'''export type OpportunityMetadata = Record<string, unknown>;
export type OpportunityMetadataInput = Record<string, unknown>;

function hasOwn(record: OpportunityMetadataInput, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function firstOwn(
  record: OpportunityMetadataInput,
  keys: string[],
): { present: boolean; value: unknown } {
  for (const key of keys) {
    if (hasOwn(record, key)) return { present: true, value: record[key] };
  }
  return { present: false, value: undefined };
}

function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/\s+/g, " ").trim();
  return cleaned || null;
}

function cleanTextList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.replace(/\s+/g, " ").trim())
        .filter(Boolean),
    ),
  );
}

function isPlainObject(value: unknown): value is OpportunityMetadata {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype,
  );
}

export function mergeOpportunityMetadata(
  existing: OpportunityMetadata | null | undefined,
  patch: OpportunityMetadata | null | undefined,
): OpportunityMetadata {
  const base = isPlainObject(existing) ? existing : {};
  const next = isPlainObject(patch) ? patch : {};
  const merged: OpportunityMetadata = { ...base };

  for (const [key, value] of Object.entries(next)) {
    const previous = merged[key];
    merged[key] =
      isPlainObject(previous) && isPlainObject(value)
        ? mergeOpportunityMetadata(previous, value)
        : value;
  }

  return merged;
}

export function buildOpportunityMetadataPatch(
  input: OpportunityMetadataInput,
): OpportunityMetadata {
  const patch: OpportunityMetadata = {};

  const summary = firstOwn(input, ["summary"]);
  if (summary.present) patch.summary = cleanText(summary.value);

  const organization = firstOwn(input, ["organization"]);
  if (organization.present) patch.organization = cleanText(organization.value);

  const eligibilityCriteria = firstOwn(input, [
    "eligibilityCriteria",
    "eligibility_criteria",
  ]);
  if (eligibilityCriteria.present) {
    patch.eligibility_criteria = cleanText(eligibilityCriteria.value);
  }

  const fundingType = firstOwn(input, ["fundingType", "funding_type"]);
  if (fundingType.present) patch.funding_type = cleanText(fundingType.value);

  const targetRegion = firstOwn(input, ["targetRegion", "target_region"]);
  if (targetRegion.present) patch.target_region = cleanText(targetRegion.value);

  const eligibility = firstOwn(input, ["eligibility"]);
  if (eligibility.present) {
    patch.eligibility = isPlainObject(eligibility.value)
      ? eligibility.value
      : eligibility.value === null
        ? null
        : {};
  }

  const requirements = firstOwn(input, ["requirements"]);
  if (requirements.present) {
    patch.requirements = cleanTextList(requirements.value);
  }

  const benefits = firstOwn(input, ["benefits"]);
  if (benefits.present) patch.benefits = cleanTextList(benefits.value);

  const applicationProcess = firstOwn(input, [
    "applicationProcess",
    "application_process",
  ]);
  if (applicationProcess.present) {
    patch.application_process = cleanTextList(applicationProcess.value);
  }

  const qualityScore = firstOwn(input, ["qualityScore", "quality_score"]);
  if (qualityScore.present) patch.quality_score = qualityScore.value ?? null;

  const validationStatus = firstOwn(input, [
    "validationStatus",
    "validation_status",
  ]);
  if (validationStatus.present) {
    patch.validation_status = cleanText(validationStatus.value);
  }

  return patch;
}
''',
)

write(
    "backend/services/services/api/src/opportunities/public-opportunity-projection.ts",
    r'''/**
 * Thin public projection for opportunities served to anonymous/learner routes.
 *
 * The paid API (`/v1`) still owns the richer internal trust/source model. The
 * learner experience receives only the evidence needed to decide whether an
 * opportunity is safe to act on. Internal scores, provider ids, verification
 * errors/attempts and scheduling details remain private.
 */
const INTERNAL_FIELDS = [
  "original_json",
  "originalJson",
  "verification_error",
  "verificationError",
  "verification_attempts",
  "verificationAttempts",
  "verification_next_check_at",
  "verificationNextCheckAt",
  "last_http_status",
  "lastHttpStatus",
  "broken_link_count",
  "brokenLinkCount",
  "duplicate_of",
  "duplicateOf",
  "content_fingerprint",
  "contentFingerprint",
  "validation_status",
  "validationStatus",
  "verification_status",
  "verificationStatus",
  "verification_next_check_at",
  "created_by",
  "createdBy",
  "metadata",
  "quality_score",
  "qualityScore",
  "last_verified_at",
  "lastVerifiedAt",
  "first_seen_at",
  "firstSeenAt",
  "last_seen_at",
  "lastSeenAt",
  "source",
  "provider_id",
  "providerId",
  "embedding",
  "embedding_model",
  "embeddingModel",
  "search_tsv",
  "searchTsv",
] as const;

export type PublicOpportunity = Record<string, unknown>;

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function cleanStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.replace(/\s+/g, " ").trim())
        .filter(Boolean),
    ),
  );
}

function publicList(
  row: Record<string, unknown>,
  metadata: Record<string, unknown>,
  topLevelKeys: string[],
  metadataKeys: string[],
): string[] {
  for (const key of topLevelKeys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      return cleanStringList(row[key]);
    }
  }
  for (const key of metadataKeys) {
    if (Object.prototype.hasOwnProperty.call(metadata, key)) {
      return cleanStringList(metadata[key]);
    }
  }
  return [];
}

function publicString(
  row: Record<string, unknown>,
  metadata: Record<string, unknown>,
  topLevelKeys: string[],
  metadataKeys: string[],
): string | null {
  for (const key of topLevelKeys) {
    const value = asNonEmptyString(row[key]);
    if (value) return value;
  }
  for (const key of metadataKeys) {
    const value = asNonEmptyString(metadata[key]);
    if (value) return value;
  }
  return null;
}

function publicRecord(
  row: Record<string, unknown>,
  metadata: Record<string, unknown>,
  topLevelKeys: string[],
  metadataKeys: string[],
): Record<string, unknown> | null {
  for (const key of topLevelKeys) {
    const value = asRecord(row[key]);
    if (value) return value;
  }
  for (const key of metadataKeys) {
    const value = asRecord(metadata[key]);
    if (value) return value;
  }
  return null;
}

function sourceDomain(row: Record<string, unknown>): string | null {
  const candidates = [
    row.source_url,
    row.sourceUrl,
    row.canonical_url,
    row.canonicalUrl,
    row.application_url,
    row.applicationUrl,
    row.apply_url,
    row.applyUrl,
  ];
  for (const value of candidates) {
    const candidate = asNonEmptyString(value);
    if (!candidate) continue;
    try {
      return new URL(candidate).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      // Ignore malformed source strings; absence is safer than invented trust.
    }
  }
  return null;
}

function buildLearnerTrust(row: Record<string, unknown>) {
  const metadata = asRecord(row.metadata) ?? {};
  const verificationStatus =
    asNonEmptyString(row.verification_status) ??
    asNonEmptyString(row.verificationStatus) ??
    "unverified";
  const lastVerifiedAt =
    asNonEmptyString(row.last_verified_at) ??
    asNonEmptyString(row.lastVerifiedAt);
  const deadlineConfidence = asNonEmptyString(metadata.deadline_confidence);
  const verificationMethod = asNonEmptyString(metadata.verification_method);
  const domain = sourceDomain(row);

  return {
    verificationStatus,
    lastVerifiedAt,
    deadlineConfidence,
    verificationMethod,
    sourceDomain: domain,
  };
}

export function stripInternalOpportunityFields(
  row: Record<string, unknown>,
): PublicOpportunity {
  const cleaned: PublicOpportunity = {};
  for (const [key, value] of Object.entries(row)) {
    if ((INTERNAL_FIELDS as readonly string[]).includes(key)) continue;
    cleaned[key] = value;
  }

  const metadata = asRecord(row.metadata) ?? {};
  const sourceImageUrl = metadata.source_image_url;
  if (typeof sourceImageUrl === "string" && sourceImageUrl.length > 0) {
    cleaned.source_image_url = sourceImageUrl;
  }

  const shareCard = asRecord(metadata.share_card);
  const shareCardUrl = shareCard?.url;
  if (
    typeof shareCardUrl === "string" &&
    shareCardUrl.length > 0 &&
    cleaned.share_image_url == null
  ) {
    cleaned.share_image_url = shareCardUrl;
  }

  cleaned.requirements = publicList(
    row,
    metadata,
    ["requirements"],
    ["requirements"],
  );
  cleaned.benefits = publicList(
    row,
    metadata,
    ["benefits"],
    ["benefits"],
  );
  cleaned.application_process = publicList(
    row,
    metadata,
    ["application_process", "applicationProcess"],
    ["application_process", "applicationProcess"],
  );

  const eligibility = publicRecord(
    row,
    metadata,
    ["eligibility"],
    ["eligibility"],
  );
  if (eligibility) cleaned.eligibility = eligibility;

  const learnerStrings: Array<[
    string,
    string[],
    string[],
  ]> = [
    [
      "eligibility_criteria",
      ["eligibility_criteria", "eligibilityCriteria"],
      ["eligibility_criteria", "eligibilityCriteria"],
    ],
    [
      "funding_type",
      ["funding_type", "fundingType"],
      ["funding_type", "fundingType"],
    ],
    [
      "target_region",
      ["target_region", "targetRegion"],
      ["target_region", "targetRegion"],
    ],
    [
      "content_updated_at",
      ["content_updated_at", "contentUpdatedAt"],
      ["content_refined_at", "content_updated_at", "contentUpdatedAt"],
    ],
  ];
  for (const [outputKey, rowKeys, metadataKeys] of learnerStrings) {
    const value = publicString(row, metadata, rowKeys, metadataKeys);
    if (value) cleaned[outputKey] = value;
  }

  const domain = sourceDomain(row);
  if (domain) cleaned.source_domain = domain;

  cleaned.trust = buildLearnerTrust(row);
  return cleaned;
}

export function stripInternalOpportunityFieldsBatch(
  rows: Record<string, unknown>[],
): PublicOpportunity[] {
  return rows.map((row) => stripInternalOpportunityFields(row));
}
''',
)

write(
    "backend/services/services/api/src/opportunities/dto/create-opportunity.dto.ts",
    r'''import { z } from "zod";

const OpportunityTextListSchema = z
  .array(z.string().max(1_000))
  .max(50);

export const CreateOpportunitySchema = z.object({
  title: z.string().min(1),
  summary: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  organization: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  type: z.string().optional().default("scholarship"),
  eligibilityCriteria: z.string().optional().nullable(),
  eligibility_criteria: z.string().optional().nullable(),
  fundingType: z.string().optional().nullable(),
  funding_type: z.string().optional().nullable(),
  targetRegion: z.string().optional().nullable(),
  target_region: z.string().optional().nullable(),
  deadline: z.string().optional().nullable(),
  sourceUrl: z.string().optional().nullable(),
  source_url: z.string().optional().nullable(),
  applyUrl: z.string().optional().nullable(),
  applicationUrl: z.string().optional().nullable(),
  application_url: z.string().optional().nullable(),
  apply_url: z.string().optional().nullable(),
  link: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  image_url: z.string().optional().nullable(),
  eligibility: z.record(z.string(), z.unknown()).optional().nullable(),
  requirements: OpportunityTextListSchema.optional(),
  benefits: OpportunityTextListSchema.optional(),
  applicationProcess: OpportunityTextListSchema.optional(),
  application_process: OpportunityTextListSchema.optional(),
  skills: OpportunityTextListSchema.optional(),
  tags: OpportunityTextListSchema.optional(),
  isFeatured: z.boolean().optional().default(false),
  is_featured: z.boolean().optional(),
  isRemote: z.boolean().optional().default(true),
  is_remote: z.boolean().optional(),
  status: z.string().optional().default("pending_review"),
  qualityScore: z.number().min(0).max(100).optional().nullable(),
  quality_score: z.number().min(0).max(100).optional().nullable(),
  validationStatus: z.string().optional().nullable(),
  validation_status: z.string().optional().nullable(),
});

export type CreateOpportunityDto = z.infer<typeof CreateOpportunitySchema>;

export const UpdateOpportunitySchema = CreateOpportunitySchema.partial();

export type UpdateOpportunityDto = z.infer<typeof UpdateOpportunitySchema>;

export const BulkImportOpportunitySchema = CreateOpportunitySchema.extend({
  sourceUrl: z.string().min(1),
}).passthrough();

export const BulkImportSchema = z.object({
  apiKey: z.string().optional(),
  items: z.array(BulkImportOpportunitySchema).min(1).max(100),
});

export type BulkImportDto = z.infer<typeof BulkImportSchema>;

// Admin bulk actions: ids are opportunity UUIDs, capped to keep updates bounded.
const BulkIdsField = z.array(z.string().uuid()).min(1).max(200);

export const BulkStatusSchema = z.object({
  ids: BulkIdsField,
  status: z.string().min(1),
});

export type BulkStatusDto = z.infer<typeof BulkStatusSchema>;

export const BulkCategorySchema = z.object({
  ids: BulkIdsField,
  category: z.string().min(1),
});

export type BulkCategoryDto = z.infer<typeof BulkCategorySchema>;

export const BulkIdsSchema = z.object({
  ids: BulkIdsField,
});

export type BulkIdsDto = z.infer<typeof BulkIdsSchema>;

export const BulkVerifySchema = z.object({
  ids: BulkIdsField,
  dryRun: z.boolean().optional(),
});

export type BulkVerifyDto = z.infer<typeof BulkVerifySchema>;
''',
)

service_path = "backend/services/services/api/src/opportunities/opportunities.service.ts"
replace_once(
    service_path,
    'import { readOpportunityQualityScorecard } from "./opportunity-quality-scorecard";\n',
    'import { readOpportunityQualityScorecard } from "./opportunity-quality-scorecard";\nimport {\n  buildOpportunityMetadataPatch,\n  mergeOpportunityMetadata,\n} from "./opportunity-metadata-merge";\n',
)

replace_once(
    service_path,
    '''  eligibilityCriteria: z.string().optional().nullable(),
  fundingType: z.string().optional().nullable(),
  targetRegion: z.string().optional().nullable(),
  deadline: z.string().optional().nullable(),
  sourceUrl: z.string().optional().nullable(),
  applyUrl: z.string().optional().nullable(),
  applicationUrl: z.string().optional().nullable(),
  application_url: z.string().optional().nullable(),
  apply_url: z.string().optional().nullable(),
  link: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  eligibility: z.record(z.string(), z.unknown()).optional(),
  isFeatured: z.boolean().optional().default(false),
  isRemote: z.boolean().optional().default(true),
  status: z.string().optional().default("pending_review"),
  tags: z.array(z.string()).optional(),
''',
    '''  eligibilityCriteria: z.string().optional().nullable(),
  eligibility_criteria: z.string().optional().nullable(),
  fundingType: z.string().optional().nullable(),
  funding_type: z.string().optional().nullable(),
  targetRegion: z.string().optional().nullable(),
  target_region: z.string().optional().nullable(),
  deadline: z.string().optional().nullable(),
  sourceUrl: z.string().optional().nullable(),
  source_url: z.string().optional().nullable(),
  applyUrl: z.string().optional().nullable(),
  applicationUrl: z.string().optional().nullable(),
  application_url: z.string().optional().nullable(),
  apply_url: z.string().optional().nullable(),
  link: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  image_url: z.string().optional().nullable(),
  eligibility: z.record(z.string(), z.unknown()).optional().nullable(),
  requirements: z.array(z.string()).optional(),
  benefits: z.array(z.string()).optional(),
  applicationProcess: z.array(z.string()).optional(),
  application_process: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  isFeatured: z.boolean().optional().default(false),
  is_featured: z.boolean().optional(),
  isRemote: z.boolean().optional().default(true),
  is_remote: z.boolean().optional(),
  status: z.string().optional().default("pending_review"),
  tags: z.array(z.string()).optional(),
  qualityScore: z.number().optional().nullable(),
  quality_score: z.number().optional().nullable(),
  validationStatus: z.string().optional().nullable(),
  validation_status: z.string().optional().nullable(),
''',
)

update_method = r'''  async update(id: string, data: Partial<CreateOpportunityDto>) {
    const existing = await this.findOne(id);
    if (!existing) throw new NotFoundException("Opportunity not found");

    const existingMetadata =
      existing.metadata &&
      typeof existing.metadata === "object" &&
      !Array.isArray(existing.metadata)
        ? (existing.metadata as Record<string, unknown>)
        : {};
    const canonicalPayload = this.toCanonicalOpportunityPayload(
      data,
      undefined,
      { partial: true, existingMetadata },
    );

    this.invalidateReadCaches();
    if (this.supabase) {
      const { data: updated, error } = await this.supabase
        .from("opportunities")
        .update({
          ...canonicalPayload,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .maybeSingle();

      if (!error && updated) {
        return withOpportunityUrlAliases(updated as Record<string, any>);
      }

      if (!error) throw new NotFoundException("Opportunity not found");
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          "Another opportunity already uses this apply or source URL. Change the URL and try again.",
        );
      }

      this.logger.warn(
        `Canonical opportunity update failed, trying direct DB update: ${error.message}`,
      );
    }

    const updateData = this.toDrizzleOpportunityUpdate(canonicalPayload);
    try {
      await db
        .update(opportunities)
        .set(updateData)
        .where(eq(opportunities.id, id))
        .execute();
    } catch (error: any) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          "Another opportunity already uses this apply or source URL. Change the URL and try again.",
        );
      }
      throw error;
    }

    return this.findOne(id);
  }

  private toDrizzleOpportunityUpdate(
    payload: Record<string, unknown>,
  ): Partial<typeof opportunities.$inferInsert> {
    const updateData: Partial<typeof opportunities.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (payload.title !== undefined) updateData.title = String(payload.title);
    if (payload.summary !== undefined)
      updateData.summary = payload.summary === null ? null : String(payload.summary);
    if (payload.description !== undefined)
      updateData.description =
        payload.description === null ? null : String(payload.description);
    if (payload.category !== undefined)
      updateData.category = payload.category === null ? null : String(payload.category);
    if (payload.canonical_category !== undefined)
      updateData.canonicalCategory = String(payload.canonical_category);
    if (payload.organization !== undefined)
      updateData.organization =
        payload.organization === null ? null : String(payload.organization);
    if (payload.location !== undefined)
      updateData.location =
        payload.location === null ? null : String(payload.location);
    if (payload.type !== undefined) updateData.type = String(payload.type);
    if (payload.eligibility_criteria !== undefined)
      updateData.eligibilityCriteria =
        payload.eligibility_criteria === null
          ? null
          : String(payload.eligibility_criteria);
    if (payload.eligibility !== undefined)
      updateData.eligibility = payload.eligibility as any;
    if (payload.funding_type !== undefined)
      updateData.fundingType =
        payload.funding_type === null ? null : String(payload.funding_type);
    if (payload.target_region !== undefined)
      updateData.targetRegion =
        payload.target_region === null ? null : String(payload.target_region);
    if (payload.close_date !== undefined) {
      const deadline = payload.close_date
        ? String(payload.close_date).slice(0, 10)
        : null;
      updateData.closeDate = deadline;
      const parsed = deadline ? new Date(deadline) : null;
      updateData.deadline =
        parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
    }
    if (payload.source_url !== undefined)
      updateData.sourceUrl =
        payload.source_url === null ? null : String(payload.source_url);
    if (payload.application_url !== undefined) {
      const applicationUrl =
        payload.application_url === null
          ? null
          : String(payload.application_url);
      updateData.applicationUrl = applicationUrl;
      updateData.applyUrl = applicationUrl;
    }
    if (payload.canonical_url !== undefined)
      updateData.canonicalUrl =
        payload.canonical_url === null ? null : String(payload.canonical_url);
    if (payload.image_url !== undefined)
      updateData.imageUrl =
        payload.image_url === null ? null : String(payload.image_url);
    if (payload.tags !== undefined) updateData.tags = payload.tags as string[];
    if (payload.skills !== undefined)
      updateData.skills = payload.skills as string[];
    if (payload.is_remote !== undefined)
      updateData.isRemote = Boolean(payload.is_remote);
    if (payload.is_featured !== undefined)
      updateData.isFeatured = Boolean(payload.is_featured);
    if (payload.quality_score !== undefined)
      updateData.qualityScore =
        payload.quality_score === null ? null : Number(payload.quality_score);
    if (payload.validation_status !== undefined)
      updateData.validationStatus =
        payload.validation_status === null
          ? null
          : String(payload.validation_status);
    if (payload.status !== undefined) updateData.status = String(payload.status);
    if (payload.metadata !== undefined)
      updateData.metadata = payload.metadata as Record<string, unknown>;
    return updateData;
  }

  // Postgres unique-violation detector'''
replace_regex(
    service_path,
    r'  async update\(id: string, data: Partial<CreateOpportunityDto>\) \{.*?\n  // Postgres unique-violation detector',
    update_method,
)

canonical_method = r'''  private toCanonicalOpportunityPayload(
    input: Partial<CreateOpportunityDto> & Record<string, any>,
    defaultStatus?: string,
    options: {
      partial?: boolean;
      existingMetadata?: Record<string, unknown>;
    } = {},
  ) {
    const record = input as Record<string, any>;
    const partial = options.partial === true;
    const hasOwn = (...keys: string[]) =>
      keys.some((key) => Object.prototype.hasOwnProperty.call(record, key));
    const ownValue = (...keys: string[]) => {
      for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(record, key)) return record[key];
      }
      return undefined;
    };

    const metadataPatch = buildOpportunityMetadataPatch(record);
    const shouldClassify = !partial || hasOwn("category");
    const classification = shouldClassify
      ? classifyOpportunity(input as Record<string, unknown>)
      : null;
    if (classification) {
      metadataPatch.canonical_category = classification.canonicalCategory;
      metadataPatch.classification_confidence = classification.confidence;
      metadataPatch.classification_reason = classification.reason;
      metadataPatch.classification_source = classification.source;
      metadataPatch.classification_signals = classification.matchedSignals;
      metadataPatch.classification_needs_review = classification.needsReview;
    }

    const summaryProvided = hasOwn("summary") || (!partial && hasOwn("description"));
    const summary = summaryProvided
      ? this.normalizeSummary(
          ownValue("summary") ?? ownValue("description") ?? "",
          ownValue("description") ?? "",
          String(input.title ?? ""),
        )
      : undefined;
    if (hasOwn("summary")) metadataPatch.summary = summary || null;

    const organizationProvided = hasOwn("organization");
    const organization = organizationProvided
      ? this.cleanOptionalText(ownValue("organization") ?? "", 200) || null
      : undefined;
    if (organizationProvided) metadataPatch.organization = organization;

    const eligibilityCriteriaProvided = hasOwn(
      "eligibilityCriteria",
      "eligibility_criteria",
    );
    const eligibilityCriteria = eligibilityCriteriaProvided
      ? ownValue("eligibilityCriteria", "eligibility_criteria") ?? null
      : undefined;
    const fundingTypeProvided = hasOwn("fundingType", "funding_type");
    const fundingType = fundingTypeProvided
      ? ownValue("fundingType", "funding_type") ?? null
      : undefined;
    const targetRegionProvided = hasOwn("targetRegion", "target_region");
    const targetRegion = targetRegionProvided
      ? ownValue("targetRegion", "target_region") ?? null
      : undefined;
    const sourceUrlProvided = hasOwn("sourceUrl", "source_url");
    const sourceUrl = sourceUrlProvided
      ? ownValue("sourceUrl", "source_url") ?? null
      : undefined;
    const applicationUrlProvided = hasOwn(
      "applyUrl",
      "applicationUrl",
      "application_url",
      "apply_url",
      "link",
    );
    const applicationUrl = applicationUrlProvided
      ? pickOpportunityUrl(
          ownValue("applyUrl"),
          ownValue("applicationUrl"),
          ownValue("application_url"),
          ownValue("apply_url"),
          ownValue("link"),
        ) || null
      : !partial && sourceUrlProvided
        ? String(sourceUrl || "") || null
        : undefined;
    const deadlineProvided = hasOwn("deadline", "close_date", "closeDate");
    const deadline = deadlineProvided
      ? ownValue("deadline", "close_date", "closeDate") ?? null
      : undefined;
    const imageProvided = hasOwn("imageUrl", "image_url");
    const imageUrl = imageProvided
      ? ownValue("imageUrl", "image_url") ?? null
      : undefined;
    const isFeaturedProvided = hasOwn("isFeatured", "is_featured");
    const isRemoteProvided = hasOwn("isRemote", "is_remote");
    const qualityProvided = hasOwn("qualityScore", "quality_score");
    const validationProvided = hasOwn(
      "validationStatus",
      "validation_status",
    );

    const mergedMetadata = mergeOpportunityMetadata(
      options.existingMetadata,
      metadataPatch,
    );
    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
      title: hasOwn("title") ? input.title : undefined,
      summary,
      description: hasOwn("description") ? input.description : undefined,
      category: hasOwn("category") ? input.category : undefined,
      canonical_category: classification?.canonicalCategory,
      organization,
      location:
        hasOwn("location") || targetRegionProvided
          ? ownValue("location") ?? targetRegion ?? null
          : undefined,
      type: hasOwn("type") ? input.type : undefined,
      is_remote: isRemoteProvided
        ? Boolean(ownValue("isRemote", "is_remote"))
        : undefined,
      close_date: deadline,
      skills: hasOwn("skills")
        ? this.normalizeStringList(record.skills)
        : undefined,
      eligibility_criteria: eligibilityCriteria,
      eligibility: hasOwn("eligibility") ? record.eligibility ?? null : undefined,
      funding_type: fundingType,
      target_region:
        targetRegionProvided
          ? targetRegion
          : !partial && hasOwn("location")
            ? input.location
            : undefined,
      source_url: sourceUrl,
      application_url: applicationUrl,
      canonical_url:
        applicationUrl !== undefined
          ? applicationUrl
            ? this.normalizeUrlForStorage(String(applicationUrl))
            : null
          : undefined,
      image_url: imageUrl,
      is_featured: isFeaturedProvided
        ? Boolean(ownValue("isFeatured", "is_featured"))
        : undefined,
      tags: hasOwn("tags") ? this.normalizeStringList(record.tags) : undefined,
      status:
        hasOwn("status") || defaultStatus !== undefined
          ? canonicalOpportunityStatus(input.status, defaultStatus)
          : undefined,
      quality_score: qualityProvided
        ? ownValue("qualityScore", "quality_score") ?? null
        : undefined,
      validation_status: validationProvided
        ? ownValue("validationStatus", "validation_status") ?? null
        : undefined,
      last_seen_at: partial ? undefined : now,
      verification_next_check_at: partial ? undefined : now,
      metadata:
        !partial || Object.keys(metadataPatch).length > 0
          ? mergedMetadata
          : undefined,
    };

    return Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined),
    );
  }

  private normalizeUrlForStorage'''
replace_regex(
    service_path,
    r'  private toCanonicalOpportunityPayload\(.*?\n  private normalizeUrlForStorage',
    canonical_method,
)
