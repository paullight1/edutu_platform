import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Filter,
  Loader2,
  RefreshCcw,
  Search,
  Sparkles,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import { useAuth as useAppAuth } from '../hooks/useAuth';
import { usePersonalization } from '../hooks/usePersonalization';
import { InlineError, StateView, showsContent, useScreenState } from './state';
import PullToRefresh from './ui/PullToRefresh';
import CelebrationBurst from './ui/CelebrationBurst';
import { useToast } from './ui/ToastProvider';
import { MatchScoreBadge, TopMatchReason } from './opportunity/MatchInsights';
import { getDeadlineBadge, urgencyTextClasses } from '../services/deadlineUrgency';
import { fetchOpportunities, isOpportunityExpired } from '../services/opportunities';
import { getBookmarks } from '../services/bookmarks';
import type { MatchResult } from '../services/personalizedRecommendations';
import type { Opportunity } from '../types/opportunity';
import {
  APPLICATION_PIPELINE,
  addApplicationReflection,
  fetchAnswerBankCount,
  getApplicationHistory,
  getApplications,
  removeApplication,
  updateApplicationStatus,
  type ApplicationRecord,
  type ApplicationStatus,
} from '../services/applications';
import { latestApplicationReflection } from '../services/applicationReflectionState';
import WebPushPrompt from './WebPushPrompt';

type ApplicationFilter = 'all' | ApplicationStatus;

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  no_response: 'No response',
};

const STATUS_OPTIONS: ApplicationStatus[] = [
  'draft',
  'submitted',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
  'no_response',
];

/** Terminal statuses — closed out, never part of the active pipeline. */
const TERMINAL_STATUSES: ApplicationStatus[] = ['rejected', 'withdrawn', 'no_response'];

function isTerminalStatus(status: ApplicationStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * Per-stage celebration copy for forward moves through the pipeline.
 * Draft has no entry — creating a draft isn't a milestone yet.
 */
const CELEBRATION_COPY: Partial<Record<ApplicationStatus, { title: string; description: string }>> = {
  submitted: {
    title: 'Submitted. The hardest part is behind you.',
    description: 'Most people never press send — you just did.',
  },
  interview: {
    title: 'Interview! They noticed you.',
    description: 'Your application stood out. Time to prepare for the conversation.',
  },
  offer: {
    title: 'An offer. Huge congratulations!',
    description: 'You put in the work and it paid off — take a moment to enjoy this.',
  },
};

/**
 * Header copy for the supportive closure panel. Rejection is reframed as data;
 * no_response is reframed as closure the user owns — never a celebration,
 * never the user's fault.
 */
const CLOSURE_COPY: Record<'rejected' | 'no_response', { title: string; body: string }> = {
  rejected: {
    title: "This one said no. That's data, not a verdict.",
    body: "Every application sharpens the next one. If you want, note what you'd try differently — future you will thank you.",
  },
  no_response: {
    title: "No response counts as closed — that's on them, not you.",
    body: "Your work is saved for the next one. If anything stood out about this one, note it — future you will use it.",
  },
};

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
    case 'no_response':
      // Neutral, not red — the silence is on them, not a failure on the user.
      return 'bg-surface-elevated text-text-muted';
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
  const terminalRejected = isTerminalStatus(status);

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
  // The raw LOAD failure only. Update and delete failures stay message-only:
  // they are operation failures, not screen states, and become InlineError.
  const [loadError, setLoadError] = useState<unknown>(null);
  const toast = useToast();
  const { explainOpportunity } = usePersonalization();

  // Post-rejection flow: which card shows the supportive panel, durable
  // reflections, and the recomputed "next best shot" suggestion.
  const [rejectionPanelId, setRejectionPanelId] = useState<string | null>(null);
  const [reflections, setReflections] = useState<Record<string, string>>({});
  const [persistedReflections, setPersistedReflections] = useState<Record<string, string>>({});
  const [reflectionSavingId, setReflectionSavingId] = useState<string | null>(null);
  const [nextBestShot, setNextBestShot] = useState<{
    opportunity: Opportunity;
    match: MatchResult;
  } | null>(null);
  const [nextShotLoading, setNextShotLoading] = useState(false);
  // How many reusable essay drafts the user has banked — surfaced in the
  // closure panel so a rejection visibly deposits a surviving asset.
  const [answerBankCount, setAnswerBankCount] = useState(0);
  // Celebration burst is reserved for the biggest moment: an offer.
  const [celebrating, setCelebrating] = useState(false);

  const saveReflection = useCallback((applicationId: string, text: string) => {
    setReflections((current) => ({ ...current, [applicationId]: text }));
  }, []);

  // Find the top-scoring active opportunity the user hasn't already applied
  // to or saved, using the SWR opportunities snapshot + evaluateMatch.
  const loadNextBestShot = useCallback(async () => {
    setNextShotLoading(true);
    setNextBestShot(null);
    try {
      const token = await getToken().catch(() => null);
      const [all, saved] = await Promise.all([
        fetchOpportunities(),
        user?.id ? getBookmarks(user.id, token).catch(() => []) : Promise.resolve([]),
      ]);
      const excluded = new Set<string>();
      for (const application of applications) excluded.add(application.opportunity_id);
      for (const bookmark of saved) excluded.add(bookmark.opportunity_id);

      const best = all
        .filter((opportunity) => !excluded.has(opportunity.id) && !isOpportunityExpired(opportunity))
        .map((opportunity) => ({ opportunity, match: explainOpportunity(opportunity) }))
        .sort((a, b) => b.match.score - a.match.score)[0];
      setNextBestShot(best ?? null);
    } catch {
      setNextBestShot(null);
    } finally {
      setNextShotLoading(false);
    }
  }, [applications, explainOpportunity, getToken, user?.id]);

  const resolveToken = useCallback(async () => {
    const token = await getToken().catch(() => null);
    if (!token) throw new Error('Your session has expired. Sign in again to manage applications.');
    return token;
  }, [getToken]);

  const loadApplications = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    setLoadError(null);
    try {
      const token = await resolveToken();
      const loaded = await getApplications(user.id, token);
      setApplications(loaded);

      // Reflections live in the server-owned application ledger. Hydrate the
      // latest one for closure cards so switching browsers/devices never loses
      // the learner's post-application notes. A single history read failing is
      // non-fatal to the application list.
      const closureApplications = loaded.filter(
        (item) => item.status === 'rejected' || item.status === 'no_response',
      );
      const historyResults = await Promise.allSettled(
        closureApplications.map(async (application) => ({
          id: application.id,
          history: await getApplicationHistory(application.id, token),
        })),
      );
      const durable: Record<string, string> = {};
      for (const result of historyResults) {
        if (result.status !== 'fulfilled') continue;
        const reflection = latestApplicationReflection(result.value.history);
        if (reflection) durable[result.value.id] = reflection;
      }
      setReflections(durable);
      setPersistedReflections(durable);
    } catch (caught) {
      setLoadError(caught);
      setError(caught instanceof Error ? caught.message : 'Unable to load applications.');
    } finally {
      setLoading(false);
    }
  }, [resolveToken, user?.id]);

  useEffect(() => {
    void loadApplications();
  }, [loadApplications]);

  const persistReflection = useCallback(
    async (applicationId: string) => {
      const draft = (reflections[applicationId] ?? '').trim();
      const persisted = persistedReflections[applicationId] ?? '';
      if (!draft) {
        // The ledger is append-only by design. Do not silently erase a durable
        // reflection just because a textarea was temporarily cleared.
        if (persisted) {
          setReflections((current) => ({ ...current, [applicationId]: persisted }));
        }
        return;
      }
      if (draft === persisted) return;

      setReflectionSavingId(applicationId);
      try {
        const token = await resolveToken();
        await addApplicationReflection(applicationId, draft, token);
        setPersistedReflections((current) => ({ ...current, [applicationId]: draft }));
        setReflections((current) => ({ ...current, [applicationId]: draft }));
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : 'Unable to save your reflection across devices.',
        );
      } finally {
        setReflectionSavingId(null);
      }
    },
    [persistedReflections, reflections, resolveToken],
  );

  // Lazily count the answer bank only once a closure panel actually opens —
  // never on page load. Failures resolve to 0 and simply hide the line.
  useEffect(() => {
    if (!rejectionPanelId) return;
    let cancelled = false;
    void (async () => {
      const token = await getToken().catch(() => null);
      const count = await fetchAnswerBankCount(token);
      if (!cancelled) setAnswerBankCount(count);
    })();
    return () => {
      cancelled = true;
    };
  }, [rejectionPanelId, getToken]);

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

  const filtersActive = Boolean(query.trim()) || filter !== 'all';
  const screenState = useScreenState({
    data: visibleApplications,
    loading,
    error: loadError,
    filtersActive,
  });

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

      if (status === 'rejected' || status === 'no_response') {
        // Never a dead-end: open the supportive/closure panel and line up the
        // next shot. no_response is closure, not a rejection — copy differs.
        setRejectionPanelId(application.id);
        void loadNextBestShot();
      } else {
        if (rejectionPanelId === application.id) setRejectionPanelId(null);
        // Celebrate forward movement through the pipeline.
        const movedForward = pipelineIndex(status) > pipelineIndex(application.status);
        const copy = movedForward ? CELEBRATION_COPY[status] : undefined;
        if (copy) {
          toast.success(copy.title, copy.description);
          if (status === 'offer') setCelebrating(true);
        }
      }
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
      {celebrating ? <CelebrationBurst onDone={() => setCelebrating(false)} /> : null}
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
        {error && showsContent(screenState) ? (
          // A status update or delete that failed while the list is on screen:
          // recover in place rather than replacing what the user was reading.
          <InlineError message={error} onRetry={() => void loadApplications()} />
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

        {/* Contextual opt-in: only asked once there is a live pipeline worth
            being nudged about. Renders nothing when push is unavailable,
            blocked, already on, or previously dismissed. */}
        {!loading && applications.length > 0 ? (
          <WebPushPrompt
            promptId="applications"
            title="Get told when it's time to follow up"
            body="Turn on browser reminders for status nudges and closing dates on the roles you're tracking."
            className="mb-5"
          />
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
          ) : !showsContent(screenState) ? (
            <div className="mt-5 rounded-[20px] border border-subtle bg-surface-layer">
              <StateView
                state={screenState}
                flow="applied"
                onRetry={() => void loadApplications()}
                onAction={() => navigate('/opportunities')}
              />
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

                  {(application.status === 'rejected' || application.status === 'no_response') &&
                  rejectionPanelId === application.id ? (
                    <div className="mt-4 rounded-2xl border border-subtle bg-surface-elevated p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-text-primary">
                            {CLOSURE_COPY[application.status === 'no_response' ? 'no_response' : 'rejected'].title}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-text-muted">
                            {CLOSURE_COPY[application.status === 'no_response' ? 'no_response' : 'rejected'].body}
                          </p>
                          {answerBankCount > 0 ? (
                            <p className="mt-2 text-xs font-semibold text-brand">
                              Your answer bank now holds {answerBankCount} answers you can reuse.
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => setRejectionPanelId(null)}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition hover:bg-surface-layer hover:text-text-secondary"
                          aria-label="Dismiss reflection panel"
                        >
                          <X size={15} />
                        </button>
                      </div>

                      <textarea
                        value={reflections[application.id] ?? ''}
                        onChange={(event) => saveReflection(application.id, event.target.value)}
                        onBlur={() => void persistReflection(application.id)}
                        rows={3}
                        placeholder="Optional: what would you try differently next time?"
                        className="mt-3 w-full resize-none rounded-xl border border-subtle bg-surface-layer p-3 text-sm text-text-secondary outline-none transition placeholder:text-text-muted focus:border-brand focus:ring-2 focus:ring-brand/20"
                      />
                      {(reflections[application.id] ?? '').trim() ? (
                        <p className="mt-1.5 text-xs text-text-muted" aria-live="polite">
                          {reflectionSavingId === application.id
                            ? 'Saving across devices…'
                            : (reflections[application.id] ?? '').trim() ===
                                (persistedReflections[application.id] ?? '')
                              ? 'Saved across devices'
                              : 'Changes save when you leave this field'}
                        </p>
                      ) : null}

                      <div className="mt-3 border-t border-subtle pt-3">
                        <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand">
                          <Sparkles size={13} />
                          Your next best shot
                        </p>
                        {nextShotLoading ? (
                          <div className="mt-2 flex items-center gap-2 text-sm text-text-muted">
                            <Loader2 size={15} className="animate-spin" />
                            Finding your strongest open match…
                          </div>
                        ) : nextBestShot ? (
                          <div className="mt-2 flex flex-col gap-3 rounded-xl border border-subtle bg-surface-layer p-3.5 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <MatchScoreBadge score={nextBestShot.match.score} />
                                {(() => {
                                  const badge = getDeadlineBadge(nextBestShot.opportunity.deadline);
                                  return badge.level !== 'none' ? (
                                    <span className={`text-xs text-text-muted ${urgencyTextClasses(badge.level)}`}>
                                      {badge.label}
                                    </span>
                                  ) : null;
                                })()}
                              </div>
                              <p className="mt-1.5 line-clamp-1 text-sm font-semibold text-text-primary">
                                {nextBestShot.opportunity.title}
                              </p>
                              <TopMatchReason reason={nextBestShot.match.reasons[0]} />
                            </div>
                            <button
                              type="button"
                              onClick={() => navigate(`/opportunity/${nextBestShot.opportunity.id}`)}
                              className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-bold text-white transition hover:bg-brand-700"
                            >
                              View opportunity
                              <ArrowRight size={15} />
                            </button>
                          </div>
                        ) : (
                          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm text-text-muted">
                              Nothing scored highly enough right now — new opportunities land daily.
                            </p>
                            <button
                              type="button"
                              onClick={() => navigate('/opportunities')}
                              className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl border border-subtle px-3 text-sm font-bold text-text-secondary transition hover:bg-surface-layer"
                            >
                              Browse opportunities
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
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
