import { ArrowRight, Check, Clock3, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../ui/Dialog";

interface ProfileCompletionPromptProps {
  open: boolean;
  missingFields: string[];
  onComplete: () => void;
  onDismiss: () => void;
}

export function ProfileCompletionPrompt({
  open,
  missingFields,
  onComplete,
  onDismiss,
}: ProfileCompletionPromptProps) {
  const nextFields = missingFields.slice(0, 3);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onDismiss()}>
      <DialogContent
        ariaLabel="Meet opportunities picked for you"
        className="max-h-[calc(100dvh-2rem)] max-w-3xl overflow-y-auto rounded-[28px] border-white/70 bg-surface-layer p-0 shadow-[0_30px_90px_rgba(15,45,92,0.28)]"
      >
        <button
          type="button"
          onClick={onDismiss}
          className="absolute right-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/80 text-slate-500 shadow-sm backdrop-blur transition hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 active:scale-[0.97] dark:bg-slate-900/75 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white"
          aria-label="Close profile prompt"
        >
          <X size={18} />
        </button>

        <div className="grid md:grid-cols-[0.86fr_1.14fr]">
          <div className="relative flex min-h-[210px] items-end justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_38%,rgba(45,212,191,0.2),transparent_42%),linear-gradient(145deg,#eaf3ff_0%,#f7fbff_54%,#e8fbf7_100%)] px-6 pt-9 md:min-h-[470px] md:items-center md:px-8 md:pt-8 dark:bg-[radial-gradient(circle_at_50%_38%,rgba(45,212,191,0.16),transparent_42%),linear-gradient(145deg,#10213f_0%,#0c1830_54%,#0b292a_100%)]">
            <span className="absolute left-7 top-8 h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_0_6px_rgba(251,191,36,0.12)]" />
            <span className="absolute bottom-14 right-7 h-3 w-3 rounded-full bg-cyan-400/80 shadow-[0_0_0_8px_rgba(34,211,238,0.1)]" />
            <div className="absolute inset-x-10 bottom-3 h-12 rounded-[50%] bg-blue-900/10 blur-xl dark:bg-cyan-400/10" />
            <img
              src="/mascot/edutu-profile-guide.png"
              alt="Edutu mascot holding a completed profile checklist"
              className="relative z-10 w-[188px] select-none object-contain drop-shadow-[0_22px_24px_rgba(16,63,126,0.18)] md:w-[300px]"
              draggable={false}
            />
          </div>

          <div className="flex flex-col justify-center px-6 pb-7 pt-6 sm:px-8 sm:pb-8 md:px-10 md:py-12">
            <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-xl bg-brand-500/10 px-3 py-2 text-xs font-semibold text-brand-700 dark:text-brand-300">
              <Clock3 size={14} />
              About 2 minutes
            </div>

            <DialogTitle className="max-w-md !text-2xl font-bold leading-[1.08] tracking-[-0.035em] text-text-primary sm:!text-[2rem]">
              Meet opportunities picked for you
            </DialogTitle>
            <DialogDescription className="mt-3 max-w-md text-sm font-medium leading-6 text-text-muted">
              Tell Edutu what you study, where you are, and what you are working
              toward. We will use those details to replace the empty feed with
              matches that fit your next move.
            </DialogDescription>

            {nextFields.length > 0 ? (
              <div className="mt-5 rounded-2xl bg-surface-elevated px-4 py-3.5">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                  We will start with
                </p>
                <ul className="mt-2.5 flex flex-wrap gap-2">
                  {nextFields.map((field) => (
                    <li
                      key={field}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-surface-layer px-2.5 py-1.5 text-xs font-semibold text-text-secondary shadow-sm"
                    >
                      <Check size={13} className="text-emerald-500" />
                      {field}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={onComplete}
                className="group inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-500 px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(20,110,245,0.24)] transition hover:-translate-y-0.5 hover:bg-brand-600 hover:shadow-[0_14px_28px_rgba(20,110,245,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 active:translate-y-0 active:scale-[0.98]"
              >
                Complete my profile
                <ArrowRight
                  size={17}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </button>
              <button
                type="button"
                onClick={onDismiss}
                className="h-12 rounded-2xl px-5 text-sm font-semibold text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 active:scale-[0.98]"
              >
                Maybe later
              </button>
            </div>

            <p className="mt-4 hidden text-xs font-medium leading-5 text-text-muted sm:block">
              You can update these details anytime from your profile.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
