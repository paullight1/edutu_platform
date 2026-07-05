import { CalendarClock } from "lucide-react";
import {
  getDeadlineBadge,
  urgencyBadgeClasses,
  type DeadlineBadge,
} from "../../services/deadlineUrgency";

/**
 * A coloured deadline pill (e.g. "Closes today", "3 days left", "Rolling").
 * Pass either a raw `deadline` string or a precomputed `badge`. By default it
 * only renders when the deadline is actually urgent, so cards stay calm until
 * a cutoff is near — pass `always` to show every state.
 */
export default function UrgencyPill({
  deadline,
  badge,
  always = false,
  withIcon = true,
  compact = false,
  className = "",
}: {
  deadline?: string | null;
  badge?: DeadlineBadge;
  always?: boolean;
  withIcon?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const resolved = badge ?? getDeadlineBadge(deadline);

  // By default surface only the states worth interrupting the user for.
  const worthShowing =
    always ||
    resolved.isUrgent ||
    resolved.level === "today" ||
    resolved.level === "tomorrow";
  if (!worthShowing) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${urgencyBadgeClasses(
        resolved.level,
      )} ${className}`}
      title={resolved.date ? `Deadline: ${resolved.date}` : resolved.label}
    >
      {withIcon ? <CalendarClock size={12} /> : null}
      {compact ? resolved.shortLabel : resolved.label}
    </span>
  );
}
