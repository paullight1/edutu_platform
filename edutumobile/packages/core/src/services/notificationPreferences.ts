/**
 * Server-side notification preferences (`/notifications/preferences`).
 *
 * These are the switches the backend actually enforces when it decides whether
 * to push: the master toggle, the per-topic toggles, and the quiet-hours
 * window. Anything device-local (haptics, reduce motion) is NOT here — it stays
 * in AsyncStorage, because it describes this phone rather than the account.
 *
 * Unlike `requestProductApi`, every call here THROWS on failure instead of
 * resolving to null. A settings toggle that silently fails to save is worse
 * than one that reports the error: the UI needs to revert and say so.
 */

import { getApiBaseUrl, type GetAuthToken } from './productApi';

const TIMEOUT_MS = 12000;

export interface QuietHoursWindow {
  /** "HH:MM", 24h. */
  start: string;
  /** "HH:MM", 24h. */
  end: string;
}

export interface NotificationPreferences {
  pushNotifications: boolean;
  emailNotifications: boolean;
  opportunityAlerts: boolean;
  deadlineReminders: boolean;
  goalReminders: boolean;
  achievementCelebrations: boolean;
  quietHours: QuietHoursWindow;
}

export type NotificationPreferencesInput = Partial<NotificationPreferences>;

/**
 * The stored window has no separate "enabled" flag, so a zero-length window is
 * how "off" is represented — the backend's `deferForQuietHours` treats
 * `start === end` as no window. Keep this in sync with
 * `backend/.../src/common/quiet-hours.ts`.
 */
export const QUIET_HOURS_OFF: QuietHoursWindow = { start: '00:00', end: '00:00' };

/** Matches the `notification_preferences` column defaults. */
export const DEFAULT_QUIET_HOURS: QuietHoursWindow = { start: '22:00', end: '08:00' };

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  pushNotifications: true,
  emailNotifications: false,
  opportunityAlerts: true,
  deadlineReminders: true,
  goalReminders: true,
  achievementCelebrations: true,
  quietHours: DEFAULT_QUIET_HOURS,
};

export function isQuietHoursEnabled(window: QuietHoursWindow | null | undefined): boolean {
  return Boolean(window && window.start !== window.end);
}

export class NotificationPreferencesError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'NotificationPreferencesError';
    this.status = status;
  }
}

function normalize(raw: Record<string, unknown> | null): NotificationPreferences {
  const quiet = raw?.quietHours as Partial<QuietHoursWindow> | null | undefined;
  const bool = (value: unknown, fallback: boolean) =>
    typeof value === 'boolean' ? value : fallback;

  return {
    pushNotifications: bool(raw?.pushNotifications, DEFAULT_NOTIFICATION_PREFERENCES.pushNotifications),
    emailNotifications: bool(raw?.emailNotifications, DEFAULT_NOTIFICATION_PREFERENCES.emailNotifications),
    opportunityAlerts: bool(raw?.opportunityAlerts, DEFAULT_NOTIFICATION_PREFERENCES.opportunityAlerts),
    deadlineReminders: bool(raw?.deadlineReminders, DEFAULT_NOTIFICATION_PREFERENCES.deadlineReminders),
    goalReminders: bool(raw?.goalReminders, DEFAULT_NOTIFICATION_PREFERENCES.goalReminders),
    achievementCelebrations: bool(
      raw?.achievementCelebrations,
      DEFAULT_NOTIFICATION_PREFERENCES.achievementCelebrations,
    ),
    quietHours:
      quiet && typeof quiet.start === 'string' && typeof quiet.end === 'string'
        ? { start: quiet.start, end: quiet.end }
        : DEFAULT_QUIET_HOURS,
  };
}

async function request<T>(path: string, options: RequestInit, getAuthToken: GetAuthToken): Promise<T> {
  const token = await getAuthToken();
  if (!token) throw new NotificationPreferencesError('Not signed in', 401);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
  } catch (error) {
    throw new NotificationPreferencesError(
      (error as Error)?.name === 'AbortError' ? 'Request timed out' : 'Network unavailable',
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new NotificationPreferencesError(
      `Request failed with ${response.status}`,
      response.status,
    );
  }
  if (response.status === 204) return {} as T;
  return (await response.json().catch(() => ({}))) as T;
}

export async function getNotificationPreferences(
  getAuthToken: GetAuthToken,
): Promise<NotificationPreferences> {
  const raw = await request<Record<string, unknown>>(
    '/notifications/preferences',
    { method: 'GET' },
    getAuthToken,
  );
  return normalize(raw);
}

export async function saveNotificationPreferences(
  getAuthToken: GetAuthToken,
  patch: NotificationPreferencesInput,
): Promise<NotificationPreferences> {
  const raw = await request<Record<string, unknown>>(
    '/notifications/preferences',
    { method: 'PATCH', body: JSON.stringify(patch) },
    getAuthToken,
  );
  return normalize(raw);
}

/**
 * Drops this device's push token server-side. Called when the user turns push
 * off, so the account stops receiving pushes on THIS device even if another
 * device keeps them on — the master preference alone can't express that.
 */
export async function unregisterPushToken(
  getAuthToken: GetAuthToken,
  token: string,
): Promise<void> {
  await request<unknown>(
    `/notifications/push-token/${encodeURIComponent(token)}`,
    { method: 'DELETE' },
    getAuthToken,
  );
}
