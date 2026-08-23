import { Bug, RefreshCw } from "lucide-react";
import AiProviderStatusCard from "../components/AiProviderStatusCard";
import ApiHealthCard from "../components/ApiHealthCard";
import ApiRuntimeCard from "../components/ApiRuntimeCard";
import DatabaseStatusCard from "../components/DatabaseStatusCard";
import DiagnosticCheck from "../components/DiagnosticCheck";
import EnginePolicyCard from "../components/EnginePolicyCard";
import EngineUnavailableState from "../components/EngineUnavailableState";
import RuntimeConfigurationCard from "../components/RuntimeConfigurationCard";
import SchedulerStatusCard from "../components/SchedulerStatusCard";
import { useEngineDiagnostics } from "../hooks/useEngineDiagnostics";
import "../engine.css";

export default function EngineStatusPage() {
  const diagnostics = useEngineDiagnostics();
  const status = diagnostics.engineStatus.data;
  const isRefreshing =
    diagnostics.liveness.status === "loading" ||
    diagnostics.readiness.status === "loading" ||
    diagnostics.engineStatus.status === "loading";

  return (
    <div className="engine-page engine-status-page">
      <header className="engine-page-header">
        <div className="engine-page-heading">
          <span className="engine-page-icon" aria-hidden="true">
            <Bug size={23} strokeWidth={1.8} />
          </span>
          <div>
            <p className="engine-page-eyebrow">Edutu Engine</p>
            <h1>Engine status</h1>
            <p>
              Verify the exact admin-to-API boundary, deployment identity,
              dependencies, scheduler, AI provider, and collection policy.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="engine-refresh-button"
          aria-label="Refresh status"
          disabled={isRefreshing}
          onClick={() => void diagnostics.refresh()}
        >
          <RefreshCw
            size={17}
            className={isRefreshing ? "is-spinning" : ""}
            aria-hidden="true"
          />
          <span>{isRefreshing ? "Checking…" : "Refresh status"}</span>
        </button>
      </header>

      <RuntimeConfigurationCard
        config={diagnostics.runtimeConfig}
        error={diagnostics.runtimeConfigError}
      />

      <section className="engine-health-grid" aria-label="API health summary">
        <ApiHealthCard kind="liveness" resource={diagnostics.liveness} />
        <ApiHealthCard kind="readiness" resource={diagnostics.readiness} />
      </section>

      {diagnostics.engineStatus.status === "error" ? (
        <EngineUnavailableState
          title="Authenticated Engine status unavailable"
          description="The API health boundary responded, but the authenticated Engine diagnostics endpoint could not be read. Check the request reference and admin authorization before changing configuration."
          error={diagnostics.engineStatus.error}
          onRetry={() => void diagnostics.refresh()}
          retryLabel="Retry diagnostics"
        />
      ) : status ? (
        <>
          <ApiRuntimeCard runtime={status.runtime} />
          <section
            className="engine-status-grid"
            aria-label="Engine dependency and policy status"
          >
            <DatabaseStatusCard database={status.database} />
            <AiProviderStatusCard ai={status.ai} />
            <SchedulerStatusCard scraper={status.scraper} />
            <EnginePolicyCard scraper={status.scraper} />
          </section>
        </>
      ) : (
        <section className="engine-state" aria-busy="true">
          <span className="engine-state-loader" aria-hidden="true" />
          <div className="engine-state-copy">
            <h2>Reading authenticated Engine status</h2>
            <p>
              Waiting for safe runtime, database, AI, scheduler, and policy
              diagnostics from the configured API.
            </p>
          </div>
        </section>
      )}

      <section
        className="engine-card engine-diagnostics-panel"
        aria-labelledby="engine-diagnostics-title"
      >
        <header className="engine-card-header engine-diagnostics-header">
          <div>
            <p className="engine-card-eyebrow">Operational checks</p>
            <h2 id="engine-diagnostics-title">Deployment diagnostics</h2>
          </div>
          <span className="engine-check-count">
            {diagnostics.checks.length} checks
          </span>
        </header>
        <ul className="engine-diagnostic-list">
          {diagnostics.checks.map((check) => (
            <DiagnosticCheck key={check.code} check={check} />
          ))}
        </ul>
      </section>
    </div>
  );
}
