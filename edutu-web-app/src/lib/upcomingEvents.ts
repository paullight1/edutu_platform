import type { EdutuEvent } from "../types/event";

export const HOME_EVENTS_LIMIT = 3;

/**
 * Picks the events a home surface should show: published, still ahead of us,
 * soonest first. Past events drop off on their own once the start date passes,
 * so admins never have to retire an event by hand.
 *
 * `now` is injectable so the behaviour is testable without freezing the clock.
 */
export function selectUpcomingEvents(
  events: EdutuEvent[],
  { now = Date.now(), limit = HOME_EVENTS_LIMIT }: { now?: number; limit?: number } = {},
): EdutuEvent[] {
  return events
    .filter((event) => {
      // The list endpoint already defaults to published, but a caller could
      // widen the status filter — never let a draft or cancelled event through.
      const status = (event.status || "published").toLowerCase();
      if (status !== "published") return false;

      // An event with an end date stays "upcoming" until it actually finishes,
      // so a multi-day programme doesn't vanish on its opening morning.
      const endsAt = event.endsAt ? new Date(event.endsAt).getTime() : Number.NaN;
      const startsAt = new Date(event.startsAt).getTime();
      const boundary = Number.isNaN(endsAt) ? startsAt : endsAt;

      return !Number.isNaN(boundary) && boundary >= now;
    })
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    )
    .slice(0, Math.max(limit, 0));
}
