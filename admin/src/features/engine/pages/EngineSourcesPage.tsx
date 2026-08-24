import { Bug, Plus, RadioTower, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import AddSourceDialog from "../components/AddSourceDialog";
import EnginePartialDataBanner from "../components/EnginePartialDataBanner";
import EngineSummaryMetrics from "../components/EngineSummaryMetrics";
import EngineUnavailableState from "../components/EngineUnavailableState";
import RunLauncher from "../components/RunLauncher";
import SiteBatchExplorer from "../components/SiteBatchExplorer";
import SourceInventory from "../components/SourceInventory";
import { useEngineSources } from "../hooks/useEngineSources";
import type { ScrapeSource } from "../model/types";
import "../engine.css";
import "../engine-sources.css";

interface Notice {
  message: string;
  tone: "success" | "warning" | "error";
}

export default function EngineSourcesPage() {
  const engine = useEngineSources();
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ScrapeSource | null>(null);
  const [runTarget, setRunTarget] = useState<ScrapeSource | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const sources = useMemo(
    () => engine.sources.data ?? [],
    [engine.sources.data],
  );
  const runChildren = useMemo(
    () =>
      runTarget?.is_group
        ? sources.filter((source) => source.parent_id === runTarget.id)
        : [],
    [runTarget, sources],
  );

  const partialErrors = [
    engine.stats.status === "error" && engine.stats.error
      ? { label: "Statistics", error: engine.stats.error }
      : null,
    engine.sites.status === "error" && engine.sites.error
      ? { label: "Site attribution", error: engine.sites.error }
      : null,
    engine.sources.status === "error" &&
    engine.sources.error &&
    engine.sources.data
      ? { label: "Source refresh", error: engine.sources.error }
      : null,
  ].filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const showNotice = (
    message: string,
    tone: "success" | "warning" | "error",
  ) => {
    setNotice({ message, tone });
  };

  const toggleSource = async (source: ScrapeSource, enabled: boolean) => {
    try {
      await engine.setSourceEnabled(source, enabled);
      showNotice(
        `${enabled ? "Enabled" : "Disabled"} ${source.name}.`,
        "success",
      );
    } catch (caught) {
      showNotice(
        caught instanceof Error
          ? caught.message
          : "The source could not be updated.",
        "error",
      );
    }
  };

  const confirmDeleteSource = async () => {
    if (!deleteTarget) return;
    try {
      await engine.deleteSource(deleteTarget);
      showNotice(`Deleted ${deleteTarget.name}.`, "success");
      setDeleteTarget(null);
    } catch (caught) {
      showNotice(
        caught instanceof Error
          ? caught.message
          : "The source could not be deleted.",
        "error",
      );
    }
  };

  const loadingSources =
    (engine.sources.status === "idle" ||
      engine.sources.status === "loading") &&
    engine.sources.data === null;
  const sourcesUnavailable =
    engine.sources.status === "error" && engine.sources.data === null;

  return (
    <main className="engine-page">
      <header className="engine-page-header">
        <div className="engine-page-heading">
          <span className="engine-page-icon" aria-hidden="true">
            <RadioTower size={23} />
          </span>
          <div>
            <p className="engine-page-eyebrow">EdutuEngine</p>
            <h1>Engine sources</h1>
            <p>
              Manage official discovery sources, organise them into run groups,
              launch bounded scrapes, and inspect the records each site produced.
            </p>
          </div>
        </div>
        <div className="engine-page-actions">
          <button
            type="button"
            className="engine-refresh-button"
            disabled={engine.sources.status === "loading"}
            onClick={() => void engine.refresh()}
          >
            <RefreshCw
              size={16}
              className={
                engine.sources.status === "loading" ? "is-spinning" : ""
              }
              aria-hidden="true"
            />
            Refresh
          </button>
          <button
            type="button"
            className="engine-primary-button"
            aria-label="Add source"
            onClick={() => setAddOpen(true)}
          >
            <Plus size={16} aria-hidden="true" />
            Add source
          </button>
        </div>
      </header>

      {notice ? (
        <section
          className={`engine-notice engine-notice--${notice.tone}`}
          role={notice.tone === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          <Bug size={17} aria-hidden="true" />
          <span>{notice.message}</span>
          <button
            type="button"
            aria-label="Dismiss notice"
            onClick={() => setNotice(null)}
          >
            Dismiss
          </button>
        </section>
      ) : null}

      {loadingSources ? (
        <section className="engine-state" role="status">
          <RefreshCw className="is-spinning" size={22} aria-hidden="true" />
          <div>
            <h2>Loading Engine sources</h2>
            <p>Reading the canonical source inventory from the API.</p>
          </div>
        </section>
      ) : sourcesUnavailable ? (
        <EngineUnavailableState
          title="Sources unavailable"
          description="The API did not return the source inventory. No empty or zero state has been fabricated."
          error={engine.sources.error}
          onRetry={() => void engine.refresh()}
        />
      ) : sources.length === 0 ? (
        <section className="engine-card engine-empty-inventory">
          <span className="engine-card-icon" aria-hidden="true">
            <RadioTower size={20} />
          </span>
          <div>
            <h2>No sources configured</h2>
            <p>
              Add one official listing page or create a group and paste multiple
              “Name | URL” source lines.
            </p>
            <button
              type="button"
              className="engine-primary-button"
              onClick={() => setAddOpen(true)}
            >
              <Plus size={16} aria-hidden="true" />
              Add your first source
            </button>
          </div>
        </section>
      ) : (
        <>
          <EnginePartialDataBanner errors={partialErrors} />
          <EngineSummaryMetrics
            sources={sources}
            stats={engine.stats.data}
            statsAvailable={engine.stats.status === "success"}
          />
          <SourceInventory
            sources={sources}
            pendingOperations={engine.pendingOperations}
            onToggle={(source, enabled) => void toggleSource(source, enabled)}
            onDelete={setDeleteTarget}
            onReviewRun={setRunTarget}
          />
          {engine.sites.status === "success" ? (
            <SiteBatchExplorer
              sites={engine.sites.data ?? []}
              pendingOperations={engine.pendingOperations}
              onDeleteSite={engine.deleteSite}
              onDeleteBatch={engine.deleteBatch}
              onNotice={showNotice}
            />
          ) : null}
        </>
      )}

      <AddSourceDialog
        isOpen={addOpen}
        sources={sources}
        pending={
          engine.pendingOperations.has("create-source") ||
          engine.pendingOperations.has("bulk-create-sources")
        }
        onClose={() => setAddOpen(false)}
        onCreate={engine.createSource}
        onBulk={engine.addBulkSources}
        onNotice={showNotice}
      />

      <RunLauncher
        key={runTarget?.id ?? "closed"}
        source={runTarget}
        children={runChildren}
        pending={
          runTarget
            ? engine.pendingOperations.has(`run:${runTarget.id}`)
            : false
        }
        onClose={() => setRunTarget(null)}
        onStart={engine.startRun}
        onNotice={showNotice}
      />

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete source?"
        message={
          deleteTarget?.is_group
            ? `Delete ${deleteTarget.name} and detach its child sources? The sources remain available but lose this group assignment.`
            : `Permanently remove ${deleteTarget?.name ?? "this source"} from the Engine inventory? Stored opportunities are not deleted by this action.`
        }
        confirmLabel="Delete source"
        loading={
          deleteTarget
            ? engine.pendingOperations.has(`source:${deleteTarget.id}`)
            : false
        }
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteSource}
      />
    </main>
  );
}
