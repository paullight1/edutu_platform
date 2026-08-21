export interface Opportunity {
  id: string;
  title: string;
  summary: string;
  description: string;
  category: string;
  organization: string;
  location: string;
  is_remote: boolean;
  application_url: string;
  source_url?: string;
  close_date: string;
  image_url: string;
  is_featured: boolean;
  status: "active" | "closed" | "draft" | "pending_review" | "rejected";
  created_at: string;
  views: number;
  applications: number;
  metadata?: {
    extraction_quality_score?: number;
    extraction_missing_fields?: string[];
    description_length?: number;
    needs_review?: boolean;
    [key: string]: unknown;
  };
  eligibility?: {
    school?: string;
    major?: string;
    min_cgpa?: number;
    countries?: string[];
  };
}

export interface Stats {
  total: number;
  /** Effectively active: excludes 'active' rows whose deadline already passed. */
  active: number;
  /** status 'closed' OR a past close_date — matches isExpiredOpportunity(). */
  expired: number;
  missingDeadline: number;
  featured: number;
  expiringSoon: number;
  needsReview: number;
}

export interface PageNotice {
  type: "success" | "warning" | "error";
  message: string;
}

export interface EnhanceOpportunityResponse {
  success?: boolean;
  opportunity?: Opportunity;
  error?: string;
}

export interface OpportunityShareCard {
  url: string;
  path: string;
  format: "png" | "svg";
  generatedAt?: string;
  fingerprint?: string;
  expiresAt?: string | null;
}

export interface OpportunityShareResponse {
  success?: boolean;
  opportunityId?: string;
  shareCard?: OpportunityShareCard | null;
  shareUrl?: string;
  shareText?: string;
  error?: string;
}

export type OpportunityStatus = Opportunity["status"];

// Discovery tabs the mobile app shows; bulk "move to category" targets these.
export const BULK_MOVE_CATEGORIES = [
  "Scholarships",
  "Internships",
  "Programs",
  "Fellowships",
  "Grants",
  "Graduate Programs",
  "Bootcamps",
  "Events",
] as const;

export type CreationMode = "manual" | "url" | "bulk";
export type ViewMode = "table" | "grid";

// Which bulk action is running — one spinner, not five. A single boolean made
// every toolbar button animate at once, so nothing communicated what was
// actually happening.
export type BulkActionKind =
  | "approve"
  | "reject"
  | "findDeadlines"
  | "aiComplete"
  | "category"
  | "delete";

export interface BulkProgress {
  done: number;
  total: number;
  note?: string;
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export interface OpportunityListResponse {
  data: Opportunity[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface OpportunityEligibilityForm {
  school: string;
  major: string;
  min_cgpa: string;
  countries: string[];
}

export interface OpportunityPreviewItem {
  title: string;
  summary?: string;
  description?: string;
  category?: string;
  organization?: string;
  location?: string;
  amount?: number | string | null;
  award_amount?: number | string | null;
  deadline?: string | null;
  close_date?: string | null;
  application_url?: string;
  applyUrl?: string;
  apply_url?: string;
  sourceUrl?: string;
  source_url?: string;
  imageUrl?: string;
  image_url?: string;
  source?: string;
  status?: string;
  is_remote?: boolean;
  is_featured?: boolean;
  confidence?: number;
  errors?: string[];
  eligibility?: {
    school?: string;
    major?: string;
    min_cgpa?: number | string;
    countries?: string[];
    [key: string]: unknown;
  };
  funding_type?: string | null;
  target_region?: string | null;
  requirements?: string[];
  benefits?: string[];
  application_process?: string[];
  metadata?: {
    extraction_quality_score?: number;
    extraction_missing_fields?: string[];
    needs_review?: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface BulkPreviewItem extends OpportunityPreviewItem {
  confidence: number;
  status: "ready" | "needs_review";
  errors: string[];
}

export interface OpportunityFormValues {
  title: string;
  summary: string;
  description: string;
  category: string;
  organization: string;
  location: string;
  is_remote: boolean;
  application_url: string;
  close_date: string;
  image_url: string;
  is_featured: boolean;
  status: OpportunityStatus;
  eligibility: OpportunityEligibilityForm;
}

const BACKEND_STATUSES = new Set<OpportunityStatus | "pending" | "expired">([
  "active",
  "closed",
  "draft",
  "pending_review",
  "rejected",
  "pending",
  "expired",
]);

export function getErrorMessage(error: unknown, fallback = "Unknown error") {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string") return error || fallback;
  return fallback;
}

export function normalizeText(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

export function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trim()}...`;
}

/** Turns a verification outcome into a concise admin-facing result. */
export function describeVerification(
  result?: {
    status?: string;
    newCloseDate?: string | null;
    newDeadlineConfidence?: string;
  } | null,
) {
  if (!result) return "Deadline check finished.";

  if (result.newCloseDate) {
    const date = new Date(result.newCloseDate);
    const readable = Number.isNaN(date.getTime())
      ? result.newCloseDate
      : date.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
    return `Deadline found: ${readable}${
      result.newDeadlineConfidence === "inferred" ? " (inferred)" : ""
    }.`;
  }

  if (result.newDeadlineConfidence === "rolling") {
    return "Source says applications are rolling — no fixed deadline.";
  }

  switch (result.status) {
    case "expired":
      return "Source confirms this has closed.";
    case "broken_link":
      return "Source link is broken — no deadline could be read.";
    case "stale":
      return "Source could not be reached; it will retry automatically.";
    case "needs_review":
      return "Needs review — the source was ambiguous.";
    default:
      return "Checked, but the source states no deadline.";
  }
}

export function guessTitleFromUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const lastSegment =
      segments[segments.length - 1] || parsed.hostname.replace(/^www\./, "");
    const candidate = decodeURIComponent(lastSegment)
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!candidate) {
      return parsed.hostname.replace(/^www\./, "").replace(/\./g, " ");
    }

    return candidate
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  } catch {
    return rawUrl.trim() || "Untitled Opportunity";
  }
}

export function formatEligibilityCriteria(
  eligibility:
    | OpportunityEligibilityForm
    | OpportunityPreviewItem["eligibility"],
) {
  if (!eligibility) return null;

  const parts: string[] = [];

  if ("school" in eligibility && eligibility.school) {
    parts.push(`School: ${eligibility.school}`);
  }
  if ("major" in eligibility && eligibility.major) {
    parts.push(`Major: ${eligibility.major}`);
  }

  const minCgpa = "min_cgpa" in eligibility ? eligibility.min_cgpa : undefined;
  if (minCgpa !== undefined && minCgpa !== null && String(minCgpa).trim()) {
    parts.push(`Minimum CGPA: ${minCgpa}`);
  }

  const countries =
    "countries" in eligibility ? eligibility.countries : undefined;
  if (Array.isArray(countries) && countries.length > 0) {
    parts.push(`Countries: ${countries.filter(Boolean).join(", ")}`);
  }

  return parts.length > 0 ? parts.join(" | ") : null;
}

export function normalizeOpportunityStatus(
  status?: string,
  confidence?: number,
): OpportunityStatus {
  const normalized = status?.trim().toLowerCase();
  if (
    normalized &&
    BACKEND_STATUSES.has(
      normalized as OpportunityStatus | "pending" | "expired",
    )
  ) {
    if (normalized === "pending") return "pending_review";
    if (normalized === "expired") return "closed";
    return normalized as OpportunityStatus;
  }

  return confidence !== undefined && confidence >= 60
    ? "active"
    : "pending_review";
}

export function mapPreviewToFormValues(
  opportunity: OpportunityPreviewItem,
  fallback?: OpportunityFormValues,
): OpportunityFormValues {
  const sourceUrl =
    opportunity.application_url ||
    opportunity.applyUrl ||
    opportunity.apply_url ||
    opportunity.sourceUrl ||
    opportunity.source_url ||
    fallback?.application_url ||
    "";

  const location = opportunity.location ?? fallback?.location ?? "";
  const eligibility = opportunity.eligibility;

  return {
    title: opportunity.title || fallback?.title || guessTitleFromUrl(sourceUrl),
    summary: opportunity.summary || fallback?.summary || "",
    description: opportunity.description || fallback?.description || "",
    category: opportunity.category || fallback?.category || "Scholarships",
    organization:
      opportunity.organization ||
      opportunity.source ||
      fallback?.organization ||
      "",
    location,
    is_remote: opportunity.is_remote ?? fallback?.is_remote ?? false,
    application_url: sourceUrl,
    close_date: (
      opportunity.close_date ||
      opportunity.deadline ||
      fallback?.close_date ||
      ""
    ).split("T")[0],
    image_url:
      opportunity.image_url ||
      opportunity.imageUrl ||
      fallback?.image_url ||
      "",
    is_featured: opportunity.is_featured ?? fallback?.is_featured ?? false,
    status: normalizeOpportunityStatus(
      opportunity.status,
      opportunity.confidence,
    ),
    eligibility: {
      school: eligibility?.school || fallback?.eligibility?.school || "",
      major: eligibility?.major || fallback?.eligibility?.major || "",
      min_cgpa:
        eligibility?.min_cgpa !== undefined && eligibility?.min_cgpa !== null
          ? String(eligibility.min_cgpa)
          : fallback?.eligibility?.min_cgpa || "",
      countries:
        eligibility?.countries || fallback?.eligibility?.countries || [],
    },
  };
}

export function buildOpportunityPayload(
  input: OpportunityFormValues | OpportunityPreviewItem,
) {
  const previewInput = input as OpportunityPreviewItem;
  const eligibility = input.eligibility;
  const sourceUrl =
    input.application_url ||
    previewInput.applyUrl ||
    previewInput.apply_url ||
    previewInput.sourceUrl ||
    previewInput.source_url ||
    "";
  const location = input.location || (eligibility?.countries || []).join(", ");

  return {
    title: input.title,
    summary: input.summary || undefined,
    description: input.description || undefined,
    category: input.category || undefined,
    organization: input.organization || previewInput.source || undefined,
    location: location || undefined,
    type: "scholarship",
    eligibilityCriteria: formatEligibilityCriteria(eligibility) || undefined,
    fundingType: previewInput.funding_type || undefined,
    targetRegion: previewInput.target_region || location || undefined,
    deadline: input.close_date || previewInput.deadline || undefined,
    sourceUrl: sourceUrl || undefined,
    applyUrl: sourceUrl || undefined,
    imageUrl:
      input.image_url ||
      previewInput.imageUrl ||
      previewInput.image_url ||
      undefined,
    eligibility: input.eligibility || undefined,
    isFeatured: input.is_featured || previewInput.is_featured || false,
    isRemote: input.is_remote ?? true,
    status: normalizeOpportunityStatus(input.status, previewInput.confidence),
    requirements:
      "requirements" in previewInput ? previewInput.requirements : undefined,
    benefits: "benefits" in previewInput ? previewInput.benefits : undefined,
    applicationProcess:
      "application_process" in previewInput
        ? previewInput.application_process
        : undefined,
    application_process:
      "application_process" in previewInput
        ? previewInput.application_process
        : undefined,
    tags: "tags" in previewInput ? previewInput.tags : undefined,
  };
}
