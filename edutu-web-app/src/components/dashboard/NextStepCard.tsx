import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { OpportunityHomeView } from "../../services/opportunityHome";

export interface NextStepCardProps {
  id?: string;
  home: OpportunityHomeView | null;
  state: "loading" | "ready" | "error";
  onContinuePlan: (journeyId: string) => void;
  onViewOpportunity: (opportunityId: string) => void;
  onExplore: () => void;
  onEditPreferences: () => void;
}

function ActionButton({
  children,
  onClick,
  secondary = false,
}: {
  children: ReactNode;
  onClick: () => void;
  secondary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${secondary ? "text-text-secondary hover:bg-surface-elevated hover:text-text-primary" : "bg-brand text-white shadow-sm hover:bg-brand-700 focus-visible:ring-offset-2"}`}
    >
      {children}
    </button>
  );
}

function isCurrent(
  item: OpportunityHomeView["recommendations"][number],
): boolean {
  if (item.eligibilityStatus === "ineligible") return false;
  if (item.daysUntilDeadline !== null) return item.daysUntilDeadline >= 0;
  if (!item.deadline) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(item.deadline)) {
    const now = new Date();
    const localToday = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
    return item.deadline >= localToday;
  }
  return (
    Number.isNaN(Date.parse(item.deadline)) ||
    Date.parse(item.deadline) >= Date.now()
  );
}

function displayDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

export default function NextStepCard(props: NextStepCardProps) {
  const { t } = useTranslation();
  const {
    home,
    state,
    onContinuePlan,
    onViewOpportunity,
    onExplore,
    onEditPreferences,
    id,
  } = props;

  if (state === "loading")
    return (
      <section
        id={id}
        tabIndex={-1}
        aria-label={t("guidanceHome.loading")}
        aria-busy="true"
        className="space-y-1.5"
      >
        <div className="flex min-h-4 items-center justify-between gap-2 px-1">
          <p className="text-[10px] font-semibold uppercase leading-4 tracking-[0.12em] text-brand">
            {t("guidanceHome.eyebrow")}
          </p>
          <span
            role="status"
            aria-live="polite"
            className="inline-flex items-center gap-1.5 text-[10px] leading-4 text-text-muted"
          >
            <Loader2 size={12} className="animate-spin text-brand" aria-hidden="true" />
            {t("guidanceHome.loading")}
          </span>
        </div>
        <div className="flex min-h-[112px] items-center gap-4 rounded-[18px] border border-brand/15 bg-surface-brand p-4 sm:min-h-[124px] sm:p-5">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-5 w-3/5 animate-pulse rounded bg-surface-elevated" />
            <div className="h-3 w-2/5 animate-pulse rounded bg-surface-elevated" />
          </div>
        </div>
      </section>
    );

  if (state === "error" || !home) {
    return (
      <section id={id} tabIndex={-1} className="space-y-1.5">
        <div className="flex min-h-4 items-center px-1">
          <p className="text-[10px] font-semibold uppercase leading-4 tracking-[0.12em] text-brand">
            {t("guidanceHome.eyebrow")}
          </p>
        </div>
        <div
          role="status"
          aria-live="polite"
          className="rounded-[18px] border border-brand/15 bg-surface-brand p-3 dark:border-subtle dark:bg-surface-layer sm:p-4"
        >
          <button
            type="button"
            onClick={onExplore}
            aria-label={t("guidanceHome.explore")}
            className="block w-full rounded-xl text-left transition hover:bg-brand/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 active:scale-[0.99]"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <img
                src="/illustrations/guidance-unavailable.svg"
                alt=""
                aria-hidden="true"
                className="h-10 w-10 shrink-0 object-contain"
                width="40"
                height="40"
              />
              <span className="min-w-0 flex-1">
                <span
                  role="heading"
                  aria-level={2}
                  className="block text-sm font-semibold leading-5 text-text-primary"
                >
                  {t("guidanceHome.unavailableTitle")}
                </span>
                <span className="mt-0.5 block text-xs leading-4 text-text-secondary">
                  {t("guidanceHome.unavailableBody")}
                </span>
              </span>
            </span>
          </button>
        </div>
      </section>
    );
  }

  const featured = home?.activePursuits.find(
    (p) => p.journey.id === home.featuredPursuitId,
  );
  const recommendation = home?.recommendations.find(isCurrent);
  const recommendationArtwork =
    recommendation?.imageUrl ?? recommendation?.image_url ?? recommendation?.image;
  const inferred = home?.intent?.source === "inferred";
  const dueAt = displayDate(
    home?.nextAction?.dueAt ?? featured?.nextAction.dueAt,
  );
  const opportunityTitle =
    typeof featured?.opportunity.title === "string"
      ? featured.opportunity.title
      : t("guidanceHome.yourOpportunity");
  const intentLink = inferred ? (
    <ActionButton onClick={onEditPreferences} secondary>
      {t("guidanceHome.editPreferences")}
    </ActionButton>
  ) : null;

  return (
    <section id={id} tabIndex={-1} className="space-y-1.5">
      <div className="flex min-h-4 flex-wrap items-center gap-x-2 px-1">
        <p className="text-[10px] font-semibold uppercase leading-4 tracking-[0.12em] text-brand">
          {t("guidanceHome.eyebrow")}
        </p>
        {inferred ? (
          <p className="inline-flex items-center gap-1 text-[10px] leading-4 text-text-muted">
            <Sparkles size={10} aria-hidden="true" />
            {t("guidanceHome.basedOnProfile")}
          </p>
        ) : null}
      </div>
      <div className="relative flex min-h-[124px] items-center gap-3 overflow-hidden rounded-[18px] border border-brand/15 bg-surface-brand p-4 dark:border-subtle dark:bg-surface-layer sm:gap-5 sm:p-5">
        {recommendationArtwork ? (
          <>
            <img
              src={recommendationArtwork}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full scale-105 object-cover object-[70%_center] opacity-[0.18] blur-[2px] dark:scale-100 dark:opacity-[0.16] dark:blur-none"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-r from-surface-brand via-surface-brand/95 to-surface-brand/82 dark:from-surface-layer dark:via-surface-layer/90 dark:to-surface-layer/75"
            />
          </>
        ) : null}
        <div className="relative z-10 min-w-0 flex-1 pr-10 sm:pr-0">
          {featured ? (
            <>
              <h2 className="mt-1 truncate text-base font-semibold leading-6 text-text-primary sm:text-lg">
                {home.nextAction?.label ?? featured.nextAction.label}
              </h2>
              <p className="mt-1 truncate text-sm text-text-secondary">
                {t("guidanceHome.forOpportunity", { title: opportunityTitle })}
                {dueAt
                  ? ` · ${t("guidanceHome.dueDate", { date: dueAt })}`
                  : ""}
              </p>
              <div className="mt-3 hidden flex-wrap gap-2 sm:flex">
                <ActionButton
                  onClick={() => onContinuePlan(featured.journey.id)}
                >
                  {t("guidanceHome.continuePlan")}
                  <ArrowRight size={15} aria-hidden="true" />
                </ActionButton>
                {intentLink}
              </div>
            </>
          ) : recommendation ? (
            <>
              <h2 className="mt-1 line-clamp-2 text-base font-semibold leading-5 text-text-primary sm:text-lg sm:leading-6">
                {recommendation.title}
              </h2>
              <div className="mt-3 hidden flex-wrap gap-2 sm:flex">
                <ActionButton
                  onClick={() => onViewOpportunity(recommendation.id)}
                >
                  {t("guidanceHome.viewOpportunity")}
                  <ArrowRight size={15} aria-hidden="true" />
                </ActionButton>
                {intentLink}
              </div>
            </>
          ) : (
            <>
              <h2 className="mt-1 text-base font-semibold leading-6 text-text-primary sm:text-lg">
                {t("guidanceHome.noRecommendationTitle")}
              </h2>
              <p className="mt-1 text-sm leading-5 text-text-secondary">
                {home?.degraded
                  ? t("guidanceHome.limitedBody")
                  : t("guidanceHome.noRecommendationBody")}
              </p>
              <div className="mt-3 hidden flex-wrap gap-2 sm:flex">
                <ActionButton onClick={onExplore}>
                  {t("guidanceHome.explore")}
                  <ArrowRight size={15} aria-hidden="true" />
                </ActionButton>
                {intentLink}
              </div>
            </>
          )}
        </div>
        {state === "ready" && home ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-brand/15 bg-surface-layer/80 text-brand sm:hidden"
          >
            <ArrowRight size={17} />
          </span>
        ) : null}
        {state === "ready" && home ? (
          <button
            type="button"
            onClick={() => {
              if (featured) onContinuePlan(featured.journey.id);
              else if (recommendation) onViewOpportunity(recommendation.id);
              else onExplore();
            }}
            className="absolute inset-0 z-20 block rounded-[18px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand sm:hidden"
            aria-label={
              featured
                ? `${t("guidanceHome.continuePlan")}: ${opportunityTitle}`
                : recommendation
                  ? `${t("guidanceHome.viewOpportunity")}: ${recommendation.title}`
                  : t("guidanceHome.explore")
            }
          />
        ) : null}
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <img
            src="/illustrations/guidance-next-step.svg"
            alt=""
            aria-hidden="true"
            className="h-16 w-16 object-contain"
            width="64"
            height="64"
          />
        </div>
      </div>
    </section>
  );
}
