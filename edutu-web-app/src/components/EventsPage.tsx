import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Calendar,
  Clock3,
  MapPin,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import ImageWithFallback from "./ImageWithFallback";
import PublicEditorialShell from "./PublicEditorialShell";
import Seo from "./Seo";
import { getDefaultSeoImage, toAbsoluteUrl } from "../lib/publicSite";
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
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-layer shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-elevated hover:border-brand-500/30">
      <Link
        to={`/events/${event.slug}`}
        className="block text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
      >
        <div className="relative aspect-[16/9] overflow-hidden bg-slate-100 dark:bg-slate-900">
          <ImageWithFallback
            src={event.imageUrl || eventFallbackImage}
            alt={`${event.title} event cover`}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            fallbackClassName="flex h-full w-full items-center justify-center"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent" />
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-md border border-brand-500/20 bg-brand-500/10 px-2 py-1 text-brand-700 dark:text-brand-300">
            {event.isOnline ? "Online" : "In person"}
          </span>
          <span className="rounded-md border border-border-subtle bg-surface-elevated px-2 py-1 text-soft">
            {event.audience || "Public"}
          </span>
        </div>

        <Link
          to={`/events/${event.slug}`}
          className="mt-3 text-strong hover:text-brand-600"
        >
          <h2 className="text-lg font-semibold leading-snug">{event.title}</h2>
        </Link>

        <p className="mt-2 line-clamp-2 text-sm leading-6 text-soft">
          {summary}
        </p>

        <div className="mt-4 grid gap-2 text-sm text-muted">
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

        <div className="mt-5 flex items-center justify-end border-t border-border-subtle pt-4">
          <Link
            to={`/events/${event.slug}`}
            className="inline-flex items-center gap-1 rounded-full px-5 py-3 text-sm font-semibold bg-surface-layer border border-border-subtle hover:border-brand-500/30 transition-all duration-300"
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
    <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-layer animate-pulse">
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
  const [events, setEvents] = useState<EdutuEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const loadEvents = async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchEvents({ signal, limit: 100 });
      setEvents(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Could not load events");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void loadEvents(controller.signal);
    return () => controller.abort();
  }, []);

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
    <>
      <Seo
        title="Edutu events | Scholarships, mentorship and application support"
        description={seoDescription}
        path="/events"
        image={getDefaultSeoImage()}
        jsonLd={seoJsonLd}
      />
      <PublicEditorialShell mainClassName="max-w-7xl py-5 sm:py-6">
        <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">
              Events
            </p>
            <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">
              Upcoming Edutu events
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-soft">
              Join workshops, mentorship sessions, and live announcements from
              the Edutu team.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadEvents()}
            disabled={loading}
            className="inline-flex items-center gap-2 self-start rounded-full px-5 py-3 text-sm font-semibold bg-surface-layer border border-border-subtle hover:border-brand-500/30 disabled:cursor-not-allowed disabled:opacity-60 transition-all duration-300"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </section>

        <section className="rounded-2xl border border-border-subtle bg-surface-layer p-4">
          <div className="relative">
            <Search
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="text"
              aria-label="Search events"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by title, location, or topic"
              className="h-11 w-full rounded-xl border border-border-subtle bg-surface-elevated/60 pl-11 pr-11 text-sm text-strong placeholder:text-muted focus:border-brand-500 focus:bg-surface-layer"
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted transition-all duration-300 hover:text-strong"
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            ) : null}
          </div>
        </section>

        {error ? (
          <section className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-5 text-rose-900 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-100">
            <h2 className="text-lg font-semibold">Unable to load events</h2>
            <p className="mt-2 text-sm leading-6 text-rose-800/80 dark:text-rose-100/80">
              {error}
            </p>
          </section>
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
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              >
                <EventCard event={event} />
              </motion.div>
            ))}
          </section>
        ) : (
          <section className="mt-6 rounded-2xl border border-border-subtle bg-surface-layer p-10 text-center">
            <h2 className="text-2xl font-semibold">No events found</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-soft">
              Check back soon or clear your search to see all announced events.
            </p>
          </section>
        )}
      </PublicEditorialShell>
    </>
  );
}
