import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  CalendarClock,
  ChevronRight,
  Layers3,
  Loader2,
  Map,
  RefreshCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
} from 'lucide-react';
import { useDarkMode } from '../hooks/useDarkMode';
import {
  fetchRoadmapTemplates,
  type BackendRoadmap,
  type BackendRoadmapStep,
} from '../services/roadmapApi';
import ImageWithFallback from './ImageWithFallback';

const categories = [
  { value: '', label: 'All categories' },
  { value: 'scholarship', label: 'Scholarship' },
  { value: 'career', label: 'Career' },
  { value: 'education', label: 'Education' },
  { value: 'skills', label: 'Skills' },
  { value: 'business', label: 'Business' },
  { value: 'tech', label: 'Tech' },
  { value: 'personal', label: 'Personal' },
  { value: 'general', label: 'General' },
];

const difficulties = [
  { value: '', label: 'All levels' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

function labelize(value?: string | null) {
  if (!value) return 'General';
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function readCoverImage(roadmap: BackendRoadmap) {
  return roadmap.coverImage || roadmap.cover_image || '';
}

function readDuration(roadmap: BackendRoadmap) {
  return roadmap.estimatedDuration || roadmap.estimated_duration || 'Self paced';
}

function readTargetAudience(roadmap: BackendRoadmap) {
  return roadmap.targetAudience || roadmap.target_audience || 'Learners preparing for this outcome';
}

function readCalendarSync(roadmap: BackendRoadmap) {
  return Boolean(roadmap.calendarSyncEnabled ?? roadmap.calendar_sync_enabled);
}

function readSteps(roadmap: BackendRoadmap): BackendRoadmapStep[] {
  return Array.isArray(roadmap.steps) ? roadmap.steps : [];
}

function readOutcomes(roadmap: BackendRoadmap) {
  if (!roadmap.outcomes) return [];
  return roadmap.outcomes
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
}

export default function RoadmapTemplatesPage() {
  const navigate = useNavigate();
  const { isDarkMode } = useDarkMode();
  const [templates, setTemplates] = useState<BackendRoadmap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [deadlineReadyOnly, setDeadlineReadyOnly] = useState(false);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const nextTemplates = await fetchRoadmapTemplates({
        search: search.trim() || undefined,
        category: category || undefined,
        difficulty: difficulty || undefined,
        limit: 80,
      });
      setTemplates(nextTemplates);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load roadmap templates.');
    } finally {
      setLoading(false);
    }
  }, [category, difficulty, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadTemplates();
    }, 180);

    return () => window.clearTimeout(timer);
  }, [loadTemplates]);

  const visibleTemplates = useMemo(
    () =>
      templates.filter((template) => {
        if (!deadlineReadyOnly) return true;
        return readCalendarSync(template) || readSteps(template).some((step) => typeof step.relativeDueDays === 'number');
      }),
    [deadlineReadyOnly, templates],
  );

  const stats = useMemo(
    () => [
      ['Templates', templates.length],
      ['Deadline-ready', templates.filter((template) => readCalendarSync(template)).length],
      ['Categories', new Set(templates.map((template) => template.category).filter(Boolean)).size],
    ],
    [templates],
  );

  return (
    <div className={`min-h-[100dvh] ${isDarkMode ? 'bg-gray-950 text-white' : 'bg-slate-50 text-slate-950'}`}>
      <header className={`sticky top-0 z-30 border-b backdrop-blur-xl ${isDarkMode ? 'border-white/10 bg-gray-950/90' : 'border-slate-200 bg-white/90'}`}>
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <ArrowLeft size={17} />
            Dashboard
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/roadmaps')}
              className="hidden h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10 sm:inline-flex"
            >
              <Map size={17} />
              Roadmaps
            </button>
            <button
              type="button"
              onClick={loadTemplates}
              disabled={loading}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-500 px-3 text-sm font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <Loader2 size={17} className="animate-spin" /> : <RefreshCcw size={17} />}
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section className={`rounded-[20px] border p-5 sm:p-6 ${isDarkMode ? 'border-white/10 bg-gray-900/70' : 'border-slate-200 bg-white shadow-sm'}`}>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
                <Layers3 size={22} />
              </div>
              <h1 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">Roadmap templates</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                Start from a published Edutu plan, then adopt it into your own calendar, reminders, and step-by-step work list.
              </p>
            </div>
            <div className={`grid grid-cols-3 gap-3 rounded-2xl border p-4 ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50'}`}>
              {stats.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{label}</p>
                  <p className="mt-2 text-2xl font-black">{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 grid gap-3 xl:grid-cols-[minmax(0,1fr)_200px_180px_190px]">
            <label className="relative block">
              <span className="sr-only">Search templates</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-4 text-sm font-semibold outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 dark:border-white/10 dark:bg-gray-950 dark:text-white"
                placeholder="Search templates"
              />
            </label>
            <label className="relative block">
              <span className="sr-only">Category</span>
              <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="h-12 w-full appearance-none rounded-2xl border border-slate-200 bg-white pl-10 pr-4 text-sm font-bold outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 dark:border-white/10 dark:bg-gray-950 dark:text-white"
              >
                {categories.map((item) => (
                  <option key={item.value || 'all'} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="sr-only">Difficulty</span>
              <select
                value={difficulty}
                onChange={(event) => setDifficulty(event.target.value)}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 dark:border-white/10 dark:bg-gray-950 dark:text-white"
              >
                {difficulties.map((item) => (
                  <option key={item.value || 'all'} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={`flex h-12 items-center justify-between gap-3 rounded-2xl border px-4 text-sm font-bold ${isDarkMode ? 'border-white/10 bg-gray-950' : 'border-slate-200 bg-white'}`}>
              <span className="inline-flex items-center gap-2">
                <CalendarClock size={16} />
                Deadline-ready
              </span>
              <input
                type="checkbox"
                checked={deadlineReadyOnly}
                onChange={() => setDeadlineReadyOnly((current) => !current)}
                className="h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-500"
              />
            </label>
          </div>
        </section>

        {error ? (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className={`h-80 animate-pulse rounded-[20px] border ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-white'}`} />
            ))}
          </div>
        ) : visibleTemplates.length === 0 ? (
          <section className={`mt-5 rounded-[20px] border p-10 text-center ${isDarkMode ? 'border-white/10 bg-gray-900/70' : 'border-slate-200 bg-white'}`}>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
              <BookOpen size={22} />
            </div>
            <h2 className="mt-4 text-base font-black">No roadmap templates found</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
              Change the filters or open all roadmaps to find a published plan.
            </p>
            <button
              type="button"
              onClick={() => navigate('/roadmaps')}
              className="mt-5 inline-flex h-10 items-center justify-center rounded-xl bg-brand-500 px-4 text-sm font-bold text-white transition hover:bg-brand-600"
            >
              Open roadmaps
            </button>
          </section>
        ) : (
          <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleTemplates.map((template) => {
              const steps = readSteps(template);
              const outcomes = readOutcomes(template);
              const deadlineReady =
                readCalendarSync(template) || steps.some((step) => typeof step.relativeDueDays === 'number');

              return (
                <article
                  key={template.id}
                  className={`overflow-hidden rounded-[20px] border transition hover:-translate-y-0.5 ${isDarkMode ? 'border-white/10 bg-gray-900/70 hover:bg-gray-900' : 'border-slate-200 bg-white shadow-sm hover:shadow-md'}`}
                >
                  <ImageWithFallback
                    src={readCoverImage(template)}
                    alt={template.title}
                    className="h-40 w-full object-cover"
                    fallbackIcon="globe"
                    fallbackClassName="h-40 w-full bg-slate-100 dark:bg-white/5"
                  />
                  <div className="p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-brand-500/10 px-2 py-1 text-[11px] font-black text-brand-700 dark:text-brand-200">
                        {labelize(template.category)}
                      </span>
                      <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-600 dark:bg-white/10 dark:text-slate-300">
                        {labelize(template.difficulty)}
                      </span>
                      {deadlineReady ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2 py-1 text-[11px] font-black text-emerald-700 dark:text-emerald-300">
                          <CalendarClock size={12} />
                          Deadline-ready
                        </span>
                      ) : null}
                    </div>
                    <h2 className="mt-3 line-clamp-2 text-lg font-black tracking-tight">
                      {template.title}
                    </h2>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600 dark:text-slate-400">
                      {template.description}
                    </p>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {[
                        ['Steps', steps.length.toString(), <Layers3 size={14} />],
                        ['Duration', readDuration(template), <CalendarClock size={14} />],
                        ['Audience', readTargetAudience(template), <Target size={14} />],
                      ].map(([label, value, icon]) => (
                        <div key={label as string} className={`min-w-0 rounded-xl border p-2 ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50'}`}>
                          <p className="flex items-center gap-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                            {icon}
                            {label}
                          </p>
                          <p className="mt-1 truncate text-xs font-black">{value}</p>
                        </div>
                      ))}
                    </div>

                    {outcomes.length > 0 ? (
                      <div className="mt-4 space-y-1">
                        {outcomes.map((outcome) => (
                          <p key={outcome} className="flex items-start gap-2 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
                            <Sparkles size={13} className="mt-1 shrink-0 text-brand-500" />
                            <span className="line-clamp-1">{outcome}</span>
                          </p>
                        ))}
                      </div>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => navigate(`/roadmaps/${template.id}?from=templates`)}
                      className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 px-4 text-sm font-black text-white transition hover:bg-brand-600"
                    >
                      Use template
                      <ChevronRight size={17} />
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}
