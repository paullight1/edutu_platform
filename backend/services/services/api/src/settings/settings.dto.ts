import { z } from "zod";

const PlatformSettingsSchema = z.object({
  siteName: z.string().trim().min(1).max(120),
  supportEmail: z.string().trim().email(),
  maintenanceMode: z.boolean(),
  allowRegistrations: z.boolean(),
  requireApproval: z.boolean(),
});

const ContentSettingsSchema = z.object({
  autoModerate: z.boolean(),
  requireCreatorApproval: z.boolean(),
  maxUploadSize: z.number().int().min(1).max(100),
  allowedFileTypes: z.array(z.string().trim().min(1).max(20)).max(20),
});

const NotificationSettingsSchema = z.object({
  adminEmail: z.string().trim().email(),
  notifyNewUsers: z.boolean(),
  notifyNewOpportunities: z.boolean(),
  notifyReports: z.boolean(),
  dailyDigest: z.boolean(),
});

const SecuritySettingsSchema = z.object({
  maxLoginAttempts: z.number().int().min(3).max(10),
  passwordMinLength: z.number().int().min(6).max(128),
  requireStrongPassword: z.boolean(),
  sessionDuration: z.number().int().min(1).max(168),
});

const ApiSettingsSchema = z.object({
  apiKey: z.string().trim().min(1).max(120),
  webhookUrl: z.string().trim().url(),
  rateLimitPerMinute: z.number().int().min(10).max(1000),
});

export const AdminSettingsSchema = z.object({
  platform: PlatformSettingsSchema,
  content: ContentSettingsSchema,
  notifications: NotificationSettingsSchema,
  security: SecuritySettingsSchema,
  api: ApiSettingsSchema,
});

export type AdminSettingsDto = z.infer<typeof AdminSettingsSchema>;

export interface AdminSettingsResponse {
  success: boolean;
  source: "database" | "fallback";
  settings: AdminSettingsDto;
  error?: string;
}

export const DEFAULT_ADMIN_SETTINGS: AdminSettingsDto = {
  platform: {
    siteName: "Edutu",
    supportEmail: "support@edutu.org",
    maintenanceMode: false,
    allowRegistrations: true,
    requireApproval: false,
  },
  content: {
    autoModerate: true,
    requireCreatorApproval: true,
    maxUploadSize: 10,
    allowedFileTypes: ["jpg", "jpeg", "png", "pdf"],
  },
  notifications: {
    adminEmail: "admin@edutu.org",
    notifyNewUsers: true,
    notifyNewOpportunities: false,
    notifyReports: true,
    dailyDigest: true,
  },
  security: {
    maxLoginAttempts: 5,
    passwordMinLength: 8,
    requireStrongPassword: true,
    sessionDuration: 24,
  },
  api: {
    apiKey: "Managed on the server",
    webhookUrl: "https://api.edutu.org/webhooks",
    rateLimitPerMinute: 100,
  },
};

export function mergeAdminSettings(value: unknown): AdminSettingsDto {
  const partial =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<AdminSettingsDto>)
      : {};

  return AdminSettingsSchema.parse({
    platform: {
      ...DEFAULT_ADMIN_SETTINGS.platform,
      ...(partial.platform ?? {}),
    },
    content: {
      ...DEFAULT_ADMIN_SETTINGS.content,
      ...(partial.content ?? {}),
    },
    notifications: {
      ...DEFAULT_ADMIN_SETTINGS.notifications,
      ...(partial.notifications ?? {}),
    },
    security: {
      ...DEFAULT_ADMIN_SETTINGS.security,
      ...(partial.security ?? {}),
    },
    api: {
      ...DEFAULT_ADMIN_SETTINGS.api,
      ...(partial.api ?? {}),
    },
  });
}
