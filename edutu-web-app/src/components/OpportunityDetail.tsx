import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Calendar, MapPin, Users, Clock, Star, Bell, ExternalLink,
  Target, BookOpen, Loader2, Heart, Share2, Sparkles, Tag, DollarSign,
  CheckCircle2, AlertTriangle, Trophy, ChevronRight, Bookmark
} from 'lucide-react';
import Button from './ui/Button';
import Card from './ui/Card';
import ImageWithFallback from './ImageWithFallback';
import { useDarkMode } from '../hooks/useDarkMode';
import { useToast } from './ui/ToastProvider';
import { useAuth } from '@clerk/clerk-react';
import type { Opportunity } from '../types/opportunity';
import { addBookmark, removeBookmark, isBookmarked } from '../services/bookmarks';
import { addApplication } from '../services/applications';

interface OpportunityDetailProps {
  opportunity: Opportunity;
  onBack: () => void;
  onAddToGoals: (opportunity: Opportunity) => void;
  onNavigateToRoadmap?: () => void;
}

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.08
    }
  }
};

const OpportunityDetail: React.FC<OpportunityDetailProps> = ({
  opportunity,
  onBack,
  onAddToGoals,
  onNavigateToRoadmap
}) => {
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [isAddingToGoals, setIsAddingToGoals] = useState(false);
  const [isBookmarkedState, setIsBookmarkedState] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const shareCardRef = useRef<HTMLDivElement>(null);
  const { isDarkMode } = useDarkMode();
  const { success, error: showError } = useToast();

  const { userId, getToken } = useAuth();

  useEffect(() => {
    const checkBookmark = async () => {
      if (!userId) return;
      const token = await getToken().catch(() => null);
      const bookmarked = await isBookmarked(userId, opportunity.id, token);
      setIsBookmarkedState(bookmarked);
    };
    checkBookmark();
  }, [getToken, opportunity.id, userId]);

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
          match_percentage: opportunity.match
        },
        token
      );
      if (added) {
        setIsBookmarkedState(true);
        success('Opportunity saved');
      }
    }

    setBookmarkLoading(false);
  };

  const handleShare = async () => {
    const url = window.location.href;
    const fileName = `${opportunity.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-edutu.png`;
    try {
      const blob = await createShareImageBlob();
      if (blob) {
        const file = new File([blob], fileName, { type: 'image/png' });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({
            title: opportunity.title,
            text: `Check out this opportunity on Edutu: ${opportunity.title}`,
            url,
            files: [file],
          });
          setShareCopied(true);
          success('Opportunity image ready to share');
        } else {
          downloadBlob(blob, fileName);
          await navigator.clipboard.writeText(url);
          setShareCopied(true);
          success('Share image downloaded and link copied');
        }
      } else if (navigator.share) {
        await navigator.share({
          title: opportunity.title,
          text: `Check out this opportunity on Edutu: ${opportunity.title}`,
          url,
        });
        setShareCopied(true);
        success('Opportunity shared');
      } else {
        await navigator.clipboard.writeText(url);
        setShareCopied(true);
        success('Link copied to clipboard');
      }
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        success('Link copied to clipboard');
      } catch {
        showError('Could not share this opportunity');
      }
    }
  };

  const createShareImageBlob = async (): Promise<Blob | null> => {
    const card = shareCardRef.current;
    if (!card) return null;

    const width = 1200;
    const height = 1500;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <foreignObject width="100%" height="100%">
          <div xmlns="http://www.w3.org/1999/xhtml">
            ${card.outerHTML}
          </div>
        </foreignObject>
      </svg>`;
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    try {
      const img = await loadImage(svgUrl);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.fillStyle = '#fffaf0';
      context.fillRect(0, 0, width, height);
      context.drawImage(img, 0, 0, width, height);
      return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 0.95));
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  };

  const loadImage = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });

  const downloadBlob = (blob: Blob, fileName: string) => {
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
  };

  const difficultyLabel = opportunity.difficulty ?? 'Medium';
  const applicantsCopy = opportunity.applicants
    ? `${opportunity.applicants} applicants`
    : 'No applicant data';
  const successRateCopy = opportunity.successRate ?? 'Success rate not shared yet';
  const requirements =
    opportunity.requirements.length > 0
      ? opportunity.requirements
      : ['Requirements will be updated soon.'];
  const benefits =
    opportunity.benefits.length > 0
      ? opportunity.benefits
      : ['Benefits will be updated soon.'];
  const applicationSteps =
    opportunity.applicationProcess.length > 0
      ? opportunity.applicationProcess
      : ['Application steps will be confirmed soon.'];
  const applyUrl = opportunity.applyUrl && opportunity.applyUrl.length > 0 ? opportunity.applyUrl : null;

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
        token
      );

      if (tracked) {
        success('Application added to your tracker');
      } else {
        showError('Application link opened, but tracking could not be updated');
      }
    }

    window.open(applyUrl, '_blank', 'noopener,noreferrer');
  };

  const handleAddToGoals = async () => {
    setIsAddingToGoals(true);
    await new Promise(resolve => setTimeout(resolve, 2000));
    setIsAddingToGoals(false);
    onAddToGoals(opportunity);
  };

  const handleWinThisOpportunity = () => {
    if (onNavigateToRoadmap) {
      onNavigateToRoadmap();
    } else {
      window.location.hash = `/app/opportunity/${opportunity.id}/roadmap`;
    }
  };

  const handleAskAI = (intent: string) => {
    window.sessionStorage.setItem(
      'edutu.aiPrompt',
      `${intent}

Opportunity: ${opportunity.title}
Organization: ${opportunity.organization || 'Unknown'}
Category: ${opportunity.category || 'Opportunity'}
Deadline: ${opportunity.deadline || 'Rolling'}
Description: ${opportunity.description || 'No description available'}`
    );
    window.location.hash = '/app/chat';
  };

  const getDifficultyColor = (difficulty: string | null | undefined) => {
    switch (difficulty) {
      case 'Easy': return 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800';
      case 'Medium': return 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800';
      case 'Hard': return 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800';
      default: return 'bg-gray-50 text-gray-700 border border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700';
    }
  };

  const getMatchColor = (match: number) => {
    if (match >= 70) return 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800';
    if (match >= 40) return 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800';
    return 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800';
  };

  const getDaysUntilDeadline = () => {
    if (!opportunity.deadline) return null;
    const deadline = new Date(opportunity.deadline);
    const today = new Date();
    const diffTime = deadline.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const daysUntilDeadline = getDaysUntilDeadline();

  const getDeadlineUrgency = () => {
    if (daysUntilDeadline === null) return { bg: 'bg-gray-50 dark:bg-gray-800', border: 'border-gray-200 dark:border-gray-700', text: 'text-gray-700 dark:text-gray-300', icon: 'text-gray-500' };
    if (daysUntilDeadline <= 0) return { bg: 'bg-rose-50 dark:bg-rose-900/20', border: 'border-rose-200 dark:border-rose-800', text: 'text-rose-700 dark:text-rose-400', icon: 'text-rose-500' };
    if (daysUntilDeadline <= 14) return { bg: 'bg-rose-50 dark:bg-rose-900/20', border: 'border-rose-200 dark:border-rose-800', text: 'text-rose-700 dark:text-rose-400', icon: 'text-rose-500' };
    if (daysUntilDeadline <= 30) return { bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800', text: 'text-amber-700 dark:text-amber-400', icon: 'text-amber-500' };
    return { bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-800', text: 'text-emerald-700 dark:text-emerald-400', icon: 'text-emerald-500' };
  };

  const deadlineUrgency = getDeadlineUrgency();

  const formatDeadline = () => {
    if (!opportunity.deadline) return 'No deadline listed';
    const date = new Date(opportunity.deadline);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    scrollToTop();
    onBack();
  };

  const matchPercentage = Math.round(opportunity.match ?? 0);
  const shareSummary = (opportunity.description || 'Open this opportunity in Edutu for full details.')
    .replace(/\s+/g, ' ')
    .slice(0, 260);
  const shareReward =
    opportunity.stipend !== undefined && opportunity.stipend !== null
      ? `${opportunity.currency || 'USD'} ${opportunity.stipend.toLocaleString()}`
      : 'Funded opportunity';

  return (
    <div className={`min-h-screen bg-surface-body ${isDarkMode ? 'dark' : ''}`}>
      <div className="fixed -left-[9999px] top-0" aria-hidden="true">
        <div
          ref={shareCardRef}
          style={{
            width: 1200,
            height: 1500,
            boxSizing: 'border-box',
            background: 'linear-gradient(135deg, #fffaf0 0%, #ffffff 52%, #eef8f3 100%)',
            color: '#111827',
            padding: 72,
            fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <img src="/edutu-logo.png" alt="" width="72" height="72" style={{ objectFit: 'contain' }} />
              <div>
                <div style={{ fontSize: 52, lineHeight: 1, fontWeight: 900 }}>Edutu</div>
                <div style={{ marginTop: 8, color: '#64748b', fontSize: 20, fontWeight: 800, letterSpacing: 5 }}>
                  GLOBAL OPPORTUNITIES
                </div>
              </div>
            </div>
            <div style={{ color: '#9a6b12', fontSize: 28, fontWeight: 900 }}>edutu.ai</div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 44 }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#b7791f', fontSize: 24, fontWeight: 900, textTransform: 'uppercase' }}>
                {opportunity.category || 'Opportunity'}
              </div>
              <h1 style={{ margin: '18px 0 0', fontSize: 72, lineHeight: 1.05, fontWeight: 950, letterSpacing: 0 }}>
                {opportunity.title}
              </h1>
              <p style={{ margin: '28px 0 0', fontSize: 34, lineHeight: 1.35, color: '#1f2937' }}>
                {shareSummary}
              </p>
            </div>
            <div style={{ width: 260, textAlign: 'center' }}>
              {opportunity.image ? (
                <img
                  src={opportunity.image}
                  alt=""
                  width="240"
                  height="170"
                  style={{ objectFit: 'cover', borderRadius: 24, border: '2px solid #e5e7eb' }}
                  crossOrigin="anonymous"
                />
              ) : (
                <div style={{ width: 220, height: 170, borderRadius: 24, background: '#f1f5f9', border: '2px solid #e2e8f0' }} />
              )}
              <div style={{ marginTop: 20, color: '#163b7a', fontSize: 28, lineHeight: 1.15, fontWeight: 900, textTransform: 'uppercase' }}>
                {opportunity.organization}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 22, marginTop: 58 }}>
            {[
              ['Reward', shareReward],
              ['Deadline', opportunity.deadline ? formatDeadline() : 'Rolling'],
              ['Location', opportunity.location || 'Worldwide'],
            ].map(([label, value]) => (
              <div key={label} style={{ background: 'rgba(255,255,255,0.74)', border: '2px solid #e5e7eb', borderRadius: 22, padding: 24 }}>
                <div style={{ color: '#b7791f', fontSize: 20, fontWeight: 900 }}>{label}</div>
                <div style={{ marginTop: 10, color: '#111827', fontSize: 28, lineHeight: 1.18, fontWeight: 850 }}>{value}</div>
              </div>
            ))}
          </div>

          <div style={{ position: 'absolute', left: 72, right: 72, bottom: 72 }}>
            <div style={{ height: 2, background: '#e5e7eb', marginBottom: 28 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 36, alignItems: 'center' }}>
              <div style={{ color: '#111827', fontSize: 28, lineHeight: 1.25, fontWeight: 800 }}>
                Open in Edutu for requirements, benefits, and application steps.
              </div>
              <div style={{ color: '#64748b', fontSize: 22, fontWeight: 800, textAlign: 'right' }}>
                Share verified scholarship details.
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="sticky top-0 z-10 bg-surface-layer/80 backdrop-blur-xl border-b border-subtle">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBack}
              className="p-2 rounded-xl bg-surface-elevated border border-subtle hover:bg-surface-layer transition-theme"
            >
              <ArrowLeft size={20} className="text-soft" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-display font-bold text-strong line-clamp-1">{opportunity.title}</h1>
              <p className="text-sm text-muted truncate">{opportunity.organization}</p>
            </div>
            <button
              onClick={handleShare}
              className={`p-2 rounded-xl transition-all ${shareCopied ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-surface-elevated border border-subtle text-muted hover:bg-surface-layer'}`}
            >
              <Share2 size={18} />
            </button>
            <button
              onClick={handleBookmark}
              disabled={bookmarkLoading}
              className={`p-2 rounded-xl transition-all ${
                isBookmarkedState
                  ? 'bg-rose-500 text-white'
                  : 'bg-surface-elevated border border-subtle text-muted hover:bg-surface-layer'
              }`}
            >
              <Heart size={18} fill={isBookmarkedState ? 'currentColor' : 'none'} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 lg:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="relative h-56 sm:h-72 lg:h-80 rounded-2xl overflow-hidden bg-surface-elevated"
            >
              <ImageWithFallback
                src={opportunity.image ?? ''}
                alt={opportunity.title}
                className="w-full h-full object-cover"
                fallbackClassName="w-full h-full"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-6">
                <div className="flex flex-wrap gap-2 mb-3">
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-white/20 text-white backdrop-blur-sm border border-white/10">
                    {opportunity.category}
                  </span>
                  {opportunity.isRemote && (
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-white/20 text-white backdrop-blur-sm border border-white/10">
                      Remote
                    </span>
                  )}
                  {opportunity.featured && (
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-amber-400/90 text-amber-900 backdrop-blur-sm">
                      Featured
                    </span>
                  )}
                </div>
                <h2 className="text-2xl lg:text-3xl font-display font-bold text-white mb-2">{opportunity.title}</h2>
                <p className="text-white/80 text-sm">{opportunity.organization}</p>
              </div>
            </motion.div>

            <motion.div
              variants={staggerContainer}
              initial="initial"
              animate="animate"
              className="flex flex-wrap gap-2"
            >
              <motion.span variants={fadeInUp} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border ${getMatchColor(matchPercentage)}`}>
                <Target size={14} />
                {matchPercentage}% match
              </motion.span>
              <motion.span variants={fadeInUp} className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium ${getDifficultyColor(difficultyLabel)}`}>
                {difficultyLabel}
              </motion.span>
              {opportunity.tags && opportunity.tags.length > 0 && opportunity.tags.slice(0, 4).map((tag, i) => (
                <motion.span key={tag} variants={fadeInUp} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200 dark:bg-brand-900/20 dark:text-brand-400 dark:border-brand-800">
                  <Tag size={12} />
                  {tag}
                </motion.span>
              ))}
            </motion.div>

            <motion.div
              variants={staggerContainer}
              initial="initial"
              animate="animate"
              className="grid grid-cols-2 gap-4"
            >
              <motion.div variants={fadeInUp} className="flex items-center gap-3 p-4 rounded-xl bg-surface-layer border border-subtle">
                <MapPin size={20} className="text-brand-500 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted">Location</p>
                  <p className="text-sm font-medium text-strong truncate">{opportunity.location}</p>
                </div>
              </motion.div>
              <motion.div variants={fadeInUp} className="flex items-center gap-3 p-4 rounded-xl bg-surface-layer border border-subtle">
                <Users size={20} className="text-brand-500 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted">Applicants</p>
                  <p className="text-sm font-medium text-strong truncate">{applicantsCopy}</p>
                </div>
              </motion.div>
            </motion.div>

            {opportunity.description && (
              <motion.div {...fadeInUp}>
                <Card>
                  <h3 className="text-lg font-display font-semibold text-strong mb-3">About This Opportunity</h3>
                  <p className="text-soft leading-relaxed">{opportunity.description}</p>
                </Card>
              </motion.div>
            )}

            <motion.div {...fadeInUp}>
              <Card>
                <h3 className="text-lg font-display font-semibold text-strong mb-3">Requirements</h3>
                <ul className="space-y-2.5">
                  {requirements.map((req, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <CheckCircle2 size={18} className="text-brand-500 flex-shrink-0 mt-0.5" />
                      <span className="text-soft">{req}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </motion.div>

            <motion.div {...fadeInUp}>
              <Card>
                <h3 className="text-lg font-display font-semibold text-strong mb-3">Benefits</h3>
                <ul className="space-y-2.5">
                  {benefits.map((benefit, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <Star size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
                      <span className="text-soft">{benefit}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </motion.div>

            <motion.div {...fadeInUp}>
              <Card>
                <h3 className="text-lg font-display font-semibold text-strong mb-4">Application Process</h3>
                <div className="space-y-4">
                  {applicationSteps.map((step, index) => (
                    <div key={index} className="flex gap-4">
                      <div className="w-8 h-8 rounded-full gradient-accent flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                        {index + 1}
                      </div>
                      <div className="flex-1 pt-1">
                        <p className="text-soft">{step}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </motion.div>

            {opportunity.tags && opportunity.tags.length > 4 && (
              <motion.div {...fadeInUp}>
                <Card>
                  <h3 className="text-lg font-display font-semibold text-strong mb-3 flex items-center gap-2">
                    <Sparkles size={18} className="text-brand-500" />
                    AI Tags
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {opportunity.tags.map((tag) => (
                      <span key={tag} className="px-3 py-1.5 rounded-lg text-sm bg-surface-elevated text-muted border border-subtle hover:border-brand-300 dark:hover:border-brand-700 transition-theme cursor-default">
                        {tag}
                      </span>
                    ))}
                  </div>
                </Card>
              </motion.div>
            )}
          </div>

          <div className="space-y-6">
            {daysUntilDeadline !== null && (
              <motion.div {...fadeInUp}>
                <Card className={`${deadlineUrgency.bg} ${deadlineUrgency.border}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`p-2 rounded-lg ${deadlineUrgency.bg}`}>
                      <Calendar size={20} className={deadlineUrgency.icon} />
                    </div>
                    <div>
                      <p className="text-xs text-muted">Application Deadline</p>
                      <p className={`text-sm font-semibold ${deadlineUrgency.text}`}>{formatDeadline()}</p>
                    </div>
                  </div>
                  {daysUntilDeadline > 0 && (
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${deadlineUrgency.bg}`}>
                      {daysUntilDeadline <= 14 ? (
                        <AlertTriangle size={16} className={deadlineUrgency.icon} />
                      ) : (
                        <Clock size={16} className={deadlineUrgency.icon} />
                      )}
                      <span className={`text-sm font-medium ${deadlineUrgency.text}`}>
                        {daysUntilDeadline} {daysUntilDeadline === 1 ? 'day' : 'days'} remaining
                      </span>
                    </div>
                  )}
                  {daysUntilDeadline <= 0 && (
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${deadlineUrgency.bg}`}>
                      <AlertTriangle size={16} className={deadlineUrgency.icon} />
                      <span className={`text-sm font-medium ${deadlineUrgency.text}`}>
                        Deadline has passed
                      </span>
                    </div>
                  )}
                </Card>
              </motion.div>
            )}

            {(opportunity.stipend !== undefined && opportunity.stipend !== null) && (
              <motion.div {...fadeInUp}>
                <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200 dark:from-emerald-900/20 dark:to-teal-900/20 dark:border-emerald-800">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
                      <DollarSign size={20} className="text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-xs text-muted">Stipend / Funding</p>
                      <p className="text-xl font-display font-bold text-emerald-700 dark:text-emerald-400">
                        {opportunity.currency === 'NGN' ? '?' : opportunity.currency === 'GBP' ? '�' : opportunity.currency === 'EUR' ? '�' : '$'}
                        {opportunity.stipend.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  {opportunity.currency && (
                    <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">
                      {opportunity.currency === 'NGN' ? 'Nigerian Naira' : opportunity.currency === 'GBP' ? 'British Pound' : opportunity.currency === 'EUR' ? 'Euro' : 'US Dollar'}
                    </p>
                  )}
                </Card>
              </motion.div>
            )}

            <motion.div {...fadeInUp}>
              <Card>
                <h3 className="text-sm font-semibold text-strong mb-4">Quick Actions</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ['Eligibility', 'Check my eligibility for this opportunity. Be specific about likely gaps and what I should verify.'],
                      ['Fit', 'Explain why this opportunity fits me and what profile details would improve the match.'],
                      ['CV', 'Suggest how to tailor my CV for this opportunity with concrete bullet improvements.'],
                      ['Prep', 'Create a concise preparation plan for this application before the deadline.'],
                    ].map(([label, prompt]) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => handleAskAI(prompt)}
                        className="rounded-xl border border-brand-500/20 bg-brand-500/5 px-3 py-2 text-xs font-bold text-brand-600 transition hover:bg-brand-500 hover:text-white dark:text-brand-300"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={handleWinThisOpportunity}
                    className="w-full gradient-accent text-white font-medium py-3 px-4 rounded-xl hover:opacity-95 transition-theme flex items-center justify-center gap-2 shadow-soft"
                  >
                    <Trophy size={18} />
                    Win This Opportunity
                    <ChevronRight size={16} />
                  </button>
                  <button
                    onClick={handleApply}
                    disabled={!applyUrl}
                    className="w-full bg-surface-elevated text-strong font-medium py-3 px-4 rounded-xl border border-subtle hover:border-brand-300 dark:hover:border-brand-700 transition-theme flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ExternalLink size={16} />
                    {applyUrl ? 'Apply Now' : 'Link Coming Soon'}
                  </button>
                  <button
                    onClick={handleAddToGoals}
                    disabled={isAddingToGoals}
                    className="w-full bg-surface-elevated text-muted font-medium py-2.5 px-4 rounded-xl border border-subtle hover:text-strong hover:border-subtle transition-theme flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                  >
                    {isAddingToGoals ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <Bookmark size={14} />
                        Track Deadline Only
                      </>
                    )}
                  </button>
                </div>
              </Card>
            </motion.div>

            <motion.div {...fadeInUp}>
              <Card>
                <h3 className="text-sm font-semibold text-strong mb-3">Success Rate</h3>
                <div className="flex items-center gap-3">
                  <Trophy size={20} className="text-amber-500" />
                  <p className="text-soft text-sm">{successRateCopy}</p>
                </div>
              </Card>
            </motion.div>

            {notificationsEnabled && (
              <motion.div {...fadeInUp}>
                <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-3">
                    <Bell size={18} className="text-blue-600 dark:text-blue-400" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-blue-800 dark:text-blue-300">Notifications Enabled</p>
                      <p className="text-xs text-blue-600 dark:text-blue-400">We'll remind you about important deadlines</p>
                    </div>
                    <button
                      onClick={() => setNotificationsEnabled(false)}
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
                    >
                      <ArrowLeft size={16} className="rotate-180" />
                    </button>
                  </div>
                </Card>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OpportunityDetail;
