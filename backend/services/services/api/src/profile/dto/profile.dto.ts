import { z } from "zod";

const nullableTrimmedString = z.string().trim().min(1).nullable().optional();
const nullableStringArray = z
  .array(z.string().trim().min(1))
  .max(100)
  .nullable()
  .optional();

export const UpdateProfileSchema = z
  .object({
    fullName: nullableTrimmedString,
    email: z.string().trim().email().nullable().optional(),
    country: nullableTrimmedString,
    school: nullableTrimmedString,
    courseOfStudy: nullableTrimmedString,
    major: nullableTrimmedString,
    degree: nullableTrimmedString,
    cgpa: z.number().min(0).max(10).nullable().optional(),
    gradYear: z.number().int().min(1900).max(2200).nullable().optional(),
    dateOfBirth: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    interestedCountries: nullableStringArray,
    interests: nullableStringArray,
    skills: nullableStringArray,
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

export const PrivacySettingsSchema = z
  .object({
    profileVisibility: z.enum(["public", "friends", "private"]).optional(),
    dataSharing: z.boolean().optional(),
    analyticsTracking: z.boolean().optional(),
    personalizedAds: z.boolean().optional(),
    activityStatus: z.boolean().optional(),
    searchVisibility: z.boolean().optional(),
  })
  .strict();

export const SecuritySettingsSchema = z
  .object({
    twoFactorEnabled: z.boolean().optional(),
    lastPasswordUpdate: z.string().datetime().nullable().optional(),
  })
  .strict();

export const UpdateMemberSettingsSchema = z
  .object({
    privacy: PrivacySettingsSchema.optional(),
    security: SecuritySettingsSchema.optional(),
  })
  .strict()
  .refine((value) => Boolean(value.privacy || value.security), {
    message: "At least one settings group is required",
  });

export type UpdateMemberSettingsDto = z.infer<
  typeof UpdateMemberSettingsSchema
>;
