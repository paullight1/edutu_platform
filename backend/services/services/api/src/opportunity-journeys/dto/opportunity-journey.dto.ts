import { z } from "zod";
import {
  opportunityIntentInputSchema,
  type OpportunityIntentInput,
} from "./opportunity-intent.dto";
import { OPPORTUNITY_JOURNEY_STATES } from "../opportunity-journey.types";

export const mutationIdentitySchema = z.object({
  expectedVersion: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(8).max(200),
});

export const opportunityHomeQuerySchema = z.object({
  recommendationLimit: z.coerce.number().int().min(1).max(5).default(3),
});

export const listOpportunityJourneysQuerySchema = z.object({
  stage: z.enum(["discover", "pursuing", "applied", "outcome"]).optional(),
});

export const createOpportunityJourneySchema = z.object({
  opportunityId: z.string().uuid(),
  action: z.enum(["shortlist", "pursue"]),
  priority: z.enum(["primary", "secondary"]).optional(),
  intentId: z.string().uuid().optional(),
  idempotencyKey: z.string().trim().min(8).max(200),
});

export const transitionOpportunityJourneySchema = mutationIdentitySchema.extend(
  {
    state: z.enum(OPPORTUNITY_JOURNEY_STATES),
  },
);

export const setOpportunityJourneyPrioritySchema =
  mutationIdentitySchema.extend({
    priority: z.enum(["primary", "secondary"]),
  });

export const updateOpportunityJourneyTaskSchema = mutationIdentitySchema.extend(
  {
    status: z.enum(["pending", "in_progress", "completed", "skipped"]),
  },
);

export const opportunityJourneyOutcomeSchema = mutationIdentitySchema.extend({
  outcome: z.enum(["offer", "rejected", "withdrawn", "no_response", "expired"]),
});

export const applicationMutationSchema = mutationIdentitySchema;

export const putOpportunityIntentSchema = opportunityIntentInputSchema;

export type OpportunityHomeQuery = z.infer<typeof opportunityHomeQuerySchema>;
export type ListOpportunityJourneysQuery = z.infer<
  typeof listOpportunityJourneysQuerySchema
>;
export type CreateOpportunityJourneyInput = z.infer<
  typeof createOpportunityJourneySchema
>;
export type TransitionOpportunityJourneyInput = z.infer<
  typeof transitionOpportunityJourneySchema
>;
export type SetOpportunityJourneyPriorityInput = z.infer<
  typeof setOpportunityJourneyPrioritySchema
>;
export type UpdateOpportunityJourneyTaskInput = z.infer<
  typeof updateOpportunityJourneyTaskSchema
>;
export type OpportunityJourneyOutcomeInput = z.infer<
  typeof opportunityJourneyOutcomeSchema
>;
export type ApplicationMutationInput = z.infer<
  typeof applicationMutationSchema
>;
export type PutOpportunityIntentInput = OpportunityIntentInput;
