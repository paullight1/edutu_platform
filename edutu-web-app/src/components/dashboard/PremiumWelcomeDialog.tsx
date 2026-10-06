import { ArrowRight, Check, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/Dialog";

const benefits = [
  "See how well each opportunity fits your profile",
  "Use AI to plan and prepare stronger applications",
  "Build your CV and keep application documents together",
];

export function PremiumWelcomeDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent
        ariaLabel="Edutu Premium introduction"
        className="max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto overscroll-contain rounded-[28px] p-5 sm:p-7"
      >
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
          <Sparkles size={23} aria-hidden="true" />
        </div>
        <DialogHeader>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
            A better way to move forward
          </p>
          <DialogTitle className="mt-2 text-2xl font-bold tracking-tight">
            Edutu just got better
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm leading-6">
            Your free account still gives you access to opportunities. Premium adds practical AI guidance to help you turn the right one into a strong application.
          </DialogDescription>
        </DialogHeader>

        <ul className="my-5 space-y-3 rounded-2xl bg-surface-body p-4">
          {benefits.map((benefit) => (
            <li key={benefit} className="flex gap-3 text-sm leading-5 text-text-primary">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                <Check size={13} aria-hidden="true" />
              </span>
              {benefit}
            </li>
          ))}
        </ul>

        <p className="text-xs leading-5 text-text-muted">
          Choose a plan that fits your workload. You can keep browsing opportunities for free.
        </p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Link
            to="/upgrade"
            onClick={onClose}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            View Premium plans <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 rounded-xl border border-subtle px-4 py-3 text-sm font-semibold text-text-secondary transition hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            Continue with free
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
