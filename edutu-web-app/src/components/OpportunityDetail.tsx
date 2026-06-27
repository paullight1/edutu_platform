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
  buildOpportunityShareFileName,
  buildOpportunityShareText,
  buildOpportunityShareUrl,
  buildWhatsAppShareUrl,
  downloadBlob,
  fetchOpportunityShareImageBlob,
} from "../services/opportunityShare";
import PublicEditorialShell from "./PublicEditorialShell";
import Seo from "./Seo";
import ImageWithFallback from "./ImageWithFallback";
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
    daysLeft !== null && daysLeft <= 7
      ? "font-semibold text-amber-600 dark:text-amber-400"
      : "";

  return (
    <Link
      to={detailPath}
      className="group relative flex h-full flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft dark:border-white/10 dark:bg-slate-950"
    >
      <span className="inline-flex w-fit items-center rounded-md border border-brand-500/20 bg-brand-500/10 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:text-brand-300">
        {opportunity.category || "General"}
      </span>
      <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-slate-950 transition group-hover:text-brand-600 dark:text-white dark:group-hover:text-brand-300">
        {opportunity.title}
      </h3>
      {opportunity.organization ? (
        <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
          {opportunity.organization}
        </p>
      ) : null}
      <div className="mt-auto flex flex-wrap gap-3 pt-3 text-xs text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1">
          <MapPin size={12} />
          {opportunity.location || "Remote"}
        </span>
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

  const currencySymbol = getCurrencySymbol(opportunity.currency);
  const applyUrl = normalizeExternalUrl(opportunity.applyUrl) ?? null;
  const matchPercentage = Math.round(opportunity.match ?? 0);
  const difficultyLabel = opportunity.difficulty ?? "Medium";
  const applicantsCopy = opportunity.applicants
    ? `${opportunity.applicants} applicants`
    : "Not published";
  const fullDescription =
    normaliseVisibleText(opportunity.description || opportunity.summary) ||
    `${opportunity.title} is a ${opportunity.category.toLowerCase()} opportunity from ${opportunity.organization}. Review the public details, deadline, location, eligibility notes, benefits, and application link before applying.`;
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
      `${opportunity.title} from ${opportunity.organization}. See eligibility, benefits, deadline, and application link on Edutu.`,
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
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((entry) => entry.item);
  }, [relatedSource, opportunity.id, opportunity.category, opportunity.tags]);

  useEffect(() => {
    let isActive = true;

    const checkBookmark = async () => {
      if (!userId) return;

      try {
        let token = await getProductApiToken(getToken);
        let bookmarked = await isBookmarked(userId, opportunity.id, token);

        if (!bookmarked) {
          token = await getProductApiToken(getToken, { forceRefresh: true });
          bookmarked = await isBookmarked(userId, opportunity.id, token);
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
        success("Bookmark removed");
      } else if (!isBookmarkedState && result) {
        setIsBookmarkedState(true);
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
            success("Bookmark removed");
            return;
          }

          if (!isBookmarkedState && result) {
            setIsBookmarkedState(true);
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

    try {
      const shareImage = await fetchOpportunityShareImageBlob(opportunity.id);
      const effectiveShareText = shareImage?.shareText || shareText;
      const effectiveShareUrl = shareImage?.shareUrl || shareUrl;
      const shareData = {
        title: opportunity.title,
        text: effectiveShareText,
        url: effectiveShareUrl,
      };

      if (shareImage?.blob) {
        const imageExtension = shareImage.card.format === "svg" ? "svg" : "png";
        const imageType =
          shareImage.blob.type ||
          (imageExtension === "svg" ? "image/svg+xml" : "image/png");
        const imageFile = new File(
          [shareImage.blob],
          buildOpportunityShareFileName(opportunity, imageExtension),
          { type: imageType },
        );

        if (navigator.share && navigator.canShare?.({ files: [imageFile] })) {
          await navigator.share({
            ...shareData,
            files: [imageFile],
          });
          setShareCopied(true);
          success("Share image ready");
          setTimeout(() => setShareCopied(false), 2000);
          return;
        }

        if (navigator.share) {
          await navigator.share(shareData);
          downloadBlob(
            shareImage.blob,
            buildOpportunityShareFileName(opportunity, imageExtension),
          );
          setShareCopied(true);
          success("Shared the link and downloaded the image");
          setTimeout(() => setShareCopied(false), 2000);
          return;
        }

        downloadBlob(
          shareImage.blob,
          buildOpportunityShareFileName(opportunity, imageExtension),
        );
      }

      if (navigator.share) {
        await navigator.share(shareData);
        setShareCopied(true);
        success("Share link ready");
      } else {
        try {
          await navigator.clipboard.writeText(
            `${effectiveShareText}\n\n${effectiveShareUrl}`,
          );
          success("Share link copied");
        } catch {
          window.open(
            buildWhatsAppShareUrl(effectiveShareText),
            "_blank",
            "noopener,noreferrer",
          );
          success("Opened WhatsApp share");
        }
        setShareCopied(true);
      }

      setTimeout(() => setShareCopied(false), 2000);
    } catch (error) {
      if (
        error instanceof DOMException &&
        (error.name === "AbortError" || error.name === "NotAllowedError")
      ) {
        return;
      }

      try {
        await navigator.clipboard.writeText(shareUrl);
        success("Link copied to clipboard");
      } catch {
        showError("Could not share this opportunity");
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

    void (async () => {
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
    {
      label: "Location",
      value: opportunity.location || "Worldwide",
      icon: MapPin,
    },
    {
      label: "Applicants",
      value: applicantsCopy,
      icon: UsersRound,
    },
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
        <div className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-100">
          <p className="font-semibold">This opportunity has closed</p>
          <p className="mt-1 text-rose-800/80 dark:text-rose-100/80">
            {opportunity.deadline
              ? `The deadline (${formatDeadline(opportunity.deadline)}) has passed.`
              : "The application deadline has passed."}{" "}
            The details below are kept for reference.
          </p>
        </div>
      ) : null}
      <section>
        <div className="mb-5 flex flex-wrap items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
          {!embedded ? (
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex items-center gap-2 border-b border-transparent pb-1 font-medium text-slate-700 transition-colors hover:border-slate-300 hover:text-brand-600 dark:text-slate-200 dark:hover:border-white/20"
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
            <header className="space-y-4 border-b border-slate-200 pb-6 dark:border-white/10">
              <div className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-slate-100 shadow-sm dark:border-white/10 dark:bg-slate-900">
                <ImageWithFallback
                  src={opportunity.image || seoImage}
                  alt={
                    opportunity.title
                      ? `${opportunity.title} opportunity image`
                      : "Opportunity image"
                  }
                  className="h-52 w-full object-cover sm:h-72"
                  fallbackClassName="h-52 w-full sm:h-72"
                />
              </div>
              <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">
                Opportunity detail
              </p>
              <h1 className="max-w-3xl text-3xl font-semibold text-slate-950 sm:text-4xl dark:text-white">
                {opportunity.title}
              </h1>
              {!embedded ? (
                <p className="max-w-3xl text-lg leading-8 text-slate-600 dark:text-slate-300">
                  {opportunity.organization}
                </p>
              ) : null}
              <div className="max-w-3xl space-y-3 text-base leading-7 text-slate-600 dark:text-slate-300">
                {descriptionParagraphs.map((paragraph, index) => (
                  <p key={`${paragraph.slice(0, 40)}-${index}`}>{paragraph}</p>
                ))}
              </div>
            </header>

            <section className="grid grid-cols-2 gap-x-5 gap-y-4 border-b border-slate-200 pb-6 dark:border-white/10 sm:grid-cols-3">
              {factItems.map(({ label, value, icon: Icon }) => (
                <div
                  key={label}
                  title={`${label}: ${value}`}
                  aria-label={`${label}: ${value}`}
                  className="flex min-w-0 items-center gap-2.5"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
                    <Icon size={17} />
                  </span>
                  <span className="sr-only">{label}</span>
                  <span className="min-w-0 truncate text-sm font-semibold leading-snug text-slate-700 dark:text-slate-200">
                    {value}
                  </span>
                </div>
              ))}
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
                Requirements
              </h2>
              {requirements.length > 0 ? (
                <ul className="space-y-3 text-base leading-7 text-slate-600 dark:text-slate-300">
                  {requirements.map((item, index) => (
                    <li key={`${item}-${index}`} className="flex gap-3">
                      <span className="mt-3 h-1.5 w-1.5 rounded-full bg-brand-500" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                  <p className="font-medium text-slate-600 dark:text-slate-300">
                    Requirements not provided
                  </p>
                  <p className="mt-1">
                    Eligibility details aren’t published for this opportunity.{" "}
                    {applyUrl ? (
                      <a
                        href={applyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-brand-600 underline-offset-2 hover:underline dark:text-brand-300"
                      >
                        Check the official application page
                      </a>
                    ) : (
                      "Check the official organizer page when available."
                    )}
                  </p>
                </div>
              )}
            </section>

            {eligibilityItems.length > 0 ? (
              <section className="space-y-3">
                <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
                  Eligibility
                </h2>
                <ul className="space-y-3 text-base leading-7 text-slate-600 dark:text-slate-300">
                  {eligibilityItems.map((item, index) => (
                    <li key={`${item}-${index}`} className="flex gap-3">
                      <span className="mt-3 h-1.5 w-1.5 rounded-full bg-slate-400" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
                Benefits
              </h2>
              {benefits.length > 0 ? (
                <ul className="space-y-3 text-base leading-7 text-slate-600 dark:text-slate-300">
                  {benefits.map((item, index) => (
                    <li key={`${item}-${index}`} className="flex gap-3">
                      <span className="mt-3 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                  <p className="font-medium text-slate-600 dark:text-slate-300">
                    Benefits not listed
                  </p>
                  <p className="mt-1">
                    Benefits aren’t published for this opportunity.{" "}
                    {applyUrl ? (
                      <a
                        href={applyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-brand-600 underline-offset-2 hover:underline dark:text-brand-300"
                      >
                        Confirm what’s offered on the official application page
                      </a>
                    ) : (
                      "Confirm what’s offered on the official organizer page when available."
                    )}
                  </p>
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
                Application process
              </h2>
              {applicationSteps.length > 0 ? (
                <ol className="space-y-3 text-base leading-7 text-slate-600 dark:text-slate-300">
                  {applicationSteps.map((item, index) => (
                    <li key={`${item}-${index}`} className="flex gap-4">
                      <span className="mt-0.5 text-sm font-semibold text-brand-600 dark:text-brand-300">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                  <p className="font-medium text-slate-600 dark:text-slate-300">
                    Application steps not published
                  </p>
                  <p className="mt-1">
                    {applyUrl ? (
                      <a
                        href={applyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-brand-600 underline-offset-2 hover:underline dark:text-brand-300"
                      >
                        Open the official application page
                      </a>
                    ) : (
                      "Open the official application page when available"
                    )}{" "}
                    to follow the organizer’s steps.
                  </p>
                </div>
              )}
            </section>

            {opportunity.tags?.filter(
              (tag) => !PUBLIC_TAG_BLOCKLIST.has(tag.toLowerCase()),
            ).length ? (
              <section className="space-y-3 border-t border-slate-200 pt-6 dark:border-white/10">
                <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
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
                        className="inline-flex items-center rounded-md border border-slate-200 px-3 py-1 text-sm text-slate-600 dark:border-white/10 dark:text-slate-300"
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
              className={`${embedded ? "hidden lg:block" : ""} space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-950`}
            >
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Actions
              </p>
              <div className="flex flex-col gap-3">
                {applyUrl ? (
                  <a
                    href={applyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={handleApply}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                  >
                    <ExternalLink size={16} />
                    Apply now
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="inline-flex flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-3 text-sm font-semibold text-white opacity-50 dark:bg-white dark:text-slate-950"
                  >
                    <ExternalLink size={16} />
                    Application link unavailable
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleShare}
                  disabled={isSharing}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:text-slate-950 disabled:cursor-wait disabled:opacity-50 dark:border-white/15 dark:text-slate-200 dark:hover:text-white"
                >
                  <Share2 size={16} />
                  {shareCopied ? "Link copied" : "Share link"}
                </button>
                <button
                  type="button"
                  onClick={handleBookmark}
                  disabled={bookmarkLoading}
                  className={`inline-flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-50 ${
                    isBookmarkedState
                      ? "bg-rose-500 text-white hover:bg-rose-600"
                      : "border border-slate-300 text-slate-700 hover:border-slate-400 hover:text-slate-950 dark:border-white/15 dark:text-slate-200 dark:hover:text-white"
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
        <section className="mt-10 border-t border-slate-200 pt-8 dark:border-white/10">
          <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
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
        <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-slate-200 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 shadow-[0_-18px_40px_-28px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/95 lg:hidden">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            {applyUrl ? (
              <a
                href={applyUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleApply}
                className="inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition active:scale-[0.98] dark:bg-white dark:text-slate-950"
              >
                <ExternalLink size={17} />
                <span className="truncate">Apply now</span>
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="inline-flex h-12 min-w-0 flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white opacity-50 dark:bg-white dark:text-slate-950"
              >
                <ExternalLink size={17} />
                <span className="truncate">Application unavailable</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleShare}
              disabled={isSharing}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition active:scale-[0.96] disabled:cursor-wait disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
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
                  ? "border-rose-500 bg-rose-500 text-white"
                  : "border-slate-200 bg-white text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
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

  if (embedded) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:py-6 lg:px-8">
        {detailContent}
      </main>
    );
  }

  return (
    <PublicEditorialShell mainClassName="max-w-6xl py-5 sm:py-6">
      {detailContent}
    </PublicEditorialShell>
  );
};

export default OpportunityDetail;
