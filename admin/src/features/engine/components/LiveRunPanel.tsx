import {
  CheckCircle2,
  CircleStop,
  LoaderCircle,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import type { EngineRunContextValue } from "../state/engine-run-context";
import { isActiveRunPhase } from "../state/engineRunReducer";

interface LiveRunPanelProps {
  run: EngineRunContextValue;
}

function phaseLabel(run: EngineRunContextValue): string {
  const { state } = run;
  if (state.phase === "starting") return "Starting Engine run";
  if (state.phase === "stopping") return "Stopping Engine run";
  if (state.phase === "completed") return "Engine run completed";
  if (state.phase === "failed") return "Engine run failed";
  if (state.paused) return "Engine run paused";
  return "Engine run active";
}

export default function LiveRunPanel({ run }: LiveRunPanelProps) {
  const { state } = run;
  if (state.phase === "idle") return null;

  const active = isActiveRunPhase(state.phase);
  const count = state.opportunities.length;
  const failedSources = state.sourceProgress.filter(
    (source) => source.status === "failed",
  ).length;
  const completedSources = state.sourceProgress.filter(
    (source) => source.status === "completed",
  ).length;

  return (
    <section className="engine-card engine-live-run" aria-labelledby="live-run-title">
      <header className="engine-live-run-header">
        <span
          className={`engine-live-run-icon engine-live-run-icon--${state.phase}`}
          aria-hidden="true"
        >
          {state.phase === "completed" ? (
            <CheckCircle2 size={20} />
          ) : state.phase === "failed" ? (
            <TriangleAlert size={20} />
          ) : (
            <LoaderCircle className={active && !state.paused ? "is-spinning" : ""} size={20} />
          )}
        </span>
        <div>
          <p className="engine-card-eyebrow">Live lifecycle</p>
          <h2 id="live-run-title">{phaseLabel(run)}</h2>
          <p>
            {count.toLocaleString()} {count === 1 ? "opportunity" : "opportunities"} found
            {state.skippedCount
              ? ` · ${state.skippedCount.toLocaleString()} skipped`
              : ""}
            {state.reconnected ? " · reattached after refresh" : ""}
          </p>
        </div>
        <div className="engine-live-run-actions">
          {active ? (
            <>
              <button
                type="button"
                className="engine-source-action"
                aria-label={state.paused ? "Resume run" : "Pause run"}
                onClick={() => void (state.paused ? run.resume() : run.pause())}
              >
                {state.paused ? (
                  <Play size={15} aria-hidden="true" />
                ) : (
                  <Pause size={15} aria-hidden="true" />
                )}
                {state.paused ? "Resume" : "Pause"}
              </button>
              <button
                type="button"
                className="engine-source-action engine-source-action--danger"
                aria-label="Stop run"
                disabled={state.phase === "stopping"}
                onClick={() => void run.stop()}
              >
                <CircleStop size={15} aria-hidden="true" />
                Stop
              </button>
              <button
                type="button"
                className="engine-source-action"
                aria-label="Minimize run"
                onClick={run.minimize}
              >
                <Minimize2 size={15} aria-hidden="true" />
                Minimize
              </button>
            </>
          ) : (
            <button
              type="button"
              className="engine-source-action"
              aria-label="Clear completed run"
              onClick={run.reset}
            >
              <RotateCcw size={15} aria-hidden="true" />
              Clear
            </button>
          )}
        </div>
      </header>

      {state.error ? (
        <div className="engine-live-run-error" role="alert">
          <TriangleAlert size={16} aria-hidden="true" />
          <span>
            <strong>{state.error.message}</strong>
            {state.error.requestId ? (
              <small>Reference {state.error.requestId}</small>
            ) : null}
          </span>
        </div>
      ) : null}

      {state.sourceProgress.length > 0 ? (
        <div className="engine-live-run-progress">
          <div className="engine-live-run-progress-summary">
            <span>{completedSources} completed</span>
            <span>{failedSources} failed</span>
            <span>{state.sourceProgress.length} total</span>
          </div>
          <ul>
            {state.sourceProgress.map((source) => (
              <li key={source.name} data-status={source.status}>
                <span>{source.name}</span>
                <strong>{source.status}</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
