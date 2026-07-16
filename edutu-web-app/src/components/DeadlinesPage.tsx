import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Bookmark,
  Briefcase,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  RefreshCcw,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
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

function formatRelativeDeadline(daysUntil: number | null) {
  if (daysUntil === null) return "No deadline";
  if (daysUntil < 0) {
    const days = Math.abs(daysUntil);
    return days === 1 ? "1 day overdue" : `${days} days overdue`;
  }
  if (daysUntil === 0) return "Today";
  if (daysUntil === 1) return "Tomorrow";
  return `In ${daysUntil} days`;
}

function urgencyAccentClass(daysUntil: number | null) {
  if (daysUntil !== null && daysUntil < 0) return "bg-danger";
  if (daysUntil !== null && daysUntil <= 7) return "bg-warning";
  return "bg-brand";
}

function urgencyTextClass(daysUntil: number | null) {
  if (daysUntil !== null && daysUntil < 0) return "text-danger";
  if (daysUntil !== null && daysUntil <= 7) return "text-warning";
  return "text-text-muted";
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
  const [showMonthGrid, setShowMonthGrid] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const weekStripRef = useRef<HTMLDivElement | null>(null);
  const todayChipRef = useRef<HTMLButtonElement | null>(null);

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

  const overdueItems = useMemo(
    () => datedWorkItems.filter((item) => (item.daysUntil ?? 1) < 0),
    [datedWorkItems],
  );

  const thisWeekItems = useMemo(
    () =>
      datedWorkItems.filter(
        (item) =>
          item.daysUntil !== null && item.daysUntil >= 0 && item.daysUntil <= 7,
      ),
    [datedWorkItems],
  );

  const laterItems = useMemo(
    () =>
      datedWorkItems.filter(
        (item) => item.daysUntil === null || item.daysUntil > 7,
      ),
    [datedWorkItems],
  );

  const weekStripDays = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 14 }, (_, index) => {
      const day = new Date(today);
      day.setDate(today.getDate() + index - 3);
      return day;
    });
  }, []);

  const todayKey = useMemo(() => getDateKey(new Date()), []);

  useEffect(() => {
    const container = weekStripRef.current;
    const chip = todayChipRef.current;
    if (!container || !chip) return;
    container.scrollLeft =
      chip.offsetLeft - container.clientWidth / 2 + chip.clientWidth / 2;
  }, []);

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

  const scrollToSection = (sectionId: string) => {
    document
      .getElementById(sectionId)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const surfaceClass = "border-subtle bg-surface-layer shadow-soft";
  const softSurfaceClass = "border-subtle bg-surface-elevated";
  const isSavedRoute = pathname === "/saved" || pathname.startsWith("/app/saved");
  const eyebrow = isSavedRoute ? "Saved workspace" : "Calendar";
  const pageTitle = isSavedRoute ? "Saved & deadlines" : "Deadlines";

  const statChips = [
    {
      id: "dated",
      label: "Dated",
      count: datedWorkItems.length,
      icon: CalendarDays,
      target: "agenda-section",
      danger: false,
    },
    {
      id: "saved",
      label: "Saved",
      count: bookmarks.length,
      icon: Bookmark,
      target: "saved-section",
      danger: false,
    },
    {
      id: "this-week",
      label: "This week",
      count: thisWeekItems.length,
      icon: Clock,
      target: thisWeekItems.length > 0 ? "group-this-week" : "agenda-section",
      danger: false,
    },
    {
      id: "overdue",
      label: "Overdue",
      count: overdueItems.length,
      icon: AlertCircle,
      target: overdueItems.length > 0 ? "group-overdue" : "agenda-section",
      danger: overdueItems.length > 0,
    },
  ];

  const renderAgendaGroup = (
    groupId: string,
    label: string,
    items: WorkItem[],
    labelClass: string,
  ) => {
    if (items.length === 0) return null;
    return (
      <div id={groupId} className="scroll-mt-3 lg:scroll-mt-20">
        <div className="sticky top-0 z-10 -mx-4 bg-surface-body/95 px-4 py-2 backdrop-blur lg:top-16">
          <p
            className={`text-[11px] font-bold uppercase tracking-[0.16em] ${labelClass}`}
          >
            {label}
            <span className="ml-1.5 font-semibold text-text-muted">
              {items.length}
            </span>
          </p>
        </div>
        <div className="space-y-2.5 pt-1">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => openOpportunity(item.sourceId)}
              className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${surfaceClass}`}
            >
              <span
                className={`h-10 w-1 shrink-0 rounded-full ${urgencyAccentClass(item.daysUntil)}`}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-text-primary">
                  {item.title}
                </h3>
                <p className="mt-1 text-xs font-medium text-text-muted">
                  {typeLabel(item.kind)} · {formatDate(item.date)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span
                  className={`whitespace-nowrap text-xs font-bold ${urgencyTextClass(item.daysUntil)}`}
                >
                  {formatRelativeDeadline(item.daysUntil)}
                </span>
                <ChevronRight size={16} className="text-text-muted" />
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  };

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
        <main className="mx-auto max-w-3xl px-4 py-5 sm:px-6 lg:py-8">
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

            <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {statChips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => scrollToSection(chip.target)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                    chip.danger
                      ? "border-danger/40 bg-danger/10 text-danger"
                      : `${softSurfaceClass} text-text-secondary`
                  }`}
                >
                  <chip.icon size={13} className="shrink-0" />
                  <span className="text-sm font-bold">{chip.count}</span>
                  <span className="whitespace-nowrap text-xs font-semibold">
                    {chip.label}
                  </span>
                </button>
              ))}
            </div>

            <div
              ref={weekStripRef}
              className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {weekStripDays.map((date) => {
                const dateKey = getDateKey(date);
                const dayItems = itemsByDate.get(dateKey) ?? [];
                const isSelected = selectedDateKey === dateKey;
                const isToday = dateKey === todayKey;
                return (
                  <button
                    key={dateKey}
                    ref={isToday ? todayChipRef : undefined}
                    type="button"
                    onClick={() => setSelectedDateKey(dateKey)}
                    className={`flex w-12 shrink-0 flex-col items-center gap-1 rounded-2xl border py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                      isSelected
                        ? "border-transparent bg-brand text-white shadow-lg shadow-brand/20"
                        : isToday
                          ? "border-brand/40 bg-brand/10 text-brand"
                          : "border-subtle bg-surface-elevated text-text-secondary hover:bg-surface-layer"
                    }`}
                    aria-label={`${formatDate(date.toISOString())}${dayItems.length ? `, ${dayItems.length} deadline${dayItems.length === 1 ? "" : "s"}` : ""}`}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wide">
                      {date.toLocaleDateString(undefined, { weekday: "short" })}
                    </span>
                    <span className="text-sm font-semibold">{date.getDate()}</span>
                    <span
                      className={`h-1 w-1 rounded-full ${
                        dayItems.length > 0
                          ? isSelected
                            ? "bg-white"
                            : "bg-brand"
                          : "bg-transparent"
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
            </div>

            {selectedItems.length > 0 ? (
              <div className={`mt-3 rounded-2xl border p-3 ${softSurfaceClass}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">
                    {formatSelectedDate(selectedDateKey)}
                  </p>
                  <span className="text-xs font-medium text-text-muted">
                    {selectedItems.length} item{selectedItems.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {selectedItems.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => openOpportunity(item.sourceId)}
                      className="flex w-full items-center gap-3 rounded-xl bg-surface-layer p-3 text-left text-sm font-semibold shadow-soft transition hover:-translate-y-0.5"
                    >
                      <CalendarDays size={17} className="shrink-0 text-brand" />
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      <ChevronRight size={16} className="shrink-0 text-text-muted" />
                    </button>
                  ))}
                </div>
              </div>
            ) : selectedDateKey ? (
              <p className="mt-3 text-xs font-medium text-text-muted">
                Nothing due on {formatSelectedDate(selectedDateKey)}. Tap a dotted
                day to see its items.
              </p>
            ) : null}

            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowMonthGrid((current) => !current)}
                aria-expanded={showMonthGrid}
                className={`flex w-full items-center justify-between rounded-2xl border px-3.5 py-2.5 text-sm font-semibold text-text-secondary transition hover:bg-surface-layer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${softSurfaceClass}`}
              >
                <span className="inline-flex items-center gap-2">
                  <CalendarRange size={16} className="text-brand" />
                  Month view
                </span>
                <ChevronDown
                  size={16}
                  className={`transition-transform duration-200 ${showMonthGrid ? "rotate-180" : ""}`}
                />
              </button>

              <AnimatePresence initial={false}>
                {showMonthGrid ? (
                  <motion.div
                    key="month-grid"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => moveMonth(-1)}
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-subtle text-text-secondary transition hover:bg-surface-elevated"
                        aria-label="Previous month"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <p className="text-sm font-semibold">
                        {formatMonth(calendarMonth)}
                      </p>
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
                    <div className="mt-2 grid grid-cols-7 gap-1 pb-1">
                      {calendarCells.map((date, index) => {
                        if (!date) {
                          return <div key={`blank-${index}`} className="h-12" />;
                        }
                        const dateKey = getDateKey(date);
                        const dayItems = itemsByDate.get(dateKey) ?? [];
                        const isSelected = selectedDateKey === dateKey;
                        const isToday = dateKey === todayKey;
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
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </section>

          <section id="agenda-section" className="mt-6 scroll-mt-3 lg:scroll-mt-20">
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
              <div className={`mt-4 rounded-[20px] border p-6 text-center ${surfaceClass}`}>
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                  <Clock size={22} />
                </div>
                <h3 className="mt-4 text-base font-semibold">
                  No dated deadlines yet
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-muted">
                  Save or apply to opportunities and their deadlines will show
                  up here automatically.
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
              <div className="mt-2 space-y-5">
                {renderAgendaGroup(
                  "group-overdue",
                  "Overdue",
                  overdueItems,
                  "text-danger",
                )}
                {renderAgendaGroup(
                  "group-this-week",
                  "This week",
                  thisWeekItems,
                  "text-warning",
                )}
                {renderAgendaGroup(
                  "group-later",
                  "Later",
                  laterItems,
                  "text-text-muted",
                )}
              </div>
            )}
          </section>

          <section
            id="saved-section"
            className="mt-7 scroll-mt-3 pb-28 lg:scroll-mt-20 lg:pb-8"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-display font-semibold tracking-tight text-text-secondary">
                Saved · no deadline
              </h2>
              <span className="rounded-full bg-surface-elevated px-3 py-1 text-xs font-semibold text-text-secondary">
                {undatedSavedItems.length}
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
            ) : undatedSavedItems.length === 0 ? (
              <p className="mt-3 text-sm font-medium text-text-muted">
                Every saved opportunity has a deadline — find them all in the
                agenda above.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {undatedSavedItems.map((bookmark) => (
                  <button
                    key={bookmark.id}
                    type="button"
                    onClick={() => openOpportunity(bookmark.opportunity_id)}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${softSurfaceClass}`}
                  >
                    <Bookmark size={16} className="shrink-0 text-text-muted" />
                    <div className="min-w-0 flex-1">
                      <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-text-primary">
                        {bookmark.opportunity_title}
                      </h3>
                      <p className="mt-0.5 text-xs font-medium text-text-muted">
                        {bookmark.opportunity_category || "Opportunity"} ·{" "}
                        {bookmark.opportunity_location || "Worldwide"}
                      </p>
                    </div>
                    <ChevronRight size={16} className="shrink-0 text-text-muted" />
                  </button>
                ))}
              </div>
            )}
          </section>
        </main>
      </PullToRefresh>
    </div>
  );
}
