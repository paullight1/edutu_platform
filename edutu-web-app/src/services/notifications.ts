import { supabase } from '../lib/supabaseClient';
import type { AppNotification, NotificationDraft } from '../types/notification';

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
  createdAt: row.created_at,
  readAt: row.read_at
});

export async function fetchNotifications(params: FetchNotificationsParams = {}): Promise<AppNotification[]> {
  const { limit = 20, cursor } = params;

  let query = supabase
    .from('notifications')
    .select<NotificationRow>('id, user_id, kind, title, body, severity, metadata, dedupe_key, channel_status, created_at, read_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapRowToNotification);
}

export async function markNotificationRead(notificationId: string, read = true) {
  const timestamp = read ? new Date().toISOString() : null;
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: timestamp })
    .eq('id', notificationId);

  if (error) {
    throw error;
  }
}

export async function markAllNotificationsRead(userId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) {
    throw error;
  }
}

export async function deleteNotification(notificationId: string) {
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
    .select<NotificationRow>()
    .single();

  if (error) {
    throw error;
  }

  return mapRowToNotification(data);
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

export async function getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
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

export async function saveNotificationPreferences(userId: string, preferences: NotificationPreferences) {
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

export async function registerPushToken(userId: string, options: RegisterPushTokenOptions) {
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
