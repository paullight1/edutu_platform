import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Briefcase,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Filter,
  Loader2,
  RefreshCcw,
  Search,
  Trash2,
  Trophy,
} from 'lucide-react';
import { useAuth as useAppAuth } from '../hooks/useAuth';
import PullToRefresh from './ui/PullToRefresh';
import {
  APPLICATION_PIPELINE,
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
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

const STATUS_OPTIONS: ApplicationStatus[] = [
  'draft',
  'submitted',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
];

/** Stage index within the active pipeline, or -1 for terminal states. */
function pipelineIndex(status: ApplicationStatus): number {
  return APPLICATION_PIPELINE.indexOf(status);
}

/** The next forward stage, or null if terminal / already at Offer. */
function nextStage(status: ApplicationStatus): ApplicationStatus | null {
  const index = pipelineIndex(status);
  if (index < 0 || index >= APPLICATION_PIPELINE.length - 1) return null;
  return APPLICATION_PIPELINE[index + 1];
}

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
    case 'offer':
      return 'bg-success/10 text-success';
    case 'rejected':
      return 'bg-danger/10 text-danger';
    case 'withdrawn':
      return 'bg-danger/10 text-danger';
    case 'interview':
      return 'bg-warning/10 text-warning';
    case 'submitted':
      return 'bg-brand/10 text-brand';
    default:
      return 'bg-surface-elevated text-text-muted';
  }
}

/** Compact draft→submitted→interview→offer progress bar for a single card. */
function PipelineStepper({ status }: { status: ApplicationStatus }) {
  const currentIndex = pipelineIndex(status);
  const terminalRejected = status === 'rejected' || status === 'withdrawn';

  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      {APPLICATION_PIPELINE.map((stage, index) => {
        const reached = currentIndex >= index && !terminalRejected;
        const isCurrent = currentIndex === index && !terminalRejected;
        return (
          <div key={stage} className="flex flex-1 items-center gap-1.5">
            <span
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                reached
                  ? status === 'offer'
                    ? 'bg-success'
                    : 'bg-brand'
                  : terminalRejected && index === 0
                    ? 'bg-danger/40'
                    : 'bg-surface-elevated'
              } ${isCurrent ? 'ring-2 ring-brand/20' : ''}`}
            />
          </div>
        );
      })}
    </div>
  );
}

export default function ApplicationsPage() {
  const navigate = useNavigate();
  const { getToken } = useClerkAuth();
  const { user } = useAppAuth();
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ApplicationFilter>('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
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

  const stageCounts = useMemo(() => {
    const counts = new Map<ApplicationStatus, number>();
    for (const application of applications) {
      counts.set(application.status, (counts.get(application.status) ?? 0) + 1);
    }
    return counts;
  }, [applications]);

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
          <button
            type="button"
            onClick={loadApplications}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-3 text-sm font-bold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 size={17} className="animate-spin" /> : <RefreshCcw size={17} />}
            Refresh
          </button>
        </div>
      </header>

      <PullToRefresh
        onRefresh={loadApplications}
        disabled={loading}
        className="min-h-[calc(100dvh-4rem)]"
      >
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {error ? (
          <div className="rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm font-semibold text-danger">
            {error}
          </div>
        ) : null}

        {!loading && applications.length > 0 ? (
          <section className={`${error ? 'mt-5' : ''} mb-5`}>
            <h1 className="mb-1 font-display text-xl font-semibold tracking-tight text-text-primary">
              Application pipeline
            </h1>
            <p className="mb-4 text-sm text-text-muted">
              Track every application from draft to offer.
            </p>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
              {(['all', ...STATUS_OPTIONS] as ApplicationFilter[]).map((stage) => {
                const count =
                  stage === 'all'
                    ? applications.length
                    : stageCounts.get(stage) ?? 0;
                const active = filter === stage;
                return (
                  <button
                    key={stage}
                    type="button"
                    onClick={() => setFilter(active && stage !== 'all' ? 'all' : stage)}
                    aria-pressed={active}
                    className={`flex flex-col items-start rounded-2xl border p-3 text-left transition ${
                      active
                        ? 'border-brand bg-brand/5 ring-1 ring-brand/30'
                        : 'border-subtle bg-surface-layer hover:border-strong'
                    }`}
                  >
                    <span className="text-2xl font-bold leading-none tracking-tight">
                      {count}
                    </span>
                    <span className="mt-1.5 text-xs font-semibold text-text-muted">
                      {stage === 'all' ? 'Total' : STATUS_LABELS[stage]}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className={error && (loading || applications.length === 0) ? 'mt-5' : ''}>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative max-w-xl flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={17} />
              <button
                type="button"
                onClick={() => setIsFilterOpen((value) => !value)}
                className={`absolute left-9 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full transition ${
                  filter === 'all'
                    ? 'text-text-muted hover:bg-surface-elevated hover:text-text-secondary'
                    : 'bg-brand/10 text-brand'
                }`}
                aria-label="Filter applications"
                aria-expanded={isFilterOpen}
              >
                <Filter size={15} />
              </button>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search applications"
                className="h-11 w-full rounded-xl border border-subtle bg-surface-layer pl-20 pr-3 text-sm font-semibold text-text-secondary outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
              {isFilterOpen ? (
                <div
                  className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 overflow-hidden rounded-2xl border border-subtle bg-surface-layer p-1.5 shadow-elevated"
                >
                  {(['all', ...STATUS_OPTIONS] as ApplicationFilter[]).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        setFilter(item);
                        setIsFilterOpen(false);
                      }}
                      className={`flex h-10 w-full items-center justify-between rounded-xl px-3 text-left text-sm font-semibold transition ${
                        filter === item
                          ? 'bg-brand text-white'
                          : 'text-text-secondary hover:bg-surface-elevated'
                      }`}
                    >
                      <span>{item === 'all' ? 'All statuses' : STATUS_LABELS[item]}</span>
                      {filter === item ? <CheckCircle2 size={15} /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {loading ? (
            <div className="mt-5 space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-28 animate-pulse rounded-[20px] border border-subtle bg-surface-layer" />
              ))}
            </div>
          ) : visibleApplications.length === 0 ? (
            <div className="mt-5 rounded-[20px] border border-subtle bg-surface-layer p-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-elevated text-text-muted">
                <Briefcase size={22} />
              </div>
              <h2 className="mt-4 text-base font-semibold text-text-primary">No tracked applications</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-muted">
                Open an opportunity and use the application action to add it to this tracker.
              </p>
              <button
                type="button"
                onClick={() => navigate('/opportunities')}
                className="mt-5 inline-flex h-10 items-center justify-center rounded-xl bg-brand px-4 text-sm font-bold text-white transition hover:bg-brand-700"
              >
                Browse opportunities
              </button>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {visibleApplications.map((application) => (
                <article
                  key={application.id}
                  className="rounded-[20px] border border-subtle bg-surface-layer p-4 shadow-soft sm:p-5"
                >
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_170px] lg:items-center">
                    <button
                      type="button"
                      onClick={() => navigate(`/opportunity/${application.opportunity_id}`)}
                      className="min-w-0 text-left"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">
                        {application.opportunity_category || 'Opportunity'}
                      </p>
                      <h2 className="mt-2 line-clamp-2 font-display text-lg font-semibold leading-6 tracking-tight text-text-primary">
                        {application.opportunity_title}
                      </h2>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm font-semibold text-text-muted">
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
                      <span className={`inline-flex rounded-xl px-2.5 py-1 text-xs font-semibold ${statusTone(application.status)}`}>
                        {STATUS_LABELS[application.status]}
                      </span>
                      <div className="mt-2.5">
                        <PipelineStepper status={application.status} />
                      </div>
                      <select
                        value={application.status}
                        disabled={updatingId === application.id}
                        onChange={(event) => void changeStatus(application, event.target.value as ApplicationStatus)}
                        className="mt-2 h-10 w-full rounded-xl border border-subtle bg-surface-layer px-3 text-sm font-bold text-text-secondary outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {STATUS_LABELS[status]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      {nextStage(application.status) ? (
                        <button
                          type="button"
                          onClick={() =>
                            void changeStatus(
                              application,
                              nextStage(application.status)!,
                            )
                          }
                          disabled={updatingId === application.id}
                          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-success px-3 text-sm font-bold text-white transition hover:bg-success/90 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {updatingId === application.id ? (
                            <Loader2 size={15} className="animate-spin" />
                          ) : (
                            <ArrowRight size={15} />
                          )}
                          {STATUS_LABELS[nextStage(application.status)!]}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => navigate(`/opportunity/${application.opportunity_id}`)}
                        className="inline-flex h-10 items-center justify-center rounded-xl bg-brand px-4 text-sm font-bold text-white transition hover:bg-brand-700"
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteApplication(application)}
                        disabled={updatingId === application.id}
                        className="inline-flex h-10 items-center gap-2 rounded-xl border border-subtle px-3 text-sm font-bold text-text-secondary transition hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-60"
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

        {!loading && applications.some((item) => item.status === 'offer') ? (
          <div className="mt-5 rounded-2xl border border-success/30 bg-success/10 p-4 text-sm font-semibold text-success">
            <Trophy className="mr-2 inline" size={17} />
            You have an offer — congratulations! Your wins stay here so you can track next steps.
          </div>
        ) : null}
      </main>
      </PullToRefresh>
    </div>
  );
}
