import { z } from "zod";

const optionalTrimmed = (max: number) =>
  z.string().trim().min(1).max(max).optional();

export const OpportunityCatalogQuerySchema = z.object({
  q: optionalTrimmed(200),
  category: optionalTrimmed(100),
  funding: optionalTrimmed(100),
  location: optionalTrimmed(120),
  deadlineAfter: z.coerce.date().optional(),
  deadlineBefore: z.coerce.date().optional(),
  sort: z.enum(["newest", "deadline"]).default("newest"),
  limit: z.coerce.number().int().min(1).max(60).default(20),
  cursor: z.string().trim().max(512).optional(),
});

export type OpportunityCatalogQueryDto = z.infer<
  typeof OpportunityCatalogQuerySchema
>;
