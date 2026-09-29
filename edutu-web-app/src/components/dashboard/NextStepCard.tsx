import { AlertCircle, ArrowRight, RefreshCw, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { OpportunityHomeView } from "../../services/opportunityHome";

export interface NextStepCardProps {
  home: OpportunityHomeView | null;
  state: "loading" | "ready" | "error";
  onContinuePlan: (journeyId: string) => void;
  onViewOpportunity: (opportunityId: string) => void;
  onExplore: () => void;
  onEditPreferences: () => void;
  onRetry?: () => void;
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
    onRetry,
  } = props;

  if (state === "loading")
    return (
      <section
        aria-label={t("guidanceHome.loading")}
        aria-busy="true"
        className="flex min-h-[112px] items-center gap-4 rounded-2xl border border-subtle bg-surface-layer p-4 sm:min-h-[124px] sm:p-5"
      >
        <div className="h-14 w-14 shrink-0 animate-pulse rounded-2xl bg-surface-elevated" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-3 w-28 animate-pulse rounded bg-surface-elevated" />
          <div className="h-5 w-3/5 animate-pulse rounded bg-surface-elevated" />
          <div className="h-3 w-2/5 animate-pulse rounded bg-surface-elevated" />
        </div>
      </section>
    );

  const featured = home?.activePursuits.find(
    (p) => p.journey.id === home.featuredPursuitId,
  );
  const recommendation = home?.recommendations.find(isCurrent);
  const inferred = home?.intent?.source === "inferred";
  const dueAt = displayDate(
    home?.nextAction?.dueAt ?? featured?.nextAction.dueAt,
  );
  const opportunityTitle =
    typeof featured?.opportunity.title === "string"
      ? featured.opportunity.title
      : t("guidanceHome.yourOpportunity");
  const reason =
    recommendation?.matchReasons[0] ??
    recommendation?.eligibilityReasons[0] ??
    t("guidanceHome.checkEligibility");
  const intentLink = inferred ? (
    <ActionButton onClick={onEditPreferences} secondary>
      {t("guidanceHome.editPreferences")}
    </ActionButton>
  ) : null;

  return (
    <section className="relative flex min-h-[124px] items-center gap-3 overflow-hidden rounded-2xl border border-subtle bg-surface-layer p-4 sm:gap-5 sm:p-5">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">
          {t("guidanceHome.eyebrow")}
        </p>
        {inferred ? (
          <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-text-muted">
            <Sparkles size={13} aria-hidden="true" />
            {t("guidanceHome.basedOnProfile")}
          </p>
        ) : null}
        {state === "error" || !home ? (
          <>
            <h2 className="mt-1 text-base font-semibold text-text-primary">
              {t("guidanceHome.unavailableTitle")}
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              {t("guidanceHome.unavailableBody")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {onRetry ? (
                <ActionButton onClick={onRetry} secondary>
                  <RefreshCw size={15} aria-hidden="true" />
                  {t("guidanceHome.retry")}
                </ActionButton>
              ) : null}
              <ActionButton onClick={onExplore}>
                {t("guidanceHome.explore")}
                <ArrowRight size={15} aria-hidden="true" />
              </ActionButton>
            </div>
          </>
        ) : featured ? (
          <>
            <h2 className="mt-1 truncate text-base font-semibold leading-6 text-text-primary sm:text-lg">
              {home.nextAction?.label ?? featured.nextAction.label}
            </h2>
            <p className="mt-1 truncate text-sm text-text-secondary">
              {t("guidanceHome.forOpportunity", { title: opportunityTitle })}
              {dueAt ? ` · ${t("guidanceHome.dueDate", { date: dueAt })}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <ActionButton onClick={() => onContinuePlan(featured.journey.id)}>
                {t("guidanceHome.continuePlan")}
                <ArrowRight size={15} aria-hidden="true" />
              </ActionButton>
              {intentLink}
            </div>
          </>
        ) : recommendation ? (
          <>
            <h2 className="mt-1 truncate text-base font-semibold leading-6 text-text-primary sm:text-lg">
              {recommendation.title}
            </h2>
            <p className="mt-1 line-clamp-2 text-sm leading-5 text-text-secondary">
              {reason}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
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
            <div className="mt-3 flex flex-wrap gap-2">
              <ActionButton onClick={onExplore}>
                {t("guidanceHome.explore")}
                <ArrowRight size={15} aria-hidden="true" />
              </ActionButton>
              {intentLink}
            </div>
          </>
        )}
      </div>
      <div className="hidden shrink-0 items-center gap-2 sm:flex">
        {state === "error" ? (
          <AlertCircle
            size={16}
            className="text-text-muted"
            aria-hidden="true"
          />
        ) : null}
        <img
          src="/illustrations/guidance-next-step.svg"
          alt=""
          aria-hidden="true"
          className="h-16 w-16 object-contain"
          width="64"
          height="64"
        />
      </div>
    </section>
  );
}
