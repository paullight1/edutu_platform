import { productApiRequest } from "./productApi";

export interface CalendarConnectResponse {
  url: string | null;
  configured: boolean;
}

export interface CalendarStatus {
  connected: boolean;
}

export async function fetchCalendarConnectUrl(
  token: string | null,
): Promise<CalendarConnectResponse> {
  return productApiRequest<CalendarConnectResponse>(
    "/calendar/google/connect",
    token ?? "",
  );
}

export async function fetchCalendarStatus(
  token: string | null,
): Promise<CalendarStatus> {
  return productApiRequest<CalendarStatus>(
    "/calendar/google/status",
    token ?? "",
  );
}

export async function disconnectCalendar(
  token: string | null,
): Promise<{ success: boolean }> {
  return productApiRequest<{ success: boolean }>(
    "/calendar/google/disconnect",
    token ?? "",
    { method: "DELETE" },
  );
}
