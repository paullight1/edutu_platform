import React, { useMemo, useState, useEffect } from 'react';
import {
  Archive,
  ArrowLeft,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Clock,
  RefreshCcw,
  Search,
  Target,
  Plus,
  Zap,
  Flame,
  Award,
  TrendingUp,
  ShieldAlert
} from 'lucide-react';
import { motion } from 'framer-motion';
import Button from './ui/Button';
import Card from './ui/Card';
import CalendarStrip from './CalendarStrip';
import { useDarkMode } from '../hooks/useDarkMode';
import { useAuth } from '@clerk/clerk-react';
import { Goal, useGoals } from '../hooks/useGoals';
import { getBookmarks, BookmarkRecord } from '../services/bookmarks';
import { getApplications, ApplicationRecord } from '../services/applications';

interface AllGoalsProps {
  onBack: () => void;
  onSelectGoal: (goalId: string) => void;
  onAddGoal: () => void;
}

const statusFilters = [
  { id: 'all', label: 'All Quests' },
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Mastered' },
  { id: 'archived', label: 'Archived' }
] as const;

type StatusFilter = (typeof statusFilters)[number]['id'];

const AllGoals: React.FC<AllGoalsProps> = ({ onBack, onSelectGoal, onAddGoal }) => {
  const { isDarkMode } = useDarkMode();
  const { userId, getToken } = useAuth();
  const { goals, updateGoal } = useGoals();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [bookmarks, setBookmarks] = useState<BookmarkRecord[]>([]);
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);

  useEffect(() => {
    async function loadDeadlines() {
      try {
        if (!userId) return;

        const token = await getToken().catch(() => null);
        const [bookmarksData, appsData] = await Promise.all([
          getBookmarks(userId, token),
          getApplications(userId, token)
        ]);
        setBookmarks(bookmarksData);
        setApplications(appsData);
      } catch (e) {
        console.error('Failed to load deadlines:', e);
      }
    }

    loadDeadlines();
  }, [getToken, userId]);

  const formatDateShort = (date?: string | null) => {
    if (!date) return 'No deadline';
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return 'No deadline';
    return parsed.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatUpdatedAt = (updatedAt: string) => {
    const parsed = new Date(updatedAt);
    if (Number.isNaN(parsed.getTime())) return 'just now';
    const diffMs = Date.now() - parsed.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    if (diffMinutes < 1) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return parsed.toLocaleDateString();
  };

  const activeGoals = useMemo(() => goals.filter((goal) => goal.status === 'active'), [goals]);
  const completedGoals = useMemo(() => goals.filter((goal) => goal.status === 'completed'), [goals]);

  const averageProgress = activeGoals.length
    ? Math.round(activeGoals.reduce((total, goal) => total + goal.progress, 0) / activeGoals.length)
    : 0;

  const filteredGoals = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return goals
      .filter((goal) => (statusFilter === 'all' ? true : goal.status === statusFilter))
      .filter((goal) => {
        if (!query) return true;
        return (
          goal.title.toLowerCase().includes(query) ||
          (goal.description?.toLowerCase().includes(query) ?? false) ||
          (goal.category?.toLowerCase().includes(query) ?? false)
        );
      })
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }, [goals, statusFilter, searchTerm]);

  const handleMarkCompleted = (goalId: string) => {
    updateGoal(goalId, { status: 'completed', progress: 100 });
  };

  const handleReopen = (goal: Goal) => {
    updateGoal(goal.id, {
      status: 'active',
      progress: Math.min(goal.progress, 95),
      completed_at: null
    });
  };

  const handleArchive = (goal: Goal) => {
    updateGoal(goal.id, { status: 'archived' });
  };

  const handleActivate = (goal: Goal) => {
    updateGoal(goal.id, { status: 'active' });
  };

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-950 text-white' : 'bg-slate-50 text-slate-800'} font-body transition-colors duration-500 pb-24`}>
      <div className="fixed inset-0 pointer-events-none opacity-20 dark:opacity-10 mesh-gradient" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 space-y-12 relative z-10">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 animate-slide-up">
          <div className="space-y-4">
            <button
              onClick={onBack}
              className="group flex items-center gap-2 text-xs font-black text-brand-500 tracking-[0.2em] mb-2 hover:gap-3 transition-all"
            >
              <ArrowLeft size={14} />
              Return Center
            </button>
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-brand-500/10 flex items-center justify-center text-brand-500 shadow-xl shadow-brand-500/10">
                <Target size={32} />
              </div>
              <div>
                <h1 className="text-4xl md:text-5xl font-display font-black tracking-tight leading-none italic">MISSION BOARD</h1>
                <p className="text-slate-500 dark:text-slate-400 font-bold text-xs tracking-[0.3em] mt-2">
                  {goals.length} active trajectories detected
                </p>
              </div>
            </div>
          </div>

          <Button
            variant="primary"
            onClick={onAddGoal}
            className="rounded-2xl px-6 py-4 h-auto font-black text-xs tracking-widest shadow-xl shadow-brand-500/20"
          >
            <Plus size={18} className="mr-2" />
            INITIATE NEW QUEST
          </Button>
        </div>

        {(goals.length > 0 || bookmarks.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <CalendarStrip
              goals={goals}
              bookmarks={bookmarks}
              applications={applications}
              onDateClick={() => {}}
              onEventClick={() => {}}
            />
          </motion.div>
        )}

        {/* Intelligence Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-slide-up" style={{ animationDelay: '100ms' }}>
          {[
            { label: 'Avg Progress', value: `${averageProgress}%`, icon: Zap, color: 'brand' },
            { label: 'Active Quests', value: activeGoals.length, icon: Target, color: 'indigo' },
            { label: 'Mastered', value: completedGoals.length, icon: Award, color: 'emerald' },
            { label: 'Exp. Streak', value: '12 Days', icon: Flame, color: 'rose' }
          ].map((stat, i) => (
            <div key={i} className="premium-card p-5 border-none bg-white dark:bg-gray-900 shadow-xl shadow-slate-200/40 dark:shadow-none hover:translate-y-[-4px] transition-transform duration-300">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 rounded-xl bg-primary/10 text-brand-500">
                  <stat.icon size={20} />
                </div>
                <div className="h-1.5 w-1.5 rounded-full bg-slate-200 dark:bg-slate-700" />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black text-slate-400 tracking-widest leading-none">{stat.label}</p>
                <h4 className="text-2xl font-display font-black italic leading-none">{stat.value}</h4>
              </div>
            </div>
          ))}
        </div>

        {/* Global Control Bar */}
        <div className="flex flex-col md:flex-row gap-4 sticky top-6 z-40 animate-slide-up" style={{ animationDelay: '200ms' }}>
          <div className="flex-1 relative group">
            <Search size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-500 transition-colors" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="LOCATE SPECIFIC OBJECTIVE..."
              className="w-full pl-14 pr-6 py-4 rounded-[1.5rem] border-none bg-white dark:bg-gray-900 shadow-xl shadow-slate-200/40 dark:shadow-none text-slate-900 dark:text-white placeholder-slate-500 focus:ring-2 focus:ring-brand-500 transition-all font-black text-xs tracking-widest"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
            {statusFilters.map(filter => (
              <button
                key={filter.id}
                onClick={() => setStatusFilter(filter.id)}
                className={`px-6 py-4 rounded-2xl font-black text-[10px] tracking-[0.2em] transition-all whitespace-nowrap shadow-xl ${statusFilter === filter.id
                  ? 'bg-gray-900 text-white shadow-brand-500/20 dark:bg-brand-500'
                  : 'bg-white dark:bg-gray-900 text-slate-400 hover:text-slate-900 dark:hover:text-white shadow-slate-200/50 dark:shadow-none'
                  }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {/* Quests Display */}
        <div className="space-y-6">
          {filteredGoals.length > 0 ? (
            <div className="grid md:grid-cols-2 gap-6 pb-12">
              {filteredGoals.map((goal, index) => (
                <div
                  key={goal.id}
                  onClick={() => onSelectGoal(goal.id)}
                  className="group premium-card p-0 flex flex-col cursor-pointer overflow-hidden border-none bg-white dark:bg-gray-900 shadow-xl shadow-slate-200/40 dark:shadow-none hover:scale-[1.02] transition-all duration-500 animate-slide-up"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="p-6 pb-2">
                    <div className="flex items-center justify-between mb-4">
                      <div className={`px-3 py-1.5 rounded-xl text-[10px] font-black tracking-widest ${goal.priority === 'high' ? 'bg-rose-500/10 text-rose-500' :
                        goal.priority === 'medium' ? 'bg-amber-500/10 text-amber-500' :
                          'bg-emerald-500/10 text-emerald-500'
                        }`}>
                        {(goal.priority || 'medium').toUpperCase()} Priority
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="h-2 w-2 rounded-full bg-brand-500 animate-pulse" />
                        <span className="text-[10px] font-black text-slate-400 tracking-widest">{goal.category || 'General'}</span>
                      </div>
                    </div>

                    <h3 className="text-2xl font-display font-black italic leading-tight group-hover:text-brand-500 transition-colors">
                      {goal.title}
                    </h3>
                  </div>

                  <div className="p-6 pt-2 flex-1 flex flex-col">
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400 line-clamp-2 mb-6 leading-relaxed italic">
                      {goal.description || "The path forward is clear. Execute each step with precision to achieve maximum efficiency."}
                    </p>

                    <div className="mt-auto space-y-4">
                      <div className="flex items-center justify-between font-black text-[10px] tracking-widest">
                        <span className="text-slate-400">Progression Matrix</span>
                        <span className="text-brand-500">{Math.round(goal.progress)}% Verified</span>
                      </div>

                      <div className="h-3 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden relative">
                        <div
                          className="absolute inset-y-0 left-0 bg-gradient-to-r from-brand-600 via-accent-500 to-indigo-500 rounded-full transition-all duration-1000 group-hover:shadow-[0_0_15px_rgba(99,102,241,0.6)]"
                          style={{ width: `${goal.progress}%` }}
                        />
                      </div>

                      <div className="flex items-center gap-6 pt-2 text-[10px] font-black text-slate-400 tracking-[0.2em]">
                        <div className="flex items-center gap-2">
                          <Calendar size={12} className="text-brand-500" />
                          {formatDateShort(goal.deadline)}
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock size={12} className="text-brand-500" />
                          {formatUpdatedAt(goal.updated_at)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 border-t border-slate-100 dark:border-white/5 h-16 transform translate-y-full group-hover:translate-y-0 transition-transform duration-500">
                    {goal.status !== 'completed' && goal.status !== 'archived' ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleMarkCompleted(goal.id); }}
                        className="flex items-center justify-center gap-2 font-black text-[10px] tracking-widest bg-brand-500 text-white hover:bg-brand-600 transition-colors"
                      >
                        <CheckCircle2 size={14} />
                        Complete
                      </button>
                    ) : goal.status === 'completed' ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleReopen(goal); }}
                        className="flex items-center justify-center gap-2 font-black text-[10px] tracking-widest bg-brand-500 text-white hover:bg-brand-600 transition-colors"
                      >
                        <RefreshCcw size={14} />
                        Reopen
                      </button>
                    ) : <div />}

                    {goal.status !== 'archived' ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleArchive(goal); }}
                        className="flex items-center justify-center gap-2 font-black text-[10px] tracking-widest bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-rose-500 hover:text-white transition-all"
                      >
                        <ShieldAlert size={14} />
                        Archive
                      </button>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleActivate(goal); }}
                        className="flex items-center justify-center gap-2 font-black text-[10px] tracking-widest bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-emerald-500 hover:text-white transition-all"
                      >
                        <RefreshCcw size={14} />
                        Restore
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-32 premium-card bg-transparent border-dashed border-2 flex flex-col items-center justify-center space-y-6">
              <div className="h-24 w-24 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center opacity-40">
                <Target size={48} className="text-slate-400" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-display font-black italic">NO MISSIONS DETECTED</h3>
                <p className="text-slate-500 font-bold text-xs tracking-widest">Acknowledge: The vanguard waits for your command.</p>
              </div>
              <Button onClick={onAddGoal} variant="primary" className="rounded-2xl px-8 italic font-black">
                INITIATE MISSION
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AllGoals;
