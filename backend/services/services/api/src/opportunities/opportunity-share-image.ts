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
 * Prefer the Edutu opportunity flyer, which uses the listing's exact text.
 * Source-page images may be portraits or decorative photos rather than flyers.
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

  if (card) {
    return { url: card, usingBrandedCard: true, needsCard: false };
  }
  const real = sourceImage || image;
  if (real) {
    return { url: real, usingBrandedCard: false, needsCard: true };
  }
  return { url: opts.defaultImage, usingBrandedCard: false, needsCard: true };
}
