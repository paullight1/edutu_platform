import { Link } from "react-router-dom";
import { Bookmark, CalendarClock, Send, type LucideIcon } from "lucide-react";
import { useProfileStats, type ProfileStats } from "../hooks/useProfileStats";

interface StatTile {
  key: keyof Pick<
    ReturnType<typeof useProfileStats>,
    "saved" | "applications" | "deadlines"
  >;
  label: string;
  icon: LucideIcon;
  to: string;
  accent: string;
  tint: string;
}

const TILES: StatTile[] = [
  {
    key: "saved",
    label: "Saved",
    icon: Bookmark,
    to: "/saved",
    accent: "text-brand",
    tint: "bg-brand/10",
  },
  {
    key: "applications",
    label: "Applications",
    icon: Send,
    to: "/applications",
    accent: "text-success",
    tint: "bg-success/10",
  },
  {
    key: "deadlines",
    label: "Deadlines",
    icon: CalendarClock,
    to: "/deadlines",
    accent: "text-warning",
    tint: "bg-warning/10",
  },
];

export default function ProfileQuickStats({
  stats: sharedStats,
}: {
  /** Pass stats from a parent that already runs useProfileStats to avoid a
   * second round of bookmark/application fetches. */
  stats?: ProfileStats;
} = {}) {
  const ownStats = useProfileStats({ enabled: !sharedStats });
  const stats = sharedStats ?? ownStats;

  return (
    <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-4">
      {TILES.map((tile) => {
        const Icon = tile.icon;
        const value = stats[tile.key];
        return (
          <Link
            key={tile.key}
            to={tile.to}
            className="group flex min-w-0 items-center gap-2 rounded-[20px] border border-subtle bg-surface-layer px-2.5 py-3 shadow-soft transition hover:border-brand/40 hover:shadow-elevated sm:gap-3 sm:p-4"
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${tile.tint} ${tile.accent} sm:h-9 sm:w-9`}
            >
              <Icon size={18} />
            </span>
            <div className="min-w-0">
              <span className="block font-display text-xl font-bold tracking-tight text-text-primary sm:text-2xl">
                {stats.loading ? (
                  <span className="inline-block h-7 w-8 animate-pulse rounded bg-surface-elevated align-middle" />
                ) : value === null ? (
                  "—"
                ) : (
                  value
                )}
              </span>
              <span className="block truncate text-2xs font-semibold text-text-muted sm:text-xs">
                {tile.label}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
