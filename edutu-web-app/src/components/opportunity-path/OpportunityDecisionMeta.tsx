import Badge from "../ui/Badge";

export interface OpportunityDecisionMetaProps {
  eligibilityStatus: "eligible" | "likely" | "unclear" | "ineligible";
  matchReason?: string | null;
  risk?: string | null;
  estimatedEffortHours?: number | null;
}

const eligibilityCopy = {
  eligible: "Eligible",
  likely: "Likely eligible",
  unclear: "Check eligibility",
  ineligible: "Not eligible",
} as const;

export default function OpportunityDecisionMeta({
  eligibilityStatus,
  matchReason,
  risk,
  estimatedEffortHours,
}: OpportunityDecisionMetaProps) {
  return (
    <div className="space-y-1.5 text-xs text-text-secondary">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant={
            eligibilityStatus === "eligible"
              ? "success"
              : eligibilityStatus === "ineligible"
                ? "danger"
                : "outline"
          }
        >
          {eligibilityCopy[eligibilityStatus]}
        </Badge>
        {typeof estimatedEffortHours === "number" ? (
          <span className="font-medium text-text-muted">
            About {estimatedEffortHours}h preparation
          </span>
        ) : null}
      </div>
      {matchReason ? (
        <p className="line-clamp-2">
          <span className="font-semibold text-text-primary">Why it fits:</span>{" "}
          {matchReason}
        </p>
      ) : null}
      {risk ? (
        <p className="line-clamp-2 text-text-muted">
          <span className="font-semibold text-text-secondary">Watch out:</span>{" "}
          {risk}
        </p>
      ) : null}
    </div>
  );
}
