import { Loader2, Minus, Sparkles, X } from "lucide-react";
import "./bulk-enhancement-progress.css";

export interface AiCompletionJobState {
  status: "running" | "cancelling";
  done: number;
  total: number;
  completed: number;
  failed: number;
  batchStart: number;
  batchEnd: number;
}

interface BulkEnhancementProgressPopupProps {
  job: AiCompletionJobState;
  minimized: boolean;
  onMinimize: () => void;
  onRestore: () => void;
  onCancel: () => void;
}

function percentComplete(job: AiCompletionJobState): number {
  if (job.total <= 0) return 0;
  return Math.min(100, Math.round((job.done / job.total) * 100));
}

export default function BulkEnhancementProgressPopup({
  job,
  minimized,
  onMinimize,
  onRestore,
  onCancel,
}: BulkEnhancementProgressPopupProps) {
  const percent = percentComplete(job);
  const remaining = Math.max(job.total - job.done, 0);
  const isCancelling = job.status === "cancelling";

  if (minimized) {
    return (
      <button
        type="button"
        className="ai-completion-chip"
        aria-label="Expand AI completion progress"
        onClick={onRestore}
      >
        <span className="ai-completion-chip-icon" aria-hidden="true">
          <Loader2 size={16} />
        </span>
        <span className="ai-completion-chip-copy">
          <strong>{isCancelling ? "Cancelling…" : "AI completing"}</strong>
          <span>
            {job.done} / {job.total}
          </span>
        </span>
        <span className="ai-completion-chip-percent">{percent}%</span>
      </button>
    );
  }

  return (
    <section
      className="ai-completion-popup"
      role="status"
      aria-label="AI completion progress"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="ai-completion-popup-header">
        <span className="ai-completion-popup-mark" aria-hidden="true">
          <Sparkles size={18} />
        </span>
        <div className="ai-completion-popup-heading">
          <h2>AI completing opportunity details</h2>
          <p>Safe to minimize while you continue working</p>
        </div>
        <button
          type="button"
          className="ai-completion-icon-button"
          aria-label="Minimize AI completion progress"
          onClick={onMinimize}
        >
          <Minus size={18} />
        </button>
      </div>

      <div className="ai-completion-current-batch">
        <span className="ai-completion-loader" aria-hidden="true">
          <Loader2 size={20} />
        </span>
        <div>
          <strong>
            {isCancelling
              ? "Stopping after the current request…"
              : `Improving ${job.batchStart}–${job.batchEnd} of ${job.total}`}
          </strong>
          <p>
            {isCancelling
              ? "Completed changes are kept. Unfinished items stay selected."
              : "Reading source details, deadlines, eligibility, and benefits."}
          </p>
        </div>
      </div>

      <div className="ai-completion-progress-heading">
        <span>{percent}% complete</span>
        <span>
          {job.done} of {job.total}
        </span>
      </div>
      <div
        className="ai-completion-progress-track"
        role="progressbar"
        aria-label="Opportunity completion progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <span style={{ width: `${percent}%` }} />
      </div>

      <div className="ai-completion-stats" aria-label="Completion totals">
        <div>
          <strong>{job.completed}</strong>
          <span>Completed</span>
        </div>
        <div>
          <strong>{job.failed}</strong>
          <span>Needs retry</span>
        </div>
        <div>
          <strong>{remaining}</strong>
          <span>Remaining</span>
        </div>
      </div>

      <div className="ai-completion-popup-footer">
        <p>Each result is saved as its batch finishes.</p>
        <button
          type="button"
          className="ai-completion-cancel-button"
          aria-label="Cancel AI completion"
          disabled={isCancelling}
          onClick={onCancel}
        >
          <X size={15} />
          {isCancelling ? "Cancelling…" : "Cancel"}
        </button>
      </div>
    </section>
  );
}
