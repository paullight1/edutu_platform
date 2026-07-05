import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  Briefcase,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  RefreshCcw,
} from "lucide-react";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth as useAppAuth } from "../hooks/useAuth";
import PullToRefresh from "./ui/PullToRefresh";
import {
  getBookmarks,
  type BookmarkRecord,
} from "../services/bookmarks";
import {
  getDeadlines,
  type Deadline,
  type DeadlinesResponse,
} from "../services/deadlines";

type WorkItemKind = Deadline["type"] | "saved";

interface WorkItem {
  key: string;
  title: string;
  category: string;
  date: string | null;
  daysUntil: number | null;
  kind: WorkItemKind;
  sourceId: string;
  location?: string;
}

function getDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDateKey(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calculateDaysUntil(value?: string | null) {
  const target = getDate(value);
  if (!target) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(value?: string | null) {
  const date = getDate(value);
  if (!date) return "No deadline";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatSelectedDate(value: string) {
  const date = getDate(value);
  if (!date) return "Selected day";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function formatMonth(value: Date) {
  return value.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function deadlineStatus(daysUntil: number | null) {
  if (daysUntil === null) return "No deadline";
  if (daysUntil < 0) return `${Math.abs(daysUntil)}d overdue`;
  if (daysUntil === 0) return "Due today";
  return `Due in ${daysUntil}d`;
}

function typeLabel(type: WorkItemKind) {
  if (type === "application") return "Application";
  if (type === "bookmark" || type === "saved") return "Saved";
  return "Deadline";
}

function getCalendarCells(month: Date) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const totalDays = new Date(year, monthIndex + 1, 0).getDate();
  const cells: Array<Date | null> = [];

  for (let index = 0; index < firstDay.getDay(); index += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= totalDays; day += 1) {
    cells.push(new Date(year, monthIndex, day));
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

function toDeadlineWorkItem(deadline: Deadline): WorkItem {
  return {
    key: `deadline-${deadline.id}`,
    title: deadline.title,
    category: deadline.category,
    date: deadline.deadline,
    daysUntil: deadline.daysUntil,
    kind: deadline.type,
    sourceId: deadline.sourceId,
  };
}

function toBookmarkWorkItem(bookmark: BookmarkRecord): WorkItem {
  return {
    key: `saved-${bookmark.id}`,
    title: bookmark.opportunity_title,
    category: bookmark.opportunity_category || "Opportunity",
    date: bookmark.opportunity_deadline,
    daysUntil: calculateDaysUntil(bookmark.opportunity_deadline),
    kind: "saved",
    sourceId: bookmark.opportunity_id,
    location: bookmark.opportunity_location,
  };
}

export default function DeadlinesPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { getToken } = useClerkAuth();
  const { user } = useAppAuth();
  const [data, setData] = useState<DeadlinesResponse | null>(null);
  const [bookmarks, setBookmarks] = useState<BookmarkRecord[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [selectedDateKey, setSelectedDateKey] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDeadlines = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getToken().catch(() => null);
      if (!token) {
        throw new Error("Sign in again to load deadlines.");
      }

      const [deadlinesData, bookmarksData] = await Promise.all([
        getDeadlines(user.id, token),
        getBookmarks(user.id, token),
      ]);
      setData(deadlinesData);
      setBookmarks(bookmarksData);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load deadlines.",
      );
    } finally {
      setLoading(false);
    }
  }, [getToken, user?.id]);

  useEffect(() => {
    void loadDeadlines();
  }, [loadDeadlines]);

  const allDeadlines = useMemo(
    () => data?.groups.flatMap((group) => group.deadlines) ?? [],
    [data],
  );

  const datedWorkItems = useMemo(() => {
    const deadlineSourceIds = new Set(
      allDeadlines
        .map((deadline) => deadline.sourceId)
        .filter(Boolean),
    );

    const savedWithDates = bookmarks
      .filter((bookmark) => bookmark.opportunity_deadline)
      .filter((bookmark) => !deadlineSourceIds.has(bookmark.opportunity_id))
      .map(toBookmarkWorkItem);

    return [...allDeadlines.map(toDeadlineWorkItem), ...savedWithDates]
      .filter((item) => Boolean(item.date))
      .sort((first, second) => {
        const firstDate = getDate(first.date)?.getTime() ?? 0;
        const secondDate = getDate(second.date)?.getTime() ?? 0;
        return firstDate - secondDate;
      });
  }, [allDeadlines, bookmarks]);

  const undatedSavedItems = useMemo(
    () =>
      bookmarks
        .filter((bookmark) => !bookmark.opportunity_deadline)
        .sort(
          (first, second) =>
            (getDate(second.created_at)?.getTime() ?? 0) -
            (getDate(first.created_at)?.getTime() ?? 0),
        ),
    [bookmarks],
  );

  const itemsByDate = useMemo(() => {
    const map = new Map<string, WorkItem[]>();
    datedWorkItems.forEach((item) => {
      if (!item.date) return;
      const key = getDateKey(item.date);
      if (!key) return;
      const current = map.get(key) ?? [];
      current.push(item);
      map.set(key, current);
    });
    return map;
  }, [datedWorkItems]);

  useEffect(() => {
    if (selectedDateKey) return;
    setSelectedDateKey(
      datedWorkItems[0]?.date ? getDateKey(datedWorkItems[0].date) : getDateKey(new Date()),
    );
  }, [datedWorkItems, selectedDateKey]);

  const selectedItems = selectedDateKey
    ? itemsByDate.get(selectedDateKey) ?? []
    : [];

  const calendarCells = useMemo(
    () => getCalendarCells(calendarMonth),
    [calendarMonth],
  );

  const summary = useMemo(() => {
    const overdue = datedWorkItems.filter((item) => (item.daysUntil ?? 1) < 0).length;
    const thisWeek = datedWorkItems.filter((item) => {
      if (item.daysUntil === null) return false;
      return item.daysUntil >= 0 && item.daysUntil <= 7;
    }).length;
    return [
      ["Dated", datedWorkItems.length],
      ["Saved", bookmarks.length],
      ["This week", thisWeek],
      ["Overdue", overdue],
    ];
  }, [bookmarks.length, datedWorkItems]);

  const moveMonth = (offset: number) => {
    setCalendarMonth((current) => {
      const next = new Date(current);
      next.setMonth(current.getMonth() + offset);
      return next;
    });
  };

  const openOpportunity = (sourceId: string) => {
    if (sourceId) {
      navigate(`/opportunity/${encodeURIComponent(sourceId)}`);
    }
  };

  const surfaceClass = "border-subtle bg-surface-layer shadow-soft";
  const softSurfaceClass = "border-subtle bg-surface-elevated";
  const isSavedRoute = pathname === "/saved" || pathname.startsWith("/app/saved");
  const eyebrow = isSavedRoute ? "Saved workspace" : "Calendar";
  const pageTitle = isSavedRoute ? "Saved & deadlines" : "Deadlines";

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
        </div>
      </header>

      <PullToRefresh
        onRefresh={loadDeadlines}
        disabled={loading}
        className="min-h-[calc(100dvh-4rem)]"
      >
        <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          {error ? (
            <div className="mb-5 rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm font-semibold text-danger">
              {error}
            </div>
          ) : null}

          <section className={`rounded-[20px] border p-4 sm:p-5 ${surfaceClass}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">
                  {eyebrow}
                </p>
                <h1 className="mt-1 text-xl font-display font-semibold tracking-tight">
                  {pageTitle}
                </h1>
              </div>
              <button
                type="button"
                onClick={loadDeadlines}
                disabled={loading}
                className="hidden h-10 items-center gap-2 rounded-xl border border-subtle px-3 text-sm font-bold text-text-secondary transition hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-60 lg:inline-flex"
              >
                {loading ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <RefreshCcw size={15} />
                )}
                Refresh
              </button>
            </div>

            <div className="mt-4 grid grid-cols-4 gap-2">
              {summary.map(([label, value]) => (
                <div
                  key={label}
                  className={`rounded-2xl border px-3 py-2 ${softSurfaceClass}`}
                >
                  <p className="truncate text-[11px] font-medium text-text-muted">
                    {label}
                  </p>
                  <p className="mt-1 text-lg font-semibold">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => moveMonth(-1)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-subtle text-text-secondary transition hover:bg-surface-elevated"
                aria-label="Previous month"
              >
                <ChevronLeft size={18} />
              </button>
              <p className="text-sm font-semibold">{formatMonth(calendarMonth)}</p>
              <button
                type="button"
                onClick={() => moveMonth(1)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-subtle text-text-secondary transition hover:bg-surface-elevated"
                aria-label="Next month"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
              {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
                <div key={`${day}-${index}`}>{day}</div>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-1">
              {calendarCells.map((date, index) => {
                if (!date) {
                  return <div key={`blank-${index}`} className="h-12" />;
                }
                const dateKey = getDateKey(date);
                const dayItems = itemsByDate.get(dateKey) ?? [];
                const isSelected = selectedDateKey === dateKey;
                const isToday = dateKey === getDateKey(new Date());
                return (
                  <button
                    key={dateKey}
                    type="button"
                    onClick={() => setSelectedDateKey(dateKey)}
                    className={`relative h-12 rounded-2xl text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                      isSelected
                        ? "bg-brand text-white shadow-lg shadow-brand/20"
                        : isToday
                          ? "bg-brand/10 text-brand"
                          : "text-text-secondary hover:bg-surface-elevated"
                    }`}
                    aria-label={`${formatDate(date.toISOString())}${dayItems.length ? `, ${dayItems.length} deadline${dayItems.length === 1 ? "" : "s"}` : ""}`}
                  >
                    {date.getDate()}
                    {dayItems.length > 0 ? (
                      <span
                        className={`absolute bottom-1.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full ${
                          isSelected ? "bg-white" : "bg-brand"
                        }`}
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className={`mt-4 rounded-2xl border p-3 ${softSurfaceClass}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">
                  {selectedDateKey
                    ? formatSelectedDate(selectedDateKey)
                    : "Selected day"}
                </p>
                <span className="text-xs font-medium text-text-muted">
                  {selectedItems.length} item{selectedItems.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {selectedItems.length === 0 ? (
                  <p className="text-sm font-semibold text-text-muted">
                    No saved or tracked deadline on this date.
                  </p>
                ) : (
                  selectedItems.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => openOpportunity(item.sourceId)}
                      className="flex w-full items-center gap-3 rounded-xl bg-surface-layer p-3 text-left text-sm font-semibold shadow-soft transition hover:-translate-y-0.5"
                    >
                      <CalendarDays
                        size={17}
                        className="shrink-0 text-brand"
                      />
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      <ChevronRight size={16} className="shrink-0 text-text-muted" />
                    </button>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-display font-semibold tracking-tight">
                Upcoming deadlines
              </h2>
              <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
                {datedWorkItems.length}
              </span>
            </div>

            {loading ? (
              <div className="mt-4 space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-20 animate-pulse rounded-[20px] border border-subtle bg-surface-elevated"
                  />
                ))}
              </div>
            ) : datedWorkItems.length === 0 ? (
              <div className={`mt-4 rounded-[20px] border p-5 ${surfaceClass}`}>
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                    <Clock size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">No dated deadlines yet</h3>
                    <p className="mt-1 text-sm leading-6 text-text-muted">
                      Saved opportunities without deadlines are listed below so
                      you can still review them from this page.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {datedWorkItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => openOpportunity(item.sourceId)}
                    className={`flex w-full items-center gap-3 rounded-[20px] border p-4 text-left transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${surfaceClass}`}
                  >
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                        (item.daysUntil ?? 1) < 0
                          ? "bg-danger/10 text-danger"
                          : (item.daysUntil ?? 99) <= 7
                            ? "bg-warning/10 text-warning"
                            : "bg-brand/10 text-brand"
                      }`}
                    >
                      <CalendarDays size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-lg bg-surface-elevated px-2 py-1 text-[11px] font-semibold text-text-secondary">
                          {typeLabel(item.kind)}
                        </span>
                        <span className="text-xs font-medium text-text-muted">
                          {formatDate(item.date)}
                        </span>
                      </div>
                      <h3 className="mt-2 line-clamp-2 text-sm font-semibold text-text-primary">
                        {item.title}
                      </h3>
                      <p className="mt-1 text-xs font-medium text-text-muted">
                        {item.category} · {deadlineStatus(item.daysUntil)}
                      </p>
                    </div>
                    <ChevronRight size={18} className="shrink-0 text-text-muted" />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="mt-6 pb-28 lg:pb-8">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-display font-semibold tracking-tight">
                Saved opportunities
              </h2>
              <span className="rounded-full bg-surface-elevated px-3 py-1 text-xs font-semibold text-text-secondary">
                {bookmarks.length}
              </span>
            </div>

            {loading ? null : bookmarks.length === 0 ? (
              <div className={`mt-4 rounded-[20px] border p-6 text-center ${surfaceClass}`}>
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-elevated text-text-muted">
                  <Briefcase size={22} />
                </div>
                <h3 className="mt-4 text-base font-semibold">
                  No saved opportunities yet
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-muted">
                  Save opportunities from the feed and they will appear here
                  with their deadline status.
                </p>
                <button
                  type="button"
                  onClick={() => navigate("/opportunities")}
                  className="mt-5 inline-flex h-10 items-center justify-center rounded-xl bg-brand px-4 text-sm font-bold text-white transition hover:bg-brand-700"
                >
                  Browse opportunities
                </button>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {[...bookmarks]
                  .sort((first, second) => {
                    const firstDays = calculateDaysUntil(first.opportunity_deadline);
                    const secondDays = calculateDaysUntil(second.opportunity_deadline);
                    if (firstDays === null && secondDays === null) {
                      return (
                        (getDate(second.created_at)?.getTime() ?? 0) -
                        (getDate(first.created_at)?.getTime() ?? 0)
                      );
                    }
                    if (firstDays === null) return 1;
                    if (secondDays === null) return -1;
                    return firstDays - secondDays;
                  })
                  .map((bookmark) => {
                    const days = calculateDaysUntil(bookmark.opportunity_deadline);
                    const isUndated = undatedSavedItems.some((item) => item.id === bookmark.id);
                    return (
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
                          <p className="mt-1 text-xs font-medium text-text-muted">
                            {bookmark.opportunity_location || "Worldwide"} ·{" "}
                            {isUndated ? "No deadline" : deadlineStatus(days)}
                          </p>
                        </div>
                        <ChevronRight size={18} className="shrink-0 text-text-muted" />
                      </button>
                    );
                  })}
              </div>
            )}
          </section>
        </main>
      </PullToRefresh>
    </div>
  );
}
