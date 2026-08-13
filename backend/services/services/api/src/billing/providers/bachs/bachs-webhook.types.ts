export type BachsEnvironment = "sandbox" | "live";

export interface BachsWebhookVerifierConfig {
  secret: string;
  expectedOrganizationId: string;
  expectedEnvironment: BachsEnvironment;
  clock?: () => number;
  toleranceSeconds?: number;
  maxBodyBytes?: number;
  maxJsonDepth?: number;
}

export interface BachsWebhookVerificationInput {
  rawBody: Buffer;
  timestampHeader: string | undefined;
  signatureHeader: string | undefined;
  deliveryEnvironment: BachsEnvironment;
}

export interface BachsWebhookEvent {
  id: string;
  type: string;
  createdAt: string;
  organizationId: string;
  environment: BachsEnvironment;
  data: Record<string, unknown>;
}

export type BachsWebhookErrorCode =
  | "invalid_configuration"
  | "body_too_large"
  | "invalid_timestamp"
  | "timestamp_outside_tolerance"
  | "invalid_signature"
  | "invalid_json"
  | "invalid_envelope"
  | "unexpected_organization"
  | "unexpected_environment";

export class BachsWebhookError extends Error {
  constructor(
    public readonly code: BachsWebhookErrorCode,
    public readonly statusCode: 400 | 401 | 413,
    message: string,
  ) {
    super(message);
    this.name = "BachsWebhookError";
  }
}
