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
  AlarmClock,
  ArrowUpRight,
  Award,
  Bookmark,
  Briefcase,
  Calendar,
  ChevronDown,
  EyeOff,
  GraduationCap,
  MapPin,
  Lock,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useProFeature } from "./ProGate";
import { ImpressionTracker } from "./opportunity/ImpressionTracker";
import { DismissReasonDialog } from "./opportunity/DismissReasonDialog";
import {
  dismissOpportunity,
  getDismissedOpportunityIds,
} from "../services/dismissedOpportunities";
import {
  recordOpportunitySignal,
  type DismissReason,
} from "../services/opportunitySignals";
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
import Pagination from "./ui/Pagination";
import Select from "./ui/Select";
import { InlineError, StateView, showsContent, useScreenState } from "./state";
import {
  shareOpportunity,
  shareOutcomeMessage,
} from "../services/opportunityShare";
import { getDefaultSeoImage, toAbsoluteUrl } from "../lib/publicSite";
import OpportunityRails, {
  type OpportunityRail,
} from "./opportunity/OpportunityRails";
import {
  createOpportunityShuffleSeed,
  shuffleOpportunityFeed,
} from "../lib/opportunityShuffle";
import { organizationLabel } from "../lib/organizationLabel";

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

// "Collection" cards shown at the top of the page. Each one links to a filtered
// view (`?category=`) so tapping a card navigates to a dedicated page listing
// just those opportunities. Colour lives in the icon chip, not the card.
type Collection = {
  key: string;
  categoryId: string;
  labelKey: string;
  desc: string;
  Icon: LucideIcon;
  chip: string;
  accentText: string;
};

const COLLECTIONS: Collection[] = [
  {
    key: "scholarships",
    categoryId: "scholarships",
    labelKey: "opportunities.categories.scholarships",
    desc: "Fund your studies worldwide",
    Icon: GraduationCap,
    chip: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
    accentText: "text-amber-600 dark:text-amber-300",
  },
  {
    key: "internships",
    categoryId: "internships",
    labelKey: "opportunities.categories.internships",
    desc: "Gain hands-on experience",
    Icon: Briefcase,
    chip: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
    accentText: "text-blue-600 dark:text-blue-300",
  },
  {
    key: "fellowships",
    categoryId: "fellowships",
    labelKey: "opportunities.categories.fellowships",
    desc: "Advance research & leadership",
    Icon: Award,
    chip: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
    accentText: "text-violet-600 dark:text-violet-300",
  },
  {
    key: "programs",
    categoryId: "programs",
    labelKey: "opportunities.categories.programs",
    desc: "Accelerators, bootcamps & more",
    Icon: Rocket,
    chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
    accentText: "text-emerald-600 dark:text-emerald-300",
  },
];

function CollectionCard({
  to,
  label,
  desc,
  Icon,
  chip,
  accentText,
}: {
  to: string;
  label: string;
  desc: string;
  Icon: LucideIcon;
  chip: string;
  accentText: string;
}) {
  return (
    <Link
      to={to}
      className={`group relative flex flex-row items-center gap-2.5 overflow-hidden rounded-2xl border p-2.5 shadow-soft transition duration-200 hover:-translate-y-0.5 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 sm:gap-3.5 sm:p-4 ${CARD_SURFACE}`}
    >
      <span
        className={`relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10 sm:rounded-xl ${chip}`}
      >
        <Icon size={16} className="sm:hidden" />
        <Icon size={20} className="hidden sm:block" />
      </span>
      <div className="relative min-w-0 flex-1">
        <h3 className="truncate font-display text-sm font-semibold leading-tight text-text-primary sm:text-base">
          {label}
        </h3>
        {/* Description only from sm: up — mobile keeps the card one line tall. */}
        <p className="mt-0.5 hidden truncate text-xs leading-snug text-text-secondary sm:block">
          {desc}
        </p>
      </div>
      <ArrowUpRight
        size={16}
        className={`hidden shrink-0 transition duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 sm:block ${accentText}`}
      />
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

const DEFAULT_PAGE_SIZE = 12;
const PAGE_SIZE_OPTIONS = [12, 20, 50, 100];

// Warm the detail-route chunk while the user is still deciding, so tapping a
// card never waits on a JS download.
function prefetchOpportunityDetail() {
  void import("./OpportunityDetail").catch(() => {});
}

// Per-category chip colour system. The card itself stays plain white; only the
// category pill carries colour. Class strings are written out in full (never
// interpolated) so Tailwind's JIT keeps them in the build.
type CardPalette = {
  /** Category pill. */
  chip: string;
};

/**
 * Every opportunity card sits on the same plain surface — the colour lives in
 * the category chip only, so the grid reads as a clean board of white cards.
 */
export const CARD_SURFACE = "border-subtle bg-white hover:border-strong";

const CARD_PALETTES: CardPalette[] = [
  {
    chip: "border border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-200",
  },
  {
    chip: "border border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-200",
  },
  {
    chip: "border border-violet-500/30 bg-violet-500/15 text-violet-700 dark:text-violet-200",
  },
  {
    chip: "border border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-200",
  },
  {
    chip: "border border-rose-500/30 bg-rose-500/15 text-rose-700 dark:text-rose-200",
  },
  {
    chip: "border border-cyan-500/30 bg-cyan-500/15 text-cyan-700 dark:text-cyan-200",
  },
  {
    chip: "border border-orange-500/30 bg-orange-500/15 text-orange-700 dark:text-orange-200",
  },
  {
    chip: "border border-fuchsia-500/30 bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-200",
  },
];

// Keyword → palette so each family of opportunities gets a consistent colour.
const CATEGORY_PALETTE_INDEX: Record<string, number> = {
  scholarship: 0,
  scholar: 0,
  internship: 1,
  intern: 1,
  fellowship: 2,
  fellow: 2,
  residency: 2,
  program: 3,
  bootcamp: 3,
  accelerator: 3,
  course: 3,
  training: 3,
  competition: 4,
  contest: 4,
  challenge: 4,
  hackathon: 4,
  award: 4,
  job: 5,
  career: 5,
  employment: 5,
  grant: 6,
  fund: 6,
  conference: 7,
  summit: 7,
  workshop: 7,
  event: 7,
};

function getCardPalette(opportunity: Opportunity): CardPalette {
  const category = (opportunity.category ?? "").toLowerCase();
  for (const keyword of Object.keys(CATEGORY_PALETTE_INDEX)) {
    if (category.includes(keyword)) {
      return CARD_PALETTES[CATEGORY_PALETTE_INDEX[keyword]];
    }
  }
  // Unknown / missing category: pick deterministically from the id so every
  // card is still colourful and the same card keeps the same colour.
  const seed = opportunity.id || opportunity.title || "";
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash + seed.charCodeAt(i)) % CARD_PALETTES.length;
  }
  return CARD_PALETTES[hash];
}

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
  onNotInterested,
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
  /** Opens the typed "not interested" flow. */
  onNotInterested?: (opportunity: Opportunity) => void;
}) {
  const funding = formatFunding(opportunity);
  const palette = getCardPalette(opportunity);
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
    <article
      className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border shadow-soft transition duration-200 hover:-translate-y-1 hover:shadow-elevated ${CARD_SURFACE}`}
    >
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
          {onNotInterested ? (
            <button
              type="button"
              onClick={() => onNotInterested(opportunity)}
              className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-layer text-text-secondary shadow-soft backdrop-blur transition hover:bg-surface-elevated hover:text-text-primary"
              aria-label={`Not interested in ${opportunity.title}`}
              title="Not interested"
            >
              <EyeOff size={15} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="relative flex flex-1 flex-col p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          <MatchScoreBadge score={match?.score} minScore={40} />
          {opportunity.category ? (
            <span
              className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ${palette.chip}`}
            >
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
        {organizationLabel(opportunity.organization, opportunity.title) ? (
          <p className="mt-1 truncate text-sm text-text-muted">
            {organizationLabel(opportunity.organization, opportunity.title)}
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
  const { explainOpportunity, isPersonalized, personalizeFeed, trackInteraction } =
    usePersonalization();
  const { success, error: showError } = useToast();
  const { isSignedIn, userId, getToken } = useClerkAuth();
  // Browsing, search and sorting stay free; only revealing *closed* (expired)
  // opportunities is a Pro feature — turning it ON requires Pro, turning it
  // back OFF is always free.
  const closedFilter = useProFeature("closed opportunities");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState("");
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [bookmarkingId, setBookmarkingId] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>("recommended");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [refreshing, setRefreshing] = useState(false);
  const resultsRef = useRef<HTMLElement | null>(null);
  // "Not interested": locally-hidden ids + the card awaiting a typed reason.
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [dismissTarget, setDismissTarget] = useState<Opportunity | null>(null);
  // Fresh seed each visit so the default "Recommended" order rotates between
  // sessions but stays put while the user paginates through this one.
  const [browseShuffleSeed, setBrowseShuffleSeed] = useState(() =>
    createOpportunityShuffleSeed(),
  );

  useEffect(() => {
    setDismissedIds(getDismissedOpportunityIds(userId));
  }, [userId]);

  // Manual refresh: force a fresh fetch and show a spinner until it lands.
  // Re-seeding makes the reshuffle visible even when the data didn't change.
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setBrowseShuffleSeed(createOpportunityShuffleSeed());
    refresh();
  }, [refresh]);

  // Clear the refresh spinner once new data arrives.
  useEffect(() => {
    setRefreshing(false);
  }, [opportunities]);

  // Always pull the freshest opportunities when the user opens this screen or
  // returns to the tab, rather than lingering on whatever was cached earlier.
  useEffect(() => {
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refresh]);

  const handleDismissReason = useCallback(
    (reason: DismissReason) => {
      const target = dismissTarget;
      setDismissTarget(null);
      if (!target || !userId) return;
      dismissOpportunity(userId, target.id, getToken, "web_browse", reason);
      setDismissedIds((prev) =>
        prev.includes(target.id) ? prev : [...prev, target.id],
      );
    },
    [dismissTarget, userId, getToken],
  );

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
    const dismissed = new Set(dismissedIds);

    return opportunities.filter((opportunity) => {
      if (dismissed.has(opportunity.id)) {
        return false;
      }

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
    dismissedIds,
  ]);

  // Browse-intent signals: settled searches and category picks teach the
  // engine's category affinity even before any card is opened.
  const lastSearchSignalRef = useRef("");
  useEffect(() => {
    if (!isSignedIn) return;
    const query = deferredSearchTerm.trim().toLowerCase();
    if (query.length < 3 || query === lastSearchSignalRef.current) return;
    lastSearchSignalRef.current = query;
    void recordOpportunitySignal(
      {
        signalType: "search",
        context: "web_browse_search",
        details: { query },
      },
      getToken,
    );
  }, [deferredSearchTerm, isSignedIn, getToken]);

  useEffect(() => {
    if (!isSignedIn || !selectedCategoryId) return;
    void recordOpportunitySignal(
      {
        signalType: "category_view",
        context: "web_category_browse",
        details: { category: selectedCategoryId },
      },
      getToken,
    );
  }, [selectedCategoryId, isSignedIn, getToken]);

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
    if (sortOption === "recommended") {
      // Every visit reshuffles so the catalogue never looks stale: tier
      // shuffle for personalized users (strong matches stay on top, ties
      // rotate), full seeded shuffle otherwise.
      if (isPersonalized) {
        return personalizeFeed(filteredOpportunities, {
          seed: browseShuffleSeed,
        });
      }
      return shuffleOpportunityFeed(filteredOpportunities, browseShuffleSeed);
    }
    return sortOpportunities(filteredOpportunities, sortOption);
  }, [
    filteredOpportunities,
    sortOption,
    isPersonalized,
    personalizeFeed,
    browseShuffleSeed,
  ]);

  // Discovery rails shown on the browse landing (no search, no category):
  // horizontal strips of the freshest, most urgent and best-matched items so
  // the page leads with what's new even before the user scrolls the grid.
  const showRails = !selectedCategoryId && !deferredSearchTerm.trim();
  const discoveryRails = useMemo<OpportunityRail[]>(() => {
    if (!showRails) return [];

    const latest = [...filteredOpportunities]
      .sort(
        (a, b) =>
          (getOpportunityUpdatedTime(b) ?? 0) -
          (getOpportunityUpdatedTime(a) ?? 0),
      )
      .slice(0, 12);

    const closingSoon = filteredOpportunities
      .map((opportunity) => ({
        opportunity,
        deadline: getOpportunityDeadlineTime(opportunity),
      }))
      .filter(
        (item): item is { opportunity: Opportunity; deadline: number } =>
          item.deadline !== null && item.deadline > Date.now(),
      )
      .sort((a, b) => a.deadline - b.deadline)
      .slice(0, 12)
      .map((item) => item.opportunity);

    const rails: OpportunityRail[] = [];
    if (isPersonalized) {
      rails.push({
        key: "recommended",
        title: t("opportunities.rails.recommended", {
          defaultValue: "Recommended for you",
        }),
        subtitle: t("opportunities.rails.recommendedSubtitle", {
          defaultValue: "Strong matches for your profile",
        }),
        Icon: Target,
        accent: "bg-brand/10 text-brand",
        items: personalizeFeed(filteredOpportunities, {
          seed: browseShuffleSeed,
        }).slice(0, 12),
      });
    }
    rails.push(
      {
        key: "latest",
        title: t("opportunities.rails.latest", { defaultValue: "Just added" }),
        subtitle: t("opportunities.rails.latestSubtitle", {
          defaultValue: "The newest opportunities on Edutu",
        }),
        Icon: Sparkles,
        accent: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
        items: latest,
      },
      {
        key: "closing",
        title: t("opportunities.rails.closing", {
          defaultValue: "Closing soon",
        }),
        subtitle: t("opportunities.rails.closingSubtitle", {
          defaultValue: "Deadlines around the corner — apply now",
        }),
        Icon: AlarmClock,
        accent: "bg-rose-500/15 text-rose-600 dark:text-rose-300",
        items: closingSoon,
      },
    );
    return rails;
  }, [
    showRails,
    filteredOpportunities,
    isPersonalized,
    personalizeFeed,
    browseShuffleSeed,
    t,
  ]);

  const railDetailPathFor = useCallback(
    (opportunity: Opportunity) =>
      `${embedded ? "/app" : ""}/opportunity/${opportunity.id}`,
    [embedded],
  );
  const handleRailOpen = useCallback(
    (opportunity: Opportunity) =>
      trackInteraction(opportunity, "view", { context: "rail_open" }),
    [trackInteraction],
  );

  // Reset to the first page only when the user changes what they're browsing —
  // NOT when server match scores hydrate and re-sort the list, which would
  // otherwise snap the user off the page they're reading.
  useEffect(() => {
    setPage(1);
  }, [searchTerm, selectedCategoryId, showClosed, sortOption, pageSize]);

  const totalPages = Math.max(
    1,
    Math.ceil(sortedOpportunities.length / pageSize),
  );

  // A shrinking result set (new filter, closed toggle) can leave `page` past
  // the end — clamp it back into range.
  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const visibleOpportunities = sortedOpportunities.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  const goToPage = useCallback((next: number) => {
    setPage(next);
    // Jump back to the top of the grid so the new page starts in view. The
    // grid's scroll-margin clears the sticky filter bar.
    resultsRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  const hasActiveFilters = Boolean(
    searchTerm.trim() || selectedCategoryId || showClosed,
  );

  // `hasActiveFilters` already encodes every way this screen narrows results,
  // so it is exactly the signal that separates "nothing matched your filters"
  // from "we have nothing to show" — two states this screen used to render
  // with two different components and no shared language.
  const screenState = useScreenState({
    data: sortedOpportunities,
    loading,
    error,
    filtersActive: hasActiveFilters,
  });

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

  // Non-default filter/sort state lights up a dot on the filter button so the
  // control's effect stays visible even when the popover is closed.
  const hasCustomFilters = showClosed || sortOption !== "recommended";

  const sortChoices: Array<{ value: SortOption; label: string }> = [
    { value: "recommended", label: "Recommended" },
    { value: "deadline", label: "Deadline soonest" },
    { value: "newest", label: "Newest first" },
    { value: "funding", label: "Highest funding" },
  ];

  // Single, prominent search bar shown just below the page title, with the
  // filter/sort controls tucked into a popover behind the trailing icon.
  const searchBar = (
    <div className="relative">
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
        className="h-12 w-full rounded-xl border border-subtle bg-surface-layer pl-11 pr-[5.25rem] text-sm text-text-primary shadow-soft placeholder:text-text-muted transition focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
      />
      {searchTerm ? (
        <button
          type="button"
          onClick={clearSearch}
          className="absolute right-11 top-1/2 -translate-y-1/2 rounded-md p-2 text-text-muted transition hover:text-text-primary"
          aria-label="Clear search"
        >
          <X size={16} />
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => setFiltersOpen((open) => !open)}
        className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 transition ${
          filtersOpen || hasCustomFilters
            ? "bg-brand/10 text-brand"
            : "text-text-muted hover:text-text-primary"
        }`}
        aria-label="Filters and sorting"
        aria-expanded={filtersOpen}
      >
        <SlidersHorizontal size={17} />
        {hasCustomFilters ? (
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-brand" />
        ) : null}
      </button>
      {filtersOpen ? (
        <>
          <button
            type="button"
            aria-label="Close filters"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setFiltersOpen(false)}
          />
          <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-64 rounded-2xl border border-subtle bg-surface-elevated p-3 shadow-elevated">
            <p className="px-1 pb-1 text-2xs font-semibold uppercase tracking-[0.14em] text-text-muted">
              Sort by
            </p>
            <div className="space-y-0.5">
              {sortChoices.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  onClick={() => setSortOption(choice.value)}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition ${
                    sortOption === choice.value
                      ? "bg-brand/10 font-semibold text-brand"
                      : "text-text-primary hover:bg-surface-layer"
                  }`}
                >
                  {choice.label}
                  {sortOption === choice.value ? (
                    <span className="h-2 w-2 rounded-full bg-brand" />
                  ) : null}
                </button>
              ))}
            </div>
            <div className="my-2 border-t border-subtle" />
            <button
              type="button"
              role="switch"
              aria-checked={showClosed}
              onClick={() => {
                // Turning OFF is always free; turning ON is Pro-gated.
                if (showClosed) {
                  setShowClosed(false);
                } else if (closedFilter.requirePro()) {
                  setShowClosed(true);
                }
              }}
              className="flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-sm text-text-primary transition hover:bg-surface-layer"
            >
              <span className="flex items-center gap-1.5">
                Show closed
                {closedFilter.locked ? (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-brand-500/15 px-1.5 py-0.5 text-2xs font-semibold uppercase leading-none tracking-wide text-brand-700">
                    <Lock size={8} aria-hidden="true" />
                    Pro
                  </span>
                ) : null}
              </span>
              <span
                className={`relative h-6 w-10 shrink-0 rounded-full transition ${
                  showClosed
                    ? "bg-brand"
                    : "border border-subtle bg-surface-layer"
                }`}
              >
                <span
                  className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow-soft transition-all ${
                    showClosed ? "left-[calc(100%-20px)]" : "left-1"
                  }`}
                />
              </span>
            </button>
            {hasCustomFilters ? (
              <button
                type="button"
                onClick={() => {
                  setSortOption("recommended");
                  setShowClosed(false);
                }}
                className="mt-1 w-full rounded-lg px-2.5 py-2 text-left text-sm font-medium text-text-secondary transition hover:bg-surface-layer hover:text-text-primary"
              >
                Reset to defaults
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );

  const content = (
    <>
        {activeCollection ? (
          <section className="mb-6 rounded-2xl border border-subtle bg-surface-layer p-4 shadow-soft">
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
            <div className="mt-4">{searchBar}</div>
          </section>
        ) : (
          <section className="mb-6">
            <div className="mb-4 hidden items-end justify-between gap-3 sm:flex">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
                  {t("navigation.explore")}
                </p>
                <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
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
            <div className="mb-5">{searchBar}</div>
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
              {COLLECTIONS.map((collection) => (
                <CollectionCard
                  key={collection.key}
                  to={collectionPath(collection)}
                  label={t(collection.labelKey)}
                  desc={collection.desc}
                  Icon={collection.Icon}
                  chip={collection.chip}
                  accentText={collection.accentText}
                />
              ))}
            </div>
          </section>
        )}

        {showRails && !loading ? (
          <OpportunityRails
            rails={discoveryRails}
            detailPathFor={railDetailPathFor}
            getPalette={getCardPalette}
            matchInsights={matchInsights}
            onOpen={handleRailOpen}
            getToken={isSignedIn ? getToken : undefined}
          />
        ) : null}

        {showsContent(screenState) && screenState.kind === "partial" ? (
          // Cached results are on screen and the refresh failed. That is the
          // `partial` state: keep the content, flag the staleness inline, and
          // never replace what the user is already reading.
          <InlineError
            message={t("opportunities.errorTitle")}
            onRetry={refresh}
            className="mt-5"
          />
        ) : null}

        {loading ? (
          <section className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
            {Array.from({ length: Math.min(pageSize, 12) }).map((_, index) => (
              <LoadingCard key={index} />
            ))}
          </section>
        ) : sortedOpportunities.length > 0 ? (
          <>
            <div className="mt-5 flex items-center justify-between gap-3">
              <p className="text-sm text-text-muted">
                {t("opportunities.resultCount", {
                  defaultValue: "{{count}} opportunities",
                  count: sortedOpportunities.length,
                })}
              </p>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={loading || refreshing}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-subtle bg-surface-layer px-3 text-sm font-medium text-text-secondary shadow-soft transition hover:bg-surface-elevated hover:text-text-primary disabled:opacity-60"
              >
                <RefreshCw
                  size={14}
                  className={loading || refreshing ? "animate-spin" : ""}
                />
                {t("common.refresh", { defaultValue: "Refresh" })}
              </button>
            </div>
            <section
              ref={resultsRef}
              className="mt-4 grid scroll-mt-28 grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3"
            >
              {visibleOpportunities.map((opportunity, index) => (
                <ImpressionTracker
                  key={opportunity.id}
                  opportunityId={opportunity.id}
                  surface="web_browse"
                  position={index}
                  getToken={isSignedIn ? getToken : undefined}
                  className="h-full"
                >
                  <OpportunityCard
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
                    onNotInterested={
                      isSignedIn ? (item) => setDismissTarget(item) : undefined
                    }
                  />
                </ImpressionTracker>
              ))}
            </section>
            <div className="mt-8 flex flex-col-reverse items-center gap-4 sm:flex-row sm:justify-between">
              <label className="flex items-center gap-2 text-sm text-text-muted">
                <span className="shrink-0">
                  {t("opportunities.perPageLabel", { defaultValue: "Show" })}
                </span>
                <span className="relative">
                  <Select
                    value={pageSize}
                    onChange={(event) => setPageSize(Number(event.target.value))}
                    aria-label={t("opportunities.perPage", {
                      defaultValue: "Results per page",
                    })}
                    className="h-9 w-auto min-w-[7rem] pr-9 text-sm"
                  >
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {t("opportunities.perPageOption", {
                          defaultValue: "{{count}} per page",
                          count: size,
                        })}
                      </option>
                    ))}
                  </Select>
                  <ChevronDown
                    size={14}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
                  />
                </span>
              </label>
              <Pagination
                page={page}
                totalPages={totalPages}
                onPageChange={goToPage}
              />
            </div>
          </>
        ) : (
          <section className="mt-5 rounded-2xl border border-subtle bg-surface-layer p-4">
            <StateView
              state={screenState}
              flow="discovery"
              onRetry={refresh}
              onAction={searchTerm.trim() ? clearSearch : clearAllFilters}
            />
            <div className="flex flex-wrap items-center justify-center gap-2 pb-4">
              {!showClosed ? (
                <button
                  type="button"
                  onClick={() => {
                    // Same Pro gate as the filter-panel toggle.
                    if (closedFilter.requirePro()) setShowClosed(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-md border border-subtle bg-surface-elevated px-4 py-2 text-sm font-semibold text-text-secondary transition hover:border-strong hover:text-text-primary"
                >
                  {closedFilter.locked ? (
                    <Lock size={14} aria-hidden="true" />
                  ) : null}
                  {t("opportunities.showClosed")}
                </button>
              ) : null}
              {searchTerm.trim() && hasActiveFilters ? (
                // StateView's own action clears the search; this is the extra
                // escape hatch for when filters are ALSO narrowing the list.
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
        <DismissReasonDialog
          open={dismissTarget !== null}
          onSelect={handleDismissReason}
          onClose={() => setDismissTarget(null)}
        />
      </div>
    );
  }
