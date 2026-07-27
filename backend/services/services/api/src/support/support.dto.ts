import { z } from "zod";

export const createSupportRequestSchema = z.object({
  // "bug" routes to the bug-report inbox subject; "support" is a general help
  // request. Both are emailed to the same support inbox.
  type: z.enum(["bug", "support"]).default("support"),
  name: z.string().trim().max(120).optional(),
  email: z.string().trim().email().max(200),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000),
  // Optional diagnostic context (platform, appVersion, url, userId, …). Kept as
  // a flat string map so any client can attach whatever is useful for triage.
  context: z.record(z.string(), z.string()).optional(),
});

export type CreateSupportRequestDto = z.infer<
  typeof createSupportRequestSchema
>;
