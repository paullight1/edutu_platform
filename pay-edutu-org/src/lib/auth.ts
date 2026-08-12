import { config } from './env';

// This package intentionally has no client Clerk integration. The canonical
// billing API exchanges a short-lived, single-use code for an opaque session;
// this host stores that value only in an httpOnly cookie and never interprets
// it as a user identifier.
const OPAQUE_SESSION = /^(?!user_)[A-Za-z0-9._~-]{32,2048}$/;

export function readBackendSession(value?: string | null): string | null {
  if (!value || !OPAQUE_SESSION.test(value)) return null;
  return value;
}

export function isTrustedPayShellOrigin(origin: string | null): boolean {
  if (!origin) return false;
  try {
    return new URL(origin).origin === config.payShellOrigin();
  } catch {
    return false;
  }
}

export function bachsPortalUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'portal.bachs.io' ? url.toString() : null;
  } catch {
    return null;
  }
}
