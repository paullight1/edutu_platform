const jsonInFlight = new Map<string, Promise<unknown>>();

/**
 * fetch() with an AbortController timeout so a sleeping (cold-start) backend
 * can't hang the UI indefinitely. Honors a caller-supplied signal if given.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 9000,
): Promise<Response> {
  if (init.signal) return fetch(url, init);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * De-duplicates concurrent identical requests: if the same key is already in
 * flight (e.g. two screens mount the same fetch), both await one promise.
 */
export function dedupe<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = jsonInFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = run().finally(() => jsonInFlight.delete(key));
  jsonInFlight.set(key, promise);
  return promise;
}

/** Convenience: timed + deduped GET returning parsed JSON. */
export async function getJson<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = 9000,
): Promise<T> {
  return dedupe(`GET:${url}`, async () => {
    const res = await fetchWithTimeout(url, init, timeoutMs);
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return (await res.json()) as T;
  });
}
