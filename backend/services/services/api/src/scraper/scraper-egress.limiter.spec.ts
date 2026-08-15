import { ScraperEgressLimiter } from "./scraper-egress.limiter";

describe("ScraperEgressLimiter", () => {
  it("enforces the bounded quota independently for each signed principal", () => {
    const limiter = new ScraperEgressLimiter({ limit: 2, now: () => 1_000 });

    expect(limiter.consume("job:a", "203.0.113.10")).toBe(true);
    expect(limiter.consume("job:a", "203.0.113.11")).toBe(true);
    expect(limiter.consume("job:a", "203.0.113.12")).toBe(false);
    expect(limiter.consume("job:b", "203.0.113.12")).toBe(true);
  });

  it("applies the optional IP defense-in-depth bucket without trusting forwarded headers", () => {
    const limiter = new ScraperEgressLimiter({ limit: 2, now: () => 1_000 });

    expect(limiter.consume("job:a", "203.0.113.10")).toBe(true);
    expect(limiter.consume("job:b", "203.0.113.10")).toBe(true);
    expect(limiter.consume("job:c", "203.0.113.10")).toBe(false);
    expect(limiter.consume("job:c")).toBe(true);
  });

  it("fails closed when its bounded bucket store is full", () => {
    const limiter = new ScraperEgressLimiter({
      limit: 1,
      maxBuckets: 1,
      now: () => 1_000,
    });

    expect(limiter.consume("job:a")).toBe(true);
    expect(limiter.consume("job:b")).toBe(false);
  });

  it("resets expired windows and does not retain secret material", () => {
    let now = 1_000;
    const limiter = new ScraperEgressLimiter({ limit: 1, now: () => now });

    expect(limiter.consume("job:a")).toBe(true);
    now += 60_001;
    expect(limiter.consume("job:a")).toBe(true);
    expect(JSON.stringify(limiter)).not.toContain("secret");
  });
});
