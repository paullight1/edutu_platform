import crypto from 'crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from './env';

// Ownership verification for the self-service /account page. Two layers:
//  1. A Clerk session token (passed once from the app) proves who the user is.
//  2. We then mint a short-lived, HMAC-signed cookie so the follow-up cancel
//     action stays authenticated without re-checking Clerk each click.
// If Clerk/session env is not configured, callers fall back to the simpler
// (uid-trusting) behaviour so the site still works before you wire it up.

export const SESSION_COOKIE = 'edutu_pay_session';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  const url = config.clerkJwksUrl();
  if (!url) return null;
  if (!jwks) jwks = createRemoteJWKSet(new URL(url));
  return jwks;
}

export function clerkConfigured(): boolean {
  return Boolean(config.clerkJwksUrl());
}

export function sessionConfigured(): boolean {
  return Boolean(config.sessionSecret());
}

/** Returns the Clerk user id (`sub`) if the token verifies, else null. */
export async function verifyClerkToken(token?: string | null): Promise<string | null> {
  if (!token) return null;
  const keyset = getJwks();
  if (!keyset) return null;
  try {
    const issuer = config.clerkIssuer();
    const { payload } = await jwtVerify(token, keyset, issuer ? { issuer } : undefined);
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export function signSession(uid: string, ttlSeconds = 1800): string | null {
  const secret = config.sessionSecret();
  if (!secret) return null;
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${uid}.${exp}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifySession(value?: string | null): string | null {
  const secret = config.sessionSecret();
  if (!secret || !value) return null;
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [uid, expStr, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(`${uid}.${expStr}`).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (Number(expStr) < Math.floor(Date.now() / 1000)) return null;
  return uid;
}
