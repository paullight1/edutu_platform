import { useEffect, useRef } from "react";
import Button from "../ui/Button";

export default function ApplicationConfirmationDialog({
  open,
  opportunityTitle,
  busy,
  onSubmitted,
  onNotYet,
  onWithdraw,
}: {
  open: boolean;
  opportunityTitle: string;
  busy: boolean;
  onSubmitted: () => void;
  onNotYet: () => void;
  onWithdraw: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="w-[min(92vw,520px)] rounded-2xl border border-subtle bg-surface-layer p-0 text-text-primary shadow-elevated backdrop:bg-slate-950/55"
      aria-labelledby="application-confirmation-title"
      onCancel={(event) => {
        event.preventDefault();
        onNotYet();
      }}
    >
      <div className="p-5 sm:p-6">
        <h2 id="application-confirmation-title" className="text-xl font-bold">
          Did you submit your application?
        </h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Opening the application for {opportunityTitle} does not count as a
          submission. Confirm only after you have completed it on the official
          website.
        </p>
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <Button type="button" disabled={busy} onClick={onSubmitted}>
            Yes, I submitted it
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={onNotYet}>
            Not yet
          </Button>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onWithdraw}
          className="mt-4 text-sm font-semibold text-text-muted underline-offset-4 hover:text-danger hover:underline disabled:opacity-50"
        >
          I decided not to continue
        </button>
      </div>
    </dialog>
  );
}
