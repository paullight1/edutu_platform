import React from "react";
import { Ban, CalendarClock, CheckCircle2, ThumbsDown, X } from "lucide-react";
import type { DismissReason } from "../../services/opportunitySignals";

/**
 * Typed "not interested" picker (web twin of the mobile DismissReasonSheet).
 * The reason matters: wrong_field teaches the engine taste (fewer of this
 * category), while the other three only hide the item — a user who already
 * applied still LIKES this kind of opportunity, and a plain dismiss would
 * wrongly bury the whole category.
 */
export function DismissReasonDialog({
  open,
  onSelect,
  onClose,
}: {
  open: boolean;
  onSelect: (reason: DismissReason) => void;
  onClose: () => void;
}) {
  if (!open) return null;

  const options: Array<{
    reason: DismissReason;
    label: string;
    hint: string;
    Icon: typeof ThumbsDown;
  }> = [
    {
      reason: "wrong_field",
      label: "Not my kind of opportunity",
      hint: "You'll see fewer like this",
      Icon: ThumbsDown,
    },
    {
      reason: "not_eligible",
      label: "I'm not eligible",
      hint: "Hides it without changing your interests",
      Icon: Ban,
    },
    {
      reason: "already_applied",
      label: "I already applied",
      hint: "We'll keep it out of your feed",
      Icon: CheckCircle2,
    },
    {
      reason: "deadline_too_soon",
      label: "Deadline is too close",
      hint: "Not enough time to apply properly",
      Icon: CalendarClock,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Why are you not interested?"
    >
      <div
        className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-subtle bg-surface-elevated p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-text-primary">Not interested?</h3>
            <p className="mt-0.5 text-sm text-text-muted">
              Tell us why — it makes your matches smarter.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-text-muted hover:bg-surface"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-2">
          {options.map(({ reason, label, hint, Icon }) => (
            <button
              key={reason}
              type="button"
              onClick={() => onSelect(reason)}
              className="flex w-full items-center gap-3 rounded-xl border border-subtle bg-surface px-4 py-3 text-left transition hover:bg-surface-body"
            >
              <Icon size={18} className="shrink-0 text-text-muted" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-text-primary">{label}</span>
                <span className="block truncate text-xs text-text-muted">{hint}</span>
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-xl py-2.5 text-sm font-semibold text-text-muted hover:text-text-secondary"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
