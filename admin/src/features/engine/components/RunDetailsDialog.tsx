import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type {
  ReviewOpportunity,
  SaveSelectedOutcome,
} from "../hooks/useEngineRuns";
import type { EngineResourceState } from "../model/errors";
import type { ScrapeJob } from "../model/types";
import EngineUnavailableState from "./EngineUnavailableState";

function logMessage(entry: string | Record<string, unknown>) {
  if (typeof entry === "string") return entry;
  if (typeof entry.message === "string") return entry.message;
  try {
    return JSON.stringify(entry);
  } catch {
    return "Unstructured log entry";
  }
}

function count(job: ScrapeJob, kind: "found" | "saved" | "failed") {
  if (kind === "found") {
    return job.items_found || job.urls_discovered || job.urls_scraped || 0;
  }
  if (kind === "saved") return job.urls_saved || 0;
  return job.urls_failed || 0;
}

export default function RunDetailsDialog({
  job,
  opportunities,
  saving,
  onClose,
  onToggleSelected,
  onSetAllSelected,
  onImproveSelected,
  onSaveSelected,
}: {
  job: ScrapeJob;
  opportunities: EngineResourceState<ReviewOpportunity[]>;
  saving: boolean;
  onClose(): void;
  onToggleSelected(index: number): void;
  onSetAllSelected(selected: boolean): void;
  onImproveSelected(): Promise<void>;
  onSaveSelected(): Promise<SaveSelectedOutcome>;
}) {
  const [outcome, setOutcome] = useState<SaveSelectedOutcome | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const errors = useMemo(() => (job.errors || []).map(logMessage), [job.errors]);
  const warnings = useMemo(
    () => (job.warnings || []).map(logMessage),
    [job.warnings],
  );
  const reviewItems = opportunities.data || [];
  const selectedCount = reviewItems.filter((item) => item.selected).length;
  const allSelected = reviewItems.length > 0 && selectedCount === reviewItems.length;
  const improving = reviewItems.some((item) => item.improving);

  const improve = async () => {
    setActionError(null);
    try {
      await onImproveSelected();
    } catch {
      setActionError("Selected opportunities could not be improved.");
    }
  };

  const save = async () => {
    setActionError(null);
    setOutcome(null);
    try {
      setOutcome(await onSaveSelected());
    } catch {
      setActionError("Selected opportunities could not be published.");
    }
  };

  return (
    <div className="engine-dialog-layer">
      <button
        type="button"
        className="engine-dialog-scrim"
        aria-label="Close run details"
        onClick={onClose}
      />
      <section
        className="engine-dialog engine-job-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Run ${job.id} details`}
      >
        <header className="engine-dialog-header">
          <div>
            <p className="engine-card-eyebrow">Run inspection</p>
            <h2>{job.source_name || `Source #${job.source_id}`}</h2>
            <span>{job.id}</span>
          </div>
          <button type="button" aria-label="Close run details" onClick={onClose}>
            <X size={19} aria-hidden="true" />
          </button>
        </header>

        <div className="engine-job-summary">
          <div>
            <strong>{count(job, "found")}</strong>
            <span>Found</span>
          </div>
          <div>
            <strong>{job.urls_scraped || 0}</strong>
            <span>Scraped</span>
          </div>
          <div>
            <strong>{count(job, "saved")}</strong>
            <span>Saved</span>
          </div>
          <div>
            <strong>{count(job, "failed")}</strong>
            <span>Failed</span>
          </div>
        </div>

        {errors.length > 0 ? (
          <section className="engine-log-panel engine-log-panel--error">
            <h3>Errors</h3>
            <ul>
              {errors.map((entry, index) => (
                <li key={`${index}:${entry}`}>{entry}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {warnings.length > 0 ? (
          <section className="engine-log-panel engine-log-panel--warning">
            <h3>Warnings</h3>
            <ul>
              {warnings.map((entry, index) => (
                <li key={`${index}:${entry}`}>{entry}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="engine-review-panel" aria-labelledby="run-review-title">
          <header className="engine-review-header">
            <div>
              <p className="engine-card-eyebrow">Result review</p>
              <h3 id="run-review-title">Produced opportunities</h3>
              <span>{selectedCount} selected</span>
            </div>
            {reviewItems.length > 0 ? (
              <div className="engine-review-actions">
                <label>
                  <input
                    type="checkbox"
                    aria-label="Select all opportunities"
                    checked={allSelected}
                    onChange={(event) => onSetAllSelected(event.target.checked)}
                  />
                  Select all
                </label>
                <button
                  type="button"
                  aria-label="Improve selected"
                  disabled={selectedCount === 0 || improving || saving}
                  onClick={() => void improve()}
                >
                  {improving ? (
                    <Loader2 className="is-spinning" size={16} aria-hidden="true" />
                  ) : (
                    <Sparkles size={16} aria-hidden="true" />
                  )}
                  Improve selected
                </button>
                <button
                  type="button"
                  className="engine-primary-action"
                  aria-label="Publish selected"
                  disabled={selectedCount === 0 || improving || saving}
                  onClick={() => void save()}
                >
                  {saving ? (
                    <Loader2 className="is-spinning" size={16} aria-hidden="true" />
                  ) : (
                    <Save size={16} aria-hidden="true" />
                  )}
                  Publish selected
                </button>
              </div>
            ) : null}
          </header>

          {opportunities.status === "loading" ? (
            <div className="engine-table-empty" aria-busy="true">
              <Loader2 className="is-spinning" size={22} aria-hidden="true" />
              <strong>Loading opportunities</strong>
            </div>
          ) : opportunities.status === "error" && !opportunities.data ? (
            <EngineUnavailableState
              title="Run opportunities unavailable"
              description="The opportunities produced by this run could not be loaded."
              error={opportunities.error}
            />
          ) : reviewItems.length === 0 ? (
            <p>No opportunity records were associated with this run.</p>
          ) : (
            <div className="engine-review-list">
              {reviewItems.map((item, index) => (
                <article key={`${item.current.id || index}:${item.original.title}`}>
                  <label className="engine-review-select">
                    <input
                      type="checkbox"
                      aria-label={`Select ${item.current.title}`}
                      checked={item.selected}
                      onChange={() => onToggleSelected(index)}
                    />
                  </label>
                  <div className="engine-review-copy">
                    <strong>{item.original.title}</strong>
                    {item.current.title !== item.original.title ? (
                      <span className="engine-review-improved-title">
                        {item.current.title}
                      </span>
                    ) : null}
                    <span>
                      {item.current.organization || item.current.source || "Unknown source"}
                    </span>
                    {item.current.description || item.current.summary ? (
                      <p>{item.current.description || item.current.summary}</p>
                    ) : null}
                    {item.error ? (
                      <div className="engine-inline-error" role="alert">
                        <AlertTriangle size={14} aria-hidden="true" />
                        <span>{item.error.message}</span>
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}

          {outcome ? (
            <div className="engine-review-message" role="status">
              <CheckCircle2 size={17} aria-hidden="true" />
              <span>
                Published {outcome.inserted}; skipped {outcome.skipped}; failed {outcome.failed}.
              </span>
            </div>
          ) : null}
          {actionError ? (
            <div className="engine-run-error" role="alert">
              <AlertTriangle size={17} aria-hidden="true" />
              <span>{actionError}</span>
            </div>
          ) : null}
        </section>
      </section>
    </div>
  );
}
