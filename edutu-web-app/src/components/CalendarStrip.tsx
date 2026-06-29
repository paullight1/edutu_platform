import { Calendar, Clock, X } from "lucide-react";

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

function formatEventDate(value: string | null | undefined): string {
  if (!value) return "No date";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function CalendarStrip({
  bookmarks,
  applications,
  deadlines = [],
  compact = false,
  onClose,
  onDateClick,
  onEventClick,
}: CalendarStripProps) {
  const events: CalendarEvent[] =
    deadlines.length > 0
      ? deadlines.slice(0, 6).map((deadline) => ({
          id: deadline.id,
          type: deadline.type,
          title: deadline.title,
          date: deadline.deadline,
          sourceId: deadline.sourceId,
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
          })),
        ].slice(0, 6);

  if (events.length === 0) {
    return null;
  }

  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-950 ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-black">
          <Calendar size={compact ? 15 : 17} />
          <span className="truncate">Upcoming activity</span>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-black transition hover:bg-slate-100 hover:text-black dark:hover:bg-white/10 dark:hover:text-white"
            aria-label="Close upcoming activity"
          >
            <X size={15} />
          </button>
        ) : null}
      </div>
      <div className={`flex gap-2 overflow-x-auto ${compact ? "pb-0" : "pb-1"}`}>
        {events.map((event) => (
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
            className={`min-w-[138px] rounded-xl border border-slate-200 bg-slate-50 text-left transition hover:border-brand-300 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 ${
              compact ? "p-2.5" : "p-3"
            }`}
          >
            <span className="mb-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-black">
              <Clock size={13} />
              {formatEventDate(event.date)}
            </span>
            <span className="line-clamp-1 block text-xs font-semibold leading-5 text-black">
              {event.title}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
