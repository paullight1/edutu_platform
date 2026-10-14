/**
 * Thin public projection for opportunities served to anonymous/learner routes.
 *
 * The paid API (`/v1`) still owns the richer internal trust/source model. The
 * learner experience receives only the evidence needed to decide whether an
 * opportunity is safe to act on. Internal scores, provider ids, verification
 * errors/attempts and scheduling details remain private.
 */
import {
  deadlineNeedsReview,
  removeContradictoryDeadlineClaims,
} from "./deadline-description.util";
import { unwrapAddToAnyShareUrl } from "./source-evidence.util";

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
      return new URL(unwrapAddToAnyShareUrl(candidate)).hostname
        .replace(/^www\./, "")
        .toLowerCase();
    } catch {
      // Ignore malformed source strings; absence is safer than invented trust.
    }
  }
  return null;
}

function buildLearnerTrust(row: Record<string, unknown>) {
  const metadata = row.metadata as Record<string, unknown> | null | undefined;
  const verificationStatus =
    asNonEmptyString(row.verification_status) ??
    asNonEmptyString(row.verificationStatus) ??
    "unverified";
  const lastVerifiedAt =
    asNonEmptyString(row.last_verified_at) ??
    asNonEmptyString(row.lastVerifiedAt);
  const deadlineConfidence = asNonEmptyString(metadata?.deadline_confidence);
  const verificationMethod = asNonEmptyString(metadata?.verification_method);
  const domain = sourceDomain(row);
  const deadline = row.close_date ?? row.closeDate ?? row.deadline;

  return {
    verificationStatus,
    lastVerifiedAt,
    deadlineConfidence,
    deadlineNeedsReview: deadlineNeedsReview(
      metadata,
      row.description,
      row.summary,
      deadline,
    ),
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
    cleaned[key] =
      typeof value === "string" &&
      [
        "source_url",
        "sourceUrl",
        "canonical_url",
        "canonicalUrl",
        "application_url",
        "applicationUrl",
        "apply_url",
        "applyUrl",
        "link",
      ].includes(key)
        ? unwrapAddToAnyShareUrl(value)
        : value;
  }

  // Some older rows stored AddToAny's bare endpoint as canonical_url, without
  // the `linkurl` query parameter needed to unwrap it. When a usable article
  // source is present, prefer that source as the public canonical identity.
  const canonicalUrl = cleaned.canonical_url ?? cleaned.canonicalUrl;
  const sourceUrl = cleaned.source_url ?? cleaned.sourceUrl;
  if (
    typeof canonicalUrl === "string" &&
    typeof sourceUrl === "string" &&
    isAddToAnyUrl(canonicalUrl) &&
    !isAddToAnyUrl(sourceUrl)
  ) {
    if ("canonical_url" in cleaned) cleaned.canonical_url = sourceUrl;
    else cleaned.canonicalUrl = sourceUrl;
  }

  const canonicalDeadline = row.close_date ?? row.closeDate ?? row.deadline;
  for (const field of ["description", "summary"] as const) {
    cleaned[field] = removeContradictoryDeadlineClaims(
      cleaned[field],
      canonicalDeadline,
    );
  }

  const metadata = row.metadata as Record<string, unknown> | null | undefined;
  const sourceImageUrl = metadata?.source_image_url;
  if (typeof sourceImageUrl === "string" && sourceImageUrl.length > 0) {
    cleaned.source_image_url = sourceImageUrl;
  }

  const shareCard = metadata?.share_card as
    | Record<string, unknown>
    | null
    | undefined;
  const shareCardUrl = shareCard?.url;
  if (
    typeof shareCardUrl === "string" &&
    shareCardUrl.length > 0 &&
    cleaned.share_image_url == null
  ) {
    cleaned.share_image_url = shareCardUrl;
  }

  cleaned.trust = buildLearnerTrust(row);
  return cleaned;
}

function isAddToAnyUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "addtoany.com" || hostname === "www.addtoany.com";
  } catch {
    return false;
  }
}

export function stripInternalOpportunityFieldsBatch(
  rows: Record<string, unknown>[],
): PublicOpportunity[] {
  return rows.map((row) => stripInternalOpportunityFields(row));
}
