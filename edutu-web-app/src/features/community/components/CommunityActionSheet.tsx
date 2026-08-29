import { useEffect } from "react";
import { Loader2, X } from "lucide-react";

interface CommunityActionSheetProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function CommunityActionSheet({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  onClose,
  onConfirm,
}: CommunityActionSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Close action sheet"
        className="absolute inset-0 bg-surface-overlay backdrop-blur-sm"
        disabled={busy}
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="community-action-sheet-title"
        className="relative grid max-h-[76dvh] w-full grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-t-[28px] border border-subtle bg-surface-layer shadow-elevated sm:max-w-md sm:rounded-[28px]"
      >
        <header className="sticky top-0 flex items-start justify-between gap-3 border-b border-subtle bg-surface-layer px-4 py-3">
          <h2
            id="community-action-sheet-title"
            className="pt-2 font-display text-xl font-semibold tracking-[-0.02em] text-text-primary"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-text-secondary transition hover:bg-surface-elevated disabled:opacity-50"
            aria-label={`Close ${title.toLowerCase()}`}
          >
            <X size={19} />
          </button>
        </header>
        <div className="overflow-y-auto px-4 py-4">
          <p className="text-sm leading-6 text-text-secondary">{description}</p>
        </div>
        <footer className="grid grid-cols-2 gap-2 border-t border-subtle bg-surface-layer p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-11 rounded-xl border border-subtle bg-surface-elevated text-sm font-semibold text-text-secondary transition hover:text-text-primary disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-danger px-4 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : null}
            {confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}
