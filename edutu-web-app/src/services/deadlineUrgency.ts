import { differenceInCalendarDays, format } from "date-fns";
import { parseOpportunityDeadline } from "./opportunities";

/**
 * One source of truth for deadline urgency across the whole app. Feed cards,
 * dashboard, saved list and the detail page all render the same wording,
 * thresholds and colours from here — no more per-screen formatters that drift.
 */

export type UrgencyLevel =
  | "rolling"
  | "expired"
  | "today"
  | "tomorrow"
  | "critical" // 2–3 days
  | "urgent" // 4–7 days
  | "soon" // 8–30 days
  | "normal" // > 30 days
  | "none"; // no deadline listed

export interface DeadlineBadge {
  level: UrgencyLevel;
  /** Full label, e.g. "Today", "Tomorrow", "3 days left", "12 Aug 2026". */
  label: string;
  /** Compact label for tight spots, e.g. "Today", "1d", "3d", "Rolling". */
  shortLabel: string;
  /** Absolute formatted date, when the deadline is a real date. */
  date: string | null;
  daysLeft: number | null;
  /** True for today/tomorrow/critical/urgent — worth a coloured badge. */
  isUrgent: boolean;
}

const ROLLING_RE = /rolling|ongoing|always\s*open|no\s*deadline|continuous/i;

function levelFor(daysLeft: number): UrgencyLevel {
  if (daysLeft <= 0) return "today";
  if (daysLeft === 1) return "tomorrow";
  if (daysLeft <= 3) return "critical";
  if (daysLeft <= 7) return "urgent";
  if (daysLeft <= 30) return "soon";
  return "normal";
}

export function getDeadlineBadge(
  deadline?: string | null,
  now: Date = new Date(),
): DeadlineBadge {
  if (typeof deadline === "string" && ROLLING_RE.test(deadline)) {
    return {
      level: "rolling",
      label: "Rolling deadline",
      shortLabel: "Rolling",
      date: null,
      daysLeft: null,
      isUrgent: false,
    };
  }

  const parsed = parseOpportunityDeadline(deadline);
  if (!parsed) {
    return {
      level: "none",
      label: "Deadline not listed",
      shortLabel: "—",
      date: null,
      daysLeft: null,
      isUrgent: false,
    };
  }

  const date = format(parsed, "d MMM yyyy");
  const daysLeft = differenceInCalendarDays(parsed, now);

  if (daysLeft < 0) {
    return {
      level: "expired",
      label: "Closed",
      shortLabel: "Closed",
      date,
      daysLeft,
      isUrgent: false,
    };
  }

  const level = levelFor(daysLeft);
  const label =
    level === "today"
      ? "Closes today"
      : level === "tomorrow"
        ? "Closes tomorrow"
        : `${daysLeft} days left`;
  const shortLabel =
    level === "today"
      ? "Today"
      : level === "tomorrow"
        ? "Tomorrow"
        : `${daysLeft}d`;

  return {
    level,
    label,
    shortLabel,
    date,
    daysLeft,
    isUrgent: level === "critical" || level === "urgent",
  };
}

/** Tailwind classes for a coloured pill badge, keyed by urgency level. */
export function urgencyBadgeClasses(level: UrgencyLevel): string {
  switch (level) {
    case "today":
    case "critical":
      return "border-danger/30 bg-danger/10 text-danger";
    case "tomorrow":
    case "urgent":
      return "border-warning/30 bg-warning/10 text-warning";
    case "soon":
      return "border-info/25 bg-info/10 text-info";
    case "expired":
      return "border-subtle bg-surface-elevated text-text-muted";
    case "rolling":
      return "border-success/25 bg-success/10 text-success";
    default:
      return "border-subtle bg-surface-elevated text-text-secondary";
  }
}

/** Inline text colour (no background) for use next to an icon on a card row. */
export function urgencyTextClasses(level: UrgencyLevel): string {
  switch (level) {
    case "today":
    case "critical":
      return "font-semibold text-danger";
    case "tomorrow":
    case "urgent":
      return "font-semibold text-warning";
    case "soon":
      return "font-medium text-info";
    default:
      return "";
  }
}
