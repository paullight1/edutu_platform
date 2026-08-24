import {
  CircleOff,
  ExternalLink,
  Play,
  Power,
  PowerOff,
  Trash2,
} from "lucide-react";
import type { ScrapeSource } from "../model/types";

interface SourceRowProps {
  source: ScrapeSource;
  pending: boolean;
  runnable: boolean;
  onToggle(source: ScrapeSource, enabled: boolean): void;
  onDelete(source: ScrapeSource): void;
  onReviewRun(source: ScrapeSource): void;
}

export default function SourceRow({
  source,
  pending,
  runnable,
  onToggle,
  onDelete,
  onReviewRun,
}: SourceRowProps) {
  const runLabel = source.is_group
    ? `Review group run ${source.name}`
    : `Run ${source.name}`;

  return (
    <article className="engine-source-row" data-enabled={source.enabled}>
      <div className="engine-source-identity">
        <span
          className={`engine-source-status ${
            source.enabled ? "engine-source-status--enabled" : ""
          }`}
          aria-hidden="true"
        >
          {source.enabled ? <Power size={15} /> : <CircleOff size={15} />}
        </span>
        <div>
          <div className="engine-source-title-row">
            <h3>{source.name}</h3>
            <span
              className={`engine-status-chip ${
                source.enabled
                  ? "engine-status-chip--success"
                  : "engine-status-chip--neutral"
              }`}
            >
              {source.enabled ? "Enabled" : "Disabled"}
            </span>
            <span className="engine-status-chip engine-status-chip--neutral">
              {source.is_group ? "Group" : source.category || "Uncategorised"}
            </span>
          </div>
          {source.url ? (
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="engine-source-url"
            >
              <span>{source.url}</span>
              <ExternalLink size={13} aria-hidden="true" />
            </a>
          ) : (
            <p className="engine-source-url engine-source-url--muted">
              Source collection
            </p>
          )}
          <p className="engine-source-history">
            {source.total_scraped.toLocaleString()} saved ·{" "}
            {source.total_failed.toLocaleString()} failed
          </p>
        </div>
      </div>

      <div className="engine-source-actions">
        <button
          type="button"
          className="engine-source-action engine-source-action--primary"
          disabled={!runnable || pending}
          aria-label={runLabel}
          title={!runnable ? "Enable this source before running it" : runLabel}
          onClick={() => onReviewRun(source)}
        >
          <Play size={15} aria-hidden="true" />
          <span>{source.is_group ? "Review run" : "Run"}</span>
        </button>
        <button
          type="button"
          className="engine-source-action"
          disabled={pending}
          aria-label={`${source.enabled ? "Disable" : "Enable"} ${source.name}`}
          onClick={() => onToggle(source, !source.enabled)}
        >
          {source.enabled ? (
            <PowerOff size={15} aria-hidden="true" />
          ) : (
            <Power size={15} aria-hidden="true" />
          )}
          <span>{source.enabled ? "Disable" : "Enable"}</span>
        </button>
        <button
          type="button"
          className="engine-source-action engine-source-action--danger"
          disabled={pending}
          aria-label={`Delete ${source.name}`}
          onClick={() => onDelete(source)}
        >
          <Trash2 size={15} aria-hidden="true" />
          <span>Delete</span>
        </button>
      </div>
    </article>
  );
}
