import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
    <article className="group flex h-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-soft dark:border-white/10 dark:bg-slate-950">
      <Link
        to={`/events/${event.slug}`}
        className="block text-slate-950 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:text-white dark:hover:text-white"
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
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
            {event.audience || "Public"}
          </span>
        </div>

        <Link
          to={`/events/${event.slug}`}
          className="mt-3 text-slate-950 hover:text-brand-600 dark:text-white dark:hover:text-brand-300"
        >
          <h2 className="text-lg font-semibold leading-snug">{event.title}</h2>
        </Link>

        <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
          {summary}
        </p>

        <div className="mt-4 grid gap-2 text-sm text-slate-500 dark:text-slate-400">
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

        <div className="mt-5 flex items-center justify-end border-t border-slate-200 pt-4 dark:border-white/10">
          <Link
            to={`/events/${event.slug}`}
            className="inline-flex items-center gap-1 rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
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
    <div className="h-[330px] animate-pulse rounded-lg bg-slate-200 dark:bg-white/5" />
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
            <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">
              Join workshops, mentorship sessions, and live announcements from
              the Edutu team.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadEvents()}
            disabled={loading}
            className="inline-flex items-center gap-2 self-start rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-brand-300 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:text-white"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </section>

        <section className="mt-5 rounded-lg border border-slate-200 bg-white/92 p-3 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/92">
          <div className="relative">
            <Search
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              aria-label="Search events"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by title, location, or topic"
              className="h-11 w-full rounded-md border border-slate-200 bg-white pl-11 pr-11 text-sm text-slate-950 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white dark:border-white/10 dark:bg-slate-950 dark:text-white dark:focus:bg-slate-950"
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-slate-400 transition hover:text-slate-700 dark:hover:text-white"
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
          <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <LoadingCard key={index} />
            ))}
          </section>
        ) : filteredEvents.length > 0 ? (
          <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </section>
        ) : (
          <section className="mt-5 rounded-lg border border-slate-200 bg-white p-8 text-center dark:border-white/10 dark:bg-slate-950">
            <h2 className="text-2xl font-semibold">No events found</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              Check back soon or clear your search to see all announced events.
            </p>
          </section>
        )}
      </PublicEditorialShell>
    </>
  );
}
