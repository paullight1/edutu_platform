import { createHmac, timingSafeEqual } from "node:crypto";
import {
  RevenueCatWebhookError,
  type ParsedRevenueCatWebhook,
  type RevenueCatEnvironment,
  type RevenueCatWebhookEnvelope,
  type RevenueCatWebhookEvent,
  type RevenueCatWebhookVerifierConfig,
  type RevenueCatWebhookVerificationInput,
} from "./revenuecat-webhook.types";

const DEFAULT_TOLERANCE_SECONDS = 300;
const DEFAULT_MAX_BODY_BYTES = 1_000_000;

export function parseRevenueCatWebhook(raw: string): ParsedRevenueCatWebhook {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new RevenueCatWebhookError(
      "invalid_json",
      400,
      "RevenueCat payload is not valid JSON.",
    );
  }
  if (
    !isRecord(parsed) ||
    parsed.api_version !== "1.0" ||
    !isRecord(parsed.event)
  ) {
    throw new RevenueCatWebhookError(
      "invalid_envelope",
      400,
      "RevenueCat webhook envelope is invalid.",
    );
  }
  const event = parsed.event;
  if (
    typeof event.type !== "string" ||
    !event.type ||
    typeof event.id !== "string" ||
    !event.id
  ) {
    throw new RevenueCatWebhookError(
      "invalid_envelope",
      400,
      "RevenueCat event metadata is invalid.",
    );
  }
  if ("data" in event || typeof event.event_timestamp_ms !== "number") {
    throw new RevenueCatWebhookError(
      "invalid_envelope",
      400,
      "RevenueCat webhook must use the official flat event shape.",
    );
  }
  const identityCandidates = uniqueStrings([
    event.app_user_id,
    event.original_app_user_id,
    ...(Array.isArray(event.aliases) ? event.aliases : []),
  ]);
  if (identityCandidates.length === 0) {
    throw new RevenueCatWebhookError(
      "invalid_envelope",
      400,
      "RevenueCat event has no app user identity.",
    );
  }
  const eventValue = event as unknown as RevenueCatWebhookEvent;
  const deliveryEnvironment = normalizeEnvironment(eventValue.environment);
  return {
    api_version: "1.0",
    event: eventValue,
    deliveryEnvironment,
    identityCandidates,
    resourceKey: eventValue.transaction_id ?? eventValue.id,
    subscriptionLineageKey: eventValue.original_transaction_id ?? null,
    paidPeriodKey: eventValue.transaction_id ?? null,
  };
}

export class RevenueCatWebhookVerifier {
  private readonly config: Required<
    Pick<RevenueCatWebhookVerifierConfig, "toleranceSeconds" | "maxBodyBytes">
  > &
    RevenueCatWebhookVerifierConfig;

  constructor(config: RevenueCatWebhookVerifierConfig) {
    if (!config.authorizationSecret && !config.hmacSecret) {
      throw new RevenueCatWebhookError(
        "invalid_configuration",
        400,
        "RevenueCat webhook authentication is not configured.",
      );
    }
    this.config = {
      ...config,
      toleranceSeconds: config.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS,
      maxBodyBytes: config.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
    };
    if (
      !Number.isSafeInteger(this.config.toleranceSeconds) ||
      this.config.toleranceSeconds < 0
    ) {
      throw new RevenueCatWebhookError(
        "invalid_configuration",
        400,
        "RevenueCat timestamp tolerance is invalid.",
      );
    }
  }

  verify(input: RevenueCatWebhookVerificationInput): ParsedRevenueCatWebhook {
    if (!Buffer.isBuffer(input.rawBody)) {
      throw new RevenueCatWebhookError(
        "invalid_envelope",
        400,
        "RevenueCat raw body is unavailable.",
      );
    }
    if (input.rawBody.byteLength > this.config.maxBodyBytes) {
      throw new RevenueCatWebhookError(
        "body_too_large",
        413,
        "RevenueCat webhook body is too large.",
      );
    }
    this.verifyAuthorization(input.authorization);
    this.verifySignature(input.rawBody, input.signature);
    const parsed = parseRevenueCatWebhook(input.rawBody.toString("utf8"));
    this.verifyIntegration(parsed);
    return parsed;
  }

  private verifyAuthorization(value: string | undefined) {
    if (!value) {
      throw new RevenueCatWebhookError(
        "invalid_authorization",
        401,
        "RevenueCat authorization is invalid.",
      );
    }
    if (!this.config.authorizationSecret) return;
    const supplied = value?.startsWith("Bearer ") ? value.slice(7) : value;
    if (!supplied || !safeEqual(supplied, this.config.authorizationSecret)) {
      throw new RevenueCatWebhookError(
        "invalid_authorization",
        401,
        "RevenueCat authorization is invalid.",
      );
    }
  }

  private verifySignature(rawBody: Buffer, header: string | undefined) {
    if (!this.config.hmacSecret) return;
    const match = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header ?? "");
    if (!match)
      throw new RevenueCatWebhookError(
        "invalid_signature",
        401,
        "RevenueCat webhook signature is invalid.",
      );
    const timestamp = Number(match[1]);
    if (!Number.isSafeInteger(timestamp))
      throw new RevenueCatWebhookError(
        "invalid_timestamp",
        401,
        "RevenueCat webhook timestamp is invalid.",
      );
    const now = Math.floor((this.config.clock?.() ?? Date.now()) / 1_000);
    if (Math.abs(now - timestamp) > this.config.toleranceSeconds) {
      throw new RevenueCatWebhookError(
        "timestamp_outside_tolerance",
        401,
        "RevenueCat webhook timestamp is outside the allowed tolerance.",
      );
    }
    const expected = createHmac("sha256", this.config.hmacSecret)
      .update(String(timestamp), "utf8")
      .update(".", "utf8")
      .update(rawBody)
      .digest("hex");
    if (!safeEqual(expected, match[2])) {
      throw new RevenueCatWebhookError(
        "invalid_signature",
        401,
        "RevenueCat webhook signature is invalid.",
      );
    }
  }

  private verifyIntegration(payload: ParsedRevenueCatWebhook) {
    const event = payload.event;
    const type = event.type;
    if (
      this.config.expectedAppId &&
      !event.app_id &&
      !this.config.allowMissingAppIdFor?.includes(type)
    ) {
      throw new RevenueCatWebhookError(
        "unexpected_integration",
        400,
        "RevenueCat app is missing.",
      );
    }
    if (
      this.config.expectedAppId &&
      event.app_id &&
      event.app_id !== this.config.expectedAppId
    ) {
      throw new RevenueCatWebhookError(
        "unexpected_integration",
        400,
        "RevenueCat app does not match this integration.",
      );
    }
    const expectedEnvironment = normalizeEnvironment(
      this.config.expectedEnvironment,
    );
    if (
      expectedEnvironment &&
      !payload.deliveryEnvironment &&
      !this.config.allowMissingEnvironmentFor?.includes(type)
    ) {
      throw new RevenueCatWebhookError(
        "unexpected_integration",
        400,
        "RevenueCat environment is missing.",
      );
    }
    if (
      expectedEnvironment &&
      payload.deliveryEnvironment &&
      payload.deliveryEnvironment !== expectedEnvironment
    ) {
      throw new RevenueCatWebhookError(
        "unexpected_integration",
        400,
        "RevenueCat environment does not match this integration.",
      );
    }
    if (
      this.config.allowedStores?.length &&
      !event.store &&
      !this.config.allowMissingStoreFor?.includes(type)
    ) {
      throw new RevenueCatWebhookError(
        "unexpected_integration",
        400,
        "RevenueCat store is missing.",
      );
    }
    if (
      this.config.allowedStores?.length &&
      event.store &&
      !this.config.allowedStores.includes(event.store)
    ) {
      throw new RevenueCatWebhookError(
        "unexpected_integration",
        400,
        "RevenueCat store does not match this integration.",
      );
    }
  }
}

function normalizeEnvironment(value: unknown): RevenueCatEnvironment | null {
  if (value === "PRODUCTION" || value === "production") return "PRODUCTION";
  if (value === "SANDBOX" || value === "sandbox") return "SANDBOX";
  return null;
}

function uniqueStrings(values: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== "string" || !value.trim() || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export { RevenueCatWebhookError } from "./revenuecat-webhook.types";
export type { ParsedRevenueCatWebhook } from "./revenuecat-webhook.types";
