import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Calendar } from "lucide-react";
import ImageWithFallback from "./ImageWithFallback";
import { fetchEvents } from "../services/events";
import { selectUpcomingEvents } from "../lib/upcomingEvents";
import type { EdutuEvent } from "../types/event";

const eventFallbackImage =
  "https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg";

function formatEventDate(value?: string | null): string {
  if (!value) return "Date coming soon";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date coming soon";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface EventsHomeSectionProps {
  /**
   * `public` matches the landing page's full-bleed editorial sections;
   * `app` drops the outer chrome so it sits inside the dashboard column.
   */
  variant?: "public" | "app";
}

export default function EventsHomeSection({
  variant = "public",
}: EventsHomeSectionProps) {
  const [events, setEvents] = useState<EdutuEvent[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    fetchEvents({ signal: controller.signal, limit: 20 })
      .then((rows) => {
        if (controller.signal.aborted) return;
        setEvents(selectUpcomingEvents(rows));
      })
      // Events are supplementary — a failed fetch just hides the section.
      .catch(() => undefined);

    return () => controller.abort();
  }, []);

  // Nothing upcoming (or still loading) renders nothing at all, so neither home
  // shows an empty shell or shifts layout on the common no-events case.
  if (events.length === 0) return null;

  const isPublic = variant === "public";

  const grid = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {events.map((event) => (
        <article
          key={event.id}
          className="group overflow-hidden rounded-[22px] border border-subtle bg-surface-layer transition-colors hover:border-brand/40"
        >
          <Link
            to={`/events/${event.slug}`}
            className="block text-text-primary no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <div className="relative aspect-[16/9] overflow-hidden bg-surface-elevated">
              <ImageWithFallback
                src={event.imageUrl || eventFallbackImage}
                alt={`${event.title} event cover`}
                className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                fallbackClassName="flex h-full w-full items-center justify-center"
              />
            </div>
            <div className="p-5">
              <h3 className="line-clamp-2 font-display text-lg font-bold leading-[1.2] tracking-[-0.01em] text-text-primary">
                {event.title}
              </h3>
              <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary">
                <Calendar size={13} className="shrink-0" />
                {formatEventDate(event.startsAt)}
              </p>
            </div>
          </Link>
        </article>
      ))}
    </div>
  );

  const viewMore = (
    <Link
      to="/events"
      className="inline-flex items-center gap-2 self-start rounded-xl border border-subtle bg-surface-layer px-5 py-3 text-base font-medium text-text-primary no-underline transition-all duration-200 hover:border-brand/40 hover:text-brand"
    >
      View more <ArrowRight size={16} />
    </Link>
  );

  if (!isPublic) {
    return (
      <section aria-labelledby="home-events-heading">
        <div className="mb-4 flex items-end justify-between gap-4">
          <h2
            id="home-events-heading"
            className="font-display text-xl font-bold tracking-tight text-text-primary"
          >
            Upcoming events
          </h2>
          <Link
            to="/events"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand no-underline transition hover:gap-2"
          >
            View more <ArrowRight size={14} />
          </Link>
        </div>
        {grid}
      </section>
    );
  }

  return (
    <section
      className="border-t border-subtle px-4 py-20 sm:px-6 sm:py-28"
      aria-labelledby="home-events-heading"
    >
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <h2
              id="home-events-heading"
              className="font-display text-3xl font-bold leading-[1.1] tracking-[-0.02em] text-text-primary sm:text-4xl"
            >
              Upcoming <span className="text-brand">events</span>
            </h2>
            <p className="mt-4 text-lg leading-[1.55] text-text-secondary">
              Live sessions, workshops, and application clinics you can join.
            </p>
          </div>
          {viewMore}
        </div>
        {grid}
      </div>
    </section>
  );
}
