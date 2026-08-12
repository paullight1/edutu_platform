import { createHmac, timingSafeEqual } from "node:crypto";
import {
  BachsWebhookError,
  type BachsEnvironment,
  BachsWebhookEvent,
  BachsWebhookVerificationInput,
  BachsWebhookVerifierConfig,
} from "./bachs-webhook.types";

const DEFAULT_TOLERANCE_SECONDS = 5 * 60;
const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
const DEFAULT_MAX_JSON_DEPTH = 20;
const SHA_256_HEX_LENGTH = 64;

type JsonObject = Record<string, unknown>;

export class BachsWebhookVerifier {
  private readonly clock: () => number;
  private readonly toleranceSeconds: number;
  private readonly maxBodyBytes: number;
  private readonly maxJsonDepth: number;

  constructor(private readonly config: BachsWebhookVerifierConfig) {
    if (
      typeof config.secret !== "string" ||
      config.secret.length === 0 ||
      typeof config.expectedOrganizationId !== "string" ||
      config.expectedOrganizationId.trim().length === 0 ||
      !isBachsEnvironment(config.expectedEnvironment)
    ) {
      throw webhookError(
        "invalid_configuration",
        400,
        "Bachs webhook verifier configuration is incomplete",
      );
    }

    this.clock = config.clock ?? Date.now;
    this.toleranceSeconds =
      config.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
    this.maxBodyBytes = config.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
    this.maxJsonDepth = config.maxJsonDepth ?? DEFAULT_MAX_JSON_DEPTH;

    if (
      !Number.isInteger(this.toleranceSeconds) ||
      this.toleranceSeconds <= 0 ||
      this.toleranceSeconds > DEFAULT_TOLERANCE_SECONDS ||
      !Number.isInteger(this.maxBodyBytes) ||
      this.maxBodyBytes <= 0 ||
      !Number.isInteger(this.maxJsonDepth) ||
      this.maxJsonDepth <= 0
    ) {
      throw webhookError(
        "invalid_configuration",
        400,
        "Bachs webhook verifier limits are invalid",
      );
    }
  }

  verify(input: BachsWebhookVerificationInput): BachsWebhookEvent {
    if (!Buffer.isBuffer(input.rawBody)) {
      throw webhookError(
        "invalid_envelope",
        400,
        "Bachs webhook raw body is unavailable",
      );
    }
    if (input.rawBody.byteLength > this.maxBodyBytes) {
      throw webhookError(
        "body_too_large",
        413,
        "Bachs webhook body exceeds the configured limit",
      );
    }

    const timestampHeader = input.timestampHeader;
    if (
      typeof timestampHeader !== "string" ||
      !/^\d{1,16}$/.test(timestampHeader)
    ) {
      throw webhookError(
        "invalid_timestamp",
        401,
        "Bachs webhook timestamp is invalid",
      );
    }

    const timestampSeconds = Number(timestampHeader);
    if (!Number.isSafeInteger(timestampSeconds) || timestampSeconds <= 0) {
      throw webhookError(
        "invalid_timestamp",
        401,
        "Bachs webhook timestamp is invalid",
      );
    }

    const nowSeconds = Math.floor(this.clock() / 1_000);
    if (
      !Number.isSafeInteger(nowSeconds) ||
      Math.abs(nowSeconds - timestampSeconds) > this.toleranceSeconds
    ) {
      throw webhookError(
        "timestamp_outside_tolerance",
        401,
        "Bachs webhook timestamp is outside the allowed tolerance",
      );
    }

    const expectedSignature = createHmac("sha256", this.config.secret)
      .update(timestampHeader, "utf8")
      .update(".", "utf8")
      .update(input.rawBody)
      .digest();
    const signatureIsWellFormed =
      typeof input.signatureHeader === "string" &&
      new RegExp(`^[a-fA-F0-9]{${SHA_256_HEX_LENGTH}}$`).test(
        input.signatureHeader,
      );
    const suppliedSignature =
      signatureIsWellFormed && typeof input.signatureHeader === "string"
        ? Buffer.from(input.signatureHeader, "hex")
        : Buffer.alloc(expectedSignature.byteLength);
    const signatureMatches = timingSafeEqual(
      expectedSignature,
      suppliedSignature,
    );

    if (!signatureIsWellFormed || !signatureMatches) {
      throw webhookError(
        "invalid_signature",
        401,
        "Bachs webhook signature is invalid",
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(input.rawBody.toString("utf8"));
    } catch {
      throw webhookError(
        "invalid_json",
        400,
        "Bachs webhook body is not valid JSON",
      );
    }

    if (!isWithinDepth(parsed, this.maxJsonDepth) || !isJsonObject(parsed)) {
      throw webhookError(
        "invalid_envelope",
        400,
        "Bachs webhook envelope is invalid",
      );
    }

    const id = requiredString(parsed.id);
    const type = requiredString(parsed.type);
    const createdAt = requiredString(parsed.created_at);
    const organizationId = requiredString(parsed.organization_id);
    const data = parsed.data;

    if (
      id === null ||
      type === null ||
      createdAt === null ||
      !isIsoTimestamp(createdAt) ||
      organizationId === null ||
      !isJsonObject(data)
    ) {
      throw webhookError(
        "invalid_envelope",
        400,
        "Bachs webhook envelope is invalid",
      );
    }

    if (organizationId !== this.config.expectedOrganizationId) {
      throw webhookError(
        "unexpected_organization",
        400,
        "Bachs webhook organization does not match this endpoint",
      );
    }

    if (
      input.deliveryEnvironment !== this.config.expectedEnvironment ||
      (parsed.environment !== undefined &&
        parsed.environment !== this.config.expectedEnvironment)
    ) {
      throw webhookError(
        "unexpected_environment",
        400,
        "Bachs webhook environment does not match this endpoint",
      );
    }

    if (
      parsed.account !== undefined &&
      parsed.account !== this.config.expectedOrganizationId
    ) {
      throw webhookError(
        "unexpected_organization",
        400,
        "Bachs webhook account does not match this endpoint",
      );
    }

    return {
      id,
      type,
      createdAt,
      organizationId,
      environment: input.deliveryEnvironment,
      data,
    };
  }
}

function isBachsEnvironment(value: unknown): value is BachsEnvironment {
  return value === "sandbox" || value === "live";
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return value;
}

function isIsoTimestamp(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isWithinDepth(value: unknown, maxDepth: number): boolean {
  const pending: Array<{ value: unknown; depth: number }> = [
    { value, depth: 1 },
  ];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) break;
    if (current.depth > maxDepth) return false;
    if (typeof current.value !== "object" || current.value === null) continue;

    for (const child of Object.values(current.value)) {
      if (typeof child === "object" && child !== null) {
        pending.push({ value: child, depth: current.depth + 1 });
      }
    }
  }

  return true;
}

function webhookError(
  code: ConstructorParameters<typeof BachsWebhookError>[0],
  statusCode: ConstructorParameters<typeof BachsWebhookError>[1],
  message: string,
): BachsWebhookError {
  return new BachsWebhookError(code, statusCode, message);
}

export type {
  BachsWebhookEvent,
  BachsWebhookVerificationInput,
  BachsWebhookVerifierConfig,
} from "./bachs-webhook.types";
export { BachsWebhookError } from "./bachs-webhook.types";
