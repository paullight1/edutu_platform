import { Database, FolderTree, Power, Radio } from "lucide-react";
import type { EngineStats, ScrapeSource } from "../model/types";

interface EngineSummaryMetricsProps {
  sources: readonly ScrapeSource[];
  stats: EngineStats | null;
  statsAvailable: boolean;
}

export default function EngineSummaryMetrics({
  sources,
  stats,
  statsAvailable,
}: EngineSummaryMetricsProps) {
  const groups = sources.filter((source) => source.is_group).length;
  const enabled = sources.filter(
    (source) => !source.is_group && source.enabled,
  ).length;
  const tracked = sources.filter((source) => !source.is_group).length;

  const metrics = [
    {
      label: "Tracked sources",
      value: tracked.toLocaleString(),
      icon: Radio,
    },
    {
      label: "Enabled sources",
      value: enabled.toLocaleString(),
      icon: Power,
    },
    {
      label: "Source groups",
      value: groups.toLocaleString(),
      icon: FolderTree,
    },
    {
      label: "Stored opportunities",
      value: statsAvailable ? (stats?.total ?? 0).toLocaleString() : "Unavailable",
      icon: Database,
    },
  ];

  return (
    <section className="engine-metric-grid" aria-label="Source summary">
      {metrics.map(({ label, value, icon: Icon }) => (
        <article key={label} className="engine-metric-card">
          <span className="engine-metric-icon" aria-hidden="true">
            <Icon size={18} />
          </span>
          <div>
            <p>{label}</p>
            <strong>{value}</strong>
          </div>
        </article>
      ))}
    </section>
  );
}
