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
  onMove(source: ScrapeSource, parentId: number | null): void;
  onAddGroup(): void;
  onReviewRun(source: ScrapeSource): void;
}

export default function SourceGroupCard({
  group,
  children,
  allSources,
  pendingOperations,
  onToggle,
  onDelete,
  onMove,
  onAddGroup,
  onReviewRun,
}: SourceGroupCardProps) {
  const [expanded, setExpanded] = useState(true);
  const enabledChildren = children.filter((source) => source.enabled).length;
  const groups = allSources.filter((source) => source.is_group);

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
        groups={groups}
        pending={pendingOperations.has(`source:${group.id}`)}
        runnable={isSourceRunnable(group, allSources)}
        onToggle={onToggle}
        onDelete={onDelete}
        onMove={onMove}
        onAddGroup={onAddGroup}
        onReviewRun={onReviewRun}
      />

      <div
        id={`source-group-children-${group.id}`}
        className="engine-source-group-children"
        hidden={!expanded}
      >
        {children.length > 0 ? (
          children.map((source) => (
            <SourceRow
              key={source.id}
              source={source}
              groups={groups}
              pending={pendingOperations.has(`source:${source.id}`)}
              runnable={isSourceRunnable(source, allSources)}
              onToggle={onToggle}
              onDelete={onDelete}
              onMove={onMove}
              onAddGroup={onAddGroup}
              onReviewRun={onReviewRun}
            />
          ))
        ) : (
          <p className="engine-source-group-empty">
            This group has no sources yet.
          </p>
        )}
      </div>
    </section>
  );
}
