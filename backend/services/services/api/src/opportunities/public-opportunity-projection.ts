/**
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
  cleaned.benefits = publicList(row, metadata, ["benefits"], ["benefits"]);
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

  const learnerStrings: Array<[string, string[], string[]]> = [
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
