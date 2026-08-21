import { formatDistanceToNowStrict } from "date-fns";
import type { CommunityGroup, MembershipStatus } from "./types";

export function formatCommunityTime(value?: string | null): string {
  if (!value) return "No activity yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return `${formatDistanceToNowStrict(date, { addSuffix: true })}`;
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
