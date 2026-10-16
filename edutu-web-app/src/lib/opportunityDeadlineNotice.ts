import type { OpportunityTrust } from "../types/opportunity";

export interface DeadlineNotice {
  label: string;
  title: string;
}

/** Keep learner-facing date warnings specific to the evidence we have. */
export function getDeadlineNotice(
  trust?: OpportunityTrust | null,
): DeadlineNotice | null {
  if (trust?.deadlineNeedsReview !== true) return null;

  switch (trust.deadlineConfidence) {
    case "inferred":
      return {
        label: "Estimated",
        title:
          "This date was inferred from the listing rather than confirmed as an explicit deadline. Check the official source before applying.",
      };
    case "unknown":
      return {
        label: "Unconfirmed",
        title:
          "We could not confirm this deadline from the available evidence. Check the official source before applying.",
      };
    case "rolling":
      return {
        label: "Rolling",
        title:
          "The source describes applications as ongoing. Check the official source for current availability.",
      };
    case "explicit":
    case null:
    default:
      return {
        label: "Check date",
        title:
          "The listing contains conflicting deadline details. Confirm the date on the official source.",
      };
  }
}
