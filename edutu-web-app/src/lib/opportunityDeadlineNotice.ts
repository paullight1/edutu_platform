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
          "This date is marked for review. Confirm it against the official source before applying.",
      };
  }
}

/** Avoid presenting an unconfirmed candidate as a verified deadline. */
export function deadlineDisplayLabel(
  trust?: OpportunityTrust | null,
): "Deadline" | "Date to verify" {
  return trust?.deadlineNeedsReview === true ? "Date to verify" : "Deadline";
}
