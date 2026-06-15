import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import {
  ArrowLeft,
  ArrowRight,
  LockKeyhole,
  Sparkles,
} from 'lucide-react';
import ImageWithFallback from './ImageWithFallback';
import type { Opportunity } from '../types/opportunity';
import { getOpportunity } from '../services/opportunities';
import { fetchOpportunityShareCard } from '../services/opportunityShare';
import PublicEditorialShell from './PublicEditorialShell';

function truncateDescription(value: string, maxLength = 220): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Rolling / not specified';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Rolling / not specified';
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function OpportunitySharePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isLoaded, isSignedIn } = useAuth();
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [shareCardUrl, setShareCardUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const publicSharePath = useMemo(() => {
    if (!id) return '/opportunities';
    return `/share/opportunity/${id}`;
  }, [id]);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setLoadError('Missing opportunity id.');
      return;
    }

    let isActive = true;

    const loadSharePreview = async () => {
      setLoading(true);
      setLoadError(null);

      try {
        const [record, shareCard] = await Promise.all([
          getOpportunity(id),
          fetchOpportunityShareCard(id),
        ]);

        if (!isActive) return;

        if (!record) {
          setOpportunity(null);
          setShareCardUrl(null);
          setLoadError('Opportunity not found.');
          return;
        }

        setOpportunity(record);
        setShareCardUrl(shareCard?.url ?? null);
      } catch (error) {
        if (!isActive) return;
        setLoadError(error instanceof Error ? error.message : 'Unable to load opportunity preview.');
      } finally {
        if (isActive) setLoading(false);
      }
    };

    void loadSharePreview();

    return () => {
      isActive = false;
    };
  }, [id]);

  if (!id) {
    return <Navigate to="/opportunities" replace />;
  }

  if (!isLoaded || loading) {
    return (
      <PublicEditorialShell>
        <div className="mx-auto flex min-h-[calc(100dvh-92px)] max-w-4xl items-center justify-center px-4 py-16 sm:px-6">
          <div className="flex items-center gap-3 border-b border-slate-200 pb-4 text-sm text-slate-600 dark:border-white/10 dark:text-slate-300">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500/25 border-t-brand-500" />
            Loading opportunity preview
          </div>
        </div>
      </PublicEditorialShell>
    );
  }

  if (isSignedIn) {
    return <Navigate to={`/app/opportunity/${id}`} replace />;
  }

  if (loadError || !opportunity) {
    return (
      <PublicEditorialShell>
        <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <div className="space-y-4 border-y border-slate-200 py-10 dark:border-white/10">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-600 dark:text-brand-300">
              Preview unavailable
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">We could not load this opportunity.</h1>
            <p className="max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">
              {loadError || 'The public preview is unavailable right now.'}
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={() => navigate('/opportunities')}
                className="inline-flex items-center gap-2 border-b border-slate-300 pb-1 text-sm font-medium text-slate-700 transition-colors hover:text-brand-600 dark:border-white/15 dark:text-slate-200"
              >
                <ArrowLeft size={16} />
                Back to opportunities
              </button>
              <button
                type="button"
                onClick={() => navigate('/auth', { state: { from: { pathname: publicSharePath } } })}
                className="inline-flex items-center gap-2 rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
              >
                Sign up to continue
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </section>
      </PublicEditorialShell>
    );
  }

  const shortDescription = truncateDescription(
    opportunity.description ||
      'Open this opportunity on Edutu to see the public preview and unlock the full application details after sign-up.',
  );
  const imageSource = shareCardUrl || opportunity.image || null;
  const metaItems = [
    { label: 'Organization', value: opportunity.organization || 'Edutu' },
    { label: 'Category', value: opportunity.category || 'Opportunity' },
    { label: 'Deadline', value: formatDate(opportunity.deadline) },
  ];

  const handleAuth = (mode: 'sign-up' | 'sign-in') => {
    navigate(`/auth?${mode === 'sign-up' ? 'signup=true' : 'mode=sign-in'}`, {
      state: { from: { pathname: publicSharePath } },
    });
  };

  const detailRows = [
    { label: 'Organization', value: opportunity.organization || 'Edutu' },
    { label: 'Category', value: opportunity.category || 'Opportunity' },
    { label: 'Deadline', value: formatDate(opportunity.deadline) },
    { label: 'Location', value: opportunity.location || 'Worldwide' },
  ];

  return (
    <PublicEditorialShell>
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
        <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
          <button
            type="button"
            onClick={() => navigate('/opportunities')}
            className="inline-flex items-center gap-2 border-b border-transparent pb-1 font-medium text-slate-700 transition-colors hover:border-slate-300 hover:text-brand-600 dark:text-slate-200 dark:hover:border-white/20"
          >
            <ArrowLeft size={16} />
            Back to opportunities
          </button>
          <span aria-hidden="true">•</span>
          <span>Shared opportunity</span>
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_360px] lg:items-start">
          <article className="space-y-8">
            <header className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-950/50">
              <div className="grid gap-0 lg:grid-cols-[1.15fr_.85fr]">
                <div className="space-y-6 p-6 sm:p-8 lg:p-10">
                  <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.35em] text-brand-600 dark:text-brand-300">
                    <Sparkles size={13} />
                    Shared opportunity
                  </p>
                  <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl dark:text-white">
                    {opportunity.title}
                  </h1>
                  <p className="max-w-2xl text-lg leading-8 text-slate-600 dark:text-slate-300">
                    {shortDescription}
                  </p>

                  <div className="grid gap-4 border-t border-slate-200 pt-6 sm:grid-cols-3 dark:border-white/10">
                    {metaItems.map((row) => (
                      <div key={row.label}>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">
                          {row.label}
                        </p>
                        <p className="mt-2 text-sm font-medium leading-6 text-slate-950 dark:text-white">
                          {row.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <figure className="relative min-h-[240px] border-t border-slate-200 bg-slate-100 lg:border-l lg:border-t-0 dark:border-white/10 dark:bg-slate-900">
                  {imageSource ? (
                    <ImageWithFallback
                      src={imageSource}
                      alt={opportunity.title}
                      className="h-full w-full object-cover"
                      fallbackClassName="h-full w-full"
                    />
                  ) : null}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-5">
                    <div className="inline-flex items-center rounded-full bg-white/92 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-800 shadow-sm backdrop-blur dark:bg-slate-950/85 dark:text-white">
                      {opportunity.category || 'Opportunity'}
                    </div>
                  </div>
                </figure>
              </div>
            </header>

            <section className="space-y-8">
              <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-950/40">
                <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">
                  Access
                </p>
                <p className="mt-3 inline-flex items-center gap-2 text-sm font-medium leading-6 text-slate-950 dark:text-white">
                  <LockKeyhole size={14} />
                  Full details unlock after sign up
                </p>
              </div>

              {opportunity.description ? (
                <section className="space-y-3">
                  <h2 className="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">Overview</h2>
                  <p className="max-w-3xl text-base leading-8 text-slate-600 dark:text-slate-300">
                    {opportunity.description}
                  </p>
                </section>
              ) : null}

              <section className="space-y-3">
                <h2 className="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">Requirements</h2>
                <ul className="space-y-3 text-base leading-7 text-slate-600 dark:text-slate-300">
                  {(opportunity.requirements.length > 0
                    ? opportunity.requirements
                    : ['Create a free Edutu account to view the full eligibility details.']
                  ).map((item, index) => (
                    <li key={`${item}-${index}`} className="flex gap-3">
                      <span className="mt-3 h-1.5 w-1.5 rounded-full bg-brand-500" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">Benefits</h2>
                <ul className="space-y-3 text-base leading-7 text-slate-600 dark:text-slate-300">
                  {(opportunity.benefits.length > 0
                    ? opportunity.benefits
                    : ['Benefits will be shown after sign up.']
                  ).map((item, index) => (
                    <li key={`${item}-${index}`} className="flex gap-3">
                      <span className="mt-3 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">How to apply</h2>
                <ol className="space-y-3 text-base leading-7 text-slate-600 dark:text-slate-300">
                  {(opportunity.applicationProcess.length > 0
                    ? opportunity.applicationProcess
                    : ['Sign up to unlock the application steps and the official link.']
                  ).map((item, index) => (
                    <li key={`${item}-${index}`} className="flex gap-4">
                      <span className="mt-0.5 text-sm font-semibold text-brand-600 dark:text-brand-300">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ol>
              </section>
            </section>
          </article>

          <aside className="space-y-5 lg:sticky lg:top-[104px]">
            <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-950/50">
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">
                Quick facts
              </p>
              <dl className="mt-4 space-y-4">
                {detailRows.map((row) => (
                  <div key={row.label} className="border-b border-slate-200 pb-4 last:border-b-0 last:pb-0 dark:border-white/10">
                    <dt className="text-sm text-slate-500 dark:text-slate-400">{row.label}</dt>
                    <dd className="mt-1 text-sm font-medium text-slate-950 dark:text-white">{row.value}</dd>
                  </div>
                ))}
                <div className="border-b border-slate-200 pb-4 last:border-b-0 last:pb-0 dark:border-white/10">
                  <dt className="text-sm text-slate-500 dark:text-slate-400">Access</dt>
                  <dd className="mt-1 inline-flex items-center gap-2 text-sm font-medium text-slate-950 dark:text-white">
                    <LockKeyhole size={14} />
                    Full details unlock after sign up
                  </dd>
                </div>
              </dl>
            </section>

            <button
              type="button"
              onClick={() => handleAuth('sign-up')}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 px-5 py-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600"
            >
              Apply now
              <ArrowRight size={16} />
            </button>
          </aside>
        </div>
      </section>
    </PublicEditorialShell>
  );
}
