import { z } from "zod";
import { productApiRequest } from "./productApi";

const nextActionSchema = z.object({
  key: z.string(),
  label: z.string(),
  taskId: z.string().nullable().optional(),
  dueAt: z.string().nullable().optional(),
});

const pursuitSchema = z.object({
  journey: z.object({
    id: z.string().min(1),
    opportunityId: z.string().min(1),
    state: z.string(),
    priority: z.enum(["primary", "secondary", "none"]),
    version: z.number().int().positive(),
    eligibilityStatus: z.enum(["eligible", "likely", "unclear", "ineligible"]),
  }),
  opportunity: z.record(z.string(), z.unknown()),
  nextAction: nextActionSchema,
  tasks: z.array(z.unknown()).default([]),
  progress: z
    .object({
      completedRequired: z.number().nonnegative(),
      totalRequired: z.number().nonnegative(),
      percent: z.number().min(0).max(100),
    })
    .optional(),
});

const recommendationSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  matchReasons: z.array(z.string()).catch([]),
  matchRisks: z.array(z.string()).catch([]),
  eligibilityStatus: z
    .enum(["eligible", "likely", "unclear", "ineligible"])
    .catch("unclear"),
  eligibilityReasons: z.array(z.string()).catch([]),
  eligibilityBlockers: z.array(z.string()).catch([]),
  deadline: z.string().nullable().catch(null),
  daysUntilDeadline: z.number().nullable().catch(null),
  officialUrl: z.string().nullable().optional(),
  official_url: z.string().nullable().optional(),
});

const opportunityHomeSchema = z.object({
  generatedAt: z.string().optional(),
  intent: z
    .object({
      source: z.enum(["explicit", "inferred"]).optional(),
      goalKey: z.string().optional(),
    })
    .passthrough()
    .nullable()
    .optional(),
  featuredPursuitId: z.string().nullable().optional(),
  nextAction: nextActionSchema.nullable().optional(),
  activePursuits: z.array(pursuitSchema).default([]),
  recommendations: z.array(recommendationSchema).catch([]).default([]),
  degraded: z.boolean().default(false),
  degradedReasons: z.array(z.string()).catch([]).default([]),
});

export type OpportunityHomeView = z.infer<typeof opportunityHomeSchema>;
export type OpportunityHomePursuit =
  OpportunityHomeView["activePursuits"][number];
export type OpportunityHomeRecommendation =
  OpportunityHomeView["recommendations"][number];

export async function getOpportunityHome(
  token: string,
): Promise<OpportunityHomeView> {
  const payload = await productApiRequest<unknown>(
    "/me/opportunity-home",
    token,
  );
  return opportunityHomeSchema.parse(payload);
}
