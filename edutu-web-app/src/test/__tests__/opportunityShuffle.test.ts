import { describe, expect, it } from "vitest";
import {
  createOpportunityShuffleSeed,
  seededRandom,
  shuffleLatestOpportunityFeed,
  shuffleOpportunityFeed,
} from "../../lib/opportunityShuffle";

describe("seededRandom", () => {
  it("is deterministic for a given seed", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    for (let i = 0; i < 10; i += 1) {
      expect(a()).toBe(b());
    }
  });

  it("yields values in [0, 1)", () => {
    const random = seededRandom(7);
    for (let i = 0; i < 100; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("survives zero and negative seeds", () => {
    expect(() => seededRandom(0)()).not.toThrow();
    expect(() => seededRandom(-123)()).not.toThrow();
  });
});

describe("shuffleOpportunityFeed", () => {
  const items = Array.from({ length: 20 }, (_, i) => i);

  it("returns the same permutation for the same seed", () => {
    expect(shuffleOpportunityFeed(items, 99)).toEqual(
      shuffleOpportunityFeed(items, 99),
    );
  });

  it("returns different orders for different seeds", () => {
    expect(shuffleOpportunityFeed(items, 1)).not.toEqual(
      shuffleOpportunityFeed(items, 2),
    );
  });

  it("is a permutation: same elements, nothing lost or duplicated", () => {
    const shuffled = shuffleOpportunityFeed(items, 5);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
  });

  it("does not mutate the input array", () => {
    const input = [1, 2, 3, 4, 5];
    shuffleOpportunityFeed(input, 3);
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });

  it("handles empty and single-item lists", () => {
    expect(shuffleOpportunityFeed([], 1)).toEqual([]);
    expect(shuffleOpportunityFeed(["only"], 1)).toEqual(["only"]);
  });
});

describe("shuffleLatestOpportunityFeed", () => {
  it("keeps newer posting days first and puts undated items last", () => {
    const items = [
      { id: "undated", timestamp: null },
      { id: "older", timestamp: Date.parse("2026-09-28T09:00:00Z") },
      { id: "today-a", timestamp: Date.parse("2026-09-30T08:00:00Z") },
      { id: "today-b", timestamp: Date.parse("2026-09-30T16:00:00Z") },
    ];

    const result = shuffleLatestOpportunityFeed(items, 29, (item) => item.timestamp);

    expect(result.slice(0, 2).map((item) => item.id).sort()).toEqual([
      "today-a",
      "today-b",
    ]);
    expect(result[2].id).toBe("older");
    expect(result[3].id).toBe("undated");
    expect(items[0].id).toBe("undated");
  });

  it("rotates opportunities posted on the same day between visits", () => {
    const day = Date.parse("2026-09-30T12:00:00Z");
    const items = Array.from({ length: 8 }, (_, index) => ({
      id: `item-${index}`,
      timestamp: day + index * 60_000,
    }));
    const getTimestamp = (item: (typeof items)[number]) => item.timestamp;

    expect(shuffleLatestOpportunityFeed(items, 11, getTimestamp)).not.toEqual(
      shuffleLatestOpportunityFeed(items, 23, getTimestamp),
    );
  });
});

describe("createOpportunityShuffleSeed", () => {
  it("returns a positive finite number", () => {
    const seed = createOpportunityShuffleSeed();
    expect(Number.isFinite(seed)).toBe(true);
    expect(seed).toBeGreaterThan(0);
  });
});
