import { Play, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import type { SourceRunOptions } from "../hooks/useEngineSources";
import type { ScrapeResult, ScrapeSource } from "../model/types";

interface RunLauncherProps {
  source: ScrapeSource | null;
  children: readonly ScrapeSource[];
  pending: boolean;
  onClose(): void;
  onStart(source: ScrapeSource, options: SourceRunOptions): Promise<ScrapeResult>;
  onNotice(
    message: string,
    tone: "success" | "warning" | "error",
    action?: { label: string; to: string },
  ): void;
  monitorPath: string;
}

export default function RunLauncher({
  source,
  children,
  pending,
  onClose,
  onStart,
  onNotice,
  monitorPath,
}: RunLauncherProps) {
  const [maxPagesInput, setMaxPagesInput] = useState("3");
  const [incremental, setIncremental] = useState(true);
  const [error, setError] = useState<string | null>(null);

  if (!source) return null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const maxPages = Number(maxPagesInput);
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 50) {
      const message = "Maximum pages must be a whole number from 1 to 50.";
      setError(message);
      onNotice(message, "error");
      return;
    }

    const handleResult = (result: ScrapeResult) => {
      const found = result.opportunities?.length ?? result.totalResults ?? 0;
      const failedSources = (result.sourceResults ?? []).filter(
        (sourceResult) => sourceResult.status === "failed",
      );
      const firstSourceFailure = failedSources.find(
        (sourceResult) => sourceResult.error || sourceResult.warnings?.length,
      );
      const failureDetail =
        firstSourceFailure?.error || firstSourceFailure?.warnings?.[0];

      if (!result.success) {
        const message =
          result.error ||
          failureDetail ||
          "No selected source completed successfully. Inspect Live Runs for details.";
        if (/already in progress|already active/i.test(message)) {
          onNotice(
            "An Engine run is already in progress. Its status is available in the run monitor.",
            "warning",
          );
          return;
        }
        onNotice(message, "error");
        return;
      }

      if (found === 0 && failedSources.length > 0) {
        const message = failureDetail
          ? `${failedSources.length} source${failedSources.length === 1 ? "" : "s"} could not be scraped. ${failureDetail}`
          : `${failedSources.length} source${failedSources.length === 1 ? "" : "s"} could not be scraped. Inspect Live Runs for details.`;
        onNotice(message, "warning");
        return;
      }

      const skipped = result.itemsSkipped ?? 0;
      const noNewItemsMessage =
        skipped > 0
          ? `Run complete · No new opportunities. ${skipped.toLocaleString()} already verified and skipped.`
          : "Run complete · No new opportunities found.";
      onNotice(
        found > 0
          ? `Run complete · ${found.toLocaleString()} opportunities found.`
          : noNewItemsMessage,
        "success",
      );
    };

    const handleFailure = (caught: unknown) => {
      const message =
        caught instanceof Error
          ? caught.message
          : "The source run could not start.";
      if (/already in progress|already active/i.test(message)) {
        onNotice(
          "An Engine run is already in progress. Its status is available in the run monitor.",
          "warning",
        );
        return;
      }
      onNotice(message, "error");
    };

    try {
      const run = onStart(source, { maxPages, incremental });
      onNotice(
        `Starting ${source.is_group ? "group" : "source"} run. Progress will appear in the bottom-right run monitor.`,
        "success",
        { label: "View", to: monitorPath },
      );
      onClose();
      void run.then(handleResult).catch(handleFailure);
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "The source run could not start.";
      setError(message);
      handleFailure(caught);
    }
  };

  const isGroup = Boolean(source.is_group);
  const enabledChildren = children.filter((child) => child.enabled);

  return (
    <div
      className="engine-dialog-backdrop"
      role="presentation"
      onMouseDown={() => {
        if (!pending) onClose();
      }}
    >
      <section
        className="engine-dialog engine-run-launcher"
        role="dialog"
        aria-modal="true"
        aria-labelledby="engine-run-launcher-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="engine-dialog-header">
          <div>
            <p className="engine-card-eyebrow">Bounded scrape</p>
            <h2 id="engine-run-launcher-title">
              {isGroup ? "Review group run" : "Review source run"}
            </h2>
            <p>{source.name}</p>
          </div>
          <button
            type="button"
            className="engine-icon-button"
            aria-label="Close run review"
            disabled={pending}
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <form className="engine-dialog-form" onSubmit={submit}>
          {isGroup ? (
            <section
              className="engine-run-source-review"
              aria-label="Sources in this run"
            >
              <div className="engine-run-source-review-header">
                <ShieldCheck size={18} aria-hidden="true" />
                <div>
                  <h3>Enabled sources in this group</h3>
                  <p>
                    {enabledChildren.length} of {children.length} sources will
                    run.
                  </p>
                </div>
              </div>
              <ul>
                {children.map((child) => (
                  <li key={child.id} data-enabled={child.enabled}>
                    <span>{child.name}</span>
                    <strong>{child.enabled ? "Included" : "Disabled"}</strong>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <section
              className="engine-run-source-review"
              aria-label="Source in this run"
            >
              <div className="engine-run-source-review-header">
                <ShieldCheck size={18} aria-hidden="true" />
                <div>
                  <h3>{source.name}</h3>
                  <p>{source.url}</p>
                </div>
              </div>
            </section>
          )}

          <div className="engine-field-grid">
            <label className="engine-field">
              <span>Maximum pages per source</span>
              <input
                type="number"
                min={1}
                max={50}
                step={1}
                value={maxPagesInput}
                aria-label="Maximum pages per source"
                onChange={(event) => setMaxPagesInput(event.target.value)}
              />
            </label>
            <label className="engine-checkbox-field">
              <input
                type="checkbox"
                checked={incremental}
                onChange={(event) => setIncremental(event.target.checked)}
              />
              <span>
                <strong>Incremental run</strong>
                <small>Skip recently verified records where policy allows.</small>
              </span>
            </label>
          </div>

          {error ? (
            <p className="engine-form-error" role="alert">
              {error}
            </p>
          ) : null}

          <footer className="engine-dialog-actions">
            <button
              type="button"
              className="engine-secondary-button"
              disabled={pending}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="engine-primary-button"
              disabled={pending || (isGroup && enabledChildren.length === 0)}
            >
              <Play size={16} aria-hidden="true" />
              {pending
                ? "Starting…"
                : isGroup
                  ? "Start group run"
                  : "Start run"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
