import {
  CheckCircle2,
  Compass,
  Loader2,
  Sparkles,
  Target,
} from "lucide-react";
import type {
  OpportunityAssistAction,
  OpportunityAssistBusy,
} from "./opportunityAssistTypes";

const actions = [
  {
    id: "fit_check",
    title: "Check my fit",
    detail: "Compare your profile with the stated requirements.",
    icon: Target,
  },
  {
    id: "next_move",
    title: "Choose my next step",
    detail: "Get one practical move for this application.",
    icon: Compass,
  },
  {
    id: "whats_missing",
    title: "Find what’s missing",
    detail: "Spot gaps to close before you apply.",
    icon: CheckCircle2,
  },
  {
    id: "review_doc",
    title: "Review a document",
    detail: "Get feedback on a saved application file.",
    icon: Sparkles,
  },
  {
    id: "plan",
    title: "Build a preparation plan",
    detail: "Turn requirements into milestones and a checklist.",
    icon: Sparkles,
  },
] as const;

export function getOpportunityActionTitle(action: OpportunityAssistAction) {
  return actions.find((item) => item.id === action)?.title ?? "Your guidance";
}

export function OpportunityActionGrid({
  selected,
  busy,
  onSelect,
}: {
  selected: OpportunityAssistAction;
  busy: OpportunityAssistBusy;
  onSelect: (action: OpportunityAssistAction) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
      {actions.map(({ id, title, detail, icon: Icon }) => {
        const isSelected = selected === id;
        const isWorking = busy === id;

        return (
          <button
            key={id}
            type="button"
            aria-pressed={isSelected}
            disabled={busy !== null}
            onClick={() => onSelect(id)}
            className={`group flex min-h-28 min-w-0 flex-col items-start rounded-xl border p-3 text-left transition duration-150 active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-wait disabled:opacity-60 sm:p-4 ${
              isSelected
                ? "border-brand bg-brand/10"
                : "border-subtle bg-surface hover:border-brand/60 hover:bg-surface-elevated"
            }`}
          >
            <span
              className={`mb-2.5 grid size-8 shrink-0 place-items-center rounded-lg ${
                isSelected ? "bg-brand text-white" : "bg-brand/10 text-brand"
              }`}
            >
              {isWorking ? (
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              ) : (
                <Icon size={16} aria-hidden="true" />
              )}
            </span>
            <strong className="text-sm font-semibold leading-snug text-text-primary">
              {title}
            </strong>
            <span className="mt-1.5 text-xs leading-snug text-text-muted sm:text-sm">
              {detail}
            </span>
          </button>
        );
      })}
    </div>
  );
}
