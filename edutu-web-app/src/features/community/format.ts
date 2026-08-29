import { formatDistanceToNowStrict } from "date-fns";
import type { CommunityGroup, MembershipStatus } from "./types";

export function formatCommunityTime(value?: string | null): string {
  if (!value) return "No activity yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return `${formatDistanceToNowStrict(date, { addSuffix: true })}`;
}

export function formatCommunityCount(value: number): string {
  const safe = Math.max(0, Number.isFinite(value) ? value : 0);
  if (safe < 1_000) return Math.round(safe).toLocaleString();

  const compact = safe >= 1_000_000 ? safe / 1_000_000 : safe / 1_000;
  const suffix = safe >= 1_000_000 ? "M" : "K";
  const rounded = compact >= 10 ? Math.round(compact).toString() : compact.toFixed(1).replace(/\.0$/, "");
  return `${rounded}${suffix}`;
}

export function membershipLabel(status?: MembershipStatus | null): string {
  switch (status) {
    case "active":
      return "Joined";
    case "invited":
      return "Invited";
    case "pending":
      return "Awaiting approval";
    case "removed":
      return "Left group";
    case "banned":
      return "Unavailable";
    default:
      return "Explore";
  }
}

export function groupTimingLabel(group: CommunityGroup): string | null {
  if (group.archivedAt) return "Archived";
  if (!group.expiresAt) return null;
  const expires = new Date(group.expiresAt);
  if (Number.isNaN(expires.getTime())) return null;
  if (expires.getTime() <= Date.now()) return "Closed";
  return `Closes ${formatDistanceToNowStrict(expires, { addSuffix: true })}`;
}

export function publicDescription(value: string | null | undefined, fallback: string): string {
  const normalized = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return normalized || fallback;
}
