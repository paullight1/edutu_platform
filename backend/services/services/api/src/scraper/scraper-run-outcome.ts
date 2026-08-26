import type { RunOutcome } from "./scraper.types";

export function mergeRunOutcomes(
  accumulated: RunOutcome | null,
  next: RunOutcome | null,
): RunOutcome | null {
  if (!next) return accumulated;
  if (!accumulated) return next;

  const missingFieldCounts = { ...accumulated.missingFieldCounts };
  for (const [field, count] of Object.entries(next.missingFieldCounts)) {
    missingFieldCounts[field] = (missingFieldCounts[field] ?? 0) + count;
  }

  return {
    saved: accumulated.saved + next.saved,
    published: accumulated.published + next.published,
    needsReview: accumulated.needsReview + next.needsReview,
    withDeadline: accumulated.withDeadline + next.withDeadline,
    withImage: accumulated.withImage + next.withImage,
    withOrganization: accumulated.withOrganization + next.withOrganization,
    withDirectApplyLink:
      accumulated.withDirectApplyLink + next.withDirectApplyLink,
    duplicateImagesStripped:
      accumulated.duplicateImagesStripped + next.duplicateImagesStripped,
    missingFieldCounts,
  };
}
