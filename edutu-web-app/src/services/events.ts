import { getApiBaseUrl } from "../lib/apiBaseUrl";
import type { EdutuEvent } from "../types/event";

type BackendEventRow = Record<string, any>;

interface FetchEventsOptions {
  signal?: AbortSignal;
  limit?: number;
  offset?: number;
  status?: string;
  search?: string;
}

interface JoinEventInput {
  name?: string;
  email?: string;
  source?: string;
}

let cachedEvents: EdutuEvent[] | null = null;

function pickString(fallback: string, ...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.replace(/\s+/g, " ").trim();
    if (trimmed) return trimmed;
  }

  return fallback;
}

function pickOptionalString(...values: unknown[]): string | null {
  const value = pickString("", ...values);
  return value || null;
}

function extractRows(payload: unknown): BackendEventRow[] {
  if (Array.isArray(payload)) {
    return payload as BackendEventRow[];
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const source = payload as Record<string, unknown>;
  const data = source.data ?? source.events ?? source.items ?? source.results;
  return Array.isArray(data) ? (data as BackendEventRow[]) : [];
}

function normaliseEvent(row: BackendEventRow): EdutuEvent {
  const title = pickString("Edutu event", row.title, row.name);
  const slug = pickString(String(row.id ?? title), row.slug, row.id);
  const startsAt = pickString(
    new Date().toISOString(),
    row.starts_at,
    row.startsAt,
  );

  return {
    id: String(row.id ?? slug),
    title,
    slug,
    summary: pickOptionalString(row.summary, row.excerpt),
    description: pickOptionalString(row.description, row.content),
    startsAt,
    endsAt: pickOptionalString(row.ends_at, row.endsAt),
    timezone: pickOptionalString(row.timezone),
    location: pickOptionalString(row.location),
    isOnline: row.is_online ?? row.isOnline ?? true,
    ctaLabel: pickOptionalString(row.cta_label, row.ctaLabel) || "Join event",
    ctaUrl: pickOptionalString(row.cta_url, row.ctaUrl),
    imageUrl: pickOptionalString(row.image_url, row.imageUrl),
    status: pickOptionalString(row.status),
    audience: pickOptionalString(row.audience),
    capacity:
      row.capacity === null || row.capacity === undefined
        ? null
        : Number(row.capacity),
    createdAt: pickOptionalString(row.created_at, row.createdAt),
    updatedAt: pickOptionalString(row.updated_at, row.updatedAt),
  };
}

function buildBackendUrl(path: string, params?: URLSearchParams): string {
  const apiBaseUrl = getApiBaseUrl("Events API");
  const query = params && params.toString() ? `?${params.toString()}` : "";
  return `${apiBaseUrl}${path}${query}`;
}

export async function fetchEvents(
  options: FetchEventsOptions = {},
): Promise<EdutuEvent[]> {
  const params = new URLSearchParams();
  params.set(
    "limit",
    String(Math.min(Math.max(Number(options.limit) || 100, 1), 100)),
  );
  params.set("status", options.status || "published");

  if (options.offset) {
    params.set("offset", String(Math.max(Math.floor(options.offset), 0)));
  }

  if (options.search?.trim()) {
    params.set("search", options.search.trim());
  }

  const response = await fetch(buildBackendUrl("/events", params), {
    method: "GET",
    signal: options.signal,
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Events request failed with ${response.status}`);
  }

  const events = extractRows(await response.json()).map(normaliseEvent);
  cachedEvents = events;
  return events;
}

export async function getEvent(slugOrId: string): Promise<EdutuEvent | null> {
  const cached = cachedEvents?.find(
    (event) => event.slug === slugOrId || event.id === slugOrId,
  );
  if (cached) return cached;

  const response = await fetch(
    buildBackendUrl(`/events/${encodeURIComponent(slugOrId)}`),
    {
      method: "GET",
      headers: { Accept: "application/json" },
    },
  );

  if (!response.ok) {
    return null;
  }

  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const event = normaliseEvent(payload as BackendEventRow);
  cachedEvents = cachedEvents
    ? cachedEvents.map((item) => (item.id === event.id ? event : item))
    : [event];
  return event;
}

export async function joinEvent(slugOrId: string, input: JoinEventInput = {}) {
  const response = await fetch(
    buildBackendUrl(`/events/${encodeURIComponent(slugOrId)}/join`),
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...input,
        source: input.source || "public-event-page",
      }),
    },
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || "Could not join this event");
  }

  return payload as { success: boolean; ctaUrl?: string | null };
}
