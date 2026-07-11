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

// ─── Admin session ────────────────────────────────────────────────────────────
// The admin dashboard used to authenticate via ?token= in the URL, which leaks
// the token into browser history, server logs and referrers. Instead the login
// form POSTs the token once to /api/admin/login, which sets this short-lived
// HMAC-signed cookie (keyed off the admin token itself, so no extra env var).

export const ADMIN_COOKIE = 'edutu_pay_admin';

/** Constant-time string comparison (avoids char-by-char timing leaks). */
export function timingSafeEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function isValidAdminToken(token: string | null | undefined): boolean {
  if (!token) return false;
  try {
    return timingSafeEquals(token, config.adminToken());
  } catch {
    return false; // ADMIN_DASHBOARD_TOKEN unset → nobody is admin.
  }
}

export function signAdminSession(ttlSeconds = 7200): string | null {
  try {
    const secret = config.adminToken();
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const payload = `admin.${exp}`;
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return `${payload}.${sig}`;
  } catch {
    return null;
  }
}

export function verifyAdminSession(value?: string | null): boolean {
  if (!value) return false;
  let secret: string;
  try {
    secret = config.adminToken();
  } catch {
    return false;
  }
  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== 'admin') return false;
  const [, expStr, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(`admin.${expStr}`).digest('hex');
  if (!timingSafeEquals(sig, expected)) return false;
  return Number(expStr) >= Math.floor(Date.now() / 1000);
}
