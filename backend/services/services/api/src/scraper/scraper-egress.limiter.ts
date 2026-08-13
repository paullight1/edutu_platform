type ScraperEgressLimiterOptions = {
  limit: number;
  maxBuckets?: number;
  windowMs?: number;
  now?: () => number;
};

type Bucket = {
  windowStartedAt: number;
  count: number;
};

const DEFAULT_MAX_BUCKETS = 10_000;
const DEFAULT_WINDOW_MS = 60_000;

export class ScraperEgressLimiter {
  private readonly limit: number;
  private readonly maxBuckets: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly buckets = new Map<string, Bucket>();

  constructor(options: ScraperEgressLimiterOptions) {
    this.limit = options.limit;
    this.maxBuckets = options.maxBuckets ?? DEFAULT_MAX_BUCKETS;
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    this.now = options.now ?? Date.now;

    if (
      !Number.isSafeInteger(this.limit) ||
      this.limit <= 0 ||
      !Number.isSafeInteger(this.maxBuckets) ||
      this.maxBuckets <= 0 ||
      !Number.isSafeInteger(this.windowMs) ||
      this.windowMs <= 0
    ) {
      throw new Error("Invalid scraper egress limiter configuration");
    }
  }

  consume(principal: string, clientIp?: string): boolean {
    const now = this.now();
    if (!Number.isFinite(now)) return false;

    this.removeExpiredBuckets(now);

    const keys = [`principal:${principal}`];
    if (clientIp) keys.push(`ip:${clientIp}`);
    const uniqueKeys = [...new Set(keys)];
    const missingBuckets = uniqueKeys.filter((key) => !this.buckets.has(key));
    if (this.buckets.size + missingBuckets.length > this.maxBuckets) {
      return false;
    }

    for (const key of uniqueKeys) {
      const bucket = this.buckets.get(key);
      if (bucket && bucket.count >= this.limit) return false;
    }

    for (const key of uniqueKeys) {
      const bucket = this.buckets.get(key);
      if (bucket) {
        bucket.count += 1;
      } else {
        this.buckets.set(key, { windowStartedAt: now, count: 1 });
      }
    }
    return true;
  }

  private removeExpiredBuckets(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.windowStartedAt >= this.windowMs) {
        this.buckets.delete(key);
      }
    }
  }
}
