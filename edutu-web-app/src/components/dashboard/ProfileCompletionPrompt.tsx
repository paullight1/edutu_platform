import { X } from "lucide-react";
import OnboardingFlow from "../onboarding/OnboardingFlow";
import { Dialog, DialogContent } from "../ui/Dialog";

interface ProfileCompletionPromptProps {
  open: boolean;
  missingFields?: string[];
  onComplete: () => void;
  onDismiss: () => void;
}

export function ProfileCompletionPrompt({
  open,
  onComplete,
  onDismiss,
}: ProfileCompletionPromptProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onDismiss()}>
      <DialogContent
        ariaLabel="Welcome to Edutu"
        className="max-h-[calc(100dvh-2rem)] max-w-3xl overflow-hidden rounded-[28px] border-white/70 bg-surface-layer p-0 shadow-[0_30px_90px_rgba(15,45,92,0.28)]"
      >
        <button
          type="button"
          onClick={onDismiss}
          className="absolute right-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/80 text-slate-500 shadow-sm backdrop-blur transition hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 active:scale-[0.97] dark:bg-slate-900/75 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white"
          aria-label="Close onboarding"
        >
          <X size={18} />
        </button>

        <OnboardingFlow
          presentation="modal"
          showWelcome
          onComplete={onComplete}
          onDismiss={onDismiss}
        />
      </DialogContent>
    </Dialog>
  );
}
