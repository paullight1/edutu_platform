import {
  useCallback,
  useEffect,
  useState,
  useRef,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { supabase } from "../lib/supabase";
import { getAdminAuthHeaders } from "../lib/backend";
import { exportToCSV } from "../utils/export-csv";
import {
  Target,
  Plus,
  Trash2,
  MapPin,
  Building,
  Search,
  Download,
  Upload,
  Link as LinkIcon,
  FileSpreadsheet,
  X,
  ChevronDown,
  Calendar,
  CalendarClock,
  Star,
  Edit3,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Sparkles,
  RefreshCw,
  Table2,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  Share2,
} from "lucide-react";

interface Opportunity {
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

interface Stats {
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

interface PageNotice {
  type: "success" | "warning" | "error";
  message: string;
}

interface EnhanceOpportunityResponse {
  success?: boolean;
  opportunity?: Opportunity;
  error?: string;
}

interface OpportunityShareCard {
  url: string;
  path: string;
  format: "png" | "svg";
  generatedAt?: string;
  fingerprint?: string;
  expiresAt?: string | null;
}

interface OpportunityShareResponse {
  success?: boolean;
  opportunityId?: string;
  shareCard?: OpportunityShareCard | null;
  shareUrl?: string;
  shareText?: string;
  error?: string;
}

type OpportunityStatus = Opportunity["status"];

// Discovery tabs the mobile app shows; bulk "move to category" targets these.
const BULK_MOVE_CATEGORIES = [
  "Scholarships",
  "Internships",
  "Programs",
  "Fellowships",
  "Grants",
  "Graduate Programs",
  "Bootcamps",
  "Events",
  "Competitions",
] as const;

type CreationMode = "manual" | "url" | "bulk";
type ViewMode = "table" | "grid";

// Which bulk action is running — one spinner, not five. A single boolean made
// every toolbar button animate at once, so nothing communicated what was
// actually happening.
type BulkActionKind =
  | "approve"
  | "reject"
  | "findDeadlines"
  | "aiComplete"
  | "category"
  | "delete";

interface BulkProgress {
  done: number;
  total: number;
  note?: string;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

interface OpportunityListResponse {
  data: Opportunity[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

interface OpportunityEligibilityForm {
  school: string;
  major: string;
  min_cgpa: string;
  countries: string[];
}

interface OpportunityPreviewItem {
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

interface BulkPreviewItem extends OpportunityPreviewItem {
  confidence: number;
  status: "ready" | "needs_review";
  errors: string[];
}

interface OpportunityFormValues {
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

const PUBLIC_WEB_APP_FALLBACK_URL = "https://edutu.org";

function getErrorMessage(error: unknown, fallback = "Unknown error") {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string") return error || fallback;
  return fallback;
}

function normalizeText(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trim()}...`;
}

function formatOpportunityDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isPastDate(value?: string | null) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

/**
 * Turns a verification outcome into something an admin can act on. A bare
 * "Verified" would be misleading: the check can succeed and still find no date,
 * which is the likeliest result on the missing-deadline cohort.
 */
function describeVerification(
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

function isExpiredOpportunity(
  opportunity: Pick<Opportunity, "close_date" | "status">,
) {
  return opportunity.status === "closed" || isPastDate(opportunity.close_date);
}

/**
 * Status as it should be displayed: an "active" row whose deadline already
 * passed reads as closed — the hourly verification job just hasn't flipped
 * it yet, and showing Active next to a red past date is a contradiction.
 */
function effectiveStatus(
  opportunity: Pick<Opportunity, "close_date" | "status">,
) {
  if (opportunity.status === "active" && isPastDate(opportunity.close_date)) {
    return "closed" as const;
  }
  return opportunity.status;
}

/**
 * Deadline cell text. Distinguishes a legitimately open-ended opportunity
 * ("Rolling") from a failed extraction ("Unknown"), and marks dates whose
 * year the scraper inferred rather than read from the source.
 */
function deadlineDisplay(
  opportunity: Pick<Opportunity, "close_date" | "metadata">,
) {
  const formatted = formatOpportunityDate(opportunity.close_date);
  const confidence = opportunity.metadata?.deadline_confidence as
    | string
    | undefined;
  if (formatted) {
    return confidence === "inferred" ? `${formatted} (est.)` : formatted;
  }
  return confidence === "rolling" ? "Rolling" : "Unknown";
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

function buildPublicOpportunityUrl(opportunityId: string) {
  const baseUrl = getPublicAppBaseUrl();
  const path = `/share/opportunity/${encodeURIComponent(opportunityId)}`;

  if (!baseUrl) return path;

  try {
    return new URL(path, baseUrl).toString();
  } catch {
    return `${baseUrl}${path}`;
  }
}

function buildAppOpportunityUrl(opportunityId: string) {
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

function getShareBenefits(opportunity: Opportunity) {
  const metadata = opportunity.metadata || {};
  const benefits = toShareList(metadata.benefits);
  const funding = normalizeText(metadata.funding_type);
  const merged = funding ? [funding, ...benefits] : benefits;
  return Array.from(new Set(merged))
    .map((item) => truncateText(item, 90))
    .slice(0, 2);
}

function getShareEligibleCountry(opportunity: Opportunity) {
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

function buildAdminOpportunityShareText(
  opportunity: Opportunity,
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

function downloadShareBlob(blob: Blob, fileName: string) {
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

function buildShareImageFileName(
  opportunity: Opportunity,
  format: "png" | "svg",
) {
  const slug = normalizeText(opportunity.title, "edutu-opportunity")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "edutu-opportunity"}-edutu.${format}`;
}

function openExternalUrl(rawUrl?: string | null) {
  const url = normalizeText(rawUrl);
  if (!url) return;

  window.open(url, "_blank", "noopener,noreferrer");
}

function guessTitleFromUrl(rawUrl: string) {
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

function formatEligibilityCriteria(
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

function normalizeOpportunityStatus(
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

function mapPreviewToFormValues(
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

function buildOpportunityPayload(
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

export default function Opportunities() {
  const [filteredOpps, setFilteredOpps] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    active: 0,
    expired: 0,
    missingDeadline: 0,
    featured: 0,
    expiringSoon: 0,
    needsReview: 0,
  });

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [creationMode, setCreationMode] = useState<CreationMode>("manual");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isScraping, setIsScraping] = useState(false);
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const [showLoadingModal, setShowLoadingModal] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<{
    message: string;
    progress: number;
    source?: string;
    phase?: "preview" | "save" | "refine" | "error";
  }>({ message: "Initializing...", progress: 0 });
  const [loadedResults, setLoadedResults] = useState<OpportunityPreviewItem[]>(
    [],
  );
  const [scrapedData, setScrapedData] = useState<OpportunityFormValues | null>(
    null,
  );
  const [urlInput, setUrlInput] = useState("");
  const [bulkPreview, setBulkPreview] = useState<BulkPreviewItem[]>([]);
  // Opportunity ids whose cover image failed to load (dead scraped domains,
  // e.g. sources that have gone offline). We fall back to the placeholder icon
  // instead of rendering a broken image and spamming the console.
  const [brokenImageIds, setBrokenImageIds] = useState<Set<string>>(
    () => new Set(),
  );

  // Lightweight toast notifications (same pattern as Scraper.tsx) — replaces
  // the blocking window.alert() calls for errors/successes.
  const [notifications, setNotifications] = useState<
    { id: number; message: string; type: "success" | "error" | "warning" | "info" }[]
  >([]);
  const showNotification = (
    message: string,
    type: "success" | "error" | "warning" | "info" = "info",
  ) => {
    const id = Date.now() + Math.random();
    setNotifications((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 6000);
  };

  const addMethods = [
    {
      id: "manual",
      name: "Manual Entry",
      icon: <Plus size={16} />,
      desc: "Create manually",
      action: () => {
        setShowAddDropdown(false);
        setShowModal(true);
      },
    },
    {
      id: "url",
      name: "From URL",
      icon: <LinkIcon size={16} />,
      desc: "Scrape from URL",
      action: () => {
        setShowAddDropdown(false);
        setCreationMode("url");
        setShowModal(true);
      },
    },
    {
      id: "divider",
      name: "─── Data Sources ───",
      icon: null,
      desc: "",
      action: () => {},
    },
    {
      id: "apify-all",
      name: "All Sources",
      icon: <RefreshCw size={16} />,
      desc: "Sync all sources",
      action: () => {
        setShowAddDropdown(false);
        triggerApifySync();
      },
    },
  ];

  async function triggerApifySync() {
    setShowLoadingModal(true);
    setLoadedResults([]);
    setLoadingStatus({
      message: "Connecting to the scraper...",
      progress: 10,
      source: "all",
      phase: "preview",
    });

    // A full crawl fetches + enriches every source, so it can run for a few
    // minutes. Cap it so the modal can never hang forever on a stuck source.
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 240_000);
    try {
      setLoadingStatus({
        message: "Crawling all enabled sources — this can take a few minutes…",
        progress: 30,
        source: "all",
        phase: "preview",
      });
      const response = await fetch(`${NEST_API_URL}/api/scraper/run`, {
        method: "POST",
        headers: await getAdminHeaders(),
        signal: controller.signal,
        body: JSON.stringify({
          allSources: true,
          maxPages: 3,
        }),
      });

      setLoadingStatus({
        message: "Processing results...",
        progress: 70,
        source: "all",
        phase: "preview",
      });
      const result = await response.json();

      if (
        response.ok &&
        result.success &&
        result.opportunities &&
        result.opportunities.length > 0
      ) {
        setLoadedResults(result.opportunities);
        setLoadingStatus({
          message: `Found ${result.opportunities.length} opportunities`,
          progress: 100,
          source: "all",
          phase: "preview",
        });
      } else {
        const errMsg =
          result.errors?.[0] || result.error || "No opportunities found";
        setLoadingStatus({
          message: errMsg,
          progress: 100,
          source: "all",
          phase: "error",
        });
      }
    } catch (error: unknown) {
      // A bare "Failed to fetch" almost always means the API server isn't
      // reachable — surface that plainly instead of a cryptic network error.
      const raw = getErrorMessage(error);
      const aborted =
        error instanceof DOMException && error.name === "AbortError";
      const message = aborted
        ? "The crawl is taking too long from here. Run large syncs from the Scraper page, which streams progress in the background."
        : /failed to fetch|networkerror|load failed/i.test(raw)
          ? `Cannot reach the API server at ${NEST_API_URL}. Make sure the backend is running.`
          : raw;
      setLoadingStatus({
        message: "Error: " + message,
        progress: 100,
        source: "all",
        phase: "error",
      });
      setTimeout(() => {
        setShowLoadingModal(false);
        showNotification("Preview failed: " + message, "error");
      }, 2000);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function saveOpportunities(
    opps: OpportunityPreviewItem[] | BulkPreviewItem[],
  ) {
    setLoadingStatus({
      message: "Saving to database...",
      progress: 30,
      source: loadingStatus.source || "",
      phase: "save",
    });

    try {
      const items = opps
        .map((item) => {
          const payload = buildOpportunityPayload(item);
          return {
            ...payload,
            sourceUrl:
              payload.sourceUrl ||
              item.source_url ||
              item.sourceUrl ||
              item.application_url ||
              item.applyUrl ||
              item.apply_url,
            status: normalizeOpportunityStatus(
              item.status,
              item.confidence ?? item.metadata?.extraction_quality_score,
            ),
          };
        })
        .filter((item) => Boolean(item.title && item.sourceUrl)) as Array<
        Record<string, unknown>
      >;

      if (!items.length) {
        throw new Error("No valid opportunities to save");
      }

      const headers = await getAdminHeaders();
      const batches: Array<Array<Record<string, unknown>>> = [];
      for (let index = 0; index < items.length; index += 100) {
        batches.push(items.slice(index, index + 100));
      }

      let inserted = 0;
      let skipped = 0;

      for (let index = 0; index < batches.length; index += 1) {
        const batch = batches[index];
        setLoadingStatus({
          message: `Saving batch ${index + 1} of ${batches.length}...`,
          progress: Math.round(((index + 1) / batches.length) * 100),
          source: loadingStatus.source || "",
          phase: "save",
        });

        const response = await fetch(
          `${NEST_API_URL}/opportunities/admin/bulk-import`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ items: batch }),
          },
        );

        const result = await response.json().catch(() => ({}));

        if (!response.ok || !result.success) {
          throw new Error(result.error || `Save failed for batch ${index + 1}`);
        }

        inserted += Number(result.inserted || 0);
        skipped += Number(result.skipped || 0);
      }

      setLoadingStatus({
        message: `Saved ${inserted} opportunities!`,
        progress: 100,
        source: loadingStatus.source || "",
        phase: "save",
      });
      setShowLoadingModal(false);
      setLoadedResults([]);
      setBulkPreview([]);
      void fetchOpportunities();
      showNotification(
        `Successfully saved ${inserted} opportunities! Skipped (duplicates): ${skipped}`,
        "success",
      );
    } catch (error: unknown) {
      showNotification("Save failed: " + getErrorMessage(error), "error");
    }
  }

  async function refineWithAI(opps: OpportunityPreviewItem[]) {
    if (!opps.length) {
      showNotification("No opportunities to refine.", "warning");
      return;
    }

    setLoadingStatus({
      message: "Analyzing with AI...",
      progress: 10,
      source: loadingStatus.source || "",
      phase: "refine",
    });

    const headers = await getAdminHeaders();

    const improved: OpportunityPreviewItem[] = [];
    const errors: string[] = [];

    for (let i = 0; i < opps.length; i += 1) {
      const opp = opps[i];
      const currentProgress = Math.min(
        10 + Math.round(((i + 1) / opps.length) * 70),
        80,
      );
      setLoadingStatus({
        message: `Analyzing with AI (${i + 1}/${opps.length})...`,
        progress: currentProgress,
        source: loadingStatus.source || "",
        phase: "refine",
      });

      try {
        const response = await fetch(
          `${NEST_API_URL}/api/scraper/enhance-preview`,
          {
            method: "POST",
            headers,
            body: JSON.stringify(opp),
          },
        );

        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.success) {
          errors.push(
            result?.error ||
              `Failed to refine ${opp.title || "an opportunity"}`,
          );
          improved.push(opp);
          continue;
        }

        improved.push(result.opportunity || opp);
      } catch (error: unknown) {
        errors.push(getErrorMessage(error, "Unknown refinement error"));
        improved.push(opp);
      }
    }

    setLoadedResults(improved);
    setLoadingStatus({
      message: errors.length
        ? `Refine complete with ${errors.length} fallback items`
        : "Refine complete",
      progress: 100,
      source: loadingStatus.source || "",
      phase: "refine",
    });

    if (errors.length) {
      showNotification(
        `Refine finished with ${errors.length} issues. Results were kept for those items.`,
        "warning",
      );
    }
  }

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  // Expired = status 'closed' or a past close_date. Hidden by default; the
  // toggle below the filters brings them back.
  const [showExpired, setShowExpired] = useState(false);
  // Narrows to rows with no deadline on either column — the cohort the
  // re-scrape/AI recovery action exists for.
  const [missingDeadlineOnly, setMissingDeadlineOnly] = useState(false);
  // Stat-card cohorts with no dedicated toolbar control; toggled by clicking
  // the Featured / Expiring Soon cards.
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [expiringSoonOnly, setExpiringSoonOnly] = useState(false);
  const [verifyingIds, setVerifyingIds] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState("newest");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalOpportunities, setTotalOpportunities] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [enhancingIds, setEnhancingIds] = useState<Set<string>>(new Set());
  const [sharingIds, setSharingIds] = useState<Set<string>>(new Set());
  // Share image chooser: lets the admin visually pick between the generated
  // branded card and the opportunity's original (meta) image before sharing.
  const [shareChooser, setShareChooser] = useState<{
    opportunity: Opportunity;
    aiEnhanced: boolean;
    aiFallback: boolean;
    payload: OpportunityShareResponse | null;
    choice: "card" | "meta";
    sharing: boolean;
  } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<BulkActionKind | null>(null);
  const [bulkProgress, setBulkProgress] = useState<BulkProgress | null>(null);
  // True while "Select all N matching" is paging through the filtered set.
  const [selectingAll, setSelectingAll] = useState(false);
  const bulkActionBusy = bulkAction !== null;
  const [pageNotice, setPageNotice] = useState<PageNotice | null>(null);

  // Form data
  const [formData, setFormData] = useState<OpportunityFormValues>({
    title: "",
    summary: "",
    description: "",
    category: "Scholarships",
    organization: "",
    location: "",
    is_remote: false,
    application_url: "",
    close_date: "",
    image_url: "",
    is_featured: false,
    status: "active" as OpportunityStatus,
    eligibility: {
      school: "",
      major: "",
      min_cgpa: "",
      countries: [] as string[],
    },
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pageNoticeTimeoutRef = useRef<number | null>(null);

  const NEST_API_URL = (
    import.meta.env.VITE_BACKEND_URL ||
    import.meta.env.VITE_API_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");

  const getAdminHeaders = useCallback(async () => {
    return getAdminAuthHeaders({
      "Content-Type": "application/json",
    });
  }, []);

  // One param builder for both the page fetch and "Select all N matching",
  // so the selection loop can never drift from what the list shows.
  const buildListParams = useCallback(
    (page: number, limit: number) => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sortBy,
      });

      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      // Expired rows are noise in the default view — an admin manages what's
      // still live. Suppressed unless explicitly asked for, and never when a
      // status is picked (status=closed + hide-expired returns nothing).
      if (!showExpired && statusFilter === "all")
        params.set("includeExpired", "false");
      if (missingDeadlineOnly) params.set("missingDeadline", "true");
      if (featuredOnly) params.set("featured", "true");
      if (expiringSoonOnly) params.set("expiringSoon", "true");
      return params;
    },
    [
      sortBy,
      searchQuery,
      categoryFilter,
      statusFilter,
      showExpired,
      missingDeadlineOnly,
      featuredOnly,
      expiringSoonOnly,
    ],
  );

  const fetchOpportunities = useCallback(async (options?: { silent?: boolean }) => {
    // Silent mode powers background auto-refresh (realtime + polling):
    // no loading flash, no alert, and never clears the list on a blip.
    const silent = options?.silent === true;
    if (!silent) setLoading(true);
    try {
      const params = buildListParams(currentPage, pageSize);

      const headers = await getAdminHeaders();
      const [listResponse, statsResponse] = await Promise.all([
        fetch(`${NEST_API_URL}/opportunities/admin/list?${params.toString()}`, {
          headers,
        }),
        fetch(`${NEST_API_URL}/opportunities/admin/stats`, {
          headers,
        }),
      ]);

      if (!listResponse.ok) {
        const error = await listResponse.json().catch(() => ({}));
        throw new Error(error.message || "Failed to load opportunities");
      }

      const result = (await listResponse.json()) as OpportunityListResponse;
      const opps = result.data || [];
      setFilteredOpps(opps);
      setTotalOpportunities(result.total || 0);
      setTotalPages(result.totalPages || 1);

      if (statsResponse.ok) {
        setStats(await statsResponse.json());
      }
    } catch (error: unknown) {
      console.error("Failed to load opportunities:", error);
      if (!silent) {
        showNotification(getErrorMessage(error, "Failed to load opportunities"), "error");
        setFilteredOpps([]);
        setTotalOpportunities(0);
        setTotalPages(1);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [buildListParams, currentPage, getAdminHeaders, NEST_API_URL, pageSize]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void fetchOpportunities();
    }, 250);

    return () => window.clearTimeout(handle);
  }, [fetchOpportunities]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchQuery,
    categoryFilter,
    statusFilter,
    showExpired,
    missingDeadlineOnly,
    featuredOnly,
    expiringSoonOnly,
    sortBy,
    pageSize,
  ]);

  // Clear the selection when the filter set changes — the selected cohort no
  // longer matches what's on screen. Deliberately NOT keyed on the visible
  // rows: selection must survive page flips and refetches, or "Select all N
  // matching" would be pruned back to one page the moment it completed.
  useEffect(() => {
    setSelectedIds((prev) => (prev.size === 0 ? prev : new Set()));
  }, [
    searchQuery,
    categoryFilter,
    statusFilter,
    showExpired,
    missingDeadlineOnly,
    featuredOnly,
    expiringSoonOnly,
  ]);

  useEffect(() => {
    return () => {
      if (pageNoticeTimeoutRef.current !== null) {
        window.clearTimeout(pageNoticeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (!target.closest("[data-add-dropdown]")) {
        setShowAddDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("opportunities-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "opportunities" },
        (payload) => {
          console.log("[Realtime] Opportunity changed:", payload);
          void fetchOpportunities({ silent: true });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchOpportunities]);

  // Auto-refresh fallback: short-poll the feed so freshly scraped
  // opportunities appear without a manual reload even when Supabase
  // Realtime is unavailable. Skips ticks while the tab is hidden and
  // catches up as soon as it becomes visible again.
  useEffect(() => {
    const POLL_INTERVAL_MS = 30_000;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void fetchOpportunities({ silent: true });
      }
    }, POLL_INTERVAL_MS);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchOpportunities({ silent: true });
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchOpportunities]);

  async function handleDelete(id: string) {
    if (
      !window.confirm(
        "Are you sure you want to delete this opportunity? This action cannot be undone.",
      )
    )
      return;
    try {
      const response = await fetch(`${NEST_API_URL}/opportunities/${id}`, {
        method: "DELETE",
        headers: await getAdminHeaders(),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || "Failed to delete opportunity");
      }
      void fetchOpportunities();
      showPageNotice("success", "Opportunity deleted.");
    } catch (error: unknown) {
      showPageNotice(
        "error",
        getErrorMessage(error, "Failed to delete opportunity"),
      );
    }
  }

  async function handleStatusUpdate(id: string, status: OpportunityStatus) {
    try {
      const response = await fetch(
        `${NEST_API_URL}/opportunities/${id}/status`,
        {
          method: "PATCH",
          headers: await getAdminHeaders(),
          body: JSON.stringify({ status }),
        },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || "Failed to update status");
      }
      void fetchOpportunities();
      showPageNotice("success", "Opportunity status updated.");
    } catch (error: unknown) {
      showPageNotice(
        "error",
        getErrorMessage(error, "Failed to update status"),
      );
    }
  }

  async function handleBulkStatusUpdate(status: OpportunityStatus) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || bulkActionBusy) return;
    if (
      status === "rejected" &&
      !window.confirm(
        `Reject ${ids.length} selected opportunit${ids.length === 1 ? "y" : "ies"}?`,
      )
    )
      return;
    setBulkAction(status === "active" ? "approve" : "reject");
    let updated = 0;
    let done = 0;
    try {
      // The bulk endpoints cap at 200 ids per request; "Select all" can pick
      // more than that, so send in chunks and keep a running total.
      for (const chunk of chunkArray(ids, 200)) {
        const response = await fetch(
          `${NEST_API_URL}/opportunities/admin/bulk-status`,
          {
            method: "POST",
            headers: await getAdminHeaders(),
            body: JSON.stringify({ ids: chunk, status }),
          },
        );
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.message || "Bulk status update failed");
        }
        const result = await response.json().catch(() => ({}));
        updated +=
          typeof result.updated === "number" ? result.updated : chunk.length;
        done += chunk.length;
        if (ids.length > 200) setBulkProgress({ done, total: ids.length });
      }
      setSelectedIds(new Set());
      void fetchOpportunities();
      showPageNotice(
        "success",
        `${updated} opportunit${updated === 1 ? "y" : "ies"} ${
          status === "active" ? "approved" : `set to ${status}`
        }.`,
      );
    } catch (error: unknown) {
      showPageNotice(
        "error",
        getErrorMessage(error, "Bulk status update failed"),
      );
    } finally {
      setBulkAction(null);
      setBulkProgress(null);
    }
  }

  async function handleBulkCategoryMove(category: string) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || !category || bulkActionBusy) return;
    if (
      !window.confirm(
        `Move ${ids.length} selected opportunit${ids.length === 1 ? "y" : "ies"} to ${category}?`,
      )
    )
      return;
    setBulkAction("category");
    let updated = 0;
    let done = 0;
    try {
      for (const chunk of chunkArray(ids, 200)) {
        const response = await fetch(
          `${NEST_API_URL}/opportunities/admin/bulk-category`,
          {
            method: "POST",
            headers: await getAdminHeaders(),
            body: JSON.stringify({ ids: chunk, category }),
          },
        );
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.message || "Bulk category move failed");
        }
        const result = await response.json().catch(() => ({}));
        updated +=
          typeof result.updated === "number" ? result.updated : chunk.length;
        done += chunk.length;
        if (ids.length > 200) setBulkProgress({ done, total: ids.length });
      }
      setSelectedIds(new Set());
      void fetchOpportunities();
      showPageNotice(
        "success",
        `${updated} opportunit${updated === 1 ? "y" : "ies"} moved to ${category}.`,
      );
    } catch (error: unknown) {
      showPageNotice(
        "error",
        getErrorMessage(error, "Bulk category move failed"),
      );
    } finally {
      setBulkAction(null);
      setBulkProgress(null);
    }
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || bulkActionBusy) return;
    if (
      !window.confirm(
        `Delete ${ids.length} selected opportunit${ids.length === 1 ? "y" : "ies"}? This action cannot be undone.`,
      )
    )
      return;
    setBulkAction("delete");
    let deleted = 0;
    let done = 0;
    try {
      for (const chunk of chunkArray(ids, 200)) {
        const response = await fetch(
          `${NEST_API_URL}/opportunities/admin/bulk-delete`,
          {
            method: "POST",
            headers: await getAdminHeaders(),
            body: JSON.stringify({ ids: chunk }),
          },
        );
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.message || "Bulk delete failed");
        }
        const result = await response.json().catch(() => ({}));
        deleted +=
          typeof result.deleted === "number" ? result.deleted : chunk.length;
        done += chunk.length;
        if (ids.length > 200) setBulkProgress({ done, total: ids.length });
      }
      setSelectedIds(new Set());
      void fetchOpportunities();
      showPageNotice(
        "success",
        `${deleted} opportunit${deleted === 1 ? "y" : "ies"} deleted.`,
      );
    } catch (error: unknown) {
      showPageNotice("error", getErrorMessage(error, "Bulk delete failed"));
    } finally {
      setBulkAction(null);
      setBulkProgress(null);
    }
  }

  async function handleEnhanceOpportunity(id: string) {
    setEnhancingIds((prev) => new Set(prev).add(id));
    try {
      const response = await fetch(
        `${NEST_API_URL}/opportunities/admin/${id}/enhance`,
        {
          method: "POST",
          headers: await getAdminHeaders(),
        },
      );
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "AI enhancement failed");
      }
      await fetchOpportunities();
      showPageNotice(
        "success",
        `AI enhancement complete: ${result.completeness?.score ?? "updated"}%.`,
      );
    } catch (error: unknown) {
      showPageNotice("error", getErrorMessage(error, "AI enhancement failed"));
    } finally {
      setEnhancingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  // Re-fetches the live source page and re-reads the deadline (regex first,
  // LLM fallback), then persists it. Distinct from "Improve details with AI",
  // which rewrites the whole record.
  async function handleFindDeadline(id: string) {
    setVerifyingIds((prev) => new Set(prev).add(id));
    try {
      const response = await fetch(
        `${NEST_API_URL}/opportunities/admin/verification/${id}`,
        {
          method: "POST",
          headers: {
            ...(await getAdminHeaders()),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ dryRun: false }),
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Deadline check failed");
      }

      await fetchOpportunities();
      showPageNotice("success", describeVerification(result.result));
    } catch (error: unknown) {
      showPageNotice("error", getErrorMessage(error, "Deadline check failed"));
    } finally {
      setVerifyingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function handleBulkFindDeadlines() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || bulkActionBusy) return;
    setBulkAction("findDeadlines");
    setBulkProgress({ done: 0, total: ids.length });
    setVerifyingIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    let found = 0;
    let rolling = 0;
    let checked = 0;
    let failed = 0;
    let done = 0;
    try {
      // Batches of 10 against the server-side bulk endpoint, which runs the
      // page fetches and LLM fallbacks concurrently. The old one-request-per-
      // row loop took 15-30s × N sequentially — a 100-row selection sat
      // spinning for upwards of half an hour with no sign of life.
      for (const chunk of chunkArray(ids, 10)) {
        try {
          const response = await fetch(
            `${NEST_API_URL}/opportunities/admin/verification/bulk`,
            {
              method: "POST",
              headers: await getAdminHeaders(),
              body: JSON.stringify({ ids: chunk, dryRun: false }),
            },
          );
          const result = await response.json().catch(() => ({}));
          if (!response.ok || !result.success) {
            throw new Error(
              result.error || result.message || "Deadline check failed",
            );
          }
          checked += Number(result.checked) || 0;
          found += Number(result.found) || 0;
          rolling += Number(result.rolling) || 0;
          failed += Number(result.failed) || 0;
        } catch {
          failed += chunk.length;
        } finally {
          done += chunk.length;
          setBulkProgress({
            done,
            total: ids.length,
            note: `${found} deadline${found === 1 ? "" : "s"} found`,
          });
          setVerifyingIds((prev) => {
            const next = new Set(prev);
            chunk.forEach((id) => next.delete(id));
            return next;
          });
        }
        // Refresh between batches so recovered dates appear as they land
        // instead of only after the whole run.
        void fetchOpportunities({ silent: true });
      }

      // Report found separately from checked: "20 checked" reads like success
      // when it may well have recovered zero dates.
      showPageNotice(
        failed ? "warning" : "success",
        `Checked ${checked} ${checked === 1 ? "opportunity" : "opportunities"}, found ${found} deadline${found === 1 ? "" : "s"}${
          rolling ? `, ${rolling} rolling` : ""
        }${failed ? `, ${failed} failed` : ""}.`,
      );
      await fetchOpportunities();
    } finally {
      setBulkAction(null);
      setBulkProgress(null);
      setVerifyingIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }
  }

  async function handleBulkEnhance() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || bulkActionBusy) return;
    setBulkAction("aiComplete");
    setBulkProgress({ done: 0, total: ids.length });
    setEnhancingIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    let completed = 0;
    let failed = 0;
    try {
      // Sequential to respect the AI provider's rate limits; each row is
      // enriched via the same single-row enhance endpoint the icon uses.
      for (const id of ids) {
        try {
          const response = await fetch(
            `${NEST_API_URL}/opportunities/admin/${id}/enhance`,
            {
              method: "POST",
              headers: await getAdminHeaders(),
            },
          );
          const result = await response.json().catch(() => ({}));
          if (!response.ok || !result.success) {
            throw new Error(result.error || "AI enhancement failed");
          }
          completed += 1;
        } catch {
          failed += 1;
        } finally {
          setEnhancingIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          setBulkProgress({
            done: completed + failed,
            total: ids.length,
            note: failed ? `${failed} failed` : undefined,
          });
        }
      }
      setSelectedIds(new Set());
      await fetchOpportunities();
      showPageNotice(
        failed === 0 ? "success" : "error",
        `AI completed ${completed} profile${completed === 1 ? "" : "s"}${
          failed ? `, ${failed} failed` : ""
        }.`,
      );
    } finally {
      setBulkAction(null);
      setBulkProgress(null);
      setEnhancingIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }
  }

  function showPageNotice(type: PageNotice["type"], message: string) {
    if (pageNoticeTimeoutRef.current !== null) {
      window.clearTimeout(pageNoticeTimeoutRef.current);
    }

    setPageNotice({ type, message });
    pageNoticeTimeoutRef.current = window.setTimeout(() => {
      setPageNotice((current) =>
        current?.message === message ? null : current,
      );
      pageNoticeTimeoutRef.current = null;
    }, 3500);
  }

  async function getAiImprovedOpportunityForShare(opp: Opportunity) {
    try {
      const response = await fetch(
        `${NEST_API_URL}/opportunities/admin/${opp.id}/enhance`,
        {
          method: "POST",
          headers: await getAdminHeaders(),
        },
      );
      const result = (await response
        .json()
        .catch(() => ({}))) as EnhanceOpportunityResponse;

      if (!response.ok || !result.success || !result.opportunity) {
        return { opportunity: opp, aiEnhanced: false, aiFallback: true };
      }

      const enhancedOpportunity = {
        ...opp,
        ...result.opportunity,
        metadata: {
          ...opp.metadata,
          ...result.opportunity.metadata,
        },
      };

      setFilteredOpps((current) =>
        current.map((item) =>
          item.id === opp.id ? enhancedOpportunity : item,
        ),
      );

      return {
        opportunity: enhancedOpportunity,
        aiEnhanced: true,
        aiFallback: false,
      };
    } catch {
      return { opportunity: opp, aiEnhanced: false, aiFallback: true };
    }
  }

  async function copyShareTextToClipboard(text: string) {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);
    textArea.select();

    try {
      const copied = document.execCommand("copy");
      if (!copied) throw new Error("Copy command failed");
    } finally {
      document.body.removeChild(textArea);
    }
  }

  async function getOpportunitySharePayload(
    opportunityId: string,
  ): Promise<OpportunityShareResponse | null> {
    try {
      const response = await fetch(
        `${NEST_API_URL}/opportunities/${opportunityId}/share-card`,
        {
          method: "POST",
          headers: await getAdminHeaders(),
        },
      );
      if (!response.ok) return null;
      const payload = (await response
        .json()
        .catch(() => null)) as OpportunityShareResponse | null;
      return payload?.success ? payload : null;
    } catch {
      return null;
    }
  }

  async function buildShareImageFile(
    opportunity: Opportunity,
    shareCard?: OpportunityShareCard | null,
  ) {
    if (!shareCard?.url) return null;

    try {
      const response = await fetch(shareCard.url);
      if (!response.ok) return null;
      const blob = await response.blob();
      const type =
        blob.type ||
        (shareCard.format === "svg" ? "image/svg+xml" : "image/png");
      return {
        blob,
        file: new File(
          [blob],
          buildShareImageFileName(opportunity, shareCard.format),
          { type },
        ),
      };
    } catch {
      return null;
    }
  }

  async function buildMetaImageFile(opportunity: Opportunity) {
    const metaUrl = normalizeText(opportunity.image_url);
    if (!metaUrl) return null;

    try {
      const response = await fetch(metaUrl);
      if (!response.ok) return null;
      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) return null;
      const ext = blob.type.includes("svg")
        ? "svg"
        : blob.type.includes("jpeg") || blob.type.includes("jpg")
          ? "jpg"
          : blob.type.includes("webp")
            ? "webp"
            : "png";
      const baseName = buildShareImageFileName(opportunity, "png").replace(
        /\.png$/,
        `.${ext}`,
      );
      return { blob, file: new File([blob], baseName, { type: blob.type }) };
    } catch {
      // Cross-origin source images can refuse fetches — share text-only then.
      return null;
    }
  }

  // Step 1: prepare the share payload, then open the visual image chooser.
  async function handleShareOpportunity(opp: Opportunity) {
    setSharingIds((prev) => new Set(prev).add(opp.id));

    try {
      const { opportunity, aiEnhanced, aiFallback } =
        await getAiImprovedOpportunityForShare(opp);
      const sharePayload = await getOpportunitySharePayload(opportunity.id);
      const hasCard = Boolean(sharePayload?.shareCard?.url);
      const hasMeta = Boolean(normalizeText(opportunity.image_url));

      if (!hasCard && !hasMeta) {
        // Nothing to choose between — share straight away without an image.
        await executeShare(opportunity, sharePayload, "card", aiEnhanced, aiFallback);
        return;
      }

      setShareChooser({
        opportunity,
        aiEnhanced,
        aiFallback,
        payload: sharePayload,
        choice: hasCard ? "card" : "meta",
        sharing: false,
      });
    } catch (error: unknown) {
      showPageNotice(
        "error",
        getErrorMessage(error, "Could not prepare this share"),
      );
    } finally {
      setSharingIds((prev) => {
        const next = new Set(prev);
        next.delete(opp.id);
        return next;
      });
    }
  }

  // Step 2: share with the image source the admin picked in the chooser.
  async function executeShare(
    opportunity: Opportunity,
    sharePayload: OpportunityShareResponse | null,
    imageChoice: "card" | "meta",
    aiEnhanced: boolean,
    aiFallback: boolean,
  ) {
    try {
      const shareUrl = buildPublicOpportunityUrl(opportunity.id);
      const shareText =
        sharePayload?.shareText ||
        buildAdminOpportunityShareText(
          opportunity,
          sharePayload?.shareUrl || shareUrl,
        );
      const finalShareUrl = sharePayload?.shareUrl || shareUrl;
      const shareImage =
        imageChoice === "meta"
          ? await buildMetaImageFile(opportunity)
          : await buildShareImageFile(opportunity, sharePayload?.shareCard);
      const shareData = {
        title: normalizeText(opportunity.title, "Edutu opportunity"),
        text: shareText,
        url: finalShareUrl,
      };

      if (
        shareImage?.file &&
        navigator.share &&
        navigator.canShare?.({ files: [shareImage.file] })
      ) {
        await navigator.share({
          ...shareData,
          files: [shareImage.file],
        });
        showPageNotice(
          aiFallback ? "warning" : "success",
          aiEnhanced
            ? "AI-improved share caption and image shared."
            : "Share caption and image shared.",
        );
        return;
      }

      if (navigator.share) {
        await navigator.share(shareData);
        if (shareImage?.blob) {
          downloadShareBlob(shareImage.blob, shareImage.file.name);
        }
        showPageNotice(
          aiFallback ? "warning" : "success",
          aiEnhanced
            ? "AI-improved caption shared; image downloaded."
            : "Caption shared; image downloaded.",
        );
        return;
      }

      await copyShareTextToClipboard(shareText);
      if (shareImage?.blob) {
        downloadShareBlob(shareImage.blob, shareImage.file.name);
      }
      showPageNotice(
        aiFallback ? "warning" : "success",
        aiEnhanced
          ? "AI-improved share caption copied and image downloaded."
          : "Share caption copied and image downloaded.",
      );
    } catch (error: unknown) {
      if (
        error instanceof DOMException &&
        ["AbortError", "NotAllowedError"].includes(error.name)
      ) {
        return;
      }

      try {
        const shareUrl = buildPublicOpportunityUrl(opportunity.id);
        await copyShareTextToClipboard(
          buildAdminOpportunityShareText(opportunity, shareUrl),
        );
        showPageNotice(
          "warning",
          "AI share failed, so the current details were copied.",
        );
      } catch {
        showPageNotice(
          "error",
          getErrorMessage(error, "Could not share this opportunity"),
        );
      }
    }
  }

  async function confirmShareChoice() {
    if (!shareChooser || shareChooser.sharing) return;
    const { opportunity, payload, choice, aiEnhanced, aiFallback } =
      shareChooser;
    setShareChooser((current) =>
      current ? { ...current, sharing: true } : current,
    );
    try {
      await executeShare(opportunity, payload, choice, aiEnhanced, aiFallback);
    } finally {
      setShareChooser(null);
    }
  }

  function handleExportOpportunities() {
    if (!filteredOpps.length) {
      showPageNotice("warning", "There are no opportunities to export.");
      return;
    }

    const rows = filteredOpps.map((opp) => ({
      id: opp.id,
      title: opp.title || "Untitled opportunity",
      organization: opp.organization || "",
      category: opp.category || "",
      status: opp.status || "",
      deadline: formatOpportunityDate(opp.close_date),
      location: opp.is_remote ? "Remote" : opp.location || "",
      application_url: opp.application_url || "",
      public_share_url: buildPublicOpportunityUrl(opp.id),
      views: opp.views || 0,
      applications: opp.applications || 0,
      created_at: formatOpportunityDate(opp.created_at),
      quality_score: opp.metadata?.extraction_quality_score ?? "",
      needs_review:
        opp.status === "pending_review" || Boolean(opp.metadata?.needs_review),
    }));

    exportToCSV(
      rows,
      `edutu-opportunities-${new Date().toISOString().slice(0, 10)}`,
    );
    showPageNotice("success", `Exported ${rows.length} opportunities.`);
  }

  function handleEdit(opp: Opportunity) {
    setFormData({
      title: opp.title,
      summary: opp.summary || "",
      description: opp.description || "",
      category: opp.category || "Scholarships",
      organization: opp.organization || "",
      location: opp.location || "",
      is_remote: opp.is_remote || false,
      application_url: opp.application_url || "",
      close_date: opp.close_date ? opp.close_date.split("T")[0] : "",
      image_url: opp.image_url || "",
      is_featured: opp.is_featured || false,
      status: opp.status || "active",
      eligibility: {
        school: opp.eligibility?.school || "",
        major: opp.eligibility?.major || "",
        min_cgpa: opp.eligibility?.min_cgpa?.toString() || "",
        countries: opp.eligibility?.countries || [],
      },
    });
    setEditingId(opp.id);
    setCreationMode("manual");
    setShowModal(true);
  }

  async function handleScrapeUrl() {
    if (!urlInput.trim()) return;

    try {
      new URL(urlInput);
    } catch {
      showNotification("Please enter a valid URL", "warning");
      return;
    }

    setIsScraping(true);
    setScrapedData(null);

    // Analysis fetches the page, extracts its image, and runs the LLM — usually
    // ~20s but a slow source can take longer. Cap the wait so the UI never hangs
    // indefinitely; the user can still fill the form in manually.
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 120_000);
    try {
      const headers = await getAdminHeaders();
      const response = await fetch(
        `${NEST_API_URL}/api/scraper/enhance-preview`,
        {
          method: "POST",
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            title: guessTitleFromUrl(urlInput),
            application_url: urlInput,
            source_url: urlInput,
            source: urlInput,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `Server error: ${response.status}`,
        );
      }

      const result = await response.json();

      if (!result || !result.success || !result.opportunity) {
        throw new Error(result?.error || "No data received from scraper");
      }

      const opportunity = result.opportunity as OpportunityPreviewItem;
      const mapped = mapPreviewToFormValues(opportunity, formData);
      setScrapedData(mapped);
      setFormData((prev) => ({
        ...prev,
        ...mapped,
        application_url: urlInput,
      }));

      const confidence = Number(
        result.completeness?.score ?? opportunity.confidence ?? 0,
      );
      if (confidence < 60) {
        showNotification(`Warning: Low confidence extraction (${confidence}%).`, "warning");
      }
    } catch (error: unknown) {
      console.error("Scraping failed:", error);
      const aborted =
        error instanceof DOMException && error.name === "AbortError";
      showNotification(
        aborted
          ? "This page is taking too long to analyze. It may be slow or blocking automated access — you can still fill in the details manually."
          : `Scraping failed: ${getErrorMessage(error, "Check that the backend is running")}`,
        "error",
      );
    } finally {
      window.clearTimeout(timeout);
      setIsScraping(false);
    }
  }

  async function handleBulkScrape(urls: string[]) {
    if (!urls.length) return;

    setIsScraping(true);
    setBulkPreview([]);

    try {
      const headers = await getAdminHeaders();
      const previewResults: BulkPreviewItem[] = [];

      for (let index = 0; index < urls.length; index += 1) {
        const url = urls[index];
        setLoadingStatus({
          message: `Previewing ${index + 1} of ${urls.length}...`,
          progress: Math.round(((index + 1) / urls.length) * 100),
          source: url,
          phase: "preview",
        });

        // Per-URL timeout so one slow/blocking source can't stall the whole
        // batch — it is marked "needs review" and the loop moves on.
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 90_000);
        try {
          const response = await fetch(
            `${NEST_API_URL}/api/scraper/enhance-preview`,
            {
              method: "POST",
              headers,
              signal: controller.signal,
              body: JSON.stringify({
                title: guessTitleFromUrl(url),
                application_url: url,
                source_url: url,
                source: url,
              }),
            },
          );

          const result = await response.json().catch(() => ({}));
          if (!response.ok || !result.success || !result.opportunity) {
            previewResults.push({
              title: guessTitleFromUrl(url),
              organization: "Unknown",
              category: "Scholarships",
              application_url: url,
              source_url: url,
              confidence: 0,
              status: "needs_review",
              errors: [result.error || `Failed to preview ${url}`],
            });
            continue;
          }

          const opportunity = result.opportunity as OpportunityPreviewItem;
          const confidence = Number(
            result.completeness?.score ?? opportunity.confidence ?? 0,
          );
          previewResults.push({
            ...opportunity,
            title: opportunity.title || guessTitleFromUrl(url),
            application_url:
              opportunity.application_url ||
              opportunity.applyUrl ||
              opportunity.apply_url ||
              url,
            source_url: opportunity.source_url || opportunity.sourceUrl || url,
            confidence,
            status: confidence >= 60 ? "ready" : "needs_review",
            errors: [],
          });
        } catch (error: unknown) {
          const aborted =
            error instanceof DOMException && error.name === "AbortError";
          previewResults.push({
            title: guessTitleFromUrl(url),
            organization: "Unknown",
            category: "Scholarships",
            application_url: url,
            source_url: url,
            confidence: 0,
            status: "needs_review",
            errors: [
              aborted
                ? "Timed out — source too slow to analyze"
                : getErrorMessage(error, "Preview failed"),
            ],
          });
        } finally {
          window.clearTimeout(timeout);
        }
      }

      setBulkPreview(previewResults);

      const errorCount = previewResults.filter(
        (item) => item.errors.length > 0,
      ).length;
      if (errorCount > 0) {
        showNotification(`Processed ${urls.length} URLs. ${errorCount} had issues.`, "warning");
      }
    } catch (error: unknown) {
      console.error("Bulk scraping failed:", error);
      showNotification(`Bulk import failed: ${getErrorMessage(error)}`, "error");
    } finally {
      setIsScraping(false);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const payload = buildOpportunityPayload(formData);

    try {
      const response = await fetch(
        editingId
          ? `${NEST_API_URL}/opportunities/${editingId}`
          : `${NEST_API_URL}/opportunities`,
        {
          method: editingId ? "PATCH" : "POST",
          headers: await getAdminHeaders(),
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || "Failed to save opportunity");
      }

      resetForm();
      setShowModal(false);
      void fetchOpportunities();
    } catch (error: unknown) {
      showNotification(getErrorMessage(error, "Failed to save opportunity"), "error");
    }
  }

  function resetForm() {
    setFormData({
      title: "",
      summary: "",
      description: "",
      category: "Scholarships",
      organization: "",
      location: "",
      is_remote: false,
      application_url: "",
      close_date: "",
      image_url: "",
      is_featured: false,
      status: "active",
      eligibility: { school: "", major: "", min_cgpa: "", countries: [] },
    });
    setUrlInput("");
    setScrapedData(null);
    setBulkPreview([]);
    setCreationMode("manual");
    setEditingId(null);
  }

  async function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScraping(true);

    try {
      // Read file content
      const text = await file.text();

      // Parse URLs from CSV
      const lines = text.split("\n");
      const urls = lines
        .map((line) => line.trim().split(",")[0]) // First column
        .filter((url) => {
          try {
            new URL(url);
            return true;
          } catch {
            return false;
          }
        })
        .slice(0, 50); // Max 50 URLs

      if (urls.length === 0) {
        showNotification(
          "No valid URLs found in file. Please ensure URLs are in the first column.",
          "warning",
        );
        setIsScraping(false);
        return;
      }

      // Process with backend
      await handleBulkScrape(urls);
    } catch (error) {
      console.error("File processing failed:", error);
      showNotification(
        "Failed to process file. Please ensure it is a valid CSV/Excel file.",
        "error",
      );
      setIsScraping(false);
    }
  }

  function toggleRowExpansion(id: string) {
    setExpandedRows((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const categories = [
    "Scholarships",
    "Internships",
    "Fellowships",
    "Grants",
    "Programs",
    "Graduate Programs",
    "Bootcamps",
    "Events",
    "Competitions",
  ];
  const statuses = [
    { value: "pending_review", label: "Needs Review", color: "var(--warning)" },
    { value: "active", label: "Active", color: "var(--success)" },
    { value: "closed", label: "Closed", color: "var(--text-tertiary)" },
    { value: "draft", label: "Draft", color: "var(--warning)" },
    { value: "rejected", label: "Rejected", color: "var(--danger)" },
  ];

  const getStatusStyle = (status: OpportunityStatus) => {
    if (status === "active")
      return { background: "rgba(16, 185, 129, 0.15)", color: "#10b981" };
    if (status === "pending_review")
      return { background: "rgba(245, 158, 11, 0.18)", color: "#f59e0b" };
    if (status === "draft")
      return { background: "rgba(99, 102, 241, 0.15)", color: "#6366f1" };
    return { background: "rgba(239, 68, 68, 0.15)", color: "#ef4444" };
  };

  const startRow =
    totalOpportunities === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRow = Math.min(currentPage * pageSize, totalOpportunities);

  function renderPagination() {
    return (
      <div className="opportunities-pagination">
        <span>
          Showing {startRow.toLocaleString()}-{endRow.toLocaleString()} of{" "}
          {totalOpportunities.toLocaleString()}
        </span>
        <div className="opportunities-pagination-controls">
          <select
            className="input-field"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
          >
            <option value={25}>25 rows</option>
            <option value={50}>50 rows</option>
            <option value={100}>100 rows</option>
            <option value={200}>200 rows</option>
          </select>
          <button
            className="btn btn-secondary"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
          >
            <ChevronLeft size={16} />
          </button>
          <span className="opportunities-page-count">
            Page {currentPage} of {totalPages}
          </span>
          <button
            className="btn btn-secondary"
            disabled={currentPage >= totalPages}
            onClick={() =>
              setCurrentPage((page) => Math.min(page + 1, totalPages))
            }
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  const visibleIds = filteredOpps.map((opp) => opp.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id));

  // Page-scoped: adds/removes only this page's rows so a cross-page
  // "Select all matching" isn't wiped out by touching the header checkbox.
  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }

  type StatCardView =
    | "total"
    | "active"
    | "expired"
    | "missingDeadline"
    | "featured"
    | "expiringSoon"
    | "needsReview";

  // Each stat card narrows the list to exactly the cohort it counts, using
  // the same predicates as opportunity_admin_stats(). Search and category are
  // cleared because the card numbers are global — leaving them applied would
  // show fewer rows than the card claims.
  function applyStatCardView(view: StatCardView, alreadyActive: boolean) {
    setSearchQuery("");
    setCategoryFilter("all");
    setMissingDeadlineOnly(!alreadyActive && view === "missingDeadline");
    setFeaturedOnly(!alreadyActive && view === "featured");
    setExpiringSoonOnly(!alreadyActive && view === "expiringSoon");

    if (alreadyActive) {
      // Second click restores the default working view.
      setStatusFilter("all");
      setShowExpired(false);
      return;
    }

    setStatusFilter(
      view === "active"
        ? "active"
        : view === "expired"
          ? "closed"
          : view === "needsReview"
            ? "pending_review"
            : "all",
    );
    // These cohorts span expired rows too; without this the list would hide
    // some of them and the count on the card wouldn't match the rows below.
    setShowExpired(
      ["total", "missingDeadline", "featured", "expiringSoon"].includes(view),
    );
  }

  // Selects every id matching the current filters, not just this page: pages
  // through the same list endpoint with the same params as the table fetch.
  async function handleSelectAllMatching() {
    if (selectingAll || bulkActionBusy) return;
    setSelectingAll(true);
    try {
      const headers = await getAdminHeaders();
      const all = new Set<string>();
      const limit = 200;
      // Hard stop at 25 pages (5,000 rows) so a runaway filter can't loop the
      // admin tab forever.
      for (let page = 1; page <= 25; page += 1) {
        const params = buildListParams(page, limit);
        const response = await fetch(
          `${NEST_API_URL}/opportunities/admin/list?${params.toString()}`,
          { headers },
        );
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.message || "Failed to load all matching rows");
        }
        const result = (await response.json()) as OpportunityListResponse;
        (result.data || []).forEach((opp) => all.add(opp.id));
        if (!result.data?.length || page >= (result.totalPages || 1)) break;
      }
      setSelectedIds(all);
      showPageNotice(
        "success",
        `Selected all ${all.size.toLocaleString()} matching opportunit${all.size === 1 ? "y" : "ies"}.`,
      );
    } catch (error: unknown) {
      showPageNotice(
        "error",
        getErrorMessage(error, "Failed to select all matching opportunities"),
      );
    } finally {
      setSelectingAll(false);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderBulkActionBar() {
    if (selectedIds.size === 0) return null;
    return (
      <div
        role="toolbar"
        aria-label="Bulk actions"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          gap: "10px",
          flexWrap: "wrap",
          padding: "10px 14px",
          marginBottom: "12px",
          background: "var(--bg-tertiary)",
          border: "1px solid var(--border-color)",
          borderRadius: "10px",
        }}
      >
        <strong style={{ color: "var(--text-primary)", fontSize: "13px" }}>
          {selectedIds.size.toLocaleString()} selected
        </strong>
        {!bulkActionBusy && selectedIds.size < totalOpportunities && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={selectingAll}
            onClick={() => void handleSelectAllMatching()}
            title="Select every opportunity matching the current filters, across all pages"
          >
            {selectingAll ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <CheckCircle2 size={14} />
            )}
            {selectingAll
              ? "Selecting…"
              : `Select all ${totalOpportunities.toLocaleString()}`}
          </button>
        )}
        {bulkProgress && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              color: "var(--text-secondary)",
              fontSize: "12px",
            }}
            role="status"
            aria-live="polite"
          >
            <span
              aria-hidden
              style={{
                width: "120px",
                height: "6px",
                borderRadius: "999px",
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                overflow: "hidden",
              }}
            >
              <span
                style={{
                  display: "block",
                  height: "100%",
                  width: `${Math.min(100, Math.round((bulkProgress.done / Math.max(bulkProgress.total, 1)) * 100))}%`,
                  background: "var(--apple-blue)",
                  transition: "width 0.4s ease",
                }}
              />
            </span>
            {bulkProgress.done}/{bulkProgress.total}
            {bulkProgress.note ? ` · ${bulkProgress.note}` : ""}
          </span>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={bulkActionBusy || selectingAll}
          onClick={() => void handleBulkStatusUpdate("active")}
        >
          {bulkAction === "approve" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <CheckCircle2 size={14} />
          )}
          Approve
        </button>
        <button
          type="button"
          className="btn btn-secondary danger"
          disabled={bulkActionBusy || selectingAll}
          onClick={() => void handleBulkStatusUpdate("rejected")}
        >
          {bulkAction === "reject" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <X size={14} />
          )}
          Reject
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={bulkActionBusy || selectingAll}
          onClick={() => void handleBulkFindDeadlines()}
          style={{ color: "#f59e0b" }}
          title="Re-scrape each selected source and read its deadline (AI fallback)"
        >
          {bulkAction === "findDeadlines" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <CalendarClock size={14} />
          )}
          {bulkAction === "findDeadlines" && bulkProgress
            ? "Finding deadlines…"
            : "Find Deadlines"}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={bulkActionBusy || selectingAll}
          onClick={() => void handleBulkEnhance()}
          style={{ color: "#60a5fa" }}
          title="Use AI to complete the profile for each selected opportunity"
        >
          {bulkAction === "aiComplete" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Sparkles size={14} />
          )}
          {bulkAction === "aiComplete" && bulkProgress
            ? "AI completing…"
            : "AI Complete"}
        </button>
        <select
          aria-label="Move selected to category"
          disabled={bulkActionBusy}
          value=""
          onChange={(event) => {
            const category = event.target.value;
            event.target.value = "";
            if (category) void handleBulkCategoryMove(category);
          }}
          style={{
            padding: "6px 10px",
            borderRadius: "8px",
            border: "1px solid var(--border-color)",
            background: "var(--bg-secondary)",
            color: "var(--text-primary)",
            fontSize: "13px",
          }}
        >
          <option value="">Move to category…</option>
          {BULK_MOVE_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-secondary danger"
          disabled={bulkActionBusy || selectingAll}
          onClick={() => void handleBulkDelete()}
        >
          {bulkAction === "delete" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Trash2 size={14} />
          )}
          Delete
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={bulkActionBusy || selectingAll}
          onClick={() => setSelectedIds(new Set())}
          style={{ marginLeft: "auto" }}
        >
          Clear selection
        </button>
      </div>
    );
  }

  function renderOpportunityTable() {
    return (
      <>
        {renderBulkActionBar()}
        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ margin: 0, minWidth: "1220px" }}>
            <thead>
              <tr>
                <th style={{ width: "36px" }}>
                  <input
                    type="checkbox"
                    aria-label="Select all visible opportunities"
                    checked={allVisibleSelected}
                    ref={(el) => {
                      if (el)
                        el.indeterminate =
                          someVisibleSelected && !allVisibleSelected;
                    }}
                    onChange={toggleSelectAllVisible}
                    style={{ cursor: "pointer" }}
                  />
                </th>
                <th>Title</th>
                <th>Organization</th>
                <th>Category</th>
                <th>Status</th>
                <th>Deadline</th>
                <th>Location</th>
                <th>Quality</th>
                <th>Views</th>
                <th>Applications</th>
                <th>Created</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOpps.map((opp) => {
                const qualityScore = opp.metadata?.extraction_quality_score;
                // Source of truth is the persisted status. The metadata
                // needs_review flag lingers after an opportunity is approved,
                // which produced a green "Needs review" badge on Active rows.
                const needsReview = opp.status === "pending_review";
                const isEnhancing = enhancingIds.has(opp.id);
                const isSharing = sharingIds.has(opp.id);
                const isVerifying = verifyingIds.has(opp.id);
                // "Rolling" is a real answer, not a gap — only offer the
                // deadline hunt where the date is genuinely unknown.
                const deadlineUnknown =
                  !opp.close_date &&
                  opp.metadata?.deadline_confidence !== "rolling";
                return (
                  <tr key={opp.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${opp.title || "opportunity"}`}
                        checked={selectedIds.has(opp.id)}
                        onChange={() => toggleSelected(opp.id)}
                        style={{ cursor: "pointer" }}
                      />
                    </td>
                    <td style={{ maxWidth: "320px" }}>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                        }}
                      >
                        <strong
                          style={{
                            color: "var(--text-primary)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {opp.title || "Untitled opportunity"}
                        </strong>
                        <span
                          style={{
                            color: "var(--text-tertiary)",
                            fontSize: "12px",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {opp.application_url || opp.source_url || "No URL"}
                        </span>
                      </div>
                    </td>
                    <td>{opp.organization || "Unknown"}</td>
                    <td>{opp.category || "Uncategorized"}</td>
                    <td>
                      <span
                        style={{
                          ...getStatusStyle(effectiveStatus(opp)),
                          padding: "4px 9px",
                          borderRadius: "999px",
                          fontSize: "12px",
                          fontWeight: 700,
                          textTransform: "capitalize",
                        }}
                      >
                        {needsReview
                          ? "Needs review"
                          : (effectiveStatus(opp) || "draft").replace("_", " ")}
                      </span>
                    </td>
                    <td>{deadlineDisplay(opp)}</td>
                    <td>
                      {opp.is_remote ? "Remote" : opp.location || "Not set"}
                    </td>
                    <td>
                      {typeof qualityScore === "number"
                        ? `${qualityScore}%`
                        : "N/A"}
                    </td>
                    <td>{(opp.views || 0).toLocaleString()}</td>
                    <td>{(opp.applications || 0).toLocaleString()}</td>
                    <td>{formatOpportunityDate(opp.created_at) || "N/A"}</td>
                    <td>
                      <div className="opportunity-row-actions">
                        {needsReview && (
                          <button
                            type="button"
                            className="btn btn-secondary opportunity-icon-button"
                            title="Approve"
                            aria-label={`Approve ${opp.title || "opportunity"}`}
                            onClick={() => handleStatusUpdate(opp.id, "active")}
                          >
                            <CheckCircle2 size={15} />
                          </button>
                        )}
                        {deadlineUnknown && (
                          <button
                            type="button"
                            className="btn btn-secondary opportunity-icon-button"
                            title="Find deadline: re-scrape the source and read the date with AI"
                            aria-label={`Find deadline for ${opp.title || "opportunity"}`}
                            disabled={isVerifying}
                            onClick={() => void handleFindDeadline(opp.id)}
                            style={{ color: "#f59e0b" }}
                          >
                            {isVerifying ? (
                              <Loader2 size={15} className="animate-spin" />
                            ) : (
                              <CalendarClock size={15} />
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-secondary opportunity-icon-button"
                          title="Improve details with AI"
                          aria-label={`Improve ${opp.title || "opportunity"} with AI`}
                          disabled={isEnhancing}
                          onClick={() => handleEnhanceOpportunity(opp.id)}
                          style={{ color: "#60a5fa" }}
                        >
                          {isEnhancing ? (
                            <Loader2 size={15} className="animate-spin" />
                          ) : (
                            <Sparkles size={15} />
                          )}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary opportunity-icon-button"
                          title="Share opportunity"
                          aria-label={`Share ${opp.title || "opportunity"}`}
                          disabled={isSharing}
                          onClick={() => void handleShareOpportunity(opp)}
                        >
                          {isSharing ? (
                            <Loader2 size={15} className="animate-spin" />
                          ) : (
                            <Share2 size={15} />
                          )}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary opportunity-icon-button"
                          title="Open on Edutu"
                          aria-label={`Open ${opp.title || "opportunity"} on Edutu`}
                          onClick={() =>
                            openExternalUrl(buildAppOpportunityUrl(opp.id))
                          }
                        >
                          <ExternalLink size={15} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary opportunity-icon-button"
                          title="Edit"
                          aria-label={`Edit ${opp.title || "opportunity"}`}
                          onClick={() => handleEdit(opp)}
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary opportunity-icon-button"
                          title="Delete"
                          aria-label={`Delete ${opp.title || "opportunity"}`}
                          onClick={() => handleDelete(opp.id)}
                          style={{ color: "#ef4444" }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {renderPagination()}
      </>
    );
  }

  return (
    <div className="opportunities-page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Opportunities</h1>
          <p className="opportunities-subtitle">
            Manage and publish opportunities for your users
          </p>
        </div>
        <div className="opportunities-actions">
          <button
            type="button"
            className="btn btn-secondary opportunities-action-button"
            onClick={handleExportOpportunities}
          >
            <Download size={16} />
            <span className="btn-text">Export</span>
          </button>
          <div className="opportunities-add-menu" data-add-dropdown>
            <button
              type="button"
              className="btn btn-primary opportunities-action-button"
              aria-expanded={showAddDropdown}
              onClick={() => setShowAddDropdown(!showAddDropdown)}
            >
              <Plus size={16} />
              <span className="btn-text">Add Opportunity</span>
              <ChevronDown size={14} />
            </button>

            {showAddDropdown && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  marginTop: "8px",
                  background: "var(--card-bg)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "12px",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                  zIndex: 1000,
                  minWidth: "280px",
                  overflow: "hidden",
                }}
              >
                {addMethods.map((method) =>
                  method.id === "divider" ? (
                    <div
                      key={method.id}
                      style={{
                        padding: "10px 16px 8px",
                        fontSize: "11px",
                        color: "var(--text-tertiary)",
                        background: "var(--bg-tertiary)",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                      }}
                    >
                      {method.name.replace("─── ", "").replace(" ───", "")}
                    </div>
                  ) : (
                    <button
                      type="button"
                      key={method.id}
                      onClick={method.action}
                      style={{
                        width: "100%",
                        padding: "14px 16px",
                        border: "none",
                        background: "transparent",
                        color: "var(--text-primary)",
                        textAlign: "left",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "14px",
                        fontSize: "14px",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--hover-bg)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          background:
                            method.id === "apify-edutu"
                              ? "linear-gradient(135deg, #ff6600, #ff4500)"
                              : method.id.startsWith("apify")
                                ? "linear-gradient(135deg, var(--apple-blue), var(--apple-blue-alt))"
                                : "var(--bg-tertiary)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: method.id.startsWith("apify")
                            ? "white"
                            : "var(--text-secondary)",
                        }}
                      >
                        {method.icon}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, marginBottom: 2 }}>
                          {method.name}
                        </div>
                        {method.desc && (
                          <div
                            style={{
                              fontSize: "12px",
                              color: "var(--text-tertiary)",
                            }}
                          >
                            {method.desc}
                          </div>
                        )}
                      </div>
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {pageNotice && (
        <div
          className={`opportunities-share-notice ${pageNotice.type}`}
          role="status"
          aria-live="polite"
        >
          {pageNotice.message}
        </div>
      )}

      {/* Stats Cards — every card is a filter: click to see exactly the rows
          it counts, click again to go back. The cohorts overlap (an expired
          row can also be missing a deadline), so the cards are views into the
          same 519, not slices that sum to it. */}
      <div className="stats-grid opportunities-stats">
        {(() => {
          const noCohortToggles =
            !missingDeadlineOnly && !featuredOnly && !expiringSoonOnly;
          const cards: Array<{
            label: string;
            value: number;
            icon: typeof Target;
            color: string;
            view: StatCardView;
            isActive: boolean;
          }> = [
            {
              label: "Total Opportunities",
              value: stats.total,
              icon: Target,
              color: "var(--apple-blue)",
              view: "total",
              isActive:
                statusFilter === "all" && showExpired && noCohortToggles,
            },
            {
              label: "Active",
              value: stats.active,
              icon: CheckCircle2,
              color: "var(--success)",
              view: "active",
              isActive: statusFilter === "active" && noCohortToggles,
            },
            // Hidden from the list by default, so without this card the gap
            // between "Total" and the row count is unexplained. Clicking it
            // reveals them rather than making you hunt for the toggle.
            {
              label: "Expired",
              value: stats.expired,
              icon: CalendarClock,
              color: "var(--text-tertiary)",
              view: "expired",
              isActive: statusFilter === "closed" && noCohortToggles,
            },
            {
              label: "Missing Deadline",
              value: stats.missingDeadline,
              icon: AlertCircle,
              color: "#f59e0b",
              view: "missingDeadline",
              isActive: missingDeadlineOnly,
            },
            {
              label: "Featured",
              value: stats.featured,
              icon: Star,
              color: "var(--warning)",
              view: "featured",
              isActive: featuredOnly,
            },
            {
              label: "Expiring Soon",
              value: stats.expiringSoon,
              icon: AlertCircle,
              color: "var(--danger)",
              view: "expiringSoon",
              isActive: expiringSoonOnly,
            },
            {
              label: "Needs Review",
              value: stats.needsReview,
              icon: AlertCircle,
              color: "var(--warning)",
              view: "needsReview",
              isActive: statusFilter === "pending_review" && noCohortToggles,
            },
          ];
          return cards.map((stat) => ({
            ...stat,
            onClick: () => applyStatCardView(stat.view, stat.isActive),
          }));
        })().map((stat, index) => (
          <div
            key={index}
            className="stat-card opportunities-stat-card"
            onClick={stat.onClick}
            role={stat.onClick ? "button" : undefined}
            tabIndex={stat.onClick ? 0 : undefined}
            onKeyDown={
              stat.onClick
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      stat.onClick();
                    }
                  }
                : undefined
            }
            aria-pressed={stat.onClick ? Boolean(stat.isActive) : undefined}
            style={
              stat.onClick
                ? {
                    cursor: "pointer",
                    outline: stat.isActive
                      ? `2px solid ${stat.color}`
                      : undefined,
                  }
                : undefined
            }
          >
            <div
              className="opportunities-stat-icon"
              style={{ color: stat.color }}
            >
              <stat.icon size={20} strokeWidth={1.8} />
            </div>
            <div className="opportunities-stat-value">{stat.value}</div>
            <div className="opportunities-stat-label">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Filters Bar */}
      <div className="card opportunities-toolbar">
        <div className="opportunities-filter-grid">
          <div className="opportunities-search-field">
            <Search size={18} />
            <input
              type="text"
              className="input-field"
              placeholder="Search opportunities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <select
            className="input-field"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            className="input-field"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            {statuses.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          <select
            className="input-field"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="deadline">Deadline</option>
            <option value="featured">Featured</option>
          </select>

          <div className="opportunities-view-toggle">
            <button
              type="button"
              className={`btn ${viewMode === "table" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setViewMode("table")}
              title="Table view"
              aria-pressed={viewMode === "table"}
            >
              <Table2 size={18} />
            </button>
            <button
              type="button"
              className={`btn ${viewMode === "grid" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setViewMode("grid")}
              title="Card view"
              aria-pressed={viewMode === "grid"}
            >
              <LayoutGrid size={18} />
            </button>
          </div>
        </div>

        <div className="opportunities-expired-row">
          <label className="opportunities-expired-toggle">
            <input
              type="checkbox"
              // Forced on when a status is picked: that path can't hide expired
              // rows, so an unchecked box would be lying about what's listed.
              checked={showExpired || statusFilter !== "all"}
              disabled={statusFilter !== "all"}
              onChange={(e) => setShowExpired(e.target.checked)}
            />
            <span>Show expired</span>
          </label>

          <label className="opportunities-expired-toggle">
            <input
              type="checkbox"
              checked={missingDeadlineOnly}
              onChange={(e) => setMissingDeadlineOnly(e.target.checked)}
            />
            <span>Missing deadline only</span>
          </label>

          <span className="opportunities-expired-hint">
            {missingDeadlineOnly
              ? "Showing only opportunities with no deadline — use Find Deadlines to recover them."
              : featuredOnly
                ? "Showing featured opportunities only — click the Featured card again to clear."
                : expiringSoonOnly
                  ? "Showing deadlines within the next 7 days — click the Expiring Soon card again to clear."
                  : statusFilter !== "all"
                    ? "A status filter lists every match, expired or not."
                    : showExpired
                      ? "Showing every opportunity, including expired ones."
                      : "Closed opportunities and passed deadlines are hidden."}
          </span>
        </div>
      </div>

      {/* Opportunities Grid */}
      <div className="card opportunities-results-card">
        {loading ? (
          <div className="opportunities-state">
            <Loader2 size={40} className="animate-spin" />
            <p>Loading opportunities...</p>
          </div>
        ) : filteredOpps.length === 0 ? (
          <div className="opportunities-state">
            <Target size={48} />
            <p>No opportunities found</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowModal(true)}
            >
              <Plus size={18} />
              Create First Opportunity
            </button>
          </div>
        ) : viewMode === "table" ? (
          renderOpportunityTable()
        ) : (
          <>
            {renderBulkActionBar()}
            <div className="opportunities-grid">
              {filteredOpps.map((opp) => {
                const isEnhancing = enhancingIds.has(opp.id);
                const isSharing = sharingIds.has(opp.id);
                const isExpanded = expandedRows.has(opp.id);
                // Status is the source of truth; the metadata needs_review flag
                // persists after approval and mislabels Active rows.
                const needsReview = opp.status === "pending_review";
                const summary = truncateText(
                  normalizeText(
                    opp.summary || opp.description,
                    "No summary available yet.",
                  ),
                  170,
                );
                const deadline = deadlineDisplay(opp);

                return (
                  <article
                    key={opp.id}
                    className={`opportunity-card ${isExpanded ? "expanded" : ""}`}
                  >
                    <div
                      className="opportunity-card-head"
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      onClick={() => toggleRowExpansion(opp.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleRowExpansion(opp.id);
                        }
                      }}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Select ${opp.title || "opportunity"}`}
                        checked={selectedIds.has(opp.id)}
                        onChange={() => toggleSelected(opp.id)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ cursor: "pointer" }}
                      />
                      <div className="opportunity-card-thumb">
                        {opp.image_url && !brokenImageIds.has(opp.id) ? (
                          <img
                            src={opp.image_url}
                            alt=""
                            loading="lazy"
                            onError={() =>
                              setBrokenImageIds((prev) => {
                                if (prev.has(opp.id)) return prev;
                                const next = new Set(prev);
                                next.add(opp.id);
                                return next;
                              })
                            }
                          />
                        ) : (
                          <Target size={20} />
                        )}
                      </div>
                      <div className="opportunity-card-head-main">
                        <h3 className="opportunity-card-title">
                          {opp.title || "Untitled opportunity"}
                        </h3>
                        <div className="opportunity-card-sub">
                          <span
                            className="opportunity-status-badge"
                            style={getStatusStyle(effectiveStatus(opp))}
                          >
                            {needsReview
                              ? "Needs review"
                              : (effectiveStatus(opp) || "draft").replace(
                                  "_",
                                  " ",
                                )}
                          </span>
                          {opp.is_featured && (
                            <span className="opportunity-featured-badge">
                              <Star size={11} fill="currentColor" />
                              Featured
                            </span>
                          )}
                          <span className="opportunity-card-sub-item">
                            {opp.category || "Opportunity"}
                          </span>
                          <span
                            className={`opportunity-card-sub-item ${
                              isPastDate(opp.close_date) ? "danger" : ""
                            }`}
                          >
                            <Calendar size={11} />
                            {deadline}
                          </span>
                        </div>
                      </div>
                      <ChevronDown
                        size={16}
                        className={
                          isExpanded
                            ? "opportunity-details-icon expanded"
                            : "opportunity-details-icon"
                        }
                      />
                    </div>

                    {isExpanded && (
                      <div className="opportunity-card-body">
                        <p className="opportunity-card-summary">{summary}</p>

                        <div className="opportunity-card-meta">
                          <span>
                            <Building size={13} />
                            {opp.organization || "Unknown host"}
                          </span>
                          <span>
                            <MapPin size={13} />
                            {opp.is_remote
                              ? "Remote"
                              : opp.location || "Location not set"}
                          </span>
                          <span
                            className={
                              isPastDate(opp.close_date) ? "danger" : ""
                            }
                          >
                            <Calendar size={13} />
                            {deadline}
                          </span>
                        </div>

                        {needsReview && (
                          <div className="opportunity-quality-note">
                            Quality{" "}
                            {opp.metadata?.extraction_quality_score ?? "n/a"}%
                            {opp.metadata?.extraction_missing_fields?.length
                              ? ` - Missing: ${opp.metadata.extraction_missing_fields.join(", ")}`
                              : ""}
                          </div>
                        )}

                        <div className="opportunity-card-actions">
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={isSharing}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleShareOpportunity(opp);
                            }}
                          >
                            {isSharing ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Share2 size={14} />
                            )}
                            Share
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={(e) => {
                              e.stopPropagation();
                              openExternalUrl(buildAppOpportunityUrl(opp.id));
                            }}
                          >
                            <ExternalLink size={14} />
                            Open
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(opp);
                            }}
                          >
                            <Edit3 size={14} />
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={isEnhancing}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEnhanceOpportunity(opp.id);
                            }}
                          >
                            {isEnhancing ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Sparkles size={14} />
                            )}
                            AI improve
                          </button>
                          {opp.status === "pending_review" && (
                            <>
                              <button
                                type="button"
                                className="btn btn-primary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStatusUpdate(opp.id, "active");
                                }}
                              >
                                <CheckCircle2 size={14} />
                                Approve
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary danger"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStatusUpdate(opp.id, "rejected");
                                }}
                              >
                                <X size={14} />
                                Reject
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            className="btn btn-secondary danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm("Delete this opportunity?")) {
                                handleDelete(opp.id);
                              }
                            }}
                          >
                            <Trash2 size={14} />
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
            {renderPagination()}
          </>
        )}
      </div>

      {/* Loading Modal */}
      {showLoadingModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            style={{
              background: "var(--card-bg)",
              borderRadius: 16,
              padding: 24,
              maxWidth: 900,
              width: "95%",
              textAlign: "center",
              maxHeight: "85vh",
              overflow: "auto",
              border: "1px solid var(--border-color)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            }}
          >
            {loadedResults.length > 0 ? (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 16,
                  }}
                >
                  <div>
                    <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
                      Preview Opportunities
                    </h2>
                    <p
                      style={{
                        color: "var(--text-tertiary)",
                        margin: "4px 0 0",
                        fontSize: 13,
                      }}
                    >
                      {loadedResults.length} opportunities found from{" "}
                      {loadingStatus.source === "all"
                        ? "all sources"
                        : loadingStatus.source}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowLoadingModal(false);
                      setLoadedResults([]);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 8,
                    }}
                  >
                    <X size={24} />
                  </button>
                </div>

                <div
                  style={{
                    maxHeight: "50vh",
                    overflow: "auto",
                    marginBottom: 16,
                    border: "1px solid var(--border-color)",
                    borderRadius: 8,
                  }}
                >
                  <table
                    style={{
                      width: "100%",
                      fontSize: 13,
                      borderCollapse: "collapse",
                    }}
                  >
                    <thead
                      style={{
                        position: "sticky",
                        top: 0,
                        background: "var(--bg-tertiary)",
                      }}
                    >
                      <tr>
                        <th
                          style={{
                            padding: "10px 12px",
                            textAlign: "left",
                            fontWeight: 600,
                          }}
                        >
                          Title
                        </th>
                        <th
                          style={{
                            padding: "10px 12px",
                            textAlign: "left",
                            fontWeight: 600,
                          }}
                        >
                          Category
                        </th>
                        <th
                          style={{
                            padding: "10px 12px",
                            textAlign: "left",
                            fontWeight: 600,
                          }}
                        >
                          Organization
                        </th>
                        <th
                          style={{
                            padding: "10px 12px",
                            textAlign: "left",
                            fontWeight: 600,
                          }}
                        >
                          Location
                        </th>
                        <th
                          style={{
                            padding: "10px 12px",
                            textAlign: "left",
                            fontWeight: 600,
                          }}
                        >
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadedResults.map((opp, i: number) => (
                        <tr
                          key={i}
                          style={{
                            borderBottom: "1px solid var(--border-color)",
                          }}
                        >
                          <td style={{ padding: "10px 12px", maxWidth: 250 }}>
                            <div style={{ fontWeight: 500 }}>
                              {opp.title?.slice(0, 50)}
                              {opp.title?.length > 50 ? "..." : ""}
                            </div>
                            {opp.summary && (
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "var(--text-tertiary)",
                                  marginTop: 4,
                                }}
                              >
                                {opp.summary?.slice(0, 80)}...
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            <span
                              style={{
                                padding: "2px 8px",
                                borderRadius: 4,
                                fontSize: 11,
                                background: "var(--apple-blue)",
                                color: "white",
                                fontWeight: 500,
                              }}
                            >
                              {opp.category}
                            </span>
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            {opp.organization?.slice(0, 20) || "-"}
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            {opp.location?.slice(0, 15) || "-"}
                          </td>
                          <td
                            style={{
                              padding: "10px 12px",
                              color: "var(--success)",
                              fontWeight: 500,
                            }}
                          >
                            {opp.award_amount || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setShowLoadingModal(false);
                      setLoadedResults([]);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                    onClick={() => refineWithAI(loadedResults)}
                  >
                    <Sparkles size={16} />
                    Refine with AI
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                    onClick={() => saveOpportunities(loadedResults)}
                  >
                    <CheckCircle2 size={16} />
                    Save All ({loadedResults.length})
                  </button>
                </div>
              </>
            ) : (
              <>
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: "50%",
                    background:
                      loadingStatus.progress < 100
                        ? "linear-gradient(135deg, var(--apple-blue), var(--apple-blue-alt))"
                        : loadingStatus.message.includes("Error")
                          ? "#ef4444"
                          : "#10b981",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 24px",
                  }}
                >
                  {loadingStatus.progress < 100 ? (
                    <RefreshCw
                      size={36}
                      style={{ color: "white" }}
                      className="animate-spin"
                    />
                  ) : loadingStatus.message.includes("Error") ? (
                    <X size={36} style={{ color: "white" }} />
                  ) : (
                    <CheckCircle2 size={36} style={{ color: "white" }} />
                  )}
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
                  {loadingStatus.progress < 100
                    ? "Syncing Opportunities"
                    : loadingStatus.message.includes("Error")
                      ? "Sync Failed"
                      : "Sync Complete"}
                </h2>
                <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>
                  {loadingStatus.source && (
                    <span
                      style={{
                        display: "inline-block",
                        padding: "4px 12px",
                        borderRadius: 20,
                        background: "var(--bg-tertiary)",
                        fontSize: 12,
                        marginBottom: 12,
                      }}
                    >
                      {loadingStatus.source === "all"
                        ? "All Sources"
                        : loadingStatus.source}
                    </span>
                  )}
                  <br />
                  {loadingStatus.message}
                </p>

                {loadingStatus.progress < 100 && (
                  <>
                    <div
                      style={{
                        height: 8,
                        background: "var(--bg-tertiary)",
                        borderRadius: 4,
                        overflow: "hidden",
                        marginBottom: 16,
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: loadingStatus.progress + "%",
                          background:
                            "linear-gradient(90deg, var(--apple-blue), var(--apple-blue-alt))",
                          borderRadius: 4,
                          transition: "width 0.5s ease",
                        }}
                      />
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 13,
                        color: "var(--text-tertiary)",
                      }}
                    >
                      <span>Progress</span>
                      <span>{loadingStatus.progress}%</span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 12,
                        justifyContent: "center",
                        marginTop: 24,
                      }}
                    >
                      {["Connecting", "Fetching", "Processing", "Complete"].map(
                        (step, i) => (
                          <div
                            key={step}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              fontSize: 12,
                              color:
                                loadingStatus.progress >= (i + 1) * 25
                                  ? "var(--success)"
                                  : "var(--text-tertiary)",
                            }}
                          >
                            <div
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background:
                                  loadingStatus.progress >= (i + 1) * 25
                                    ? "var(--success)"
                                    : "var(--bg-tertiary)",
                              }}
                            />
                            {step}
                          </div>
                        ),
                      )}
                    </div>
                  </>
                )}

                {loadingStatus.progress >= 100 && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ marginTop: 24 }}
                    onClick={() => {
                      setShowLoadingModal(false);
                      setLoadedResults([]);
                    }}
                  >
                    Close
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Share image chooser — pick the branded card or the source image */}
      {shareChooser && (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!shareChooser.sharing) setShareChooser(null);
          }}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "620px", borderRadius: "16px" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "18px",
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: "19px", fontWeight: 600 }}>
                  Choose share image
                </h2>
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: "13px",
                    color: "var(--text-tertiary)",
                    maxWidth: "420px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {normalizeText(
                    shareChooser.opportunity.title,
                    "Edutu opportunity",
                  )}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary opportunity-icon-button"
                aria-label="Close share chooser"
                disabled={shareChooser.sharing}
                onClick={() => setShareChooser(null)}
              >
                <X size={15} />
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "14px",
              }}
            >
              {(
                [
                  {
                    key: "card" as const,
                    label: "Branded card",
                    hint: "Generated Edutu design",
                    imageUrl: shareChooser.payload?.shareCard?.url || "",
                    badge: <Sparkles size={11} />,
                  },
                  {
                    key: "meta" as const,
                    label: "Original image",
                    hint: "Auto-loaded from the source page",
                    imageUrl: normalizeText(
                      shareChooser.opportunity.image_url,
                    ),
                    badge: <LinkIcon size={11} />,
                  },
                ]
              ).map((option) => {
                const available = Boolean(option.imageUrl);
                const selected =
                  available && shareChooser.choice === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    disabled={!available || shareChooser.sharing}
                    onClick={() =>
                      setShareChooser((current) =>
                        current
                          ? { ...current, choice: option.key }
                          : current,
                      )
                    }
                    style={{
                      position: "relative",
                      padding: 0,
                      textAlign: "left",
                      borderRadius: "14px",
                      overflow: "hidden",
                      cursor: available ? "pointer" : "not-allowed",
                      opacity: available ? 1 : 0.55,
                      background: "var(--bg-primary)",
                      border: selected
                        ? "2px solid var(--accent, #6366F1)"
                        : "2px solid var(--border-color)",
                      boxShadow: selected
                        ? "0 0 0 3px rgba(99,102,241,0.22)"
                        : "none",
                      transition: "border-color 0.15s, box-shadow 0.15s",
                    }}
                  >
                    <div
                      style={{
                        aspectRatio: "4 / 3",
                        background: "var(--bg-tertiary, rgba(0,0,0,0.06))",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                      }}
                    >
                      {available ? (
                        <img
                          src={option.imageUrl}
                          alt={option.label}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit:
                              option.key === "card" ? "contain" : "cover",
                          }}
                        />
                      ) : (
                        <span
                          style={{
                            fontSize: "12px",
                            color: "var(--text-tertiary)",
                          }}
                        >
                          No image available
                        </span>
                      )}
                    </div>
                    {selected && (
                      <span
                        style={{
                          position: "absolute",
                          top: "8px",
                          right: "8px",
                          background: "var(--accent, #6366F1)",
                          color: "#fff",
                          borderRadius: "999px",
                          display: "inline-flex",
                          padding: "3px",
                        }}
                      >
                        <CheckCircle2 size={16} />
                      </span>
                    )}
                    <div style={{ padding: "10px 12px" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "13px",
                          fontWeight: 600,
                        }}
                      >
                        {option.badge}
                        {option.label}
                      </div>
                      <div
                        style={{
                          fontSize: "11.5px",
                          color: "var(--text-tertiary)",
                          marginTop: "2px",
                        }}
                      >
                        {option.hint}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                marginTop: "18px",
              }}
            >
              <button
                type="button"
                className="btn btn-secondary"
                disabled={shareChooser.sharing}
                onClick={() => setShareChooser(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={shareChooser.sharing}
                onClick={() => void confirmShareChoice()}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "7px",
                }}
              >
                {shareChooser.sharing ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Share2 size={15} />
                )}
                Share
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal - Refactored */}
      {showModal && (
        <div
          className="modal-overlay"
          onClick={() => {
            resetForm();
            setShowModal(false);
          }}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: creationMode === "bulk" ? "900px" : "700px",
              maxHeight: "92vh",
              overflow: "auto",
              borderRadius: "16px",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "24px",
                paddingBottom: "20px",
                borderBottom: "1px solid var(--border-color)",
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 600 }}>
                  Add Opportunity
                </h2>
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: "14px",
                    color: "var(--text-tertiary)",
                  }}
                >
                  Create a new scholarship, internship, or program
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setShowModal(false);
                }}
                style={{
                  background: "var(--bg-tertiary)",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-primary)",
                  width: 36,
                  height: 36,
                  borderRadius: "10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Mode Selection Tabs */}
            <div
              style={{
                display: "flex",
                gap: "4px",
                marginBottom: "28px",
                background: "var(--bg-tertiary)",
                padding: "4px",
                borderRadius: "12px",
              }}
            >
              {[
                { id: "manual", label: "Manual", icon: Edit3 },
                { id: "url", label: "From URL", icon: LinkIcon },
                { id: "bulk", label: "Bulk Import", icon: FileSpreadsheet },
              ].map((mode) => (
                <button
                  type="button"
                  key={mode.id}
                  onClick={() => setCreationMode(mode.id as CreationMode)}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    padding: "12px 16px",
                    borderRadius: "8px",
                    border: "none",
                    background:
                      creationMode === mode.id
                        ? "var(--apple-blue)"
                        : "transparent",
                    color:
                      creationMode === mode.id
                        ? "white"
                        : "var(--text-secondary)",
                    cursor: "pointer",
                    fontWeight: 500,
                    fontSize: "14px",
                    transition: "all 0.2s ease",
                  }}
                >
                  <mode.icon size={16} />
                  {mode.label}
                </button>
              ))}
            </div>

            {/* URL Scrape Mode */}
            {creationMode === "url" && (
              <div style={{ marginBottom: "24px" }}>
                <div
                  style={{
                    padding: "20px",
                    background:
                      "linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(20, 110, 245, 0.1))",
                    borderRadius: "12px",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label
                      className="form-label"
                      style={{
                        marginBottom: "8px",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <LinkIcon size={16} />
                      Paste Opportunity URL
                    </label>
                    <div style={{ display: "flex", gap: "12px" }}>
                      <input
                        type="url"
                        className="input-field"
                        placeholder="https://scholarship-provider.com/apply"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        style={{ flex: 1, height: "48px" }}
                      />
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleScrapeUrl}
                        disabled={isScraping || !urlInput.trim()}
                        style={{ height: "48px", padding: "0 24px" }}
                      >
                        {isScraping ? (
                          <>
                            <Loader2 size={18} className="animate-spin" />{" "}
                            Scraping...
                          </>
                        ) : (
                          <>
                            <Sparkles size={18} /> Extract
                          </>
                        )}
                      </button>
                    </div>
                    <p
                      style={{
                        fontSize: "13px",
                        color: "var(--text-tertiary)",
                        marginTop: "10px",
                      }}
                    >
                      We'll automatically extract details from the page
                    </p>
                  </div>
                </div>

                {scrapedData && (
                  <div
                    style={{
                      padding: "16px",
                      background: "rgba(52, 199, 89, 0.1)",
                      borderRadius: "10px",
                      border: "1px solid var(--success)",
                      marginTop: "16px",
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <CheckCircle2
                      size={20}
                      style={{ color: "var(--success)" }}
                    />
                    <div>
                      <span
                        style={{ fontWeight: 500, color: "var(--success)" }}
                      >
                        Successfully extracted!
                      </span>
                      <p
                        style={{
                          fontSize: "13px",
                          margin: "4px 0 0",
                          opacity: 0.8,
                        }}
                      >
                        Review and adjust the details below
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Bulk Import Mode */}
            {creationMode === "bulk" && (
              <div style={{ marginBottom: "24px" }}>
                {!bulkPreview.length ? (
                  <div
                    style={{
                      padding: "48px",
                      textAlign: "center",
                      border: "2px dashed var(--border-color)",
                      borderRadius: "16px",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.borderColor = "var(--apple-blue)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.borderColor =
                        "var(--border-color)")
                    }
                  >
                    <div
                      style={{
                        width: 64,
                        height: 64,
                        borderRadius: "16px",
                        background: "var(--bg-tertiary)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        margin: "0 auto 16px",
                      }}
                    >
                      <FileSpreadsheet
                        size={32}
                        style={{ color: "var(--apple-blue)" }}
                      />
                    </div>
                    <h4 style={{ margin: "0 0 8px 0", fontSize: "16px" }}>
                      Drop your file here
                    </h4>
                    <p
                      style={{
                        color: "var(--text-tertiary)",
                        margin: "0 0 20px 0",
                        fontSize: "14px",
                      }}
                    >
                      or click to browse • Supports CSV
                    </p>
                    <button type="button" className="btn btn-secondary">
                      <Upload size={18} />
                      Choose File
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      onChange={handleFileUpload}
                      style={{ display: "none" }}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      background: "var(--bg-secondary)",
                      borderRadius: "12px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        padding: "16px 20px",
                        borderBottom: "1px solid var(--border-color)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 600 }}>
                          {bulkPreview.length}
                        </span>
                        <span style={{ color: "var(--text-tertiary)" }}>
                          {" "}
                          opportunities ready to import
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setBulkPreview([])}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--text-tertiary)",
                          cursor: "pointer",
                          fontSize: "14px",
                        }}
                      >
                        Clear all
                      </button>
                    </div>
                    <div style={{ maxHeight: "300px", overflow: "auto" }}>
                      <table className="table" style={{ margin: 0 }}>
                        <thead>
                          <tr>
                            <th>Title</th>
                            <th>Organization</th>
                            <th>Category</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bulkPreview.slice(0, 10).map((item, idx) => (
                            <tr key={idx}>
                              <td style={{ fontWeight: 500 }}>{item.title}</td>
                              <td>{item.organization || "-"}</td>
                              <td>
                                <span className="badge badge-primary">
                                  {item.category || "Scholarship"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {bulkPreview.length > 10 && (
                      <div
                        style={{
                          padding: "12px",
                          textAlign: "center",
                          color: "var(--text-tertiary)",
                          fontSize: "13px",
                          borderTop: "1px solid var(--border-color)",
                        }}
                      >
                        + {bulkPreview.length - 10} more items
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Manual Form */}
            {(creationMode === "manual" ||
              (creationMode === "url" && scrapedData)) && (
              <form onSubmit={handleCreate}>
                {/* Basic Info Section */}
                <div
                  style={{
                    background: "var(--bg-secondary)",
                    borderRadius: "12px",
                    padding: "20px",
                    marginBottom: "16px",
                  }}
                >
                  <h4
                    style={{
                      margin: "0 0 16px 0",
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    📌 Basic Information
                  </h4>

                  <div className="form-group">
                    <label className="form-label">Title *</label>
                    <input
                      required
                      className="input-field"
                      value={formData.title}
                      onChange={(e) =>
                        setFormData({ ...formData, title: e.target.value })
                      }
                      placeholder="e.g. Tech Innovation Scholarship 2024"
                    />
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "16px",
                    }}
                  >
                    <div className="form-group">
                      <label className="form-label">Category *</label>
                      <select
                        className="input-field"
                        value={formData.category}
                        onChange={(e) =>
                          setFormData({ ...formData, category: e.target.value })
                        }
                      >
                        {categories.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Status</label>
                      <select
                        className="input-field"
                        value={formData.status}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            status: e.target.value as OpportunityStatus,
                          })
                        }
                      >
                        <option value="active">Active</option>
                        <option value="pending_review">Needs Review</option>
                        <option value="draft">Draft</option>
                        <option value="closed">Closed</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      Organization / Provider *
                    </label>
                    <input
                      required
                      className="input-field"
                      value={formData.organization}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          organization: e.target.value,
                        })
                      }
                      placeholder="e.g. Microsoft, MIT, Federal Government"
                    />
                  </div>
                </div>

                {/* Details Section */}
                <div
                  style={{
                    background: "var(--bg-secondary)",
                    borderRadius: "12px",
                    padding: "20px",
                    marginBottom: "16px",
                  }}
                >
                  <h4
                    style={{
                      margin: "0 0 16px 0",
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    📝 Description & Links
                  </h4>

                  <div className="form-group">
                    <label className="form-label">
                      Summary *{" "}
                      <span
                        style={{
                          fontWeight: 400,
                          color: "var(--text-tertiary)",
                        }}
                      >
                        (shown in cards)
                      </span>
                    </label>
                    <input
                      required
                      className="input-field"
                      value={formData.summary}
                      onChange={(e) =>
                        setFormData({ ...formData, summary: e.target.value })
                      }
                      placeholder="Brief summary (max 150 characters)"
                      maxLength={150}
                    />
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--text-tertiary)",
                        marginTop: "4px",
                        textAlign: "right",
                      }}
                    >
                      {formData.summary.length}/150
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Full Description</label>
                    <textarea
                      className="input-field"
                      value={formData.description}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          description: e.target.value,
                        })
                      }
                      rows={4}
                      placeholder="Complete details about the opportunity..."
                    />
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "16px",
                    }}
                  >
                    <div className="form-group">
                      <label className="form-label">Application URL *</label>
                      <input
                        required
                        type="url"
                        className="input-field"
                        value={formData.application_url}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            application_url: e.target.value,
                          })
                        }
                        placeholder="https://..."
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Image URL</label>
                      <input
                        type="url"
                        className="input-field"
                        value={formData.image_url}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            image_url: e.target.value,
                          })
                        }
                        placeholder="https://... (poster image)"
                      />
                    </div>
                  </div>
                </div>

                {/* Location & Deadline */}
                <div
                  style={{
                    background: "var(--bg-secondary)",
                    borderRadius: "12px",
                    padding: "20px",
                    marginBottom: "16px",
                  }}
                >
                  <h4
                    style={{
                      margin: "0 0 16px 0",
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    📍 Location & Deadline
                  </h4>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "16px",
                    }}
                  >
                    <div className="form-group">
                      <label className="form-label">Location</label>
                      <input
                        className="input-field"
                        value={formData.location}
                        onChange={(e) =>
                          setFormData({ ...formData, location: e.target.value })
                        }
                        placeholder="e.g. New York, NY or Remote"
                        disabled={formData.is_remote}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Deadline</label>
                      <input
                        type="date"
                        className="input-field"
                        value={formData.close_date}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            close_date: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      cursor: "pointer",
                      padding: "12px 16px",
                      background: formData.is_remote
                        ? "rgba(59, 130, 246, 0.1)"
                        : "var(--bg-tertiary)",
                      borderRadius: "8px",
                      marginTop: "8px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={formData.is_remote}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          is_remote: e.target.checked,
                          location: e.target.checked ? "" : formData.location,
                        })
                      }
                      style={{ width: 18, height: 18 }}
                    />
                    <span style={{ fontWeight: 500 }}>
                      🌐 This is a remote opportunity
                    </span>
                  </label>
                </div>

                {/* Eligibility Section */}
                <div
                  style={{
                    background: "var(--bg-secondary)",
                    borderRadius: "12px",
                    padding: "20px",
                    marginBottom: "16px",
                  }}
                >
                  <h4
                    style={{
                      margin: "0 0 16px 0",
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    🎯 Eligibility Criteria
                  </h4>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "16px",
                    }}
                  >
                    <div className="form-group">
                      <label className="form-label">
                        Target School / University
                      </label>
                      <input
                        className="input-field"
                        value={formData.eligibility.school}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            eligibility: {
                              ...formData.eligibility,
                              school: e.target.value,
                            },
                          })
                        }
                        placeholder="e.g. Any University"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">
                        Field of Study / Major
                      </label>
                      <input
                        className="input-field"
                        value={formData.eligibility.major}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            eligibility: {
                              ...formData.eligibility,
                              major: e.target.value,
                            },
                          })
                        }
                        placeholder="e.g. Computer Science, Business"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Minimum CGPA</label>
                      <input
                        className="input-field"
                        type="number"
                        step="0.1"
                        min="0"
                        max="5"
                        value={formData.eligibility.min_cgpa}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            eligibility: {
                              ...formData.eligibility,
                              min_cgpa: e.target.value,
                            },
                          })
                        }
                        placeholder="e.g. 3.0"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Country</label>
                      <input
                        className="input-field"
                        value={formData.eligibility.countries?.[0] || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            eligibility: {
                              ...formData.eligibility,
                              countries: [e.target.value],
                            },
                          })
                        }
                        placeholder="e.g. USA, Nigeria, UK"
                      />
                    </div>
                  </div>
                </div>

                {/* Featured Toggle */}
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    cursor: "pointer",
                    padding: "16px 20px",
                    background: formData.is_featured
                      ? "rgba(255, 102, 0, 0.1)"
                      : "var(--bg-secondary)",
                    borderRadius: "12px",
                    marginBottom: "24px",
                    border: formData.is_featured
                      ? "1px solid #ff6600"
                      : "1px solid var(--border-color)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={formData.is_featured}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        is_featured: e.target.checked,
                      })
                    }
                    style={{ width: 20, height: 20 }}
                  />
                  <div>
                    <span style={{ fontWeight: 500 }}>
                      ⭐ Feature this opportunity
                    </span>
                    <p
                      style={{
                        margin: "4px 0 0",
                        fontSize: "13px",
                        color: "var(--text-tertiary)",
                      }}
                    >
                      Featured opportunities appear at the top of listings
                    </p>
                  </div>
                </label>

                {/* Action Buttons */}
                <div
                  style={{
                    display: "flex",
                    gap: "12px",
                    justifyContent: "flex-end",
                    paddingTop: "8px",
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      resetForm();
                      setShowModal(false);
                    }}
                    style={{ height: "48px", padding: "0 24px" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ height: "48px", padding: "0 32px" }}
                  >
                    <Plus size={18} />
                    {creationMode === "url"
                      ? "Create from URL"
                      : "Create Opportunity"}
                  </button>
                </div>
              </form>
            )}

            {/* Bulk Import Actions */}
            {creationMode === "bulk" && bulkPreview.length > 0 && (
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  justifyContent: "flex-end",
                  marginTop: "16px",
                }}
              >
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    resetForm();
                    setShowModal(false);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => saveOpportunities(bulkPreview)}
                >
                  <Upload size={18} />
                  Import {bulkPreview.length} Opportunities
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast notifications (non-blocking, replaces window.alert) */}
      <div className="opps-notifications-container">
        {notifications.map((n) => (
          <div key={n.id} className={`opps-notification-toast opps-notification-${n.type}`}>
            <div style={{ flexShrink: 0, marginTop: 1 }}>
              {n.type === "success" && <CheckCircle2 size={18} color="#34c759" />}
              {n.type === "error" && <AlertCircle size={18} color="#ff3b30" />}
              {n.type === "warning" && <AlertTriangle size={18} color="#ff9500" />}
              {n.type === "info" && <AlertCircle size={18} color="#007aff" />}
            </div>
            <div style={{ flex: 1, fontSize: 13, color: "var(--text-primary)" }}>{n.message}</div>
            <button
              onClick={() =>
                setNotifications((prev) => prev.filter((item) => item.id !== n.id))
              }
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-tertiary)",
                padding: 2,
                display: "flex",
              }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      <style>{`
        .opps-notifications-container {
          position: fixed;
          top: 24px;
          right: 24px;
          z-index: 1000;
          display: flex;
          flex-direction: column;
          gap: 12px;
          pointer-events: none;
        }
        .opps-notification-toast {
          pointer-events: auto;
          min-width: 300px;
          max-width: 450px;
          padding: 14px 16px;
          border-radius: 12px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-light);
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.2);
          display: flex;
          align-items: flex-start;
          gap: 12px;
          animation: oppsToastSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes oppsToastSlideIn {
          from { opacity: 0; transform: translateX(16px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
