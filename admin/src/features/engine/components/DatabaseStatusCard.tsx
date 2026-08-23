import { AlertTriangle, CheckCircle2, Database } from "lucide-react";
import type { EngineStatus } from "../model/types";

export default function DatabaseStatusCard({
  database,
}: {
  database?: EngineStatus["database"];
}) {
  const configured = Boolean(database?.configured);
  const reachable = Boolean(database?.reachable);

  if (!database || !configured) {
    return (
      <article
        className="engine-card engine-card--error"
        role="region"
        aria-label="Engine database"
      >
        <header className="engine-card-header">
          <span
            className="engine-card-icon engine-card-icon--error"
            aria-hidden="true"
          >
            <AlertTriangle size={20} />
          </span>
          <div>
            <p className="engine-card-eyebrow">Engine dependency</p>
            <h2>Database configuration missing</h2>
          </div>
        </header>
        <span className="engine-status-chip engine-status-chip--error">
          Not configured
        </span>
        <p>
          Add the required Supabase server credentials to the canonical API
          service, redeploy it, and run the readiness check again.
        </p>
      </article>
    );
  }

  if (!reachable) {
    return (
      <article
        className="engine-card engine-card--error"
        role="region"
        aria-label="Engine database"
      >
        <header className="engine-card-header">
          <span
            className="engine-card-icon engine-card-icon--error"
            aria-hidden="true"
          >
            <Database size={20} />
          </span>
          <div>
            <p className="engine-card-eyebrow">Engine dependency</p>
            <h2>Database probe failed</h2>
          </div>
        </header>
        <div className="engine-status-chip-row">
          <span className="engine-status-chip engine-status-chip--success">
            Configured
          </span>
          <span className="engine-status-chip engine-status-chip--error">
            Unreachable
          </span>
        </div>
        <p>
          The deployed API has database configuration, but its safe connectivity
          probe did not succeed. Review the canonical service logs and network
          access before running the Engine.
        </p>
      </article>
    );
  }

  return (
    <article
      className="engine-card"
      role="region"
      aria-label="Engine database"
    >
      <header className="engine-card-header">
        <span
          className="engine-card-icon engine-card-icon--success"
          aria-hidden="true"
        >
          <Database size={20} />
        </span>
        <div>
          <p className="engine-card-eyebrow">Engine dependency</p>
          <h2>Database connected</h2>
        </div>
      </header>
      <div className="engine-status-chip-row">
        <span className="engine-status-chip engine-status-chip--success">
          <CheckCircle2 size={14} aria-hidden="true" />
          Configured
        </span>
        <span className="engine-status-chip engine-status-chip--success">
          <CheckCircle2 size={14} aria-hidden="true" />
          Reachable
        </span>
      </div>
      <p>
        The Engine can reach the configured database through the deployed API.
      </p>
    </article>
  );
}
