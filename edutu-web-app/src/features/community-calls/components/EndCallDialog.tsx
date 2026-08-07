import { useEffect, useRef } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

interface EndCallDialogProps {
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function EndCallDialog({ busy, error, onCancel, onConfirm }: EndCallDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const busyRef = useRef(busy);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    busyRef.current = busy;
    onCancelRef.current = onCancel;
  }, [busy, onCancel]);

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    cancelButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!busyRef.current) onCancelRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const returnFocus = returnFocusRef.current;
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-surface-overlay p-4 sm:items-center"
      onMouseDown={(event) => {
        if (!busy && event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="end-call-title"
        aria-describedby="end-call-description"
        aria-busy={busy}
        tabIndex={-1}
        className="w-full max-w-md rounded-[2rem] border border-subtle bg-surface-layer p-6 shadow-elevated"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-danger/10 text-danger">
          <AlertCircle className="h-5 w-5" aria-hidden="true" />
        </span>
        <h2 id="end-call-title" className="mt-5 font-display text-2xl font-semibold text-text-primary">
          End the call for everyone?
        </h2>
        <p id="end-call-description" className="mt-2 text-sm leading-6 text-text-secondary">
          Every participant will be disconnected and this room cannot be reopened.
        </p>
        {error ? (
          <p role="alert" className="mt-4 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            ref={cancelButtonRef}
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="min-h-12 rounded-2xl border border-default px-4 text-sm font-semibold text-text-primary focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-60"
          >
            Keep call open
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-danger px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {busy ? "Ending call" : "End for everyone"}
          </button>
        </div>
      </section>
    </div>
  );
}
