import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import Button from "../ui/Button";
import type { OpportunityIntentView } from "../../services/opportunityJourney";

const GOALS = [
  ["study_funding", "Study funding"],
  ["work_experience", "Work experience"],
  ["employment", "Employment"],
  ["business_funding", "Business funding"],
  ["leadership_growth", "Leadership growth"],
  ["skill_building", "Skill building"],
  ["open_exploration", "Explore opportunities"],
] as const;

export default function CurrentFocusDialog({
  open,
  intent,
  saving,
  onClose,
  onSelect,
}: {
  open: boolean;
  intent: OpportunityIntentView;
  saving: boolean;
  onClose: () => void;
  onSelect: (goalKey: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      className="w-[min(92vw,560px)] rounded-2xl border border-subtle bg-surface-layer p-0 text-text-primary shadow-elevated backdrop:bg-slate-950/55"
      aria-labelledby="current-focus-title"
    >
      <div className="flex items-start justify-between gap-4 border-b border-subtle p-5">
        <div>
          <h2 id="current-focus-title" className="text-xl font-bold">
            Current focus
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Choose what Edutu should help you achieve now.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close current focus editor"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface-elevated text-text-secondary hover:text-text-primary"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="grid gap-2 p-5 sm:grid-cols-2">
        {GOALS.map(([key, label]) => {
          const selected = intent.goalKey === key;
          return (
            <Button
              key={key}
              type="button"
              variant={selected ? "primary" : "outline"}
              disabled={saving}
              onClick={() => onSelect(key)}
              aria-pressed={selected}
              className="min-h-12 justify-between"
            >
              <span>{label}</span>
              {selected ? <span className="text-xs">Current</span> : null}
            </Button>
          );
        })}
      </div>
    </dialog>
  );
}
