/**
 * Quiet-hours evaluation, shared by every push sender.
 *
 * The stored window is `{ start, end }` with no separate "enabled" flag, so a
 * zero-length window (`start === end`) is the canonical encoding for "quiet
 * hours off" — the mobile settings screen writes `00:00`/`00:00` when the user
 * disables them. A missing window falls back to {@link DEFAULT_QUIET_HOURS},
 * matching the `notification_preferences.quiet_hours` column default, so users
 * who have never touched the setting still aren't woken at 3am.
 */

export type QuietHours = { start: string; end: string } | null;

export const DEFAULT_QUIET_HOURS = { start: "22:00", end: "08:00" };

/** Minutes past local midnight in the given IANA timezone (UTC on failure). */
export function localMinutes(now: Date, timezone?: string | null): number {
  if (timezone) {
    try {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(now);
      const hour = Number(parts.find((part) => part.type === "hour")?.value);
      const minute = Number(
        parts.find((part) => part.type === "minute")?.value,
      );
      if (Number.isFinite(hour) && Number.isFinite(minute)) {
        return (hour % 24) * 60 + minute;
      }
    } catch {
      // Invalid tz string — fall through to UTC.
    }
  }
  return now.getUTCHours() * 60 + now.getUTCMinutes();
}

/**
 * If "now" falls inside the user's quiet hours — evaluated in THEIR local
 * timezone (profiles.timezone, synced from the device; UTC fallback) — returns
 * an ISO timestamp at the end of the window so the queue drainer delivers it
 * then; otherwise undefined (deliver immediately).
 */
export function deferForQuietHours(
  quietHours: QuietHours,
  timezone?: string | null,
  now: Date = new Date(),
): string | undefined {
  const window =
    quietHours?.start && quietHours?.end ? quietHours : DEFAULT_QUIET_HOURS;

  const parse = (value: string) => {
    const [h, m] = value.split(":").map((part) => Number(part));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  };

  const start = parse(window.start);
  const end = parse(window.end);
  // start === end is a zero-length window: quiet hours are off.
  if (start === null || end === null || start === end) return undefined;

  const nowMins = localMinutes(now, timezone);

  const inWindow =
    start < end
      ? nowMins >= start && nowMins < end
      : nowMins >= start || nowMins < end; // window wraps midnight

  if (!inWindow) return undefined;

  // Deliver when the local clock reaches the window end: advancing the UTC
  // instant by the local minutes-until-end sidesteps offset math entirely.
  const minutesUntilEnd = (end - nowMins + 24 * 60) % (24 * 60) || 24 * 60;
  return new Date(now.getTime() + minutesUntilEnd * 60_000).toISOString();
}
