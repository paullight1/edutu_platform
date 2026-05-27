import { supabase } from '../lib/supabaseClient';
import type { AppNotification, NotificationDraft } from '../types/notification';
import { getApiBaseUrl } from '../lib/apiBaseUrl';
import { getLocalDevAuthHeaders } from '../lib/localDevAuthHeaders';

interface NotificationRow {
  id: string;
  user_id: string;
  kind: AppNotification['kind'];
  title: string;
  body: string;
  severity: AppNotification['severity'];
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
  readAt: row.readAt ?? row.read_at
});

async function apiRequest<T>(path: string, token?: string | null, options: RequestInit = {}): Promise<T> {
  const apiBaseUrl = getApiBaseUrl('Notifications API');
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...getLocalDevAuthHeaders(),
      ...(options.headers || {})
    }
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
    throw new Error(Array.isArray(message) ? message.join(', ') : message);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function fetchNotifications(params: FetchNotificationsParams = {}, token?: string | null): Promise<AppNotification[]> {
  const { limit = 20, cursor } = params;
  if (token) {
    const query = new URLSearchParams({ limit: String(limit) });
    if (cursor) query.set('cursor', cursor);
    const data = await apiRequest<NotificationRow[]>(`/notifications?${query.toString()}`, token);
    return (data ?? []).map(mapRowToNotification);
  }

  let query = supabase
    .from('notifications')
    .select('id, user_id, kind, title, body, severity, metadata, dedupe_key, channel_status, created_at, read_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return ((data ?? []) as NotificationRow[]).map(mapRowToNotification);
}

export async function markNotificationRead(notificationId: string, read = true, token?: string | null) {
  if (token) {
    await apiRequest(`/notifications/${encodeURIComponent(notificationId)}/read`, token, {
      method: 'PATCH',
      body: JSON.stringify({ read })
    });
    return;
  }

  const timestamp = read ? new Date().toISOString() : null;
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: timestamp })
    .eq('id', notificationId);

  if (error) {
    throw error;
  }
}

export async function markAllNotificationsRead(userId: string, token?: string | null) {
  if (token) {
    await apiRequest('/notifications/read-all', token, { method: 'PATCH' });
    return;
  }

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) {
    throw error;
  }
}

export async function deleteNotification(notificationId: string, token?: string | null) {
  if (token) {
    await apiRequest(`/notifications/${encodeURIComponent(notificationId)}`, token, {
      method: 'DELETE'
    });
    return;
  }

  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', notificationId);

  if (error) {
    throw error;
  }
}

export async function sendNotification(userId: string, draft: NotificationDraft) {
  const payload = {
    user_id: userId,
    kind: draft.kind,
    title: draft.title,
    body: draft.body,
    severity: draft.severity ?? 'info',
    metadata: draft.metadata ?? {},
    dedupe_key: draft.dedupeKey ?? null
  };

  const { data, error } = await supabase
    .from('notifications')
    .insert(payload)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return mapRowToNotification(data as NotificationRow);
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
    start: '22:00',
    end: '08:00'
  },
  updatedAt: new Date(0).toISOString()
};

export async function getNotificationPreferences(userId: string, token?: string | null): Promise<NotificationPreferences> {
  if (token) {
    const data = await apiRequest<any>('/notifications/preferences', token);
    return {
      pushNotifications: Boolean(data.pushNotifications ?? data.push_notifications),
      emailNotifications: Boolean(data.emailNotifications ?? data.email_notifications),
      opportunityAlerts: Boolean(data.opportunityAlerts ?? data.opportunity_alerts),
      deadlineReminders: Boolean(data.deadlineReminders ?? data.deadline_reminders),
      goalReminders: Boolean(data.goalReminders ?? data.goal_reminders),
      achievementCelebrations: Boolean(data.achievementCelebrations ?? data.achievement_celebrations),
      weeklyDigest: Boolean(data.weeklyDigest ?? data.weekly_digest),
      marketingEmails: Boolean(data.marketingEmails ?? data.marketing_emails),
      quietHours: data.quietHours ?? data.quiet_hours ?? { start: '22:00', end: '08:00' },
      updatedAt: data.updatedAt ?? data.updated_at ?? new Date().toISOString()
    };
  }

  const { data, error } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return DEFAULT_PREFERENCES;
  }

  return {
    pushNotifications: Boolean(data.push_notifications),
    emailNotifications: Boolean(data.email_notifications),
    opportunityAlerts: Boolean(data.opportunity_alerts),
    deadlineReminders: Boolean(data.deadline_reminders),
    goalReminders: Boolean(data.goal_reminders),
    achievementCelebrations: Boolean(data.achievement_celebrations),
    weeklyDigest: Boolean(data.weekly_digest),
    marketingEmails: Boolean(data.marketing_emails),
    quietHours: {
      start: typeof data.quiet_hours?.start === 'string' ? data.quiet_hours.start : '22:00',
      end: typeof data.quiet_hours?.end === 'string' ? data.quiet_hours.end : '08:00'
    },
    updatedAt: data.updated_at ?? new Date().toISOString()
  };
}

export async function saveNotificationPreferences(userId: string, preferences: NotificationPreferences, token?: string | null) {
  if (token) {
    await apiRequest('/notifications/preferences', token, {
      method: 'PATCH',
      body: JSON.stringify(preferences)
    });
    return;
  }

  const payload = {
    user_id: userId,
    push_notifications: preferences.pushNotifications,
    email_notifications: preferences.emailNotifications,
    opportunity_alerts: preferences.opportunityAlerts,
    deadline_reminders: preferences.deadlineReminders,
    goal_reminders: preferences.goalReminders,
    achievement_celebrations: preferences.achievementCelebrations,
    weekly_digest: preferences.weeklyDigest,
    marketing_emails: preferences.marketingEmails,
    quiet_hours: preferences.quietHours,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('notification_preferences')
    .upsert(payload, { onConflict: 'user_id' });

  if (error) {
    throw error;
  }
}

export interface RegisterPushTokenOptions {
  token: string;
  provider?: string;
  device?: Record<string, unknown>;
}

export async function registerPushToken(userId: string, options: RegisterPushTokenOptions, token?: string | null) {
  if (token) {
    await apiRequest('/notifications/push-token', token, {
      method: 'POST',
      body: JSON.stringify(options)
    });
    return;
  }

  const payload = {
    user_id: userId,
    provider: options.provider ?? 'fcm',
    token: options.token,
    device: options.device ?? {},
    last_seen_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('notification_push_tokens')
    .upsert(payload, { onConflict: 'user_id,token' });

  if (error) {
    throw error;
  }
}

export async function unregisterPushToken(userId: string, token: string) {
  const { error } = await supabase
    .from('notification_push_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('token', token);

  if (error) {
    throw error;
  }
}
