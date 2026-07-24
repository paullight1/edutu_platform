/**
 * Thin public projection for opportunities served to anonymous/learner routes.
 *
 * The paid API (`/v1`) returns a rich normalized DTO including a `trust` block
 * (verification status, quality score, last-verified) and full source tracking.
 * The public learner feed intentionally drops those internal/paid-value fields
 * so the catalog cannot be harvested for free at parity with the paid product,
 * while keeping every field the learner UI renders.
 *
 * Operates by denylist (removes known-internal keys in both snake_case and
 * camelCase forms) so it never accidentally drops a field the UI depends on.
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

export function stripInternalOpportunityFields(
  row: Record<string, unknown>,
): PublicOpportunity {
  const cleaned: PublicOpportunity = {};
  for (const [key, value] of Object.entries(row)) {
    if ((INTERNAL_FIELDS as readonly string[]).includes(key)) continue;
    cleaned[key] = value;
  }
  // Hoist the scraper-recorded original image URL out of the (stripped)
  // metadata so web clients keep their image fallback.
  const metadata = row.metadata as Record<string, unknown> | null | undefined;
  const sourceImageUrl = metadata?.source_image_url;
  if (typeof sourceImageUrl === "string" && sourceImageUrl.length > 0) {
    cleaned.source_image_url = sourceImageUrl;
  }
  // Hoist the generated share card too: clients use it for share sheets and
  // as the image fallback when the scraper found no unique source image.
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

  // Curated trust block. Credibility is the product's moat, yet learners saw
  // none of the verification work — verification_status/last_verified_at and the
  // deadline confidence were all stripped. This hoists a SAFE subset (a boolean,
  // a timestamp, a confidence label) so the UI can show "Verified · checked 2h
  // ago" and mark estimated/rolling deadlines, without exposing the paid DTO or
  // anything harvestable.
  cleaned.trust = {
    verified:
      row.verification_status === "verified" && row.status === "active",
    lastVerifiedAt:
      typeof row.last_verified_at === "string" ? row.last_verified_at : null,
    deadlineConfidence: normalizeDeadlineConfidence(
      metadata?.deadline_confidence,
    ),
  };
  return cleaned;
}

type PublicDeadlineConfidence =
  | "explicit"
  | "inferred"
  | "rolling"
  | "unknown";

function normalizeDeadlineConfidence(value: unknown): PublicDeadlineConfidence {
  return value === "explicit" ||
    value === "inferred" ||
    value === "rolling" ||
    value === "unknown"
    ? value
    : "unknown";
}

export function stripInternalOpportunityFieldsBatch(
  rows: Record<string, unknown>[],
): PublicOpportunity[] {
  return rows.map((row) => stripInternalOpportunityFields(row));
}
