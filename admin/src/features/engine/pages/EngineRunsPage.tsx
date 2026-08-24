import { Bug, History, RefreshCw, Route } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import EngineUnavailableState from "../components/EngineUnavailableState";
import JobDetailsDialog from "../components/JobDetailsDialog";
import LiveRunPanel from "../components/LiveRunPanel";
import RunHistory from "../components/RunHistory";
import { useEngineRuns } from "../hooks/useEngineRuns";
import { useEngineRunStream } from "../hooks/useEngineRunStream";
import type { ScrapeJob } from "../model/types";
import "../engine.css";
import "../engine-sources.css";
import "../engine-runs.css";

interface Notice {
  message: string;
  tone: "success" | "warning" | "error";
}

export default function EngineRunsPage() {
  const run = useEngineRunStream();
  const runs = useEngineRuns(run.state.completedAt);
  const [deleteTarget, setDeleteTarget] = useState<ScrapeJob | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const showNotice = (
    message: string,
    tone: "success" | "warning" | "error",
  ) => setNotice({ message, tone });

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await runs.deleteJob(deleteTarget);
      showNotice(`Deleted run ${deleteTarget.id} and attributable data.`, "success");
      setDeleteTarget(null);
    } catch (error) {
      showNotice(
        error instanceof Error ? error.message : "The run could not be deleted.",
        "error",
      );
    }
  };

  const loadingHistory =
    (runs.jobs.status === "idle" || runs.jobs.status === "loading") &&
    runs.jobs.data === null;
  const historyUnavailable =
    runs.jobs.status === "error" && runs.jobs.data === null;
  const jobs = runs.jobs.data ?? [];

  return (
    <main className="engine-page">
      <header className="engine-page-header">
        <div className="engine-page-heading">
          <span className="engine-page-icon" aria-hidden="true">
            <Route size={23} />
          </span>
          <div>
            <p className="engine-page-eyebrow">EdutuEngine</p>
            <h1>Engine runs</h1>
            <p>
              Monitor the one authoritative crawl lifecycle, inspect historical
              diagnostics, improve extracted records, and publish only reviewed
              opportunities.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="engine-refresh-button"
          disabled={runs.jobs.status === "loading"}
          onClick={() => void runs.refreshJobs()}
        >
          <RefreshCw
            size={16}
            className={runs.jobs.status === "loading" ? "is-spinning" : ""}
            aria-hidden="true"
          />
          Refresh history
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

      <LiveRunPanel run={run} />

      {loadingHistory ? (
        <section className="engine-state" role="status">
          <RefreshCw className="is-spinning" size={22} aria-hidden="true" />
          <div>
            <h2>Loading Engine run history</h2>
            <p>Reading persisted job and diagnostic records from the API.</p>
          </div>
        </section>
      ) : historyUnavailable ? (
        <EngineUnavailableState
          title="Run history unavailable"
          description="The API did not return run history. No empty history has been fabricated."
          error={runs.jobs.error}
          onRetry={() => void runs.refreshJobs()}
        />
      ) : jobs.length === 0 ? (
        <section className="engine-card engine-empty-inventory">
          <span className="engine-card-icon" aria-hidden="true">
            <History size={20} />
          </span>
          <div>
            <h2>No Engine runs yet</h2>
            <p>
              Start a bounded source or group run from the Sources workspace.
              Completed and failed jobs will appear here with their diagnostics.
            </p>
          </div>
        </section>
      ) : (
        <RunHistory
          jobs={jobs}
          pendingOperations={runs.pendingOperations}
          onInspect={(job) => void runs.inspectJob(job)}
          onDelete={setDeleteTarget}
        />
      )}

      <JobDetailsDialog
        job={runs.selectedJob}
        opportunities={runs.opportunities}
        pendingOperations={runs.pendingOperations}
        onClose={runs.closeInspection}
        onDelete={setDeleteTarget}
        onToggle={runs.toggleSelected}
        onSelectAll={runs.selectAll}
        onImprove={runs.improveSelected}
        onSave={runs.saveSelected}
        onNotice={showNotice}
      />

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete run and attributable data?"
        message={`Permanently delete run ${deleteTarget?.id ?? ""} and every opportunity linked to its scrape job ID. This cannot be undone.`}
        confirmLabel="Delete run"
        loading={
          deleteTarget
            ? runs.pendingOperations.has(`delete-job:${deleteTarget.id}`)
            : false
        }
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </main>
  );
}
