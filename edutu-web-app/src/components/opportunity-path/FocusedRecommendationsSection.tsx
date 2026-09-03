import { BookmarkPlus, X } from "lucide-react";
import Button from "../ui/Button";
import DashboardOpportunityCard from "../dashboard/DashboardOpportunityCard";
import OpportunityDecisionMeta from "./OpportunityDecisionMeta";
import type { Opportunity } from "../../types/opportunity";
import type { IntentRecommendationView } from "../../services/opportunityJourney";

function asOpportunity(item: IntentRecommendationView): Opportunity {
  return {
    ...(item as unknown as Opportunity),
    id: item.id,
    title: item.title,
    match: item.matchScore ?? undefined,
    deadline: item.deadline ?? undefined,
  };
}

export default function FocusedRecommendationsSection({
  items,
  busy,
  degraded,
  onOpen,
  onPursue,
  onShortlist,
  onPass,
}: {
  items: IntentRecommendationView[];
  busy: { opportunityId: string; action: string } | null;
  degraded: boolean;
  onOpen: (item: IntentRecommendationView) => void;
  onPursue: (item: IntentRecommendationView) => void;
  onShortlist: (item: IntentRecommendationView) => void;
  onPass: (item: IntentRecommendationView) => void;
}) {
  return (
    <section>
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-text-primary">
            Recommended for your focus
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Three intentional choices, not an endless feed.
          </p>
        </div>
      </div>
      {degraded ? (
        <p className="mb-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-text-secondary">
          Personalisation is temporarily limited. Your active path remains
          available.
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.slice(0, 3).map((item) => {
          const activeAction =
            busy?.opportunityId === item.id ? busy.action : null;
          const disabled = Boolean(activeAction);
          return (
            <DashboardOpportunityCard
              key={item.id}
              opportunity={asOpportunity(item)}
              variant="grid"
              isBookmarked={false}
              isDarkMode={false}
              onOpen={() => onOpen(item)}
              onToggleBookmark={() => undefined}
              onShare={() => undefined}
              metaSlot={
                <OpportunityDecisionMeta
                  eligibilityStatus={item.eligibilityStatus}
                  matchReason={item.matchReasons[0]}
                  risk={item.matchRisks[0]}
                  estimatedEffortHours={item.estimatedEffortHours}
                />
              }
              actionSlot={
                <div className="flex w-full flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="flex-1"
                    disabled={disabled || item.eligibilityStatus === "ineligible"}
                    onClick={() => onPursue(item)}
                    aria-label={`Pursue ${item.title}`}
                  >
                    {activeAction === "pursue" ? "Starting…" : "Pursue"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => onShortlist(item)}
                    aria-label={`Shortlist ${item.title}`}
                  >
                    <BookmarkPlus className="h-4 w-4" />
                    Save
                  </Button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onPass(item)}
                    aria-label={`Pass on ${item.title}`}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-muted hover:bg-surface-elevated hover:text-text-primary disabled:opacity-40"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              }
            />
          );
        })}
      </div>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-subtle bg-surface-layer p-5 text-sm text-text-secondary">
          You have decided on this shortlist. Continue exploring opportunities
          below.
        </p>
      ) : null}
    </section>
  );
}
