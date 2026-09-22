import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Check, Circle, Loader2 } from "lucide-react";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { useAuth as useAppAuth } from "../hooks/useAuth";
import ImageWithFallback from "./ImageWithFallback";
import { StateView, useScreenState } from "./state";
import {
  getOpportunityJourney,
  updateJourneyTask,
  type OpportunityJourneyView,
} from "../services/opportunityJourneys";

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function MyPlanDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { getToken } = useClerkAuth();
  const { user } = useAppAuth();
  const [item, setItem] = useState<OpportunityJourneyView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [savingTask, setSavingTask] = useState<string | null>(null);

  const loadJourney = useCallback(async () => {
    if (!user?.id || !id) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error(t("myPlan.signInToView"));
      setItem(await getOpportunityJourney(id, token));
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, [getToken, id, t, user?.id]);

  useEffect(() => {
    void loadJourney();
  }, [loadJourney]);

  const screenState = useScreenState({ data: item, loading, error });

  const toggleTask = async (taskId: string, completed: boolean) => {
    if (!item) return;
    setSavingTask(taskId);
    try {
      const token = await getToken();
      if (!token) throw new Error(t("myPlan.signInToUpdate"));
      setItem(await updateJourneyTask(item.journey.id, taskId, {
        expectedVersion: item.journey.version,
        status: completed ? "pending" : "completed",
      }, token));
    } catch (caught) {
      setError(caught);
    } finally {
      setSavingTask(null);
    }
  };

  if (screenState.kind === "loading") {
    return <main className="min-h-[100dvh] bg-surface-body px-4 py-8 sm:px-6 lg:px-8"><div className="mx-auto h-96 max-w-3xl animate-pulse rounded-3xl bg-surface-layer" /></main>;
  }

  if (screenState.kind === "error" || !item) {
    return <main className="min-h-[100dvh] bg-surface-body px-4 py-8 sm:px-6 lg:px-8"><div className="mx-auto max-w-3xl rounded-[20px] border border-danger/20 bg-danger/5"><StateView state={{ kind: "error", cause: "server" }} flow="applied" sceneSize={140} title={t("myPlan.unavailableTitle")} body={t("myPlan.unavailableBody")} actionLabel={t("myPlan.retry")} onRetry={() => void loadJourney()} /></div></main>;
  }

  const title = stringValue(item.opportunity.title, t("myPlan.opportunity"));
  const organization = stringValue(item.opportunity.organization, "");
  const deadline = formatDate(stringValue(item.opportunity.deadline, "") || stringValue(item.opportunity.close_date, ""));
  const image = stringValue(
    item.opportunity.image,
    stringValue(item.opportunity.image_url, stringValue(item.opportunity.cover_image, "")),
  );
  const imageFallback = stringValue(item.opportunity.imageFallback, "");
  const category = stringValue(item.opportunity.category, "Opportunity");

  return (
    <main className="min-h-[100dvh] bg-surface-body px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pt-10">
      <div className="mx-auto max-w-3xl">
        <header className="relative -mx-4 min-h-[330px] overflow-hidden border-b border-subtle sm:mx-0 sm:min-h-[390px] sm:rounded-[20px] sm:border">
          <ImageWithFallback src={image} fallbackSrc={imageFallback} alt={`${title} cover image`} category={category} className="absolute inset-0 h-full w-full object-cover" fallbackClassName="absolute inset-0 h-full w-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-slate-950/10" aria-hidden="true" />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/85 via-slate-950/25 to-transparent" aria-hidden="true" />
          <div className="relative flex min-h-[330px] flex-col justify-end px-4 pb-7 pt-24 sm:min-h-[390px] sm:p-8">
          <p className="text-sm font-semibold capitalize text-blue-300">{t(`myPlan.states.${item.journey.state}`, { defaultValue: item.journey.state.replace(/_/g, " ") })}</p>
          <h1 className="mt-3 max-w-2xl font-display text-3xl font-semibold leading-tight tracking-[-0.04em] text-white drop-shadow-sm sm:text-5xl">{title}</h1>
          {organization ? <p className="mt-3 text-base text-slate-200">{organization}</p> : null}
          <div className="mt-5 flex flex-wrap gap-4 text-sm text-slate-300">
            {deadline ? <span className="inline-flex items-center gap-2"><CalendarDays size={15} aria-hidden="true" /> {t("myPlan.deadline", { date: deadline })}</span> : null}
            <span>{t("myPlan.stepsComplete", { completed: item.progress.completedRequired, total: item.progress.totalRequired })}</span>
          </div>
          </div>
        </header>

        <section className="mt-8">
          <div className="flex items-end justify-between gap-4">
            <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">{t("myPlan.nextStep")}</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-text-primary">{stringValue(item.nextAction?.label, t("myPlan.keepMoving"))}</h2></div>
            <span className="text-sm font-semibold text-text-muted">{Math.round(item.progress.percent)}%</span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-elevated"><div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${Math.max(0, Math.min(100, item.progress.percent))}%` }} /></div>
        </section>

        <section className="mt-9 rounded-[20px] border border-subtle bg-surface-layer p-5 shadow-soft sm:p-7" aria-labelledby="plan-tasks-title">
          <h2 id="plan-tasks-title" className="text-lg font-semibold text-text-primary">{t("myPlan.preparationSteps")}</h2>
          <div className="mt-5 divide-y divide-subtle">
            {item.tasks.map((task) => {
              const completed = task.status === "completed";
              const saving = savingTask === task.id;
              return <button key={task.id} type="button" onClick={() => void toggleTask(task.id, completed)} disabled={saving} className="flex w-full items-start gap-4 py-4 text-left first:pt-0 last:pb-0 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${completed ? "border-brand bg-brand text-white" : "border-subtle text-text-muted"}`}>{saving ? <Loader2 size={14} className="animate-spin" /> : completed ? <Check size={15} /> : <Circle size={13} />}</span>
                <span className="min-w-0"><span className={`block text-sm font-semibold ${completed ? "text-text-muted line-through" : "text-text-primary"}`}>{task.title}</span><span className="mt-1 block text-xs text-text-muted">{task.required ? t("myPlan.required") : t("myPlan.optional")} · {completed ? t("myPlan.completed") : t("myPlan.markComplete")}</span></span>
              </button>;
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
