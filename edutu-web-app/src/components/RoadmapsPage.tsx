import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  CalendarClock,
  ChevronRight,
  Loader2,
  Map,
  RefreshCcw,
  Search,
  SlidersHorizontal,
  Star,
  Users,
} from 'lucide-react';
import { useDarkMode } from '../hooks/useDarkMode';
import {
  fetchRoadmaps,
  type BackendRoadmap,
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

function readDuration(roadmap: BackendRoadmap) {
  return roadmap.estimatedDuration || roadmap.estimated_duration || 'Self paced';
}

function readCoverImage(roadmap: BackendRoadmap) {
  return roadmap.coverImage || roadmap.cover_image || '';
}

function readEnrollmentCount(roadmap: BackendRoadmap) {
  return Number(roadmap.enrollmentCount ?? roadmap.enrollment_count ?? 0);
}

function readRating(roadmap: BackendRoadmap) {
  return Number(roadmap.ratingAvg ?? roadmap.rating_avg ?? 0);
}

export default function RoadmapsPage() {
  const navigate = useNavigate();
  const { isDarkMode } = useDarkMode();
  const [roadmaps, setRoadmaps] = useState<BackendRoadmap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [difficulty, setDifficulty] = useState('');

  const loadRoadmaps = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setRoadmaps(
        await fetchRoadmaps({
          search: search.trim() || undefined,
          category: category || undefined,
          difficulty: difficulty || undefined,
          limit: 60,
        }),
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load roadmaps.');
    } finally {
      setLoading(false);
    }
  }, [category, difficulty, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRoadmaps();
    }, 180);

    return () => window.clearTimeout(timer);
  }, [loadRoadmaps]);

  const featuredCount = useMemo(
    () => roadmaps.filter((roadmap) => Boolean(roadmap.isFeatured ?? roadmap.is_featured)).length,
    [roadmaps],
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
              onClick={() => navigate('/roadmap-templates')}
              className="hidden h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10 sm:inline-flex"
            >
              <BookOpen size={17} />
              Templates
            </button>
            <button
              type="button"
              onClick={loadRoadmaps}
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
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
                <Map size={22} />
              </div>
              <h1 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">Roadmaps</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                Explore published Edutu roadmaps, then adopt reusable plans into deadlines, reminders, and calendar-ready work.
              </p>
            </div>
            <div className={`grid grid-cols-3 gap-3 rounded-2xl border p-4 ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50'}`}>
              {[
                ['Published', roadmaps.length],
                ['Featured', featuredCount],
                ['Categories', categories.length - 1],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{label}</p>
                  <p className="mt-2 text-2xl font-black">{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_200px_180px]">
            <label className="relative block">
              <span className="sr-only">Search roadmaps</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-4 text-sm font-semibold outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 dark:border-white/10 dark:bg-gray-950 dark:text-white"
                placeholder="Search by title"
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
        ) : roadmaps.length === 0 ? (
          <section className={`mt-5 rounded-[20px] border p-10 text-center ${isDarkMode ? 'border-white/10 bg-gray-900/70' : 'border-slate-200 bg-white'}`}>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
              <BookOpen size={22} />
            </div>
            <h2 className="mt-4 text-base font-black">No published roadmaps found</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
              Adjust the search or filters to find an available roadmap.
            </p>
          </section>
        ) : (
          <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {roadmaps.map((roadmap) => {
              const enrollmentCount = readEnrollmentCount(roadmap);
              const rating = readRating(roadmap);

              return (
                <article
                  key={roadmap.id}
                  className={`overflow-hidden rounded-[20px] border transition hover:-translate-y-0.5 ${isDarkMode ? 'border-white/10 bg-gray-900/70 hover:bg-gray-900' : 'border-slate-200 bg-white shadow-sm hover:shadow-md'}`}
                >
                  <ImageWithFallback
                    src={readCoverImage(roadmap)}
                    alt={roadmap.title}
                    className="h-40 w-full object-cover"
                    fallbackIcon="globe"
                    fallbackClassName="h-40 w-full bg-slate-100 dark:bg-white/5"
                  />
                  <div className="p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-brand-500/10 px-2 py-1 text-[11px] font-black text-brand-700 dark:text-brand-200">
                        {labelize(roadmap.category)}
                      </span>
                      <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-600 dark:bg-white/10 dark:text-slate-300">
                        {labelize(roadmap.difficulty)}
                      </span>
                      {(roadmap.isFeatured ?? roadmap.is_featured) ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-amber-500/10 px-2 py-1 text-[11px] font-black text-amber-700 dark:text-amber-300">
                          <Star size={12} />
                          Featured
                        </span>
                      ) : null}
                    </div>
                    <h2 className="mt-3 line-clamp-2 text-lg font-black tracking-tight">
                      {roadmap.title}
                    </h2>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600 dark:text-slate-400">
                      {roadmap.description}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 dark:bg-white/10">
                        <CalendarClock size={13} />
                        {readDuration(roadmap)}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 dark:bg-white/10">
                        <Users size={13} />
                        {enrollmentCount} enrolled
                      </span>
                      {rating > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 dark:bg-white/10">
                          <Star size={13} />
                          {rating.toFixed(1)}
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(`/roadmaps/${roadmap.id}`)}
                      className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 px-4 text-sm font-black text-white transition hover:bg-brand-600"
                    >
                      Open roadmap
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
