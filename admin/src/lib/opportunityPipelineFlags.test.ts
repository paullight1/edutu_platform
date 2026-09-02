import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPPORTUNITY_PIPELINE_FLAGS,
  OPPORTUNITY_PIPELINE_FLAG_DEFINITIONS,
  normalizeOpportunityPipelineFlags,
} from "./opportunityPipelineFlags";

const EXPECTED_KEYS = [
  "opportunity_pipeline_home",
  "opportunity_my_path",
  "opportunity_state_actions",
  "opportunity_pipeline_navigation",
];

describe("opportunity pipeline admin flag definitions", () => {
  it("defines the four rollout switches in dependency order", () => {
    expect(
      OPPORTUNITY_PIPELINE_FLAG_DEFINITIONS.map((definition) => definition.key),
    ).toEqual(EXPECTED_KEYS);
  });

  it("keeps every rollout switch disabled by default", () => {
    expect(DEFAULT_OPPORTUNITY_PIPELINE_FLAGS).toEqual({
      opportunity_pipeline_home: false,
      opportunity_my_path: false,
      opportunity_state_actions: false,
      opportunity_pipeline_navigation: false,
    });
  });

  it("normalizes unknown or malformed settings without enabling them", () => {
    expect(
      normalizeOpportunityPipelineFlags({
        opportunity_pipeline_home: true,
        opportunity_my_path: "yes",
        unsupported_flag: true,
      }),
    ).toEqual({
      opportunity_pipeline_home: true,
      opportunity_my_path: false,
      opportunity_state_actions: false,
      opportunity_pipeline_navigation: false,
    });
  });
});
