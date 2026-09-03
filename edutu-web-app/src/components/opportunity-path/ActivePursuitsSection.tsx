import { ArrowRight } from "lucide-react";
import Button from "../ui/Button";
import JourneyStatusBadge from "./JourneyStatusBadge";
import type { OpportunityJourneyView } from "../../services/opportunityJourney";

function title(item: OpportunityJourneyView) {
  return typeof item.opportunity.title === "string"
    ? item.opportunity.title
    : "Opportunity";
}

export default function ActivePursuitsSection({
  items,
  onOpen,
}: {
  items: OpportunityJourneyView[];
  onOpen: (item: OpportunityJourneyView) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-text-primary">Active pursuits</h2>
        <span className="text-xs font-semibold text-text-muted">
          {items.length} of 3 active
        </span>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {items.slice(0, 3).map((item) => (
          <article
            key={item.journey.id}
            className="rounded-2xl border border-subtle bg-surface-layer p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <JourneyStatusBadge state={item.journey.state} />
              <span className="text-xs font-bold text-text-muted">
                {item.journey.priority === "primary" ? "Primary" : "Secondary"}
              </span>
            </div>
            <h3 className="mt-3 line-clamp-2 min-h-10 font-bold text-text-primary">
              {title(item)}
            </h3>
            <p className="mt-2 line-clamp-2 text-sm text-text-secondary">
              Next: {item.nextAction.label}
            </p>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-elevated">
              <div
                className="h-full rounded-full bg-brand-500"
                style={{ width: `${Math.max(0, Math.min(100, item.progress.percent))}%` }}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4 w-full"
              onClick={() => onOpen(item)}
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </Button>
          </article>
        ))}
      </div>
    </section>
  );
}
