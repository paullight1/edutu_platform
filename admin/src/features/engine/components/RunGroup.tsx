import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Eye,
  LoaderCircle,
  Trash2,
} from "lucide-react";
import type { ScrapeJob } from "../model/types";

interface RunGroupProps {
  label: string;
  jobs: readonly ScrapeJob[];
  pendingOperations: ReadonlySet<string>;
  onInspect(job: ScrapeJob): void;
  onDelete(job: ScrapeJob): void;
}

function statusIcon(status: string) {
  if (status === "completed" || status === "success") {
    return <CheckCircle2 size={15} aria-hidden="true" />;
  }
  if (status === "failed" || status === "error") {
    return <AlertTriangle size={15} aria-hidden="true" />;
  }
  return <LoaderCircle size={15} aria-hidden="true" />;
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown time"
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function RunGroup({
  label,
  jobs,
  pendingOperations,
  onInspect,
  onDelete,
}: RunGroupProps) {
  return (
    <section className="engine-run-group" aria-labelledby={`run-group-${label}`}>
      <h3 id={`run-group-${label}`}>{label}</h3>
      <div className="engine-run-group-list">
        {jobs.map((job) => {
          const failed = (job.urls_failed || 0) > 0 || job.errors.length > 0;
          return (
            <article key={job.id} className="engine-run-history-row">
              <span
                className={`engine-run-history-status engine-run-history-status--${job.status}`}
                aria-hidden="true"
              >
                {statusIcon(job.status)}
              </span>
              <div className="engine-run-history-copy">
                <div>
                  <strong>{job.source_name || `Source ${job.source_id}`}</strong>
                  <span className="engine-status-chip engine-status-chip--neutral">
                    {job.run_type || "manual"}
                  </span>
                  <span
                    className={`engine-status-chip ${
                      failed
                        ? "engine-status-chip--warning"
                        : "engine-status-chip--success"
                    }`}
                  >
                    {job.status}
                  </span>
                </div>
                <p>
                  <Clock3 size={12} aria-hidden="true" />
                  {formatTime(job.started_at)} · {job.urls_scraped.toLocaleString()} scraped ·{" "}
                  {(job.urls_saved ?? job.items_found ?? 0).toLocaleString()} saved
                  {job.urls_failed ? ` · ${job.urls_failed.toLocaleString()} failed` : ""}
                </p>
              </div>
              <div className="engine-run-history-actions">
                <button
                  type="button"
                  className="engine-source-action engine-source-action--primary"
                  aria-label={`Inspect run ${job.id}`}
                  onClick={() => onInspect(job)}
                >
                  <Eye size={14} aria-hidden="true" />
                  Inspect
                </button>
                <button
                  type="button"
                  className="engine-source-action engine-source-action--danger"
                  aria-label={`Delete run ${job.id}`}
                  disabled={pendingOperations.has(`delete-job:${job.id}`)}
                  onClick={() => onDelete(job)}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  Delete
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
