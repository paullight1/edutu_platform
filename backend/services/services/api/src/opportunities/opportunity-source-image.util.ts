type OpportunityImageRecord = {
  image_url?: unknown;
  metadata?: unknown;
};

function isOriginalHttpImageUrl(value: unknown): value is string {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return false;

  try {
    const url = new URL(value);
    return (
      !url.username &&
      !url.password &&
      !url.port &&
      !url.pathname.includes("/opportunity-share-cards/")
    );
  } catch {
    return false;
  }
}

export function getOpportunitySourceImageUrls(
  opportunity: OpportunityImageRecord,
): string[] {
  const metadata =
    opportunity.metadata && typeof opportunity.metadata === "object"
      ? (opportunity.metadata as Record<string, unknown>)
      : {};

  return Array.from(
    new Set(
      [metadata.source_image_url, opportunity.image_url].filter(
        isOriginalHttpImageUrl,
      ),
    ),
  );
}

export function getOpportunitySourceImageUrl(
  opportunity: OpportunityImageRecord,
): string | null {
  return getOpportunitySourceImageUrls(opportunity)[0] ?? null;
}
