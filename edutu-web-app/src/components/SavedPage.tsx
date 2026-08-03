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
import PullToRefresh from "./ui/PullToRefresh";
import { EmptyState, ErrorState } from "./ui/EmptyState";
import { getBookmarks, type BookmarkRecord } from "../services/bookmarks";
import UrgencyPill from "./opportunity/UrgencyPill";
import WebPushPrompt from "./WebPushPrompt";

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

  const surfaceClass = "border-subtle bg-surface-layer shadow-soft";

  return (
    <div className="min-h-[100dvh] bg-surface-body text-text-primary">
      <header className="sticky top-0 z-30 hidden border-b border-subtle bg-surface-layer/90 backdrop-blur-xl lg:block">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-subtle px-3 text-sm font-bold text-text-secondary transition hover:bg-surface-elevated"
          >
            <ChevronLeft size={17} />
            Back
          </button>
          <button
            type="button"
            onClick={() => void loadBookmarks()}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-3 text-sm font-bold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
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
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">
                  Saved workspace
                </p>
                <h1 className="mt-1 text-xl font-display font-semibold tracking-tight">
                  Saved opportunities
                </h1>
                <p className="mt-2 text-sm leading-6 text-text-muted">
                  Everything you bookmarked, ready to revisit and apply.
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
                {bookmarks.length}
              </span>
            </div>
          </section>

          {/* Contextual opt-in: only worth asking once there is something saved
              whose deadline we could remind them about. Hides itself entirely
              when push is unavailable, blocked, already on, or dismissed. */}
          {!loading && !error && bookmarks.length > 0 ? (
            <WebPushPrompt
              promptId="saved"
              title="Never miss a saved deadline"
              body="Turn on browser reminders and we'll nudge you before each saved opportunity closes."
              className="mt-5"
            />
          ) : null}

          {loading ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-24 animate-pulse rounded-[20px] border border-subtle bg-surface-elevated"
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
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                    <Bookmark size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
                      {bookmark.opportunity_category || "Opportunity"}
                    </p>
                    <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-text-primary">
                      {bookmark.opportunity_title}
                    </h3>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <p className="text-xs font-medium text-text-muted">
                        {bookmark.opportunity_location || "Worldwide"} ·{" "}
                        {formatDeadline(bookmark.opportunity_deadline)}
                      </p>
                      <UrgencyPill
                        deadline={bookmark.opportunity_deadline}
                        compact
                        className="!py-0.5"
                      />
                    </div>
                  </div>
                  <ChevronRight
                    size={18}
                    className="shrink-0 text-text-muted"
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
