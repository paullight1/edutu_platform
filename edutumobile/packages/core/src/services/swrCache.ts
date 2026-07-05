import AsyncStorage from '@react-native-async-storage/async-storage';

interface CacheEnvelope<T> {
  value: T;
  at: number;
}

/**
 * Read a cached value written by writeCache. Returns { value, ageMs } or null.
 * Never throws — a cache miss/parse error just returns null.
 */
export async function readCache<T>(
  key: string,
): Promise<{ value: T; ageMs: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (parsed?.value === undefined) return null;
    return { value: parsed.value, ageMs: Date.now() - (parsed.at || 0) };
  } catch {
    return null;
  }
}

export async function writeCache(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(
      key,
      JSON.stringify({ value, at: Date.now() } satisfies CacheEnvelope<unknown>),
    );
  } catch {
    /* best-effort cache */
  }
}

/**
 * Stale-while-revalidate: synchronously hand back cached data (via onData) if
 * present, then fetch fresh data, cache it, and call onData again. Returns the
 * fresh value. `maxAgeMs` lets callers skip the network when the cache is fresh.
 */
export async function swr<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: { onData?: (value: T, fromCache: boolean) => void; maxAgeMs?: number } = {},
): Promise<T | null> {
  const cached = await readCache<T>(key);
  if (cached) {
    opts.onData?.(cached.value, true);
    if (opts.maxAgeMs && cached.ageMs < opts.maxAgeMs) {
      return cached.value; // fresh enough — skip the network entirely
    }
  }
  try {
    const fresh = await fetcher();
    if (fresh !== undefined && fresh !== null) {
      await writeCache(key, fresh);
      opts.onData?.(fresh, false);
    }
    return fresh;
  } catch {
    return cached ? cached.value : null;
  }
}
