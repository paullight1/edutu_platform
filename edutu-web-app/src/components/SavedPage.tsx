import { useCallback, useEffect, useState } from "react";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCcw,
} from "lucide-react";
import { useAuth as useAppAuth } from "../hooks/useAuth";
import { useDarkMode } from "../hooks/useDarkMode";
import PullToRefresh from "./ui/PullToRefresh";
import { EmptyState, ErrorState } from "./ui/EmptyState";
import { getBookmarks, type BookmarkRecord } from "../services/bookmarks";

function formatDeadline(value?: string | null) {
  if (!value) return "No deadline";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No deadline";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function SavedPage() {
  const navigate = useNavigate();
  const { getToken } = useClerkAuth();
  const { user } = useAppAuth();
  const { isDarkMode } = useDarkMode();
  const [bookmarks, setBookmarks] = useState<BookmarkRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resolveToken = useCallback(async () => {
    const token = await getToken().catch(() => null);
    if (!token) {
      throw new Error(
        "Your session has expired. Sign in again to view saved opportunities.",
      );
    }
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
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load saved opportunities.",
      );
    } finally {
      setLoading(false);
    }
  }, [resolveToken, user?.id]);

  useEffect(() => {
    void loadBookmarks();
  }, [loadBookmarks]);

  const openOpportunity = (opportunityId: string) => {
    if (opportunityId) {
      navigate(`/opportunity/${encodeURIComponent(opportunityId)}`);
    }
  };

  const surfaceClass = isDarkMode
    ? "border-white/10 bg-gray-900/70"
    : "border-slate-200 bg-white shadow-sm";

  return (
    <div
      className={`min-h-[100dvh] ${isDarkMode ? "bg-gray-950 text-white" : "bg-slate-50 text-slate-950"}`}
    >
      <header
        className={`sticky top-0 z-30 hidden border-b backdrop-blur-xl lg:block ${isDarkMode ? "border-white/10 bg-gray-950/90" : "border-slate-200 bg-white/90"}`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <ChevronLeft size={17} />
            Back
          </button>
          <button
            type="button"
            onClick={() => void loadBookmarks()}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-500 px-3 text-sm font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <Loader2 size={17} className="animate-spin" />
            ) : (
              <RefreshCcw size={17} />
            )}
            Refresh
          </button>
        </div>
      </header>

      <PullToRefresh
        onRefresh={loadBookmarks}
        disabled={loading}
        className="min-h-[calc(100dvh-4rem)]"
      >
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <section className={`rounded-[20px] border p-4 sm:p-5 ${surfaceClass}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-brand-600 dark:text-brand-300">
                  Saved workspace
                </p>
                <h1 className="mt-1 text-xl font-black tracking-tight">
                  Saved opportunities
                </h1>
                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  Everything you bookmarked, ready to revisit and apply.
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-brand-500/10 px-3 py-1 text-xs font-black text-brand-700 dark:text-brand-200">
                {bookmarks.length}
              </span>
            </div>
          </section>

          {loading ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className={`h-24 animate-pulse rounded-[20px] border ${isDarkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"}`}
                />
              ))}
            </div>
          ) : error ? (
            <div className={`mt-5 rounded-[20px] border ${surfaceClass}`}>
              <ErrorState
                message={error}
                onRetry={() => void loadBookmarks()}
              />
            </div>
          ) : bookmarks.length === 0 ? (
            <div className={`mt-5 rounded-[20px] border ${surfaceClass}`}>
              <EmptyState
                icon={<Bookmark size={32} />}
                title="No saved opportunities yet"
                description="Save opportunities from the feed and they'll show up here so you can revisit and apply before deadlines."
                action={{
                  label: "Browse opportunities",
                  onClick: () => navigate("/opportunities"),
                }}
              />
            </div>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {bookmarks.map((bookmark) => (
                <button
                  key={bookmark.id}
                  type="button"
                  onClick={() => openOpportunity(bookmark.opportunity_id)}
                  className={`flex w-full items-center gap-3 rounded-[20px] border p-4 text-left transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${surfaceClass}`}
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
                    <Bookmark size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-brand-600 dark:text-brand-300">
                      {bookmark.opportunity_category || "Opportunity"}
                    </p>
                    <h3 className="mt-1 line-clamp-2 text-sm font-black text-slate-950 dark:text-white">
                      {bookmark.opportunity_title}
                    </h3>
                    <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                      {bookmark.opportunity_location || "Worldwide"} ·{" "}
                      {formatDeadline(bookmark.opportunity_deadline)}
                    </p>
                  </div>
                  <ChevronRight
                    size={18}
                    className="shrink-0 text-slate-400"
                  />
                </button>
              ))}
            </div>
          )}
        </main>
      </PullToRefresh>
    </div>
  );
}
