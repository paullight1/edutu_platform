import { Activity, Pause, RotateCcw } from "lucide-react";
import { useEngineRunStream } from "../hooks/useEngineRunStream";
import { isActiveRunPhase } from "../state/engineRunReducer";
import "../engine-runs.css";

export default function BackgroundRunIndicator() {
  const { state, restore } = useEngineRunStream();

  if (!state.minimized || !isActiveRunPhase(state.phase)) return null;

  const count = state.opportunities.length;
  const label = state.paused
    ? "Engine run paused in background"
    : "Engine run in background";

  return (
    <aside className="engine-background-run" role="status" aria-live="polite">
      <span className="engine-background-run-icon" aria-hidden="true">
        {state.paused ? <Pause size={17} /> : <Activity size={17} />}
      </span>
      <span>
        <strong>{label}</strong>
        <small>
          {count.toLocaleString()} {count === 1 ? "opportunity" : "opportunities"} found
        </small>
      </span>
      <button type="button" aria-label="Restore Engine run" onClick={restore}>
        <RotateCcw size={15} aria-hidden="true" />
        Restore
      </button>
    </aside>
  );
}
