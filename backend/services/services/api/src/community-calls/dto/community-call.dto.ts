import { z } from "zod";

const title = z.string().trim().min(1).max(120);
const scheduledFor = z.string().datetime({ offset: true });
const durationMinutes = z.number().int().min(5).max(480);

export const ScheduleCommunityCallSchema = z.object({
  title,
  scheduledFor,
  durationMinutes,
});

export const UpdateCommunityCallSchema = z
  .object({
    title: title.optional(),
    scheduledFor: scheduledFor.optional(),
    durationMinutes: durationMinutes.optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "Provide at least one field to update.",
  });

export const DeclineCommunityCallSchema = z.object({
  reason: z.string().trim().max(160).optional(),
});

export const CommunityCallListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(25),
  before: z.string().datetime({ offset: true }).optional(),
});

export const IdempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

export type ScheduleCommunityCallDto = z.infer<
  typeof ScheduleCommunityCallSchema
>;
export type UpdateCommunityCallDto = z.infer<typeof UpdateCommunityCallSchema>;
export type DeclineCommunityCallDto = z.infer<
  typeof DeclineCommunityCallSchema
>;
export type CommunityCallListQueryDto = z.infer<
  typeof CommunityCallListQuerySchema
>;
