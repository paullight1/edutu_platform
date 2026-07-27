import { useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Opportunity } from "../../types/opportunity";
import type { MatchResult } from "../../services/personalizedRecommendations";
import type { ClerkTokenGetter } from "../../lib/clerkToken";
import { getDeadlineBadge } from "../../services/deadlineUrgency";
import ImageWithFallback from "../ImageWithFallback";
import UrgencyPill from "./UrgencyPill";
import { MatchScoreBadge } from "./MatchInsights";
import { ImpressionTracker } from "./ImpressionTracker";

// Warm the detail-route chunk while the user hovers, mirroring the main grid.
function prefetchOpportunityDetail() {
  void import("../OpportunityDetail").catch(() => {});
}

/** Palette slice the rail card needs; supplied by the page's colour system. */
export type RailPalette = {
  chip: string;
};

/** Rail cards share the browse grid's plain white surface. */
const RAIL_CARD_SURFACE = "border-subtle bg-white hover:border-strong";

export type OpportunityRail = {
  key: string;
  title: string;
  subtitle?: string;
  Icon: LucideIcon;
  /** Accent classes for the header icon chip. */
  accent: string;
  items: Opportunity[];
};

function RailCard({
  opportunity,
  detailPath,
  palette,
  match,
  onOpen,
}: {
  opportunity: Opportunity;
  detailPath: string;
  palette: RailPalette;
  match?: MatchResult | null;
  onOpen?: (opportunity: Opportunity) => void;
}) {
  const deadlineBadge = getDeadlineBadge(opportunity.deadline);

  return (
    <article
      className={`group relative flex h-full w-[236px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border shadow-soft transition duration-200 hover:-translate-y-0.5 hover:shadow-elevated sm:w-[252px] ${RAIL_CARD_SURFACE}`}
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-surface-elevated">
        <ImageWithFallback
          src={opportunity.image}
          alt={`${opportunity.title} cover image`}
          category={opportunity.category}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
          fallbackClassName="flex h-full w-full items-center justify-center"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/50 via-transparent to-transparent" />
        <UrgencyPill
          badge={deadlineBadge}
          className="absolute left-2.5 top-2.5 shadow-sm backdrop-blur"
        />
      </div>
      <div className="relative flex flex-1 flex-col p-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          <MatchScoreBadge score={match?.score} minScore={40} />
          {opportunity.category ? (
            <span
              className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-2xs font-semibold ${palette.chip}`}
            >
              {opportunity.category}
            </span>
          ) : null}
        </div>
        <h3 className="line-clamp-2 font-display text-sm font-semibold leading-snug text-text-primary transition group-hover:text-brand">
          {opportunity.title}
        </h3>
        {opportunity.organization ? (
          <p className="mt-1 truncate text-xs text-text-muted">
            {opportunity.organization}
          </p>
        ) : null}
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

function Rail({
  rail,
  detailPathFor,
  getPalette,
  matchInsights,
  onOpen,
  getToken,
}: {
  rail: OpportunityRail;
  detailPathFor: (opportunity: Opportunity) => string;
  getPalette: (opportunity: Opportunity) => RailPalette;
  matchInsights?: Map<string, MatchResult> | null;
  onOpen?: (opportunity: Opportunity) => void;
  getToken?: ClerkTokenGetter;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const scrollByViewport = useCallback((direction: 1 | -1) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollBy({
      left: direction * scroller.clientWidth * 0.85,
      behavior: "smooth",
    });
  }, []);

  return (
    <section aria-label={rail.title}>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${rail.accent}`}
          >
            <rail.Icon size={16} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate font-display text-base font-semibold tracking-tight text-text-primary">
              {rail.title}
            </h2>
            {rail.subtitle ? (
              <p className="truncate text-xs text-text-muted">
                {rail.subtitle}
              </p>
            ) : null}
          </div>
        </div>
        {/* Arrow paging for pointer devices; touch users just swipe. */}
        <div className="hidden shrink-0 items-center gap-1.5 md:flex">
          <button
            type="button"
            onClick={() => scrollByViewport(-1)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-subtle bg-surface-layer text-text-secondary shadow-soft transition hover:bg-surface-elevated hover:text-text-primary"
            aria-label={`Scroll ${rail.title} backwards`}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => scrollByViewport(1)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-subtle bg-surface-layer text-text-secondary shadow-soft transition hover:bg-surface-elevated hover:text-text-primary"
            aria-label={`Scroll ${rail.title} forwards`}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div
        ref={scrollerRef}
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-4 pb-2 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 [&::-webkit-scrollbar]:hidden"
      >
        {rail.items.map((opportunity, index) => (
          <ImpressionTracker
            key={`${rail.key}-${opportunity.id}`}
            opportunityId={opportunity.id}
            surface="web_browse_rail"
            position={index}
            getToken={getToken}
            className="h-auto shrink-0"
          >
            <RailCard
              opportunity={opportunity}
              detailPath={detailPathFor(opportunity)}
              palette={getPalette(opportunity)}
              match={matchInsights?.get(opportunity.id) ?? null}
              onOpen={onOpen}
            />
          </ImpressionTracker>
        ))}
      </div>
    </section>
  );
}

/**
 * Horizontal discovery rails shown above the browse grid: each rail is a
 * snap-scroll strip of compact cards (swipe on touch, arrows on desktop).
 * Rails with fewer than `minItems` entries are dropped so a thin catalogue
 * never renders a lonely two-card strip.
 */
export default function OpportunityRails({
  rails,
  detailPathFor,
  getPalette,
  matchInsights,
  onOpen,
  getToken,
  minItems = 4,
}: {
  rails: OpportunityRail[];
  detailPathFor: (opportunity: Opportunity) => string;
  getPalette: (opportunity: Opportunity) => RailPalette;
  matchInsights?: Map<string, MatchResult> | null;
  onOpen?: (opportunity: Opportunity) => void;
  getToken?: ClerkTokenGetter;
  minItems?: number;
}) {
  const visibleRails = rails.filter((rail) => rail.items.length >= minItems);
  if (visibleRails.length === 0) return null;

  return (
    <div className="mb-7 space-y-6">
      {visibleRails.map((rail) => (
        <Rail
          key={rail.key}
          rail={rail}
          detailPathFor={detailPathFor}
          getPalette={getPalette}
          matchInsights={matchInsights}
          onOpen={onOpen}
          getToken={getToken}
        />
      ))}
    </div>
  );
}
