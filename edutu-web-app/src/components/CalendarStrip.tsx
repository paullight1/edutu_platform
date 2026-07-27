import { Bookmark, Calendar, ChevronRight, Clock, Send, X } from "lucide-react";
import {
  getDeadlineBadge,
  urgencyBadgeClasses,
} from "../services/deadlineUrgency";

export interface CalendarEvent {
  id: string;
  type: "bookmark" | "application" | "goal";
  title: string;
  date: string | null;
  sourceId?: string;
}

type BookmarkLike = {
  id: string;
  opportunity_title?: string;
  opportunity_category?: string;
  deadline?: string | null;
  created_at?: string | null;
  saved_at?: string | null;
};

type ApplicationLike = {
  id: string;
  opportunity_title?: string;
  opportunity_category?: string;
  submitted_at?: string | null;
  applied_at?: string | null;
  created_at?: string | null;
};

type DeadlineLike = {
  id: string;
  type: "bookmark" | "application" | "goal";
  title: string;
  deadline: string;
  sourceId?: string;
};

interface CalendarStripProps {
  bookmarks: BookmarkLike[];
  applications: ApplicationLike[];
  deadlines?: DeadlineLike[];
  compact?: boolean;
  onClose?: () => void;
  onDateClick?: (date: Date) => void;
  onEventClick?: (event: CalendarEvent) => void;
}

type StripEvent = CalendarEvent & {
  /** True when `date` is a real deadline rather than a saved/created stamp. */
  isDeadline: boolean;
};

function formatEventDate(value: string | null | undefined): string {
  if (!value) return "No date";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

const TYPE_LABELS: Record<CalendarEvent["type"], string> = {
  bookmark: "Saved",
  application: "Application",
  goal: "Goal",
};

export default function CalendarStrip({
  bookmarks,
  applications,
  deadlines = [],
  compact = false,
  onClose,
  onDateClick,
  onEventClick,
}: CalendarStripProps) {
  const events: StripEvent[] =
    deadlines.length > 0
      ? deadlines.slice(0, 6).map((deadline) => ({
          id: deadline.id,
          type: deadline.type,
          title: deadline.title,
          date: deadline.deadline,
          sourceId: deadline.sourceId,
          isDeadline: true,
        }))
      : [
          ...bookmarks.slice(0, 4).map((bookmark) => ({
            id: bookmark.id,
            type: "bookmark" as const,
            title: bookmark.opportunity_title || "Saved opportunity",
            date:
              bookmark.deadline ||
              bookmark.saved_at ||
              bookmark.created_at ||
              null,
            isDeadline: Boolean(bookmark.deadline),
          })),
          ...applications.slice(0, 4).map((application) => ({
            id: application.id,
            type: "application" as const,
            title: application.opportunity_title || "Tracked application",
            date:
              application.submitted_at ||
              application.applied_at ||
              application.created_at ||
              null,
            isDeadline: false,
          })),
        ].slice(0, 6);

  if (events.length === 0) {
    return null;
  }

  // Real deadlines first, soonest first; saved/tracked stamps trail behind.
  const sorted = [...events].sort((a, b) => {
    if (a.isDeadline !== b.isDeadline) return a.isDeadline ? -1 : 1;
    const ta = a.date ? new Date(a.date).getTime() : Number.POSITIVE_INFINITY;
    const tb = b.date ? new Date(b.date).getTime() : Number.POSITIVE_INFINITY;
    return a.isDeadline ? ta - tb : tb - ta;
  });

  const hasDeadlines = sorted.some((event) => event.isDeadline);

  return (
    <div
      className={`rounded-2xl border border-subtle bg-surface-layer shadow-soft ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-text-primary">
          <Calendar size={compact ? 15 : 17} className="text-brand" />
          <span className="truncate">
            {hasDeadlines ? "Upcoming deadlines" : "Recent activity"}
          </span>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
            aria-label="Close upcoming activity"
          >
            <X size={15} />
          </button>
        ) : null}
      </div>
      <div
        className={`-mx-1 flex gap-2 overflow-x-auto px-1 ${compact ? "pb-0.5" : "pb-1"}`}
      >
        {sorted.map((event) => {
          const badge = event.isDeadline ? getDeadlineBadge(event.date) : null;
          const TypeIcon = event.type === "application" ? Send : Bookmark;

          return (
            <button
              key={`${event.type}-${event.id}`}
              type="button"
              onClick={() => {
                if (event.date) {
                  const parsed = new Date(event.date);
                  if (!Number.isNaN(parsed.getTime())) {
                    onDateClick?.(parsed);
                  }
                }
                onEventClick?.(event);
              }}
              className={`group flex min-w-[164px] max-w-[210px] flex-col items-start gap-1.5 rounded-xl border border-subtle bg-surface-elevated text-left transition hover:border-brand/40 hover:bg-surface-layer ${
                compact ? "p-2.5" : "p-3"
              }`}
            >
              {badge ? (
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-semibold ${urgencyBadgeClasses(badge.level)}`}
                >
                  <Clock size={11} />
                  {badge.label}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-subtle bg-surface-layer px-2 py-0.5 text-2xs font-semibold text-text-muted">
                  <Clock size={11} />
                  {formatEventDate(event.date)}
                </span>
              )}
              <span className="line-clamp-2 block text-xs font-semibold leading-[1.15rem] text-text-primary">
                {event.title}
              </span>
              <span className="flex w-full items-center justify-between gap-1 text-2xs font-semibold uppercase tracking-wide text-text-muted">
                <span className="inline-flex items-center gap-1">
                  <TypeIcon size={11} />
                  {TYPE_LABELS[event.type]}
                </span>
                <ChevronRight
                  size={12}
                  className="shrink-0 transition group-hover:translate-x-0.5 group-hover:text-brand"
                />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
