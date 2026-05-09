export type NotificationKind =
  | 'goal-reminder'
  | 'goal-weekly-digest'
  | 'goal-progress'
  | 'opportunity-highlight'
  | 'admin-broadcast'
  | 'system';

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'critical';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  severity: NotificationSeverity;
  metadata?: Record<string, unknown>;
  dedupeKey?: string;
}

export interface NotificationDraft {
  kind: NotificationKind;
  title: string;
  body: string;
  severity?: NotificationSeverity;
  metadata?: Record<string, unknown>;
  dedupeKey?: string;
}

export interface GoalReminderPreference {
  goalId: string;
  daily: boolean;
  weekly: boolean;
  lastDailySentAt?: string | null;
  lastWeeklySentAt?: string | null;
}

export type ReminderPreferenceMap = Record<string, GoalReminderPreference>;

export interface OpportunityDigestState {
  seenOpportunityIds: string[];
  lastDigestAt: string | null;
}

export type PushPermissionState = 'unsupported' | NotificationPermission;

