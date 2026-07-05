import { productApiRequest } from "./productApi";

export type CalendarProvider = "google" | "outlook" | "apple_caldav";

export interface CalendarStatus {
  google: boolean;
  outlook: boolean;
  apple_caldav: boolean;
  configured: { google: boolean; outlook: boolean };
  feedUrl: string | null;
}

export async function fetchCalendarStatus(
  token: string | null,
): Promise<CalendarStatus> {
  return productApiRequest<CalendarStatus>("/calendar/status", token ?? "");
}

export async function fetchConnectUrl(
  provider: "google" | "outlook",
  token: string | null,
): Promise<{ url: string | null; configured: boolean }> {
  return productApiRequest("/calendar/connect/" + provider, token ?? "");
}

export async function ensureFeedUrl(
  token: string | null,
): Promise<{ url: string | null }> {
  return productApiRequest("/calendar/feed", token ?? "", { method: "POST" });
}

export async function connectCaldav(
  body: { username: string; appPassword: string; calendarUrl?: string },
  token: string | null,
): Promise<{ success: boolean }> {
  return productApiRequest("/calendar/caldav/connect", token ?? "", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function disconnectProvider(
  provider: CalendarProvider,
  token: string | null,
): Promise<{ success: boolean }> {
  return productApiRequest("/calendar/disconnect/" + provider, token ?? "", {
    method: "DELETE",
  });
}
