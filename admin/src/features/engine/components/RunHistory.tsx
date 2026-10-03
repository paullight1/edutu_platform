import { History } from "lucide-react";
import { useMemo, useState } from "react";
import type { ScrapeJob } from "../model/types";
import RunGroup from "./RunGroup";

interface RunHistoryProps {
  jobs: readonly ScrapeJob[];
  pendingOperations: ReadonlySet<string>;
  onInspect(job: ScrapeJob): void;
  onDelete(job: ScrapeJob): void;
}

const INITIAL_VISIBLE_RUNS = 9;

function dateKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function RunHistory({
  jobs,
  pendingOperations,
  onInspect,
  onDelete,
}: RunHistoryProps) {
  const [showAllRuns, setShowAllRuns] = useState(false);
  const groups = useMemo(() => {
    const map = new Map<string, ScrapeJob[]>();
    const sorted = [...jobs].sort(
      (left, right) =>
        new Date(right.started_at).getTime() -
        new Date(left.started_at).getTime(),
    );

    const visibleJobs = showAllRuns
      ? sorted
      : sorted.slice(0, INITIAL_VISIBLE_RUNS);

    for (const job of visibleJobs) {
      const key = dateKey(job.started_at);
      const group = map.get(key) ?? [];
      group.push(job);
      map.set(key, group);
    }

    return [...map.entries()];
  }, [jobs, showAllRuns]);

  return (
    <section className="engine-card engine-run-history" aria-labelledby="engine-run-history-title">
      <header className="engine-card-header">
        <span className="engine-card-icon" aria-hidden="true">
          <History size={18} />
        </span>
        <div>
          <p className="engine-card-eyebrow">Auditable execution</p>
          <h2 id="engine-run-history-title">Run history</h2>
          <p>{jobs.length.toLocaleString()} recorded Engine runs</p>
        </div>
      </header>
      <div id="engine-run-history-groups" className="engine-run-history-groups">
        {groups.map(([label, groupedJobs]) => (
          <RunGroup
            key={label}
            label={label}
            jobs={groupedJobs}
            pendingOperations={pendingOperations}
            onInspect={onInspect}
            onDelete={onDelete}
          />
        ))}
      </div>
      {jobs.length > INITIAL_VISIBLE_RUNS ? (
        <div className="engine-run-history-footer">
          <button
            type="button"
            className="engine-secondary-button"
            aria-expanded={showAllRuns}
            aria-controls="engine-run-history-groups"
            onClick={() => setShowAllRuns((current) => !current)}
          >
            {showAllRuns
              ? "Show fewer runs"
              : `View all ${jobs.length.toLocaleString()} runs`}
          </button>
        </div>
      ) : null}
    </section>
  );
}
