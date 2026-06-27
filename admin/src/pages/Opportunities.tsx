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
  Star,
  Edit3,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  RefreshCw,
  GraduationCap,
  Cpu,
  Scissors,
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
  active: number;
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

type CreationMode = "manual" | "url" | "bulk";
type ViewMode = "table" | "grid";

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

function isExpiredOpportunity(
  opportunity: Pick<Opportunity, "close_date" | "status">,
) {
  return opportunity.status === "closed" || isPastDate(opportunity.close_date);
}

function getPublicAppBaseUrl() {
  const configured =
    import.meta.env.VITE_WEB_APP_URL ||
    import.meta.env.VITE_PUBLIC_APP_URL ||
    "";

  if (configured.trim()) return configured.trim().replace(/\/$/, "");
  if (typeof window === "undefined") return "";

  const origin = window.location.origin.replace(/\/$/, "");
  if (origin.includes("://admin.")) {
    return origin.replace("://admin.", "://");
  }

  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
    return PUBLIC_WEB_APP_FALLBACK_URL;
  }

  return origin;
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
        triggerApifySync("intel,custom,scholarship-api");
      },
    },
    {
      id: "apify-intel",
      name: "Scholarship Intel",
      icon: <GraduationCap size={16} />,
      desc: "US scholarships & grants",
      action: () => {
        setShowAddDropdown(false);
        triggerApifySync("intel");
      },
    },
    {
      id: "apify-custom",
      name: "My Actor",
      icon: <Cpu size={16} />,
      desc: "Custom scraper",
      action: () => {
        setShowAddDropdown(false);
        triggerApifySync("custom");
      },
    },
    {
      id: "apify-edutu",
      name: "Edutu Engine",
      icon: <Scissors size={16} />,
      desc: "Edutu Engine",
      action: () => {
        setShowAddDropdown(false);
        triggerApifySync("edutu");
      },
    },
    {
      id: "apify-scholarship-api",
      name: "ScholarshipAPI",
      icon: <Sparkles size={16} />,
      desc: "Global scholarship database",
      action: () => {
        setShowAddDropdown(false);
        triggerApifySync("scholarship-api");
      },
    },
  ];

  async function triggerApifySync(sourceId: string) {
    setShowLoadingModal(true);
    setLoadedResults([]);
    setLoadingStatus({
      message: "Connecting to Edutu Engine...",
      progress: 10,
      source: sourceId,
      phase: "preview",
    });

    try {
      setLoadingStatus({
        message: `Running ${sourceId} scraper...`,
        progress: 30,
        source: sourceId,
        phase: "preview",
      });
      const response = await fetch(`${NEST_API_URL}/api/scraper/run`, {
        method: "POST",
        headers: await getAdminHeaders(),
        body: JSON.stringify({
          allSources: true,
          maxPages: 3,
        }),
      });

      setLoadingStatus({
        message: "Processing results...",
        progress: 70,
        source: sourceId,
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
          source: sourceId,
          phase: "preview",
        });
      } else {
        const errMsg =
          result.errors?.[0] || result.error || "No opportunities found";
        setLoadingStatus({
          message: errMsg,
          progress: 100,
          source: sourceId,
          phase: "error",
        });
      }
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setLoadingStatus({
        message: "Error: " + message,
        progress: 100,
        source: sourceId,
        phase: "error",
      });
      setTimeout(() => {
        setShowLoadingModal(false);
        alert("Preview failed: " + message);
      }, 2000);
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
      alert(
        `Successfully saved ${inserted} opportunities!\nSkipped (duplicates): ${skipped}`,
      );
    } catch (error: unknown) {
      alert("Save failed: " + getErrorMessage(error));
    }
  }

  async function refineWithAI(opps: OpportunityPreviewItem[]) {
    if (!opps.length) {
      alert("No opportunities to refine.");
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
      alert(
        `Refine finished with ${errors.length} issues. Results were kept for those items.`,
      );
    }
  }

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalOpportunities, setTotalOpportunities] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [enhancingIds, setEnhancingIds] = useState<Set<string>>(new Set());
  const [sharingIds, setSharingIds] = useState<Set<string>>(new Set());
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

  const fetchOpportunities = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(pageSize),
        sortBy,
      });

      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);

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
      alert(getErrorMessage(error, "Failed to load opportunities"));
      setFilteredOpps([]);
      setTotalOpportunities(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [
    categoryFilter,
    currentPage,
    getAdminHeaders,
    NEST_API_URL,
    pageSize,
    searchQuery,
    sortBy,
    statusFilter,
  ]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void fetchOpportunities();
    }, 250);

    return () => window.clearTimeout(handle);
  }, [fetchOpportunities]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, categoryFilter, statusFilter, sortBy, pageSize]);

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
          void fetchOpportunities();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
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

  async function handleShareOpportunity(opp: Opportunity) {
    setSharingIds((prev) => new Set(prev).add(opp.id));

    try {
      const { opportunity, aiEnhanced, aiFallback } =
        await getAiImprovedOpportunityForShare(opp);
      const shareUrl = buildPublicOpportunityUrl(opportunity.id);
      const sharePayload = await getOpportunitySharePayload(opportunity.id);
      const shareText =
        sharePayload?.shareText ||
        buildAdminOpportunityShareText(
          opportunity,
          sharePayload?.shareUrl || shareUrl,
        );
      const finalShareUrl = sharePayload?.shareUrl || shareUrl;
      const shareImage = await buildShareImageFile(
        opportunity,
        sharePayload?.shareCard,
      );
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
        const shareUrl = buildPublicOpportunityUrl(opp.id);
        await copyShareTextToClipboard(
          buildAdminOpportunityShareText(opp, shareUrl),
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
    } finally {
      setSharingIds((prev) => {
        const next = new Set(prev);
        next.delete(opp.id);
        return next;
      });
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
      alert("Please enter a valid URL");
      return;
    }

    setIsScraping(true);
    setScrapedData(null);

    try {
      const headers = await getAdminHeaders();
      const response = await fetch(
        `${NEST_API_URL}/api/scraper/enhance-preview`,
        {
          method: "POST",
          headers,
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
        alert(`Warning: Low confidence extraction (${confidence}%).`);
      }
    } catch (error: unknown) {
      console.error("Scraping failed:", error);
      alert(
        `Scraping failed: ${getErrorMessage(error, "Check backend connection")}`,
      );
    } finally {
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

        try {
          const response = await fetch(
            `${NEST_API_URL}/api/scraper/enhance-preview`,
            {
              method: "POST",
              headers,
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
          previewResults.push({
            title: guessTitleFromUrl(url),
            organization: "Unknown",
            category: "Scholarships",
            application_url: url,
            source_url: url,
            confidence: 0,
            status: "needs_review",
            errors: [getErrorMessage(error, "Preview failed")],
          });
        }
      }

      setBulkPreview(previewResults);

      const errorCount = previewResults.filter(
        (item) => item.errors.length > 0,
      ).length;
      if (errorCount > 0) {
        alert(`Processed ${urls.length} URLs. ${errorCount} had issues.`);
      }
    } catch (error: unknown) {
      console.error("Bulk scraping failed:", error);
      alert(`Bulk import failed: ${getErrorMessage(error)}`);
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
      alert(getErrorMessage(error, "Failed to save opportunity"));
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
        alert(
          "No valid URLs found in file. Please ensure URLs are in the first column.",
        );
        setIsScraping(false);
        return;
      }

      // Process with backend
      await handleBulkScrape(urls);
    } catch (error) {
      console.error("File processing failed:", error);
      alert(
        "Failed to process file. Please ensure it is a valid CSV/Excel file.",
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

  function renderOpportunityTable() {
    return (
      <>
        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ margin: 0, minWidth: "1180px" }}>
            <thead>
              <tr>
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
                const needsReview =
                  opp.status === "pending_review" || opp.metadata?.needs_review;
                const isEnhancing = enhancingIds.has(opp.id);
                const isSharing = sharingIds.has(opp.id);
                return (
                  <tr key={opp.id}>
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
                          ...getStatusStyle(opp.status),
                          padding: "4px 9px",
                          borderRadius: "999px",
                          fontSize: "12px",
                          fontWeight: 700,
                          textTransform: "capitalize",
                        }}
                      >
                        {needsReview
                          ? "Needs review"
                          : (opp.status || "draft").replace("_", " ")}
                      </span>
                    </td>
                    <td>
                      {formatOpportunityDate(opp.close_date) || "No deadline"}
                    </td>
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
                          title="Open application URL"
                          aria-label={`Open application URL for ${opp.title || "opportunity"}`}
                          disabled={!(opp.application_url || opp.source_url)}
                          onClick={() =>
                            openExternalUrl(
                              opp.application_url || opp.source_url,
                            )
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

      {/* Stats Cards */}
      <div className="stats-grid opportunities-stats">
        {[
          {
            label: "Total Opportunities",
            value: stats.total,
            icon: Target,
            color: "var(--apple-blue)",
          },
          {
            label: "Active",
            value: stats.active,
            icon: CheckCircle2,
            color: "var(--success)",
          },
          {
            label: "Featured",
            value: stats.featured,
            icon: Star,
            color: "var(--warning)",
          },
          {
            label: "Expiring Soon",
            value: stats.expiringSoon,
            icon: AlertCircle,
            color: "var(--danger)",
          },
          {
            label: "Needs Review",
            value: stats.needsReview,
            icon: AlertCircle,
            color: "var(--warning)",
          },
        ].map((stat, index) => (
          <div key={index} className="stat-card opportunities-stat-card">
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
            <div className="opportunities-grid">
              {filteredOpps.map((opp) => {
                const isEnhancing = enhancingIds.has(opp.id);
                const isSharing = sharingIds.has(opp.id);
                const isExpanded = expandedRows.has(opp.id);
                const needsReview =
                  opp.status === "pending_review" || opp.metadata?.needs_review;
                const applicationUrl =
                  opp.application_url || opp.source_url || "";
                const summary = truncateText(
                  normalizeText(
                    opp.summary || opp.description,
                    "No summary available yet.",
                  ),
                  170,
                );
                const deadline = formatOpportunityDate(opp.close_date);

                return (
                  <article
                    key={opp.id}
                    className={`opportunity-card ${isExpanded ? "expanded" : ""}`}
                  >
                    <div className="opportunity-card-media">
                      {opp.image_url ? (
                        <img
                          src={opp.image_url}
                          alt={`${opp.title || "Opportunity"} cover`}
                        />
                      ) : (
                        <Target size={34} />
                      )}
                      <span className="opportunity-category-badge">
                        {opp.category || "Opportunity"}
                      </span>
                    </div>

                    <div className="opportunity-card-body">
                      <div className="opportunity-card-kicker">
                        <span
                          className="opportunity-status-badge"
                          style={getStatusStyle(opp.status)}
                        >
                          {needsReview
                            ? "Needs review"
                            : (opp.status || "draft").replace("_", " ")}
                        </span>
                        {opp.is_featured && (
                          <span className="opportunity-featured-badge">
                            <Star size={12} fill="currentColor" />
                            Featured
                          </span>
                        )}
                      </div>

                      <h3 className="opportunity-card-title">
                        {opp.title || "Untitled opportunity"}
                      </h3>
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
                          className={isPastDate(opp.close_date) ? "danger" : ""}
                        >
                          <Calendar size={13} />
                          {deadline || "No deadline"}
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
                          disabled={!applicationUrl}
                          onClick={(e) => {
                            e.stopPropagation();
                            openExternalUrl(applicationUrl);
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
                          aria-expanded={isExpanded}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleRowExpansion(opp.id);
                          }}
                        >
                          <ChevronDown
                            size={14}
                            className={
                              isExpanded
                                ? "opportunity-details-icon expanded"
                                : "opportunity-details-icon"
                            }
                          />
                          {isExpanded ? "Hide" : "Details"}
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="opportunity-card-expanded">
                          <p>
                            {normalizeText(
                              opp.description || opp.summary,
                              "No additional description available yet.",
                            )}
                          </p>
                          <div className="opportunity-review-actions">
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
                    </div>
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
                      {loadingStatus.source === "intel"
                        ? "Scholarship Intel"
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
                      {loadingStatus.source === "intel"
                        ? "Scholarship Intel"
                        : loadingStatus.source === "custom"
                          ? "My Actor"
                          : loadingStatus.source === "edutu"
                            ? "Edutu Engine"
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
    </div>
  );
}
