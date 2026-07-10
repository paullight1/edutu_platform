import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import {
  ArrowUpRight,
  Award,
  Bookmark,
  Briefcase,
  Calendar,
  GraduationCap,
  MapPin,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  Share2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { useOpportunities } from "../hooks/useOpportunities";
import { usePersonalization } from "../hooks/usePersonalization";
import { useServerMatchHydration } from "../hooks/useServerMatchHydration";
import type { Opportunity } from "../types/opportunity";
import type { MatchResult } from "../services/personalizedRecommendations";
import { MatchScoreBadge, TopMatchReason } from "./opportunity/MatchInsights";
import UrgencyPill from "./opportunity/UrgencyPill";
import {
  getDeadlineBadge,
  urgencyTextClasses,
} from "../services/deadlineUrgency";
import {
  isOpportunityExpired,
  parseOpportunityDeadline,
} from "../services/opportunities";
import {
  addBookmark,
  getBookmarks,
  removeBookmark,
} from "../services/bookmarks";
import { getProductApiToken } from "../lib/clerkToken";
import ImageWithFallback from "./ImageWithFallback";
import PublicEditorialShell from "./PublicEditorialShell";
import Seo from "./Seo";
import { useToast } from "./ui/ToastProvider";
import { Skeleton } from "./ui/Skeleton";
import { EmptyOpportunities, EmptySearchResults } from "./ui/EmptyState";
import {
  shareOpportunity,
  shareOutcomeMessage,
} from "../services/opportunityShare";
import { getDefaultSeoImage, toAbsoluteUrl } from "../lib/publicSite";

const categoryFilters: Record<string, { labelKey: string; keywords: string[] }> = {
  scholarships: {
    labelKey: "opportunities.categories.scholarships",
    keywords: ["scholarship", "scholarships", "scholar", "scholars"],
  },
  internships: {
    labelKey: "opportunities.categories.internships",
    keywords: ["internship", "internships", "intern", "trainee"],
  },
  programs: {
    labelKey: "opportunities.categories.programs",
    keywords: [
      "program",
      "programs",
      "programme",
      "programmes",
      "course",
      "courses",
      "bootcamp",
      "training",
      "academy",
      "summit",
      "school",
    ],
  },
  fellowships: {
    labelKey: "opportunities.categories.fellowships",
    keywords: ["fellowship", "fellowships", "fellow", "residency"],
  },
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function opportunityMatchesCategory(opportunity: Opportunity, category: string) {
  const filter = categoryFilters[category];
  if (!filter) return true;

  const haystack = [
    opportunity.category,
    opportunity.title,
    opportunity.organization,
    ...(Array.isArray(opportunity.tags) ? opportunity.tags : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return filter.keywords.some((keyword) =>
    new RegExp(`\\b${escapeRegExp(keyword.toLowerCase())}\\b`, "i").test(
      haystack,
    ),
  );
}

// Colourful "collection" cards shown at the top of the page. Each one links to
// a filtered view (`?category=`) so tapping a card navigates to a dedicated
// page listing just those opportunities.
type Collection = {
  key: string;
  categoryId: string;
  labelKey: string;
  desc: string;
  Icon: LucideIcon;
  card: string;
  chip: string;
  glow: string;
  accentText: string;
};

const COLLECTIONS: Collection[] = [
  {
    key: "scholarships",
    categoryId: "scholarships",
    labelKey: "opportunities.categories.scholarships",
    desc: "Fund your studies worldwide",
    Icon: GraduationCap,
    card: "border-amber-500/20 bg-amber-500/[0.07] hover:border-amber-500/50 hover:bg-amber-500/[0.12] dark:border-amber-400/20 dark:bg-amber-400/[0.08]",
    chip: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
    glow: "from-amber-500/25",
    accentText: "text-amber-600 dark:text-amber-300",
  },
  {
    key: "internships",
    categoryId: "internships",
    labelKey: "opportunities.categories.internships",
    desc: "Gain hands-on experience",
    Icon: Briefcase,
    card: "border-blue-500/20 bg-blue-500/[0.07] hover:border-blue-500/50 hover:bg-blue-500/[0.12] dark:border-blue-400/20 dark:bg-blue-400/[0.08]",
    chip: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
    glow: "from-blue-500/25",
    accentText: "text-blue-600 dark:text-blue-300",
  },
  {
    key: "fellowships",
    categoryId: "fellowships",
    labelKey: "opportunities.categories.fellowships",
    desc: "Advance research & leadership",
    Icon: Award,
    card: "border-violet-500/20 bg-violet-500/[0.07] hover:border-violet-500/50 hover:bg-violet-500/[0.12] dark:border-violet-400/20 dark:bg-violet-400/[0.08]",
    chip: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
    glow: "from-violet-500/25",
    accentText: "text-violet-600 dark:text-violet-300",
  },
  {
    key: "programs",
    categoryId: "programs",
    labelKey: "opportunities.categories.programs",
    desc: "Accelerators, bootcamps & more",
    Icon: Rocket,
    card: "border-emerald-500/20 bg-emerald-500/[0.07] hover:border-emerald-500/50 hover:bg-emerald-500/[0.12] dark:border-emerald-400/20 dark:bg-emerald-400/[0.08]",
    chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
    glow: "from-emerald-500/25",
    accentText: "text-emerald-600 dark:text-emerald-300",
  },
];

function CollectionCard({
  to,
  label,
  desc,
  Icon,
  card,
  chip,
  glow,
  accentText,
}: {
  to: string;
  label: string;
  desc: string;
  Icon: LucideIcon;
  card: string;
  chip: string;
  glow: string;
  accentText: string;
}) {
  return (
    <Link
      to={to}
      className={`group relative flex min-h-[150px] flex-col justify-between overflow-hidden rounded-2xl border p-5 shadow-soft transition duration-200 hover:-translate-y-1 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${card}`}
    >
      {/* Soft corner glow that intensifies on hover */}
      <div
        className={`pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-gradient-to-br to-transparent opacity-60 blur-2xl transition-opacity duration-300 group-hover:opacity-100 ${glow}`}
      />
      <div className="relative flex items-start justify-between">
        <span
          className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${chip}`}
        >
          <Icon size={20} />
        </span>
        <ArrowUpRight
          size={18}
          className={`transition duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 ${accentText}`}
        />
      </div>
      <div className="relative mt-6">
        <h3 className="font-display text-base font-semibold leading-tight tracking-tight text-text-primary sm:text-lg">
          {label}
        </h3>
        <p className="mt-1 text-xs leading-snug text-text-secondary sm:text-[13px]">
          {desc}
        </p>
      </div>
    </Link>
  );
}

// Token-based search: every word in the query must appear somewhere in the
// opportunity's searchable text. Beats a single `.includes()` for multi-word
// queries like "remote data science" where the words are scattered across
// fields.
function buildSearchHaystack(opportunity: Opportunity): string {
  return [
    opportunity.title,
    opportunity.organization,
    opportunity.summary,
    opportunity.description,
    opportunity.location,
    opportunity.category,
    ...(Array.isArray(opportunity.tags) ? opportunity.tags : []),
    ...(Array.isArray(opportunity.benefits) ? opportunity.benefits : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesSearchQuery(opportunity: Opportunity, query: string): boolean {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = buildSearchHaystack(opportunity);
  return tokens.every((token) => haystack.includes(token));
}

function isRollingDeadline(deadline?: string | null): boolean {
  return typeof deadline === "string" && /rolling/i.test(deadline);
}

function formatDeadline(deadline?: string | null): string {
  if (isRollingDeadline(deadline)) return "Rolling";

  const parsed = parseOpportunityDeadline(deadline);
  if (!parsed) return "Deadline not listed";

  return format(parsed, "d MMM yyyy");
}

function getCurrencySymbol(currency?: string | null): string {
  switch (currency?.toUpperCase()) {
    case "NGN":
      return "₦";
    case "GBP":
      return "£";
    case "EUR":
      return "€";
    default:
      return "$";
  }
}

function formatFunding(opportunity: Opportunity): string | null {
  const stipend = opportunity.stipend;
  if (
    stipend === undefined ||
    stipend === null ||
    !Number.isFinite(Number(stipend))
  ) {
    return null;
  }
  return `${getCurrencySymbol(opportunity.currency)}${Number(stipend).toLocaleString()} funding`;
}

type SortOption = "recommended" | "deadline" | "newest" | "funding";

const PAGE_SIZE = 12;

// Warm the detail-route chunk while the user is still deciding, so tapping a
// card never waits on a JS download.
function prefetchOpportunityDetail() {
  void import("./OpportunityDetail").catch(() => {});
}

const sortOptions: { value: SortOption; labelKey: string }[] = [
  { value: "recommended", labelKey: "opportunities.sort.recommended" },
  { value: "deadline", labelKey: "opportunities.sort.deadline" },
  { value: "newest", labelKey: "opportunities.sort.newest" },
  { value: "funding", labelKey: "opportunities.sort.funding" },
];

function getOpportunityStipend(opportunity: Opportunity): number {
  const stipend = opportunity.stipend;
  return typeof stipend === "number" && Number.isFinite(stipend)
    ? stipend
    : 0;
}

function getOpportunityDeadlineTime(opportunity: Opportunity): number | null {
  const parsed = parseOpportunityDeadline(opportunity.deadline);
  return parsed ? parsed.getTime() : null;
}

function getOpportunityUpdatedTime(opportunity: Opportunity): number | null {
  const date = new Date(opportunity.lastUpdated || opportunity.createdAt || "");
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
}

function getSortKey(
  opportunity: Opportunity,
  option: SortOption,
): number | null {
  if (option === "deadline") {
    return getOpportunityDeadlineTime(opportunity);
  }
  if (option === "funding") {
    const stipend = getOpportunityStipend(opportunity);
    return stipend > 0 ? stipend : null;
  }
  return getOpportunityUpdatedTime(opportunity);
}

function sortOpportunities(
  items: Opportunity[],
  option: SortOption,
): Opportunity[] {
  if (option === "recommended") return items;
  const ascending = option === "deadline";

  return [...items].sort((a, b) => {
    const ka = getSortKey(a, option);
    const kb = getSortKey(b, option);
    if (ka === null && kb === null) return 0;
    if (ka === null) return 1;
    if (kb === null) return -1;
    return ascending ? ka - kb : kb - ka;
  });
}

function getLatestUpdatedAt(opportunities: Opportunity[]): string | null {
  let latestTimestamp = 0;

  for (const opportunity of opportunities) {
    const date = new Date(
      opportunity.lastUpdated || opportunity.createdAt || "",
    );

    if (!Number.isNaN(date.getTime())) {
      latestTimestamp = Math.max(latestTimestamp, date.getTime());
    }
  }

  return latestTimestamp > 0 ? new Date(latestTimestamp).toISOString() : null;
}

function normaliseSeoText(value?: string | null): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function truncateSeoText(value: string, maxLength = 155): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}...`;
}

function OpportunityCard({
  opportunity,
  onShare,
  isSharing,
  onToggleBookmark,
  isBookmarked,
  isBookmarking,
  detailPath,
  expired,
  match,
  onOpen,
}: {
  opportunity: Opportunity;
  onShare: (opportunity: Opportunity) => void;
  isSharing: boolean;
  onToggleBookmark: (opportunity: Opportunity) => void;
  isBookmarked: boolean;
  isBookmarking: boolean;
  detailPath: string;
  expired: boolean;
  match?: MatchResult | null;
  onOpen?: (opportunity: Opportunity) => void;
}) {
  const funding = formatFunding(opportunity);
  const deadlineBadge = getDeadlineBadge(opportunity.deadline);
  const deadlineDisplay = (() => {
    if (expired) {
      return { text: formatDeadline(opportunity.deadline), className: "" };
    }
    if (deadlineBadge.isUrgent && deadlineBadge.date) {
      return {
        text: `${deadlineBadge.date} · ${deadlineBadge.label}`,
        className: urgencyTextClasses(deadlineBadge.level),
      };
    }
    return { text: formatDeadline(opportunity.deadline), className: "" };
  })();

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-subtle bg-surface-layer shadow-soft transition duration-200 hover:-translate-y-0.5 hover:shadow-elevated">
      <div className="relative aspect-[16/9] overflow-hidden bg-surface-elevated">
        <ImageWithFallback
          src={opportunity.image}
          alt={`${opportunity.title} cover image`}
          category={opportunity.category}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          fallbackClassName="flex h-full w-full items-center justify-center"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent" />
        {expired ? (
          <span className="absolute left-3 top-3 inline-flex items-center rounded-md bg-surface-elevated px-2.5 py-1 text-xs font-semibold text-text-secondary shadow-soft backdrop-blur">
            Expired
          </span>
        ) : (
          <UrgencyPill
            badge={deadlineBadge}
            className="absolute left-3 top-3 shadow-sm backdrop-blur"
          />
        )}
        <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onToggleBookmark(opportunity)}
            disabled={isBookmarking}
            aria-pressed={isBookmarked}
            className={`flex h-9 w-9 items-center justify-center rounded-md shadow-soft backdrop-blur transition disabled:cursor-wait disabled:opacity-60 ${
              isBookmarked
                ? "bg-brand text-white hover:bg-brand/90"
                : "bg-surface-layer text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
            }`}
            aria-label={
              isBookmarked
                ? `Remove ${opportunity.title} from saved`
                : `Save ${opportunity.title}`
            }
          >
            <Bookmark size={15} fill={isBookmarked ? "currentColor" : "none"} />
          </button>
          <button
            type="button"
            onClick={() => onShare(opportunity)}
            disabled={isSharing}
            className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-layer text-text-secondary shadow-soft backdrop-blur transition hover:bg-surface-elevated hover:text-text-primary disabled:cursor-wait disabled:opacity-60"
            aria-label={`Share ${opportunity.title}`}
          >
            <Share2 size={15} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          <MatchScoreBadge score={match?.score} minScore={40} />
          {opportunity.category ? (
            <span className="inline-flex items-center rounded-md border border-brand/30 bg-brand/10 px-2 py-1 text-xs font-semibold text-brand">
              {opportunity.category}
            </span>
          ) : null}
          {opportunity.difficulty ? (
            <span className="inline-flex items-center rounded-md border border-subtle bg-surface-elevated px-2 py-1 text-xs font-semibold text-text-secondary">
              {opportunity.difficulty}
            </span>
          ) : null}
        </div>

        <h2 className="font-display text-lg font-semibold leading-snug tracking-tight text-text-primary transition group-hover:text-brand">
          {opportunity.title}
        </h2>
        {opportunity.organization ? (
          <p className="mt-1 truncate text-sm text-text-muted">
            {opportunity.organization}
          </p>
        ) : null}

        {match && match.score >= 40 ? (
          <TopMatchReason reason={match.reasons[0]} />
        ) : null}

        {funding ? (
          <p className="mt-3 text-sm font-medium text-success">
            {funding}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-3 border-t border-subtle pt-3 text-sm text-text-muted">
          {opportunity.location ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={14} />
              {opportunity.location}
            </span>
          ) : null}
          <span
            className={`inline-flex items-center gap-1.5 ${deadlineDisplay.className}`}
          >
            <Calendar size={14} />
            {deadlineDisplay.text}
          </span>
        </div>
      </div>

      <Link
        to={detailPath}
        state={{ opportunity }}
        onClick={() => onOpen?.(opportunity)}
        onMouseEnter={prefetchOpportunityDetail}
        onFocus={prefetchOpportunityDetail}
        className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2"
        aria-label={`View ${opportunity.title}`}
      />
    </article>
  );
}

function LoadingCard() {
  // Content-shaped skeleton mirroring OpportunityCard: image area, badge row,
  // title lines, meta row — so the grid doesn't jump when real cards land.
  return (
    <div className="flex h-full min-h-[330px] flex-col overflow-hidden rounded-2xl border border-subtle bg-surface-layer shadow-soft">
      <Skeleton
        variant="rectangular"
        className="w-full"
        style={{ aspectRatio: "16/9" }}
      />
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-3 flex gap-2">
          <Skeleton variant="rounded" className="h-6 w-20 rounded-md" />
          <Skeleton variant="rounded" className="h-6 w-16 rounded-md" />
        </div>
        <Skeleton variant="text" className="h-5 w-full" />
        <Skeleton variant="text" className="mt-2 h-5 w-3/4" />
        <Skeleton variant="text" className="mt-2 h-4 w-1/2" />
        <div className="mt-auto flex gap-3 border-t border-subtle pt-3">
          <Skeleton variant="text" className="h-4 w-24" />
          <Skeleton variant="text" className="h-4 w-28" />
        </div>
      </div>
    </div>
  );
}

interface OpportunitiesPageProps {
  embedded?: boolean;
}

export default function OpportunitiesPage({ embedded = false }: OpportunitiesPageProps) {
  const { t } = useTranslation();
  const { data: opportunities, loading, error, refresh } = useOpportunities();
  const { explainOpportunity, isPersonalized, trackInteraction } =
    usePersonalization();
  const { success, error: showError } = useToast();
  const { isSignedIn, userId, getToken } = useClerkAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState("");
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [bookmarkingId, setBookmarkingId] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>("recommended");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Hydrate which opportunities the signed-in user has already saved, so the
  // bookmark button on each card reflects real state on first paint.
  useEffect(() => {
    if (!isSignedIn || !userId) {
      setBookmarkedIds(new Set());
      return;
    }
    let active = true;
    void (async () => {
      try {
        const token = await getProductApiToken(getToken);
        if (!token) return;
        const records = await getBookmarks(userId, token);
        if (active) {
          setBookmarkedIds(new Set(records.map((r) => r.opportunity_id)));
        }
      } catch {
        // Non-fatal: cards just render as un-saved until the user acts.
      }
    })();
    return () => {
      active = false;
    };
  }, [isSignedIn, userId, getToken]);

  const handleToggleBookmark = useCallback(
    async (opportunity: Opportunity) => {
      if (!isSignedIn || !userId) {
        navigate("/auth?mode=sign-in");
        return;
      }
      const alreadySaved = bookmarkedIds.has(opportunity.id);

      // Optimistic flip; revert on failure.
      setBookmarkedIds((prev) => {
        const next = new Set(prev);
        if (alreadySaved) next.delete(opportunity.id);
        else next.add(opportunity.id);
        return next;
      });
      setBookmarkingId(opportunity.id);

      try {
        const token = await getProductApiToken(getToken, { forceRefresh: true });
        if (!token) throw new Error("no-token");
        if (alreadySaved) {
          await removeBookmark(userId, opportunity.id, token);
          trackInteraction(opportunity, "bookmark", {
            value: -1,
            context: "unsave",
          });
          success("Removed from saved");
        } else {
          await addBookmark(
            userId,
            {
              id: opportunity.id,
              title: opportunity.title,
              category: opportunity.category,
              deadline: opportunity.deadline ?? null,
              location: opportunity.location,
              match_percentage: Math.round(opportunity.match ?? 0),
            },
            token,
          );
          trackInteraction(opportunity, "bookmark");
          success("Saved to your list");
        }
      } catch {
        setBookmarkedIds((prev) => {
          const next = new Set(prev);
          if (alreadySaved) next.add(opportunity.id);
          else next.delete(opportunity.id);
          return next;
        });
        showError("Could not update saved. Please try again.");
      } finally {
        setBookmarkingId(null);
      }
    },
    [
      isSignedIn,
      userId,
      getToken,
      bookmarkedIds,
      navigate,
      success,
      showError,
      trackInteraction,
    ],
  );
  const selectedCategoryId = searchParams.get("category")?.toLowerCase() ?? "";
  const selectedCategory = categoryFilters[selectedCategoryId] ?? null;

  const basePath = embedded ? "/app" : "";
  const collectionPath = useCallback(
    (collection: Collection) =>
      `${basePath}/opportunities?category=${collection.categoryId}`,
    [basePath],
  );

  const activeCollection = selectedCategory
    ? {
        title: t(selectedCategory.labelKey),
        description: t("opportunities.browseCategory", {
          label: t(selectedCategory.labelKey).toLowerCase(),
        }),
      }
    : null;

  // Defer the heavy filter/score pass so typing stays responsive on large lists.
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const filteredOpportunities = useMemo(() => {
    const term = deferredSearchTerm.trim();

    return opportunities.filter((opportunity) => {
      if (!showClosed && isOpportunityExpired(opportunity)) {
        return false;
      }

      if (
        selectedCategoryId &&
        !opportunityMatchesCategory(opportunity, selectedCategoryId)
      ) {
        return false;
      }

      return matchesSearchQuery(opportunity, term);
    });
  }, [
    opportunities,
    deferredSearchTerm,
    selectedCategoryId,
    showClosed,
  ]);

  // Pull authoritative server-computed match scores for what's on screen;
  // explainOpportunity reads them synchronously once the store is primed.
  const hydrationIds = useMemo(
    () =>
      filteredOpportunities
        .slice(0, 100)
        .map((opportunity) => opportunity.id),
    [filteredOpportunities],
  );
  useServerMatchHydration(hydrationIds);

  const matchInsights = useMemo(() => {
    if (!isPersonalized) return null;
    const insights = new Map<string, MatchResult>();
    filteredOpportunities.forEach((opportunity) => {
      insights.set(opportunity.id, explainOpportunity(opportunity));
    });
    return insights;
  }, [filteredOpportunities, isPersonalized, explainOpportunity]);

  const sortedOpportunities = useMemo(() => {
    if (sortOption === "recommended" && matchInsights) {
      return [...filteredOpportunities].sort(
        (a, b) =>
          (matchInsights.get(b.id)?.score ?? 0) -
          (matchInsights.get(a.id)?.score ?? 0),
      );
    }
    return sortOpportunities(filteredOpportunities, sortOption);
  }, [filteredOpportunities, sortOption, matchInsights]);

  // Reset pagination only when the user changes what they're browsing —
  // NOT when server match scores hydrate and re-sort the list, which would
  // otherwise snap a mid-scroll user back to the first page.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchTerm, selectedCategoryId, showClosed, sortOption]);

  const visibleOpportunities = sortedOpportunities.slice(0, visibleCount);
  const hasMoreToShow = visibleCount < sortedOpportunities.length;

  // Auto-load the next page as the user approaches the end of the grid; the
  // button stays as an accessible, observer-free fallback.
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const loadMore = useCallback(() => {
    setVisibleCount((count) => count + PAGE_SIZE);
  }, []);

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel || !hasMoreToShow || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMore();
        }
      },
      { rootMargin: "600px 0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreToShow, loadMore]);

  const hasActiveFilters = Boolean(
    searchTerm.trim() || selectedCategoryId || showClosed,
  );

  const latestUpdatedAt = useMemo(
    () => getLatestUpdatedAt(opportunities),
    [opportunities],
  );
  const seoDescription =
    "Explore updated scholarships, internships, fellowships, grants, and programs on Edutu with deadlines, eligibility, benefits, and application links.";
  const seoJsonLd = useMemo(
    () => [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Updated scholarships, internships, fellowships and grants",
        url: toAbsoluteUrl("/opportunities"),
        description: seoDescription,
        dateModified: latestUpdatedAt || undefined,
        publisher: {
          "@type": "Organization",
          name: "Edutu",
          url: toAbsoluteUrl("/opportunities"),
          logo: {
            "@type": "ImageObject",
            url: getDefaultSeoImage(),
          },
        },
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: opportunities.length,
          itemListElement: opportunities
            .slice(0, 24)
            .map((opportunity, index) => ({
              "@type": "ListItem",
              position: index + 1,
              url: toAbsoluteUrl(
                `/opportunity/${encodeURIComponent(opportunity.id)}`,
              ),
              name: opportunity.title,
              description: truncateSeoText(
                normaliseSeoText(
                  opportunity.summary || opportunity.description,
                ),
                140,
              ),
            })),
        },
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Opportunities",
            item: toAbsoluteUrl("/opportunities"),
          },
        ],
      },
    ],
    [latestUpdatedAt, opportunities, seoDescription],
  );

  const clearSearch = () => {
    setSearchTerm("");
  };

  // Return to the browse landing (the colourful collection cards) by dropping
  // the collection filters from the URL.
  const clearCollection = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("category");
    setSearchParams(nextParams);
  };

  const clearAllFilters = () => {
    setSearchTerm("");
    setShowClosed(false);
    setSearchParams(new URLSearchParams());
  };

  const handleShareOpportunity = async (opportunity: Opportunity) => {
    setSharingId(opportunity.id);
    trackInteraction(opportunity, "share");
    try {
      const outcome = await shareOpportunity(opportunity);
      const toast = shareOutcomeMessage(outcome);
      if (toast) {
        (toast.type === "success" ? success : showError)(toast.message);
      }
    } finally {
      setSharingId(null);
    }
  };

  const content = (
    <>
        {activeCollection ? (
          <section className="mb-4 rounded-2xl border border-subtle bg-surface-layer p-4 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
                  {t("navigation.explore")}
                </p>
                <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-text-primary">
                  {activeCollection.title}
                </h1>
                <p className="mt-1 text-sm leading-6 text-text-muted">
                  {activeCollection.description}
                </p>
              </div>
              <button
                type="button"
                onClick={clearCollection}
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-subtle bg-surface-layer px-3 text-xs font-semibold text-text-secondary shadow-soft transition hover:bg-surface-elevated"
              >
                {t("common.all")}
                <X size={14} />
              </button>
            </div>
          </section>
        ) : (
          <section className="mb-6">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
                  {t("navigation.explore")}
                </p>
                <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-text-primary sm:text-[28px]">
                  Browse by category
                </h1>
                <p className="mt-1.5 text-sm text-text-secondary">
                  Pick a track to jump straight to matching opportunities.
                </p>
              </div>
              {embedded && (
                <button
                  type="button"
                  onClick={() => navigate("/app/submit-opportunity")}
                  className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-brand px-4 text-sm font-semibold text-white shadow-soft transition hover:opacity-90"
                >
                  <Plus size={16} />
                  Submit
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {COLLECTIONS.map((collection) => (
                <CollectionCard
                  key={collection.key}
                  to={collectionPath(collection)}
                  label={t(collection.labelKey)}
                  desc={collection.desc}
                  Icon={collection.Icon}
                  card={collection.card}
                  chip={collection.chip}
                  glow={collection.glow}
                  accentText={collection.accentText}
                />
              ))}
            </div>
          </section>
        )}

        <section className={`sticky ${embedded ? "top-[72px]" : "top-[76px]"} z-20 rounded-2xl border border-subtle bg-surface-layer p-3 shadow-soft backdrop-blur-xl`}>
          <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <label className="inline-flex h-8 shrink-0 cursor-pointer select-none items-center gap-2 rounded-full border border-subtle bg-surface-layer px-3 text-xs font-semibold text-text-secondary transition hover:border-strong">
              <input
                type="checkbox"
                checked={showClosed}
                onChange={(event) => setShowClosed(event.target.checked)}
                className="h-3.5 w-3.5 rounded border-subtle text-brand focus:ring-brand/40"
              />
              {t("opportunities.showClosed")}
            </label>
          </div>
          <div className="relative mb-3 sm:hidden">
            <Search
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              type="text"
              aria-label="Search opportunities"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={t("opportunities.searchPlaceholder")}
              className="h-11 w-full rounded-xl border border-subtle bg-surface-layer pl-10 pr-10 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-2 text-text-muted transition hover:text-text-primary"
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            ) : null}
          </div>
          <div className="flex items-center justify-between sm:hidden">
            <p aria-live="polite" className="text-xs text-text-muted">
              {t("opportunities.showing.opportunities", {
                shown: visibleOpportunities.length,
                total: sortedOpportunities.length,
                count: sortedOpportunities.length,
              })}
            </p>
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-text-secondary">
              {t("common.sort")}
              <select
                value={sortOption}
                onChange={(event) =>
                  setSortOption(event.target.value as SortOption)
                }
                className="h-8 rounded-lg border border-subtle bg-surface-layer pl-2.5 pr-7 text-xs font-semibold text-text-secondary focus:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="hidden space-y-3 sm:block">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
              <Search
                size={18}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <input
                type="text"
                aria-label="Search opportunities"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={t("opportunities.searchPlaceholder")}
                className="h-12 w-full rounded-xl border border-subtle bg-surface-layer pl-11 pr-11 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
              />
              {searchTerm ? (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-text-muted transition hover:text-text-primary"
                  aria-label="Clear search"
                >
                  <X size={16} />
                </button>
              ) : null}
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-subtle pt-3 sm:flex-row sm:items-center sm:justify-between">
              <p aria-live="polite" className="text-xs text-text-muted">
                {t("opportunities.showing.opportunities", {
                  shown: visibleOpportunities.length,
                  total: sortedOpportunities.length,
                  count: sortedOpportunities.length,
                })}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-text-secondary">
                  {t("common.sort")}
                  <select
                    value={sortOption}
                    onChange={(event) =>
                      setSortOption(event.target.value as SortOption)
                    }
                    className="h-8 rounded-lg border border-subtle bg-surface-layer pl-2.5 pr-7 text-xs font-semibold text-text-secondary focus:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                  >
                    {sortOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </option>
                    ))}
                  </select>
                </label>
                {hasActiveFilters ? (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-subtle bg-surface-layer px-2.5 text-xs font-semibold text-text-secondary transition hover:border-strong hover:bg-surface-elevated"
                  >
                    {t("opportunities.clearAll")}
                    <X size={12} />
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <section
            role="alert"
            className="mt-5 rounded-2xl border border-danger/30 bg-danger/10 p-5 text-danger"
          >
            <h2 className="font-display text-lg font-semibold tracking-tight">
              {t("opportunities.errorTitle")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-danger/80">
              {error}
            </p>
            {sortedOpportunities.length > 0 ? (
              <p className="mt-2 text-xs font-semibold text-danger/70">
                Showing cached results
              </p>
            ) : null}
            <button
              type="button"
              onClick={refresh}
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-danger px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-danger/90"
            >
              <RefreshCw size={16} />
              {t("common.retry")}
            </button>
          </section>
        ) : null}

        {loading ? (
          <section className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-4 sm:gap-5">
            {Array.from({ length: PAGE_SIZE }).map((_, index) => (
              <LoadingCard key={index} />
            ))}
          </section>
        ) : sortedOpportunities.length > 0 ? (
          <>
            <section className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-4 sm:gap-5">
              {visibleOpportunities.map((opportunity) => (
                <OpportunityCard
                  key={opportunity.id}
                  opportunity={opportunity}
                  onShare={handleShareOpportunity}
                  isSharing={sharingId === opportunity.id}
                  onToggleBookmark={handleToggleBookmark}
                  isBookmarked={bookmarkedIds.has(opportunity.id)}
                  isBookmarking={bookmarkingId === opportunity.id}
                  detailPath={`${embedded ? "/app" : ""}/opportunity/${opportunity.id}`}
                  expired={isOpportunityExpired(opportunity)}
                  match={matchInsights?.get(opportunity.id) ?? null}
                  onOpen={(item) =>
                    trackInteraction(item, "view", { context: "card_open" })
                  }
                />
              ))}
            </section>
            {hasMoreToShow ? (
              <div className="mt-6 flex flex-col items-center gap-3">
                <div ref={loadMoreSentinelRef} aria-hidden="true" />
                <button
                  type="button"
                  onClick={loadMore}
                  className="inline-flex h-11 items-center gap-2 rounded-md border border-subtle bg-surface-layer px-5 text-sm font-semibold text-text-secondary shadow-soft transition hover:border-strong hover:bg-surface-elevated"
                >
                  {t("opportunities.loadMore")}
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <section className="mt-5 rounded-2xl border border-subtle bg-surface-layer p-4">
            {searchTerm.trim() ? (
              <EmptySearchResults
                query={searchTerm.trim()}
                onClear={clearSearch}
              />
            ) : (
              <EmptyOpportunities onExplore={clearAllFilters} />
            )}
            <div className="flex flex-wrap items-center justify-center gap-2 pb-4">
              {!showClosed ? (
                <button
                  type="button"
                  onClick={() => setShowClosed(true)}
                  className="inline-flex items-center gap-2 rounded-md border border-subtle bg-surface-elevated px-4 py-2 text-sm font-semibold text-text-secondary transition hover:border-strong hover:text-text-primary"
                >
                  {t("opportunities.showClosed")}
                </button>
              ) : null}
              {searchTerm.trim() && hasActiveFilters ? (
                // EmptyOpportunities already offers Clear Filters; only the
                // search branch needs this extra escape hatch.
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="inline-flex items-center gap-2 rounded-md border border-subtle bg-surface-elevated px-4 py-2 text-sm font-semibold text-text-secondary transition hover:border-strong hover:text-text-primary"
                >
                  {t("opportunities.clearFilters")}
                </button>
              ) : null}
            </div>
          </section>
      )}
    </>
  );

  return (
    <div className="bg-surface-body">
      <Seo
        title={
          selectedCategory
            ? `${t(selectedCategory.labelKey)} opportunities | Edutu`
            : "Updated scholarships, internships and grants | Edutu"
        }
        description={seoDescription}
        path={
          selectedCategoryId
            ? `/opportunities?category=${encodeURIComponent(selectedCategoryId)}`
            : "/opportunities"
        }
        image={getDefaultSeoImage()}
        jsonLd={seoJsonLd}
      />
      {embedded ? (
        <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          {content}
        </main>
      ) : (
        <PublicEditorialShell mainClassName="max-w-7xl py-5 sm:py-6">
          {content}
        </PublicEditorialShell>
        )}
      </div>
    );
  }
