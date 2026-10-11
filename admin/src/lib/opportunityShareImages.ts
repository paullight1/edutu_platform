export interface OpportunityShareImage {
  url: string;
  path: string;
  format: "png" | "svg" | "jpeg" | "webp";
}

interface OpportunityImageSources {
  image_url?: unknown;
  metadata?: Record<string, unknown> | null;
}

interface ShareDesignState<T> {
  brandedPayload?: T | null;
  payload?: T | null;
  selectedDesign?: "branded" | "creative" | "existing";
}

/** Keep an existing source image from being mistaken for the branded design. */
export function preserveBrandedSharePayload<T>({
  brandedPayload,
  payload,
  selectedDesign,
}: ShareDesignState<T>): T | null {
  return brandedPayload ??
    (selectedDesign === "branded" ? (payload ?? null) : null);
}

function isGeneratedFlyer(rawUrl: string) {
  try {
    return new URL(rawUrl).pathname.includes("/opportunity-share-cards/");
  } catch {
    return false;
  }
}

function imageFormat(rawUrl: string): OpportunityShareImage["format"] {
  let extension = "";
  try {
    extension = new URL(rawUrl).pathname.split(".").pop()?.toLowerCase() || "";
  } catch {
    // The URL is validated by the caller; unknown extensions use PNG fallback.
  }

  return extension === "svg"
    ? "svg"
    : extension === "webp"
      ? "webp"
      : extension === "jpg" || extension === "jpeg"
        ? "jpeg"
        : "png";
}

/** Resolve the source listing image without mislabeling an Edutu-generated flyer. */
export function getExistingOpportunityImage(
  opportunity: OpportunityImageSources,
): OpportunityShareImage | null {
  const metadataSource = opportunity.metadata?.source_image_url;
  const candidates = [
    metadataSource,
    opportunity.image_url,
  ].filter(
    (candidate): candidate is string =>
      typeof candidate === "string" &&
      /^https?:\/\//i.test(candidate) &&
      !isGeneratedFlyer(candidate),
  );
  const url = candidates[0];
  return url ? { url, path: "", format: imageFormat(url) } : null;
}
