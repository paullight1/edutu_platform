import { useState } from "react";
import { X, CalendarClock, ExternalLink } from "lucide-react";

export interface DeadlineOutcome {
  opportunityId: string;
  title: string;
  deadline?: string | null;
  confidence?: string | null;
  failed?: boolean;
  needsReview?: boolean;
  reason?: string | null;
  sourceUrl?: string | null;
}

export interface DeadlineJob {
  ids: string[];
  done: number;
  status: "running" | "completed" | "stopped" | "error";
  outcomes: DeadlineOutcome[];
  stopping?: boolean;
  message?: string;
}

export default function DeadlineRecoveryPopup({
  job,
  onClose,
  onStop,
  onRetry,
}: {
  job: DeadlineJob;
  onClose: () => void;
  onStop: () => void;
  onRetry: (ids: string[]) => void;
}) {
  const [unresolvedOnly, setUnresolvedOnly] = useState(true);
  const resolved = new Set(
    job.outcomes
      .filter((item) => item.deadline || item.confidence === "rolling")
      .map((item) => item.opportunityId),
  );
  const unresolvedIds = job.ids.filter((id) => !resolved.has(id));
  const shown = job.outcomes.filter(
    (item) => !unresolvedOnly || !resolved.has(item.opportunityId),
  );
  const found = job.outcomes.filter((item) => item.deadline).length;
  const rolling = job.outcomes.filter(
    (item) => item.confidence === "rolling",
  ).length;
  const failed = job.outcomes.filter((item) => item.failed).length;
  const progress = Math.round((job.done / Math.max(1, job.ids.length)) * 100);
  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <section
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="deadline-job-title"
        style={{
          width: "min(720px, 94vw)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <h2 id="deadline-job-title" style={{ margin: 0 }}>
            <CalendarClock size={22} /> Deadline recovery
          </h2>
          <button
            className="btn btn-secondary"
            aria-label={
              job.status === "running"
                ? "Minimize deadline recovery"
                : "Close deadline recovery"
            }
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <p style={{ color: "var(--text-secondary)" }}>
          Checks source articles and application pages. Only dates supported by
          closing-date evidence are saved.
        </p>
        <div
          role="progressbar"
          aria-label="Deadline checks"
          aria-valuenow={job.done}
          aria-valuemin={0}
          aria-valuemax={job.ids.length}
          style={{
            height: 8,
            borderRadius: 8,
            background: "var(--bg-secondary)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: "100%",
              background: "var(--apple-blue)",
              transition: "width .3s",
            }}
          />
        </div>
        <p role="status" aria-live="polite">
          {job.done}/{job.ids.length} checked · {found} found · {rolling}{" "}
          rolling · {failed} failed
        </p>
        {job.message && <p role="alert">{job.message}</p>}
        {job.status === "running" && (
          <p>
            {job.stopping
              ? "Stopping after the current batch…"
              : "Reading up to six opportunities at a time. You can minimize this window while checks continue."}
          </p>
        )}
        <label
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            margin: "16px 0",
          }}
        >
          <input
            type="checkbox"
            checked={unresolvedOnly}
            onChange={(event) => setUnresolvedOnly(event.target.checked)}
          />{" "}
          Show unresolved only
        </label>
        <div
          style={{
            display: "grid",
            gap: 8,
            maxHeight: "38vh",
            overflowY: "auto",
          }}
        >
          {shown.length === 0 && (
            <p>
              {job.done
                ? "No unresolved results in the checked batch."
                : "Waiting for the first results…"}
            </p>
          )}
          {shown.map((item) => (
            <article
              key={item.opportunityId}
              style={{
                padding: 14,
                border: "1px solid var(--border-color)",
                borderRadius: 12,
                background: "var(--bg-secondary)",
              }}
            >
              <strong>{item.title}</strong>
              <p style={{ margin: "8px 0", color: "var(--text-secondary)" }}>
                {item.deadline
                  ? `Saved deadline: ${item.deadline}`
                  : item.confidence === "rolling"
                    ? "Confirmed rolling applications"
                    : item.reason || "No application deadline confirmed."}
              </p>
              {item.sourceUrl && /^https?:\/\//i.test(item.sourceUrl) && (
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Review source <ExternalLink size={13} />
                </a>
              )}
            </article>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "flex-end",
            gap: 10,
            marginTop: 20,
          }}
        >
          {job.status === "running" ? (
            <button
              className="btn btn-secondary"
              disabled={job.stopping}
              onClick={onStop}
            >
              Stop after this batch
            </button>
          ) : (
            unresolvedIds.length > 0 && (
              <button
                className="btn btn-primary"
                onClick={() => onRetry(unresolvedIds)}
              >
                Retry {unresolvedIds.length} unresolved
              </button>
            )
          )}
          <button className="btn btn-secondary" onClick={onClose}>
            {job.status === "running" ? "Minimize" : "Close"}
          </button>
        </div>
      </section>
    </div>
  );
}
