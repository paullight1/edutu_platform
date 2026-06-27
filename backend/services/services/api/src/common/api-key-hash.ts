import { createHash, createHmac, timingSafeEqual } from "crypto";

/**
 * Centralised API-key hashing.
 *
 * - When `API_KEY_PEPPER` is configured, keys are hashed with HMAC-SHA256 keyed
 *   by the pepper. This means a leaked `api_consumers` table alone cannot be
 *   brute-forced offline without the pepper.
 * - Legacy keys created before the pepper was introduced were stored as plain
 *   SHA-256. They are still accepted during the migration window so existing
 *   customers are not locked out; rotating a key upgrades it to the peppered
 *   HMAC form.
 * - When no pepper is configured, behaviour is identical to the previous
 *   implementation (plain SHA-256) so local development keeps working.
 */
function getPepper(): string | null {
  const pepper = process.env.API_KEY_PEPPER;
  return typeof pepper === "string" && pepper.length >= 16 ? pepper : null;
}

export function hashApiKey(rawKey: string): string {
  const pepper = getPepper();
  if (pepper) {
    return createHmac("sha256", pepper).update(rawKey).digest("hex");
  }
  return createHash("sha256").update(rawKey).digest("hex");
}

export function legacyHashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function apiKeyMatches(rawKey: string, storedHash: string): boolean {
  const candidates = new Set<string>();
  candidates.add(hashApiKey(rawKey));

  const pepper = getPepper();
  if (pepper) {
    candidates.add(legacyHashApiKey(rawKey));
  }

  for (const candidate of candidates) {
    if (safeEqualHash(candidate, storedHash)) {
      return true;
    }
  }
  return false;
}

export function safeEqualHash(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
