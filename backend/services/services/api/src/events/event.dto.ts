import { z } from "zod";

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value) => value || undefined);

const EventStatusSchema = z
  .enum(["draft", "published", "cancelled", "archived"])
  .optional();

export const CreateEventSchema = z.object({
  title: z.string().trim().min(3),
  slug: optionalTrimmedString,
  summary: optionalTrimmedString,
  description: optionalTrimmedString,
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional().nullable(),
  timezone: z.string().trim().min(1).optional().default("UTC"),
  location: optionalTrimmedString,
  isOnline: z.boolean().optional().default(true),
  ctaLabel: z.string().trim().min(1).optional().default("Join event"),
  ctaUrl: optionalTrimmedString,
  imageUrl: optionalTrimmedString,
  status: EventStatusSchema.default("draft"),
  audience: z.string().trim().min(1).optional().default("public"),
  capacity: z.coerce.number().int().positive().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

export const UpdateEventSchema = CreateEventSchema.partial().extend({
  slug: optionalTrimmedString,
});

export const JoinEventSchema = z.object({
  name: optionalTrimmedString,
  email: z.string().trim().email().optional().nullable(),
  userId: optionalTrimmedString,
  source: z.string().trim().min(1).optional().default("web"),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

export type CreateEventDto = z.infer<typeof CreateEventSchema>;
export type UpdateEventDto = Partial<CreateEventDto>;
export type JoinEventDto = z.infer<typeof JoinEventSchema>;
