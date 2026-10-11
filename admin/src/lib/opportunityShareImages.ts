export interface OpportunityShareImage {
  url: string;
  path: string;
  format: "png" | "svg" | "jpeg" | "webp";
}

export interface ShareImageFetchTarget {
  url: string;
  requiresAdminAuth: boolean;
}

export function getShareImageFetchTarget(
  apiBaseUrl: string,
  opportunityId: string,
  image: Pick<OpportunityShareImage, "url" | "path">,
): ShareImageFetchTarget {
  if (image.path) return { url: image.url, requiresAdminAuth: false };

  return {
    url: `${apiBaseUrl.replace(/\/+$/, "")}/opportunities/admin/${encodeURIComponent(opportunityId)}/source-image`,
    requiresAdminAuth: true,
  };
}

export async function createOpportunityShareImageFile(
  apiBaseUrl: string,
  opportunity: { id: string; title: string },
  image: OpportunityShareImage | null | undefined,
  getAdminHeaders: () => Promise<HeadersInit>,
  fetcher: typeof fetch = fetch,
): Promise<{ blob: Blob; file: File } | null> {
  if (!image?.url) return null;

  try {
    const target = getShareImageFetchTarget(apiBaseUrl, opportunity.id, image);
    const response = await fetcher(
      target.url,
      target.requiresAdminAuth ? { headers: await getAdminHeaders() } : undefined,
    );
    if (!response.ok) return null;

    const blob = await response.blob();
    const type =
      blob.type ||
      ({
        svg: "image/svg+xml",
        jpeg: "image/jpeg",
        webp: "image/webp",
        png: "image/png",
      }[image.format] ?? "image/png");
    const slug = opportunity.title
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return {
      blob,
      file: new File([blob], `${slug || "edutu-opportunity"}-edutu.${image.format}`, {
        type,
      }),
    };
  } catch {
    return null;
  }
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
