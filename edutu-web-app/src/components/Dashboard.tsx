import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  Award,
  Bell,
  Bookmark,
  Briefcase,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Globe,
  LayoutGrid,
  List,
  Menu,
  Moon,
  Send,
  Settings,
  Sun,
  Target,
  Sparkles,
  Trophy,
  Users,
  X,
  UserCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from './ui/Button';
import { EmptyState } from './ui/EmptyState';
import NotificationInbox from './NotificationInbox';
import CalendarStrip from './CalendarStrip';
import type { CalendarEvent } from './CalendarStrip';
import { useDarkMode } from '../hooks/useDarkMode';
import { useTheme } from '../hooks/useTheme';
import { useGoals } from '../hooks/useGoals';
import { useOpportunities } from '../hooks/useOpportunities';
import { usePersonalizedOpportunities } from '../hooks/usePersonalizedOpportunities';
import { useUserStats } from '../hooks/useUserStats';
import { useNotifications } from '../hooks/useNotifications';
import type { AppUser } from '../types/user';
import type { OnboardingProfileData } from '../types/onboarding';
import { useTranslation } from 'react-i18next';
import { getBookmarks } from '../services/bookmarks';
import { getApplications } from '../services/applications';
import { calculateProfileCompleteness } from '../services/profileCompleteness';
import { getUserPersonalization } from '../services/personalizationService';
import { fetchUserProfile } from '../services/profile';
import { supabase } from '../lib/supabaseClient';
import ImageWithFallback from './ImageWithFallback';

const HOME_FEED_BATCH_SIZE = 8;
const HOME_FEED_PROMO_INTERVAL = 6;

interface DashboardProps {
  user: AppUser | null;
  onOpportunityClick: (opportunity: any) => void;
  onViewAllOpportunities: () => void;
  onGoalClick: (goalId: string) => void;
  onNavigate?: (screen: string) => void;
  onAddGoal?: () => void;
  onViewAllGoals?: () => void;
  onboardingProfile?: OnboardingProfileData | null;
  onRedoOnboarding?: () => void;
}

export interface DashboardRef {
  refreshOpportunities: () => void;
}

const Dashboard = React.forwardRef<DashboardRef, DashboardProps>(function Dashboard({
  user,
  onOpportunityClick,
  onViewAllOpportunities,
  onGoalClick,
  onNavigate,
  onboardingProfile
}, ref) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true);
  const [dismissBanner, setDismissBanner] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [homeFeedLimit, setHomeFeedLimit] = useState(HOME_FEED_BATCH_SIZE);
  const { isDarkMode } = useDarkMode();
  const { toggleDarkMode } = useTheme();
  const { goals } = useGoals();
  const opportunitiesRefreshRef = useRef<() => void>();
  const homeFeedSentinelRef = useRef<HTMLDivElement | null>(null);
  const { t } = useTranslation();
  const [bookmarks, setBookmarks] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [profileScore, setProfileScore] = useState<{ score: number; missingFields: string[]; isMatchEnabled: boolean } | null>(null);

  // Real-time user statistics
  const userStats = useUserStats(user?.id);
  const { unreadCount } = useNotifications();

  const opportunities = useOpportunities();
  const personalized = usePersonalizedOpportunities();
  const {
    data: opportunityFeed,
    loading: opportunitiesLoading,
    refresh: hookRefreshOpportunities
  } = onboardingProfile ? personalized : opportunities;

  useEffect(() => {
    opportunitiesRefreshRef.current = hookRefreshOpportunities;
  }, [hookRefreshOpportunities]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }
    const userId = user.id;

    async function loadProfileData() {
      try {
        const [profile, personalization] = await Promise.all([
          fetchUserProfile(userId),
          getUserPersonalization(userId)
        ]);

        const completeness = calculateProfileCompleteness(profile, onboardingProfile, personalization);
        setProfileScore(completeness);
      } catch (e) {
        console.error('Failed to load profile completeness:', e);
      }
    }

    loadProfileData();
  }, [user?.id, onboardingProfile]);

  useEffect(() => {
    if (!user?.id) return;
    const userId = user.id;

    async function loadDeadlines() {
      try {
        const [bookmarksData, appsData] = await Promise.all([
          getBookmarks(userId),
          getApplications(userId)
        ]);
        setBookmarks(bookmarksData);
        setApplications(appsData);
      } catch (e) {
        console.error('Failed to load deadlines:', e);
      }
    }

    loadDeadlines();
  }, [user?.id]);

  const normalizedOpportunityFeed = useMemo(() => {
    if (!Array.isArray(opportunityFeed)) return [];
    return opportunityFeed
      .map((item: any) => (item && typeof item === 'object' && 'opportunity' in item ? item.opportunity : item))
      .filter(Boolean);
  }, [opportunityFeed]);

  const visibleHomeOpportunities = useMemo(
    () => normalizedOpportunityFeed.slice(0, homeFeedLimit),
    [normalizedOpportunityFeed, homeFeedLimit]
  );

  const homePromos = useMemo(() => [
    {
      title: 'Build a roadmap',
      copy: 'Turn this opportunity search into a weekly action plan.',
      action: 'Explore roadmaps',
      screen: 'roadmap-templates',
    },
    {
      title: 'Improve your matches',
      copy: 'Complete your profile so Edutu can rank opportunities better.',
      action: 'Personalize',
      screen: 'personalization',
    },
    {
      title: 'Share a path',
      copy: 'Create verified roadmaps other learners can follow.',
      action: 'Creator tools',
      screen: 'community-marketplace',
    },
  ], []);

  const homeFeedItems = useMemo(() => {
    const items: Array<
      | { type: 'opportunity'; key: string; opportunity: any }
      | { type: 'promo'; key: string; promo: (typeof homePromos)[number] }
    > = [];

    visibleHomeOpportunities.forEach((opportunity: any, index) => {
      items.push({
        type: 'opportunity',
        key: opportunity?.id ? `opportunity-${opportunity.id}` : `opportunity-${index}`,
        opportunity,
      });

      if ((index + 1) % HOME_FEED_PROMO_INTERVAL === 0) {
        items.push({
          type: 'promo',
          key: `promo-${index}`,
          promo: homePromos[Math.floor(index / HOME_FEED_PROMO_INTERVAL) % homePromos.length],
        });
      }
    });

    return items;
  }, [homePromos, visibleHomeOpportunities]);

  useEffect(() => {
    setHomeFeedLimit(HOME_FEED_BATCH_SIZE);
  }, [normalizedOpportunityFeed.length]);

  useEffect(() => {
    const sentinel = homeFeedSentinelRef.current;
    if (!sentinel || opportunitiesLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry.isIntersecting) return;

        setHomeFeedLimit((current) => {
          if (current >= normalizedOpportunityFeed.length) return current;
          return Math.min(current + HOME_FEED_BATCH_SIZE, normalizedOpportunityFeed.length);
        });
      },
      { rootMargin: '420px 0px' }
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [normalizedOpportunityFeed.length, opportunitiesLoading]);

  const formatUpdatedAt = (updatedAt: string) => {
    const diff = Date.now() - new Date(updatedAt).getTime();
    const mins = Math.floor(diff / (1000 * 60));
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(updatedAt).toLocaleDateString();
  };

  const completedGoals = useMemo(() => goals.filter((g) => g.status === 'completed'), [goals]);

  const menuItems = [
    { id: 'all-goals', label: 'All Goals', icon: <CheckCircle2 size={18} /> },
    { id: 'opportunities', label: 'Opportunities', icon: <Briefcase size={18} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={18} /> }
  ];

  const desktopPrimaryItems = [
    { id: 'home', label: 'Home', icon: <LayoutGrid size={18} />, active: true },
    { id: 'opportunities', label: 'Opportunities', icon: <Briefcase size={18} /> },
    { id: 'all-goals', label: 'All Goals', icon: <Target size={18} /> },
    { id: 'community', label: 'Community', icon: <Users size={18} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={18} /> },
  ];

  const desktopQuickItems = [
    { id: 'saved', label: 'Saved', icon: <Bookmark size={17} />, count: bookmarks.length },
    { id: 'applied', label: 'Applied', icon: <Send size={17} />, count: applications.length },
    { id: 'roadmap-templates', label: 'Roadmaps', icon: <Target size={17} /> },
  ];

  // Real-time stats using the hook data
  const stats = useMemo(() => {
    const formatDeadline = () => {
      if (!userStats.nextDeadline.date) return 'None';
      return new Date(userStats.nextDeadline.date).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric'
      });
    };

    const getDeadlineHelper = () => {
      if (!userStats.nextDeadline.daysUntil && userStats.nextDeadline.daysUntil !== 0) {
        return 'Set a target';
      }
      const days = userStats.nextDeadline.daysUntil;
      if (days < 0) return 'Overdue!';
      if (days === 0) return 'Due today!';
      if (days === 1) return 'Due tomorrow';
      return `Due in ${days} days`;
    };

    const getConsistencyHelper = () => {
      if (userStats.consistency >= 80) return 'Momentum looks strong';
      if (userStats.consistency >= 50) return 'Keep it going!';
      if (userStats.consistency > 0) return 'Room to improve';
      return 'Start tracking today';
    };

    return [
      {
        label: t('dashboard.stats.goalsActive'),
        value: userStats.activeGoals.toString(),
        helper: `${userStats.completedGoals} ${t('dashboard.stats.completed').toLowerCase()}`,
        icon: <Target size={18} />,
        tone: 'brand'
      },
      {
        label: 'Consistency',
        value: `${userStats.consistency}%`,
        helper: getConsistencyHelper(),
        icon: <Trophy size={18} />,
        tone: 'emerald'
      },
      {
        label: 'Avg progress',
        value: `${userStats.avgProgress}%`,
        helper: 'Across active goals',
        icon: <CheckCircle2 size={18} />,
        tone: 'indigo'
      },
      {
        label: 'Next deadline',
        value: formatDeadline(),
        helper: getDeadlineHelper(),
        icon: <Clock size={18} />,
        tone: 'amber'
      }
    ];
  }, [t, userStats]);

  const recentWins = useMemo(() => {
    const goalWins = completedGoals.map(g => ({
      id: g.id,
      title: `Completed ${g.title}`,
      icon: <CheckCircle2 size={16} />,
      date: formatUpdatedAt(g.updated_at)
    }));
    return goalWins.slice(0, 5);
  }, [completedGoals]);

  const handleMenuItemClick = (id: string) => {
    if (onNavigate) onNavigate(id);
  };

  const handleCalendarEventClick = (event: CalendarEvent) => {
    if (event.type === 'goal') {
      onGoalClick(event.id);
      return;
    }

    if (event.type === 'bookmark') {
      const bookmark = bookmarks.find((item) => item.id === event.id);
      if (bookmark?.opportunity_id) {
        onOpportunityClick({
          id: bookmark.opportunity_id,
          title: bookmark.opportunity_title,
          category: bookmark.opportunity_category
        });
        return;
      }
      onNavigate?.('saved');
      return;
    }

    const application = applications.find((item) => item.id === event.id);
    if (application?.opportunity_id) {
      onOpportunityClick({
        id: application.opportunity_id,
        title: application.opportunity_title,
        category: application.opportunity_category
      });
      return;
    }
    onNavigate?.('applied');
  };

  const nextAction = useMemo(() => {
    if (profileScore && profileScore.score < 60) {
      return {
        eyebrow: 'Profile setup',
        title: 'Improve your opportunity matches',
        copy: `Your profile is ${profileScore.score}% complete. Add the missing details so recommendations can be ranked with more confidence.`,
        action: 'Complete profile',
        onClick: () => onNavigate?.('personalization'),
        icon: <UserCheck size={20} />
      };
    }

    if (userStats.nextDeadline.date) {
      return {
        eyebrow: 'Deadline focus',
        title: userStats.nextDeadline.daysUntil === 0 ? 'A deadline is due today' : 'Stay ahead of your next deadline',
        copy: stats[3]?.helper === 'Set a target'
          ? 'Review your goals and saved opportunities to keep your plan current.'
          : `${stats[3]?.helper}. Open your calendar items and decide the next task now.`,
        action: 'Review deadlines',
        onClick: () => onNavigate?.('deadlines'),
        icon: <Calendar size={20} />
      };
    }

    if (userStats.activeGoals === 0) {
      return {
        eyebrow: 'Planning',
        title: 'Create your first active goal',
        copy: 'Turn an opportunity or career target into a roadmap so the dashboard can track real progress.',
        action: 'Add goal',
        onClick: () => onNavigate?.('add-goal'),
        icon: <Target size={20} />
      };
    }

    return {
      eyebrow: 'Opportunities',
      title: 'Explore matched opportunities',
      copy: 'Review fresh recommendations and save the ones worth preparing for.',
      action: 'Browse matches',
      onClick: onViewAllOpportunities,
      icon: <Briefcase size={20} />
    };
  }, [onNavigate, onViewAllOpportunities, profileScore, stats, userStats.activeGoals, userStats.nextDeadline.date, userStats.nextDeadline.daysUntil]);

  const getStatToneClasses = (tone: string) => {
    switch (tone) {
      case 'emerald':
        return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
      case 'indigo':
        return 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400';
      case 'amber':
        return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
      default:
        return 'bg-brand-500/10 text-brand-600 dark:text-brand-400';
    }
  };

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-950 text-white' : 'bg-slate-50 text-slate-900'} font-body transition-colors duration-500 overflow-x-hidden pb-12`}>
      {/* Background Mesh Gradient */}
      <div className="fixed inset-0 pointer-events-none opacity-30 dark:opacity-20 mesh-gradient" />

      {/* Header */}
      <header className={`sticky top-0 z-40 backdrop-blur-xl border-b transition-all duration-300 ${isDarkMode ? 'bg-gray-950/80 border-white/5' : 'bg-white/80 border-slate-200'
        }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 md:h-16">
            {/* Logo - No background color */}
            <div className="flex items-center gap-2 md:gap-3">
              <img src="/edutu-logo.png" alt="Edutu Logo" className="h-8 w-8 md:h-10 md:w-10 object-contain" />
              <span className={`text-xl md:text-2xl font-display font-bold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                Edutu
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative hidden md:block">
                <button
                  type="button"
                  onClick={() => setShowHeaderMenu((value) => !value)}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold transition-all ${isDarkMode
                    ? 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  aria-expanded={showHeaderMenu}
                  aria-label="Open dashboard menu"
                >
                  <Menu size={17} />
                  Menu
                </button>

                <AnimatePresence>
                  {showHeaderMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.98 }}
                      transition={{ duration: 0.16 }}
                      className={`absolute right-0 top-full mt-3 w-64 rounded-2xl border p-2 shadow-2xl ${isDarkMode
                        ? 'border-white/10 bg-gray-950 text-white shadow-black/40'
                        : 'border-slate-200 bg-white text-slate-900 shadow-slate-200/80'
                        }`}
                    >
                      {[
                        { id: 'personalization', label: 'Personalization', icon: <Sparkles size={17} /> },
                        { id: 'notifications', label: 'Notifications', icon: <Bell size={17} /> },
                        { id: 'settings', label: 'Settings', icon: <Settings size={17} /> },
                        { id: 'help', label: 'Help Center', icon: <Globe size={17} /> },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            if (item.id === 'notifications') setShowNotifications(true);
                            else onNavigate?.(item.id);
                            setShowHeaderMenu(false);
                          }}
                          className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${isDarkMode
                            ? 'text-slate-300 hover:bg-white/10 hover:text-white'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                            }`}
                        >
                          {item.icon}
                          {item.label}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Notification Button */}
              <button
                type="button"
                onClick={() => setShowNotifications(true)}
                className={`relative p-2.5 rounded-xl border transition-all ${isDarkMode
                  ? 'border-white/5 bg-white/5 hover:bg-white/10 text-slate-300'
                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                  }`}
                aria-label="Notifications"
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute top-2 right-2 h-2.5 w-2.5 bg-rose-500 rounded-full border-2 border-white dark:border-gray-950" />
                )}
              </button>

              {/* Mobile Menu Button */}
              <button
                type="button"
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                className="md:hidden p-2 rounded-xl transition-all"
                style={{
                  backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                }}
                aria-label={showMobileMenu ? 'Close menu' : 'Open menu'}
              >
                {showMobileMenu ? (
                  <X size={20} className={isDarkMode ? 'text-white' : 'text-slate-700'} />
                ) : (
                  <Menu size={20} className={isDarkMode ? 'text-white' : 'text-slate-700'} />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        <AnimatePresence>
          {showMobileMenu && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className={`md:hidden border-t overflow-hidden ${isDarkMode ? 'border-white/5 bg-gray-950/95' : 'border-slate-200 bg-white/95'} backdrop-blur-xl`}
            >
              <div className="px-4 py-3 space-y-1">
                {menuItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      handleMenuItemClick(item.id);
                      setShowMobileMenu(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${isDarkMode
                      ? 'text-slate-300 hover:text-white hover:bg-white/5'
                      : 'text-slate-600 hover:text-brand-600 hover:bg-brand-50'
                      }`}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
                {/* Additional mobile-only items */}
                <button
                  type="button"
                  onClick={() => {
                    onNavigate?.('saved');
                    setShowMobileMenu(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${isDarkMode
                    ? 'text-slate-300 hover:text-white hover:bg-white/5'
                    : 'text-slate-600 hover:text-brand-600 hover:bg-brand-50'
                    }`}
                >
                  <Bookmark size={18} />
                  Saved Opportunities
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onNavigate?.('applied');
                    setShowMobileMenu(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${isDarkMode
                    ? 'text-slate-300 hover:text-white hover:bg-white/5'
                    : 'text-slate-600 hover:text-brand-600 hover:bg-brand-50'
                    }`}
                >
                  <Send size={18} />
                  Applied
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onNavigate?.('roadmap-templates');
                    setShowMobileMenu(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${isDarkMode
                    ? 'text-slate-300 hover:text-white hover:bg-white/5'
                    : 'text-slate-600 hover:text-brand-600 hover:bg-brand-50'
                    }`}
                >
                  <Target size={18} />
                  Roadmaps
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <button
        type="button"
        onClick={() => setIsDesktopSidebarOpen((value) => !value)}
        className={`hidden lg:flex fixed top-24 z-50 h-11 w-11 items-center justify-center rounded-2xl border shadow-lg transition-all duration-300 ${isDesktopSidebarOpen ? 'left-[292px]' : 'left-4'} ${isDarkMode
          ? 'border-white/10 bg-gray-900 text-white shadow-black/30 hover:bg-gray-800'
          : 'border-slate-200 bg-white text-slate-700 shadow-slate-200/80 hover:bg-slate-50'
          }`}
        aria-label={isDesktopSidebarOpen ? 'Collapse sidebar' : 'Open sidebar'}
        aria-expanded={isDesktopSidebarOpen}
      >
        {isDesktopSidebarOpen ? <X size={18} /> : <Menu size={18} />}
      </button>

      <aside
        className={`hidden lg:block fixed left-0 top-16 bottom-0 z-40 w-[280px] border-r transition-transform duration-300 ${isDesktopSidebarOpen ? 'translate-x-0' : '-translate-x-full'} ${isDarkMode
          ? 'border-white/10 bg-gray-950/95'
          : 'border-slate-200 bg-white/95'
          } backdrop-blur-xl`}
      >
        <div className="h-full overflow-y-auto px-4 py-6">
          <div className={`rounded-[20px] border p-4 shadow-sm ${isDarkMode ? 'border-white/10 bg-gray-900/70' : 'border-slate-200 bg-white'}`}>
            <div className="flex items-center gap-3 rounded-2xl p-3" style={{ backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : '#f8fafc' }}>
              <div className="h-11 w-11 rounded-2xl bg-brand-500 text-white flex items-center justify-center font-black">
                {(user?.name || user?.email || 'E').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black truncate">{user?.name || 'Edutu learner'}</p>
                <p className={`text-xs truncate ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{user?.email || 'Welcome back'}</p>
              </div>
            </div>

            <nav className="mt-5 space-y-1" aria-label="Dashboard sidebar">
              {desktopPrimaryItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => item.id !== 'home' && onNavigate?.(item.id)}
                  className={`w-full flex items-center justify-between rounded-2xl px-3 py-3 text-sm font-bold transition-all ${item.active
                    ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20'
                    : isDarkMode
                      ? 'text-slate-300 hover:bg-white/10 hover:text-white'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                    }`}
                >
                  <span className="flex items-center gap-3">
                    {item.icon}
                    {item.label}
                  </span>
                  {item.active && <span className="h-2 w-2 rounded-full bg-white" />}
                </button>
              ))}
            </nav>

            <div className={`my-5 h-px ${isDarkMode ? 'bg-white/10' : 'bg-slate-100'}`} />

            <div>
              <p className={`px-3 text-[10px] font-black uppercase tracking-[0.18em] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Quick actions</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {desktopQuickItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNavigate?.(item.id)}
                    className={`rounded-2xl border p-3 text-left transition-all ${isDarkMode
                      ? 'border-white/10 bg-white/5 hover:bg-white/10'
                      : 'border-slate-200 bg-slate-50 hover:bg-white hover:shadow-sm'
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-brand-500">{item.icon}</span>
                      {typeof item.count === 'number' && (
                        <span className={`text-[10px] font-black ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{item.count}</span>
                      )}
                    </div>
                    <p className="mt-3 text-xs font-bold">{item.label}</p>
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>
      </aside>

      <div className={`mx-auto w-full max-w-[1500px] px-4 sm:px-6 lg:px-8 transition-[padding] duration-300 ${isDesktopSidebarOpen ? 'lg:pl-[320px]' : 'lg:pl-8'}`}>
      <main className="min-w-0 px-0 py-6 space-y-8">
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`overflow-hidden rounded-[20px] border p-5 sm:p-6 ${isDarkMode ? 'border-white/10 bg-gray-900/70' : 'border-slate-200 bg-white shadow-sm'}`}
        >
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(520px,1fr)]">
            <div className="flex min-w-0 flex-col justify-between gap-5">
              <div>
                <div className={`mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${isDarkMode ? 'bg-white/5 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                  {nextAction.icon}
                  {nextAction.eyebrow}
                </div>
                <h1 className="max-w-2xl text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">
                  {nextAction.title}
                </h1>
                <p className={`mt-2 max-w-2xl text-sm leading-6 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  {nextAction.copy}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" size="sm" onClick={nextAction.onClick}>
                  {nextAction.action}
                  <ChevronRight size={15} />
                </Button>
                <button
                  type="button"
                  onClick={onViewAllOpportunities}
                  className={`inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-bold transition-colors ${isDarkMode ? 'border-white/10 text-slate-300 hover:bg-white/10 hover:text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}
                >
                  Browse all
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className={`rounded-2xl border p-4 ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-slate-100 bg-slate-50'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`text-[10px] font-black uppercase tracking-[0.16em] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        {stat.label}
                      </p>
                      <p className="mt-2 text-2xl font-black tracking-tight text-slate-950 dark:text-white">
                        {stat.value}
                      </p>
                    </div>
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${getStatToneClasses(stat.tone)}`}>
                      {stat.icon}
                    </span>
                  </div>
                  <p className={`mt-3 text-xs font-semibold ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    {stat.helper}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </motion.section>

        <AnimatePresence>
          {profileScore && profileScore.score < 100 && !dismissBanner && (
            <motion.section
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 100 }}
              transition={{ duration: 0.3 }}
              className={`premium-card rounded-[20px] p-5 border-l-4 ${isDarkMode ? 'bg-amber-500/5 border-amber-500/50' : 'bg-amber-50 border-amber-400'}`}
            >
              <div className="flex items-start gap-4">
                <div className={`p-2.5 rounded-xl shrink-0 ${isDarkMode ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-100 text-amber-600'}`}>
                  <UserCheck size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-black tracking-wider text-slate-900 dark:text-white mb-1">
                        Complete your profile
                      </h3>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        Unlock personalized matches at {profileScore.score}%
                      </p>
                      {profileScore.missingFields.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {profileScore.missingFields.slice(0, 3).map((field) => (
                            <span
                              key={field}
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isDarkMode ? 'bg-white/10 text-slate-300' : 'bg-white text-slate-600'}`}
                            >
                              {field}
                            </span>
                          ))}
                          {profileScore.missingFields.length > 3 && (
                            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-300">
                              +{profileScore.missingFields.length - 3} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setDismissBanner(true)}
                      className={`p-1 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-white/10 text-slate-500' : 'hover:bg-slate-100 text-slate-400'}`}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="mt-3 space-y-3">
                    <div className="h-2 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${profileScore.score}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                        className={`h-full rounded-full ${
                          profileScore.score >= 60
                            ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                            : 'bg-gradient-to-r from-amber-500 to-amber-400'
                        }`}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => onNavigate?.('personalization')}
                        className="text-xs font-black tracking-widest text-brand-500 hover:text-brand-600 transition-colors"
                      >
                        Complete Now
                      </button>
                      {!profileScore.isMatchEnabled && (
                        <span className="text-[10px] font-bold text-amber-500 tracking-wider">
                          Need 60% for matches
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-[20px] p-5 sm:p-6 shadow-lg shadow-slate-950/10 min-h-[120px]"
          style={{
            backgroundImage: "url('https://images.pexels.com/photos/3184418/pexels-photo-3184418.jpeg')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="absolute inset-0 bg-slate-950/78" />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/88 via-slate-950/70 to-slate-950/48" />
          <div className="relative flex min-h-[72px] items-center justify-between gap-4">
            <div className="max-w-xl">
              <h3 className="text-base sm:text-lg font-bold tracking-tight text-white">
                Android release ready
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-white/82">
                The web app is live and the Android bundle is ready for Play Store submission.
              </p>
            </div>
            <div className="hidden gap-2 sm:flex">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white/12 text-emerald-200 ring-1 ring-white/15 backdrop-blur">
                Web
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white/12 text-white/80 ring-1 ring-white/15 backdrop-blur">
                Android
              </span>
            </div>
          </div>
        </motion.section>

        {(goals.length > 0 || bookmarks.length > 0 || applications.length > 0) && (
          <section>
            <CalendarStrip
              goals={goals}
              bookmarks={bookmarks}
              applications={applications}
              onDateClick={() => {}}
              onEventClick={handleCalendarEventClick}
            />
          </section>
        )}

        <section className="lg:hidden">
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'saved', label: 'Saved', icon: <Bookmark size={24} strokeWidth={2.3} />, color: 'amber' },
              { id: 'applied', label: 'Applied', icon: <Send size={24} strokeWidth={2.3} />, color: 'emerald' },
              { id: 'roadmap-templates', label: 'Roadmaps', icon: <Target size={24} strokeWidth={2.3} />, color: 'indigo' },
            ].map((item) => (
              <motion.button
                key={item.id}
                whileTap={{ scale: 0.95 }}
                onClick={() => onNavigate?.(item.id)}
                type="button"
                className="flex flex-col items-center gap-2 py-3"
              >
                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                  item.color === 'amber' ? 'text-amber-500' :
                  item.color === 'emerald' ? 'text-emerald-500' :
                  item.color === 'rose' ? 'text-rose-500' : 'text-indigo-500'
                } ${isDarkMode ? 'bg-white/5' : 'bg-slate-100'}`}>
                  {item.icon}
                </span>
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  {item.label}
                </span>
              </motion.button>
            ))}
          </div>
        </section>

        {/* Content Layout */}
        <div className="grid lg:grid-cols-12 gap-8 pb-8">
          <div className={`${recentWins.length > 0 ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-10`}>
            {/* Recommended Opportunities */}
            <section>
              <div className="mb-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <Briefcase size={19} />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">Recommended</h2>
                      <p className={`mt-0.5 text-xs font-normal ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        Matched to your profile
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <div className={`hidden sm:flex items-center gap-1 rounded-2xl border p-1 ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-white shadow-sm'}`}>
                      <button
                        type="button"
                        onClick={() => setViewMode('grid')}
                        className={`h-9 w-9 rounded-xl flex items-center justify-center transition-all ${viewMode === 'grid'
                          ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20'
                          : isDarkMode
                            ? 'text-slate-400 hover:bg-white/10 hover:text-white'
                            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                          }`}
                        aria-label="Grid view"
                      >
                        <LayoutGrid size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('list')}
                        className={`h-9 w-9 rounded-xl flex items-center justify-center transition-all ${viewMode === 'list'
                          ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20'
                          : isDarkMode
                            ? 'text-slate-400 hover:bg-white/10 hover:text-white'
                            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                          }`}
                        aria-label="List view"
                      >
                        <List size={15} />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={onViewAllOpportunities}
                      className={`h-10 inline-flex items-center justify-center gap-1.5 rounded-2xl border px-3 text-xs font-semibold transition-all ${isDarkMode
                        ? 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                        : 'border-slate-200 bg-white text-slate-600 shadow-sm hover:border-slate-300 hover:text-slate-950'
                        }`}
                      aria-label="View all opportunities"
                    >
                      View more <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </div>

              {viewMode === 'grid' ? (
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  {opportunitiesLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="rounded-xl overflow-hidden animate-pulse">
                        <div className={`h-24 sm:h-28 ${isDarkMode ? 'bg-white/5' : 'bg-slate-200'}`} />
                        <div className="p-2 space-y-1.5">
                          <div className={`h-2 rounded ${isDarkMode ? 'bg-white/5' : 'bg-slate-200'} w-1/2`} />
                          <div className={`h-2.5 rounded ${isDarkMode ? 'bg-white/5' : 'bg-slate-200'} w-3/4`} />
                        </div>
                      </div>
                    ))
                  ) : homeFeedItems.length === 0 ? (
                    <div className={`col-span-2 rounded-[20px] border ${isDarkMode ? 'border-white/10 bg-gray-900/60' : 'border-slate-200 bg-white'}`}>
                      <EmptyState
                        icon={<Briefcase size={32} />}
                        title="No recommendations yet"
                        description="Complete your profile or browse the full opportunity feed while Edutu prepares better matches."
                        action={{
                          label: 'Browse opportunities',
                          onClick: onViewAllOpportunities
                        }}
                        secondaryAction={{
                          label: 'Improve profile',
                          onClick: () => onNavigate?.('personalization')
                        }}
                      />
                    </div>
                  ) : homeFeedItems.map((item) => {
                    if (item.type === 'promo') {
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => onNavigate?.(item.promo.screen)}
                          className="col-span-2 overflow-hidden rounded-[20px] border border-brand-500/20 bg-gradient-to-br from-brand-500 to-indigo-600 p-4 text-left text-white shadow-lg shadow-brand-500/15 transition hover:-translate-y-0.5"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/70">Edutu</p>
                              <h3 className="mt-1 text-lg font-black tracking-tight">{item.promo.title}</h3>
                              <p className="mt-1 text-sm leading-5 text-white/80">{item.promo.copy}</p>
                            </div>
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15">
                              <ChevronRight size={20} />
                            </span>
                          </div>
                          <span className="mt-4 inline-flex text-xs font-black text-white">{item.promo.action}</span>
                        </button>
                      );
                    }

                    const { opportunity } = item;
                    return (
                      <button
                        type="button"
                        key={item.key}
                        onClick={() => onOpportunityClick(opportunity)}
                        className={`rounded-[20px] overflow-hidden border cursor-pointer group text-left transition-all hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${isDarkMode ? 'bg-gray-900 border-white/5 hover:border-white/10 focus-visible:ring-offset-gray-950' : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xl hover:shadow-slate-200/70 focus-visible:ring-offset-slate-50'}`}
                      >
                        <div className="relative h-28 sm:h-32 overflow-hidden bg-slate-100 dark:bg-slate-800">
                          <ImageWithFallback
                            src={opportunity.image}
                            alt=""
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                            fallbackClassName="w-full h-full"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/35 via-transparent to-transparent" />
                          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-black text-brand-600 backdrop-blur">
                            {opportunity.category || 'General'}
                          </span>
                        </div>
                        <div className="p-3 sm:p-4">
                          <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white group-hover:text-primary transition-colors line-clamp-2 leading-snug">
                            {opportunity.title}
                          </h3>
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mt-3 text-[10px] font-bold text-slate-400">
                            <span className="truncate">{opportunity.location || 'Remote'}</span>
                            <span>{opportunity.deadline ? new Date(opportunity.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Ongoing'}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  {opportunitiesLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-20 rounded-xl animate-pulse" style={{ backgroundColor: isDarkMode ? '#1a1a1a' : '#f0f0f0' }} />
                    ))
                  ) : homeFeedItems.length === 0 ? (
                    <div className={`rounded-[20px] border ${isDarkMode ? 'border-white/10 bg-gray-900/60' : 'border-slate-200 bg-white'}`}>
                      <EmptyState
                        icon={<Briefcase size={32} />}
                        title="No recommendations yet"
                        description="Complete your profile or browse the full opportunity feed while Edutu prepares better matches."
                        action={{
                          label: 'Browse opportunities',
                          onClick: onViewAllOpportunities
                        }}
                        secondaryAction={{
                          label: 'Improve profile',
                          onClick: () => onNavigate?.('personalization')
                        }}
                      />
                    </div>
                  ) : homeFeedItems.map((item) => {
                    if (item.type === 'promo') {
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => onNavigate?.(item.promo.screen)}
                          className="w-full rounded-[20px] bg-gradient-to-br from-brand-500 to-indigo-600 p-4 text-left text-white shadow-lg shadow-brand-500/15"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/70">Edutu</p>
                              <h3 className="mt-1 text-base font-black">{item.promo.title}</h3>
                              <p className="mt-1 text-xs leading-5 text-white/80">{item.promo.copy}</p>
                            </div>
                            <ChevronRight size={20} className="shrink-0" />
                          </div>
                        </button>
                      );
                    }

                    const { opportunity } = item;
                    return (
                      <button
                        type="button"
                        key={item.key}
                        onClick={() => onOpportunityClick(opportunity)}
                        className="flex w-full items-center gap-3 p-3 rounded-xl text-left hover:bg-white dark:hover:bg-white/5 border border-transparent hover:border-slate-200 dark:hover:border-white/10 transition-all cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-gray-950"
                      >
                        <div className="w-14 h-14 shrink-0 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800">
                          <ImageWithFallback
                            src={opportunity.image}
                            alt=""
                            className="w-full h-full object-cover"
                            fallbackClassName="w-full h-full"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[9px] font-bold text-primary tracking-wider">{opportunity.category || 'Direct'}</span>
                            <span className="text-slate-300 dark:text-slate-700">•</span>
                            <span className="text-[9px] font-bold text-slate-400 tracking-wider truncate">{opportunity.organization || 'Global'}</span>
                          </div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors line-clamp-2 leading-tight">
                            {opportunity.title}
                          </h3>
                        </div>
                        <div className="shrink-0">
                          <ChevronRight className="text-slate-300 group-hover:text-primary transition-colors" size={18} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              <div ref={homeFeedSentinelRef} className="h-10" aria-hidden="true" />
            </section>

          </div>

          {recentWins.length > 0 && (
            <aside className="lg:col-span-4 space-y-6">
              <section className={`rounded-[20px] border p-5 relative overflow-hidden ${isDarkMode ? 'bg-gray-900 border-white/10' : 'bg-white border-slate-200 shadow-sm'}`}>
                <div className="flex items-center justify-between mb-6 relative">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
                      <Award size={18} />
                    </div>
                    <div>
                      <h2 className="text-base font-black">Recent wins</h2>
                      <p className="text-xs text-slate-400">Latest completed goals</p>
                    </div>
                  </div>
                  <button
                    onClick={() => onNavigate && onNavigate('achievements')}
                    className="text-[10px] font-black text-brand-500 hover:text-brand-600 tracking-wider"
                  >
                    View All
                  </button>
                </div>

                <div className="space-y-3 relative">
                  {recentWins.map((win) => (
                    <div key={win.id} className="flex gap-3 items-center group/win p-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-white/5 transition-all">
                      <div className="h-9 w-9 shrink-0 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                        <Sparkles size={15} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate group-hover/win:text-brand-500 transition-colors">
                          {win.title}
                        </p>
                        <p className="text-[10px] font-bold text-slate-400">
                          {win.date}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 dark:border-white/5">
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 tracking-widest">
                    <span>Consistency</span>
                    <span className="text-emerald-500">{userStats.consistency}%</span>
                  </div>
                  <div className="mt-2 h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.4)]"
                      style={{ width: `${Math.min(Math.max(userStats.consistency, 0), 100)}%` }}
                    />
                  </div>
                </div>
              </section>
            </aside>
          )}
        </div>
      </main>
      </div>

      {/* Footer with Dark Mode Toggle */}
      <footer className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 border-t ${isDarkMode ? 'border-white/5' : 'border-slate-200'}`}>
        <div className="flex items-center justify-between">
          <p className={`text-xs ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
            © {new Date().getFullYear()} Edutu. All rights reserved.
          </p>
          <button
            type="button"
            onClick={toggleDarkMode}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${isDarkMode
              ? 'bg-white/5 text-slate-300 hover:bg-white/10'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
          >
            {isDarkMode ? (
              <>
                <Sun size={14} />
                Light Mode
              </>
            ) : (
              <>
                <Moon size={14} />
                Dark Mode
              </>
            )}
          </button>
        </div>
      </footer>

      <NotificationInbox
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
      />
    </div>
  );
});

export default Dashboard;
