type OpportunityRecord = Record<string, any>;

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

export interface ResolvedShareImage {
  url: string;
  usingBrandedCard: boolean;
  needsCard: boolean;
}

/**
 * Resolve the image a shared opportunity link should unfurl with.
 * Priority: scraped source flyer → opportunity image → existing/just-generated
 * branded card. The generic icon is returned ONLY when nothing else exists and
 * no card could be generated — callers should generate a card when `needsCard`.
 */
export function resolveShareImage(
  opp: OpportunityRecord,
  opts: { cardUrl?: string; defaultImage: string },
): ResolvedShareImage {
  const metadata = asRecord(opp.metadata);
  const sourceImage =
    clean(metadata.source_image_url) ||
    clean(opp.source_image_url || opp.sourceImageUrl);
  const image =
    clean(opp.image_url || opp.imageUrl) ||
    clean(opp.share_image_url || opp.shareImageUrl);
  const existingCard = clean(asRecord(metadata.share_card).url);
  const card = clean(opts.cardUrl) || existingCard;

  const real = sourceImage || image;
  if (real) {
    return { url: real, usingBrandedCard: false, needsCard: false };
  }
  if (card) {
    return { url: card, usingBrandedCard: true, needsCard: false };
  }
  return { url: opts.defaultImage, usingBrandedCard: false, needsCard: true };
}
