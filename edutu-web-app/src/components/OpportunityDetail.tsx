import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ExternalLink,
  Heart,
  Share2,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@clerk/clerk-react';
import { useToast } from './ui/ToastProvider';
import type { Opportunity } from '../types/opportunity';
import { addBookmark, removeBookmark, isBookmarked } from '../services/bookmarks';
import { addApplication } from '../services/applications';
import {
  buildOpportunityShareFileName,
  buildOpportunityShareText,
  buildOpportunityShareUrl,
  buildWhatsAppShareUrl,
  downloadBlob,
  fetchOpportunityShareCard,
  fetchOpportunitySharePdfBlob,
} from '../services/opportunityShare';
import PublicEditorialShell from './PublicEditorialShell';

interface OpportunityDetailProps {
  opportunity: Opportunity;
  onBack: () => void;
}

function getCurrencySymbol(currency?: string | null): string {
  switch (currency?.toUpperCase()) {
    case 'NGN':
      return '₦';
    case 'GBP':
      return '£';
    case 'EUR':
      return '€';
    default:
      return '$';
  }
}

function getCurrencyLabel(currency?: string | null): string {
  switch (currency?.toUpperCase()) {
    case 'NGN':
      return 'Nigerian Naira';
    case 'GBP':
      return 'British Pound';
    case 'EUR':
      return 'Euro';
    default:
      return 'US Dollar';
  }
}

function formatDeadline(deadline?: string | null): string {
  if (!deadline) return 'No deadline listed';
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return 'No deadline listed';
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function getDaysUntilDeadline(deadline?: string | null): number | null {
  if (!deadline) return null;
  const parsed = new Date(deadline);
  if (Number.isNaN(parsed.getTime())) return null;
  const diffTime = parsed.getTime() - Date.now();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

const OpportunityDetail: React.FC<OpportunityDetailProps> = ({
  opportunity,
  onBack,
}) => {
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [isBookmarkedState, setIsBookmarkedState] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const { success, error: showError } = useToast();
  const { userId, getToken } = useAuth();

  const currencySymbol = getCurrencySymbol(opportunity.currency);
  const currencyLabel = getCurrencyLabel(opportunity.currency);
  const daysUntilDeadline = getDaysUntilDeadline(opportunity.deadline);
  const applyUrl = opportunity.applyUrl && opportunity.applyUrl.length > 0 ? opportunity.applyUrl : null;
  const matchPercentage = Math.round(opportunity.match ?? 0);
  const difficultyLabel = opportunity.difficulty ?? 'Medium';
  const applicantsCopy = opportunity.applicants ? `${opportunity.applicants} applicants` : 'No applicant data';
  const successRateCopy = opportunity.successRate ?? 'Success rate not shared yet';
  const requirements = opportunity.requirements.length > 0
    ? opportunity.requirements
    : ['Requirements will be updated soon.'];
  const benefits = opportunity.benefits.length > 0
    ? opportunity.benefits
    : ['Benefits will be updated soon.'];
  const applicationSteps = opportunity.applicationProcess.length > 0
    ? opportunity.applicationProcess
    : ['Application steps will be confirmed soon.'];
  const shareUrl = buildOpportunityShareUrl(opportunity.id);
  const shareText = buildOpportunityShareText(opportunity, shareUrl);

  useEffect(() => {
    let isActive = true;

    const checkBookmark = async () => {
      if (!userId) return;
      const token = await getToken().catch(() => null);
      const bookmarked = await isBookmarked(userId, opportunity.id, token);
      if (isActive) {
        setIsBookmarkedState(bookmarked);
      }
    };

    void checkBookmark();

    return () => {
      isActive = false;
    };
  }, [getToken, opportunity.id, userId]);

  const handleBack = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    onBack();
  };

  const handleBookmark = async () => {
    if (!userId) return;

    setBookmarkLoading(true);
    const token = await getToken().catch(() => null);

    if (isBookmarkedState) {
      const removed = await removeBookmark(userId, opportunity.id, token);
      if (removed) {
        setIsBookmarkedState(false);
        success('Bookmark removed');
      }
    } else {
      const added = await addBookmark(
        userId,
        {
          id: opportunity.id,
          title: opportunity.title,
          category: opportunity.category,
          deadline: opportunity.deadline,
          location: opportunity.location,
          match_percentage: opportunity.match,
        },
        token,
      );

      if (added) {
        setIsBookmarkedState(true);
        success('Opportunity saved');
      }
    }

    setBookmarkLoading(false);
  };

  const handleShare = async () => {
    setIsSharing(true);

    try {
      const shareCard = await fetchOpportunityShareCard(opportunity.id);
      const imageSource = shareCard?.url || opportunity.image || null;
      const pdfBlob = await fetchOpportunitySharePdfBlob(opportunity.id, imageSource);
      const shareData = {
        title: opportunity.title,
        text: shareText,
        url: shareUrl,
      };

      if (pdfBlob) {
        const pdfFile = new File([pdfBlob], buildOpportunityShareFileName(opportunity, 'pdf'), {
          type: 'application/pdf',
        });

        if (navigator.share && navigator.canShare?.({ files: [pdfFile] })) {
          await navigator.share({
            ...shareData,
            files: [pdfFile],
          });
          setShareCopied(true);
          success('WhatsApp share card ready');
        } else if (navigator.share) {
          await navigator.share(shareData);
          downloadBlob(pdfBlob, buildOpportunityShareFileName(opportunity, 'pdf'));
          setShareCopied(true);
          success('Shared the link and downloaded the PDF');
        } else {
          window.open(buildWhatsAppShareUrl(shareText), '_blank', 'noopener,noreferrer');
          downloadBlob(pdfBlob, buildOpportunityShareFileName(opportunity, 'pdf'));
          try {
            await navigator.clipboard.writeText(`${shareText}\n\n${shareUrl}`);
          } catch {
            // Ignore clipboard failures in insecure or unsupported contexts.
          }
          setShareCopied(true);
          success('Opened WhatsApp and downloaded the PDF');
        }
      } else if (navigator.share) {
        await navigator.share(shareData);
        setShareCopied(true);
        success('Opportunity shared');
      } else {
        window.open(buildWhatsAppShareUrl(shareText), '_blank', 'noopener,noreferrer');
        try {
          await navigator.clipboard.writeText(`${shareText}\n\n${shareUrl}`);
        } catch {
          // Ignore clipboard failures in insecure or unsupported contexts.
        }
        setShareCopied(true);
        success('Opened WhatsApp and copied the link');
      }

      setTimeout(() => setShareCopied(false), 2000);
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'NotAllowedError')) {
        return;
      }

      try {
        await navigator.clipboard.writeText(shareUrl);
        success('Link copied to clipboard');
      } catch {
        showError('Could not share this opportunity');
      }
    } finally {
      setIsSharing(false);
    }
  };

  const handleApply = async () => {
    if (!applyUrl) return;

    if (userId) {
      const token = await getToken().catch(() => null);
      const tracked = await addApplication(
        userId,
        {
          id: opportunity.id,
          title: opportunity.title,
          category: opportunity.category,
        },
        undefined,
        token,
      );

      if (tracked) {
        success('Application added to your tracker');
      } else {
        showError('Application link opened, but tracking could not be updated');
      }
    }

    window.open(applyUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <PublicEditorialShell>
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
        <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-2 border-b border-transparent pb-1 font-medium text-slate-700 transition-colors hover:border-slate-300 hover:text-brand-600 dark:text-slate-200 dark:hover:border-white/20"
          >
            <ArrowLeft size={16} />
            Back to opportunities
          </button>
          <span aria-hidden="true">•</span>
          <span>Open application</span>
        </div>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
          <article className="space-y-10">
            <header className="space-y-5 border-b border-slate-200 pb-8 dark:border-white/10">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.35em] text-brand-600 dark:text-brand-300">
                <Sparkles size={13} />
                Opportunity detail
              </p>
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl dark:text-white">
                {opportunity.title}
              </h1>
              <p className="max-w-3xl text-lg leading-8 text-slate-600 dark:text-slate-300">{opportunity.organization}</p>
              <p className="max-w-3xl text-base leading-7 text-slate-600 dark:text-slate-300">
                {opportunity.description || 'A straightforward application preview with the core details you need to decide, save, and apply.'}
              </p>
            </header>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ['Match', `${matchPercentage}%`],
                ['Difficulty', difficultyLabel],
                ['Deadline', formatDeadline(opportunity.deadline)],
                ['Location', opportunity.location || 'Worldwide'],
              ].map(([label, value]) => (
                <div key={label} className="border-b border-slate-200 pb-4 dark:border-white/10">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">{label}</p>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-950 dark:text-white">{value}</p>
                </div>
              ))}
              {(opportunity.stipend !== undefined && opportunity.stipend !== null) ? (
                <div className="border-b border-slate-200 pb-4 dark:border-white/10">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">Funding</p>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-950 dark:text-white">
                    {currencySymbol}
                    {opportunity.stipend.toLocaleString()}
                  </p>
                  {opportunity.currency ? (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{currencyLabel}</p>
                  ) : null}
                </div>
              ) : null}
              <div className="border-b border-slate-200 pb-4 dark:border-white/10">
                <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">Applicants</p>
                <p className="mt-2 text-sm font-medium leading-6 text-slate-950 dark:text-white">{applicantsCopy}</p>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">Requirements</h2>
              <ul className="space-y-3 text-base leading-7 text-slate-600 dark:text-slate-300">
                {requirements.map((item, index) => (
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
                {benefits.map((item, index) => (
                  <li key={`${item}-${index}`} className="flex gap-3">
                    <span className="mt-3 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">Application process</h2>
              <ol className="space-y-3 text-base leading-7 text-slate-600 dark:text-slate-300">
                {applicationSteps.map((item, index) => (
                  <li key={`${item}-${index}`} className="flex gap-4">
                    <span className="mt-0.5 text-sm font-semibold text-brand-600 dark:text-brand-300">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            </section>

            {opportunity.tags && opportunity.tags.length > 0 ? (
              <section className="space-y-3 border-t border-slate-200 pt-8 dark:border-white/10">
                <h2 className="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">Tags</h2>
                <div className="flex flex-wrap gap-2">
                  {opportunity.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 dark:border-white/10 dark:text-slate-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}
          </article>

          <aside className="space-y-6">
            <section className="border-y border-slate-200 py-5 dark:border-white/10">
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">
                Quick facts
              </p>
              <dl className="mt-4 space-y-4">
                <div>
                  <dt className="text-sm text-slate-500 dark:text-slate-400">Success rate</dt>
                  <dd className="mt-1 text-sm font-medium text-slate-950 dark:text-white">{successRateCopy}</dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500 dark:text-slate-400">Remote</dt>
                  <dd className="mt-1 text-sm font-medium text-slate-950 dark:text-white">
                    {opportunity.isRemote ? 'Yes' : 'Not specified'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500 dark:text-slate-400">Deadline urgency</dt>
                  <dd className="mt-1 text-sm font-medium text-slate-950 dark:text-white">
                    {daysUntilDeadline === null
                      ? 'No deadline set'
                      : daysUntilDeadline <= 0
                        ? 'Deadline has passed'
                        : `${daysUntilDeadline} days remaining`}
                  </dd>
                </div>
              </dl>
            </section>
            <section className="space-y-4 border-y border-slate-200 py-5 dark:border-white/10">
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">
                Actions
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={!applyUrl}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-brand-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ExternalLink size={16} />
                  {applyUrl ? 'Apply now' : 'Application link unavailable'}
                </button>
                <button
                  type="button"
                  onClick={handleShare}
                  disabled={isSharing}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:text-slate-950 disabled:cursor-wait disabled:opacity-50 dark:border-white/15 dark:text-slate-200 dark:hover:text-white"
                >
                  <Share2 size={16} />
                  {shareCopied ? 'Link copied' : 'Share preview'}
                </button>
                <button
                  type="button"
                  onClick={handleBookmark}
                  disabled={bookmarkLoading}
                  className={`inline-flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-50 ${
                    isBookmarkedState
                      ? 'bg-rose-500 text-white hover:bg-rose-600'
                      : 'border border-slate-300 text-slate-700 hover:border-slate-400 hover:text-slate-950 dark:border-white/15 dark:text-slate-200 dark:hover:text-white'
                  }`}
                >
                  <Heart size={16} fill={isBookmarkedState ? 'currentColor' : 'none'} />
                  {isBookmarkedState ? 'Saved' : 'Save'}
                </button>
              </div>
            </section>
          </aside>
        </div>
      </section>
    </PublicEditorialShell>
  );
};

export default OpportunityDetail;
