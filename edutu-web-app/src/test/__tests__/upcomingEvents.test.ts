import { describe, expect, it } from "vitest";
import { selectUpcomingEvents } from "../../lib/upcomingEvents";
import type { EdutuEvent } from "../../types/event";

const NOW = new Date("2026-07-27T12:00:00.000Z").getTime();

function makeEvent(overrides: Partial<EdutuEvent> & { id: string }): EdutuEvent {
  return {
    title: `Event ${overrides.id}`,
    slug: `event-${overrides.id}`,
    startsAt: new Date(NOW + 86_400_000).toISOString(),
    status: "published",
    ...overrides,
  } as EdutuEvent;
}

describe("selectUpcomingEvents", () => {
  it("drops events that already finished", () => {
    const result = selectUpcomingEvents(
      [
        makeEvent({ id: "past", startsAt: new Date(NOW - 86_400_000).toISOString() }),
        makeEvent({ id: "future" }),
      ],
      { now: NOW },
    );

    expect(result.map((event) => event.id)).toEqual(["future"]);
  });

  it("keeps an in-progress event until its end date passes", () => {
    const result = selectUpcomingEvents(
      [
        makeEvent({
          id: "running",
          startsAt: new Date(NOW - 86_400_000).toISOString(),
          endsAt: new Date(NOW + 86_400_000).toISOString(),
        }),
      ],
      { now: NOW },
    );

    expect(result.map((event) => event.id)).toEqual(["running"]);
  });

  it("sorts soonest first and caps at three", () => {
    const result = selectUpcomingEvents(
      [
        makeEvent({ id: "d", startsAt: new Date(NOW + 4 * 86_400_000).toISOString() }),
        makeEvent({ id: "b", startsAt: new Date(NOW + 2 * 86_400_000).toISOString() }),
        makeEvent({ id: "a", startsAt: new Date(NOW + 1 * 86_400_000).toISOString() }),
        makeEvent({ id: "c", startsAt: new Date(NOW + 3 * 86_400_000).toISOString() }),
      ],
      { now: NOW },
    );

    expect(result.map((event) => event.id)).toEqual(["a", "b", "c"]);
  });

  it("excludes anything that is not published", () => {
    const result = selectUpcomingEvents(
      [
        makeEvent({ id: "draft", status: "draft" }),
        makeEvent({ id: "cancelled", status: "cancelled" }),
        makeEvent({ id: "archived", status: "archived" }),
        makeEvent({ id: "live" }),
      ],
      { now: NOW },
    );

    expect(result.map((event) => event.id)).toEqual(["live"]);
  });

  it("returns nothing when there is nothing upcoming", () => {
    const result = selectUpcomingEvents(
      [makeEvent({ id: "past", startsAt: new Date(NOW - 1000).toISOString() })],
      { now: NOW },
    );

    expect(result).toEqual([]);
  });

  it("ignores events with an unparseable start date", () => {
    const result = selectUpcomingEvents(
      [makeEvent({ id: "broken", startsAt: "not a date" })],
      { now: NOW },
    );

    expect(result).toEqual([]);
  });
});
