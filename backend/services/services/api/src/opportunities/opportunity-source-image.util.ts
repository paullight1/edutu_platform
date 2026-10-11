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

export function getOpportunitySourceImageUrl(
  opportunity: OpportunityImageRecord,
): string | null {
  const metadata =
    opportunity.metadata && typeof opportunity.metadata === "object"
      ? (opportunity.metadata as Record<string, unknown>)
      : {};

  return (
    [metadata.source_image_url, opportunity.image_url].find(
      isOriginalHttpImageUrl,
    ) ?? null
  );
}
