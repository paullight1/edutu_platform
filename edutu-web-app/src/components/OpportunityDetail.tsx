import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ExternalLink, Heart, Share2 } from "lucide-react";
import { useAuth } from "@clerk/clerk-react";
import { useToast } from "./ui/ToastProvider";
import type { Opportunity } from "../types/opportunity";
import {
  addBookmark,
  removeBookmark,
  isBookmarked,
} from "../services/bookmarks";
import { addApplication } from "../services/applications";
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

function getCurrencyLabel(currency?: string | null): string {
  switch (currency?.toUpperCase()) {
    case "NGN":
      return "Nigerian Naira";
    case "GBP":
      return "British Pound";
    case "EUR":
      return "Euro";
    default:
      return "US Dollar";
  }
}

function formatDeadline(deadline?: string | null): string {
  if (!deadline) return "No deadline listed";
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return "No deadline listed";
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatUpdatedAt(value?: string | null): string {
  if (!value) return "Updated recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Updated recently";

  return `Updated ${date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
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
      return formattedValue ? `${formatEligibilityKey(key)}: ${formattedValue}` : "";
    })
    .filter(Boolean);
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
  const currencyLabel = getCurrencyLabel(opportunity.currency);
  const applyUrl =
    opportunity.applyUrl && opportunity.applyUrl.length > 0
      ? opportunity.applyUrl
      : null;
  const matchPercentage = Math.round(opportunity.match ?? 0);
  const difficultyLabel = opportunity.difficulty ?? "Medium";
  const applicantsCopy = opportunity.applicants
    ? `${opportunity.applicants} applicants`
    : "Applicant count not published";
  const fullDescription =
    normaliseVisibleText(opportunity.description || opportunity.summary) ||
    `${opportunity.title} is a ${opportunity.category.toLowerCase()} opportunity from ${opportunity.organization}. Review the public details, deadline, location, eligibility notes, benefits, and application link before applying.`;
  const descriptionParagraphs = fullDescription
    .split(/\n{2,}/)
    .map(normaliseVisibleText)
    .filter(Boolean);
  const eligibilityItems = buildEligibilityItems(opportunity.eligibility);
  const requirements = normaliseVisibleList(opportunity.requirements);
  const displayedRequirements =
    requirements.length > 0
      ? requirements
      : [
          ...eligibilityItems,
          "Review the official application page for final eligibility rules before applying.",
          "Prepare a current CV or resume, academic or professional records, and any supporting documents requested by the organizer.",
        ];
  const benefits = normaliseVisibleList(opportunity.benefits);
  const displayedBenefits =
    benefits.length > 0
      ? benefits
      : [
          opportunity.stipend !== undefined && opportunity.stipend !== null
            ? `${currencySymbol}${opportunity.stipend.toLocaleString()} funding support${opportunity.currency ? ` in ${currencyLabel}` : ""}.`
            : "Funding, training, mentorship, networking, or program access may be available depending on the organizer's official terms.",
          "A structured opportunity to build experience, credentials, network, or portfolio value tied to this program.",
          "Official benefits should be confirmed on the organizer application page before submission.",
        ];
  const applicationSteps = normaliseVisibleList(opportunity.applicationProcess);
  const displayedApplicationSteps =
    applicationSteps.length > 0
      ? applicationSteps
      : [
          userId
            ? "Use the apply button to open the official organizer application page."
            : "Sign in to Edutu to continue to the official application page.",
          "Review the deadline, eligibility notes, and required documents before starting the application.",
          "Submit directly through the organizer page, then save or track the opportunity in Edutu.",
        ];
  const shareUrl = buildOpportunityShareUrl(opportunity.id);
  const shareText = buildOpportunityShareText(opportunity, shareUrl);
  const canonicalPath = `/opportunity/${encodeURIComponent(opportunity.id)}`;
  const canonicalUrl = toAbsoluteUrl(canonicalPath);
  const seoDescription = truncateSeoText(
    normaliseSeoText(opportunity.summary || opportunity.description) ||
      `${opportunity.title} from ${opportunity.organization}. See eligibility, benefits, deadline, and application link on Edutu.`,
  );
  const seoImage = opportunity.image || getDefaultSeoImage();
  const seoJsonLd = useMemo(
    () => [
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: `${opportunity.title} | Edutu`,
        url: canonicalUrl,
        description: seoDescription,
        dateModified: getIsoDate(opportunity.lastUpdated),
        mainEntity: {
          "@type": "Thing",
          name: opportunity.title,
          description: seoDescription,
          category: opportunity.category || "Opportunity",
          url: canonicalUrl,
          image: toAbsoluteUrl(seoImage),
          provider: {
            "@type": "Organization",
            name: opportunity.organization || "Edutu",
          },
        },
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
    ],
    [
      canonicalUrl,
      opportunity.category,
      opportunity.lastUpdated,
      opportunity.organization,
      opportunity.title,
      seoDescription,
      seoImage,
    ],
  );
  const authState = {
    from: {
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
    },
  };

  useEffect(() => {
    let isActive = true;

    const checkBookmark = async () => {
      if (!userId) return;
      const token = await getToken().catch(() => null);
      const bookmarked = await isBookmarked(userId, opportunity.id, token);
      if (isActive) {
        setIsBookmarkedState(bookmarked);
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
    const token = await getToken().catch(() => null);

    if (isBookmarkedState) {
      const removed = await removeBookmark(userId, opportunity.id, token);
      if (removed) {
        setIsBookmarkedState(false);
        success("Bookmark removed");
      }
    } else {
      const added = await addBookmark(
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

      if (added) {
        setIsBookmarkedState(true);
        success("Opportunity saved");
      }
    }

    setBookmarkLoading(false);
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

  const handleApply = async () => {
    if (!applyUrl) return;

    if (!userId) {
      navigate("/auth?mode=sign-in", { state: authState });
      return;
    }

    const token = await getToken().catch(() => null);
    const tracked = await addApplication(
      userId,
      {
        id: opportunity.id,
        title: opportunity.title,
        category: opportunity.category,
      },
      undefined,
      token,
    );

    if (tracked) {
      success("Application added to your tracker");
    } else {
      showError("Application link opened, but tracking could not be updated");
    }

    window.open(applyUrl, "_blank", "noopener,noreferrer");
  };

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
      <section>
        <div className="mb-5 flex flex-wrap items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-2 border-b border-transparent pb-1 font-medium text-slate-700 transition-colors hover:border-slate-300 hover:text-brand-600 dark:text-slate-200 dark:hover:border-white/20"
          >
            <ArrowLeft size={16} />
            Back to opportunities
          </button>
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

            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {[
                ["Match", `${matchPercentage}%`],
                ["Difficulty", difficultyLabel],
                ["Deadline", formatDeadline(opportunity.deadline)],
                ["Location", opportunity.location || "Worldwide"],
                ["Applicants", applicantsCopy],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/5 sm:p-4"
                >
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                    {label}
                  </p>
                  <p className="mt-1.5 break-words text-sm font-black leading-snug text-slate-950 dark:text-white sm:text-base">
                    {value}
                  </p>
                </div>
              ))}
              {opportunity.stipend !== undefined &&
              opportunity.stipend !== null ? (
                <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/5 sm:p-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                    Funding
                  </p>
                  <p className="mt-1.5 break-words text-sm font-black leading-snug text-slate-950 dark:text-white sm:text-base">
                    {currencySymbol}
                    {opportunity.stipend.toLocaleString()}
                  </p>
                  {opportunity.currency ? (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {currencyLabel}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
                Requirements
              </h2>
              <ul className="space-y-3 text-base leading-7 text-slate-600 dark:text-slate-300">
                {displayedRequirements.map((item, index) => (
                  <li key={`${item}-${index}`} className="flex gap-3">
                    <span className="mt-3 h-1.5 w-1.5 rounded-full bg-brand-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
                Benefits
              </h2>
              <ul className="space-y-3 text-base leading-7 text-slate-600 dark:text-slate-300">
                {displayedBenefits.map((item, index) => (
                  <li key={`${item}-${index}`} className="flex gap-3">
                    <span className="mt-3 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
                Application process
              </h2>
              <ol className="space-y-3 text-base leading-7 text-slate-600 dark:text-slate-300">
                {displayedApplicationSteps.map((item, index) => (
                  <li key={`${item}-${index}`} className="flex gap-4">
                    <span className="mt-0.5 text-sm font-semibold text-brand-600 dark:text-brand-300">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            </section>

            {opportunity.tags?.filter((tag) => !PUBLIC_TAG_BLOCKLIST.has(tag.toLowerCase())).length ? (
              <section className="space-y-3 border-t border-slate-200 pt-6 dark:border-white/10">
                <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
                  Tags
                </h2>
                <div className="flex flex-wrap gap-2">
                  {opportunity.tags
                    .filter((tag) => !PUBLIC_TAG_BLOCKLIST.has(tag.toLowerCase()))
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
            <section className={`${embedded ? "hidden lg:block" : ""} space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-950`}>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Actions
              </p>
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={!applyUrl}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                >
                  <ExternalLink size={16} />
                  {applyUrl
                    ? userId
                      ? "Apply now"
                      : "Sign in to apply"
                    : "Application link unavailable"}
                </button>
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
      {embedded ? (
        <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-slate-200 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 shadow-[0_-18px_40px_-28px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/95 lg:hidden">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <button
              type="button"
              onClick={handleApply}
              disabled={!applyUrl}
              className="inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950"
            >
              <ExternalLink size={17} />
              <span className="truncate">
                {applyUrl
                  ? userId
                    ? "Apply now"
                    : "Sign in to apply"
                  : "Application unavailable"}
              </span>
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
