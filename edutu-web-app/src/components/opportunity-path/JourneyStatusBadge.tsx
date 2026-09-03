import Badge from "../ui/Badge";
import type { OpportunityJourneyState } from "../../services/opportunityJourney";

const LABELS: Record<OpportunityJourneyState, string> = {
  shortlisted: "Shortlisted",
  pursuing: "Pursuing",
  preparing: "Preparing",
  ready_to_apply: "Ready to apply",
  application_opened: "Application opened",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Not selected",
  withdrawn: "Withdrawn",
  no_response: "No response",
  expired: "Expired",
  archived: "Archived",
};

export interface JourneyStatusBadgeProps {
  state: OpportunityJourneyState;
  className?: string;
}

export default function JourneyStatusBadge({
  state,
  className,
}: JourneyStatusBadgeProps) {
  const variant =
    state === "offer"
      ? "success"
      : state === "rejected" || state === "expired"
        ? "danger"
        : state === "shortlisted" || state === "archived"
          ? "outline"
          : "default";

  return (
    <Badge variant={variant} className={className} data-journey-state={state}>
      {LABELS[state]}
    </Badge>
  );
}
