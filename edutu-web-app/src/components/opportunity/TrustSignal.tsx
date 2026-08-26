import { BadgeCheck, Clock, Info } from "lucide-react";
import { formatDistanceToNow, parseISO, isValid } from "date-fns";
import type { OpportunityTrust } from "../../types/opportunity";

/**
 * Learner-facing credibility strip: a "Verified" badge, when it was last
 * checked ("Checked 2h ago"), and — for estimated/rolling deadlines — an
 * honest confidence note. Credibility is the product's moat, so these signals
 * belong next to the opportunity, not buried in the backend.
 *
 * Renders nothing when there is no trust data (legacy/admin payloads).
 */
export default function TrustSignal({
  trust,
  className = "",
}: {
  trust?: OpportunityTrust | null;
  className?: string;
}) {
  if (!trust) return null;

  const checkedAgo = relativeTime(trust.lastVerifiedAt);
  const confidenceNote = deadlineConfidenceNote(trust.deadlineConfidence);
  const verified = trust.verificationStatus === "verified";

  // Nothing worth showing (unverified, never checked, confident deadline).
  if (!verified && !checkedAgo && !confidenceNote) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${className}`}
    >
      {verified ? (
        <span
          className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400"
          title="Edutu re-checks this opportunity's live page and deadline."
        >
          <BadgeCheck size={14} /> Verified
        </span>
      ) : null}
      {checkedAgo ? (
        <span className="inline-flex items-center gap-1 text-text-muted">
          <Clock size={12} /> Checked {checkedAgo}
        </span>
      ) : null}
      {confidenceNote ? (
        <span
          className="inline-flex items-center gap-1 text-text-muted"
          title={confidenceNote.title}
        >
          <Info size={12} /> {confidenceNote.label}
        </span>
      ) : null}
    </div>
  );
}

function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const date = parseISO(iso);
  if (!isValid(date)) return null;
  return formatDistanceToNow(date, { addSuffix: true });
}

function deadlineConfidenceNote(
  confidence: OpportunityTrust["deadlineConfidence"],
): { label: string; title: string } | null {
  switch (confidence) {
    case "inferred":
      return {
        label: "Estimated deadline",
        title:
          "This deadline was inferred from the page, not read from an explicit date — confirm on the official site.",
      };
    case "rolling":
      return {
        label: "Rolling deadline",
        title: "Applications are accepted on a rolling/ongoing basis.",
      };
    case "unknown":
      return {
        label: "Deadline unconfirmed",
        title:
          "We couldn't confirm a deadline for this opportunity — check the official site before applying.",
      };
    case "explicit":
    case null:
    default:
      return null;
  }
}
