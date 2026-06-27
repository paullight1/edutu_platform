import { z } from "zod";

export const DeveloperEnvironmentSchema = z.enum(["test", "live"]);

export const DeveloperScopeSchema = z.enum([
  "opportunities:read",
  "opportunities:sync",
  "recommendations:read",
  "events:write",
  "usage:read",
]);

export const CreateDeveloperProjectSchema = z.object({
  name: z.string().trim().min(3).max(120),
  environment: DeveloperEnvironmentSchema.optional().default("live"),
  scopes: z.array(DeveloperScopeSchema).min(1).max(6).optional(),
  monthlyQuota: z.coerce.number().int().min(1).max(1_000_000).optional(),
  rateLimitPerMinute: z.coerce.number().int().min(1).max(10_000).optional(),
});

export type CreateDeveloperProjectDto = z.infer<
  typeof CreateDeveloperProjectSchema
>;
