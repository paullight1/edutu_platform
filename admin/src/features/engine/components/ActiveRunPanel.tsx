import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Square,
} from "lucide-react";
import type { EngineRunContextValue } from "../state/engine-run-context";

function phaseLabel(phase: EngineRunContextValue["state"]["phase"], paused: boolean) {
  if (paused) return "Paused";
  switch (phase) {
    case "starting":
      return "Starting";
    case "running":
      return "Running";
    case "stopping":
      return "Stopping";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    default:
      return "Idle";
  }
}

function plural(count: number, singular: string, pluralValue = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralValue}`;
}

export default function ActiveRunPanel({
  run,
}: {
  run: EngineRunContextValue;
}) {
  const { state } = run;
  const active = ["starting", "running", "stopping"].includes(state.phase);
  const completedSources = state.sourceProgress.filter(
    (entry) => entry.status === "completed",
  ).length;
  const totalSources = state.sourceProgress.length;

  if (state.phase === "idle") {
    return (
      <section className="engine-card engine-run-empty" aria-label="Active run">
        <header className="engine-card-header">
          <span className="engine-card-icon" aria-hidden="true">
            <Radio size={20} />
          </span>
          <div>
            <p className="engine-card-eyebrow">Live operation</p>
            <h2>No active run</h2>
          </div>
        </header>
        <p>Start one source or all enabled sources from the Sources section.</p>
      </section>
    );
  }

  return (
    <section
      className={`engine-card engine-live-run${
        state.phase === "failed" ? " engine-card--error" : ""
      }`}
      aria-label="Active run"
    >
      <header className="engine-card-header engine-live-run-header">
        <div className="engine-live-run-title">
          <span
            className={`engine-card-icon${
              active ? " engine-card-icon--success" : ""
            }`}
            aria-hidden="true"
          >
            {active ? (
              <Loader2 className="is-spinning" size={20} />
            ) : (
              <Radio size={20} />
            )}
          </span>
          <div>
            <p className="engine-card-eyebrow">Live operation</p>
            <h2>{phaseLabel(state.phase, state.paused)} Engine run</h2>
          </div>
        </div>
        <div className="engine-status-chip-row">
          {state.reconnected ? (
            <span className="engine-status-chip engine-status-chip--warning">
              Reattached after refresh
            </span>
          ) : null}
          {state.minimized ? (
            <span className="engine-status-chip engine-status-chip--neutral">
              Minimized
            </span>
          ) : null}
        </div>
      </header>

      <div className="engine-run-metrics">
        <div>
          <strong>{state.opportunities.length}</strong>
          <span>
            {plural(state.opportunities.length, "opportunity")} found
          </span>
        </div>
        <div>
          <strong>{state.skippedCount}</strong>
          <span>{plural(state.skippedCount, "skipped", "skipped")}</span>
        </div>
        <div>
          <strong>{completedSources}</strong>
          <span>
            {completedSources} of {totalSources} sources complete
          </span>
        </div>
      </div>

      {totalSources > 0 ? (
        <ul className="engine-source-progress-list">
          {state.sourceProgress.map((entry) => (
            <li key={entry.name} data-status={entry.status}>
              <span aria-hidden="true">
                {entry.status === "completed" ? (
                  <CheckCircle2 size={16} />
                ) : entry.status === "failed" ? (
                  <AlertTriangle size={16} />
                ) : (
                  <Clock3 size={16} />
                )}
              </span>
              <strong>{entry.name}</strong>
              <span>{entry.status}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {state.error ? (
        <div className="engine-run-error" role="alert">
          <AlertTriangle size={17} aria-hidden="true" />
          <span>{state.error.message}</span>
          <code>{state.error.requestId}</code>
        </div>
      ) : null}

      <div className="engine-run-actions">
        {active ? (
          state.paused ? (
            <button
              type="button"
              aria-label="Resume run"
              onClick={() => void run.resume()}
            >
              <Play size={16} aria-hidden="true" />
              Resume
            </button>
          ) : (
            <button
              type="button"
              aria-label="Pause run"
              onClick={() => void run.pause()}
            >
              <Pause size={16} aria-hidden="true" />
              Pause
            </button>
          )
        ) : null}
        {active ? (
          <button
            type="button"
            aria-label="Stop run"
            onClick={() => void run.stop()}
          >
            <Square size={16} aria-hidden="true" />
            Stop
          </button>
        ) : null}
        <button
          type="button"
          aria-label={state.minimized ? "Restore run" : "Minimize run"}
          onClick={state.minimized ? run.restore : run.minimize}
        >
          <Radio size={16} aria-hidden="true" />
          {state.minimized ? "Restore" : "Minimize"}
        </button>
        {state.phase === "completed" || state.phase === "failed" ? (
          <button type="button" onClick={run.reset}>
            <RefreshCw size={16} aria-hidden="true" />
            Clear result
          </button>
        ) : null}
      </div>
    </section>
  );
}
