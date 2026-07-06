import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "edutu:matchScores:v1";

type Store = typeof import("../../services/serverMatchStore");

async function loadStore(): Promise<Store> {
  return import("../../services/serverMatchStore");
}

const entry = (id: string, score = 72) => ({
  id,
  score,
  reasons: [{ kind: "interest" as const, label: "Matches AI", points: 15 }],
  risks: ["Deadline soon"],
});

beforeEach(() => {
  vi.resetModules();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("serverMatchStore", () => {
  it("returns primed entries for the same user", async () => {
    const store = await loadStore();
    store.primeServerMatches("user-1", [entry("opp-1", 81)]);

    const match = store.getServerMatch("user-1", "opp-1");
    expect(match).not.toBeNull();
    expect(match?.score).toBe(81);
    expect(match?.reasons[0]?.label).toBe("Matches AI");
    expect(match?.risks).toEqual(["Deadline soon"]);
  });

  it("returns null for unknown ids", async () => {
    const store = await loadStore();
    store.primeServerMatches("user-1", [entry("opp-1")]);

    expect(store.getServerMatch("user-1", "missing")).toBeNull();
  });

  it("isolates users: another user's key reads null and re-priming replaces", async () => {
    const store = await loadStore();
    store.primeServerMatches("user-1", [entry("opp-1")]);

    expect(store.getServerMatch("user-2", "opp-1")).toBeNull();

    store.primeServerMatches("user-2", [entry("opp-2")]);
    expect(store.getServerMatch("user-2", "opp-2")).not.toBeNull();
    // user-1's entries were replaced entirely.
    expect(store.getServerMatch("user-1", "opp-1")).toBeNull();
  });

  it("expires entries after 30 minutes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T10:00:00Z"));
    const store = await loadStore();
    store.primeServerMatches("user-1", [entry("opp-1")]);

    vi.setSystemTime(new Date("2026-07-06T10:29:00Z"));
    expect(store.getServerMatch("user-1", "opp-1")).not.toBeNull();

    vi.setSystemTime(new Date("2026-07-06T10:31:00Z"));
    expect(store.getServerMatch("user-1", "opp-1")).toBeNull();
  });

  it("notifies subscribers on prime and clear, and supports unsubscribe", async () => {
    const store = await loadStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribeServerMatches(listener);

    store.primeServerMatches("user-1", [entry("opp-1")]);
    expect(listener).toHaveBeenCalledTimes(1);

    store.clearServerMatches();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    store.primeServerMatches("user-1", [entry("opp-2")]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("clears everything on clearServerMatches", async () => {
    const store = await loadStore();
    store.primeServerMatches("user-1", [entry("opp-1")]);
    store.clearServerMatches();

    expect(store.getServerMatch("user-1", "opp-1")).toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("rehydrates from sessionStorage after a module reload", async () => {
    const first = await loadStore();
    first.primeServerMatches("user-1", [entry("opp-1", 64)]);

    vi.resetModules();
    const second = await loadStore();

    expect(second.getServerMatch("user-1", "opp-1")?.score).toBe(64);
  });
});

describe("toMatchReasons", () => {
  it("prefers structured match_reason_details and keeps known kinds", async () => {
    const { toMatchReasons } = await loadStore();
    const reasons = toMatchReasons({
      match_reason_details: [
        { kind: "interest", label: "Matches AI", points: 15 },
        { kind: "location", label: "Open in Ghana", points: 8 },
      ],
      matchReasons: ["ignored fallback"],
    });

    expect(reasons).toEqual([
      { kind: "interest", label: "Matches AI", points: 15 },
      { kind: "location", label: "Open in Ghana", points: 8 },
    ]);
  });

  it("maps unknown/server kinds to nearest UI kinds", async () => {
    const { toMatchReasons } = await loadStore();
    const reasons = toMatchReasons({
      matchReasonDetails: [
        { kind: "semantic", label: "Similar to your goals", points: 12 },
        { kind: "behavior", label: "You engaged with similar", points: 6 },
        { kind: "profile_fit", label: "Fits your field", points: 10 },
        { kind: "totally-new-kind", label: "Something else", points: 2 },
      ],
    });

    expect(reasons.map((reason) => reason.kind)).toEqual([
      "interest",
      "category",
      "field",
      "category",
    ]);
  });

  it("falls back to string matchReasons with descending points", async () => {
    const { toMatchReasons } = await loadStore();
    const reasons = toMatchReasons({
      matchReasons: ["First reason", "Second reason"],
    });

    expect(reasons).toEqual([
      { kind: "category", label: "First reason", points: 2 },
      { kind: "category", label: "Second reason", points: 1 },
    ]);
  });

  it("coerces object reason items to their label (never [object Object])", async () => {
    const { toMatchReasons } = await loadStore();
    const reasons = toMatchReasons({
      match_reasons: [
        { kind: "interest", label: "Object shaped reason", points: 9 },
        "Plain string reason",
        { nolabel: true },
      ],
    });

    expect(reasons.map((reason) => reason.label)).toEqual([
      "Object shaped reason",
      "Plain string reason",
    ]);
    expect(
      reasons.every((reason) => !reason.label.includes("[object")),
    ).toBe(true);
  });

  it("returns [] for missing/invalid rows", async () => {
    const { toMatchReasons } = await loadStore();
    expect(toMatchReasons(null)).toEqual([]);
    expect(toMatchReasons({})).toEqual([]);
    expect(toMatchReasons({ match_reason_details: "nope" })).toEqual([]);
  });
});
