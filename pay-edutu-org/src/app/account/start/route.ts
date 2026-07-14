import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/env';
import { SESSION_COOKIE, clerkConfigured, signSession, verifyClerkToken } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /account/start?uid=..&t=<clerk token>
// Verifies the Clerk token, mints a short-lived signed session cookie, then
// redirects to the clean /account page (so the token never lingers in history).
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const uid = url.searchParams.get('uid')?.trim() || '';
  const token = url.searchParams.get('t');

  const verifiedSub = await verifyClerkToken(token);
  // Owner ONLY when a real Clerk token verifies (and matches any provided uid).
  // No fail-open uid trust: minting a session for an unverified, caller-supplied
  // uid would let anyone forge an owner cookie for a victim and cancel their sub.
  let owner = '';
  if (verifiedSub && (!uid || verifiedSub === uid)) owner = verifiedSub;
  if (!owner && !clerkConfigured()) {
    console.error('[SECURITY] /account/start could not mint a session — CLERK_JWKS_URL not configured');
  }

  const dest = `${config.baseUrl()}/account?uid=${encodeURIComponent(owner || uid)}`;
  const res = NextResponse.redirect(dest, 303);

  if (owner) {
    const cookie = signSession(owner);
    if (cookie) {
      res.cookies.set(SESSION_COOKIE, cookie, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 1800,
      });
    }
  }

  return res;
}
