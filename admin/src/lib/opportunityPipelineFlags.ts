export const OPPORTUNITY_PIPELINE_FLAG_DEFINITIONS = [
  {
    key: "opportunity_state_actions",
    label: "State-aware opportunity actions",
    description:
      "Changes the primary opportunity action according to the user's journey state.",
  },
  {
    key: "opportunity_my_path",
    label: "My Path",
    description:
      "Enables the unified Discover, Pursuing, Applied, and Outcome workspace.",
  },
  {
    key: "opportunity_pipeline_home",
    label: "Focused opportunity home",
    description:
      "Shows current focus, one next action, active pursuits, and a bounded recommendation shortlist.",
  },
  {
    key: "opportunity_pipeline_navigation",
    label: "Pipeline navigation consolidation",
    description:
      "Makes My Path the primary lifecycle destination while legacy routes remain available.",
  },
] as const;

export type OpportunityPipelineFlagKey =
  (typeof OPPORTUNITY_PIPELINE_FLAG_DEFINITIONS)[number]["key"];

export type OpportunityPipelineFlags = Record<
  OpportunityPipelineFlagKey,
  boolean
>;

export const DEFAULT_OPPORTUNITY_PIPELINE_FLAGS: OpportunityPipelineFlags = {
  opportunity_pipeline_home: false,
  opportunity_my_path: false,
  opportunity_state_actions: false,
  opportunity_pipeline_navigation: false,
};

export function normalizeOpportunityPipelineFlags(
  value: unknown,
): OpportunityPipelineFlags {
  const input =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return OPPORTUNITY_PIPELINE_FLAG_DEFINITIONS.reduce<OpportunityPipelineFlags>(
    (flags, definition) => {
      flags[definition.key] = input[definition.key] === true;
      return flags;
    },
    { ...DEFAULT_OPPORTUNITY_PIPELINE_FLAGS },
  );
}
