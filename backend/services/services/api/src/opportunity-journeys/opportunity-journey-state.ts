import {
  ACTIVE_OPPORTUNITY_JOURNEY_STATES,
  CLOSED_OPPORTUNITY_JOURNEY_STATES,
  OPPORTUNITY_JOURNEY_OUTCOMES,
  type ActiveOpportunityJourneyState,
  type ClosedOpportunityJourneyState,
  type OpportunityJourneyState,
  type OpportunityJourneyTransitionAuthority,
  type OpportunityJourneyTransitionResult,
  type OpportunityPublicStage,
} from "./opportunity-journey.types";

export const ALLOWED_OPPORTUNITY_JOURNEY_TRANSITIONS = {
  shortlisted: ["pursuing", "archived", "expired"],
  pursuing: [
    "preparing",
    "ready_to_apply",
    "withdrawn",
    "archived",
    "expired",
  ],
  preparing: [
    "pursuing",
    "ready_to_apply",
    "withdrawn",
    "archived",
    "expired",
  ],
  ready_to_apply: [
    "application_opened",
    "preparing",
    "withdrawn",
    "expired",
  ],
  application_opened: [
    "ready_to_apply",
    "applied",
    "withdrawn",
    "expired",
  ],
  applied: ["interview", "offer", "rejected", "withdrawn", "no_response"],
  interview: ["offer", "rejected", "withdrawn", "no_response"],
  offer: ["archived"],
  rejected: ["archived"],
  withdrawn: ["archived"],
  no_response: ["archived"],
  expired: ["archived"],
  archived: ["shortlisted"],
} as const satisfies Record<
  OpportunityJourneyState,
  readonly OpportunityJourneyState[]
>;

const PUBLIC_STAGE_BY_STATE: Record<
  OpportunityJourneyState,
  OpportunityPublicStage
> = {
  shortlisted: "discover",
  pursuing: "pursuing",
  preparing: "pursuing",
  ready_to_apply: "pursuing",
  application_opened: "pursuing",
  applied: "applied",
  interview: "applied",
  offer: "outcome",
  rejected: "outcome",
  withdrawn: "outcome",
  no_response: "outcome",
  expired: "outcome",
  archived: "outcome",
};

const ACTIVE_STATES = new Set<OpportunityJourneyState>(
  ACTIVE_OPPORTUNITY_JOURNEY_STATES,
);
const OUTCOME_STATES = new Set<OpportunityJourneyState>(
  OPPORTUNITY_JOURNEY_OUTCOMES,
);
const CLOSED_STATES = new Set<OpportunityJourneyState>(
  CLOSED_OPPORTUNITY_JOURNEY_STATES,
);

export function canTransition(
  from: OpportunityJourneyState,
  to: OpportunityJourneyState,
): boolean {
  return (
    ALLOWED_OPPORTUNITY_JOURNEY_TRANSITIONS[from] as readonly OpportunityJourneyState[]
  ).includes(to);
}

export function publicStageFor(
  state: OpportunityJourneyState,
): OpportunityPublicStage {
  return PUBLIC_STAGE_BY_STATE[state];
}

export function isActiveJourneyState(
  state: OpportunityJourneyState,
): state is ActiveOpportunityJourneyState {
  return ACTIVE_STATES.has(state);
}

export function isOutcomeJourneyState(
  state: OpportunityJourneyState,
): state is ClosedOpportunityJourneyState {
  return OUTCOME_STATES.has(state);
}

export function isClosedJourneyState(
  state: OpportunityJourneyState,
): state is ClosedOpportunityJourneyState {
  return CLOSED_STATES.has(state);
}

export function validateOpportunityJourneyTransition(
  from: OpportunityJourneyState,
  to: OpportunityJourneyState,
  authority: OpportunityJourneyTransitionAuthority = "generic",
): OpportunityJourneyTransitionResult {
  if (!canTransition(from, to)) {
    return {
      ok: false,
      code: "INVALID_JOURNEY_TRANSITION",
      from,
      to,
    };
  }

  if (to === "applied") {
    if (authority !== "application_confirmation") {
      return {
        ok: false,
        code: "APPLICATION_CONFIRMATION_REQUIRED",
        from,
        to,
      };
    }

    return { ok: true, from, to };
  }

  if (isOutcomeJourneyState(to)) {
    if (authority !== "outcome") {
      return {
        ok: false,
        code: "OUTCOME_UPDATE_REQUIRED",
        from,
        to,
      };
    }

    return { ok: true, from, to };
  }

  if (authority !== "generic") {
    return {
      ok: false,
      code: "INVALID_JOURNEY_TRANSITION",
      from,
      to,
    };
  }

  return { ok: true, from, to };
}
