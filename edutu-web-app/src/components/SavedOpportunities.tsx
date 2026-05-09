import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Bookmark, Calendar, MapPin, Percent, RefreshCw, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { useDarkMode } from '../hooks/useDarkMode';
import { useAuth } from '@clerk/clerk-react';
import { useToast } from './ui/ToastProvider';
import {
  getBookmarks,
  removeBookmark,
  filterBookmarks,
  type BookmarkRecord
} from '../services/bookmarks';

interface SavedOpportunitiesProps {
  onBack: () => void;
  onSelectOpportunity: (opportunityId: string) => void;
}

const filterTabs = [
  { id: 'all' as const, label: 'All' },
  { id: 'urgent' as const, label: 'Urgent' },
  { id: 'upcoming' as const, label: 'Upcoming' }
];

const SavedOpportunities: React.FC<SavedOpportunitiesProps> = ({ onBack, onSelectOpportunity }) => {
  const { isDarkMode } = useDarkMode();
  const { userId } = useAuth();
  const { success, error: showError } = useToast();
  const [bookmarks, setBookmarks] = useState<BookmarkRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'urgent' | 'upcoming'>('all');

  const loadBookmarks = useCallback(async () => {
    if (!userId) return;

    const data = await getBookmarks(userId);
    setBookmarks(data);
  }, [userId]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await loadBookmarks();
      setLoading(false);
    };
    init();
  }, [loadBookmarks]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadBookmarks();
    setRefreshing(false);
  };

  const handleRemove = async (e: React.MouseEvent, bookmark: BookmarkRecord) => {
    e.stopPropagation();
    if (!userId) return;

    const removed = await removeBookmark(userId, bookmark.opportunity_id);
    if (removed) {
      setBookmarks((prev) => prev.filter((b) => b.opportunity_id !== bookmark.opportunity_id));
      success('Bookmark removed');
    } else {
      showError('Failed to remove bookmark');
    }
  };

  const filteredBookmarks = filterBookmarks(bookmarks, activeFilter);

  const getDeadlineColor = (deadline: string | null) => {
    if (!deadline) return isDarkMode ? 'text-slate-400' : 'text-slate-500';
    const now = new Date();
    const deadlineDate = new Date(deadline);
    const diffDays = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'text-red-500';
    if (diffDays <= 7) return 'text-amber-500';
    return isDarkMode ? 'text-emerald-400' : 'text-emerald-600';
  };

  const getDaysUntilDeadline = (deadline: string | null) => {
    if (!deadline) return 'No deadline';
    const now = new Date();
    const deadlineDate = new Date(deadline);
    const diffDays = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'Expired';
    if (diffDays === 0) return 'Due today';
    if (diffDays === 1) return '1 day left';
    return `${diffDays} days left`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-950 text-white' : 'bg-slate-50 text-slate-800'} font-body transition-colors duration-500 pb-24`}>
      <div className="fixed inset-0 pointer-events-none opacity-20 dark:opacity-10 mesh-gradient" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 space-y-10 relative z-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 animate-slide-up">
          <div className="space-y-3">
            <button
              onClick={onBack}
              className="group flex items-center gap-2 text-xs font-black text-brand-500 tracking-[0.2em] mb-2 hover:gap-3 transition-all"
            >
              <ArrowLeft size={14} />
              Return Center
            </button>
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-brand-500/10 flex items-center justify-center text-brand-500 shadow-xl shadow-brand-500/10">
                <Bookmark size={28} />
              </div>
              <div>
                <h1 className="text-4xl md:text-5xl font-display font-black tracking-tight leading-none italic">SAVED</h1>
                <p className="text-slate-500 dark:text-slate-400 font-bold text-xs tracking-[0.3em] mt-2">
                  {bookmarks.length} opportunity{bookmarks.length !== 1 ? 'ies' : 'y'} saved
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className={`px-5 py-3 rounded-2xl font-black text-[10px] tracking-[0.2em] transition-all shadow-xl flex items-center gap-2 ${
              isDarkMode
                ? 'bg-gray-800 text-white hover:bg-gray-700'
                : 'bg-white text-slate-700 hover:bg-slate-100'
            } ${refreshing ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-hide animate-slide-up" style={{ animationDelay: '100ms' }}>
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={`px-6 py-4 rounded-2xl font-black text-[10px] tracking-[0.2em] transition-all whitespace-nowrap shadow-xl ${
                activeFilter === tab.id
                  ? 'bg-gray-900 text-white shadow-brand-500/20 dark:bg-brand-500'
                  : isDarkMode
                  ? 'bg-gray-800 text-slate-400 hover:text-white'
                  : 'bg-white text-slate-400 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className={`premium-card p-6 rounded-2xl ${isDarkMode ? 'bg-gray-900' : 'bg-white'} shadow-xl animate-pulse`}
              >
                <div className={`h-6 rounded-lg w-3/4 mb-4 ${isDarkMode ? 'bg-gray-800' : 'bg-slate-200'}`} />
                <div className={`h-4 rounded w-1/2 mb-6 ${isDarkMode ? 'bg-gray-800' : 'bg-slate-200'}`} />
                <div className="space-y-3">
                  <div className={`h-4 rounded w-full ${isDarkMode ? 'bg-gray-800' : 'bg-slate-200'}`} />
                  <div className={`h-4 rounded w-2/3 ${isDarkMode ? 'bg-gray-800' : 'bg-slate-200'}`} />
                </div>
              </div>
            ))}
          </div>
        ) : filteredBookmarks.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-12">
            {filteredBookmarks.map((bookmark, index) => (
              <motion.div
                key={bookmark.opportunity_id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                onClick={() => onSelectOpportunity(bookmark.opportunity_id)}
                className={`group premium-card p-0 flex flex-col cursor-pointer overflow-hidden border-none ${
                  isDarkMode ? 'bg-gray-900' : 'bg-white'
                } shadow-xl shadow-slate-200/40 dark:shadow-none hover:scale-[1.02] transition-all duration-500`}
              >
                <div className="p-6 pb-2">
                  <div className="flex items-start justify-between mb-4">
                    <div className="px-3 py-1.5 rounded-xl text-[10px] font-black tracking-widest bg-brand-500/10 text-brand-500">
                      {bookmark.opportunity_category}
                    </div>
                    <button
                      onClick={(e) => handleRemove(e, bookmark)}
                      className={`p-2 rounded-xl transition-all opacity-0 group-hover:opacity-100 ${
                        isDarkMode
                          ? 'hover:bg-gray-800 text-slate-400 hover:text-red-400'
                          : 'hover:bg-slate-100 text-slate-400 hover:text-red-500'
                      }`}
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <h3 className="text-xl font-display font-black italic leading-tight group-hover:text-brand-500 transition-colors line-clamp-2">
                    {bookmark.opportunity_title}
                  </h3>
                </div>

                <div className="p-6 pt-2 flex-1 flex flex-col">
                  <div className="mt-auto space-y-4">
                    <div className="flex items-center gap-4 text-[10px] font-black text-slate-400 tracking-[0.2em]">
                      <div className={`flex items-center gap-2 ${getDeadlineColor(bookmark.opportunity_deadline)}`}>
                        <Calendar size={12} />
                        {getDaysUntilDeadline(bookmark.opportunity_deadline)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 tracking-[0.2em]">
                      <MapPin size={12} className="text-brand-500" />
                      {bookmark.opportunity_location}
                    </div>

                    {bookmark.match_percentage > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-brand-600 via-accent-500 to-indigo-500 rounded-full transition-all duration-500"
                            style={{ width: `${bookmark.match_percentage}%` }}
                          />
                        </div>
                        <div className="flex items-center gap-1 text-[10px] font-black text-brand-500 tracking-widest">
                          <Percent size={10} />
                          {Math.round(bookmark.match_percentage)}%
                        </div>
                      </div>
                    )}

                    <div className="text-[10px] font-black text-slate-400 tracking-[0.2em] pt-1">
                      Saved {formatDate(bookmark.created_at)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 border-t border-slate-100 dark:border-white/5 h-12 transform translate-y-full group-hover:translate-y-0 transition-transform duration-500">
                  <button
                    onClick={(e) => handleRemove(e, bookmark)}
                    className="flex items-center justify-center gap-2 font-black text-[10px] tracking-widest bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-rose-500 hover:text-white transition-all"
                  >
                    <X size={14} />
                    Remove
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-32 premium-card bg-transparent border-dashed border-2 flex flex-col items-center justify-center space-y-6">
            <div className="h-24 w-24 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center opacity-40">
              <Bookmark size={48} className="text-slate-400" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-display font-black italic">
                {activeFilter === 'all' ? 'NO SAVED OPPORTUNITIES' : `NO ${activeFilter.toUpperCase()} OPPORTUNITIES`}
              </h3>
              <p className="text-slate-500 font-bold text-xs tracking-widest">
                {activeFilter === 'all'
                  ? 'Bookmark opportunities to track them here'
                  : `No ${activeFilter} opportunities found`}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SavedOpportunities;
