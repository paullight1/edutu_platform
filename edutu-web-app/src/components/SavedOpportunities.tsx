import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bookmark, Calendar, ChevronRight, MapPin, RefreshCw, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '@clerk/clerk-react';
import { useDarkMode } from '../hooks/useDarkMode';
import Button from './ui/Button';
import Card from './ui/Card';
import { useToast } from './ui/ToastProvider';
import {
  filterBookmarks,
  getBookmarks,
  removeBookmark,
  type BookmarkRecord
} from '../services/bookmarks';

interface SavedOpportunitiesProps {
  onBack: () => void;
  onExplore?: () => void;
  onSelectOpportunity: (opportunityId: string) => void;
}

const filterTabs = [
  { id: 'all' as const, label: 'All' },
  { id: 'urgent' as const, label: 'Urgent' },
  { id: 'upcoming' as const, label: 'Upcoming' }
];

const SavedOpportunities: React.FC<SavedOpportunitiesProps> = ({ onBack, onExplore, onSelectOpportunity }) => {
  const { isDarkMode } = useDarkMode();
  const { userId, getToken } = useAuth();
  const { success, error: showError } = useToast();
  const [bookmarks, setBookmarks] = useState<BookmarkRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'urgent' | 'upcoming'>('all');

  const loadBookmarks = useCallback(async () => {
    if (!userId) {
      setBookmarks([]);
      return;
    }

    const token = await getToken().catch(() => null);
    const data = await getBookmarks(userId, token);
    setBookmarks(data);
  }, [getToken, userId]);

  useEffect(() => {
    let active = true;

    const init = async () => {
      setLoading(true);
      await loadBookmarks();
      if (active) setLoading(false);
    };

    void init();

    return () => {
      active = false;
    };
  }, [loadBookmarks]);

  const filteredBookmarks = useMemo(
    () => filterBookmarks(bookmarks, activeFilter),
    [bookmarks, activeFilter]
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadBookmarks();
    setRefreshing(false);
  };

  const handleRemove = async (event: React.MouseEvent, bookmark: BookmarkRecord) => {
    event.stopPropagation();
    if (!userId) return;

    const token = await getToken().catch(() => null);
    const removed = await removeBookmark(userId, bookmark.opportunity_id, token);
    if (removed) {
      setBookmarks((prev) => prev.filter((item) => item.opportunity_id !== bookmark.opportunity_id));
      success('Removed from saved opportunities');
    } else {
      showError('Unable to remove saved opportunity');
    }
  };

  const getDeadlineLabel = (deadline: string | null) => {
    if (!deadline) return 'No deadline';
    const date = new Date(deadline);
    if (Number.isNaN(date.getTime())) return 'No deadline';
    const diffDays = Math.ceil((date.getTime() - Date.now()) / 86400000);
    if (diffDays < 0) return 'Expired';
    if (diffDays === 0) return 'Due today';
    if (diffDays === 1) return '1 day left';
    return `${diffDays} days left`;
  };

  const getDeadlineTone = (deadline: string | null) => {
    if (!deadline) return isDarkMode ? 'text-slate-400' : 'text-slate-500';
    const date = new Date(deadline);
    if (Number.isNaN(date.getTime())) return isDarkMode ? 'text-slate-400' : 'text-slate-500';
    const diffDays = Math.ceil((date.getTime() - Date.now()) / 86400000);
    if (diffDays <= 0) return 'text-rose-500';
    if (diffDays <= 7) return 'text-amber-500';
    return 'text-emerald-500';
  };

  const formatSavedDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div className={`min-h-screen pb-24 ${isDarkMode ? 'bg-gray-950 text-white' : 'bg-slate-50 text-slate-950'}`}>
      <header className="sticky top-0 z-10 bg-slate-50/95 px-4 py-3 backdrop-blur dark:bg-gray-950/95">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <Button
            variant="secondary"
            onClick={onBack}
            className="h-11 w-11 rounded-full border-0 bg-white p-0 shadow-sm dark:bg-white/10"
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black tracking-tight">Saved Opportunities</h1>
            <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              {bookmarks.length} saved {bookmarks.length === 1 ? 'opportunity' : 'opportunities'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className={`flex h-11 w-11 items-center justify-center rounded-full shadow-sm transition ${
              isDarkMode ? 'bg-white/10 text-slate-300' : 'bg-white text-slate-600'
            } disabled:opacity-60`}
            aria-label="Refresh saved opportunities"
          >
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-4 py-4">
        <section className={`rounded-[20px] p-4 shadow-sm ${isDarkMode ? 'bg-white/6' : 'bg-white'}`}>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-brand-500 text-white shadow-lg shadow-brand-500/20">
              <Bookmark size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-black">Your saved list</h2>
              <p className={`mt-0.5 text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Save scholarships, internships, fellowships, and programs from opportunity details.
              </p>
            </div>
          </div>
        </section>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveFilter(tab.id)}
              className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                activeFilter === tab.id
                  ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20'
                  : isDarkMode
                    ? 'bg-white/6 text-slate-400 hover:text-white'
                    : 'bg-white text-slate-500 shadow-sm hover:text-slate-950'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className={`h-36 animate-pulse rounded-[20px] ${isDarkMode ? 'bg-white/6' : 'bg-white'}`}
              />
            ))}
          </div>
        ) : filteredBookmarks.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {filteredBookmarks.map((bookmark, index) => (
              <motion.article
                key={bookmark.opportunity_id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: index * 0.03 }}
              >
                <Card
                  onClick={() => onSelectOpportunity(bookmark.opportunity_id)}
                  className="group cursor-pointer border-0 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:bg-white/6"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="rounded-full bg-brand-500/10 px-3 py-1 text-xs font-bold text-brand-500">
                      {bookmark.opportunity_category || 'Opportunity'}
                    </span>
                    <button
                      type="button"
                      onClick={(event) => void handleRemove(event, bookmark)}
                      className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
                        isDarkMode ? 'bg-white/8 text-slate-400 hover:text-rose-400' : 'bg-slate-100 text-slate-500 hover:text-rose-500'
                      }`}
                      aria-label="Remove saved opportunity"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  <h3 className="mt-4 line-clamp-2 text-base font-black leading-6 tracking-tight group-hover:text-brand-500">
                    {bookmark.opportunity_title}
                  </h3>

                  <div className="mt-4 space-y-2">
                    <div className={`flex items-center gap-2 text-sm font-semibold ${getDeadlineTone(bookmark.opportunity_deadline)}`}>
                      <Calendar size={15} />
                      <span>{getDeadlineLabel(bookmark.opportunity_deadline)}</span>
                    </div>
                    <div className={`flex items-center gap-2 text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      <MapPin size={15} />
                      <span className="line-clamp-1">{bookmark.opportunity_location || 'Worldwide'}</span>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between">
                    <span className={`text-xs font-bold ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      Saved {formatSavedDate(bookmark.created_at)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-black text-brand-500">
                      Open
                      <ChevronRight size={14} />
                    </span>
                  </div>
                </Card>
              </motion.article>
            ))}
          </div>
        ) : (
          <section className={`rounded-[20px] px-6 py-16 text-center shadow-sm ${isDarkMode ? 'bg-white/6' : 'bg-white'}`}>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[20px] bg-brand-500/10 text-brand-500">
              <Bookmark size={30} />
            </div>
            <h3 className="mt-5 text-lg font-black">
              {activeFilter === 'all' ? 'No saved opportunities' : `No ${activeFilter} saved opportunities`}
            </h3>
            <p className={`mx-auto mt-2 max-w-sm text-sm leading-6 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Bookmark opportunities from the Explore page and they will appear here for quick access.
            </p>
            <Button onClick={onExplore ?? onBack} className="mt-6 rounded-full px-5">
              Explore opportunities
            </Button>
          </section>
        )}
      </main>
    </div>
  );
};

export default SavedOpportunities;
