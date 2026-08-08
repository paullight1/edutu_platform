import { afterEach, describe, expect, it, vi } from "vitest";

const EVENT = {
  id: "event-1",
  title: "Scholarship application clinic",
  slug: "scholarship-application-clinic",
  startsAt: "2026-09-01T12:00:00.000Z",
  status: "published",
};

describe("events service resilience", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("reuses the last successful response when a later refresh loses the network", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([EVENT]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    const { fetchEvents } = await import("../../services/events");

    const first = await fetchEvents();
    const fallback = await fetchEvents();

    expect(first).toHaveLength(1);
    expect(fallback).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("still rejects an initial transport failure when no cached response exists", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const { fetchEvents } = await import("../../services/events");

    await expect(fetchEvents()).rejects.toThrow("Failed to fetch");
  });
});
