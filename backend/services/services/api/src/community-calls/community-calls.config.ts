import type { CommunityCallsConfig } from "./community-calls.types";

export const COMMUNITY_CALLS_CONFIG = Symbol("COMMUNITY_CALLS_CONFIG");

function integer(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(process.env[name]);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(minimum, Math.min(parsed, maximum));
}

export function communityCallsConfig(): CommunityCallsConfig {
  return {
    enabled: process.env.COMMUNITY_CALLS_ENABLED === "true",
    gatewayUrl: process.env.VOICE_GATEWAY_URL?.replace(/\/$/, "") || null,
    tokenSecret: process.env.COMMUNITY_CALL_TOKEN_SECRET || null,
    issuer: "edutu-api",
    joinAudience: "edutu-voice",
    gatewayAudience: "edutu-voice-internal",
    callbackIssuer: "edutu-voice",
    callbackAudience: "edutu-api-internal",
    gatewayTimeoutMs: integer("VOICE_GATEWAY_TIMEOUT_MS", 5_000, 500, 15_000),
    joinTokenTtlSeconds: integer(
      "COMMUNITY_CALL_JOIN_TOKEN_TTL_SECONDS",
      60,
      30,
      120,
    ),
    startEarlyMinutes: integer("COMMUNITY_CALL_START_EARLY_MINUTES", 5, 0, 60),
    startLateMinutes: integer("COMMUNITY_CALL_START_LATE_MINUTES", 30, 1, 240),
    reminderMinutes: integer("COMMUNITY_CALL_REMINDER_MINUTES", 15, 1, 1440),
    ringSeconds: integer("COMMUNITY_CALL_RING_SECONDS", 45, 10, 120),
    ringLeaseSeconds: integer("COMMUNITY_CALL_RING_LEASE_SECONDS", 30, 10, 120),
    ringRetryBaseSeconds: integer(
      "COMMUNITY_CALL_RING_RETRY_BASE_SECONDS",
      2,
      1,
      30,
    ),
    maximumDurationMinutes: integer(
      "COMMUNITY_CALL_MAX_DURATION_MINUTES",
      120,
      5,
      480,
    ),
    participantCap: integer("COMMUNITY_CALL_PARTICIPANT_CAP", 100, 2, 500),
    lifecycleBatchSize: integer(
      "COMMUNITY_CALL_LIFECYCLE_BATCH_SIZE",
      25,
      1,
      100,
    ),
    startingTimeoutMinutes: integer(
      "COMMUNITY_CALL_STARTING_TIMEOUT_MINUTES",
      5,
      1,
      30,
    ),
  };
}
