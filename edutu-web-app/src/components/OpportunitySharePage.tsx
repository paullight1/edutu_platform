import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Globe,
  LockKeyhole,
  MapPin,
  MessageCircle,
  Share2,
  Sparkles,
  Download,
} from 'lucide-react';
import { useDarkMode } from '../hooks/useDarkMode';
import ImageWithFallback from './ImageWithFallback';
import { useToast } from './ui/ToastProvider';
import type { Opportunity } from '../types/opportunity';
import { getOpportunity } from '../services/opportunities';
import {
  buildOpportunityShareFileName,
  buildOpportunityShareText,
  buildOpportunityShareUrl,
  buildWhatsAppShareUrl,
  downloadBlob,
  fetchOpportunityShareCard,
  fetchOpportunitySharePdfBlob,
} from '../services/opportunityShare';

function truncateDescription(value: string, maxLength = 260): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

export default function OpportunitySharePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isLoaded, isSignedIn } = useAuth();
  const { isDarkMode } = useDarkMode();
  const { success, error: showError } = useToast();
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [shareCardUrl, setShareCardUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [working, setWorking] = useState<'copy' | 'whatsapp' | 'download' | null>(null);

  const publicSharePath = useMemo(() => {
    if (!id) {
      return '/opportunities';
    }

    return `/share/opportunity/${id}`;
  }, [id]);

  const shareUrl = useMemo(() => (id ? buildOpportunityShareUrl(id) : ''), [id]);

  const shareText = useMemo(() => {
    if (!opportunity || !shareUrl) {
      return '';
    }

    return buildOpportunityShareText(opportunity, shareUrl);
  }, [opportunity, shareUrl]);

  const imageSource = shareCardUrl || opportunity?.image || null;

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

        if (!isActive) {
          return;
        }

        if (!record) {
          setOpportunity(null);
          setShareCardUrl(null);
          setLoadError('Opportunity not found.');
          return;
        }

        setOpportunity(record);
        setShareCardUrl(shareCard?.url ?? null);
      } catch (error) {
        if (!isActive) {
          return;
        }

        setLoadError(error instanceof Error ? error.message : 'Unable to load opportunity preview.');
      } finally {
        if (isActive) {
          setLoading(false);
        }
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
      <div className={`min-h-screen ${isDarkMode ? 'dark bg-slate-950 text-white' : 'bg-slate-50 text-slate-950'} flex items-center justify-center px-4`}>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-white/90 px-5 py-4 shadow-lg shadow-slate-900/5 backdrop-blur dark:border-white/10 dark:bg-slate-900/80">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-500/20 border-t-brand-500" />
          <div>
            <p className="text-sm font-semibold">Loading opportunity preview</p>
            <p className="text-xs text-muted">Preparing the WhatsApp share card and portal preview.</p>
          </div>
        </div>
      </div>
    );
  }

  if (isSignedIn) {
    return <Navigate to={`/app/opportunity/${id}`} replace />;
  }

  if (loadError || !opportunity) {
    return (
      <div className={`min-h-screen ${isDarkMode ? 'dark bg-slate-950 text-white' : 'bg-slate-50 text-slate-950'} flex items-center justify-center px-4`}>
        <div className="max-w-xl rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-900/5 dark:border-white/10 dark:bg-slate-900">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500">
            <LockKeyhole size={28} />
          </div>
          <h1 className="text-2xl font-bold">Preview unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            {loadError || 'We could not load this opportunity preview right now.'}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => navigate('/opportunities')}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-subtle px-5 py-3 text-sm font-semibold transition-theme hover:bg-surface-layer"
            >
              <ArrowLeft size={16} />
              Back to opportunities
            </button>
            <button
              type="button"
              onClick={() => navigate('/auth', { state: { from: { pathname: publicSharePath } } })}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white transition-theme hover:bg-brand-600"
            >
              Sign up to continue
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  const shortDescription = truncateDescription(opportunity.description || 'Open this opportunity on Edutu to see the public preview and unlock the full application details after sign-up.');
  const deadline = opportunity.deadline
    ? new Date(opportunity.deadline).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Rolling / not specified';

  const handleAuth = (mode: 'sign-up' | 'sign-in') => {
    navigate(`/auth?${mode === 'sign-up' ? 'signup=true' : 'mode=sign-in'}`, {
      state: { from: { pathname: publicSharePath } },
    });
  };

  const handleCopyLink = async () => {
    setWorking('copy');
    try {
      await navigator.clipboard.writeText(shareUrl);
      success('Share link copied');
    } catch {
      showError('Could not copy the share link');
    } finally {
      setWorking(null);
    }
  };

  const handleWhatsAppShare = async () => {
    setWorking('whatsapp');
    try {
      const pdfBlob = await fetchOpportunitySharePdfBlob(opportunity.id, imageSource);
      if (pdfBlob) {
        const pdfFile = new File([pdfBlob], buildOpportunityShareFileName(opportunity, 'pdf'), {
          type: 'application/pdf',
        });
        const shareData = {
          title: opportunity.title,
          text: shareText,
          url: shareUrl,
          files: [pdfFile],
        };

        if (navigator.share && navigator.canShare?.({ files: [pdfFile] })) {
          await navigator.share(shareData);
          success('Opened the share sheet');
          return;
        }

        if (navigator.share) {
          await navigator.share({
            title: opportunity.title,
            text: shareText,
            url: shareUrl,
          });
          downloadBlob(pdfBlob, buildOpportunityShareFileName(opportunity, 'pdf'));
          success('Opened the share sheet and downloaded the PDF');
          return;
        }

        downloadBlob(pdfBlob, buildOpportunityShareFileName(opportunity, 'pdf'));
      }

      window.open(buildWhatsAppShareUrl(shareText), '_blank', 'noopener,noreferrer');
      success('Opening WhatsApp');
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'NotAllowedError')) {
        return;
      }

      showError('Could not open WhatsApp');
    } finally {
      setWorking(null);
    }
  };

  const handleDownloadPdf = async () => {
    setWorking('download');
    try {
      const pdfBlob = await fetchOpportunitySharePdfBlob(opportunity.id, imageSource);
      if (!pdfBlob) {
        throw new Error('Could not generate the PDF preview.');
      }

      downloadBlob(pdfBlob, buildOpportunityShareFileName(opportunity, 'pdf'));
      success('PDF downloaded');
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Could not download the PDF preview');
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className={`min-h-screen relative overflow-hidden ${isDarkMode ? 'dark bg-slate-950 text-white' : 'bg-slate-50 text-slate-950'}`}>
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background: isDarkMode
            ? 'radial-gradient(circle at top left, rgba(20,110,245,0.24), transparent 35%), radial-gradient(circle at top right, rgba(16,185,129,0.18), transparent 30%), linear-gradient(180deg, rgba(8,15,28,0.98), rgba(3,6,15,0.98))'
            : 'radial-gradient(circle at top left, rgba(20,110,245,0.16), transparent 35%), radial-gradient(circle at top right, rgba(16,185,129,0.12), transparent 30%), linear-gradient(180deg, #f7fbff, #eef4ff 70%, #f7fafc)',
        }}
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-3 rounded-[24px] border border-white/10 bg-white/70 px-4 py-3 shadow-lg shadow-slate-900/5 backdrop-blur dark:bg-slate-900/70">
          <button
            type="button"
            onClick={() => navigate('/opportunities')}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition-theme hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/5"
          >
            <ArrowLeft size={16} />
            Back
          </button>

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-lg shadow-brand-500/20">
              <Globe size={18} />
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-semibold tracking-tight">Edutu preview</p>
              <p className="text-xs text-muted">Public description with sign-up lock</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleAuth('sign-up')}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-theme hover:bg-brand-600"
          >
            Sign up
            <ArrowRight size={16} />
          </button>
        </header>

        <main className="grid gap-8 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start lg:py-10">
          <section className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-brand-600 dark:text-brand-300">
              <Sparkles size={14} />
              Shared opportunity
            </div>

            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
                {opportunity.title}
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-muted">
                {shortDescription}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <MetaCard label="Organization" value={opportunity.organization || 'Edutu'} />
              <MetaCard label="Category" value={opportunity.category || 'Opportunity'} />
              <MetaCard label="Deadline" value={deadline} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <MetaCard label="Location" value={opportunity.location || 'Worldwide'} icon={<MapPin size={16} />} />
              <MetaCard label="Sign-up lock" value="Full details unlock after account creation" icon={<LockKeyhole size={16} />} />
            </div>

            <div className="rounded-[28px] border border-subtle bg-white/85 p-5 shadow-xl shadow-slate-900/5 backdrop-blur dark:bg-slate-900/80">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  <Share2 size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Share it on WhatsApp</h2>
                  <p className="text-sm text-muted">Send the preview image, PDF, and public link to anyone.</p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={handleWhatsAppShare}
                  disabled={working !== null}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-green-500 px-4 py-3 text-sm font-semibold text-white transition-theme hover:bg-green-600 disabled:cursor-wait disabled:opacity-70"
                >
                  <MessageCircle size={16} />
                  WhatsApp
                </button>
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={working !== null || !imageSource}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-subtle px-4 py-3 text-sm font-semibold transition-theme hover:bg-surface-layer disabled:cursor-wait disabled:opacity-70"
                >
                  <Download size={16} />
                  Download PDF
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  disabled={working !== null}
                  className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-brand-600 transition-theme hover:bg-brand-500/10 dark:text-brand-300"
                >
                  <Copy size={16} />
                  Copy link
                </button>
                <button
                  type="button"
                  onClick={() => handleAuth('sign-in')}
                  className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition-theme hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/5"
                >
                  Already have an account? Sign in
                </button>
              </div>
            </div>
          </section>

          <aside className="space-y-5">
            <div className="overflow-hidden rounded-[32px] border border-white/10 bg-white shadow-2xl shadow-slate-900/10 dark:bg-slate-900">
              <div className="relative aspect-[4/5] overflow-hidden bg-slate-100 dark:bg-slate-800">
                {imageSource ? (
                  <ImageWithFallback
                    src={imageSource}
                    alt={opportunity.title}
                    className="h-full w-full object-cover"
                    fallbackClassName="h-full w-full"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-gradient-to-br from-brand-500/10 via-transparent to-emerald-500/10">
                    <div className="text-center">
                      <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-500">
                        <Sparkles size={24} />
                      </div>
                      <p className="text-sm font-semibold">Share preview will appear here</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4 p-5 sm:p-6">
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-600 dark:text-brand-300">
                    {opportunity.category || 'Opportunity'}
                  </span>
                  {opportunity.isRemote ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
                      Remote
                    </span>
                  ) : null}
                </div>

                <div>
                  <p className="text-sm font-medium text-muted">Preview locked for guests</p>
                  <h2 className="mt-1 text-2xl font-bold">{opportunity.title}</h2>
                  <p className="mt-1 text-sm text-muted">{opportunity.organization}</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <LockedSection title="Requirements" body="Create a free Edutu account to view the eligibility and application requirements." />
                  <LockedSection title="How to apply" body="Sign up to unlock the application steps, deadlines, and official application link." />
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-brand-500/15 bg-brand-500/5 p-5 dark:bg-brand-500/10">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">Why sign up?</p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-muted">
                <li className="flex gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-brand-500" />
                  Unlock the full opportunity description, requirements, and application steps.
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-brand-500" />
                  Save opportunities, track applications, and revisit the link later.
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-brand-500" />
                  Continue straight into the private opportunity detail page after sign-up.
                </li>
              </ul>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}

function MetaCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-subtle bg-white/85 p-4 shadow-lg shadow-slate-900/5 backdrop-blur dark:bg-slate-900/80">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
        {icon}
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold leading-6 text-strong">{value}</p>
    </div>
  );
}

function LockedSection({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-subtle bg-surface-layer p-4">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
    </div>
  );
}
