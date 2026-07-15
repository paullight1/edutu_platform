import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";

/**
 * Cache-aside store with a shared Redis backend when REDIS_URL is set, and a
 * per-instance in-memory TTL map otherwise. The Redis client is loaded lazily
 * via require() so the build/boot stay green without the optional `ioredis`
 * dependency — the app simply uses the in-memory cache until Redis is wired.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private redis: any = null;
  private redisChecked = false;
  private readonly mem = new Map<
    string,
    { value: string; expiresAt: number }
  >();
  private readonly MAX_MEM_ENTRIES = 5000;

  private getRedis(): any | null {
    if (this.redisChecked) return this.redis;
    this.redisChecked = true;

    const url = process.env.REDIS_URL;
    if (!url) return null;

    try {
      const Redis = require("ioredis");
      this.redis = new Redis(url, {
        maxRetriesPerRequest: 2,
        enableOfflineQueue: false,
        lazyConnect: false,
      });
      this.redis.on("error", (error: any) =>
        this.logger.warn(`Redis error: ${error?.message ?? error}`),
      );
      this.logger.log("Cache backend: Redis");
      return this.redis;
    } catch {
      this.logger.warn(
        "REDIS_URL set but ioredis not installed; using in-memory cache",
      );
      return null;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const redis = this.getRedis();
    if (redis) {
      try {
        const raw = await redis.get(key);
        return raw ? (JSON.parse(raw) as T) : null;
      } catch {
        return null;
      }
    }
    const entry = this.mem.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.mem.delete(key);
      return null;
    }
    return JSON.parse(entry.value) as T;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (value === undefined || value === null) return;
    const raw = JSON.stringify(value);
    const redis = this.getRedis();
    if (redis) {
      try {
        await redis.set(key, raw, "EX", ttlSeconds);
      } catch {
        /* ignore cache write failures */
      }
      return;
    }
    if (this.mem.size >= this.MAX_MEM_ENTRIES) {
      const oldest = this.mem.keys().next().value;
      if (oldest) this.mem.delete(oldest);
    }
    this.mem.set(key, {
      value: raw,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  /** Cache-aside: return cached value or compute, store, and return it. */
  async wrap<T>(
    key: string,
    ttlSeconds: number,
    compute: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null && cached !== undefined) return cached;
    const fresh = await compute();
    await this.set(key, fresh, ttlSeconds);
    return fresh;
  }

  async del(...keys: string[]): Promise<void> {
    if (!keys.length) return;
    const redis = this.getRedis();
    if (redis) {
      try {
        await redis.del(...keys);
      } catch {
        /* ignore */
      }
      return;
    }
    for (const key of keys) this.mem.delete(key);
  }

  /** Invalidate every key under a prefix (e.g. "opps:list:"). */
  async delByPrefix(prefix: string): Promise<void> {
    const redis = this.getRedis();
    if (redis) {
      try {
        let cursor = "0";
        do {
          const [next, keys] = await redis.scan(
            cursor,
            "MATCH",
            `${prefix}*`,
            "COUNT",
            200,
          );
          cursor = next;
          if (keys.length) await redis.del(...keys);
        } while (cursor !== "0");
      } catch {
        /* ignore */
      }
      return;
    }
    for (const key of Array.from(this.mem.keys())) {
      if (key.startsWith(prefix)) this.mem.delete(key);
    }
  }

  onModuleDestroy(): void {
    if (this.redis) {
      try {
        this.redis.quit();
      } catch {
        /* ignore */
      }
    }
  }
}
