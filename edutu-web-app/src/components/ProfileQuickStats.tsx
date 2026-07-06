import { Link } from "react-router-dom";
import { Bookmark, CalendarClock, Send, type LucideIcon } from "lucide-react";
import { useProfileStats } from "../hooks/useProfileStats";

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

export default function ProfileQuickStats() {
  const stats = useProfileStats();

  return (
    <div className="mt-5 grid grid-cols-3 gap-3 sm:gap-4">
      {TILES.map((tile) => {
        const Icon = tile.icon;
        const value = stats[tile.key];
        return (
          <Link
            key={tile.key}
            to={tile.to}
            className="group flex flex-col justify-between rounded-2xl border border-subtle bg-surface-layer p-4 shadow-soft transition hover:border-brand/40 hover:shadow-elevated"
          >
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-xl ${tile.tint} ${tile.accent}`}
            >
              <Icon size={18} />
            </span>
            <div className="mt-3">
              <span className="block font-display text-2xl font-bold tracking-tight text-text-primary">
                {stats.loading ? (
                  <span className="inline-block h-7 w-8 animate-pulse rounded bg-surface-elevated align-middle" />
                ) : value === null ? (
                  "—"
                ) : (
                  value
                )}
              </span>
              <span className="mt-0.5 block text-xs font-semibold text-text-muted">
                {tile.label}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
