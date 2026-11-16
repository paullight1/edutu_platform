/**
 * One source of truth for deadline urgency across the whole mobile app. The
 * feed, opportunities list, saved list, applied list, detail screen and the
 * home-screen widget all render the same wording, thresholds and colours from
 * here — no more per-screen formatters that drift.
 *
 * Mirrors edutu-web-app/src/services/deadlineUrgency.ts.
 */

export type UrgencyLevel =
  | 'rolling'
  | 'expired'
  | 'today'
  | 'tomorrow'
  | 'critical' // 2–3 days
  | 'urgent' // 4–7 days
  | 'soon' // 8–30 days
  | 'normal' // > 30 days
  | 'none'; // no deadline listed

export interface DeadlineBadge {
  level: UrgencyLevel;
  /** Full label, e.g. "Closes today", "Closes tomorrow", "3 days left". */
  label: string;
  /** Compact label for tight spots, e.g. "Today", "1d", "3d", "Rolling". */
  shortLabel: string;
  /** Absolute formatted date, when the deadline is a real date. */
  date: string | null;
  daysLeft: number | null;
  /** True for critical/urgent — worth a coloured badge. */
  isUrgent: boolean;
}

const ROLLING_RE = /rolling|ongoing|always\s*open|no\s*deadline|continuous/i;

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Parse a deadline string into a Date, or null when unusable. */
export function parseDeadline(deadline?: string | null): Date | null {
  if (!deadline) {
    return null;
  }

  const parsed = new Date(deadline);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Format a date as "d MMM yyyy", e.g. "5 Jul 2026". */
function formatDeadlineDate(date: Date): string {
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

/** Whole-calendar-day difference (ignoring the time of day). */
function calendarDaysBetween(target: Date, now: Date): number {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function levelFor(daysLeft: number): UrgencyLevel {
  if (daysLeft <= 0) return 'today';
  if (daysLeft === 1) return 'tomorrow';
  if (daysLeft <= 3) return 'critical';
  if (daysLeft <= 7) return 'urgent';
  if (daysLeft <= 30) return 'soon';
  return 'normal';
}

export function getDeadlineBadge(
  deadline?: string | null,
  now: Date = new Date(),
): DeadlineBadge {
  if (typeof deadline === 'string' && ROLLING_RE.test(deadline)) {
    return {
      level: 'rolling',
      label: 'Rolling deadline',
      shortLabel: 'Rolling',
      date: null,
      daysLeft: null,
      isUrgent: false,
    };
  }

  const parsed = parseDeadline(deadline);
  if (!parsed) {
    return {
      level: 'none',
      label: 'Deadline not listed',
      shortLabel: '—',
      date: null,
      daysLeft: null,
      isUrgent: false,
    };
  }

  const date = formatDeadlineDate(parsed);
  const daysLeft = calendarDaysBetween(parsed, now);

  if (daysLeft < 0) {
    return {
      level: 'expired',
      label: 'Closed',
      shortLabel: 'Closed',
      date,
      daysLeft,
      isUrgent: false,
    };
  }

  const level = levelFor(daysLeft);
  const label =
    level === 'today'
      ? 'Closes today'
      : level === 'tomorrow'
        ? 'Closes tomorrow'
        : `${daysLeft} days left`;
  const shortLabel =
    level === 'today'
      ? 'Today'
      : level === 'tomorrow'
        ? 'Tomorrow'
        : `${daysLeft}d`;

  return {
    level,
    label,
    shortLabel,
    date,
    daysLeft,
    isUrgent: level === 'critical' || level === 'urgent',
  };
}

/**
 * Hex colour for the badge text/dot/border, keyed by urgency level. Consistent
 * with the app's existing usage: pressing deadlines are red, near ones amber,
 * comfortable ones green, and closed/unknown muted grey.
 */
export function urgencyColor(level: UrgencyLevel): string {
  switch (level) {
    case 'today':
    case 'critical':
      return '#EF4444'; // red
    case 'tomorrow':
    case 'urgent':
      return '#F59E0B'; // amber
    case 'soon':
    case 'normal':
    case 'rolling':
      return '#10B981'; // green
    case 'expired':
    case 'none':
    default:
      return '#64748B'; // slate
  }
}
