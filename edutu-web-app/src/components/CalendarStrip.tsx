import { Calendar, Clock } from "lucide-react";

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
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-950">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-white">
        <Calendar size={17} />
        Upcoming activity
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
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
            className="min-w-[170px] rounded-md border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-brand-300 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
          >
            <span className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <Clock size={13} />
              {formatEventDate(event.date)}
            </span>
            <span className="line-clamp-2 block text-sm font-semibold leading-5 text-slate-950 dark:text-white">
              {event.title}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
