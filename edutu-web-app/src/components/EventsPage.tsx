import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Calendar,
  Clock3,
  MapPin,
  Search,
  X,
} from "lucide-react";
import ImageWithFallback from "./ImageWithFallback";
import PublicEditorialShell from "./PublicEditorialShell";
import Seo from "./Seo";
import PullToRefresh from "./ui/PullToRefresh";
import { toAbsoluteUrl } from "../lib/publicSite";
import logger from "../lib/logger";
import { captureMessage } from "../lib/sentry";
import { fetchEvents } from "../services/events";
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

function formatEventTime(value?: string | null): string {
  if (!value) return "Time coming soon";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time coming soon";

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getLatestUpdatedAt(events: EdutuEvent[]): string | null {
  let latest = 0;

  for (const event of events) {
    const timestamp = new Date(
      event.updatedAt || event.createdAt || event.startsAt,
    ).getTime();
    if (!Number.isNaN(timestamp)) latest = Math.max(latest, timestamp);
  }

  return latest > 0 ? new Date(latest).toISOString() : null;
}

function EventCard({ event }: { event: EdutuEvent }) {
  const summary =
    event.summary ||
    event.description ||
    "Join an Edutu event for application support, career guidance, and student opportunities.";

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-subtle bg-surface-layer shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-elevated hover:border-brand/40">
      <Link
        to={`/events/${event.slug}`}
        className="block text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2"
      >
        <div className="relative aspect-[16/9] overflow-hidden bg-surface-elevated">
          <ImageWithFallback
            src={event.imageUrl || eventFallbackImage}
            alt={`${event.title} event cover`}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            fallbackClassName="flex h-full w-full items-center justify-center"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-md border border-brand/20 bg-brand/10 px-2 py-1 text-brand">
            {event.isOnline ? "Online" : "In person"}
          </span>
          <span className="rounded-md border border-subtle bg-surface-elevated px-2 py-1 text-text-secondary">
            {event.audience || "Public"}
          </span>
        </div>

        <Link
          to={`/events/${event.slug}`}
          className="mt-3 text-text-primary hover:text-brand"
        >
          <h2 className="font-display text-lg font-semibold leading-snug tracking-tight">
            {event.title}
          </h2>
        </Link>

        <p className="mt-2 line-clamp-2 text-sm leading-6 text-text-secondary">
          {summary}
        </p>

        <div className="mt-4 grid gap-2 text-sm text-text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Calendar size={14} />
            {formatEventDate(event.startsAt)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock3 size={14} />
            {formatEventTime(event.startsAt)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin size={14} />
            {event.location || (event.isOnline ? "Online" : "Location TBA")}
          </span>
        </div>

        <div className="mt-5 flex items-center justify-end border-t border-subtle pt-4">
          <Link
            to={`/events/${event.slug}`}
            className="inline-flex items-center gap-1 rounded-full px-5 py-3 text-sm font-semibold bg-surface-layer border border-subtle hover:border-brand/40 transition-all duration-300"
          >
            Details
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </article>
  );
}

function LoadingCard() {
  return (
    <div className="overflow-hidden rounded-2xl border border-subtle bg-surface-layer animate-pulse">
      <div className="aspect-[16/9] bg-surface-elevated" />
      <div className="p-4 space-y-3">
        <div className="flex gap-2">
          <div className="h-5 w-14 rounded-md bg-surface-elevated" />
          <div className="h-5 w-16 rounded-md bg-surface-elevated" />
        </div>
        <div className="h-5 w-3/4 rounded bg-surface-elevated" />
        <div className="space-y-2">
          <div className="h-4 w-full rounded bg-surface-elevated" />
          <div className="h-4 w-2/3 rounded bg-surface-elevated" />
        </div>
        <div className="space-y-2 pt-1">
          <div className="h-4 w-1/2 rounded bg-surface-elevated" />
          <div className="h-4 w-1/3 rounded bg-surface-elevated" />
          <div className="h-4 w-2/5 rounded bg-surface-elevated" />
        </div>
        <div className="flex justify-end pt-2">
          <div className="h-9 w-24 rounded-full bg-surface-elevated" />
        </div>
      </div>
    </div>
  );
}

export default function EventsPage() {
  const reduceMotion = useReducedMotion();
  const [events, setEvents] = useState<EdutuEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const loadEvents = useCallback(
    async (
      signal?: AbortSignal,
      options: { background?: boolean } = {},
    ) => {
      if (!options.background) setLoading(true);
      setError(null);

      try {
        const data = await fetchEvents({ signal, limit: 100 });
        setEvents(data);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const resolvedError =
          err instanceof Error ? err : new Error("Could not load events");
        setError(resolvedError);
        logger.error("[events] request failed", resolvedError);
        captureMessage("Events API request failed", "warning", {
          message: resolvedError.message,
          online:
            typeof navigator === "undefined" ? undefined : navigator.onLine,
        });
      } finally {
        if (!signal?.aborted && !options.background) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadEvents(controller.signal);
    return () => controller.abort();
  }, [loadEvents]);

  const filteredEvents = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return events;

    return events.filter((event) =>
      [
        event.title,
        event.summary,
        event.description,
        event.location,
        event.audience,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [events, searchTerm]);

  const latestUpdatedAt = useMemo(() => getLatestUpdatedAt(events), [events]);
  const seoDescription =
    "Explore Edutu events for scholarships, career development, mentorship, and application support with links to join.";
  const seoJsonLd = useMemo(
    () => [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Edutu events",
        url: toAbsoluteUrl("/events"),
        description: seoDescription,
        dateModified: latestUpdatedAt || undefined,
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: events.length,
          itemListElement: events.slice(0, 24).map((event, index) => ({
            "@type": "ListItem",
            position: index + 1,
            url: toAbsoluteUrl(`/events/${encodeURIComponent(event.slug)}`),
            name: event.title,
          })),
        },
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Events",
            item: toAbsoluteUrl("/events"),
          },
        ],
      },
    ],
    [events, latestUpdatedAt, seoDescription],
  );

  return (
    <PullToRefresh
      onRefresh={() => loadEvents(undefined, { background: true })}
      disabled={loading}
      className="min-h-[100dvh]"
    >
      <Seo
        title="Edutu events | Scholarships, mentorship and application support"
        description={seoDescription}
        path="/events"
        jsonLd={seoJsonLd}
      />
      <PublicEditorialShell mainClassName="max-w-7xl pb-10 pt-8 sm:pb-14 sm:pt-10">
        <section className="max-w-3xl">
          <div className="flex items-center gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">
              Events
            </p>
            <span className="text-xs text-text-muted sm:hidden">
              Pull down to refresh
            </span>
          </div>
          <h1 className="mt-3 text-balance font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Upcoming Edutu events
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-base leading-7 text-text-secondary">
            Join workshops, mentorship sessions, and live announcements from
            the Edutu team.
          </p>
        </section>

        <section aria-label="Search events" className="mt-8 max-w-2xl">
          <div className="relative">
            <Search
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              type="text"
              aria-label="Search events"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by title, location, or topic"
              className="h-12 w-full rounded-2xl border border-subtle bg-surface-layer pl-11 pr-11 text-sm text-text-primary shadow-soft outline-none transition focus-visible:border-brand/60 focus-visible:ring-2 focus-visible:ring-brand/15"
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-text-muted transition-all duration-300 hover:text-text-primary"
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            ) : null}
          </div>
        </section>

        {import.meta.env.DEV && error ? (
          <details className="mt-5 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-text-secondary">
            <summary className="cursor-pointer font-semibold text-text-primary">
              Events API diagnostic
            </summary>
            <code className="mt-2 block break-words text-xs">
              {error.message}
            </code>
          </details>
        ) : null}

        {loading ? (
          <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <LoadingCard key={index} />
            ))}
          </section>
        ) : filteredEvents.length > 0 ? (
          <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredEvents.map((event) => (
              <motion.div
                key={event.id}
                initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
                whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              >
                <EventCard event={event} />
              </motion.div>
            ))}
          </section>
        ) : (
          <section
            aria-live="polite"
            className="mt-10 border-t border-subtle py-14 text-center sm:py-20"
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
              <Calendar size={21} />
            </div>
            <h2 className="mt-5 font-display text-xl font-semibold tracking-tight sm:text-2xl">
              {searchTerm ? "No matching events" : "New events are on the way"}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-text-secondary">
              {searchTerm
                ? "Try a different title, location, or topic."
                : "We’ll add upcoming workshops and mentorship sessions here as soon as they’re announced."}
            </p>
            {!searchTerm ? (
              <p className="mt-3 text-xs font-medium text-text-muted sm:hidden">
                Pull down anytime to check again.
              </p>
            ) : null}
          </section>
        )}
      </PublicEditorialShell>
    </PullToRefresh>
  );
}
