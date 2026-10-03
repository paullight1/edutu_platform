import { Filter, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { isSourceRunnable } from "../model/sourceRules";
import type { ScrapeSource } from "../model/types";
import SourceGroupCard from "./SourceGroupCard";
import SourceRow from "./SourceRow";

interface SourceInventoryProps {
  sources: readonly ScrapeSource[];
  pendingOperations: ReadonlySet<string>;
  onToggle(source: ScrapeSource, enabled: boolean): void;
  onDelete(source: ScrapeSource): void;
  onMove(source: ScrapeSource, parentId: number | null): void;
  onAddGroup(): void;
  onReviewRun(source: ScrapeSource): void;
}

type SourceFilter = "all" | "enabled" | "disabled";

function matchesFilter(source: ScrapeSource, filter: SourceFilter): boolean {
  if (filter === "enabled") return source.enabled;
  if (filter === "disabled") return !source.enabled;
  return true;
}

function matchesQuery(source: ScrapeSource, query: string): boolean {
  if (!query) return true;
  const haystack = `${source.name} ${source.url} ${source.category}`.toLowerCase();
  return haystack.includes(query);
}

export default function SourceInventory({
  sources,
  pendingOperations,
  onToggle,
  onDelete,
  onMove,
  onAddGroup,
  onReviewRun,
}: SourceInventoryProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SourceFilter>("all");
  const normalizedQuery = query.trim().toLowerCase();
  const groups = sources.filter((source) => source.is_group);

  const inventory = useMemo(() => {
    const groupIds = new Set(groups.map((group) => group.id));
    const childrenByGroup = new Map<number, ScrapeSource[]>();

    for (const source of sources) {
      if (source.is_group || source.parent_id == null) continue;
      const children = childrenByGroup.get(source.parent_id) ?? [];
      children.push(source);
      childrenByGroup.set(source.parent_id, children);
    }

    const visibleGroups = groups
      .map((group) => {
        const children = childrenByGroup.get(group.id) ?? [];
        const groupMatches =
          matchesFilter(group, filter) && matchesQuery(group, normalizedQuery);
        const visibleChildren = children.filter(
          (source) =>
            matchesFilter(source, filter) &&
            matchesQuery(source, normalizedQuery),
        );

        return {
          group,
          children: groupMatches
            ? children.filter((source) => matchesFilter(source, filter))
            : visibleChildren,
          visible: groupMatches || visibleChildren.length > 0,
        };
      })
      .filter((entry) => entry.visible);

    const ungrouped = sources.filter(
      (source) =>
        !source.is_group &&
        (source.parent_id == null || !groupIds.has(source.parent_id)) &&
        matchesFilter(source, filter) &&
        matchesQuery(source, normalizedQuery),
    );

    return { groups: visibleGroups, ungrouped };
  }, [filter, groups, normalizedQuery, sources]);

  const visibleCount =
    inventory.ungrouped.length +
    inventory.groups.reduce(
      (total, entry) => total + 1 + entry.children.length,
      0,
    );

  return (
    <section
      className="engine-card engine-source-inventory"
      aria-label="Source inventory"
    >
      <header className="engine-source-inventory-header">
        <div>
          <p className="engine-card-eyebrow">Source control</p>
          <h2>Inventory</h2>
          <p>{visibleCount.toLocaleString()} visible source records</p>
        </div>
        <div className="engine-source-filters">
          <label className="engine-source-search">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Search sources</span>
            <input
              type="search"
              value={query}
              placeholder="Search sources"
              aria-label="Search sources"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className="engine-source-filter">
            <Filter size={15} aria-hidden="true" />
            <span className="sr-only">Filter sources</span>
            <select
              value={filter}
              aria-label="Filter sources"
              onChange={(event) =>
                setFilter(event.target.value as SourceFilter)
              }
            >
              <option value="all">All sources</option>
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
            </select>
          </label>
        </div>
      </header>

      {visibleCount === 0 ? (
        <div className="engine-source-search-empty">
          <h3>No matching sources</h3>
          <p>Change the search or status filter to see more sources.</p>
        </div>
      ) : (
        <div className="engine-source-inventory-sections">
          {inventory.groups.length > 0 ? (
            <section className="engine-source-inventory-section" aria-labelledby="engine-source-groups-title">
              <header className="engine-source-section-heading">
                <h3 id="engine-source-groups-title">Groups</h3>
                <span>{inventory.groups.length}</span>
              </header>
              <div className="engine-source-groups-grid">
                {inventory.groups.map(({ group, children }) => (
                  <SourceGroupCard
                    key={group.id}
                    group={group}
                    children={children}
                    allSources={sources}
                    pendingOperations={pendingOperations}
                    onToggle={onToggle}
                    onDelete={onDelete}
                    onMove={onMove}
                    onAddGroup={onAddGroup}
                    onReviewRun={onReviewRun}
                  />
                ))}
              </div>
            </section>
          ) : null}
          {inventory.ungrouped.length > 0 ? (
            <section className="engine-source-inventory-section" aria-labelledby="engine-standalone-sources-title">
              <header className="engine-source-section-heading">
                <h3 id="engine-standalone-sources-title">Individual sources</h3>
                <span>{inventory.ungrouped.length}</span>
              </header>
              <div className="engine-source-list engine-source-list--standalone">
                {inventory.ungrouped.map((source) => (
                  <SourceRow
                    key={source.id}
                    source={source}
                    groups={groups}
                    pending={pendingOperations.has(`source:${source.id}`)}
                    runnable={isSourceRunnable(source, sources)}
                    displayMode="card"
                    onToggle={onToggle}
                    onDelete={onDelete}
                    onMove={onMove}
                    onAddGroup={onAddGroup}
                    onReviewRun={onReviewRun}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </section>
  );
}
