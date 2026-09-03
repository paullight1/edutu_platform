import { ArrowRight, CheckCircle2 } from "lucide-react";
import Button from "../ui/Button";
import type { OpportunityNextActionView } from "../../services/opportunityJourney";

export default function NextActionCard({
  action,
  progress,
  onContinue,
}: {
  action: OpportunityNextActionView;
  progress?: { percent: number } | null;
  onContinue: () => void;
}) {
  const percent = Math.max(0, Math.min(100, progress?.percent ?? 0));
  return (
    <section className="rounded-2xl border border-brand-500/35 bg-surface-layer p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-600">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-text-muted">
              Your next action
            </p>
            <h2 className="mt-1 text-lg font-bold text-text-primary">
              {action.label}
            </h2>
            {action.dueAt ? (
              <p className="mt-1 text-sm text-text-secondary">
                Due {new Date(action.dueAt).toLocaleDateString()}
              </p>
            ) : null}
          </div>
        </div>
        <Button type="button" onClick={onContinue} className="shrink-0">
          Continue
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-elevated">
        <div
          className="h-full rounded-full bg-brand-500 transition-[width]"
          style={{ width: `${percent}%` }}
          aria-label={`${percent}% complete`}
        />
      </div>
    </section>
  );
}
