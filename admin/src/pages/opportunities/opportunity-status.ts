export type OpportunityStatus =
  | "active"
  | "closed"
  | "draft"
  | "pending_review"
  | "rejected";

export type OpportunityStatusInput = {
  close_date?: string | null;
  status: OpportunityStatus;
};

export type OpportunityDeadlineInput = {
  close_date?: string | null;
  metadata?: Record<string, unknown>;
};

export function formatOpportunityDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function isPastDate(value?: string | null) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

export function isExpiredOpportunity(opportunity: OpportunityStatusInput) {
  return opportunity.status === "closed" || isPastDate(opportunity.close_date);
}

/**
 * Status as it should be displayed: an "active" row whose deadline already
 * passed reads as closed — the hourly verification job just has not flipped
 * it yet, and showing Active next to a red past date is a contradiction.
 */
export function effectiveStatus(opportunity: OpportunityStatusInput) {
  if (opportunity.status === "active" && isPastDate(opportunity.close_date)) {
    return "closed" as const;
  }
  return opportunity.status;
}

/**
 * Deadline cell text. Distinguishes a legitimately open-ended opportunity
 * ("Rolling") from a failed extraction ("Unknown"), and marks dates whose
 * year the scraper inferred rather than read from the source.
 */
export function deadlineDisplay(opportunity: OpportunityDeadlineInput) {
  const formatted = formatOpportunityDate(opportunity.close_date);
  const confidence = opportunity.metadata?.deadline_confidence as
    | string
    | undefined;
  if (formatted) {
    return confidence === "inferred" ? `${formatted} (est.)` : formatted;
  }
  return confidence === "rolling" ? "Rolling" : "Unknown";
}
