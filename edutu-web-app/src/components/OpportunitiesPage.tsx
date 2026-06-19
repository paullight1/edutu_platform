import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Calendar,
  MapPin,
  RefreshCw,
  Search,
  Share2,
  X,
} from "lucide-react";
import { useOpportunities } from "../hooks/useOpportunities";
import type { Opportunity } from "../types/opportunity";
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

function formatDeadline(deadline?: string | null): string {
  if (!deadline) return "Rolling";

  const parsed = new Date(deadline);
  if (Number.isNaN(parsed.getTime())) return "Rolling";

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
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
}: {
  opportunity: Opportunity;
  onShare: (opportunity: Opportunity) => void;
  isSharing: boolean;
  detailPath: string;
}) {
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
        {opportunity.match > 0 ? (
          <span className="absolute left-3 top-3 inline-flex items-center rounded-md bg-white/92 px-2.5 py-1 text-xs font-semibold text-slate-900 shadow-sm backdrop-blur dark:bg-slate-950/80 dark:text-white">
            {Math.round(opportunity.match)}% match
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

        <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-200 pt-3 text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <MapPin size={14} />
            {opportunity.location || "Remote"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Calendar size={14} />
            {formatDeadline(opportunity.deadline)}
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

interface OpportunitiesPageProps {
  embedded?: boolean;
}

export default function OpportunitiesPage({ embedded = false }: OpportunitiesPageProps) {
  const { data: opportunities, loading, error, refresh } = useOpportunities();
  const { success, error: showError } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [sharingId, setSharingId] = useState<string | null>(null);

  const filteredOpportunities = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return opportunities.filter((opportunity) => {
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
  }, [opportunities, searchTerm]);

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
                placeholder="Search by title, location, or keyword"
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
            </div>
          </div>
        </section>

        {error ? (
          <section className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-5 text-rose-900 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-100">
            <h2 className="text-lg font-semibold">
              Unable to load opportunities
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
              Try again
            </button>
          </section>
        ) : null}

        {loading ? (
          <section className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-4 sm:gap-5">
            {Array.from({ length: 6 }).map((_, index) => (
              <LoadingCard key={index} />
            ))}
          </section>
        ) : filteredOpportunities.length > 0 ? (
          <section className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-4 sm:gap-5">
            {filteredOpportunities.map((opportunity) => (
              <OpportunityCard
                key={opportunity.id}
                opportunity={opportunity}
                onShare={handleShareOpportunity}
                isSharing={sharingId === opportunity.id}
                detailPath={`${embedded ? "/app" : ""}/opportunity/${opportunity.id}`}
              />
            ))}
          </section>
        ) : (
          <section className="mt-5 rounded-lg border border-slate-200 bg-white p-8 text-center dark:border-white/10 dark:bg-slate-950">
            <h2 className="text-2xl font-semibold">No opportunities found</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              Try a broader search term or clear the current filter to see more
              listings.
            </p>
            <button
              type="button"
              onClick={clearSearch}
              className="mt-5 inline-flex items-center gap-2 rounded-md bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              Clear search
            </button>
          </section>
        )}
    </>
  );

  return (
    <>
      <Seo
        title="Updated scholarships, internships and grants | Edutu"
        description={seoDescription}
        path="/opportunities"
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
