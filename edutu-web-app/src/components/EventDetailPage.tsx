import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock3,
  ExternalLink,
  MapPin,
} from "lucide-react";
import ImageWithFallback from "./ImageWithFallback";
import PublicEditorialShell from "./PublicEditorialShell";
import Seo from "./Seo";
import { useToast } from "./ui/ToastProvider";
import { getDefaultSeoImage, toAbsoluteUrl } from "../lib/publicSite";
import { getEvent, joinEvent } from "../services/events";
import type { EdutuEvent } from "../types/event";

const eventFallbackImage =
  "https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg";

function formatDate(value?: string | null): string {
  if (!value) return "Date coming soon";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date coming soon";

  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(value?: string | null): string {
  if (!value) return "Time coming soon";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time coming soon";

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function compactDescription(event: EdutuEvent): string {
  return (
    event.summary ||
    event.description ||
    "Join this Edutu event for practical guidance, announcements, and student support."
  )
    .replace(/\s+/g, " ")
    .slice(0, 155);
}

export default function EventDetailPage() {
  const { slugOrId } = useParams<{ slugOrId: string }>();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const [event, setEvent] = useState<EdutuEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadEvent() {
      if (!slugOrId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      const data = await getEvent(slugOrId);
      if (mounted) {
        setEvent(data);
        setLoading(false);
      }
    }

    void loadEvent();
    return () => {
      mounted = false;
    };
  }, [slugOrId]);

  const seoDescription = event ? compactDescription(event) : "Edutu event";
  const eventPath = event ? `/events/${event.slug}` : "/events";
  const jsonLd = useMemo(() => {
    if (!event) return undefined;

    return [
      {
        "@context": "https://schema.org",
        "@type": "Event",
        name: event.title,
        description: seoDescription,
        url: toAbsoluteUrl(eventPath),
        image: [toAbsoluteUrl(event.imageUrl || getDefaultSeoImage())],
        startDate: event.startsAt,
        endDate: event.endsAt || undefined,
        eventAttendanceMode: event.isOnline
          ? "https://schema.org/OnlineEventAttendanceMode"
          : "https://schema.org/OfflineEventAttendanceMode",
        eventStatus: "https://schema.org/EventScheduled",
        location: event.isOnline
          ? {
              "@type": "VirtualLocation",
              url: event.ctaUrl || toAbsoluteUrl(eventPath),
            }
          : {
              "@type": "Place",
              name: event.location || "Edutu event location",
            },
        organizer: {
          "@type": "Organization",
          name: "Edutu",
          url: toAbsoluteUrl("/opportunities"),
        },
        offers: event.ctaUrl
          ? {
              "@type": "Offer",
              url: event.ctaUrl,
              availability: "https://schema.org/InStock",
              price: "0",
              priceCurrency: "USD",
            }
          : undefined,
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
          {
            "@type": "ListItem",
            position: 2,
            name: event.title,
            item: toAbsoluteUrl(eventPath),
          },
        ],
      },
    ];
  }, [event, eventPath, seoDescription]);

  const handleJoin = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    if (!event) return;

    setJoining(true);
    try {
      const result = await joinEvent(event.slug, {
        name: name.trim() || undefined,
        email: email.trim() || undefined,
      });
      success("Event saved");

      const redirectUrl = result.ctaUrl || event.ctaUrl;
      if (redirectUrl) {
        window.open(redirectUrl, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not join event");
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <PublicEditorialShell mainClassName="max-w-5xl py-6">
        <div className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="h-[420px] animate-pulse rounded-lg bg-slate-200 dark:bg-white/5" />
          <div className="h-[320px] animate-pulse rounded-lg bg-slate-200 dark:bg-white/5" />
        </div>
      </PublicEditorialShell>
    );
  }

  if (!event) {
    return (
      <PublicEditorialShell mainClassName="max-w-3xl py-10">
        <Seo
          title="Event not found | Edutu"
          description="This Edutu event could not be found."
          path="/events"
          noindex
        />
        <section className="rounded-lg border border-slate-200 bg-white p-8 text-center dark:border-white/10 dark:bg-slate-950">
          <h1 className="text-2xl font-semibold">Event not found</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
            This event may have been archived or unpublished.
          </p>
          <button
            type="button"
            onClick={() => navigate("/events")}
            className="mt-5 inline-flex items-center gap-2 rounded-md bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            Back to events
          </button>
        </section>
      </PublicEditorialShell>
    );
  }

  return (
    <>
      <Seo
        title={`${event.title} | Edutu events`}
        description={seoDescription}
        path={eventPath}
        image={event.imageUrl || getDefaultSeoImage()}
        jsonLd={jsonLd}
      />
      <PublicEditorialShell mainClassName="max-w-6xl py-5 sm:py-6">
        <Link
          to="/events"
          className="inline-flex items-center gap-2 rounded-md px-2 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <ArrowLeft size={16} />
          Events
        </Link>

        <div className="mt-4 grid gap-5 lg:grid-cols-[1.35fr_0.65fr] lg:items-start">
          <article className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-950">
            <div className="aspect-[16/9] overflow-hidden bg-slate-100 dark:bg-slate-900">
              <ImageWithFallback
                src={event.imageUrl || eventFallbackImage}
                alt={`${event.title} event cover`}
                className="h-full w-full object-cover"
                fallbackClassName="flex h-full w-full items-center justify-center"
              />
            </div>
            <div className="p-5 sm:p-6">
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-md border border-brand-500/20 bg-brand-500/10 px-2 py-1 text-brand-700 dark:text-brand-300">
                  {event.isOnline ? "Online" : "In person"}
                </span>
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                  {event.audience || "Public"}
                </span>
              </div>
              <h1 className="mt-4 text-3xl font-semibold leading-tight sm:text-4xl">
                {event.title}
              </h1>
              <p className="mt-4 text-base leading-8 text-slate-600 dark:text-slate-300">
                {event.description || event.summary || seoDescription}
              </p>
            </div>
          </article>

          <aside className="rounded-lg border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-950">
            <h2 className="text-lg font-semibold">Event details</h2>
            <dl className="mt-4 grid gap-4 text-sm">
              <div className="flex gap-3">
                <Calendar
                  size={18}
                  className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-300"
                />
                <div>
                  <dt className="font-semibold text-slate-500 dark:text-slate-400">
                    Date
                  </dt>
                  <dd className="mt-1 text-slate-950 dark:text-white">
                    {formatDate(event.startsAt)}
                  </dd>
                </div>
              </div>
              <div className="flex gap-3">
                <Clock3
                  size={18}
                  className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-300"
                />
                <div>
                  <dt className="font-semibold text-slate-500 dark:text-slate-400">
                    Time
                  </dt>
                  <dd className="mt-1 text-slate-950 dark:text-white">
                    {formatTime(event.startsAt)}
                    {event.timezone ? ` ${event.timezone}` : ""}
                  </dd>
                </div>
              </div>
              <div className="flex gap-3">
                <MapPin
                  size={18}
                  className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-300"
                />
                <div>
                  <dt className="font-semibold text-slate-500 dark:text-slate-400">
                    Location
                  </dt>
                  <dd className="mt-1 text-slate-950 dark:text-white">
                    {event.location ||
                      (event.isOnline ? "Online" : "Location TBA")}
                  </dd>
                </div>
              </div>
            </dl>

            <form
              onSubmit={handleJoin}
              className="mt-5 border-t border-slate-200 pt-5 dark:border-white/10"
            >
              <div className="grid gap-3">
                <label className="grid gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Name
                  <input
                    value={name}
                    onChange={(inputEvent) => setName(inputEvent.target.value)}
                    placeholder="Optional"
                    className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm font-normal text-slate-950 placeholder:text-slate-400 focus:border-brand-500 dark:border-white/10 dark:bg-slate-950 dark:text-white"
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Email
                  <input
                    value={email}
                    onChange={(inputEvent) => setEmail(inputEvent.target.value)}
                    type="email"
                    placeholder="Optional"
                    className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm font-normal text-slate-950 placeholder:text-slate-400 focus:border-brand-500 dark:border-white/10 dark:bg-slate-950 dark:text-white"
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={joining}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-70 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
              >
                {joining ? (
                  "Joining"
                ) : (
                  <>
                    {event.ctaLabel || "Join event"}
                    {event.ctaUrl ? (
                      <ExternalLink size={15} />
                    ) : (
                      <CheckCircle2 size={15} />
                    )}
                  </>
                )}
              </button>
            </form>
          </aside>
        </div>
      </PublicEditorialShell>
    </>
  );
}
