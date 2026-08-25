import { AlertCircle, Bug, RefreshCw } from "lucide-react";
import { useState } from "react";
import AiProviderStatusCard from "../components/AiProviderStatusCard";
import ApiHealthCard from "../components/ApiHealthCard";
import ApiRuntimeCard from "../components/ApiRuntimeCard";
import AutomationSettings from "../components/AutomationSettings";
import DatabaseStatusCard from "../components/DatabaseStatusCard";
import DataQualityScorecard from "../components/DataQualityScorecard";
import DiagnosticCheck from "../components/DiagnosticCheck";
import EnginePolicyCard from "../components/EnginePolicyCard";
import EngineUnavailableState from "../components/EngineUnavailableState";
import RetentionSettings from "../components/RetentionSettings";
import RuntimeConfigurationCard from "../components/RuntimeConfigurationCard";
import SchedulerStatusCard from "../components/SchedulerStatusCard";
import { useEngineAutomation } from "../hooks/useEngineAutomation";
import { useEngineDiagnostics } from "../hooks/useEngineDiagnostics";
import "../engine.css";
import "../engine-automation.css";

interface Notice {
  message: string;
  tone: "success" | "warning" | "error";
}

export default function EngineStatusPage() {
  const diagnostics = useEngineDiagnostics();
  const automation = useEngineAutomation();
  const [notice, setNotice] = useState<Notice | null>(null);
  const status = diagnostics.engineStatus.data;
  const isRefreshing =
    diagnostics.liveness.status === "loading" ||
    diagnostics.readiness.status === "loading" ||
    diagnostics.engineStatus.status === "loading" ||
    automation.settings.status === "loading";

  const refreshAll = () => {
    void Promise.all([diagnostics.refresh(), automation.refresh()]);
  };

  const showNotice = (
    message: string,
    tone: "success" | "warning" | "error",
  ) => setNotice({ message, tone });

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
              dependencies, scheduler, AI provider, collection policy,
              automation, and retention.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="engine-refresh-button"
          aria-label="Refresh status"
          disabled={isRefreshing}
          onClick={refreshAll}
        >
          <RefreshCw
            size={17}
            className={isRefreshing ? "is-spinning" : ""}
            aria-hidden="true"
          />
          <span>{isRefreshing ? "Checking…" : "Refresh status"}</span>
        </button>
      </header>

      {notice ? (
        <section
          className={`engine-notice engine-notice--${notice.tone}`}
          role={notice.tone === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          <Bug size={17} aria-hidden="true" />
          <span>{notice.message}</span>
          <button type="button" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </section>
      ) : null}

      <RuntimeConfigurationCard
        config={diagnostics.runtimeConfig}
        error={diagnostics.runtimeConfigError}
      />

      <DataQualityScorecard />

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

      {automation.settings.status === "loading" &&
      automation.settings.data === null ? (
        <section className="engine-state" aria-busy="true">
          <span className="engine-state-loader" aria-hidden="true" />
          <div className="engine-state-copy">
            <h2>Reading confirmed Engine settings</h2>
            <p>
              Waiting for scheduler and retention values from the authenticated
              settings endpoint.
            </p>
          </div>
        </section>
      ) : automation.settings.status === "error" &&
        automation.settings.data === null ? (
        <EngineUnavailableState
          title="Automation settings unavailable"
          description="Diagnostics are available, but the authenticated settings endpoint did not return a confirmed policy."
          error={automation.settings.error}
          onRetry={() => void automation.refresh()}
          retryLabel="Retry settings"
        />
      ) : automation.settings.data ? (
        <>
          {automation.settings.status === "error" ? (
            <section
              className="engine-notice engine-notice--warning"
              role="status"
            >
              <AlertCircle size={17} aria-hidden="true" />
              <span>
                The latest settings refresh failed. The controls below show the
                last confirmed values.
              </span>
            </section>
          ) : null}
          <section
            className="engine-settings-grid"
            aria-label="Engine automation and retention settings"
          >
            <AutomationSettings
              key={`automation-${automation.settings.data.auto_run_enabled}-${automation.settings.data.cron_schedule}-${automation.settings.data.recheck_after_days}`}
              settings={automation.settings.data}
              pending={automation.pendingOperations.has("save-settings")}
              error={null}
              onSave={automation.saveSettings}
              onNotice={showNotice}
            />
            <RetentionSettings
              key={`retention-${automation.settings.data.data_retention_days ?? "none"}`}
              settings={automation.settings.data}
              pending={
                automation.pendingOperations.has("save-settings") ||
                automation.pendingOperations.has("purge-opportunities")
              }
              error={null}
              onSave={automation.saveSettings}
              onPurge={automation.purgeExpired}
              onNotice={showNotice}
            />
          </section>
        </>
      ) : null}
    </div>
  );
}
