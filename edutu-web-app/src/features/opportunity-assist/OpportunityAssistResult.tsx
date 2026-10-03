import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { CoachTurn } from "../ai-coach/stream";
import type {
  OpportunityAssistBusy,
  OpportunityPlan,
} from "./opportunityAssistTypes";

export function OpportunityAssistResult({
  opportunityId,
  selectedTitle,
  text,
  turn,
  plan,
  busy,
  saved,
  onSavePlan,
}: {
  opportunityId: string;
  selectedTitle: string;
  text: string;
  turn: CoachTurn | null;
  plan: OpportunityPlan | null;
  busy: OpportunityAssistBusy;
  saved: boolean;
  onSavePlan: () => void;
}) {
  if (text) {
    return (
      <section
        aria-label="AI guidance result"
        className="mt-4 rounded-xl border border-subtle bg-surface p-4 sm:p-5"
      >
        <h3 className="text-sm font-semibold text-text-primary">{selectedTitle}</h3>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">
          {text}
        </p>
        {turn && (
          <Link
            className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            to={`/app/coach?opportunityId=${encodeURIComponent(opportunityId)}&threadId=${encodeURIComponent(turn.threadId)}`}
          >
            Continue with AI Coach <ArrowRight size={16} aria-hidden="true" />
          </Link>
        )}
      </section>
    );
  }

  if (!plan) return null;

  return (
    <section className="mt-4 space-y-5 rounded-xl border border-subtle bg-surface p-4 sm:p-5">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">
          Your preparation plan
        </h3>
        {plan.generatedBy === "fallback" && (
          <p role="status" className="mt-2 text-xs leading-relaxed text-text-muted">
            AI was unavailable. Use this as a starting checklist and verify each item with the official requirements.
          </p>
        )}
      </div>

      <div className="space-y-3">
        <p className="text-sm leading-relaxed text-text-secondary">{plan.summary}</p>
        <p className="text-sm leading-relaxed text-text-secondary">
          {plan.winningStrategy}
        </p>
      </div>

      <ol className="space-y-3 border-l border-subtle pl-4">
        {plan.milestones.map((milestone, index) => (
          <li key={`${milestone.id}:${index}`}>
            <h4 className="text-sm font-semibold text-text-primary">
              {index + 1}. {milestone.title}
            </h4>
            <p className="mt-1 text-xs leading-relaxed text-text-muted">
              {milestone.description}
            </p>
          </li>
        ))}
      </ol>

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Application checklist
        </h4>
        <ul className="mt-3 space-y-2.5 text-sm text-text-secondary">
          {plan.checklist.map((item, index) => (
            <li key={`${index}:${item}`} className="flex items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 shrink-0 text-brand" size={16} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {(plan.requirementActions.length > 0 || plan.profileGaps.length > 0) && (
        <div className="space-y-3 rounded-lg border border-subtle bg-surface-layer p-3.5">
          {plan.requirementActions.map((item, index) => (
            <p key={`${index}:${item.requirement}`} className="text-sm leading-relaxed">
              <strong>{item.requirement}: </strong>{item.action}
            </p>
          ))}
          {plan.profileGaps.map((item, index) => (
            <p key={`${index}:${item.gap}`} className="text-sm leading-relaxed">
              <strong>{item.gap}: </strong>{item.action}
            </p>
          ))}
        </div>
      )}

      {[...plan.supportActions, ...plan.bestPractices].length > 0 && (
        <details className="rounded-lg border border-subtle p-3.5">
          <summary className="min-h-9 cursor-pointer text-sm font-semibold text-text-secondary">
            Support and best practices
          </summary>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed text-text-muted">
            {[...plan.supportActions, ...plan.bestPractices].map((item, index) => (
              <li key={`${index}:${item}`}>{item}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-subtle pt-4">
        <button
          type="button"
          className="feature-button"
          disabled={busy !== null || saved}
          onClick={onSavePlan}
        >
          {saved ? "Plan saved" : busy === "save" ? "Saving plan…" : "Save preparation plan"}
        </button>
        {saved && (
          <Link
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            to="/app/goals"
          >
            Open my preparation plans <ArrowRight size={16} aria-hidden="true" />
          </Link>
        )}
      </div>
    </section>
  );
}
