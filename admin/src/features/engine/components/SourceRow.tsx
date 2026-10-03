import {
  CircleOff,
  ExternalLink,
  MoreHorizontal,
  Play,
  Power,
  PowerOff,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import type { ScrapeSource } from "../model/types";

interface SourceRowProps {
  source: ScrapeSource;
  groups: readonly ScrapeSource[];
  displayMode?: "row" | "card";
  pending: boolean;
  runnable: boolean;
  onToggle(source: ScrapeSource, enabled: boolean): void;
  onDelete(source: ScrapeSource): void;
  onMove(source: ScrapeSource, parentId: number | null): void;
  onAddGroup(): void;
  onReviewRun(source: ScrapeSource): void;
}

export default function SourceRow({
  source,
  groups,
  displayMode = "row",
  pending,
  runnable,
  onToggle,
  onDelete,
  onMove,
  onAddGroup,
  onReviewRun,
}: SourceRowProps) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const isCard = displayMode === "card";
  const runLabel = source.is_group
    ? `Review group run ${source.name}`
    : `Run ${source.name}`;

  return (
    <article
      className={`engine-source-row ${isCard ? "engine-source-row--card" : ""}`}
      data-enabled={source.enabled}
    >
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
            {source.total_scraped.toLocaleString()} scraped ·{" "}
            {source.total_failed.toLocaleString()} failed runs
          </p>
        </div>
      </div>

      <div className={`engine-source-action-area ${isCard ? "is-card" : ""}`}>
        {isCard ? (
          <button
            type="button"
            className="engine-source-menu-trigger"
            aria-label={`Actions for ${source.name}`}
            aria-expanded={actionsOpen}
            aria-controls={`engine-source-actions-${source.id}`}
            onClick={() => setActionsOpen((current) => !current)}
          >
            <MoreHorizontal size={19} aria-hidden="true" />
        </button>
        ) : null}
        {(!isCard || actionsOpen) ? (
          <div
            id={isCard ? `engine-source-actions-${source.id}` : undefined}
            className={`engine-source-actions ${isCard ? "engine-source-actions--menu" : ""}`}
            aria-label={isCard ? `Actions for ${source.name}` : undefined}
          >
            {!source.is_group ? (
              <label className="engine-source-move-control">
                <span className="sr-only">Move {source.name} to a group</span>
                <select
                  aria-label={`Move ${source.name} to a group`}
                  value={source.parent_id ?? ""}
                  disabled={pending}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === "__add_group__") {
                      onAddGroup();
                      setActionsOpen(false);
                      return;
                    }
                    onMove(source, value ? Number(value) : null);
                    if (isCard) setActionsOpen(false);
                  }}
                >
                  <option value="">Ungrouped</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                  <option value="__add_group__">Add new group…</option>
                </select>
              </label>
            ) : null}
            <button
              type="button"
              className="engine-source-action engine-source-action--primary"
              disabled={!runnable || pending}
              aria-label={runLabel}
              title={!runnable ? "Enable this source before running it" : runLabel}
              onClick={() => {
                onReviewRun(source);
                if (isCard) setActionsOpen(false);
              }}
            >
              <Play size={15} aria-hidden="true" />
              <span>{source.is_group ? "Review run" : "Run"}</span>
            </button>
            <button
              type="button"
              className="engine-source-action"
              disabled={pending}
              aria-label={`${source.enabled ? "Disable" : "Enable"} ${source.name}`}
              onClick={() => {
                onToggle(source, !source.enabled);
                if (isCard) setActionsOpen(false);
              }}
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
              onClick={() => {
                onDelete(source);
                if (isCard) setActionsOpen(false);
              }}
            >
              <Trash2 size={15} aria-hidden="true" />
              <span>Delete</span>
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}
