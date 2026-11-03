import { z } from "zod";
import { ApplicationStatusSchema } from "./me.dto";

export const ApplicationListQuerySchema = z
  .object({
    cursor: z.string().max(300).optional(),
    q: z.string().trim().max(160).default(""),
    status: ApplicationStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    confirmationDue: z.enum(["true", "false"]).optional(),
  })
  .strict();
export type ApplicationListQuery = z.infer<typeof ApplicationListQuerySchema>;
