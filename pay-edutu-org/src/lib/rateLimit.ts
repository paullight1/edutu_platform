// Best-effort in-memory per-key rate limiter for the admin/auth endpoints.
// State lives per serverless instance (not shared across instances or cold
// starts), so it is NOT a hard quota — it exists to blunt online brute-force of
// the admin token, which is otherwise only protected by token entropy. Pair it
// with a long random ADMIN_DASHBOARD_TOKEN.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** Best-effort client IP from proxy headers (Vercel/Render set x-forwarded-for). */
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') || '';
  const first = xff.split(',')[0]?.trim();
  return first || req.headers.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * Returns true when the caller is OVER the limit and should be rejected.
 * Allows up to `max` calls per `windowMs` per key, sliding by fixed window.
 */
export function rateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  bucket.count += 1;

  // Bound memory: opportunistically drop expired buckets when the map grows.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.resetAt <= now) buckets.delete(k);
    }
  }

  return bucket.count > max;
}
