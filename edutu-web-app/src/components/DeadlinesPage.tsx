import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  RefreshCcw,
} from "lucide-react";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { useAuth as useAppAuth } from "../hooks/useAuth";
import { useDarkMode } from "../hooks/useDarkMode";
import { useNotifications } from "../hooks/useNotifications";
import {
  getDeadlines,
  type Deadline,
  type DeadlinesResponse,
} from "../services/deadlines";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function deadlineStatus(deadline: Deadline) {
  if (deadline.daysUntil < 0) return `${Math.abs(deadline.daysUntil)}d overdue`;
  if (deadline.daysUntil === 0) return "Due today";
  return `Due in ${deadline.daysUntil}d`;
}

function typeLabel(type: Deadline["type"]) {
  if (type === "application") return "Application";
  if (type === "bookmark") return "Saved";
  return "Deadline";
}

export default function DeadlinesPage() {
  const navigate = useNavigate();
  const { getToken } = useClerkAuth();
  const { user } = useAppAuth();
  const { isDarkMode } = useDarkMode();
  const { preferences, savePreferences } = useNotifications();
  const [data, setData] = useState<DeadlinesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const loadDeadlines = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getToken().catch(() => null);
      setData(await getDeadlines(user.id, token));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load deadlines.",
      );
    } finally {
      setLoading(false);
    }
  }, [getToken, user?.id]);

  useEffect(() => {
    void loadDeadlines();
  }, [loadDeadlines]);

  const allDeadlines = useMemo(
    () => data?.groups.flatMap((group) => group.deadlines) ?? [],
    [data],
  );

  const nextDeadline = allDeadlines[0] ?? null;

  const runAction = async (key: string, action: () => Promise<void>) => {
    setBusyAction(key);
    setError(null);
    try {
      await action();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to update reminder settings.",
      );
    } finally {
      setBusyAction(null);
    }
  };

  const openDeadline = (deadline: Deadline) => {
    if (deadline.sourceId) {
      navigate(`/opportunity/${deadline.sourceId}`);
    }
  };

  return (
    <div
      className={`min-h-[100dvh] ${isDarkMode ? "bg-gray-950 text-white" : "bg-slate-50 text-slate-950"}`}
    >
      <header
        className={`sticky top-0 z-30 border-b backdrop-blur-xl ${isDarkMode ? "border-white/10 bg-gray-950/90" : "border-slate-200 bg-white/90"}`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <ChevronLeft size={17} />
            Dashboard
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section
          className={`rounded-[20px] border p-5 sm:p-6 ${isDarkMode ? "border-white/10 bg-gray-900/70" : "border-slate-200 bg-white shadow-sm"}`}
        >
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
                <Calendar size={22} />
              </div>
              <h1 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">
                Deadline tracker
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                View saved opportunity and application deadlines in one
                operational list.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-4">
                {[
                  ["Total", data?.summary.total ?? 0],
                  ["Overdue", data?.summary.overdue ?? 0],
                  [
                    "Urgent",
                    data?.summary.urgent ?? data?.summary.critical ?? 0,
                  ],
                  ["This week", data?.summary.thisWeek ?? 0],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className={`rounded-2xl border p-4 ${isDarkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"}`}
                  >
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                      {label}
                    </p>
                    <p className="mt-2 text-2xl font-black">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div
              className={`rounded-2xl border p-4 ${isDarkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"}`}
            >
              <div className="flex items-center gap-2 text-sm font-black">
                <Bell size={16} />
                Reminder controls
              </div>
              <div className="mt-4 space-y-2">
                {(
                  [
                    ["deadlineReminders", "Deadline reminders"],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold dark:border-white/10 dark:bg-gray-950"
                  >
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(preferences?.[key])}
                      disabled={!preferences || busyAction === key}
                      onChange={() =>
                        runAction(key, () =>
                          savePreferences({
                            [key]: !preferences?.[key],
                          }),
                        )
                      }
                      className="h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-500"
                    />
                  </label>
                ))}
              </div>
              {nextDeadline ? (
                <div className="mt-4 rounded-xl bg-brand-500/10 p-3 text-sm">
                  <p className="font-black text-brand-700 dark:text-brand-200">
                    Next deadline
                  </p>
                  <p className="mt-1 line-clamp-2 text-slate-700 dark:text-slate-300">
                    {nextDeadline.title}
                  </p>
                  <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                    {deadlineStatus(nextDeadline)}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-black tracking-tight">Upcoming work</h2>
            <button
              type="button"
              onClick={loadDeadlines}
              disabled={loading}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
            >
              {loading ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <RefreshCcw size={15} />
              )}
              Refresh
            </button>
          </div>

          {error ? (
            <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="mt-5 space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  className={`h-24 animate-pulse rounded-[20px] border ${isDarkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"}`}
                />
              ))}
            </div>
          ) : allDeadlines.length === 0 ? (
            <div
              className={`mt-5 rounded-[20px] border p-10 text-center ${isDarkMode ? "border-white/10 bg-gray-900/70" : "border-slate-200 bg-white"}`}
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
                <CheckCircle2 size={22} />
              </div>
              <h2 className="mt-4 text-base font-black">No deadlines yet</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
                Save opportunities or track applications with deadlines to fill
                this tracker.
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-5">
              {data?.groups.map((group) => {
                if (group.deadlines.length === 0) return null;
                return (
                  <div key={group.group}>
                    <h3 className="mb-3 text-sm font-black text-slate-500 dark:text-slate-400">
                      {group.group}
                    </h3>
                    <div className="space-y-3">
                      {group.deadlines.map((deadline) => (
                        <button
                          key={deadline.id}
                          type="button"
                          onClick={() => openDeadline(deadline)}
                          className={`flex w-full items-center gap-4 rounded-[20px] border p-4 text-left transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                            isDarkMode
                              ? "border-white/10 bg-gray-900/70 hover:bg-white/10"
                              : "border-slate-200 bg-white hover:shadow-sm"
                          }`}
                        >
                          <div
                            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                              deadline.daysUntil < 0
                                ? "bg-rose-500/10 text-rose-600 dark:text-rose-300"
                                : deadline.daysUntil <= 7
                                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                  : "bg-brand-500/10 text-brand-600 dark:text-brand-300"
                            }`}
                          >
                            <Clock size={19} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-600 dark:bg-white/10 dark:text-slate-300">
                                {typeLabel(deadline.type)}
                              </span>
                              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                                {formatDate(deadline.deadline)}
                              </span>
                            </div>
                            <h4 className="mt-2 line-clamp-2 text-sm font-black text-slate-950 dark:text-white">
                              {deadline.title}
                            </h4>
                            <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                              {deadline.category}
                            </p>
                          </div>
                          <div className="hidden shrink-0 flex-col items-end sm:flex">
                            <span className="text-sm font-black text-slate-700 dark:text-slate-200">
                              {deadlineStatus(deadline)}
                            </span>
                            <ChevronRight
                              size={18}
                              className="mt-2 text-slate-400"
                            />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
