export const OPPORTUNITY_JOURNEY_STATES = [
  "shortlisted",
  "pursuing",
  "preparing",
  "ready_to_apply",
  "application_opened",
  "applied",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
  "no_response",
  "expired",
  "archived",
] as const;

export type OpportunityJourneyState =
  (typeof OPPORTUNITY_JOURNEY_STATES)[number];

export const OPPORTUNITY_PUBLIC_STAGES = [
  "discover",
  "pursuing",
  "applied",
  "outcome",
] as const;

export type OpportunityPublicStage = (typeof OPPORTUNITY_PUBLIC_STAGES)[number];

export const OPPORTUNITY_JOURNEY_OUTCOMES = [
  "offer",
  "rejected",
  "withdrawn",
  "no_response",
  "expired",
  "archived",
] as const;

export type OpportunityJourneyOutcome =
  (typeof OPPORTUNITY_JOURNEY_OUTCOMES)[number];

export const ACTIVE_OPPORTUNITY_JOURNEY_STATES = [
  "pursuing",
  "preparing",
  "ready_to_apply",
  "application_opened",
] as const satisfies readonly OpportunityJourneyState[];

export type ActiveOpportunityJourneyState =
  (typeof ACTIVE_OPPORTUNITY_JOURNEY_STATES)[number];

export const CLOSED_OPPORTUNITY_JOURNEY_STATES = [
  ...OPPORTUNITY_JOURNEY_OUTCOMES,
] as const satisfies readonly OpportunityJourneyState[];

export type ClosedOpportunityJourneyState =
  (typeof CLOSED_OPPORTUNITY_JOURNEY_STATES)[number];

export const OPPORTUNITY_JOURNEY_TRANSITION_AUTHORITIES = [
  "generic",
  "application_confirmation",
  "outcome",
] as const;

export type OpportunityJourneyTransitionAuthority =
  (typeof OPPORTUNITY_JOURNEY_TRANSITION_AUTHORITIES)[number];

export const OPPORTUNITY_JOURNEY_TRANSITION_ERROR_CODES = [
  "INVALID_JOURNEY_TRANSITION",
  "APPLICATION_CONFIRMATION_REQUIRED",
  "OUTCOME_UPDATE_REQUIRED",
] as const;

export type OpportunityJourneyTransitionErrorCode =
  (typeof OPPORTUNITY_JOURNEY_TRANSITION_ERROR_CODES)[number];

export type OpportunityJourneyTransitionResult =
  | {
      ok: true;
      from: OpportunityJourneyState;
      to: OpportunityJourneyState;
    }
  | {
      ok: false;
      code: OpportunityJourneyTransitionErrorCode;
      from: OpportunityJourneyState;
      to: OpportunityJourneyState;
    };
