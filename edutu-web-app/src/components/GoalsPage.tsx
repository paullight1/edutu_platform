import { useMemo, useState, type FormEvent } from 'react';
import {
  Archive,
  Calendar,
  Check,
  ChevronLeft,
  Flag,
  Loader2,
  Plus,
  RefreshCcw,
  Target,
  Trash2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useGoals, type Goal, type GoalStatus } from '../hooks/useGoals';
import { useDarkMode } from '../hooks/useDarkMode';

type GoalFilter = 'active' | 'completed' | 'archived' | 'all';

const statusLabels: Record<GoalStatus, string> = {
  active: 'Active',
  completed: 'Completed',
  archived: 'Archived',
};

function formatDate(value?: string | null) {
  if (!value) return 'No deadline';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No deadline';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function daysUntil(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

function dueLabel(goal: Goal) {
  const days = daysUntil(goal.deadline);
  if (days === null) return 'No deadline';
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  return `Due in ${days}d`;
}

export default function GoalsPage() {
  const navigate = useNavigate();
  const { isDarkMode } = useDarkMode();
  const { goals, isLoading, refreshGoals, createGoal, updateGoal, deleteGoal } = useGoals();
  const [filter, setFilter] = useState<GoalFilter>('active');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Scholarship');
  const [deadline, setDeadline] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const filteredGoals = useMemo(() => {
    const list = filter === 'all' ? goals : goals.filter((goal) => goal.status === filter);
    return [...list].sort((left, right) => {
      const leftDays = daysUntil(left.deadline) ?? Number.MAX_SAFE_INTEGER;
      const rightDays = daysUntil(right.deadline) ?? Number.MAX_SAFE_INTEGER;
      return leftDays - rightDays;
    });
  }, [filter, goals]);

  const summary = useMemo(() => {
    const active = goals.filter((goal) => goal.status === 'active');
    const completed = goals.filter((goal) => goal.status === 'completed');
    const dueSoon = active.filter((goal) => {
      const days = daysUntil(goal.deadline);
      return days !== null && days >= 0 && days <= 7;
    });

    const averageProgress = active.length
      ? Math.round(active.reduce((total, goal) => total + goal.progress, 0) / active.length)
      : 0;

    return {
      active: active.length,
      completed: completed.length,
      dueSoon: dueSoon.length,
      averageProgress,
    };
  }, [goals]);

  const runAction = async (key: string, action: () => Promise<void>) => {
    setBusyAction(key);
    setError(null);
    try {
      await action();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to update goals right now.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreateGoal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) {
      setError('Goal title is required.');
      return;
    }

    await runAction('create', async () => {
      await createGoal({
        title,
        category,
        deadline: deadline ? new Date(deadline).toISOString() : undefined,
        progress: 0,
        source: 'custom',
      });
      setTitle('');
      setDeadline('');
      setCategory('Scholarship');
      setFilter('active');
    });
  };

  const updateProgress = (goal: Goal, nextProgress: number) => {
    const progress = Math.min(Math.max(nextProgress, 0), 100);
    const status: GoalStatus = progress >= 100 ? 'completed' : 'active';
    void runAction(`progress-${goal.id}`, () => updateGoal(goal.id, { progress, status }));
  };

  return (
    <div className={`min-h-[100dvh] ${isDarkMode ? 'bg-gray-950 text-white' : 'bg-slate-50 text-slate-950'}`}>
      <header className={`sticky top-0 z-30 border-b backdrop-blur-xl ${isDarkMode ? 'border-white/10 bg-gray-950/90' : 'border-slate-200 bg-white/90'}`}>
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <ChevronLeft size={17} />
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => navigate('/deadlines')}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-500 px-3 text-sm font-bold text-white transition hover:bg-brand-600"
          >
            <Calendar size={17} />
            Deadlines
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section className={`rounded-[20px] border p-5 sm:p-6 ${isDarkMode ? 'border-white/10 bg-gray-900/70' : 'border-slate-200 bg-white shadow-sm'}`}>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
                <Target size={22} />
              </div>
              <h1 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">Goals tracking</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                Track scholarship, career, and preparation goals with progress and deadline visibility.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-4">
                {[
                  ['Active', summary.active],
                  ['Completed', summary.completed],
                  ['Due soon', summary.dueSoon],
                  ['Avg progress', `${summary.averageProgress}%`],
                ].map(([label, value]) => (
                  <div key={label} className={`rounded-2xl border p-4 ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50'}`}>
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{label}</p>
                    <p className="mt-2 text-2xl font-black">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            <form onSubmit={handleCreateGoal} className={`rounded-2xl border p-4 ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50'}`}>
              <div className="flex items-center gap-2 text-sm font-black">
                <Plus size={16} />
                Add goal
              </div>
              <label className="mt-4 block text-sm font-bold">
                <span>Title</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-gray-950 dark:text-white"
                  placeholder="Prepare Chevening application"
                />
              </label>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <label className="block text-sm font-bold">
                  <span>Category</span>
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-gray-950 dark:text-white"
                  >
                    <option>Scholarship</option>
                    <option>Career</option>
                    <option>CV</option>
                    <option>Skills</option>
                    <option>Personal</option>
                  </select>
                </label>
                <label className="block text-sm font-bold">
                  <span>Deadline</span>
                  <input
                    type="date"
                    value={deadline}
                    onChange={(event) => setDeadline(event.target.value)}
                    className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-gray-950 dark:text-white"
                  />
                </label>
              </div>
              <button
                type="submit"
                disabled={busyAction === 'create'}
                className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 text-sm font-black text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyAction === 'create' ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Create goal
              </button>
            </form>
          </div>
        </section>

        {error ? (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </div>
        ) : null}

        <section className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {(['active', 'completed', 'archived', 'all'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFilter(item)}
                  className={`h-10 rounded-xl px-3 text-sm font-bold capitalize transition ${
                    filter === item
                      ? 'bg-brand-500 text-white'
                      : isDarkMode
                        ? 'bg-white/5 text-slate-300 hover:bg-white/10'
                        : 'bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => runAction('refresh', refreshGoals)}
              disabled={busyAction === 'refresh'}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
            >
              {busyAction === 'refresh' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}
              Refresh
            </button>
          </div>

          {isLoading ? (
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className={`h-44 animate-pulse rounded-[20px] border ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-white'}`} />
              ))}
            </div>
          ) : filteredGoals.length === 0 ? (
            <div className={`mt-5 rounded-[20px] border p-10 text-center ${isDarkMode ? 'border-white/10 bg-gray-900/70' : 'border-slate-200 bg-white'}`}>
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
                <Flag size={22} />
              </div>
              <h2 className="mt-4 text-base font-black">No goals in this view</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
                Create a goal with a deadline to connect it to the tracker and reminders.
              </p>
            </div>
          ) : (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {filteredGoals.map((goal) => (
                <article key={goal.id} className={`rounded-[20px] border p-5 ${isDarkMode ? 'border-white/10 bg-gray-900/70' : 'border-slate-200 bg-white shadow-sm'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-black uppercase tracking-[0.12em] text-brand-600 dark:text-brand-300">
                        {goal.category || 'Goal'}
                      </p>
                      <h2 className="mt-2 text-base font-black leading-6">{goal.title}</h2>
                      {goal.description ? (
                        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{goal.description}</p>
                      ) : null}
                    </div>
                    <span className="shrink-0 rounded-xl bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600 dark:bg-white/10 dark:text-slate-300">
                      {statusLabels[goal.status]}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 dark:bg-white/10">
                      <Calendar size={13} />
                      {formatDate(goal.deadline)}
                    </span>
                    <span className="inline-flex rounded-lg bg-slate-100 px-2 py-1 dark:bg-white/10">
                      {dueLabel(goal)}
                    </span>
                  </div>

                  <div className="mt-5">
                    <div className="mb-2 flex items-center justify-between text-xs font-black">
                      <span>Progress</span>
                      <span>{goal.progress}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={10}
                      value={goal.progress}
                      onChange={(event) => updateProgress(goal, Number(event.target.value))}
                      disabled={busyAction === `progress-${goal.id}`}
                      className="w-full accent-brand-500"
                      aria-label={`Progress for ${goal.title}`}
                    />
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => updateProgress(goal, 100)}
                      disabled={goal.status === 'completed' || busyAction === `progress-${goal.id}`}
                      className="inline-flex h-9 items-center gap-2 rounded-xl bg-emerald-600 px-3 text-xs font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Check size={14} />
                      Complete
                    </button>
                    <button
                      type="button"
                      onClick={() => runAction(`archive-${goal.id}`, () => updateGoal(goal.id, { status: 'archived' }))}
                      disabled={goal.status === 'archived' || busyAction === `archive-${goal.id}`}
                      className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
                    >
                      <Archive size={14} />
                      Archive
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDeleteId(goal.id)}
                      disabled={busyAction === `delete-${goal.id}`}
                      className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-500 transition hover:bg-slate-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-rose-300"
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>
                  {confirmingDeleteId === goal.id ? (
                    <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
                      <p className="font-black">Delete this goal?</p>
                      <p className="mt-1 leading-5">This removes it from your tracker and deadline list.</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmingDeleteId(null)}
                          className="inline-flex h-9 items-center rounded-xl border border-rose-200 px-3 text-xs font-black text-rose-700 transition hover:bg-white dark:border-rose-500/30 dark:text-rose-200 dark:hover:bg-white/10"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => runAction(`delete-${goal.id}`, async () => {
                            await deleteGoal(goal.id);
                            setConfirmingDeleteId(null);
                          })}
                          disabled={busyAction === `delete-${goal.id}`}
                          className="inline-flex h-9 items-center gap-2 rounded-xl bg-rose-600 px-3 text-xs font-black text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {busyAction === `delete-${goal.id}` ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          Delete goal
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
