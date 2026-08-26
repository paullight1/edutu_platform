import { useEffect } from "react";

const REPORT_DIALOG_SELECTOR =
  '[role="dialog"][aria-modal="true"][aria-labelledby="community-report-title"]';
const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export default function CommunityReportDialogAccessibility() {
  useEffect(() => {
    let activeDialog: HTMLElement | null = null;
    let returnFocus: HTMLElement | null = null;

    const activateDialog = (dialog: HTMLElement) => {
      activeDialog = dialog;
      returnFocus =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;

      queueMicrotask(() => {
        if (!activeDialog?.isConnected) return;
        const preferred =
          activeDialog.querySelector<HTMLElement>("textarea") ??
          activeDialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        preferred?.focus();
      });
    };

    const restoreFocus = () => {
      const previous = returnFocus;
      activeDialog = null;
      returnFocus = null;
      if (previous?.isConnected) previous.focus();
    };

    const syncDialog = () => {
      const dialog = document.querySelector<HTMLElement>(REPORT_DIALOG_SELECTOR);
      if (dialog && dialog !== activeDialog) {
        activateDialog(dialog);
      } else if (!dialog && activeDialog) {
        restoreFocus();
      }
    };

    const observer = new MutationObserver(syncDialog);
    observer.observe(document.body, { childList: true, subtree: true });
    syncDialog();

    const handleKeyDown = (event: KeyboardEvent) => {
      const dialog = activeDialog;
      if (!dialog?.isConnected) return;

      if (event.key === "Escape") {
        event.preventDefault();
        dialog
          .querySelector<HTMLButtonElement>('button[aria-label="Close dialog"]')
          ?.click();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (!focusable.length) return;

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
      observer.disconnect();
      if (activeDialog) restoreFocus();
    };
  }, []);

  return null;
}
