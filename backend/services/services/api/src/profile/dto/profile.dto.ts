import { z } from "zod";

const nullableTrimmedString = z
  .string()
  .trim()
  .min(1)
  .nullable()
  .optional();

export const UpdateProfileSchema = z
  .object({
    fullName: nullableTrimmedString,
    email: z.string().trim().email().nullable().optional(),
    country: nullableTrimmedString,
    skills: z.array(z.string().trim().min(1)).max(100).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one profile field is required",
  });

export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;

export const ProfileNotificationPreferencesSchema = z
  .object({
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
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one notification preference is required",
  });

export type ProfileNotificationPreferencesDto = z.infer<
  typeof ProfileNotificationPreferencesSchema
>;

