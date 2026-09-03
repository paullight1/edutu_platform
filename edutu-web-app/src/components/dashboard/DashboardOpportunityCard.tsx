import React from "react";
import { ChevronRight } from "lucide-react";
import { usePersonalization } from "../../hooks/usePersonalization";
import type { Opportunity } from "../../types/opportunity";
import {
  getDeadlineBadge,
  urgencyTextClasses,
} from "../../services/deadlineUrgency";
import { MatchScoreBadge, TopMatchReason } from "../opportunity/MatchInsights";
import UrgencyPill from "../opportunity/UrgencyPill";
import ImageWithFallback from "../ImageWithFallback";

type DashboardOpportunityCardVariant =
  | "carousel"
  | "mobileGrid"
  | "grid"
  | "list";

interface DashboardOpportunityCardProps {
  opportunity: Opportunity;
  variant: DashboardOpportunityCardVariant;
  isBookmarked: boolean;
  isDarkMode: boolean;
  onOpen: (opportunity: Opportunity) => void;
  onToggleBookmark: (opportunity: Opportunity, event: React.MouseEvent) => void;
  onShare: (opportunity: Opportunity, event: React.MouseEvent) => void;
  statusSlot?: React.ReactNode;
  metaSlot?: React.ReactNode;
  actionSlot?: React.ReactNode;
}

function formatOpportunityDeadline(deadline?: string | null) {
  // No fabricated "Ongoing" label — when there is no deadline, show nothing.
  return deadline
    ? new Date(deadline).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "";
}

// NOTE: isBookmarked/isDarkMode/onToggleBookmark/onShare are still part of the
// props contract and still passed by every call site, but no variant renders a
// bookmark or share button any more, so nothing consumes them here. Left in
// place rather than ripped out, so re-adding the buttons is just wiring.
const DashboardOpportunityCard = React.memo(function DashboardOpportunityCard({
  opportunity,
  variant,
  onOpen,
  statusSlot,
  metaSlot,
  actionSlot,
}: DashboardOpportunityCardProps) {
  const openLabel = `Open ${opportunity?.title ?? "opportunity"}`;

  const { explainOpportunity, isPersonalized } = usePersonalization();
  const match = isPersonalized ? explainOpportunity(opportunity) : null;
  const deadlineBadge = getDeadlineBadge(opportunity.deadline);
  const deadlineText =
    deadlineBadge.isUrgent ||
    deadlineBadge.level === "today" ||
    deadlineBadge.level === "tomorrow"
      ? deadlineBadge.shortLabel
      : formatOpportunityDeadline(opportunity.deadline);
  const deadlineClass = urgencyTextClasses(deadlineBadge.level);

  const journeyStatusAndMeta =
    statusSlot || metaSlot ? (
      <div className="mt-2 space-y-2">
        {statusSlot ? <div className="flex flex-wrap gap-2">{statusSlot}</div> : null}
        {metaSlot}
      </div>
    ) : null;
  const journeyActions = actionSlot ? (
    <div
      className="pointer-events-auto relative z-20 flex flex-wrap gap-2"
      onClick={(event) => event.stopPropagation()}
    >
      {actionSlot}
    </div>
  ) : null;

  if (variant === "list") {
    return (
      <article
        className={`group relative grid w-full grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 border-b border-subtle p-3 text-left transition-colors last:border-b-0 hover:bg-surface-elevated`}
      >
        <button
          type="button"
          onClick={() => onOpen(opportunity)}
          className="absolute inset-0 z-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          aria-label={openLabel}
        >
          <span className="sr-only">{openLabel}</span>
        </button>
        <div className="pointer-events-none relative z-10 h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-surface-elevated">
          <ImageWithFallback
            src={opportunity.image}
            fallbackSrc={opportunity.imageFallback}
            alt={
              opportunity.title
                ? `${opportunity.title} opportunity image`
                : "Opportunity image"
            }
            className="w-full h-full object-cover"
            fallbackClassName="w-full h-full"
            category={opportunity.category}
          />
        </div>
        <div className="pointer-events-none relative z-10 flex-1 min-w-0">
          {opportunity.category ? (
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded-md bg-brand-500/10 px-2 py-0.5 text-xs font-semibold text-brand-600">
                {opportunity.category}
              </span>
            </div>
          ) : null}
          <h3 className="text-sm font-semibold text-text-primary transition-colors line-clamp-1 group-hover:text-brand">
            {opportunity.title}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-text-muted">
            {opportunity.location ? <span>{opportunity.location}</span> : null}
            <span className={deadlineClass}>{deadlineText}</span>
            {match && match.score >= 40 ? (
              <MatchScoreBadge score={match.score} minScore={40} />
            ) : null}
          </div>
          {journeyStatusAndMeta}
        </div>
        <div className="pointer-events-auto relative z-10 flex shrink-0 items-center gap-2">
          {journeyActions}
          <ChevronRight
            className="pointer-events-none text-text-muted group-hover:text-brand transition-colors"
            size={18}
          />
        </div>
      </article>
    );
  }

  if (variant === "carousel") {
    return (
      <article
        data-density="compact"
        className={`mobile-personalized-card relative flex h-[168px] w-[60vw] max-w-[238px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-subtle bg-white text-left transition active:scale-[0.98]`}
      >
        <button
          type="button"
          onClick={() => onOpen(opportunity)}
          className="absolute inset-0 z-0 cursor-pointer"
          aria-label={openLabel}
        >
          <span className="sr-only">{openLabel}</span>
        </button>
        <div className="pointer-events-none relative z-10 h-[72px] shrink-0 overflow-hidden bg-surface-elevated">
          <ImageWithFallback
            src={opportunity.image}
            fallbackSrc={opportunity.imageFallback}
            alt={
              opportunity.title
                ? `${opportunity.title} opportunity image`
                : "Opportunity image"
            }
            className="h-full w-full object-cover"
            fallbackClassName="h-full w-full"
            category={opportunity.category}
          />
          {opportunity.category ? (
            <span className="absolute left-2 top-2 max-w-[calc(100%-1rem)] truncate rounded-full bg-white/90 px-2 py-0.5 text-2xs font-semibold text-brand-600 backdrop-blur">
              {opportunity.category}
            </span>
          ) : null}
          <UrgencyPill
            badge={deadlineBadge}
            compact
            className="absolute right-2 top-2 !px-1.5 !py-0.5 shadow-sm backdrop-blur"
          />
        </div>
        <div className="pointer-events-none relative z-10 flex min-h-0 flex-1 flex-col p-2.5">
          <h4 className="text-sm font-semibold leading-snug text-text-primary line-clamp-2">
            {opportunity.title}
          </h4>
          {match && match.score >= 40 ? (
            <TopMatchReason reason={match.reasons[0]} />
          ) : null}
          {journeyStatusAndMeta}
          {journeyActions ? <div className="mt-2">{journeyActions}</div> : null}
          <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-2xs font-semibold text-text-muted">
            {opportunity.location ? (
              <span className="truncate">{opportunity.location}</span>
            ) : (
              <span />
            )}
            <span className={`shrink-0 ${deadlineClass}`}>{deadlineText}</span>
          </div>
        </div>
      </article>
    );
  }

  if (variant === "mobileGrid") {
    return (
      <article
        data-density="compact"
        className={`mobile-more-opportunity-card relative flex min-h-[172px] min-w-0 flex-col overflow-hidden rounded-2xl border border-subtle bg-white text-left shadow-sm transition active:scale-[0.98]`}
        style={{ width: "100%", minWidth: 0, maxWidth: "100%" }}
      >
        <button
          type="button"
          onClick={() => onOpen(opportunity)}
          className="absolute inset-0 z-0 cursor-pointer"
          aria-label={openLabel}
        >
          <span className="sr-only">{openLabel}</span>
        </button>
        <div className="mobile-more-opportunity-media pointer-events-none relative z-10 h-[68px] w-full shrink-0 overflow-hidden bg-surface-elevated">
          <ImageWithFallback
            src={opportunity.image}
            fallbackSrc={opportunity.imageFallback}
            alt={
              opportunity.title
                ? `${opportunity.title} opportunity image`
                : "Opportunity image"
            }
            className="h-full w-full object-cover"
            fallbackClassName="h-full w-full"
            category={opportunity.category}
          />
          <UrgencyPill
            badge={deadlineBadge}
            compact
            className="absolute right-1.5 top-1.5 !px-1.5 !py-0.5 text-2xs shadow-sm backdrop-blur"
          />
        </div>
        <div className="pointer-events-none relative z-10 flex min-h-0 min-w-0 flex-1 flex-col p-2.5">
          <div className="mb-1 flex flex-wrap items-center gap-1">
            {opportunity.category ? (
              <span className="block truncate text-2xs font-semibold leading-4 text-brand-600">
                {opportunity.category}
              </span>
            ) : null}
            {match && match.score >= 40 ? (
              <MatchScoreBadge
                score={match.score}
                minScore={40}
                className="!px-1.5 !py-0 !text-2xs"
              />
            ) : null}
          </div>
          <span className="line-clamp-3 block min-w-0 break-words text-sm font-semibold leading-[1.16] text-text-primary">
            {opportunity.title}
          </span>
          {journeyStatusAndMeta}
          {journeyActions ? <div className="mt-2">{journeyActions}</div> : null}
          <div className="mt-auto flex min-w-0 flex-col gap-0.5 pt-2 text-2xs font-semibold leading-4 text-text-muted">
            {opportunity.location ? (
              <span className="truncate">{opportunity.location}</span>
            ) : null}
            <span className={`truncate ${deadlineClass}`}>{deadlineText}</span>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      data-density="compact"
      className={`group relative flex min-h-[216px] flex-col overflow-hidden rounded-[20px] border border-subtle bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-strong hover:shadow-elevated`}
    >
      <button
        type="button"
        onClick={() => onOpen(opportunity)}
        className="absolute inset-0 z-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        aria-label={openLabel}
      >
        <span className="sr-only">{openLabel}</span>
      </button>
      <div className="pointer-events-none relative z-10 h-[104px] shrink-0 overflow-hidden bg-surface-elevated">
        <ImageWithFallback
          src={opportunity.image}
          fallbackSrc={opportunity.imageFallback}
          alt={
            opportunity.title
              ? `${opportunity.title} opportunity image`
              : "Opportunity image"
          }
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          fallbackClassName="w-full h-full"
          category={opportunity.category}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/35 via-transparent to-transparent" />
        {opportunity.category ? (
          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-2xs font-semibold text-brand-600 backdrop-blur">
            {opportunity.category}
          </span>
        ) : null}
        <UrgencyPill
          badge={deadlineBadge}
          compact
          className="absolute right-3 top-3 shadow-sm backdrop-blur"
        />
      </div>
      <div className="pointer-events-none relative z-10 flex flex-1 flex-col p-3 sm:p-4">
        {match && match.score >= 40 ? (
          <div className="mb-1.5">
            <MatchScoreBadge score={match.score} minScore={40} />
          </div>
        ) : null}
        <h3 className="text-xs sm:text-sm font-semibold text-text-primary transition-colors line-clamp-2 leading-snug group-hover:text-brand">
          {opportunity.title}
        </h3>
        {match && match.score >= 40 ? (
          <TopMatchReason reason={match.reasons[0]} />
        ) : null}
        {journeyStatusAndMeta}
        {journeyActions ? <div className="mt-3">{journeyActions}</div> : null}
        <div className="mt-auto flex flex-col gap-1 pt-3 text-2xs font-medium text-text-muted sm:flex-row sm:items-center sm:justify-between">
          {opportunity.location ? (
            <span className="truncate">{opportunity.location}</span>
          ) : (
            <span />
          )}
          <span className={deadlineClass}>{deadlineText}</span>
        </div>
      </div>
    </article>
  );
});

export default DashboardOpportunityCard;
