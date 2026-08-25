import { ChevronDown, ChevronRight, Database, Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import type { OpportunityBatch, OpportunitySite } from "../model/types";

interface SiteBatchExplorerProps {
  sites: readonly OpportunitySite[];
  pendingOperations: ReadonlySet<string>;
  onDeleteSite(host: string): Promise<unknown>;
  onDeleteBatch(jobId: string): Promise<unknown>;
  onNotice(message: string, tone: "success" | "warning" | "error"): void;
}

type DeleteTarget =
  | { kind: "site"; site: OpportunitySite }
  | { kind: "batch"; site: OpportunitySite; batch: OpportunityBatch };

function batchLabel(batch: OpportunityBatch): string {
  if (batch.startedAt) {
    return new Date(batch.startedAt).toLocaleString();
  }
  if (batch.firstSeen) {
    return new Date(batch.firstSeen).toLocaleString();
  }
  return "Legacy batch";
}

export default function SiteBatchExplorer({
  sites,
  pendingOperations,
  onDeleteSite,
  onDeleteBatch,
  onNotice,
}: SiteBatchExplorerProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const toggle = (host: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(host)) next.delete(host);
      else next.add(host);
      return next;
    });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      if (deleteTarget.kind === "site") {
        await onDeleteSite(deleteTarget.site.host);
        onNotice(
          `Deleted opportunities attributed to ${deleteTarget.site.host}.`,
          "success",
        );
      } else if (deleteTarget.batch.jobId) {
        await onDeleteBatch(deleteTarget.batch.jobId);
        onNotice(`Deleted the selected ${deleteTarget.site.host} batch.`, "success");
      }
      setDeleteTarget(null);
    } catch (caught) {
      onNotice(
        caught instanceof Error ? caught.message : "The records could not be deleted.",
        "error",
      );
    }
  };

  return (
    <section className="engine-card engine-site-explorer" aria-labelledby="engine-sites-title">
      <header className="engine-card-header">
        <span className="engine-card-icon" aria-hidden="true">
          <Database size={18} />
        </span>
        <div>
          <p className="engine-card-eyebrow">Data provenance</p>
          <h2 id="engine-sites-title">Harvested sites and batches</h2>
          <p>Delete one attributable run or every stored record from a host.</p>
        </div>
      </header>

      {sites.length === 0 ? (
        <div className="engine-site-empty">
          <h3>No attributed sites yet</h3>
          <p>Completed Engine runs will appear here with their persisted batches.</p>
        </div>
      ) : (
        <div className="engine-site-list">
          {sites.map((site) => {
            const isExpanded = expanded.has(site.host);
            const sitePending = pendingOperations.has(`site:${site.host}`);
            return (
              <article key={site.host} className="engine-site-row">
                <div className="engine-site-row-main">
                  <button
                    type="button"
                    className="engine-site-toggle"
                    aria-expanded={isExpanded}
                    aria-controls={`engine-site-batches-${site.host}`}
                    onClick={() => toggle(site.host)}
                  >
                    {isExpanded ? (
                      <ChevronDown size={16} aria-hidden="true" />
                    ) : (
                      <ChevronRight size={16} aria-hidden="true" />
                    )}
                    <span>
                      <strong>{site.host}</strong>
                      <small>
                        {site.total.toLocaleString()} records · {site.batches.length} batches
                      </small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="engine-source-action engine-source-action--danger"
                    disabled={sitePending}
                    aria-label={`Delete all opportunities from ${site.host}`}
                    onClick={() => setDeleteTarget({ kind: "site", site })}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                    Delete site data
                  </button>
                </div>

                {isExpanded ? (
                  <div id={`engine-site-batches-${site.host}`} className="engine-site-batches">
                    {site.batches.map((batch, index) => {
                      const key = batch.jobId ?? `legacy-${index}`;
                      const pending = batch.jobId
                        ? pendingOperations.has(`batch:${batch.jobId}`)
                        : false;
                      return (
                        <div key={key} className="engine-site-batch-row">
                          <div>
                            <strong>{batchLabel(batch)}</strong>
                            <span>
                              {batch.count.toLocaleString()} records
                              {batch.runType ? ` · ${batch.runType}` : ""}
                            </span>
                          </div>
                          {batch.jobId ? (
                            <button
                              type="button"
                              className="engine-source-action engine-source-action--danger"
                              disabled={pending}
                              aria-label={`Delete batch ${batchLabel(batch)} from ${site.host}`}
                              onClick={() =>
                                setDeleteTarget({ kind: "batch", site, batch })
                              }
                            >
                              <Trash2 size={14} aria-hidden="true" />
                              Delete batch
                            </button>
                          ) : (
                            <span className="engine-status-chip engine-status-chip--warning">
                              Unattributed legacy rows
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title={deleteTarget?.kind === "site" ? "Delete site data?" : "Delete batch?"}
        message={
          deleteTarget?.kind === "site"
            ? `Permanently delete all ${deleteTarget.site.total.toLocaleString()} opportunities attributed to ${deleteTarget.site.host}. Open opportunities will disappear from Edutu.`
            : deleteTarget?.kind === "batch"
              ? `Permanently delete ${deleteTarget.batch.count.toLocaleString()} opportunities from this ${deleteTarget.site.host} run.`
              : ""
        }
        confirmLabel={deleteTarget?.kind === "site" ? "Delete site data" : "Delete batch"}
        loading={
          deleteTarget?.kind === "site"
            ? pendingOperations.has(`site:${deleteTarget.site.host}`)
            : deleteTarget?.kind === "batch" && deleteTarget.batch.jobId
              ? pendingOperations.has(`batch:${deleteTarget.batch.jobId}`)
              : false
        }
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </section>
  );
}
