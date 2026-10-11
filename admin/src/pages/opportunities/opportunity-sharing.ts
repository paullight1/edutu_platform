import {
  formatOpportunityDate,
  isExpiredOpportunity,
} from "./opportunity-status";

type ShareOpportunity = {
  title: string;
  organization: string;
  category: string;
  location: string;
  close_date: string;
  image_url: string;
  status: "active" | "closed" | "draft" | "pending_review" | "rejected";
  metadata?: Record<string, unknown>;
  eligibility?: { countries?: string[] };
};

type ShareImageFormat = "png" | "svg" | "jpeg" | "webp";

const PUBLIC_WEB_APP_FALLBACK_URL = "https://edutu.org";

export function normalizeText(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

export function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trim()}...`;
}

function getPublicAppBaseUrl() {
  const configured =
    import.meta.env.VITE_WEB_APP_URL ||
    import.meta.env.VITE_PUBLIC_APP_URL ||
    "";

  if (configured.trim()) return configured.trim().replace(/\/$/, "");

  // Never derive from the admin's own origin — the admin dashboard is a
  // separate deployment, so guessing produces admin-host links that 404.
  return PUBLIC_WEB_APP_FALLBACK_URL;
}

export function buildPublicOpportunityUrl(opportunityId: string) {
  const baseUrl = getPublicAppBaseUrl();
  const path = `/share/opportunity/${encodeURIComponent(opportunityId)}`;

  if (!baseUrl) return path;

  try {
    return new URL(path, baseUrl).toString();
  } catch {
    return `${baseUrl}${path}`;
  }
}

export function buildAppOpportunityUrl(opportunityId: string) {
  const baseUrl = getPublicAppBaseUrl();
  const path = `/opportunity/${encodeURIComponent(opportunityId)}`;

  if (!baseUrl) return path;

  try {
    return new URL(path, baseUrl).toString();
  } catch {
    return `${baseUrl}${path}`;
  }
}

function toShareList(value: unknown): string[] {
  const source = Array.isArray(value) ? value : value ? [value] : [];
  return Array.from(
    new Set(
      source
        .flatMap((entry) => {
          if (Array.isArray(entry)) return entry;
          if (entry && typeof entry === "object")
            return Object.values(entry as Record<string, unknown>);
          return [entry];
        })
        .map((entry) => normalizeText(entry))
        .filter(Boolean),
    ),
  );
}

function getShareBenefits(opportunity: ShareOpportunity) {
  const metadata = opportunity.metadata || {};
  const benefits = toShareList(metadata.benefits);
  const funding = normalizeText(metadata.funding_type);
  const merged = funding ? [funding, ...benefits] : benefits;
  return Array.from(new Set(merged))
    .map((item) => truncateText(item, 90))
    .slice(0, 2);
}

function getShareEligibleCountry(opportunity: ShareOpportunity) {
  const metadata = opportunity.metadata || {};
  const metadataEligibility =
    metadata.eligibility && typeof metadata.eligibility === "object"
      ? (metadata.eligibility as Record<string, unknown>)
      : {};
  const countries = toShareList(
    opportunity.eligibility?.countries || metadataEligibility.countries,
  );

  if (countries.length > 0) {
    return countries.length > 3
      ? `${countries.slice(0, 3).join(", ")} +${countries.length - 3}`
      : countries.join(", ");
  }

  return normalizeText(
    metadata.target_region || opportunity.location,
    "All Countries",
  );
}

export function buildAdminOpportunityShareText(
  opportunity: ShareOpportunity,
  shareUrl: string,
) {
  const title = normalizeText(opportunity.title, "Edutu opportunity");
  const organization = normalizeText(opportunity.organization, "Edutu");
  const category = normalizeText(opportunity.category, "Opportunity");
  const deadline =
    formatOpportunityDate(opportunity.close_date) || "Not Specified";
  const expired = isExpiredOpportunity(opportunity);
  const benefits = getShareBenefits(opportunity);
  const benefitLines = (
    benefits.length ? benefits : ["Full details available on Edutu"]
  )
    .map((benefit, index) => `${index === 0 ? "⭐" : "✅"}${benefit}`)
    .join("\n");

  return [
    `${expired ? "Deadline Passed" : "Still Active"}!`,
    "",
    title,
    "",
    `Sponsor: ${organization}`,
    "",
    "Benefits:",
    benefitLines,
    "",
    `Category: ${category}`,
    `Eligible Country: ${getShareEligibleCountry(opportunity)}`,
    `Deadline: ${deadline}`,
    "",
    "Click the link below to apply📌",
    shareUrl,
    "",
    "Kindly share with your friends who might be interested.",
  ].join("\n");
}

/** True when the caption already carries this link, tolerating URL variants. */
export function shareTextIncludesUrl(text: string, url: string) {
  const key = url
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "");
  return key.length > 0 && text.includes(key);
}

export function downloadShareBlob(blob: Blob, fileName: string) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

export function getGeneratedOpportunityFlyer(opportunity: ShareOpportunity) {
  const metadata = opportunity.metadata;
  const generatedCard = metadata?.creative_share_card as
    | Record<string, unknown>
    | undefined;
  const imageUrl =
    typeof opportunity.image_url === "string" &&
    opportunity.image_url.includes("/opportunity-share-cards/")
      ? opportunity.image_url
      : generatedCard?.url;
  if (
    typeof imageUrl !== "string" ||
    !/^https?:\/\//i.test(imageUrl) ||
    !imageUrl.includes("/opportunity-share-cards/")
  ) {
    return null;
  }

  let extension = "";
  try {
    extension = new URL(imageUrl).pathname.split(".").pop()?.toLowerCase() || "";
  } catch {
    // Keep malformed URLs out of the preview.
  }
  const format: ShareImageFormat =
    extension === "svg"
      ? "svg"
      : extension === "webp"
        ? "webp"
        : extension === "jpg" || extension === "jpeg"
          ? "jpeg"
          : "png";
  return { url: imageUrl, path: "", format };
}

export function openExternalUrl(rawUrl?: string | null) {
  const url = normalizeText(rawUrl);
  if (!url) return;

  window.open(url, "_blank", "noopener,noreferrer");
}
