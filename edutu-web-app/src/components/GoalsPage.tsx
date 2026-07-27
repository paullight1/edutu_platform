import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  Loader2,
  Minus,
  Plus,
  Check,
  Trash2,
  Target,
  Flag,
  X,
  CalendarClock,
} from "lucide-react";
import { useGoals, type Goal, type GoalStatus } from "../hooks/useGoals";
import PullToRefresh from "./ui/PullToRefresh";
import { EmptyState, ErrorState } from "./ui/EmptyState";
import Button from "./ui/Button";
import EnableNotificationsButton from "./EnableNotificationsButton";
import ConnectCalendarButton from "./ConnectCalendarButton";

type FilterKey = "all" | "active" | "completed";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
];

const PRIORITY_META: Record<
  "low" | "medium" | "high",
  { label: string; cls: string }
> = {
  high: { label: "High", cls: "bg-red-500/10 text-red-600" },
  medium: { label: "Medium", cls: "bg-amber-500/10 text-amber-600" },
  low: { label: "Low", cls: "bg-slate-500/10 text-slate-500" },
};

function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate(),
  );
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function formatDeadline(dateStr?: string): string {
  if (!dateStr) return "No deadline";
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return "No deadline";
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function deadlineLabel(days: number | null): string {
  if (days === null) return "No deadline";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `${days}d left`;
}

function urgencyChipClass(days: number | null): string {
  if (days === null) return "border-subtle text-text-muted";
  if (days <= 2) return "border-red-500/40 text-red-600";
  if (days <= 7) return "border-amber-500/40 text-amber-600";
  return "border-subtle text-text-muted";
}

const surfaceClass = "border-subtle bg-surface-layer shadow-soft";
const EMPTY_FORM = {
  title: "",
  description: "",
  category: "",
  deadline: "",
  priority: "medium" as "low" | "medium" | "high",
};

export default function GoalsPage() {
  const navigate = useNavigate();
  const { goals, isLoading, error, refreshGoals, createGoal, updateGoal, deleteGoal } =
    useGoals();

  const [filter, setFilter] = useState<FilterKey>("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const active = goals.filter((g) => g.status === "active");
    const completed = goals.filter((g) => g.status === "completed");
    const avg =
      active.length > 0
        ? Math.round(
            active.reduce((sum, g) => sum + (g.progress || 0), 0) /
              active.length,
          )
        : 0;
    return { active: active.length, completed: completed.length, avgProgress: avg };
  }, [goals]);

  const upcoming = useMemo(() => {
    return goals
      .filter((g) => g.status === "active" && g.deadline)
      .map((g) => ({ goal: g, days: daysUntil(g.deadline) }))
      .filter((item) => item.days !== null)
      .sort((a, b) => (a.days as number) - (b.days as number))
      .slice(0, 6);
  }, [goals]);

  const visibleGoals = useMemo(() => {
    const byFilter =
      filter === "all"
        ? goals
        : goals.filter((g) => g.status === (filter as GoalStatus));
    // Active first, then by nearest deadline, then newest.
    return [...byFilter].sort((a, b) => {
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      const da = daysUntil(a.deadline);
      const db = daysUntil(b.deadline);
      if (da !== null && db !== null && da !== db) return da - db;
      if (da !== null && db === null) return -1;
      if (da === null && db !== null) return 1;
      return b.created_at.localeCompare(a.created_at);
    });
  }, [goals, filter]);

  const handleCreate = useCallback(async () => {
    if (!form.title.trim()) {
      setFormError("Give your goal a title.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await createGoal({
        title: form.title,
        description: form.description || undefined,
        category: form.category || undefined,
        deadline: form.deadline || undefined,
        priority: form.priority,
        source: "custom",
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Could not create the goal.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [createGoal, form]);

  const withBusy = useCallback(
    async (id: string, action: () => Promise<void>) => {
      setBusyId(id);
      try {
        await action();
      } catch (error) {
        console.error("Goal action failed", error);
      } finally {
        setBusyId(null);
      }
    },
    [],
  );

  const adjustProgress = (goal: Goal, delta: number) =>
    withBusy(goal.id, () =>
      updateGoal(goal.id, {
        progress: Math.min(100, Math.max(0, (goal.progress || 0) + delta)),
      }),
    );

  const completeGoal = (goal: Goal) =>
    withBusy(goal.id, () =>
      updateGoal(goal.id, { status: "completed", progress: 100 }),
    );

  const removeGoal = (goal: Goal) => {
    if (!window.confirm(`Delete "${goal.title}"? This cannot be undone.`)) return;
    void withBusy(goal.id, () => deleteGoal(goal.id));
  };

  return (
    <div className="min-h-[100dvh] bg-surface-body text-text-primary">
      <header className="sticky top-0 z-30 hidden border-b border-subtle bg-surface-layer/90 backdrop-blur-xl lg:block">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-subtle px-3 text-sm font-bold text-text-secondary transition hover:bg-surface-elevated"
          >
            <ChevronLeft size={17} />
            Back
          </button>
          <div className="flex items-center gap-2">
            <ConnectCalendarButton />
            <EnableNotificationsButton />
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-3 text-sm font-bold text-white transition hover:bg-brand-700"
            >
              <Plus size={17} />
              New goal
            </button>
          </div>
        </div>
      </header>

      <PullToRefresh
        onRefresh={refreshGoals}
        disabled={isLoading}
        className="min-h-[calc(100dvh-4rem)]"
      >
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <section className={`rounded-[20px] border p-4 sm:p-5 ${surfaceClass}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">
                  Goals workspace
                </p>
                <h1 className="mt-1 text-xl font-display font-semibold tracking-tight">
                  Your goals
                </h1>
                <p className="mt-2 text-sm leading-6 text-text-muted">
                  Track what you're working toward — progress, priority, and
                  deadlines in one place.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-brand px-3 text-sm font-bold text-white transition hover:bg-brand-700 lg:hidden"
              >
                <Plus size={16} />
                New
              </button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <StatTile label="Active" value={stats.active} />
              <StatTile label="Completed" value={stats.completed} />
              <StatTile label="Avg progress" value={`${stats.avgProgress}%`} />
            </div>
          </section>

          {upcoming.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                <CalendarClock size={14} />
                Upcoming
              </span>
              {upcoming.map(({ goal, days }) => (
                <span
                  key={goal.id}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${urgencyChipClass(days)}`}
                >
                  <span className="max-w-[10rem] truncate">{goal.title}</span>
                  <span className="opacity-70">· {deadlineLabel(days)}</span>
                </span>
              ))}
            </div>
          )}

          <div className="mt-5 flex items-center gap-2">
            {FILTERS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  filter === tab.key
                    ? "bg-brand text-white"
                    : "border border-subtle text-text-secondary hover:bg-surface-elevated"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-40 animate-pulse rounded-[20px] border border-subtle bg-surface-elevated"
                />
              ))}
            </div>
          ) : error && goals.length === 0 ? (
            <div className={`mt-5 rounded-[20px] border ${surfaceClass}`}>
              <ErrorState
                message={error}
                onRetry={() => {
                  void refreshGoals();
                }}
              />
            </div>
          ) : visibleGoals.length === 0 ? (
            <div className={`mt-5 rounded-[20px] border ${surfaceClass}`}>
              <EmptyState
                icon={<Target size={32} />}
                title={
                  filter === "completed"
                    ? "No completed goals yet"
                    : "No goals yet"
                }
                description="Set a goal to break a big ambition into trackable progress with a deadline."
                action={{
                  label: "Create a goal",
                  onClick: () => setShowForm(true),
                }}
              />
            </div>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {visibleGoals.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  busy={busyId === goal.id}
                  onDecrease={() => adjustProgress(goal, -25)}
                  onIncrease={() => adjustProgress(goal, 25)}
                  onComplete={() => completeGoal(goal)}
                  onDelete={() => removeGoal(goal)}
                />
              ))}
            </div>
          )}
        </main>
      </PullToRefresh>

      {showForm && (
        <CreateGoalModal
          form={form}
          setForm={setForm}
          submitting={submitting}
          error={formError}
          onClose={() => {
            setShowForm(false);
            setFormError(null);
          }}
          onSubmit={handleCreate}
        />
      )}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-subtle bg-surface-elevated px-3 py-3 text-center">
      <p className="text-lg font-display font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      <p className="mt-0.5 text-2xs font-semibold uppercase tracking-[0.12em] text-text-muted">
        {label}
      </p>
    </div>
  );
}

function GoalCard({
  goal,
  busy,
  onDecrease,
  onIncrease,
  onComplete,
  onDelete,
}: {
  goal: Goal;
  busy: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
  onComplete: () => void;
  onDelete: () => void;
}) {
  const days = daysUntil(goal.deadline);
  const isDone = goal.status === "completed";
  const priority = goal.priority ? PRIORITY_META[goal.priority] : null;
  const progress = Math.min(100, Math.max(0, goal.progress || 0));

  return (
    <div className={`rounded-[20px] border p-4 ${surfaceClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {goal.category && (
              <span className="text-2xs font-semibold uppercase tracking-[0.14em] text-brand">
                {goal.category}
              </span>
            )}
            {priority && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold ${priority.cls}`}
              >
                <Flag size={10} />
                {priority.label}
              </span>
            )}
            {isDone && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-2xs font-semibold text-emerald-600">
                <Check size={10} />
                Done
              </span>
            )}
          </div>
          <h3 className="mt-1.5 line-clamp-2 text-sm font-semibold text-text-primary">
            {goal.title}
          </h3>
          {goal.description && (
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">
              {goal.description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          aria-label="Delete goal"
          className="shrink-0 rounded-lg p-1.5 text-text-muted transition hover:bg-surface-elevated hover:text-red-600 disabled:opacity-50"
        >
          <Trash2 size={15} />
        </button>
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-xs font-medium text-text-muted">
          <span>{progress}% complete</span>
          <span
            className={
              days !== null && days <= 2 && !isDone
                ? "font-semibold text-red-600"
                : ""
            }
          >
            {isDone ? formatDeadline(goal.deadline) : deadlineLabel(days)}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-elevated">
          <div
            className={`h-full rounded-full transition-all ${isDone ? "bg-emerald-500" : "bg-brand"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {!isDone && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onDecrease}
            disabled={busy || progress <= 0}
            aria-label="Decrease progress"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-subtle text-text-secondary transition hover:bg-surface-elevated disabled:opacity-40"
          >
            <Minus size={15} />
          </button>
          <button
            type="button"
            onClick={onIncrease}
            disabled={busy || progress >= 100}
            aria-label="Increase progress"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-subtle text-text-secondary transition hover:bg-surface-elevated disabled:opacity-40"
          >
            <Plus size={15} />
          </button>
          <button
            type="button"
            onClick={onComplete}
            disabled={busy}
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand/10 px-3 text-xs font-semibold text-brand transition hover:bg-brand/20 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Check size={13} />
            )}
            Mark done
          </button>
        </div>
      )}
    </div>
  );
}

function CreateGoalModal({
  form,
  setForm,
  submitting,
  error,
  onClose,
  onSubmit,
}: {
  form: typeof EMPTY_FORM;
  setForm: React.Dispatch<React.SetStateAction<typeof EMPTY_FORM>>;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-[24px] border border-subtle bg-surface-layer p-5 shadow-soft sm:rounded-[24px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-display font-semibold tracking-tight">
            New goal
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-text-muted transition hover:bg-surface-elevated"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <Field label="Title">
            <input
              autoFocus
              value={form.title}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, title: event.target.value }))
              }
              placeholder="e.g. Win the Chevening Scholarship"
              className="w-full rounded-xl border border-subtle bg-surface-body px-3 py-2.5 text-sm text-text-primary outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-500/30"
            />
          </Field>

          <Field label="Description (optional)">
            <textarea
              value={form.description}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  description: event.target.value,
                }))
              }
              rows={2}
              placeholder="What does success look like?"
              className="w-full resize-none rounded-xl border border-subtle bg-surface-body px-3 py-2.5 text-sm text-text-primary outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-500/30"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <input
                value={form.category}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, category: event.target.value }))
                }
                placeholder="Scholarship"
                className="w-full rounded-xl border border-subtle bg-surface-body px-3 py-2.5 text-sm text-text-primary outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-500/30"
              />
            </Field>
            <Field label="Deadline">
              <input
                type="date"
                value={form.deadline}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, deadline: event.target.value }))
                }
                className="w-full rounded-xl border border-subtle bg-surface-body px-3 py-2.5 text-sm text-text-primary outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-500/30"
              />
            </Field>
          </div>

          <Field label="Priority">
            <div className="flex gap-2">
              {(["low", "medium", "high"] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, priority: level }))}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold capitalize transition ${
                    form.priority === level
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-subtle text-text-secondary hover:bg-surface-elevated"
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </Field>

          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={onSubmit} disabled={submitting}>
            {submitting ? "Creating…" : "Create goal"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-text-secondary">
        {label}
      </span>
      {children}
    </label>
  );
}
