import {
  createPublicKey,
  verify as cryptoVerify,
  type KeyObject,
} from "crypto";

/**
 * Networkless-ish Clerk token verification against the instance's public JWKS.
 *
 * This is a resilience fallback for `ClerkAuthGuard`: Clerk's `verifyToken`
 * hard-requires a `secretKey` (or `jwtKey`), so a missing/incorrect
 * `CLERK_SECRET_KEY` on the server silently 401s EVERY Clerk-authenticated
 * request — a real outage we hit in prod. Verifying the JWT signature directly
 * against the instance JWKS keeps auth working with zero Clerk API keys, the
 * same way the Supabase edge functions already do.
 *
 * SECURITY: the expected issuer is derived from OUR OWN publishable key (or
 * `CLERK_ISSUER_URL`), never from the token. Otherwise an attacker could
 * present a validly-signed token from any Clerk instance and be authenticated.
 */

export type ClerkJwksClaims = {
  sub: string;
  exp?: number;
  nbf?: number;
  iss?: string;
  email?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  [key: string]: unknown;
};

const JWKS_TTL_MS = 10 * 60 * 1000;
const CLOCK_SKEW_SEC = 10;

let jwksCache: { url: string; keys: JsonWebKey[]; fetchedAt: number } | null =
  null;
let cachedIssuer: string | null | undefined;

function b64urlToBuffer(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  return Buffer.from(padded, "base64");
}

function decodeSegment<T>(segment: string): T {
  return JSON.parse(b64urlToBuffer(segment).toString("utf8")) as T;
}

/**
 * The Clerk instance we trust, resolved from config we control — NOT the token.
 * `CLERK_ISSUER_URL` wins; otherwise decoded from the publishable key
 * (`pk_test_<base64('frontend-api$')>`).
 */
export function getExpectedClerkIssuer(): string | null {
  if (cachedIssuer !== undefined) return cachedIssuer;

  const explicit = process.env.CLERK_ISSUER_URL?.trim();
  if (explicit) {
    cachedIssuer = explicit.replace(/\/$/, "");
    return cachedIssuer;
  }

  const publishableKey =
    process.env.CLERK_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
    process.env.VITE_CLERK_PUBLISHABLE_KEY ||
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

  const match = publishableKey?.match(/^pk_(?:test|live)_(.+)$/);
  if (!match) {
    cachedIssuer = null;
    return cachedIssuer;
  }

  try {
    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    const host = decoded.replace(/\$+$/, "").trim();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) {
      cachedIssuer = null;
      return cachedIssuer;
    }
    cachedIssuer = `https://${host}`;
    return cachedIssuer;
  } catch {
    cachedIssuer = null;
    return cachedIssuer;
  }
}

async function getJwks(issuer: string): Promise<JsonWebKey[]> {
  const url = `${issuer}/.well-known/jwks.json`;
  const now = Date.now();
  if (
    jwksCache &&
    jwksCache.url === url &&
    now - jwksCache.fetchedAt < JWKS_TTL_MS
  ) {
    return jwksCache.keys;
  }

  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Clerk JWKS fetch failed: ${response.status}`);
  const data = (await response.json()) as { keys?: JsonWebKey[] };
  jwksCache = { url, keys: data.keys || [], fetchedAt: now };
  return jwksCache.keys;
}

async function findKey(
  issuer: string,
  kid: string,
): Promise<JsonWebKey | null> {
  const keys = await getJwks(issuer);
  const hit = keys.find((key) => (key as { kid?: string }).kid === kid);
  if (hit) return hit;

  // Key rotation: bust the cache once and retry before giving up.
  jwksCache = null;
  const fresh = await getJwks(issuer);
  return fresh.find((key) => (key as { kid?: string }).kid === kid) || null;
}

export async function verifyClerkTokenViaJwks(
  token: string,
): Promise<ClerkJwksClaims | null> {
  const expectedIssuer = getExpectedClerkIssuer();
  if (!expectedIssuer) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  let header: { alg: string; kid?: string };
  let payload: ClerkJwksClaims;
  try {
    header = decodeSegment(encodedHeader);
    payload = decodeSegment(encodedPayload);
  } catch {
    return null;
  }

  if (!header.kid || (header.alg !== "RS256" && header.alg !== "ES256")) {
    return null;
  }

  // Pin the issuer — reject tokens minted by any other Clerk instance.
  const tokenIssuer = String(payload.iss || "").replace(/\/$/, "");
  if (tokenIssuer !== expectedIssuer) return null;

  let jwk: JsonWebKey | null;
  try {
    jwk = await findKey(expectedIssuer, header.kid);
  } catch {
    return null;
  }
  if (!jwk) return null;

  let publicKey: KeyObject;
  try {
    // Node's crypto JWK input type differs from the DOM `JsonWebKey`; the shape
    // is compatible at runtime, so cast for the import.
    publicKey = createPublicKey({ key: jwk, format: "jwk" } as never);
  } catch {
    return null;
  }

  const signingInput = Buffer.from(`${encodedHeader}.${encodedPayload}`);
  const signature = b64urlToBuffer(encodedSignature);

  let valid = false;
  try {
    valid =
      header.alg === "RS256"
        ? cryptoVerify("RSA-SHA256", signingInput, publicKey, signature)
        : cryptoVerify(
            "sha256",
            signingInput,
            { key: publicKey, dsaEncoding: "ieee-p1363" },
            signature,
          );
  } catch {
    return null;
  }
  if (!valid) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  if (
    typeof payload.exp === "number" &&
    payload.exp < nowSec - CLOCK_SKEW_SEC
  ) {
    return null;
  }
  if (
    typeof payload.nbf === "number" &&
    payload.nbf > nowSec + CLOCK_SKEW_SEC
  ) {
    return null;
  }
  if (!payload.sub) return null;

  return payload;
}
