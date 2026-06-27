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
  return cleaned;
}

export function stripInternalOpportunityFieldsBatch(
  rows: Record<string, unknown>[],
): PublicOpportunity[] {
  return rows.map((row) => stripInternalOpportunityFields(row));
}
