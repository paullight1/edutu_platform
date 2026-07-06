import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  CalendarDays,
  ExternalLink,
  Gauge,
  Heart,
  MapPin,
  Share2,
  Target,
  UsersRound,
  Wallet,
} from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@clerk/clerk-react";
import { usePersonalization } from "../hooks/usePersonalization";
import { useToast } from "./ui/ToastProvider";
import type { Opportunity } from "../types/opportunity";
import {
  getProductApiToken,
  isInvalidOrExpiredTokenError,
} from "../lib/clerkToken";
import { normalizeExternalUrl } from "../lib/externalUrl";
import {
  addBookmark,
  removeBookmark,
  isBookmarked,
} from "../services/bookmarks";
import { addApplication } from "../services/applications";
import {
  fetchOpportunities,
  getOpportunityDaysLeft,
  isOpportunityExpired,
  parseOpportunityDeadline,
} from "../services/opportunities";
import {
  buildOpportunityShareText,
  buildOpportunityShareUrl,
  shareOpportunity,
  shareOutcomeMessage,
} from "../services/opportunityShare";
import PublicEditorialShell from "./PublicEditorialShell";
import Seo from "./Seo";
import ImageWithFallback from "./ImageWithFallback";
import { WhyThisMatches } from "./opportunity/MatchInsights";
import { getDefaultSeoImage, toAbsoluteUrl } from "../lib/publicSite";

const PUBLIC_TAG_BLOCKLIST = new Set([
  "scraped",
  "scraper",
  "imported",
  "automation",
  "source",
]);

interface OpportunityDetailProps {
  opportunity: Opportunity;
  onBack: () => void;
  embedded?: boolean;
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

function formatDeadline(deadline?: string | null): string {
  const parsed = parseOpportunityDeadline(deadline);
  if (!parsed) return "No deadline listed";
  return format(parsed, "d MMMM yyyy");
}

function formatCompactDeadline(deadline?: string | null): string {
  const parsed = parseOpportunityDeadline(deadline);
  if (!parsed) return "No deadline";
  return format(parsed, "d MMM yyyy");
}

function formatUpdatedAt(value?: string | null): string {
  if (!value) return "Updated recently";
  const parsed = parseOpportunityDeadline(value);
  if (!parsed) return "Updated recently";
  return `Updated ${format(parsed, "d MMM yyyy")}`;
}

function normaliseSeoText(value?: string | null): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normaliseVisibleText(value?: string | null): string {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/\s*(?:\[\s*(?:\.{3}|…)\s*\]|\(\s*(?:\.{3}|…)\s*\))/gu, "")
    .replace(/\s*(?:\.{3}|…)\s*$/u, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function normaliseVisibleList(values: string[]): string[] {
  return values.map(normaliseVisibleText).filter(Boolean);
}

function truncateSeoText(value: string, maxLength = 155): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}...`;
}

function getIsoDate(value?: string | null): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function deadlineToIso(deadline?: string | null): string | undefined {
  const parsed = parseOpportunityDeadline(deadline);
  return parsed ? parsed.toISOString() : undefined;
}

function formatEligibilityKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatEligibilityValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((item) => formatEligibilityValue(item))
      .filter(Boolean)
      .join(", ");
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, nestedValue]) => {
        const formattedValue = formatEligibilityValue(nestedValue);
        return formattedValue
          ? `${formatEligibilityKey(key)}: ${formattedValue}`
          : "";
      })
      .filter(Boolean)
      .join("; ");
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (value === null || value === undefined) {
    return "";
  }

  return normaliseVisibleText(String(value));
}

function buildEligibilityItems(
  eligibility?: Record<string, unknown>,
): string[] {
  if (!eligibility) {
    return [];
  }

  return Object.entries(eligibility)
    .map(([key, value]) => {
      const formattedValue = formatEligibilityValue(value);
      return formattedValue
        ? `${formatEligibilityKey(key)}: ${formattedValue}`
        : "";
    })
    .filter(Boolean);
}

function RelatedOpportunityCard({
  opportunity,
  detailPath,
}: {
  opportunity: Opportunity;
  detailPath: string;
}) {
  const expired = isOpportunityExpired(opportunity);
  const daysLeft = expired ? null : getOpportunityDaysLeft(opportunity.deadline);
  const deadlineClass =
    daysLeft !== null && daysLeft <= 7 ? "font-semibold text-warning" : "";

  return (
    <Link
      to={detailPath}
      className="group relative flex h-full flex-col rounded-xl border border-subtle bg-surface-layer p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-elevated"
    >
      {opportunity.category ? (
        <span className="inline-flex w-fit items-center rounded-md border border-brand/20 bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">
          {opportunity.category}
        </span>
      ) : null}
      <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-text-primary transition group-hover:text-brand">
        {opportunity.title}
      </h3>
      {opportunity.organization ? (
        <p className="mt-1 truncate text-xs text-text-muted">
          {opportunity.organization}
        </p>
      ) : null}
      <div className="mt-auto flex flex-wrap gap-3 pt-3 text-xs text-text-muted">
        {opportunity.location ? (
          <span className="inline-flex items-center gap-1">
            <MapPin size={12} />
            {opportunity.location}
          </span>
        ) : null}
        <span className={`inline-flex items-center gap-1 ${deadlineClass}`}>
          <CalendarDays size={12} />
          {formatCompactDeadline(opportunity.deadline)}
        </span>
      </div>
    </Link>
  );
}

const OpportunityDetail: React.FC<OpportunityDetailProps> = ({
  opportunity,
  onBack,
  embedded = false,
}) => {
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [isBookmarkedState, setIsBookmarkedState] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const { success, error: showError } = useToast();
  const { userId, getToken } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { trackInteraction, scoreOpportunity, explainOpportunity, isPersonalized } =
    usePersonalization();

  // Full "why this matches you" breakdown, computed against the current
  // profile. Falls back to any score the backend already attached.
  const matchInsight = useMemo(
    () => (isPersonalized ? explainOpportunity(opportunity) : null),
    [isPersonalized, explainOpportunity, opportunity],
  );

  const currencySymbol = getCurrencySymbol(opportunity.currency);
  const applyUrl = normalizeExternalUrl(opportunity.applyUrl) ?? null;
  const matchPercentage = Math.round(
    Math.max(matchInsight?.score ?? 0, opportunity.match ?? 0),
  );
  const difficultyLabel = opportunity.difficulty ?? "Medium";
  const applicantsCopy = opportunity.applicants
    ? `${opportunity.applicants} applicants`
    : "Not published";
  // Only show real scraped content — never a synthesized filler paragraph.
  const fullDescription = normaliseVisibleText(
    opportunity.description || opportunity.summary,
  );
  const descriptionParagraphs = fullDescription
    .split(/\n{2,}/)
    .map(normaliseVisibleText)
    .filter(Boolean);
  const eligibilityItems = buildEligibilityItems(opportunity.eligibility);
  const requirements = normaliseVisibleList(opportunity.requirements);
  const benefits = normaliseVisibleList(opportunity.benefits);
  const applicationSteps = normaliseVisibleList(opportunity.applicationProcess);
  const expired = isOpportunityExpired(opportunity);
  const shareUrl = buildOpportunityShareUrl(opportunity.id);
  const shareText = buildOpportunityShareText(opportunity, shareUrl);
  const canonicalPath = `/opportunity/${encodeURIComponent(opportunity.id)}`;
  const canonicalUrl = toAbsoluteUrl(canonicalPath);
  const seoDescription = truncateSeoText(
    normaliseSeoText(opportunity.summary || opportunity.description) ||
      `${[opportunity.title, opportunity.organization]
        .filter(Boolean)
        .join(
          " from ",
        )}. See eligibility, benefits, deadline, and application link on Edutu.`,
  );
  const seoImage = opportunity.image || getDefaultSeoImage();
  const seoJsonLd = useMemo(() => {
    const deadlineIso = deadlineToIso(opportunity.deadline);
    const stipendValue =
      typeof opportunity.stipend === "number" &&
      Number.isFinite(opportunity.stipend)
        ? opportunity.stipend
        : null;

    return [
      {
        "@context": "https://schema.org",
        "@type": "EducationalOccupationalProgram",
        name: `${opportunity.title} | Edutu`,
        description: seoDescription,
        url: canonicalUrl,
        image: toAbsoluteUrl(seoImage),
        category: opportunity.category || "Opportunity",
        provider: {
          "@type": "Organization",
          name: opportunity.organization || "Edutu",
        },
        ...(deadlineIso
          ? { applicationDeadline: deadlineIso, validThrough: deadlineIso }
          : {}),
        ...(stipendValue !== null
          ? {
              offers: {
                "@type": "Offer",
                price: String(stipendValue),
                priceCurrency: opportunity.currency?.toUpperCase() || "USD",
              },
            }
          : {}),
        dateModified: getIsoDate(opportunity.lastUpdated),
        publisher: {
          "@type": "Organization",
          name: "Edutu",
          url: toAbsoluteUrl("/opportunities"),
          logo: {
            "@type": "ImageObject",
            url: getDefaultSeoImage(),
          },
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
          {
            "@type": "ListItem",
            position: 2,
            name: opportunity.title,
            item: canonicalUrl,
          },
        ],
      },
    ];
  }, [
    canonicalUrl,
    opportunity.category,
    opportunity.currency,
    opportunity.deadline,
    opportunity.lastUpdated,
    opportunity.organization,
    opportunity.stipend,
    opportunity.title,
    seoDescription,
    seoImage,
  ]);
  const authState = {
    from: {
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
    },
  };

  const [relatedSource, setRelatedSource] = useState<Opportunity[]>([]);

  useEffect(() => {
    if (opportunity?.id) {
      trackInteraction(opportunity, "view", { context: "detail" });
    }
    // Track once per opportunity page view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunity?.id]);

  useEffect(() => {
    let isActive = true;
    fetchOpportunities()
      .then((opportunities) => {
        if (isActive) {
          setRelatedSource(opportunities);
        }
      })
      .catch(() => undefined);
    return () => {
      isActive = false;
    };
  }, []);

  const relatedOpportunities = useMemo(() => {
    if (relatedSource.length === 0) return [];

    const currentCategory = opportunity.category?.trim().toLowerCase() ?? "";
    const currentTags = new Set(
      (opportunity.tags ?? []).map((tag) => tag.toLowerCase()),
    );

    return relatedSource
      .filter((item) => item.id !== opportunity.id)
      .filter((item) => !isOpportunityExpired(item))
      .map((item) => {
        let score = 0;
        const itemCategory = item.category?.trim().toLowerCase() ?? "";
        if (currentCategory && itemCategory === currentCategory) {
          score += 2;
        }
        const itemTags = (item.tags ?? []).map((tag) => tag.toLowerCase());
        for (const tag of itemTags) {
          if (currentTags.has(tag)) {
            score += 1;
          }
        }
        return { item, score };
      })
      .filter((entry) => entry.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          scoreOpportunity(b.item) - scoreOpportunity(a.item),
      )
      .slice(0, 4)
      .map((entry) => entry.item);
  }, [
    relatedSource,
    opportunity.id,
    opportunity.category,
    opportunity.tags,
    scoreOpportunity,
  ]);

  useEffect(() => {
    let isActive = true;

    const checkBookmark = async () => {
      if (!userId) return;

      try {
        const token = await getProductApiToken(getToken);
        let bookmarked: boolean;
        try {
          bookmarked = await isBookmarked(userId, opportunity.id, token);
        } catch (firstError) {
          // Only the common "not bookmarked" -> false path used to trigger a
          // forced token refresh + second request on every open. Retry with a
          // fresh token ONLY when the call actually failed on an expired token.
          if (!isInvalidOrExpiredTokenError(firstError)) throw firstError;
          const freshToken = await getProductApiToken(getToken, {
            forceRefresh: true,
          });
          bookmarked = await isBookmarked(userId, opportunity.id, freshToken);
        }

        if (isActive) {
          setIsBookmarkedState(bookmarked);
        }
      } catch (bookmarkError) {
        if (!isInvalidOrExpiredTokenError(bookmarkError)) {
          console.warn("Could not load bookmark status:", bookmarkError);
        }
      }
    };

    void checkBookmark();

    return () => {
      isActive = false;
    };
  }, [getToken, opportunity.id, userId]);

  const handleBack = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    onBack();
  };

  const handleBookmark = async () => {
    if (!userId) {
      navigate("/auth?mode=sign-in", { state: authState });
      return;
    }

    setBookmarkLoading(true);

    const runBookmarkRequest = async (forceRefresh = false) => {
      const token = await getProductApiToken(getToken, { forceRefresh });

      if (isBookmarkedState) {
        return removeBookmark(userId, opportunity.id, token);
      }

      return addBookmark(
        userId,
        {
          id: opportunity.id,
          title: opportunity.title,
          category: opportunity.category,
          deadline: opportunity.deadline,
          location: opportunity.location,
          match_percentage: opportunity.match,
        },
        token,
      );
    };

    try {
      let result = await runBookmarkRequest();

      if (!result) {
        result = await runBookmarkRequest(true);
      }

      if (isBookmarkedState && result) {
        setIsBookmarkedState(false);
        trackInteraction(opportunity, "bookmark", {
          value: -1,
          context: "unsave",
        });
        success("Bookmark removed");
      } else if (!isBookmarkedState && result) {
        setIsBookmarkedState(true);
        trackInteraction(opportunity, "bookmark");
        success("Opportunity saved");
      } else {
        showError("Sign in again to save this opportunity");
      }
    } catch (bookmarkError) {
      if (isInvalidOrExpiredTokenError(bookmarkError)) {
        try {
          const result = await runBookmarkRequest(true);

          if (isBookmarkedState && result) {
            setIsBookmarkedState(false);
            trackInteraction(opportunity, "bookmark", {
              value: -1,
              context: "unsave",
            });
            success("Bookmark removed");
            return;
          }

          if (!isBookmarkedState && result) {
            setIsBookmarkedState(true);
            trackInteraction(opportunity, "bookmark");
            success("Opportunity saved");
            return;
          }
        } catch {
          // Fall through to the user-facing error below.
        }
      }

      showError(
        bookmarkError instanceof Error
          ? bookmarkError.message
          : "Could not update bookmark",
      );
    } finally {
      setBookmarkLoading(false);
    }
  };

  const handleShare = async () => {
    setIsSharing(true);
    trackInteraction(opportunity, "share");
    try {
      const outcome = await shareOpportunity(opportunity);
      const toast = shareOutcomeMessage(outcome);
      if (toast) {
        (toast.type === "success" ? success : showError)(toast.message);
      }
      if (outcome !== "cancelled" && outcome !== "error") {
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      }
    } finally {
      setIsSharing(false);
    }
  };

  const handleApply = (event?: React.MouseEvent<HTMLAnchorElement>) => {
    if (!userId) {
      event?.preventDefault();
      navigate("/auth?mode=sign-in", { state: authState });
      return;
    }

    trackInteraction(opportunity, "apply");

    void (async () => {
      try {
        const token = await getProductApiToken(getToken, { forceRefresh: true });
        const tracked = await addApplication(
          userId,
          {
            id: opportunity.id,
            title: opportunity.title,
            category: opportunity.category,
          },
          { status: "draft" },
          token,
        );

        if (tracked) {
          success("Application started — added to your tracker");
        }
      } catch (applyError) {
        // Without this, a rejected addApplication (e.g. a non-UUID id the
        // backend refuses) became an unhandled rejection and the user got no
        // feedback while the apply link still opened. Surface it softly.
        console.warn("Could not add application to tracker:", applyError);
        showError(
          "Opened the application — but we couldn't add it to your tracker.",
        );
      }
    })();
  };

  const factItems = [
    {
      label: "Match",
      value: `${matchPercentage}%`,
      icon: Target,
    },
    {
      label: "Difficulty",
      value: difficultyLabel,
      icon: Gauge,
    },
    {
      label: "Deadline",
      value: formatCompactDeadline(opportunity.deadline),
      icon: CalendarDays,
    },
    ...(opportunity.location
      ? [
          {
            label: "Location",
            value: opportunity.location,
            icon: MapPin,
          },
        ]
      : []),
    ...(opportunity.applicants
      ? [
          {
            label: "Applicants",
            value: applicantsCopy,
            icon: UsersRound,
          },
        ]
      : []),
    ...(opportunity.stipend !== undefined && opportunity.stipend !== null
      ? [
          {
            label: "Funding",
            value: `${currencySymbol}${opportunity.stipend.toLocaleString()}`,
            icon: Wallet,
          },
        ]
      : []),
  ];

  const detailContent = (
    <>
      <Seo
        title={`${opportunity.title} | Edutu opportunities`}
        description={seoDescription}
        path={canonicalPath}
        image={seoImage}
        type="article"
        jsonLd={seoJsonLd}
      />
      {expired ? (
        <div className="mb-5 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <p className="font-semibold">This opportunity has closed</p>
          <p className="mt-1 text-danger/80">
            {opportunity.deadline
              ? `The deadline (${formatDeadline(opportunity.deadline)}) has passed.`
              : "The application deadline has passed."}{" "}
            The details below are kept for reference.
          </p>
        </div>
      ) : null}
      <section>
        <div className="mb-5 flex flex-wrap items-center gap-3 text-sm text-text-muted">
          {!embedded ? (
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex items-center gap-2 border-b border-transparent pb-1 font-medium text-text-secondary transition-colors hover:border-strong hover:text-brand"
            >
              Back to opportunities
            </button>
          ) : null}
          {!embedded ? (
            <>
              <span aria-hidden="true">•</span>
              <span>Public details</span>
              <span aria-hidden="true">•</span>
            </>
          ) : null}
          <span>{formatUpdatedAt(opportunity.lastUpdated)}</span>
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <article className="space-y-7">
            <header className="space-y-4 border-b border-subtle pb-6">
              <div className="relative overflow-hidden rounded-[28px] border border-subtle bg-surface-elevated shadow-soft">
                <ImageWithFallback
                  src={opportunity.image || seoImage}
                  alt={
                    opportunity.title
                      ? `${opportunity.title} opportunity image`
                      : "Opportunity image"
                  }
                  category={opportunity.category}
                  className="h-52 w-full object-cover sm:h-72"
                  fallbackClassName="h-52 w-full sm:h-72"
                />
              </div>
              <p className="text-sm font-semibold text-brand">
                Opportunity detail
              </p>
              <h1 className="max-w-3xl font-display text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
                {opportunity.title}
              </h1>
              {!embedded && opportunity.organization ? (
                <p className="max-w-3xl text-lg leading-8 text-text-secondary">
                  {opportunity.organization}
                </p>
              ) : null}
              <div className="max-w-3xl space-y-3 text-base leading-7 text-text-secondary">
                {descriptionParagraphs.length > 0 ? (
                  descriptionParagraphs.map((paragraph, index) => (
                    <p key={`${paragraph.slice(0, 40)}-${index}`}>
                      {paragraph}
                    </p>
                  ))
                ) : (
                  <p className="text-text-muted">
                    Full details are available on the official application
                    page.
                  </p>
                )}
              </div>
            </header>

            <section className="grid grid-cols-2 gap-x-5 gap-y-4 border-b border-subtle pb-6 sm:grid-cols-3">
              {factItems.map(({ label, value, icon: Icon }) => (
                <div
                  key={label}
                  title={`${label}: ${value}`}
                  aria-label={`${label}: ${value}`}
                  className="flex min-w-0 items-center gap-2.5"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                    <Icon size={17} />
                  </span>
                  <span className="sr-only">{label}</span>
                  <span className="min-w-0 truncate text-sm font-semibold leading-snug text-text-secondary">
                    {value}
                  </span>
                </div>
              ))}
            </section>

            {matchInsight &&
            (matchInsight.reasons.length > 0 ||
              matchInsight.risks.length > 0) ? (
              <WhyThisMatches
                score={matchInsight.score}
                reasons={matchInsight.reasons}
                risks={matchInsight.risks}
              />
            ) : null}

            {requirements.length > 0 ? (
              <section className="space-y-3">
                <h2 className="font-display text-xl font-semibold tracking-tight text-text-primary">
                  Requirements
                </h2>
                <ul className="space-y-3 text-base leading-7 text-text-secondary">
                  {requirements.map((item, index) => (
                    <li key={`${item}-${index}`} className="flex gap-3">
                      <span className="mt-3 h-1.5 w-1.5 rounded-full bg-brand" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {eligibilityItems.length > 0 ? (
              <section className="space-y-3">
                <h2 className="font-display text-xl font-semibold tracking-tight text-text-primary">
                  Eligibility
                </h2>
                <ul className="space-y-3 text-base leading-7 text-text-secondary">
                  {eligibilityItems.map((item, index) => (
                    <li key={`${item}-${index}`} className="flex gap-3">
                      <span className="mt-3 h-1.5 w-1.5 rounded-full bg-text-muted" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {benefits.length > 0 ? (
              <section className="space-y-3">
                <h2 className="font-display text-xl font-semibold tracking-tight text-text-primary">
                  Benefits
                </h2>
                <ul className="space-y-3 text-base leading-7 text-text-secondary">
                  {benefits.map((item, index) => (
                    <li key={`${item}-${index}`} className="flex gap-3">
                      <span className="mt-3 h-1.5 w-1.5 rounded-full bg-success" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {applicationSteps.length > 0 ? (
              <section className="space-y-3">
                <h2 className="font-display text-xl font-semibold tracking-tight text-text-primary">
                  Application process
                </h2>
                <ol className="space-y-3 text-base leading-7 text-text-secondary">
                  {applicationSteps.map((item, index) => (
                    <li key={`${item}-${index}`} className="flex gap-4">
                      <span className="mt-0.5 text-sm font-semibold text-brand">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            {opportunity.tags?.filter(
              (tag) => !PUBLIC_TAG_BLOCKLIST.has(tag.toLowerCase()),
            ).length ? (
              <section className="space-y-3 border-t border-subtle pt-6">
                <h2 className="font-display text-xl font-semibold tracking-tight text-text-primary">
                  Tags
                </h2>
                <div className="flex flex-wrap gap-2">
                  {opportunity.tags
                    .filter(
                      (tag) => !PUBLIC_TAG_BLOCKLIST.has(tag.toLowerCase()),
                    )
                    .map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center rounded-md border border-subtle px-3 py-1 text-sm text-text-secondary"
                      >
                        {tag}
                      </span>
                    ))}
                </div>
              </section>
            ) : null}
          </article>

          <aside className="space-y-5">
            <section
              className={`${embedded ? "hidden lg:block" : ""} space-y-4 rounded-2xl border border-subtle bg-surface-layer p-5 shadow-soft`}
            >
              <p className="text-xs font-semibold text-text-muted">
                Actions
              </p>
              <div className="flex flex-col gap-3">
                {applyUrl ? (
                  <a
                    href={applyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={handleApply}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white shadow-elevated transition-colors hover:bg-brand-700"
                  >
                    <ExternalLink size={16} />
                    Apply now
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="inline-flex flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-brand/60 px-4 py-3 text-sm font-semibold text-white"
                  >
                    <ExternalLink size={16} />
                    Application link unavailable
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleShare}
                  disabled={isSharing}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-subtle px-4 py-3 text-sm font-semibold text-text-secondary transition-colors hover:border-strong hover:text-text-primary disabled:cursor-wait disabled:opacity-50"
                >
                  <Share2 size={16} />
                  {shareCopied ? "Link copied" : "Share link"}
                </button>
                <button
                  type="button"
                  onClick={handleBookmark}
                  disabled={bookmarkLoading}
                  className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-50 ${
                    isBookmarkedState
                      ? "bg-danger text-white hover:bg-danger/90"
                      : "border border-subtle text-text-secondary hover:border-strong hover:text-text-primary"
                  }`}
                >
                  <Heart
                    size={16}
                    fill={isBookmarkedState ? "currentColor" : "none"}
                  />
                  {!userId
                    ? "Sign in to save"
                    : isBookmarkedState
                      ? "Saved"
                      : "Save"}
                </button>
              </div>
            </section>
          </aside>
        </div>
      </section>
      {relatedOpportunities.length > 0 ? (
        <section className="mt-10 border-t border-subtle pt-8">
          <h2 className="font-display text-xl font-semibold tracking-tight text-text-primary">
            Related opportunities
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {relatedOpportunities.map((related) => (
              <RelatedOpportunityCard
                key={related.id}
                opportunity={related}
                detailPath={`${embedded ? "/app" : ""}/opportunity/${related.id}`}
              />
            ))}
          </div>
        </section>
      ) : null}
      {embedded ? (
        <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-subtle bg-surface-layer/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 shadow-[0_-18px_40px_-28px_rgba(15,23,42,0.45)] backdrop-blur-xl lg:hidden">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            {applyUrl ? (
              <a
                href={applyUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleApply}
                className="inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl bg-brand px-4 text-sm font-semibold text-white shadow-elevated transition active:scale-[0.98]"
              >
                <ExternalLink size={17} />
                <span className="truncate">Apply now</span>
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="inline-flex h-12 min-w-0 flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-2xl bg-brand/60 px-4 text-sm font-semibold text-white"
              >
                <ExternalLink size={17} />
                <span className="truncate">Application unavailable</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleShare}
              disabled={isSharing}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-subtle bg-surface-layer text-text-secondary shadow-soft transition active:scale-[0.96] disabled:cursor-wait disabled:opacity-60"
              aria-label="Share opportunity"
            >
              <Share2 size={18} />
            </button>
            <button
              type="button"
              onClick={handleBookmark}
              disabled={bookmarkLoading}
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border transition active:scale-[0.96] disabled:cursor-wait disabled:opacity-60 ${
                isBookmarkedState
                  ? "border-danger bg-danger text-white"
                  : "border-subtle bg-surface-layer text-text-secondary shadow-soft"
              }`}
              aria-label={
                !userId
                  ? "Sign in to save opportunity"
                  : isBookmarkedState
                    ? "Remove saved opportunity"
                    : "Save opportunity"
              }
            >
              <Heart
                size={20}
                fill={isBookmarkedState ? "currentColor" : "none"}
              />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );

  return embedded ? (
    <main className="mx-auto w-full max-w-6xl px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:py-6 lg:px-8">
      {detailContent}
    </main>
  ) : (
    <PublicEditorialShell mainClassName="max-w-6xl py-5 sm:py-6">
      {detailContent}
    </PublicEditorialShell>
  );
};

export default OpportunityDetail;
