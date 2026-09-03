import { z } from "zod";

export const opportunityIntentGoalSchema = z.enum([
  "study_funding",
  "work_experience",
  "employment",
  "business_funding",
  "leadership_growth",
  "skill_building",
  "open_exploration",
]);

export const opportunityIntentInputSchema = z.object({
  goalKey: opportunityIntentGoalSchema,
  opportunityTypes: z.array(z.string().trim().min(1)).max(20).default([]),
  locations: z.array(z.string().trim().min(1)).max(20).default([]),
  remotePreference: z
    .enum(["required", "preferred", "neutral", "excluded"])
    .default("neutral"),
  actionHorizonDays: z.union([
    z.literal(30),
    z.literal(90),
    z.literal(180),
    z.literal(365),
  ]),
  weeklyHours: z.number().int().min(1).max(40),
  readinessMode: z.enum(["apply_now", "prepare"]),
});

export type OpportunityIntentGoal = z.infer<
  typeof opportunityIntentGoalSchema
>;
export type OpportunityIntentInput = z.infer<
  typeof opportunityIntentInputSchema
>;
