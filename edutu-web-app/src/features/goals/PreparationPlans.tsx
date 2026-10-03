import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Map } from "lucide-react";
import { errorMessage, json, useProductSession } from "../workspace/shared";
import { ToolError } from "../workspace/WorkspaceDialog";

interface Step {
  id: string;
  title: string;
  description?: string;
  completed?: boolean;
}
interface Plan {
  id: string;
  title: string;
  description: string;
  opportunityId?: string;
  steps: Step[];
}
interface Enrollment {
  id: string;
  roadmap_id: string;
  progress: number;
  completed_steps: string[];
  adopted_plan?: { steps?: Step[] };
}
interface EnrollmentRow { enrollment: Enrollment; roadmap: Plan }

export default function PreparationPlans({ onImported }: { onImported?: () => void }) {
  const { request, userId } = useProductSession();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const [ownedPlans, activeEnrollments] = await Promise.all([
        request<Plan[]>("/roadmaps/mine", { signal }),
        request<EnrollmentRow[]>("/roadmaps/my-enrollments", { signal }),
      ]);
      if (!signal?.aborted) {
        setPlans(ownedPlans);
        setEnrollments(activeEnrollments);
      }
    } catch (e) {
      if (!signal?.aborted) setError(errorMessage(e));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, userId]);

  async function adopt(plan: Plan) {
    setBusy(plan.id);
    setError(null);
    try {
      await request(`/roadmaps/adopt/${encodeURIComponent(plan.id)}`, {
        method: "POST",
        body: json({ opportunityId: plan.opportunityId }),
      });
      await load();
      onImported?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function setStep(planId: string, stepId: string, completed: boolean) {
    setBusy(`${planId}:${stepId}`);
    setError(null);
    try {
      await request(`/roadmaps/progress/${encodeURIComponent(planId)}`, {
        method: "POST",
        body: json({ stepId, completed }),
      });
      await load();
      onImported?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const enrollmentByPlan = new globalThis.Map<string, Enrollment>(
    enrollments.map(({ enrollment }) => [enrollment.roadmap_id, enrollment]),
  );

  return <section>
    <ToolError error={error} onRetry={() => void load()} />
    {loading ? <p role="status" className="feature-muted">Loading plans…</p> : plans.length === 0 ? <div className="tool-empty">
      <span className="tool-icon"><Map size={25}/></span>
      <h2>No preparation plans yet</h2>
      <p>Open an opportunity and build a plan for it.</p>
      <Link to="/app/opportunities" className="feature-button">Explore opportunities <ArrowRight size={16}/></Link>
    </div> : <div className="tool-list">{plans.map((plan) => {
      const enrollment = enrollmentByPlan.get(plan.id);
      const steps = enrollment?.adopted_plan?.steps ?? [];
      const completed = new Set(enrollment?.completed_steps ?? []);
      return <article className="tool-card" key={plan.id}>
        <div className="tool-row">
          <span className="tool-icon" data-kind="essay"><Map size={18}/></span>
          <div className="min-w-0"><h2>{plan.title}</h2><p>{plan.description}</p></div>
        </div>
        {enrollment ? <>
          <div className="mt-4 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full bg-brand transition-all" style={{ width: `${enrollment.progress}%` }}/></div>
            <span className="text-sm font-semibold">{enrollment.progress}%</span>
          </div>
          <ol className="mt-4 space-y-3">{steps.map((step) => <li key={step.id}>
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1 accent-brand" checked={completed.has(step.id)} disabled={busy !== null} onChange={(event) => void setStep(plan.id, step.id, event.target.checked)} />
              <span className={completed.has(step.id) ? "line-through opacity-60" : ""}><strong>{step.title}</strong>{step.description && <span className="feature-muted block">{step.description}</span>}</span>
              {busy === `${plan.id}:${step.id}` && <span className="feature-muted ms-auto">Saving…</span>}
            </label>
          </li>)}</ol>
        </> : <details className="mt-3">
          <summary>View {plan.steps.length} steps</summary>
          <ol className="space-y-3 ps-5 text-sm">{plan.steps.map((step, index) => <li key={step.id || index}><strong>{step.title}</strong>{step.description && <p className="feature-muted">{step.description}</p>}</li>)}</ol>
        </details>}
        <div className="tool-card-footer">
          <span>{enrollment ? `${completed.size} of ${steps.length} steps complete` : `${plan.steps.length} steps · track progress`}</span>
          <div className="tool-actions">
            {plan.opportunityId && <Link className="text-brand" to={`/app/opportunity/${encodeURIComponent(plan.opportunityId)}`}>Opportunity</Link>}
            {!enrollment && <button className="feature-button secondary" disabled={busy !== null} onClick={() => void adopt(plan)}>{busy === plan.id ? "Starting…" : "Start plan"}</button>}
            {enrollment && enrollment.progress === 100 && <span className="inline-flex items-center gap-1 text-sm text-brand"><Check size={15}/>Complete</span>}
          </div>
        </div>
      </article>;
    })}</div>}
  </section>;
}
