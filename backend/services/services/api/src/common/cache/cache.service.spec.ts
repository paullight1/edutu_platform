import { CacheService } from "./cache.service";

describe("CacheService (in-memory fallback)", () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.REDIS_URL; // force in-memory path
  });
  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("stores and returns a value, and misses on unknown keys", async () => {
    const cache = new CacheService();
    await cache.set("k1", { a: 1 }, 60);
    expect(await cache.get("k1")).toEqual({ a: 1 });
    expect(await cache.get("missing")).toBeNull();
  });

  it("expires entries after their TTL", async () => {
    jest.useFakeTimers();
    try {
      const cache = new CacheService();
      await cache.set("k", "v", 1);
      expect(await cache.get("k")).toBe("v");
      jest.advanceTimersByTime(1500);
      expect(await cache.get("k")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("wrap() computes once then serves from cache", async () => {
    const cache = new CacheService();
    const compute = jest.fn().mockResolvedValue({ n: 42 });
    const first = await cache.wrap("wk", 60, compute);
    const second = await cache.wrap("wk", 60, compute);
    expect(first).toEqual({ n: 42 });
    expect(second).toEqual({ n: 42 });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("delByPrefix invalidates every matching key", async () => {
    const cache = new CacheService();
    await cache.set("roadmaps:list:a", 1, 60);
    await cache.set("roadmaps:detail:x", 2, 60);
    await cache.set("opps:list:a", 3, 60);
    await cache.delByPrefix("roadmaps:");
    expect(await cache.get("roadmaps:list:a")).toBeNull();
    expect(await cache.get("roadmaps:detail:x")).toBeNull();
    expect(await cache.get("opps:list:a")).toBe(3);
  });

  describe("incrementWindow", () => {
    it("counts up within a window and keeps the same reset time", async () => {
      const cache = new CacheService();
      const a = await cache.incrementWindow("rl:consumer1", 60);
      const b = await cache.incrementWindow("rl:consumer1", 60);
      expect(a.count).toBe(1);
      expect(b.count).toBe(2);
      // The window's reset time is fixed at the first hit.
      expect(b.resetMs).toBe(a.resetMs);
    });

    it("keeps separate counters per key", async () => {
      const cache = new CacheService();
      await cache.incrementWindow("rl:a", 60);
      const b = await cache.incrementWindow("rl:b", 60);
      expect(b.count).toBe(1);
    });

    it("starts a fresh window after the previous one expires", async () => {
      jest.useFakeTimers();
      try {
        const cache = new CacheService();
        const first = await cache.incrementWindow("rl:c", 1);
        expect(first.count).toBe(1);
        jest.advanceTimersByTime(1100);
        const second = await cache.incrementWindow("rl:c", 1);
        expect(second.count).toBe(1);
        expect(second.resetMs).toBeGreaterThan(first.resetMs);
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
