import {
  AlertTriangle,
  CheckSquare2,
  DatabaseZap,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type {
  ReviewedOpportunity,
  SaveSelectedOutcome,
} from "../hooks/useEngineRuns";
import type { EngineResourceState } from "../model/errors";
import type { ScrapeJob } from "../model/types";
import OpportunityReview from "./OpportunityReview";

interface JobDetailsDialogProps {
  job: ScrapeJob | null;
  opportunities: EngineResourceState<ReviewedOpportunity[]>;
  pendingOperations: ReadonlySet<string>;
  onClose(): void;
  onDelete(job: ScrapeJob): void;
  onToggle(index: number): void;
  onSelectAll(): void;
  onImprove(): Promise<void>;
  onSave(): Promise<SaveSelectedOutcome>;
  onNotice(message: string, tone: "success" | "warning" | "error"): void;
}

function diagnosticText(value: string | Record<string, unknown>): string {
  if (typeof value === "string") return value;
  if (typeof value.message === "string") return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return "Unserializable diagnostic entry";
  }
}

export default function JobDetailsDialog({
  job,
  opportunities,
  pendingOperations,
  onClose,
  onDelete,
  onToggle,
  onSelectAll,
  onImprove,
  onSave,
  onNotice,
}: JobDetailsDialogProps) {
  if (!job) return null;

  const items = opportunities.data ?? [];
  const selectedCount = items.filter((entry) => entry.selected).length;
  const improving = pendingOperations.has("improve-opportunities");
  const saving = pendingOperations.has("save-opportunities");

  const improve = async () => {
    try {
      await onImprove();
      onNotice("AI improvement previews are ready for review.", "success");
    } catch (error) {
      onNotice(
        error instanceof Error ? error.message : "AI improvement failed.",
        "error",
      );
    }
  };

  const save = async () => {
    try {
      const result = await onSave();
      onNotice(
        result.failed
          ? `Saved ${result.inserted}, skipped ${result.skipped}, failed ${result.failed}.`
          : `Saved ${result.inserted} opportunities${result.skipped ? `, skipped ${result.skipped}` : ""}.`,
        result.failed ? "warning" : "success",
      );
    } catch (error) {
      onNotice(
        error instanceof Error ? error.message : "Opportunity publication failed.",
        "error",
      );
    }
  };

  return (
    <div className="engine-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="engine-dialog engine-job-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="engine-job-details-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="engine-dialog-header">
          <div>
            <p className="engine-card-eyebrow">Run inspection</p>
            <h2 id="engine-job-details-title">Job details</h2>
            <p>
              {job.source_name || `Source ${job.source_id}`} · {job.status} · {job.id}
            </p>
          </div>
          <button
            type="button"
            className="engine-icon-button"
            aria-label="Close job details"
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="engine-job-dialog-body">
          <section className="engine-job-metrics" aria-label="Job metrics">
            <div><span>Discovered</span><strong>{job.urls_discovered.toLocaleString()}</strong></div>
            <div><span>Scraped</span><strong>{job.urls_scraped.toLocaleString()}</strong></div>
            <div><span>Saved</span><strong>{(job.urls_saved ?? job.items_found ?? 0).toLocaleString()}</strong></div>
            <div><span>Failed</span><strong>{(job.urls_failed ?? 0).toLocaleString()}</strong></div>
            <div><span>Duration</span><strong>{job.duration_seconds.toLocaleString()}s</strong></div>
          </section>

          {job.errors.length > 0 || job.warnings.length > 0 ? (
            <section className="engine-job-diagnostics" aria-label="Run diagnostics">
              {job.errors.length > 0 ? (
                <div className="engine-job-diagnostics-group engine-job-diagnostics-group--error">
                  <h3><AlertTriangle size={15} aria-hidden="true" /> Errors</h3>
                  <ul>{job.errors.map((entry, index) => <li key={index}>{diagnosticText(entry)}</li>)}</ul>
                </div>
              ) : null}
              {job.warnings.length > 0 ? (
                <div className="engine-job-diagnostics-group engine-job-diagnostics-group--warning">
                  <h3><AlertTriangle size={15} aria-hidden="true" /> Warnings</h3>
                  <ul>{job.warnings.map((entry, index) => <li key={index}>{diagnosticText(entry)}</li>)}</ul>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="engine-job-opportunities" aria-labelledby="engine-job-opportunities-title">
            <header>
              <div>
                <h3 id="engine-job-opportunities-title">Opportunity review</h3>
                <p>{selectedCount.toLocaleString()} of {items.length.toLocaleString()} selected</p>
              </div>
              <div className="engine-job-review-actions">
                <button
                  type="button"
                  className="engine-source-action"
                  disabled={items.length === 0}
                  onClick={onSelectAll}
                >
                  <CheckSquare2 size={14} aria-hidden="true" /> Select all
                </button>
                <button
                  type="button"
                  className="engine-source-action engine-source-action--primary"
                  aria-label="Improve selected"
                  disabled={selectedCount === 0 || improving || opportunities.status !== "success"}
                  onClick={() => void improve()}
                >
                  <Sparkles size={14} aria-hidden="true" />
                  {improving ? "Improving…" : "Improve selected"}
                </button>
                <button
                  type="button"
                  className="engine-primary-button"
                  aria-label="Save selected"
                  disabled={selectedCount === 0 || saving || opportunities.status !== "success"}
                  onClick={() => void save()}
                >
                  <DatabaseZap size={14} aria-hidden="true" />
                  {saving ? "Saving…" : "Save selected"}
                </button>
              </div>
            </header>

            {opportunities.status === "loading" && opportunities.data === null ? (
              <p className="engine-job-loading" role="status">Loading opportunities…</p>
            ) : opportunities.status === "error" && opportunities.data === null ? (
              <p className="engine-form-error" role="alert">{opportunities.error?.message}</p>
            ) : items.length === 0 ? (
              <div className="engine-job-empty">
                <h4>No opportunities were persisted for this run</h4>
                <p>The job record is valid, but there are no attributable review rows.</p>
              </div>
            ) : (
              <div className="engine-opportunity-review-list">
                {items.map((entry, index) => (
                  <OpportunityReview
                    key={`${entry.current.id ?? index}-${index}`}
                    entry={entry}
                    index={index}
                    onToggle={onToggle}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        <footer className="engine-job-dialog-footer">
          <button
            type="button"
            className="engine-source-action engine-source-action--danger"
            disabled={pendingOperations.has(`delete-job:${job.id}`)}
            onClick={() => onDelete(job)}
          >
            <Trash2 size={14} aria-hidden="true" /> Delete run and attributable data
          </button>
          <button type="button" className="engine-secondary-button" onClick={onClose}>
            Close
          </button>
        </footer>
      </section>
    </div>
  );
}
