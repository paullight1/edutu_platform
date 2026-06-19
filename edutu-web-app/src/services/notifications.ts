import type { AppNotification } from "../types/notification";
import { getApiBaseUrl } from "../lib/apiBaseUrl";
import { getLocalDevAuthHeaders } from "../lib/localDevAuthHeaders";

interface NotificationRow {
  id: string;
  user_id: string;
  kind: AppNotification["kind"];
  title: string;
  body: string;
  severity: AppNotification["severity"];
  metadata: Record<string, unknown> | null;
  dedupe_key: string | null;
  channel_status: Record<string, unknown> | null;
  created_at: string;
  read_at: string | null;
  createdAt?: string;
  readAt?: string | null;
}

export interface FetchNotificationsParams {
  limit?: number;
  cursor?: string;
  userId?: string;
}

export interface NotificationPreferences {
  pushNotifications: boolean;
  emailNotifications: boolean;
  opportunityAlerts: boolean;
  deadlineReminders: boolean;
  goalReminders: boolean;
  achievementCelebrations: boolean;
  weeklyDigest: boolean;
  marketingEmails: boolean;
  quietHours: {
    start: string;
    end: string;
  };
  updatedAt: string;
}

const mapRowToNotification = (row: NotificationRow): AppNotification => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  body: row.body,
  severity: row.severity,
  metadata: row.metadata ?? undefined,
  dedupeKey: row.dedupe_key ?? undefined,
  createdAt: row.createdAt ?? row.created_at,
  readAt: row.readAt ?? row.read_at,
});

async function apiRequest<T>(
  path: string,
  token?: string | null,
  options: RequestInit = {},
): Promise<T> {
  const apiBaseUrl = getApiBaseUrl("Notifications API");
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...getLocalDevAuthHeaders(),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    let message = `Notifications API request failed with ${response.status}`;
    try {
      const body = await response.json();
      message = body?.message || body?.error || message;
    } catch {
      const text = await response.text();
      if (text) message = text;
    }
    throw new Error(Array.isArray(message) ? message.join(", ") : message);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function fetchNotifications(
  params: FetchNotificationsParams = {},
  token?: string | null,
): Promise<AppNotification[]> {
  const { limit = 20, cursor } = params;
  if (!token) throw new Error("Sign in again to load notifications.");

  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor) query.set("cursor", cursor);
  const data = await apiRequest<NotificationRow[]>(
    `/notifications?${query.toString()}`,
    token,
  );
  return (data ?? []).map(mapRowToNotification);
}

export async function markNotificationRead(
  notificationId: string,
  read = true,
  token?: string | null,
) {
  if (!token) throw new Error("Sign in again to update notifications.");
  await apiRequest(
    `/notifications/${encodeURIComponent(notificationId)}/read`,
    token,
    {
      method: "PATCH",
      body: JSON.stringify({ read }),
    },
  );
}

export async function markAllNotificationsRead(
  userId: string,
  token?: string | null,
) {
  if (!userId) return;
  if (!token) throw new Error("Sign in again to update notifications.");
  await apiRequest("/notifications/read-all", token, { method: "PATCH" });
}

export async function deleteNotification(
  notificationId: string,
  token?: string | null,
) {
  if (!token) throw new Error("Sign in again to delete notifications.");
  await apiRequest(
    `/notifications/${encodeURIComponent(notificationId)}`,
    token,
    {
      method: "DELETE",
    },
  );
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  pushNotifications: true,
  emailNotifications: false,
  opportunityAlerts: true,
  deadlineReminders: true,
  goalReminders: true,
  achievementCelebrations: true,
  weeklyDigest: false,
  marketingEmails: false,
  quietHours: {
    start: "22:00",
    end: "08:00",
  },
  updatedAt: new Date(0).toISOString(),
};

export async function getNotificationPreferences(
  userId: string,
  token?: string | null,
): Promise<NotificationPreferences> {
  if (!userId) return DEFAULT_PREFERENCES;
  if (!token)
    throw new Error("Sign in again to load notification preferences.");

  const data = await apiRequest<any>("/notifications/preferences", token);
  return {
    pushNotifications: Boolean(
      data.pushNotifications ?? data.push_notifications,
    ),
    emailNotifications: Boolean(
      data.emailNotifications ?? data.email_notifications,
    ),
    opportunityAlerts: Boolean(
      data.opportunityAlerts ?? data.opportunity_alerts,
    ),
    deadlineReminders: Boolean(
      data.deadlineReminders ?? data.deadline_reminders,
    ),
    goalReminders: Boolean(data.goalReminders ?? data.goal_reminders),
    achievementCelebrations: Boolean(
      data.achievementCelebrations ?? data.achievement_celebrations,
    ),
    weeklyDigest: Boolean(data.weeklyDigest ?? data.weekly_digest),
    marketingEmails: Boolean(data.marketingEmails ?? data.marketing_emails),
    quietHours: data.quietHours ??
      data.quiet_hours ?? { start: "22:00", end: "08:00" },
    updatedAt: data.updatedAt ?? data.updated_at ?? new Date().toISOString(),
  };
}

export async function saveNotificationPreferences(
  userId: string,
  preferences: NotificationPreferences,
  token?: string | null,
) {
  if (!userId) return;
  if (!token)
    throw new Error("Sign in again to update notification preferences.");
  await apiRequest("/notifications/preferences", token, {
    method: "PATCH",
    body: JSON.stringify(preferences),
  });
}

export interface RegisterPushTokenOptions {
  token: string;
  provider?: string;
  device?: Record<string, unknown>;
}

export async function registerPushToken(
  userId: string,
  options: RegisterPushTokenOptions,
  token?: string | null,
) {
  if (!userId) return;
  if (!token) throw new Error("Sign in again to register push notifications.");
  await apiRequest("/notifications/push-token", token, {
    method: "POST",
    body: JSON.stringify(options),
  });
}

export async function unregisterPushToken(
  userId: string,
  pushToken: string,
  token?: string | null,
) {
  if (!userId) return;
  if (!token) throw new Error("Sign in again to update push notifications.");
  await apiRequest(
    `/notifications/push-token/${encodeURIComponent(pushToken)}`,
    token,
    {
      method: "DELETE",
    },
  );
}
