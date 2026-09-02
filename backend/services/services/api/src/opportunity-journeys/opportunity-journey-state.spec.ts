import {
  ACTIVE_OPPORTUNITY_JOURNEY_STATES,
  CLOSED_OPPORTUNITY_JOURNEY_STATES,
  OPPORTUNITY_JOURNEY_OUTCOMES,
  OPPORTUNITY_JOURNEY_STATES,
  OPPORTUNITY_PUBLIC_STAGES,
  type OpportunityJourneyState,
} from "./opportunity-journey.types";
import {
  canTransition,
  isActiveJourneyState,
  isClosedJourneyState,
  isOutcomeJourneyState,
  publicStageFor,
  validateOpportunityJourneyTransition,
} from "./opportunity-journey-state";

const EXPECTED_TRANSITIONS: Record<
  OpportunityJourneyState,
  readonly OpportunityJourneyState[]
> = {
  shortlisted: ["pursuing", "archived", "expired"],
  pursuing: ["preparing", "ready_to_apply", "withdrawn", "archived", "expired"],
  preparing: ["pursuing", "ready_to_apply", "withdrawn", "archived", "expired"],
  ready_to_apply: ["application_opened", "preparing", "withdrawn", "expired"],
  application_opened: ["ready_to_apply", "applied", "withdrawn", "expired"],
  applied: ["interview", "offer", "rejected", "withdrawn", "no_response"],
  interview: ["offer", "rejected", "withdrawn", "no_response"],
  offer: ["archived"],
  rejected: ["archived"],
  withdrawn: ["archived"],
  no_response: ["archived"],
  expired: ["archived"],
  archived: ["shortlisted"],
};

describe("opportunity journey state machine", () => {
  it("exports the stable state, stage, outcome, active, and closed vocabularies", () => {
    expect(OPPORTUNITY_JOURNEY_STATES).toEqual([
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
    ]);
    expect(OPPORTUNITY_PUBLIC_STAGES).toEqual([
      "discover",
      "pursuing",
      "applied",
      "outcome",
    ]);
    expect(OPPORTUNITY_JOURNEY_OUTCOMES).toEqual([
      "offer",
      "rejected",
      "withdrawn",
      "no_response",
      "expired",
      "archived",
    ]);
    expect(ACTIVE_OPPORTUNITY_JOURNEY_STATES).toEqual([
      "pursuing",
      "preparing",
      "ready_to_apply",
      "application_opened",
    ]);
    expect(CLOSED_OPPORTUNITY_JOURNEY_STATES).toEqual([
      "offer",
      "rejected",
      "withdrawn",
      "no_response",
      "expired",
      "archived",
    ]);
  });

  it("allows every documented transition", () => {
    for (const [from, targets] of Object.entries(EXPECTED_TRANSITIONS) as Array<
      [OpportunityJourneyState, readonly OpportunityJourneyState[]]
    >) {
      for (const to of targets) {
        expect(canTransition(from, to)).toBe(true);
      }
    }
  });

  it("rejects every undocumented transition", () => {
    for (const from of OPPORTUNITY_JOURNEY_STATES) {
      for (const to of OPPORTUNITY_JOURNEY_STATES) {
        const expected = EXPECTED_TRANSITIONS[from].includes(to);
        expect(canTransition(from, to)).toBe(expected);
      }
    }
  });

  it.each([
    ["shortlisted", "discover"],
    ["pursuing", "pursuing"],
    ["preparing", "pursuing"],
    ["ready_to_apply", "pursuing"],
    ["application_opened", "pursuing"],
    ["applied", "applied"],
    ["interview", "applied"],
    ["offer", "outcome"],
    ["rejected", "outcome"],
    ["withdrawn", "outcome"],
    ["no_response", "outcome"],
    ["expired", "outcome"],
    ["archived", "outcome"],
  ] satisfies Array<[OpportunityJourneyState, string]>) (
    "maps %s to the %s public stage",
    (state, stage) => {
      expect(publicStageFor(state)).toBe(stage);
    },
  );

  it("classifies active, outcome, and closed states from stable sets", () => {
    for (const state of OPPORTUNITY_JOURNEY_STATES) {
      expect(isActiveJourneyState(state)).toBe(
        ACTIVE_OPPORTUNITY_JOURNEY_STATES.includes(
          state as (typeof ACTIVE_OPPORTUNITY_JOURNEY_STATES)[number],
        ),
      );
      expect(isOutcomeJourneyState(state)).toBe(
        OPPORTUNITY_JOURNEY_OUTCOMES.includes(
          state as (typeof OPPORTUNITY_JOURNEY_OUTCOMES)[number],
        ),
      );
      expect(isClosedJourneyState(state)).toBe(
        CLOSED_OPPORTUNITY_JOURNEY_STATES.includes(
          state as (typeof CLOSED_OPPORTUNITY_JOURNEY_STATES)[number],
        ),
      );
    }
  });

  it("returns domain error codes instead of throwing for protected transitions", () => {
    expect(
      validateOpportunityJourneyTransition(
        "application_opened",
        "applied",
        "generic",
      ),
    ).toEqual({
      ok: false,
      code: "APPLICATION_CONFIRMATION_REQUIRED",
      from: "application_opened",
      to: "applied",
    });

    expect(
      validateOpportunityJourneyTransition("applied", "offer", "generic"),
    ).toEqual({
      ok: false,
      code: "OUTCOME_UPDATE_REQUIRED",
      from: "applied",
      to: "offer",
    });

    expect(
      validateOpportunityJourneyTransition(
        "shortlisted",
        "interview",
        "generic",
      ),
    ).toEqual({
      ok: false,
      code: "INVALID_JOURNEY_TRANSITION",
      from: "shortlisted",
      to: "interview",
    });
  });

  it("allows the dedicated authorities to confirm applications and outcomes", () => {
    expect(
      validateOpportunityJourneyTransition(
        "application_opened",
        "applied",
        "application_confirmation",
      ),
    ).toEqual({
      ok: true,
      from: "application_opened",
      to: "applied",
    });

    expect(
      validateOpportunityJourneyTransition("interview", "offer", "outcome"),
    ).toEqual({ ok: true, from: "interview", to: "offer" });

    expect(
      validateOpportunityJourneyTransition("pursuing", "preparing", "generic"),
    ).toEqual({ ok: true, from: "pursuing", to: "preparing" });
  });
});
