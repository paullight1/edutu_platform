import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Loader2,
  Plus,
  RefreshCcw,
  Sparkles,
  Target,
} from "lucide-react";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth as useAppAuth } from "../hooks/useAuth";
import { StateView, useScreenState } from "./state";
import PlanWorkspaceHeader from "./PlanWorkspaceHeader";
import PlanMascotWelcome from "./PlanMascotWelcome";
import {
  listOpportunityJourneys,
  type OpportunityJourneyView,
  type OpportunityPublicStage,
} from "../services/opportunityJourneys";

const STAGES: OpportunityPublicStage[] = [
  "pursuing",
  "discover",
  "applied",
  "outcome",
];

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function statusLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter: string) => letter.toUpperCase());
}

function planCardPalette(category: string, title: string) {
  const value = `${category} ${title}`.toLowerCase();
  if (/\bintern(ship)?s?\b|\bcareer(s)?\b|\bjobs?\b/.test(value)) {
    return { surface: "border-emerald-500/20 bg-emerald-500/[0.06]", accent: "bg-emerald-500", text: "text-emerald-500", badge: "bg-emerald-500/10", hover: "group-hover:bg-emerald-500" };
  }
  if (/fellow|leader/.test(value)) {
    return { surface: "border-violet-500/20 bg-violet-500/[0.06]", accent: "bg-violet-500", text: "text-violet-500", badge: "bg-violet-500/10", hover: "group-hover:bg-violet-500" };
  }
  if (/science|research|stem/.test(value)) {
    return { surface: "border-cyan-500/20 bg-cyan-500/[0.06]", accent: "bg-cyan-500", text: "text-cyan-500", badge: "bg-cyan-500/10", hover: "group-hover:bg-cyan-500" };
  }
  if (/grant|fund|business/.test(value)) {
    return { surface: "border-amber-500/20 bg-amber-500/[0.06]", accent: "bg-amber-500", text: "text-amber-500", badge: "bg-amber-500/10", hover: "group-hover:bg-amber-500" };
  }
  return { surface: "border-blue-500/20 bg-blue-500/[0.06]", accent: "bg-blue-500", text: "text-blue-500", badge: "bg-blue-500/10", hover: "group-hover:bg-blue-500" };
}

function PlanCard({
  item,
  onContinue,
  t,
}: {
  item: OpportunityJourneyView;
  onContinue: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const title = stringValue(item.opportunity.title, t("myPlan.opportunity"));
  const organization = stringValue(item.opportunity.organization, "");
  const deadline = formatDate(
    stringValue(item.opportunity.deadline, "") ||
      stringValue(item.opportunity.close_date, ""),
  );
  const percent = Math.max(0, Math.min(100, Number(item.progress.percent) || 0));
  const category = stringValue(item.opportunity.category, "");
  const palette = planCardPalette(category, title);

  return (
    <article className={`group relative overflow-hidden rounded-[20px] border p-4 shadow-soft transition hover:-translate-y-0.5 sm:p-5 ${palette.surface}`}>
      <span className={`absolute inset-y-4 left-0 w-1 rounded-r-full ${palette.accent}`} aria-hidden="true" />
      <div className="flex items-center justify-between gap-3">
        <span className={`inline-flex min-w-0 items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold text-text-secondary ${palette.badge}`}>
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${palette.accent}`} />
          {t(`myPlan.states.${item.journey.state}`, {
            defaultValue: statusLabel(item.journey.state),
          })}
        </span>
        {item.journey.priority === "primary" ? (
          <span className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold ${palette.text}`}>
            <Target size={13} aria-hidden="true" />
            {t("myPlan.primaryFocus")}
          </span>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="mt-3 block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-body"
        aria-label={t("myPlan.continueWith", { title })}
      >
        {organization ? (
          <p className="truncate text-2xs font-semibold uppercase tracking-[0.12em] text-text-muted">
            {organization}
          </p>
        ) : null}
        <h2 className={`${organization ? "mt-1" : ""} line-clamp-2 font-display text-lg font-semibold leading-snug tracking-[-0.025em] text-text-primary sm:text-xl`}>
          {title}
        </h2>
      </button>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
        {deadline ? (
          <span className="inline-flex items-center gap-2">
            <CalendarDays size={13} aria-hidden="true" />
            {deadline}
          </span>
        ) : null}
        <span>
          {item.progress.completedRequired}/{item.progress.totalRequired} steps
        </span>
      </div>

      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between text-2xs text-text-muted">
          <span>{t("myPlan.preparation")}</span>
          <span>{percent}%</span>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-surface-elevated"
          role="progressbar"
          aria-label={t("myPlan.preparationProgress")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div className={`h-full rounded-full transition-[width] ${palette.accent}`} style={{ width: `${percent}%` }} />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-subtle pt-3">
        <div className="min-w-0">
          <p className="text-2xs text-text-muted">{t("myPlan.nextStep")}</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-text-primary">
            {stringValue(item.nextAction?.label, t("myPlan.reviewPlan"))}
          </p>
        </div>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition group-hover:text-white ${palette.badge} ${palette.text} ${palette.hover}`}>
          <ArrowRight size={16} aria-hidden="true" />
        </span>
      </div>
    </article>
  );
}

export default function MyPlanPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { getToken } = useClerkAuth();
  const { user } = useAppAuth();
  const [stage, setStage] = useState<OpportunityPublicStage>("pursuing");
  const [journeys, setJourneys] = useState<OpportunityJourneyView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const loadPlan = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw Object.assign(new Error("Sign in again to view your plan."), { status: 401 });
        setJourneys(await listOpportunityJourneys(stage, token));
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, [getToken, stage, user?.id]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  const screenState = useScreenState({ data: journeys, loading, error });
  return (
    <main className="min-h-[100dvh] bg-surface-body px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pt-10">
      <div className="mx-auto max-w-6xl">
        <PlanWorkspaceHeader section="overview" hideIntroOnMobile />
        <PlanMascotWelcome />
        <button
          type="button"
          onClick={() => navigate("/app/opportunities")}
          className="fixed bottom-24 right-4 z-20 inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand text-white shadow-lg shadow-brand/25 transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:hidden"
          aria-label={t("myPlan.exploreOpportunities")}
          title={t("myPlan.exploreOpportunities")}
        >
          <Plus size={22} aria-hidden="true" />
        </button>
        <header className="hidden flex-col gap-5 border-b border-subtle pb-6 sm:flex sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="mt-3 font-display text-4xl font-semibold tracking-[-0.045em] text-text-primary sm:text-5xl">
              {t("myPlan.title")}
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-text-secondary">
              {t("myPlan.description")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadPlan()}
            disabled={loading}
            className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl border border-subtle bg-surface-layer px-4 text-sm font-semibold text-text-secondary transition hover:border-brand/30 hover:text-brand disabled:cursor-not-allowed disabled:opacity-60 sm:self-auto"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
            {t("myPlan.refresh")}
          </button>
        </header>

        <section className="mt-4" aria-label={t("myPlan.stagesLabel")}>
          <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
            {STAGES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setStage(item)}
                aria-pressed={stage === item}
                className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold transition ${stage === item ? "border-subtle bg-surface-elevated text-text-primary" : "border-transparent bg-transparent text-text-secondary hover:border-subtle hover:bg-surface-elevated"}`}
              >
                {t(`myPlan.stages.${item}`)}
              </button>
            ))}
          </div>
          <p className="mt-1 px-1 text-sm text-text-muted">
            {t("myPlan.stageCount", { count: journeys.length })}
          </p>
        </section>

        <section className="mt-7" aria-live="polite">
          {screenState.kind === "loading" ? (
            <div className="grid gap-4 md:grid-cols-2" aria-label={t("myPlan.loading")}>
              {[0, 1].map((item) => <div key={item} className="h-72 animate-pulse rounded-[20px] border border-subtle bg-surface-layer" />)}
            </div>
          ) : screenState.kind === "error" || screenState.kind === "offline" ? (
            <div className="border-y border-subtle sm:rounded-3xl sm:border sm:border-danger/20 sm:bg-danger/5">
              <StateView state={screenState} flow="applied" sceneSize={120} actionLabel={t("myPlan.retry")} onRetry={() => void loadPlan()} />
            </div>
          ) : journeys.length === 0 ? (
            <div className="rounded-none border-0 bg-transparent px-0 py-10 text-center shadow-none sm:rounded-3xl sm:border sm:border-subtle sm:bg-surface-layer sm:px-6 sm:py-12 sm:shadow-soft">
              <Sparkles className="mx-auto text-brand" size={28} aria-hidden="true" />
              <h2 className="mt-4 font-display text-2xl font-semibold tracking-[-0.03em] text-text-primary">{t("myPlan.emptyTitle")}</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-secondary">{t("myPlan.emptyDescription")}</p>
              <button type="button" onClick={() => navigate("/app/opportunities")} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-white transition hover:bg-brand-700 active:scale-[0.98]">{t("myPlan.exploreOpportunities")} <ArrowRight size={16} aria-hidden="true" /></button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {journeys.map((item) => (
                <PlanCard key={item.journey.id} item={item} t={t} onContinue={() => navigate(`/app/my-plan/${encodeURIComponent(item.journey.id)}`)} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
