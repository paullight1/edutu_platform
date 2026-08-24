import { ChevronDown, ChevronRight, FolderTree } from "lucide-react";
import { useState } from "react";
import { isSourceRunnable } from "../model/sourceRules";
import type { ScrapeSource } from "../model/types";
import SourceRow from "./SourceRow";

interface SourceGroupCardProps {
  group: ScrapeSource;
  children: readonly ScrapeSource[];
  allSources: readonly ScrapeSource[];
  pendingOperations: ReadonlySet<string>;
  onToggle(source: ScrapeSource, enabled: boolean): void;
  onDelete(source: ScrapeSource): void;
  onReviewRun(source: ScrapeSource): void;
}

export default function SourceGroupCard({
  group,
  children,
  allSources,
  pendingOperations,
  onToggle,
  onDelete,
  onReviewRun,
}: SourceGroupCardProps) {
  const [expanded, setExpanded] = useState(true);
  const enabledChildren = children.filter((source) => source.enabled).length;

  return (
    <section
      className="engine-source-group"
      aria-labelledby={`source-group-${group.id}`}
    >
      <header className="engine-source-group-header">
        <button
          type="button"
          className="engine-source-group-toggle"
          aria-expanded={expanded}
          aria-controls={`source-group-children-${group.id}`}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? (
            <ChevronDown size={17} aria-hidden="true" />
          ) : (
            <ChevronRight size={17} aria-hidden="true" />
          )}
          <FolderTree size={18} aria-hidden="true" />
          <span id={`source-group-${group.id}`}>{group.name}</span>
          <span className="engine-source-group-count">
            {enabledChildren}/{children.length} enabled
          </span>
        </button>
      </header>

      <SourceRow
        source={group}
        pending={pendingOperations.has(`source:${group.id}`)}
        runnable={isSourceRunnable(group, allSources)}
        onToggle={onToggle}
        onDelete={onDelete}
        onReviewRun={onReviewRun}
      />

      {expanded ? (
        <div
          id={`source-group-children-${group.id}`}
          className="engine-source-group-children"
        >
          {children.length > 0 ? (
            children.map((source) => (
              <SourceRow
                key={source.id}
                source={source}
                pending={pendingOperations.has(`source:${source.id}`)}
                runnable={isSourceRunnable(source, allSources)}
                onToggle={onToggle}
                onDelete={onDelete}
                onReviewRun={onReviewRun}
              />
            ))
          ) : (
            <p className="engine-source-group-empty">
              This group has no sources yet.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
