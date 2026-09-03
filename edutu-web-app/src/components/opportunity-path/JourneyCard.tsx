import { ArrowRight } from "lucide-react";
import Button from "../ui/Button";
import JourneyStatusBadge from "./JourneyStatusBadge";
import type { OpportunityJourneyView } from "../../services/opportunityJourney";

export default function JourneyCard({
  item,
  onContinue,
}: {
  item: OpportunityJourneyView;
  onContinue: () => void;
}) {
  const title =
    typeof item.opportunity.title === "string"
      ? item.opportunity.title
      : "Opportunity";
  const organization =
    typeof item.opportunity.organization === "string"
      ? item.opportunity.organization
      : null;
  const deadline =
    typeof item.opportunity.deadline === "string"
      ? item.opportunity.deadline
      : null;

  return (
    <article className="rounded-2xl border border-subtle bg-surface-layer p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <JourneyStatusBadge state={item.journey.state} />
        <span className="text-xs font-semibold capitalize text-text-muted">
          {item.journey.priority}
        </span>
      </div>
      <h3 className="mt-3 line-clamp-2 text-base font-bold text-text-primary">
        {title}
      </h3>
      {organization ? (
        <p className="mt-1 text-sm text-text-secondary">{organization}</p>
      ) : null}
      <p className="mt-3 line-clamp-2 text-sm text-text-secondary">
        <span className="font-semibold text-text-primary">Next:</span>{" "}
        {item.nextAction.label}
      </p>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-elevated">
        <div
          className="h-full rounded-full bg-brand-500"
          style={{ width: `${Math.max(0, Math.min(100, item.progress.percent))}%` }}
          aria-label={`${item.progress.percent}% complete`}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-text-muted">
        <span>
          {item.progress.completedRequired} of {item.progress.totalRequired} required
        </span>
        {deadline ? <span>{new Date(deadline).toLocaleDateString()}</span> : null}
      </div>
      <Button
        type="button"
        variant="outline"
        className="mt-4 w-full"
        onClick={onContinue}
        aria-label={`Continue ${title}`}
      >
        Continue
        <ArrowRight className="h-4 w-4" />
      </Button>
    </article>
  );
}
