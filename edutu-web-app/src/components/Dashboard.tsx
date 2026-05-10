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
  MapPin,
  Menu,
  MessageCircle,
  Moon,
  Send,
  Settings,
  Sun,
  Target,
  TrendingUp,
  Sparkles,
  Trophy,
  Users,
  Wallet,
  X,
  UserCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from './ui/Button';
import { SkeletonStatsCard, SkeletonCard } from './ui/Skeleton';
import { EmptyOpportunities } from './ui/EmptyState';
import NotificationInbox from './NotificationInbox';
import CalendarStrip from './CalendarStrip';
import { useDarkMode } from '../hooks/useDarkMode';
import { useTheme } from '../hooks/useTheme';
import { useGoals } from '../hooks/useGoals';
import { useOpportunities } from '../hooks/useOpportunities';
import { usePersonalizedOpportunities } from '../hooks/usePersonalizedOpportunities';
import { useUserStats } from '../hooks/useUserStats';
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
  userCredits?: number;
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
  onAddGoal,
  onViewAllGoals,
  onboardingProfile,
  userCredits = 0
}, ref) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [unreadCount] = useState(3);
  const [dismissBanner, setDismissBanner] = useState(false);
  const { isDarkMode } = useDarkMode();
  const { toggleDarkMode } = useTheme();
  const { goals } = useGoals();
  const opportunitiesRefreshRef = useRef<() => void>();
  const { t } = useTranslation();
  const [bookmarks, setBookmarks] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [profileScore, setProfileScore] = useState<{ score: number; missingFields: string[]; isMatchEnabled: boolean } | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // Real-time user statistics
  const userStats = useUserStats(user?.id);

  const getRandomQuote = () => {
    const quotes = [
      "Success is the sum of small efforts repeated day in and day out.",
      "The only way to do great work is to love what you do.",
      "Don't watch the clock; do what it does. Keep going.",
      "Believe you can and you're halfway there.",
      "The future belongs to those who believe in the beauty of their dreams."
    ];
    return quotes[Math.floor(Math.random() * quotes.length)];
  };

  const getGreetingMessage = (name: string) => {
    const hour = new Date().getHours();
    if (hour < 12) return `${t('dashboard.greeting.morning')}, ${name}`;
    if (hour < 17) return `${t('dashboard.greeting.afternoon')}, ${name}`;
    if (hour < 21) return `${t('dashboard.greeting.evening')}, ${name}`;
    return `${t('dashboard.greeting.night')}, ${name}`;
  };

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
      setProfileLoading(false);
      return;
    }

    async function loadProfileData() {
      try {
        const [profile, personalization] = await Promise.all([
          fetchUserProfile(user.id),
          getUserPersonalization(user.id)
        ]);

        const completeness = calculateProfileCompleteness(profile, onboardingProfile, personalization);
        setProfileScore(completeness);
      } catch (e) {
        console.error('Failed to load profile completeness:', e);
      } finally {
        setProfileLoading(false);
      }
    }

    loadProfileData();
  }, [user?.id, onboardingProfile]);

  useEffect(() => {
    if (!user?.id) return;

    async function loadDeadlines() {
      try {
        const [bookmarksData, appsData] = await Promise.all([
          getBookmarks(user.id),
          getApplications(user.id)
        ]);
        setBookmarks(bookmarksData);
        setApplications(appsData);
      } catch (e) {
        console.error('Failed to load deadlines:', e);
      }
    }

    loadDeadlines();
  }, [user?.id]);

  const featuredOpportunities = useMemo(() => {
    if (Array.isArray(opportunityFeed)) {
      return opportunityFeed.slice(0, 3).map(item => {
        if ('opportunity' in item) return item.opportunity;
        return item;
      });
    }
    return [];
  }, [opportunityFeed]);

  const formatUpdatedAt = (updatedAt: string) => {
    const diff = Date.now() - new Date(updatedAt).getTime();
    const mins = Math.floor(diff / (1000 * 60));
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(updatedAt).toLocaleDateString();
  };

  const activeGoals = useMemo(() => goals.filter((g) => g.status === 'active'), [goals]);
  const completedGoals = useMemo(() => goals.filter((g) => g.status === 'completed'), [goals]);
  const focusGoals = useMemo(() => activeGoals.slice(0, 3), [activeGoals]);

  const menuItems = [
    { id: 'all-goals', label: 'All Goals', icon: <CheckCircle2 size={18} /> },
    { id: 'opportunities', label: 'Opportunities', icon: <Briefcase size={18} /> },
    { id: 'chat', label: 'AI Coach', icon: <MessageCircle size={18} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={18} /> }
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
      if (userStats.consistency >= 80) return 'Momentum looks strong ??';
      if (userStats.consistency >= 50) return 'Keep it going!';
      if (userStats.consistency > 0) return 'Room to improve';
      return 'Start tracking today';
    };

    return [
      {
        label: t('dashboard.stats.goalsActive'),
        value: userStats.activeGoals.toString(),
        helper: `${userStats.completedGoals} ${t('dashboard.stats.completed').toLowerCase()}`
      },
      {
        label: 'Consistency',
        value: `${userStats.consistency}%`,
        helper: getConsistencyHelper()
      },
      {
        label: 'Avg progress',
        value: `${userStats.avgProgress}%`,
        helper: 'Across active goals'
      },
      {
        label: 'Next deadline',
        value: formatDeadline(),
        helper: getDeadlineHelper()
      }
    ];
  }, [userStats]);

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

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-950 text-white' : 'bg-slate-50 text-slate-900'} font-body transition-colors duration-500 overflow-x-hidden pb-12`}>
      {/* Background Mesh Gradient */}
      <div className="fixed inset-0 pointer-events-none opacity-30 dark:opacity-20 mesh-gradient" />

      {/* Header */}
      <header className={`sticky top-0 z-40 backdrop-blur-xl border-b transition-all duration-300 ${isDarkMode ? 'bg-gray-950/80 border-white/5' : 'bg-white/80 border-slate-200'
        }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 md:h-16">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="h-8 w-8 md:h-10 md:w-10 flex items-center justify-center rounded-lg md:rounded-xl bg-gradient-to-tr from-brand-600 to-accent-500 shadow-lg shadow-brand-500/20">
                <img src="/edutu-logo.png" alt="Logo" className="h-5 w-5 md:h-6 md:w-6 object-contain" />
              </div>
              <span className={`text-xl md:text-2xl font-display font-bold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                Edutu
              </span>
            </div>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-1">
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleMenuItemClick(item.id)}
                  className={`px-4 py-2 text-sm font-medium rounded-xl transition-all ${isDarkMode
                    ? 'text-slate-400 hover:text-white hover:bg-white/5'
                    : 'text-slate-600 hover:text-brand-600 hover:bg-brand-50'
                    }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowNotifications(true)}
                className={`relative p-2.5 rounded-xl border transition-all ${isDarkMode
                  ? 'border-white/5 bg-white/5 hover:bg-white/10 text-slate-300'
                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                  }`}
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute top-2 right-2 h-2.5 w-2.5 bg-rose-500 rounded-full border-2 border-white dark:border-gray-950" />
                )}
              </button>

              {/* Mobile Menu Button - Right Side */}
              <button
                type="button"
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                className="md:hidden p-2 rounded-xl transition-all"
                style={{
                  backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                }}
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
        {showMobileMenu && (
          <div className={`md:hidden border-t ${isDarkMode ? 'border-white/5 bg-gray-950/95' : 'border-slate-200 bg-white/95'} backdrop-blur-xl`}>
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
            </div>
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
        {/* Simplified Hero Greeting */}
        <section className="mb-2 md:mb-8">
          <div className="max-w-xl">
            <h1 className="text-3xl md:text-5xl font-display font-bold tracking-tight text-slate-900 dark:text-white mb-1 md:mb-2">
              {getGreetingMessage(user?.name?.split(' ')[0] ?? 'Explorer')}
            </h1>
            <p className="text-base md:text-lg text-slate-500 dark:text-slate-400 font-medium italic line-clamp-2 md:line-clamp-none">
              "{getRandomQuote()}"
            </p>
          </div>
        </section>

        {/* Colorful Analytics Grid */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {userStats.isLoading ? (
            // Loading skeleton
            <>
              {Array.from({ length: 4 }).map((_, index) => (
                <SkeletonStatsCard key={index} className="animate-pulse" />
              ))}
            </>
          ) : (
            stats.map((stat, index) => {
              const cardStyles = [
                'stat-card-blue',
                'stat-card-purple',
                'stat-card-emerald',
                'stat-card-amber'
              ];
              return (
                <div
                  key={stat.label}
                  className={`stat-card p-4 md:p-6 ${cardStyles[index % 4]} group animate-fade-in`}
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="stat-card-edge" />
                  <span className="text-[10px] font-bold tracking-[0.2em] opacity-90 mb-2 block">
                    {stat.label}
                  </span>
                  <div className="flex items-baseline gap-2">
                    <p className="text-3xl font-display font-bold">
                      {stat.value}
                    </p>
                  </div>
                  <p className="text-[10px] font-bold opacity-80 mt-2">
                    {stat.helper}
                  </p>
                </div>
              );
            })
          )}
        </section>

        <AnimatePresence>
          {profileScore && profileScore.score < 100 && !dismissBanner && (
            <motion.section
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 100 }}
              transition={{ duration: 0.3 }}
              className={`premium-card p-5 border-l-4 ${isDarkMode ? 'bg-amber-500/5 border-amber-500/50' : 'bg-amber-50 border-amber-400'}`}
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

        {(goals.length > 0 || bookmarks.length > 0 || applications.length > 0) && (
          <section>
            <CalendarStrip
              goals={goals}
              bookmarks={bookmarks}
              applications={applications}
              onDateClick={() => {}}
              onEventClick={() => {}}
            />
          </section>
        )}

        <section className="lg:hidden">
          <div className="grid grid-cols-4 gap-2">
            {[
              { id: 'saved', label: 'Saved', icon: <Bookmark size={18} />, color: 'amber' },
              { id: 'applied', label: 'Applied', icon: <Send size={18} />, color: 'emerald' },
              { id: 'deadlines', label: 'Deadlines', icon: <Clock size={18} />, color: 'rose' },
              { id: 'wallet', label: 'Wallet', icon: <Wallet size={18} />, color: 'brand' }
            ].map((item) => (
              <motion.button
                key={item.id}
                whileTap={{ scale: 0.95 }}
                onClick={() => onNavigate?.(item.id)}
                type="button"
                className="flex flex-col items-center gap-1.5 py-2"
              >
                <span className={
                  item.color === 'amber' ? 'text-amber-500' :
                  item.color === 'emerald' ? 'text-emerald-500' :
                  item.color === 'rose' ? 'text-rose-500' : 'text-indigo-500'
                }>
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
          <div className="lg:col-span-8 space-y-10">
            {/* Featured Opportunities - Swipeable Carousel */}
            <section>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Briefcase size={22} />
              </div>
              <h2 className="heading-md">Recommended for You</h2>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={onViewAllOpportunities}
              className="rounded-xl border-slate-200 dark:border-white/10"
            >
              Explore All
            </Button>
          </div>

              <div className="space-y-2">
                {opportunitiesLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-20 bg-white/50 dark:bg-white/5 rounded-2xl animate-pulse" />
                  ))
                ) : opportunityFeed?.slice(0, 5).map((item: any, idx) => {
                  const opportunity = 'opportunity' in item ? item.opportunity : item;
                  return (
                    <div
                      key={idx}
                      onClick={() => onOpportunityClick(opportunity)}
                      className="flex items-center gap-3 sm:gap-4 p-3 rounded-2xl hover:bg-white dark:hover:bg-white/5 border border-transparent hover:border-slate-200 dark:hover:border-white/10 transition-all cursor-pointer group overflow-hidden"
                    >
                      <div className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800">
                        <ImageWithFallback
                          src={opportunity.image}
                          alt=""
                          className="w-full h-full object-cover"
                          fallbackClassName="w-full h-full"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                          <span className="text-[10px] font-bold text-primary tracking-wider">{opportunity.category || 'Direct'}</span>
                          <span className="text-slate-300 dark:text-slate-700">•</span>
                          <span className="text-[10px] font-bold text-slate-400 tracking-wider truncate">{opportunity.organization || 'Global'}</span>
                        </div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors line-clamp-2 sm:line-clamp-1">
                          {opportunity.title}
                        </h3>
                      </div>
                      <div className="shrink-0">
                        <ChevronRight className="text-slate-300 group-hover:text-primary transition-colors" size={18} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Goals Tracker */}
            <section className="overflow-hidden">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 shrink-0">
                    <Target size={22} />
                  </div>
                  <h2 className="heading-md truncate">Your Active Goals</h2>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onViewAllGoals}
                  className="rounded-xl border-slate-200 dark:border-white/10 shrink-0"
                >
                  Manage
                </Button>
              </div>

              <div className="grid gap-4">
                {focusGoals.length > 0 ? (
                  focusGoals.map((goal) => (
                    <div
                      key={goal.id}
                      onClick={() => onGoalClick(goal.id)}
                      className="glass-card group cursor-pointer hover:border-primary/30 transition-all p-4 sm:p-6"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex-1 space-y-3 min-w-0">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-xl bg-primary/5 flex items-center justify-center text-primary group-hover:bg-primary/10 transition-colors shrink-0">
                              <Target size={18} />
                            </div>
                            <h4 className="text-base font-display font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors line-clamp-2">
                              {goal.title}
                            </h4>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-[10px] font-bold tracking-widest text-slate-400">
                              <span>Completion</span>
                              <span className="text-primary">{Math.round(goal.progress)}%</span>
                            </div>
                            <div className="h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary transition-all duration-1000"
                                style={{ width: `${goal.progress}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 border-t sm:border-t-0 border-subtle pt-3 sm:pt-0">
                          <div className="text-right hidden sm:block">
                            <p className="text-[10px] font-bold text-slate-400 tracking-widest">Priority</p>
                            <p className="text-xs font-bold text-slate-600 dark:text-slate-300">High Impact</p>
                          </div>
                          <div className="h-9 w-9 rounded-full border border-subtle flex items-center justify-center group-hover:border-primary group-hover:bg-primary/5 transition-all">
                            <ChevronRight className="text-slate-300 group-hover:text-primary transition-colors" size={18} />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="glass-card p-8 sm:p-12 text-center border-dashed">
                    <p className="text-slate-400 mb-6 font-medium text-sm">No active trajectories found. Start your journey today.</p>
                    <Button onClick={onAddGoal} variant="primary" className="rounded-2xl px-6 py-3.5 h-auto font-bold shadow-soft text-sm">Create First Goal</Button>
                  </div>
                )}
              </div>
            </section>
          </div>

          <aside className="lg:col-span-4 space-y-6">
            {/* Recent */}
            <section className="p-5 relative overflow-hidden group">
              <div className="flex items-center justify-between mb-6 relative">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
                    <Award size={18} />
                  </div>
                  <h2 className="text-base font-bold">Recent</h2>
                </div>
                <button
                  onClick={() => onNavigate && onNavigate('achievements')}
                  className="text-[10px] font-bold text-brand-500 hover:text-brand-600 tracking-wider"
                >
                  View All
                </button>
              </div>

              <div className="space-y-4 relative">
                {recentWins.length > 0 ? (
                  recentWins.map((win) => (
                    <div key={win.id} className="flex gap-3 items-center group/win p-2 rounded-xl hover:bg-white/40 dark:hover:bg-white/5 transition-all">
                      <div className="h-8 w-8 shrink-0 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                        <Sparkles size={14} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate group-hover/win:text-brand-500 transition-colors">
                          {win.title}
                        </p>
                        <p className="text-[9px] font-bold text-slate-400">
                          {win.date}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-8 flex flex-col items-center justify-center text-center px-4 grayscale opacity-40">
                    <TrendingUp size={32} className="mb-2 text-slate-400" />
                    <p className="text-[11px] font-medium text-slate-500 tracking-tight">Your wins show up here</p>
                  </div>
                )}
              </div>

              {recentWins.length > 0 && (
                <div className="mt-6 pt-4 border-t border-slate-100 dark:border-white/5">
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 tracking-widest">
                    <span>Consistency</span>
                    <span className="text-emerald-500">85%</span>
                  </div>
                  <div className="mt-2 h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 w-[85%] rounded-full shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                  </div>
                </div>
              )}
            </section>
          </aside>
        </div>
      </main>

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
