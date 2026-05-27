import { z } from "zod";

export type NotificationKind =
  | "goal-reminder"
  | "goal-weekly-digest"
  | "goal-progress"
  | "opportunity-highlight"
  | "admin-broadcast"
  | "system";

export type NotificationSeverity = "info" | "success" | "warning" | "critical";

export interface BroadcastNotificationDto {
  title: string;
  body: string;
  kind?: NotificationKind;
  severity?: NotificationSeverity;
  metadata?: Record<string, unknown>;
  dedupeKey?: string;
  audience?: "all" | "specific" | "creators" | "approved_creators";
  targetUserIds?: string[];
  channels?: {
    inApp?: boolean;
    push?: boolean;
    email?: boolean;
  };
  scheduledFor?: string;
}

export interface RegisterPushTokenDto {
  token: string;
  provider?: "expo" | "web-push" | "fcm" | string;
  device?: Record<string, unknown>;
}

export interface NotificationPreferencesDto {
  pushNotifications?: boolean;
  emailNotifications?: boolean;
  opportunityAlerts?: boolean;
  deadlineReminders?: boolean;
  goalReminders?: boolean;
  achievementCelebrations?: boolean;
  weeklyDigest?: boolean;
  marketingEmails?: boolean;
  quietHours?: {
    start: string;
    end: string;
  };
}

export const NotificationPreferencesSchema = z.object({
  pushNotifications: z.boolean().optional(),
  emailNotifications: z.boolean().optional(),
  opportunityAlerts: z.boolean().optional(),
  deadlineReminders: z.boolean().optional(),
  goalReminders: z.boolean().optional(),
  achievementCelebrations: z.boolean().optional(),
  weeklyDigest: z.boolean().optional(),
  marketingEmails: z.boolean().optional(),
  quietHours: z
    .object({
      start: z.string().regex(/^\d{2}:\d{2}$/),
      end: z.string().regex(/^\d{2}:\d{2}$/),
    })
    .optional(),
});

export const RegisterPushTokenSchema = z.object({
  token: z.string().trim().min(1).max(2048),
  provider: z.string().trim().min(1).max(50).optional(),
  device: z.record(z.string(), z.unknown()).optional(),
});

export const BroadcastNotificationSchema = z.object({
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(4000),
  kind: z
    .enum([
      "goal-reminder",
      "goal-weekly-digest",
      "goal-progress",
      "opportunity-highlight",
      "admin-broadcast",
      "system",
    ])
    .optional(),
  severity: z.enum(["info", "success", "warning", "critical"]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  dedupeKey: z.string().trim().max(200).optional(),
  audience: z
    .enum(["all", "specific", "creators", "approved_creators"])
    .optional(),
  targetUserIds: z.array(z.string().min(1)).max(1000).optional(),
  channels: z
    .object({
      inApp: z.boolean().optional(),
      push: z.boolean().optional(),
      email: z.boolean().optional(),
    })
    .optional(),
  scheduledFor: z.string().datetime().optional(),
});
