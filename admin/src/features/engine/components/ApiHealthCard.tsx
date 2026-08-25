import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
} from "lucide-react";
import type { EngineResourceState } from "../model/errors";
import type {
  ApiLivenessStatus,
  ApiReadinessStatus,
} from "../hooks/useEngineDiagnostics";

interface LivenessCardProps {
  kind: "liveness";
  resource: EngineResourceState<ApiLivenessStatus>;
}

interface ReadinessCardProps {
  kind: "readiness";
  resource: EngineResourceState<ApiReadinessStatus>;
}

type ApiHealthCardProps = LivenessCardProps | ReadinessCardProps;

function LoadingCard({ label }: { label: string }) {
  return (
    <article className="engine-card engine-health-card" aria-busy="true">
      <header className="engine-card-header">
        <span className="engine-card-icon" aria-hidden="true">
          <Clock3 size={20} />
        </span>
        <div>
          <p className="engine-card-eyebrow">API health</p>
          <h2>{label}</h2>
        </div>
      </header>
      <p>The admin is checking the configured API boundary.</p>
    </article>
  );
}

export default function ApiHealthCard(props: ApiHealthCardProps) {
  const { kind, resource } = props;

  if (resource.status === "idle" || resource.status === "loading") {
    return (
      <LoadingCard
        label={
          kind === "liveness"
            ? "Checking API process"
            : "Checking API readiness"
        }
      />
    );
  }

  if (kind === "liveness") {
    if (resource.status === "success" && resource.data?.status === "ok") {
      return (
        <article
          className="engine-card engine-health-card"
          role="region"
          aria-label="API liveness"
        >
          <header className="engine-card-header">
            <span
              className="engine-card-icon engine-card-icon--success"
              aria-hidden="true"
            >
              <Activity size={20} />
            </span>
            <div>
              <p className="engine-card-eyebrow">API liveness</p>
              <h2>API process live</h2>
            </div>
          </header>
          <span className="engine-status-chip engine-status-chip--success">
            <CheckCircle2 size={14} aria-hidden="true" />
            Live
          </span>
          <p>
            The configured API process is accepting health checks and has been
            running for {resource.data.uptimeSeconds} seconds.
          </p>
        </article>
      );
    }

    return (
      <article
        className="engine-card engine-health-card engine-card--error"
        role="region"
        aria-label="API liveness"
      >
        <header className="engine-card-header">
          <span
            className="engine-card-icon engine-card-icon--error"
            aria-hidden="true"
          >
            <AlertTriangle size={20} />
          </span>
          <div>
            <p className="engine-card-eyebrow">API liveness</p>
            <h2>API unreachable</h2>
          </div>
        </header>
        <p>The configured API process could not be reached from this admin build.</p>
        {resource.error?.requestId ? (
          <span className="engine-request-reference">
            Reference: <code>{resource.error.requestId}</code>
          </span>
        ) : null}
      </article>
    );
  }

  if (
    resource.status === "success" &&
    resource.data?.status === "ready"
  ) {
    return (
      <article
        className="engine-card engine-health-card"
        role="region"
        aria-label="API readiness"
      >
        <header className="engine-card-header">
          <span
            className="engine-card-icon engine-card-icon--success"
            aria-hidden="true"
          >
            <CheckCircle2 size={20} />
          </span>
          <div>
            <p className="engine-card-eyebrow">API readiness</p>
            <h2>API ready</h2>
          </div>
        </header>
        <span className="engine-status-chip engine-status-chip--success">
          Dependencies ready
        </span>
        <p>The API reports that its required dependencies are ready for traffic.</p>
      </article>
    );
  }

  return (
    <article
      className="engine-card engine-health-card engine-card--error"
      role="region"
      aria-label="API readiness"
    >
      <header className="engine-card-header">
        <span
          className="engine-card-icon engine-card-icon--error"
          aria-hidden="true"
        >
          <AlertTriangle size={20} />
        </span>
        <div>
          <p className="engine-card-eyebrow">API readiness</p>
          <h2>API not ready</h2>
        </div>
      </header>
      <span className="engine-status-chip engine-status-chip--error">
        Dependency failure
      </span>
      <p>The API process is live, but required dependencies are unavailable.</p>
      {resource.error?.requestId ? (
        <span className="engine-request-reference">
          Reference: <code>{resource.error.requestId}</code>
        </span>
      ) : null}
    </article>
  );
}
