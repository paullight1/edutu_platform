import { Pencil } from "lucide-react";
import Button from "../ui/Button";
import type { OpportunityIntentView } from "../../services/opportunityJourney";

const GOAL_LABELS: Record<string, string> = {
  study_funding: "Study funding",
  work_experience: "Work experience",
  employment: "Employment",
  business_funding: "Business funding",
  leadership_growth: "Leadership growth",
  skill_building: "Skill building",
  open_exploration: "Explore opportunities",
};

export default function CurrentFocusCard({
  intent,
  onEdit,
}: {
  intent: OpportunityIntentView;
  onEdit: () => void;
}) {
  const tags = [
    intent.locations[0],
    intent.remotePreference === "required"
      ? "Remote only"
      : intent.remotePreference === "preferred"
        ? "Remote preferred"
        : null,
    `Within ${intent.actionHorizonDays} days`,
  ].filter((value): value is string => Boolean(value));

  return (
    <section className="rounded-2xl border border-subtle bg-surface-layer p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-text-muted">
            Current focus
          </p>
          <h2 className="mt-1 text-lg font-bold text-text-primary sm:text-xl">
            {GOAL_LABELS[intent.goalKey] ?? intent.goalKey}
          </h2>
          {intent.source === "inferred" ? (
            <p className="mt-1 text-xs text-text-muted">
              Based on your current Edutu profile
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onEdit}
          aria-label="Edit current opportunity focus"
        >
          <Pencil className="h-4 w-4" />
          Edit focus
        </Button>
      </div>
      {tags.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-brand-500/10 px-2.5 py-1 text-xs font-semibold text-brand-600"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
