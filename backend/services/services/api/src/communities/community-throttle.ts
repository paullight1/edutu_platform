import type { ThrottlerGetTrackerFunction } from "@nestjs/throttler";

export const COMMUNITY_THROTTLES = {
  createGroup: { limit: 6, ttl: 10 * 60_000 },
  joinGroup: { limit: 20, ttl: 60_000 },
  inviteMember: { limit: 20, ttl: 60_000 },
  mutateMembership: { limit: 30, ttl: 60_000 },
  uploadReservation: { limit: 10, ttl: 60_000 },
  sendGroupMessage: { limit: 30, ttl: 60_000 },
  report: { limit: 10, ttl: 10 * 60_000 },
  block: { limit: 20, ttl: 60_000 },
  dmRequest: { limit: 10, ttl: 10 * 60_000 },
  sendDmMessage: { limit: 30, ttl: 60_000 },
} as const;

/**
 * Community mutations are authenticated, so rate limits should follow the
 * account rather than punish everyone behind a campus, office, or carrier NAT.
 * ClerkAuthGuard is registered as an APP_GUARD by AuthModule; when a request
 * reaches ThrottlerGuard the raw Clerk subject is normally available as
 * `request.user.authId`. IP/remote address remain a fail-closed fallback for
 * any request that reaches the limiter before an authenticated identity is
 * attached.
 */
export const communityThrottleTracker: ThrottlerGetTrackerFunction = async (
  request: Record<string, unknown>,
) => {
  const user = request.user as
    | { authId?: unknown; id?: unknown }
    | undefined;
  const authId = typeof user?.authId === "string" ? user.authId.trim() : "";
  if (authId) return `community:user:${authId}`;

  const databaseId = typeof user?.id === "string" ? user.id.trim() : "";
  if (databaseId) return `community:db-user:${databaseId}`;

  const ip = typeof request.ip === "string" ? request.ip.trim() : "";
  if (ip) return `community:ip:${ip}`;

  const socket = request.socket as { remoteAddress?: unknown } | undefined;
  const remoteAddress =
    typeof socket?.remoteAddress === "string" ? socket.remoteAddress.trim() : "";
  return `community:ip:${remoteAddress || "unknown"}`;
};

export function communityThrottle(
  policy: keyof typeof COMMUNITY_THROTTLES,
) {
  const config = COMMUNITY_THROTTLES[policy];
  return {
    default: {
      limit: config.limit,
      ttl: config.ttl,
      getTracker: communityThrottleTracker,
    },
  };
}
