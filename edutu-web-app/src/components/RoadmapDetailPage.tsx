import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileText,
  Link as LinkIcon,
  Loader2,
  Map,
  RefreshCcw,
  Sparkles,
  Star,
  Target,
  Users,
} from 'lucide-react';
import { useDarkMode } from '../hooks/useDarkMode';
import {
  adoptRoadmap,
  fetchRoadmap,
  type BackendRoadmap,
  type BackendRoadmapResource,
  type BackendRoadmapStep,
  type RoadmapAdoptionResponse,
} from '../services/roadmapApi';
import ImageWithFallback from './ImageWithFallback';

function labelize(value?: string | null) {
  if (!value) return 'General';
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDate(value?: string | Date | null) {
  if (!value) return 'No date set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date set';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
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

function readOutcomes(roadmap: BackendRoadmap) {
  if (!roadmap.outcomes) return [];
  return roadmap.outcomes
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function readDeadlineStrategy(roadmap: BackendRoadmap) {
  return roadmap.deadlineStrategy || roadmap.deadline_strategy || null;
}

function readEnrollmentCount(roadmap: BackendRoadmap) {
  return Number(roadmap.enrollmentCount ?? roadmap.enrollment_count ?? 0);
}

function readRating(roadmap: BackendRoadmap) {
  return Number(roadmap.ratingAvg ?? roadmap.rating_avg ?? 0);
}

function readCommunityAction(response: RoadmapAdoptionResponse | null) {
  return response?.communityAction || response?.community_action || null;
}

function readReminderSchedule(response: RoadmapAdoptionResponse | null) {
  return response?.reminderSchedule || response?.reminder_schedule || [];
}

export default function RoadmapDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getToken } = useClerkAuth();
  const { isDarkMode } = useDarkMode();
  const [roadmap, setRoadmap] = useState<BackendRoadmap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [targetDeadline, setTargetDeadline] = useState('');
  const [calendarSyncEnabled, setCalendarSyncEnabled] = useState(true);
  const [adopting, setAdopting] = useState(false);
  const [adoption, setAdoption] = useState<RoadmapAdoptionResponse | null>(null);

  const loadRoadmap = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      const nextRoadmap = await fetchRoadmap(id);
      setRoadmap(nextRoadmap);
      setCalendarSyncEnabled(Boolean(nextRoadmap.calendarSyncEnabled ?? nextRoadmap.calendar_sync_enabled ?? true));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load roadmap.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadRoadmap();
  }, [loadRoadmap]);

  const outcomes = useMemo(
    () => (roadmap ? readOutcomes(roadmap) : []),
    [roadmap],
  );

  const steps = useMemo<BackendRoadmapStep[]>(
    () => roadmap?.steps ?? [],
    [roadmap],
  );

  const resources = useMemo<BackendRoadmapResource[]>(
    () => roadmap?.resources ?? [],
    [roadmap],
  );

  const adopt = async () => {
    if (!roadmap) return;
    setAdopting(true);
    setError(null);

    try {
      const token = await getToken().catch(() => null);
      if (!token) throw new Error('Your session has expired. Sign in again to adopt this roadmap.');

      const response = await adoptRoadmap(
        roadmap.id,
        {
          targetDeadline: targetDeadline ? new Date(targetDeadline).toISOString() : undefined,
          calendarSyncEnabled,
        },
        token,
      );
      setAdoption(response);
    } catch (adoptError) {
      setError(adoptError instanceof Error ? adoptError.message : 'Unable to adopt roadmap.');
    } finally {
      setAdopting(false);
    }
  };

  const communityAction = readCommunityAction(adoption);
  const reminders = readReminderSchedule(adoption);

  return (
    <div className={`min-h-[100dvh] ${isDarkMode ? 'bg-gray-950 text-white' : 'bg-slate-50 text-slate-950'}`}>
      <header className={`sticky top-0 z-30 border-b backdrop-blur-xl ${isDarkMode ? 'border-white/10 bg-gray-950/90' : 'border-slate-200 bg-white/90'}`}>
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigate('/roadmaps')}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <ArrowLeft size={17} />
            Roadmaps
          </button>
          <button
            type="button"
            onClick={loadRoadmap}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-500 px-3 text-sm font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 size={17} className="animate-spin" /> : <RefreshCcw size={17} />}
            Refresh
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {error ? (
          <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className={`h-[520px] animate-pulse rounded-[20px] border ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-white'}`} />
            <div className={`h-[420px] animate-pulse rounded-[20px] border ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-white'}`} />
          </div>
        ) : !roadmap ? (
          <section className={`rounded-[20px] border p-10 text-center ${isDarkMode ? 'border-white/10 bg-gray-900/70' : 'border-slate-200 bg-white'}`}>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
              <BookOpen size={22} />
            </div>
            <h1 className="mt-4 text-base font-black">Roadmap unavailable</h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
              This roadmap is not published or no longer exists.
            </p>
          </section>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-5">
              <section className={`overflow-hidden rounded-[20px] border ${isDarkMode ? 'border-white/10 bg-gray-900/70' : 'border-slate-200 bg-white shadow-sm'}`}>
                <ImageWithFallback
                  src={readCoverImage(roadmap)}
                  alt={roadmap.title}
                  className="h-64 w-full object-cover"
                  fallbackIcon="globe"
                  fallbackClassName="h-64 w-full bg-slate-100 dark:bg-white/5"
                />
                <div className="p-5 sm:p-6">
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
                  <h1 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">
                    {roadmap.title}
                  </h1>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                    {roadmap.description}
                  </p>
                  <div className="mt-5 grid gap-3 sm:grid-cols-4">
                    {[
                      ['Duration', readDuration(roadmap), <CalendarClock size={16} />],
                      ['Audience', readTargetAudience(roadmap), <Target size={16} />],
                      ['Enrolled', readEnrollmentCount(roadmap).toString(), <Users size={16} />],
                      ['Rating', readRating(roadmap) > 0 ? readRating(roadmap).toFixed(1) : 'New', <Star size={16} />],
                    ].map(([label, value, icon]) => (
                      <div key={label as string} className={`rounded-2xl border p-3 ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50'}`}>
                        <p className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                          {icon}
                          {label}
                        </p>
                        <p className="mt-2 line-clamp-2 text-sm font-black">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className={`rounded-[20px] border p-5 sm:p-6 ${isDarkMode ? 'border-white/10 bg-gray-900/70' : 'border-slate-200 bg-white shadow-sm'}`}>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
                    <Map size={19} />
                  </div>
                  <div>
                    <h2 className="text-lg font-black tracking-tight">Plan steps</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{steps.length} steps in this roadmap</p>
                  </div>
                </div>
                <div className="mt-5 space-y-3">
                  {steps.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
                      This roadmap has no published steps yet.
                    </div>
                  ) : (
                    steps.map((step, index) => (
                      <article key={step.id || `${step.title}-${index}`} className={`rounded-2xl border p-4 ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50'}`}>
                        <div className="flex gap-4">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-sm font-black text-white">
                            {index + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-black">{step.title}</h3>
                              {step.duration ? (
                                <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                                  {step.duration}
                                </span>
                              ) : null}
                              {typeof step.relativeDueDays === 'number' ? (
                                <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                                  {step.relativeDueDays < 0
                                    ? `${Math.abs(step.relativeDueDays)}d before deadline`
                                    : `${step.relativeDueDays}d after start`}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
                              {step.description}
                            </p>
                          </div>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>

              {(outcomes.length > 0 || resources.length > 0) ? (
                <section className="grid gap-5 lg:grid-cols-2">
                  {outcomes.length > 0 ? (
                    <div className={`rounded-[20px] border p-5 ${isDarkMode ? 'border-white/10 bg-gray-900/70' : 'border-slate-200 bg-white shadow-sm'}`}>
                      <h2 className="flex items-center gap-2 text-lg font-black tracking-tight">
                        <CheckCircle2 size={18} />
                        Outcomes
                      </h2>
                      <div className="mt-4 space-y-2">
                        {outcomes.map((outcome) => (
                          <div key={outcome} className="flex gap-3 text-sm font-semibold text-slate-600 dark:text-slate-300">
                            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-500" />
                            {outcome}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {resources.length > 0 ? (
                    <div className={`rounded-[20px] border p-5 ${isDarkMode ? 'border-white/10 bg-gray-900/70' : 'border-slate-200 bg-white shadow-sm'}`}>
                      <h2 className="flex items-center gap-2 text-lg font-black tracking-tight">
                        <FileText size={18} />
                        Resources
                      </h2>
                      <div className="mt-4 space-y-2">
                        {resources.map((resource, index) => (
                          <a
                            key={resource.id || `${resource.title}-${index}`}
                            href={resource.url || undefined}
                            target="_blank"
                            rel="noreferrer"
                            className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-sm font-bold transition ${resource.url ? 'hover:border-brand-500/40 hover:text-brand-700 dark:hover:text-brand-200' : 'pointer-events-none opacity-70'} ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50'}`}
                          >
                            <span className="inline-flex min-w-0 items-center gap-2">
                              <LinkIcon size={15} className="shrink-0" />
                              <span className="truncate">{resource.title}</span>
                            </span>
                            {resource.url ? <ExternalLink size={14} className="shrink-0" /> : null}
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </section>
              ) : null}
            </div>

            <aside className="space-y-5">
              <section className={`rounded-[20px] border p-5 ${isDarkMode ? 'border-white/10 bg-gray-900/70' : 'border-slate-200 bg-white shadow-sm'}`}>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-500 text-white">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <h2 className="text-lg font-black tracking-tight">Adopt roadmap</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Create your own working plan.</p>
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  <label className="block">
                    <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                      Target deadline
                    </span>
                    <input
                      type="date"
                      value={targetDeadline}
                      onChange={(event) => setTargetDeadline(event.target.value)}
                      className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 dark:border-white/10 dark:bg-gray-950 dark:text-white"
                    />
                  </label>

                  <label className={`flex items-center justify-between gap-3 rounded-2xl border p-3 text-sm font-bold ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50'}`}>
                    <span className="inline-flex items-center gap-2">
                      <CalendarClock size={16} />
                      Calendar sync
                    </span>
                    <input
                      type="checkbox"
                      checked={calendarSyncEnabled}
                      onChange={() => setCalendarSyncEnabled((current) => !current)}
                      className="h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-500"
                    />
                  </label>

                  {readDeadlineStrategy(roadmap) ? (
                    <div className="rounded-2xl bg-brand-500/10 p-3 text-sm leading-6 text-brand-800 dark:text-brand-100">
                      {readDeadlineStrategy(roadmap)}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={adopt}
                    disabled={adopting}
                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 px-4 text-sm font-black text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {adopting ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />}
                    Adopt roadmap
                  </button>
                </div>
              </section>

              {adoption ? (
                <section className={`rounded-[20px] border p-5 ${isDarkMode ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-emerald-200 bg-emerald-50'}`}>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-300" size={20} />
                    <div>
                      <h2 className="text-base font-black text-emerald-800 dark:text-emerald-100">Roadmap adopted</h2>
                      <p className="mt-1 text-sm leading-6 text-emerald-700 dark:text-emerald-200">
                        Your working plan is ready. Calendar events and reminders are generated from the deadline settings.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 text-sm font-bold text-emerald-800 dark:text-emerald-100">
                    <div className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2 dark:bg-white/10">
                      <span>Target deadline</span>
                      <span>{formatDate(adoption.targetDeadline || adoption.target_deadline)}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2 dark:bg-white/10">
                      <span>Calendar events</span>
                      <span>{adoption.calendar?.eventCount ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2 dark:bg-white/10">
                      <span>Reminders</span>
                      <span>{reminders.length}</span>
                    </div>
                  </div>
                  {communityAction ? (
                    <button
                      type="button"
                      onClick={() => navigate(communityAction.route)}
                      className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 text-sm font-black text-white transition hover:bg-emerald-700"
                    >
                      {communityAction.label}
                      <ChevronRight size={16} />
                    </button>
                  ) : null}
                </section>
              ) : null}
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
