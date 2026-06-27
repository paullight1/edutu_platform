import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Calendar,
  MapPin,
  RefreshCw,
  Search,
  Share2,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { useOpportunities } from "../hooks/useOpportunities";
import type { Opportunity } from "../types/opportunity";
import {
  getOpportunityDaysLeft,
  isOpportunityExpired,
  parseOpportunityDeadline,
} from "../services/opportunities";
import ImageWithFallback from "./ImageWithFallback";
import PublicEditorialShell from "./PublicEditorialShell";
import Seo from "./Seo";
import { useToast } from "./ui/ToastProvider";
import {
  buildOpportunityShareText,
  buildOpportunityShareUrl,
  buildWhatsAppShareUrl,
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

const categoryFallbackImages: Record<string, string> = {
  scholarships:
    "https://images.pexels.com/photos/267885/pexels-photo-267885.jpeg",
  fellowships:
    "https://images.pexels.com/photos/1438072/pexels-photo-1438072.jpeg",
  internships:
    "https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg",
  grants: "https://images.pexels.com/photos/2280571/pexels-photo-2280571.jpeg",
  programs:
    "https://images.pexels.com/photos/1181715/pexels-photo-1181715.jpeg",
  general: "https://images.pexels.com/photos/5212329/pexels-photo-5212329.jpeg",
};

function getOpportunityImage(opportunity: Opportunity): string {
  if (opportunity.image) return opportunity.image;

  const category = opportunity.category?.trim().toLowerCase() || "general";
  return categoryFallbackImages[category] || categoryFallbackImages.general;
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

function closingSoonClasses(daysLeft: number): string {
  if (daysLeft <= 1) {
    return "font-semibold text-rose-600 dark:text-rose-400";
  }
  return "font-semibold text-amber-600 dark:text-amber-400";
}

function formatDaysLeftLabel(daysLeft: number): string {
  return `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;
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

type DeadlineWindow = "any" | "week" | "month" | "90days";
type FundingFilter = "any" | "paid";
type SortOption = "recommended" | "deadline" | "newest" | "funding";

const PAGE_SIZE = 12;

const deadlineWindowOptions: { value: DeadlineWindow; labelKey: string }[] = [
  { value: "any", labelKey: "opportunities.deadlineWindows.any" },
  { value: "week", labelKey: "opportunities.deadlineWindows.week" },
  { value: "month", labelKey: "opportunities.deadlineWindows.month" },
  { value: "90days", labelKey: "opportunities.deadlineWindows.90days" },
];

const fundingOptions: { value: FundingFilter; labelKey: string }[] = [
  { value: "any", labelKey: "opportunities.funding.any" },
  { value: "paid", labelKey: "opportunities.funding.paid" },
];

const sortOptions: { value: SortOption; labelKey: string }[] = [
  { value: "recommended", labelKey: "opportunities.sort.recommended" },
  { value: "deadline", labelKey: "opportunities.sort.deadline" },
  { value: "newest", labelKey: "opportunities.sort.newest" },
  { value: "funding", labelKey: "opportunities.sort.funding" },
];

function deadlineWindowMatches(
  opportunity: Opportunity,
  window: DeadlineWindow,
): boolean {
  if (window === "any") return true;
  const daysLeft = getOpportunityDaysLeft(opportunity.deadline);
  if (daysLeft === null) return false;
  if (window === "week") return daysLeft <= 7;
  if (window === "month") return daysLeft <= 31;
  return daysLeft <= 90;
}

function hasPaidFunding(opportunity: Opportunity): boolean {
  const stipend = opportunity.stipend;
  return (
    typeof stipend === "number" &&
    Number.isFinite(stipend) &&
    stipend > 0
  );
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
  detailPath,
  expired,
}: {
  opportunity: Opportunity;
  onShare: (opportunity: Opportunity) => void;
  isSharing: boolean;
  detailPath: string;
  expired: boolean;
}) {
  const funding = formatFunding(opportunity);
  const deadlineDisplay = (() => {
    const daysLeft = expired ? null : getOpportunityDaysLeft(opportunity.deadline);
    if (daysLeft !== null && daysLeft <= 7) {
      return {
        text: `${formatDeadline(opportunity.deadline)} · ${formatDaysLeftLabel(daysLeft)}`,
        className: closingSoonClasses(daysLeft),
      };
    }
    return { text: formatDeadline(opportunity.deadline), className: "" };
  })();

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-soft dark:border-white/10 dark:bg-slate-950">
      <div className="relative aspect-[16/9] overflow-hidden bg-slate-100 dark:bg-slate-900">
        <ImageWithFallback
          src={getOpportunityImage(opportunity)}
          alt={`${opportunity.title} cover image`}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          fallbackClassName="flex h-full w-full items-center justify-center"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent" />
        {expired ? (
          <span className="absolute left-3 top-3 inline-flex items-center rounded-md bg-slate-950/85 px-2.5 py-1 text-xs font-semibold text-white shadow-sm backdrop-blur dark:bg-white/85 dark:text-slate-950">
            Expired
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => onShare(opportunity)}
          disabled={isSharing}
          className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-md bg-white/92 text-slate-600 shadow-sm backdrop-blur transition hover:text-brand-600 disabled:cursor-wait disabled:opacity-60 dark:bg-slate-950/80 dark:text-slate-200 dark:hover:text-white"
          aria-label={`Share ${opportunity.title}`}
        >
          <Share2 size={15} />
        </button>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-md border border-brand-500/20 bg-brand-500/10 px-2 py-1 text-xs font-semibold text-brand-700 dark:text-brand-300">
            {opportunity.category || "General"}
          </span>
          {opportunity.difficulty ? (
            <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
              {opportunity.difficulty}
            </span>
          ) : null}
        </div>

        <h2 className="text-lg font-semibold leading-snug text-slate-950 transition group-hover:text-brand-600 dark:text-white dark:group-hover:text-brand-300">
          {opportunity.title}
        </h2>
        {opportunity.organization ? (
          <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
            {opportunity.organization}
          </p>
        ) : null}

        {funding ? (
          <p className="mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">
            {funding}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-200 pt-3 text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <MapPin size={14} />
            {opportunity.location || "Remote"}
          </span>
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
        className="absolute inset-0 z-10 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
        aria-label={`View ${opportunity.title}`}
      />
    </article>
  );
}

function LoadingCard() {
  return (
    <div className="min-h-[330px] animate-pulse rounded-lg bg-slate-200 dark:bg-white/5" />
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-semibold transition ${
        active
          ? "border-brand-500 bg-brand-500/10 text-brand-700 dark:border-brand-400 dark:bg-brand-500/20 dark:text-brand-200"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-white/20"
      }`}
    >
      {label}
    </button>
  );
}

interface OpportunitiesPageProps {
  embedded?: boolean;
}

export default function OpportunitiesPage({ embedded = false }: OpportunitiesPageProps) {
  const { t } = useTranslation();
  const { data: opportunities, loading, error, refresh } = useOpportunities();
  const { success, error: showError } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState("");
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [deadlineWindow, setDeadlineWindow] = useState<DeadlineWindow>("any");
  const [fundingFilter, setFundingFilter] = useState<FundingFilter>("any");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>("recommended");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const selectedCategoryId = searchParams.get("category")?.toLowerCase() ?? "";
  const selectedCategory = categoryFilters[selectedCategoryId] ?? null;

  const filteredOpportunities = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

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

      if (!deadlineWindowMatches(opportunity, deadlineWindow)) {
        return false;
      }

      if (fundingFilter === "paid" && !hasPaidFunding(opportunity)) {
        return false;
      }

      if (remoteOnly && !opportunity.isRemote) {
        return false;
      }

      if (featuredOnly && !opportunity.featured) {
        return false;
      }

      if (!term) {
        return true;
      }

      const haystack = [
        opportunity.title,
        opportunity.organization,
        opportunity.description,
        opportunity.location,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [
    opportunities,
    searchTerm,
    selectedCategoryId,
    showClosed,
    deadlineWindow,
    fundingFilter,
    remoteOnly,
    featuredOnly,
  ]);

  const sortedOpportunities = useMemo(
    () => sortOpportunities(filteredOpportunities, sortOption),
    [filteredOpportunities, sortOption],
  );

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [sortedOpportunities]);

  const visibleOpportunities = sortedOpportunities.slice(0, visibleCount);

  const hasActiveFilters = Boolean(
    searchTerm.trim() ||
      selectedCategoryId ||
      deadlineWindow !== "any" ||
      fundingFilter !== "any" ||
      remoteOnly ||
      featuredOnly ||
      showClosed,
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

  const clearCategory = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("category");
    setSearchParams(nextParams, { replace: true });
  };

  const clearAllFilters = () => {
    setSearchTerm("");
    setDeadlineWindow("any");
    setFundingFilter("any");
    setRemoteOnly(false);
    setFeaturedOnly(false);
    setShowClosed(false);
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  const handleShareOpportunity = async (opportunity: Opportunity) => {
    const shareUrl = buildOpportunityShareUrl(opportunity.id);
    const shareText = buildOpportunityShareText(opportunity, shareUrl);

    setSharingId(opportunity.id);

    try {
      if (navigator.share) {
        await navigator.share({
          title: opportunity.title,
          text: shareText,
          url: shareUrl,
        });
        success("Share link ready");
        return;
      }

      await navigator.clipboard.writeText(`${shareText}\n\n${shareUrl}`);
      success("Share link copied");
    } catch (error) {
      if (
        error instanceof DOMException &&
        (error.name === "AbortError" || error.name === "NotAllowedError")
      ) {
        return;
      }

      try {
        window.open(
          buildWhatsAppShareUrl(shareText),
          "_blank",
          "noopener,noreferrer",
        );
        success("Opened WhatsApp share");
      } catch {
        showError("Could not share this opportunity");
      }
    } finally {
      setSharingId(null);
    }
  };

  const content = (
    <>
        {selectedCategory ? (
          <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-950">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-brand-600 dark:text-brand-300">
                  {t("navigation.explore")}
                </p>
                <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 dark:text-white">
                  {t(selectedCategory.labelKey)}
                </h1>
                <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  {t("opportunities.browseCategory", { label: t(selectedCategory.labelKey).toLowerCase() })}
                </p>
              </div>
              <button
                type="button"
                onClick={clearCategory}
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
              >
                {t("common.all")}
                <X size={14} />
              </button>
            </div>
          </section>
        ) : null}

        <section className={`sticky ${embedded ? "top-[72px]" : "top-[76px]"} z-20 rounded-lg border border-slate-200 bg-white/92 p-3 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/92`}>
          <div className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
              <Search
                size={18}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400"
              />
              <input
                type="text"
                aria-label="Search opportunities"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={t("opportunities.searchPlaceholder")}
                className="h-11 w-full rounded-md border border-slate-200 bg-white pl-11 pr-11 text-sm text-slate-950 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white dark:border-white/10 dark:bg-slate-950 dark:text-white dark:focus:bg-slate-950"
              />
              {searchTerm ? (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-slate-400 transition hover:text-slate-700 dark:hover:text-white"
                  aria-label="Clear search"
                >
                  <X size={16} />
                </button>
              ) : null}
              </div>
              <label className="inline-flex h-11 shrink-0 cursor-pointer select-none items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-600 dark:border-white/10 dark:bg-slate-950 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={showClosed}
                  onChange={(event) => setShowClosed(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-white/20 dark:bg-slate-900"
                />
                {t("opportunities.showClosed")}
              </label>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-200 pt-3 dark:border-white/10">
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-[0.7rem] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                  {t("opportunities.filters.deadline")}
                </span>
                {deadlineWindowOptions.map((option) => (
                  <FilterChip
                    key={option.value}
                    active={deadlineWindow === option.value}
                    label={t(option.labelKey)}
                    onClick={() => setDeadlineWindow(option.value)}
                  />
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-[0.7rem] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                  {t("opportunities.filters.funding")}
                </span>
                {fundingOptions.map((option) => (
                  <FilterChip
                    key={option.value}
                    active={fundingFilter === option.value}
                    label={t(option.labelKey)}
                    onClick={() => setFundingFilter(option.value)}
                  />
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex h-8 cursor-pointer select-none items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 dark:border-white/10 dark:bg-slate-950 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={remoteOnly}
                    onChange={(event) => setRemoteOnly(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-white/20 dark:bg-slate-900"
                  />
                  {t("opportunities.remoteOnly")}
                </label>
                <label className="inline-flex h-8 cursor-pointer select-none items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 dark:border-white/10 dark:bg-slate-950 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={featuredOnly}
                    onChange={(event) => setFeaturedOnly(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-white/20 dark:bg-slate-900"
                  />
                  {t("opportunities.featured")}
                </label>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-200 pt-3 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("opportunities.showing.opportunities", {
                  shown: visibleOpportunities.length,
                  total: sortedOpportunities.length,
                  count: sortedOpportunities.length,
                })}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {t("common.sort")}
                  <select
                    value={sortOption}
                    onChange={(event) =>
                      setSortOption(event.target.value as SortOption)
                    }
                    className="h-8 rounded-md border border-slate-200 bg-white pl-2.5 pr-7 text-xs font-semibold text-slate-700 focus:border-brand-500 focus:outline-none dark:border-white/10 dark:bg-slate-950 dark:text-slate-200"
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
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-white/20"
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
          <section className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-5 text-rose-900 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-100">
            <h2 className="text-lg font-semibold">
              {t("opportunities.errorTitle")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-rose-800/80 dark:text-rose-100/80">
              {error}
            </p>
            <button
              type="button"
              onClick={refresh}
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700"
            >
              <RefreshCw size={16} />
              {t("common.retry")}
            </button>
          </section>
        ) : null}

        {loading ? (
          <section className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-4 sm:gap-5">
            {Array.from({ length: 6 }).map((_, index) => (
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
                  detailPath={`${embedded ? "/app" : ""}/opportunity/${opportunity.id}`}
                  expired={isOpportunityExpired(opportunity)}
                />
              ))}
            </section>
            {visibleCount < sortedOpportunities.length ? (
              <div className="mt-6 flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                  className="inline-flex h-11 items-center gap-2 rounded-md border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-white/20 dark:hover:bg-white/5"
                >
                  {t("opportunities.loadMore")}
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <section className="mt-5 rounded-lg border border-slate-200 bg-white p-8 text-center dark:border-white/10 dark:bg-slate-950">
            <h2 className="text-2xl font-semibold">{t("opportunities.empty.title")}</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              {t("opportunities.empty.description")}
            </p>
            <button
              type="button"
              onClick={clearAllFilters}
              className="mt-5 inline-flex items-center gap-2 rounded-md bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              {t("opportunities.clearFilters")}
            </button>
          </section>
        )}
    </>
  );

  return (
    <>
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
    </>
  );
}
