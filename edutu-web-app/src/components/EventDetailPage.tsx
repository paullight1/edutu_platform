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
          <div className="overflow-hidden rounded-2xl border border-subtle bg-surface-layer animate-pulse">
            <div className="aspect-[16/9] bg-surface-elevated" />
            <div className="space-y-3 p-5 sm:p-6">
              <div className="h-5 w-20 rounded-md bg-surface-elevated" />
              <div className="h-8 w-3/4 rounded bg-surface-elevated" />
              <div className="space-y-2">
                <div className="h-4 w-full rounded bg-surface-elevated" />
                <div className="h-4 w-2/3 rounded bg-surface-elevated" />
              </div>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-subtle bg-surface-layer animate-pulse">
            <div className="space-y-3 p-5">
              <div className="h-6 w-1/2 rounded bg-surface-elevated" />
              <div className="space-y-3">
                <div className="h-12 w-full rounded bg-surface-elevated" />
                <div className="h-12 w-full rounded bg-surface-elevated" />
                <div className="h-12 w-full rounded bg-surface-elevated" />
              </div>
              <div className="h-px w-full bg-surface-elevated" />
              <div className="space-y-2">
                <div className="h-10 w-full rounded bg-surface-elevated" />
                <div className="h-10 w-full rounded bg-surface-elevated" />
              </div>
              <div className="h-11 w-full rounded-full bg-surface-elevated" />
            </div>
          </div>
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
        <section className="rounded-2xl border border-subtle bg-surface-layer p-10 text-center">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Event not found
          </h1>
          <p className="mt-3 text-sm leading-6 text-text-secondary">
            This event may have been archived or unpublished.
          </p>
          <button
            type="button"
            onClick={() => navigate("/events")}
            className="mt-5 inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold bg-surface-layer border border-subtle hover:border-brand/40 transition-all duration-300"
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
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-text-secondary hover:bg-surface-elevated hover:text-text-primary transition-all duration-300"
        >
          <ArrowLeft size={16} />
          Events
        </Link>

        <div className="mt-4 grid gap-5 lg:grid-cols-[1.35fr_0.65fr] lg:items-start">
          <article className="overflow-hidden rounded-2xl border border-subtle bg-surface-layer">
            <div className="aspect-[16/9] overflow-hidden bg-surface-elevated">
              <ImageWithFallback
                src={event.imageUrl || eventFallbackImage}
                alt={`${event.title} event cover`}
                className="h-full w-full object-cover"
                fallbackClassName="flex h-full w-full items-center justify-center"
              />
            </div>
            <div className="p-5 sm:p-6">
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-md border border-brand/20 bg-brand/10 px-2 py-1 text-brand">
                  {event.isOnline ? "Online" : "In person"}
                </span>
                <span className="rounded-md border border-subtle bg-surface-elevated px-2 py-1 text-text-secondary">
                  {event.audience || "Public"}
                </span>
              </div>
              <h1 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                {event.title}
              </h1>
              <p className="mt-4 text-base leading-8 text-text-secondary">
                {event.description || event.summary || seoDescription}
              </p>
            </div>
          </article>

          <aside className="rounded-2xl border border-subtle bg-surface-layer p-6">
            <h2 className="font-display text-lg font-semibold tracking-tight">
              Event details
            </h2>
            <dl className="mt-5 grid gap-5 text-sm">
              <div className="flex gap-3">
                <Calendar
                  size={18}
                  className="mt-0.5 shrink-0 text-brand"
                />
                <div>
                    <dt className="font-semibold text-text-muted">
                      Date
                    </dt>
                    <dd className="mt-1 text-text-primary">
                    {formatDate(event.startsAt)}
                  </dd>
                </div>
              </div>
              <div className="flex gap-3">
                <Clock3
                  size={18}
                  className="mt-0.5 shrink-0 text-brand"
                />
                <div>
                  <dt className="font-semibold text-text-muted">
                    Time
                  </dt>
                  <dd className="mt-1 text-text-primary">
                    {formatTime(event.startsAt)}
                    {event.timezone ? ` ${event.timezone}` : ""}
                  </dd>
                </div>
              </div>
              <div className="flex gap-3">
                <MapPin
                  size={18}
                  className="mt-0.5 shrink-0 text-brand"
                />
                <div>
                  <dt className="font-semibold text-text-muted">
                    Location
                  </dt>
                  <dd className="mt-1 text-text-primary">
                    {event.location ||
                      (event.isOnline ? "Online" : "Location TBA")}
                  </dd>
                </div>
              </div>
            </dl>

            <form
              onSubmit={handleJoin}
              className="mt-5 border-t border-subtle pt-5"
            >
              <div className="grid gap-4">
                <label className="grid gap-2 text-sm font-semibold text-text-secondary">
                  Name
                  <input
                    value={name}
                    onChange={(inputEvent) => setName(inputEvent.target.value)}
                    placeholder="Optional"
                    className="h-11 rounded-xl border border-subtle bg-surface-elevated/60 px-4 text-sm font-normal text-text-primary placeholder:text-text-muted focus:border-brand focus:bg-surface-layer"
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-text-secondary">
                  Email
                  <input
                    value={email}
                    onChange={(inputEvent) => setEmail(inputEvent.target.value)}
                    type="email"
                    placeholder="Optional"
                    className="h-11 rounded-xl border border-subtle bg-surface-elevated/60 px-4 text-sm font-normal text-text-primary placeholder:text-text-muted focus:border-brand focus:bg-surface-layer"
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={joining}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white shadow-elevated hover:bg-brand-700 disabled:cursor-wait disabled:opacity-70 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2"
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
