import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Route,
} from "lucide-react";
import {
  fetchOpportunityPipelineSummary,
  type OpportunityPipelineSummary,
} from "../lib/opportunityPipelineApi";

const STEP_LABELS: Record<string, string> = {
  intent_available: "Intent available",
  focused_shortlist_viewed: "Focused shortlist viewed",
  decision_recorded: "Decision recorded",
  journey_activated: "Journey activated",
  first_task_completed: "First task completed",
  ready_to_apply: "Ready to apply",
  application_opened: "Application opened",
  application_confirmed: "Application confirmed",
  interview_recorded: "Interview recorded",
  offer_recorded: "Offer recorded",
};

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default function OpportunityPipeline() {
  const { getToken } = useAuth();
  const initialTo = useMemo(() => new Date(), []);
  const initialFrom = useMemo(
    () => new Date(initialTo.getTime() - 30 * 24 * 60 * 60 * 1_000),
    [initialTo],
  );
  const [from, setFrom] = useState(isoDate(initialFrom));
  const [to, setTo] = useState(isoDate(initialTo));
  const [summary, setSummary] = useState<OpportunityPipelineSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);

    void (async () => {
      const token = await getToken();
      if (!token) throw new Error("Admin authentication is required.");
      const result = await fetchOpportunityPipelineSummary({
        token,
        from: new Date(`${from}T00:00:00.000Z`),
        to: new Date(`${to}T23:59:59.999Z`),
        signal: controller.signal,
      });
      if (active) setSummary(result);
    })()
      .catch((nextError) => {
        if (active && nextError?.name !== "AbortError") {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Unable to load the opportunity pipeline report.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [from, getToken, reloadKey, to]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
            <Route className="h-4 w-4" />
            Intentional opportunity pipeline
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">
            Opportunity Pipeline
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
            Measure intentional progress from current focus to confirmed
            applications and outcomes. Application link opening remains separate
            from submission.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setReloadKey((value) => value + 1)}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
        <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
          From
          <input
            type="date"
            value={from}
            max={to}
            onChange={(event) => setFrom(event.target.value)}
            className="block min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-950 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </label>
        <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
          To
          <input
            type="date"
            value={to}
            min={from}
            onChange={(event) => setTo(event.target.value)}
            className="block min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-950 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </label>
      </div>

      {error ? (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">The report could not load</p>
            <p className="mt-1">{error}</p>
          </div>
        </div>
      ) : null}

      {loading && !summary ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          Loading opportunity pipeline metrics…
        </div>
      ) : null}

      {summary ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="First action within 7 days"
              value={`${summary.northStar.percentage}%`}
              detail={`${summary.northStar.successfulUsers} of ${summary.northStar.eligibleUsers} activated users`}
              positive
            />
            <MetricCard
              label="Active users"
              value={String(summary.activeUsers)}
              detail="Distinct users in the selected period"
            />
            <MetricCard
              label="Confirmed applications"
              value={String(summary.guardrails.applicationConfirmedUsers)}
              detail={`${summary.guardrails.applicationOpenedUsers} application links opened`}
            />
            <MetricCard
              label="Open–confirm gap"
              value={String(summary.guardrails.openedWithoutConfirmationGap)}
              detail="Link openers without confirmed submission"
              warning={summary.guardrails.openedWithoutConfirmationGap > 0}
            />
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <h2 className="font-bold text-slate-950 dark:text-white">
                Intentional funnel
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Distinct users are used for conversion; retried events do not
                inflate user counts.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-950/50 dark:text-slate-400">
                  <tr>
                    <th className="px-5 py-3">Stage</th>
                    <th className="px-5 py-3">Users</th>
                    <th className="px-5 py-3">Events</th>
                    <th className="px-5 py-3">From previous</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {summary.funnel.map((item) => (
                    <tr key={item.step}>
                      <td className="px-5 py-3 font-semibold text-slate-900 dark:text-slate-100">
                        {STEP_LABELS[item.step] ?? item.step}
                      </td>
                      <td className="px-5 py-3 text-slate-700 dark:text-slate-300">
                        {item.users}
                      </td>
                      <td className="px-5 py-3 text-slate-700 dark:text-slate-300">
                        {item.events}
                      </td>
                      <td className="px-5 py-3 text-slate-700 dark:text-slate-300">
                        {item.conversionFromPrevious}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="font-bold text-slate-950 dark:text-white">
                Reminder activity
              </h2>
              <p className="mt-2 text-3xl font-bold text-slate-950 dark:text-white">
                {summary.guardrails.reminderEvents}
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Deduplicated next-action reminders queued in this period.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="font-bold text-slate-950 dark:text-white">
                Event sources
              </h2>
              <div className="mt-3 space-y-2">
                {Object.entries(summary.guardrails.sourceCounts).map(
                  ([source, count]) => (
                    <div
                      key={source}
                      className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-950/60"
                    >
                      <span className="font-medium capitalize text-slate-700 dark:text-slate-300">
                        {source}
                      </span>
                      <span className="font-bold text-slate-950 dark:text-white">
                        {count}
                      </span>
                    </div>
                  ),
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  positive = false,
  warning = false,
}: {
  label: string;
  value: string;
  detail: string;
  positive?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
        {positive ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : warning ? (
          <AlertTriangle className="h-4 w-4 text-amber-500" />
        ) : (
          <ExternalLink className="h-4 w-4" />
        )}
        {label}
      </div>
      <p className="mt-3 text-3xl font-bold text-slate-950 dark:text-white">
        {value}
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
        {detail}
      </p>
    </div>
  );
}
