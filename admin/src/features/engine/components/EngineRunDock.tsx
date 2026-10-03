import { Pause, Play, Radio, Square } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useEngineRunStream } from "../hooks/useEngineRunStream";
import "../engine-runs.css";

export default function EngineRunDock() {
  const run = useEngineRunStream();
  const location = useLocation();
  const navigate = useNavigate();
  const { state } = run;
  const active = ["starting", "running", "stopping"].includes(state.phase);
  const completedSources = state.sourceProgress.filter(
    (entry) => entry.status === "completed",
  ).length;
  const statusOnly = state.reconnected && state.sourceProgress.length === 0;

  if (state.phase === "idle" || (!state.minimized && !active)) return null;
  if (!state.minimized && location.pathname.startsWith("/engine/runs")) {
    return null;
  }

  const openRun = () => {
    run.restore();
    if (!location.pathname.startsWith("/engine/runs")) {
      navigate("/engine/runs");
    }
  };

  return (
    <section
      className="engine-run-dock"
      role="region"
      aria-label="Background Engine run"
    >
      <button
        type="button"
        className="engine-run-dock-summary"
        aria-label="Open Engine run details"
        onClick={openRun}
      >
        <span className="engine-run-dock-icon" aria-hidden="true">
          <Radio size={18} />
        </span>
        <span className="engine-run-dock-copy">
          <strong>
            {state.paused
              ? "Engine run paused"
              : statusOnly
                ? "Scrape run active"
                : state.phase === "starting"
                  ? "Starting Engine run"
                  : "Engine run active"}
          </strong>
          <span>
            {statusOnly
              ? "Detected on the server · details unavailable in this view"
              : state.phase === "starting"
                ? "Connecting to the scraper · preparing the run"
                : `${state.opportunities.length} found · ${state.skippedCount} skipped · ${completedSources}/${state.sourceProgress.length} sources`}
          </span>
        </span>
      </button>
      <div className="engine-run-dock-actions">
        {active && !statusOnly ? (
          state.paused ? (
            <button
              type="button"
              aria-label="Resume background run"
              onClick={() => void run.resume()}
            >
              <Play size={16} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Pause background run"
              onClick={() => void run.pause()}
            >
              <Pause size={16} aria-hidden="true" />
            </button>
          )
        ) : null}
        {active && !statusOnly ? (
          <button
            type="button"
            aria-label="Stop background run"
            onClick={() => void run.stop()}
          >
            <Square size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </section>
  );
}
