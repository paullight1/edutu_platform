import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Loader2,
  RefreshCcw,
  Search,
  Send,
  Trash2,
} from 'lucide-react';
import { useAuth as useAppAuth } from '../hooks/useAuth';
import { useDarkMode } from '../hooks/useDarkMode';
import {
  getApplications,
  removeApplication,
  updateApplicationStatus,
  type ApplicationRecord,
  type ApplicationStatus,
} from '../services/applications';

type ApplicationFilter = 'all' | ApplicationStatus;

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under review',
  accepted: 'Accepted',
  rejected: 'Rejected',
};

const STATUS_OPTIONS: ApplicationStatus[] = [
  'draft',
  'submitted',
  'under_review',
  'accepted',
  'rejected',
];

function formatDate(value?: string | null) {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function statusTone(status: ApplicationStatus) {
  switch (status) {
    case 'accepted':
      return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
    case 'rejected':
      return 'bg-rose-500/10 text-rose-700 dark:text-rose-300';
    case 'under_review':
      return 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300';
    case 'submitted':
      return 'bg-brand-500/10 text-brand-700 dark:text-brand-300';
    default:
      return 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300';
  }
}

export default function ApplicationsPage() {
  const navigate = useNavigate();
  const { getToken } = useClerkAuth();
  const { user } = useAppAuth();
  const { isDarkMode } = useDarkMode();
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ApplicationFilter>('all');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const resolveToken = useCallback(async () => {
    const token = await getToken().catch(() => null);
    if (!token) throw new Error('Your session has expired. Sign in again to manage applications.');
    return token;
  }, [getToken]);

  const loadApplications = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const token = await resolveToken();
      setApplications(await getApplications(user.id, token));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load applications.');
    } finally {
      setLoading(false);
    }
  }, [resolveToken, user?.id]);

  useEffect(() => {
    void loadApplications();
  }, [loadApplications]);

  const visibleApplications = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return applications.filter((application) => {
      if (filter !== 'all' && application.status !== filter) return false;
      if (!normalizedQuery) return true;
      return [
        application.opportunity_title,
        application.opportunity_category,
        application.notes ?? '',
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [applications, filter, query]);

  const stats = useMemo(
    () => [
      ['Tracked', applications.length],
      ['Submitted', applications.filter((item) => item.status === 'submitted').length],
      ['In review', applications.filter((item) => item.status === 'under_review').length],
      ['Accepted', applications.filter((item) => item.status === 'accepted').length],
    ],
    [applications],
  );

  const changeStatus = async (application: ApplicationRecord, status: ApplicationStatus) => {
    if (status === application.status) return;
    setUpdatingId(application.id);
    setError(null);
    try {
      const token = await resolveToken();
      const updated = await updateApplicationStatus(application.id, status, token);
      setApplications((current) =>
        current.map((item) => (item.id === application.id ? { ...item, ...updated } : item)),
      );
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update application status.');
    } finally {
      setUpdatingId(null);
    }
  };

  const deleteApplication = async (application: ApplicationRecord) => {
    if (confirmingId !== application.id) {
      setConfirmingId(application.id);
      return;
    }

    setUpdatingId(application.id);
    setError(null);
    try {
      const token = await resolveToken();
      await removeApplication(application.id, token);
      setApplications((current) => current.filter((item) => item.id !== application.id));
      setConfirmingId(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to remove application.');
    } finally {
      setUpdatingId(null);
    }
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
            onClick={loadApplications}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-500 px-3 text-sm font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 size={17} className="animate-spin" /> : <RefreshCcw size={17} />}
            Refresh
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section className={`rounded-[20px] border p-5 sm:p-6 ${isDarkMode ? 'border-white/10 bg-gray-900/70' : 'border-slate-200 bg-white shadow-sm'}`}>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
                <Send size={22} />
              </div>
              <h1 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">Application tracker</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                Track every opportunity you apply for and keep each status current from draft through outcome.
              </p>
            </div>
            <div className={`grid grid-cols-2 gap-3 rounded-2xl border p-4 sm:grid-cols-4 ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50'}`}>
              {stats.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{label}</p>
                  <p className="mt-2 text-2xl font-black">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {error ? (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </div>
        ) : null}

        <section className="mt-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative max-w-xl flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search applications"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-gray-900 dark:text-white"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {(['all', ...STATUS_OPTIONS] as ApplicationFilter[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFilter(item)}
                  className={`h-10 rounded-xl px-3 text-sm font-black transition ${
                    filter === item
                      ? 'bg-brand-500 text-white'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-gray-900 dark:text-slate-300 dark:hover:bg-white/10'
                  }`}
                >
                  {item === 'all' ? 'All' : STATUS_LABELS[item]}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="mt-5 space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className={`h-28 animate-pulse rounded-[20px] border ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-white'}`} />
              ))}
            </div>
          ) : visibleApplications.length === 0 ? (
            <div className={`mt-5 rounded-[20px] border p-10 text-center ${isDarkMode ? 'border-white/10 bg-gray-900/70' : 'border-slate-200 bg-white'}`}>
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
                <Briefcase size={22} />
              </div>
              <h2 className="mt-4 text-base font-black">No tracked applications</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
                Open an opportunity and use the application action to add it to this tracker.
              </p>
              <button
                type="button"
                onClick={() => navigate('/opportunities')}
                className="mt-5 inline-flex h-10 items-center justify-center rounded-xl bg-brand-500 px-4 text-sm font-bold text-white transition hover:bg-brand-600"
              >
                Browse opportunities
              </button>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {visibleApplications.map((application) => (
                <article
                  key={application.id}
                  className={`rounded-[20px] border p-4 sm:p-5 ${isDarkMode ? 'border-white/10 bg-gray-900/70' : 'border-slate-200 bg-white shadow-sm'}`}
                >
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_170px] lg:items-center">
                    <button
                      type="button"
                      onClick={() => navigate(`/opportunity/${application.opportunity_id}`)}
                      className="min-w-0 text-left"
                    >
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-brand-600 dark:text-brand-300">
                        {application.opportunity_category || 'Opportunity'}
                      </p>
                      <h2 className="mt-2 line-clamp-2 text-lg font-black leading-6 tracking-tight">
                        {application.opportunity_title}
                      </h2>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm font-semibold text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-2">
                          <Calendar size={15} />
                          {formatDate(application.applied_at)}
                        </span>
                        <span className="inline-flex items-center gap-2">
                          <Clock size={15} />
                          {application.notes ? 'Notes saved' : 'No notes'}
                        </span>
                      </div>
                    </button>

                    <div>
                      <span className={`inline-flex rounded-xl px-2.5 py-1 text-xs font-black ${statusTone(application.status)}`}>
                        {STATUS_LABELS[application.status]}
                      </span>
                      <select
                        value={application.status}
                        disabled={updatingId === application.id}
                        onChange={(event) => void changeStatus(application, event.target.value as ApplicationStatus)}
                        className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-gray-950 dark:text-white"
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {STATUS_LABELS[status]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <button
                        type="button"
                        onClick={() => navigate(`/opportunity/${application.opportunity_id}`)}
                        className="inline-flex h-10 items-center justify-center rounded-xl bg-brand-500 px-4 text-sm font-bold text-white transition hover:bg-brand-600"
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteApplication(application)}
                        disabled={updatingId === application.id}
                        className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
                      >
                        {updatingId === application.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                        {confirmingId === application.id ? 'Confirm' : 'Remove'}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {!loading && applications.some((item) => item.status === 'accepted') ? (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
            <CheckCircle2 className="mr-2 inline" size={17} />
            Accepted outcomes are preserved here so you can keep a record of wins and next steps.
          </div>
        ) : null}
      </main>
    </div>
  );
}
