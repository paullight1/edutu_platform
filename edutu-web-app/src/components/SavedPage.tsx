import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import {
  Bookmark,
  Briefcase,
  Calendar,
  ChevronLeft,
  Clock,
  Loader2,
  RefreshCcw,
  Search,
  Trash2,
} from 'lucide-react';
import { useAuth as useAppAuth } from '../hooks/useAuth';
import { useDarkMode } from '../hooks/useDarkMode';
import {
  filterBookmarks,
  getBookmarks,
  removeBookmark,
  type BookmarkRecord,
} from '../services/bookmarks';

type SavedFilter = 'all' | 'urgent' | 'upcoming';

function formatDate(value?: string | null) {
  if (!value) return 'No deadline';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No deadline';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function daysUntil(value?: string | null) {
  if (!value) return null;
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function deadlineLabel(bookmark: BookmarkRecord) {
  const days = daysUntil(bookmark.opportunity_deadline);
  if (days === null) return 'No deadline';
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  return `Due in ${days}d`;
}

export default function SavedPage() {
  const navigate = useNavigate();
  const { getToken } = useClerkAuth();
  const { user } = useAppAuth();
  const { isDarkMode } = useDarkMode();
  const [bookmarks, setBookmarks] = useState<BookmarkRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<SavedFilter>('all');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const resolveToken = useCallback(async () => {
    const token = await getToken().catch(() => null);
    if (!token) throw new Error('Your session has expired. Sign in again to manage saved opportunities.');
    return token;
  }, [getToken]);

  const loadBookmarks = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const token = await resolveToken();
      setBookmarks(await getBookmarks(user.id, token));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load saved opportunities.');
    } finally {
      setLoading(false);
    }
  }, [resolveToken, user?.id]);

  useEffect(() => {
    void loadBookmarks();
  }, [loadBookmarks]);

  const visibleBookmarks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return filterBookmarks(bookmarks, filter).filter((bookmark) => {
      if (!normalizedQuery) return true;
      return [
        bookmark.opportunity_title,
        bookmark.opportunity_category,
        bookmark.opportunity_location,
      ]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [bookmarks, filter, query]);

  const stats = useMemo(() => {
    const urgent = filterBookmarks(bookmarks, 'urgent').length;
    const withDeadlines = bookmarks.filter((bookmark) => bookmark.opportunity_deadline).length;
    return [
      ['Saved', bookmarks.length],
      ['Urgent', urgent],
      ['With dates', withDeadlines],
    ];
  }, [bookmarks]);

  const removeSaved = async (bookmark: BookmarkRecord) => {
    if (confirmingId !== bookmark.id) {
      setConfirmingId(bookmark.id);
      return;
    }

    setRemovingId(bookmark.id);
    setError(null);
    try {
      const token = await resolveToken();
      await removeBookmark(user?.id ?? '', bookmark.opportunity_id, token);
      setBookmarks((current) => current.filter((item) => item.id !== bookmark.id));
      setConfirmingId(null);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Unable to remove saved opportunity.');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className={`min-h-[100dvh] ${isDarkMode ? 'bg-gray-950 text-white' : 'bg-slate-50 text-slate-950'}`}>
      <header className={`sticky top-0 z-30 border-b backdrop-blur-xl ${isDarkMode ? 'border-white/10 bg-gray-950/90' : 'border-slate-200 bg-white/90'}`}>
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <ChevronLeft size={17} />
            Dashboard
          </button>
          <button
            type="button"
            onClick={loadBookmarks}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-500 px-3 text-sm font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 size={17} className="animate-spin" /> : <RefreshCcw size={17} />}
            Refresh
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section className={`rounded-[20px] border p-5 sm:p-6 ${isDarkMode ? 'border-white/10 bg-gray-900/70' : 'border-slate-200 bg-white shadow-sm'}`}>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
                <Bookmark size={22} />
              </div>
              <h1 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">Saved opportunities</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                Keep your shortlist focused and move from saved items into applications before deadlines close.
              </p>
            </div>
            <div className={`grid grid-cols-3 gap-3 rounded-2xl border p-4 ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50'}`}>
              {stats.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{label}</p>
                  <p className="mt-2 text-2xl font-black">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {error ? (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </div>
        ) : null}

        <section className="mt-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative max-w-xl flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search saved opportunities"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-gray-900 dark:text-white"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {(['all', 'urgent', 'upcoming'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFilter(item)}
                  className={`h-10 rounded-xl px-4 text-sm font-black capitalize transition ${
                    filter === item
                      ? 'bg-brand-500 text-white'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-gray-900 dark:text-slate-300 dark:hover:bg-white/10'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className={`h-40 animate-pulse rounded-[20px] border ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-white'}`} />
              ))}
            </div>
          ) : visibleBookmarks.length === 0 ? (
            <div className={`mt-5 rounded-[20px] border p-10 text-center ${isDarkMode ? 'border-white/10 bg-gray-900/70' : 'border-slate-200 bg-white'}`}>
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
                <Briefcase size={22} />
              </div>
              <h2 className="mt-4 text-base font-black">No saved opportunities found</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
                Save opportunities from the feed to build a shortlist you can review and apply from.
              </p>
              <button
                type="button"
                onClick={() => navigate('/opportunities')}
                className="mt-5 inline-flex h-10 items-center justify-center rounded-xl bg-brand-500 px-4 text-sm font-bold text-white transition hover:bg-brand-600"
              >
                Browse opportunities
              </button>
            </div>
          ) : (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {visibleBookmarks.map((bookmark) => {
                const days = daysUntil(bookmark.opportunity_deadline);
                return (
                  <article
                    key={bookmark.id}
                    className={`rounded-[20px] border p-5 transition hover:-translate-y-0.5 ${isDarkMode ? 'border-white/10 bg-gray-900/70' : 'border-slate-200 bg-white shadow-sm'}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-brand-600 dark:text-brand-300">
                          {bookmark.opportunity_category || 'Opportunity'}
                        </p>
                        <h2 className="mt-2 line-clamp-2 text-lg font-black leading-6 tracking-tight">
                          {bookmark.opportunity_title}
                        </h2>
                        <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
                          {bookmark.opportunity_location || 'Worldwide'}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-xl px-2.5 py-1 text-xs font-black ${
                        days !== null && days <= 7
                          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'
                      }`}>
                        {deadlineLabel(bookmark)}
                      </span>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-3 text-sm font-semibold text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-2">
                        <Calendar size={15} />
                        {formatDate(bookmark.opportunity_deadline)}
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <Clock size={15} />
                        Saved {formatDate(bookmark.created_at)}
                      </span>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => navigate(`/opportunity/${bookmark.opportunity_id}`)}
                        className="inline-flex h-10 items-center justify-center rounded-xl bg-brand-500 px-4 text-sm font-bold text-white transition hover:bg-brand-600"
                      >
                        Open details
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeSaved(bookmark)}
                        disabled={removingId === bookmark.id}
                        className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
                      >
                        {removingId === bookmark.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                        {confirmingId === bookmark.id ? 'Confirm remove' : 'Remove'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
