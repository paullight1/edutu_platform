export type RevenueCatEnvironment = "SANDBOX" | "PRODUCTION";

/**
 * RevenueCat sends store names in uppercase. Keep this as a string union with
 * a catch-all string at the boundary: RevenueCat can add stores without
 * changing the webhook API version, while the configured integration still
 * decides which stores are accepted.
 */
export type RevenueCatStore = string;

export type RevenueCatWebhookEventType =
  | "TEST"
  | "INITIAL_PURCHASE"
  | "RENEWAL"
  | "CANCELLATION"
  | "UNCANCELLATION"
  | "NON_RENEWING_PURCHASE"
  | "SUBSCRIPTION_PAUSED"
  | "EXPIRATION"
  | "BILLING_ISSUE"
  | "PRODUCT_CHANGE"
  | "SUBSCRIPTION_EXTENDED"
  | "REFUND_REVERSED"
  | "TRANSFER"
  | "TEMPORARY_ENTITLEMENT_GRANT"
  | "VIRTUAL_CURRENCY_TRANSACTION"
  | "EXPERIMENT_ENROLLMENT"
  | "PURCHASE_REDEEMED"
  | "SUBSCRIBER_ALIAS"
  | "PRICE_INCREASE_CONSENT_REQUIRED"
  | "PRICE_INCREASE_CONSENT_APPROVED"
  | "INVOICE_ISSUANCE"
  | "PAYWALL_IMPRESSION"
  | "PAYWALL_CLOSE"
  | "PAYWALL_CANCEL"
  | "PAYWALL_EXIT_OFFER"
  | "PAYWALL_COMPONENT_INTERACTED"
  | (string & {});

/** The current flat RevenueCat event object. */
export interface RevenueCatWebhookEvent {
  type: RevenueCatWebhookEventType;
  id: string;
  event_timestamp_ms: number;
  app_id?: string | null;
  app_user_id?: string | null;
  original_app_user_id?: string | null;
  aliases?: string[] | null;
  product_id?: string | null;
  period_type?: string | null;
  purchased_at_ms?: number | null;
  expiration_at_ms?: number | null;
  environment?: string | null;
  entitlement_id?: string | null;
  entitlement_ids?: string[] | null;
  presented_offering_id?: string | null;
  transaction_id?: string | null;
  original_transaction_id?: string | null;
  is_family_share?: boolean | null;
  country_code?: string | null;
  store?: RevenueCatStore | null;
  currency?: string | null;
  price?: number | string | null;
  price_in_purchased_currency?: number | string | null;
  tax_percentage?: number | null;
  commission_percentage?: number | null;
  takehome_percentage?: number | null;
  offer_code?: string | null;
  renewal_number?: number | null;
  metadata?: Record<string, unknown> | null;
  discount_percentage?: number | null;
  discount_amount?: number | string | null;
  discount_identifier?: string | null;
  quantity?: number | null;
  grace_period_expiration_at_ms?: number | null;
  auto_resume_at_ms?: number | null;
  is_trial_conversion?: boolean | null;
  cancel_reason?: string | null;
  expiration_reason?: string | null;
  new_product_id?: string | null;
  transferred_from?: string[] | null;
  transferred_to?: string[] | null;
  source?: string | null;
  virtual_currency_transaction_id?: string | null;
  adjustments?: Array<{
    amount?: number | null;
    currency?: {
      code?: string | null;
      name?: string | null;
      description?: string | null;
    } | null;
  }> | null;
  purchase_environment?: string | null;
  [key: string]: unknown;
}

export interface RevenueCatWebhookEnvelope {
  api_version: string;
  event: RevenueCatWebhookEvent;
}

export interface ParsedRevenueCatWebhook extends RevenueCatWebhookEnvelope {
  /** Environment trusted from the configured webhook integration. */
  deliveryEnvironment: RevenueCatEnvironment | null;
  /** Current, original, and provider aliases; never subscriber email. */
  identityCandidates: string[];
  /** Event id is used when RevenueCat did not provide a transaction resource. */
  resourceKey: string;
  /** Original transaction identifies the subscription lineage. */
  subscriptionLineageKey: string | null;
  /** Transaction identifies the paid period/resource. */
  paidPeriodKey: string | null;
}

export interface RevenueCatWebhookVerifierConfig {
  /** Static Authorization value configured in the RevenueCat dashboard. */
  authorizationSecret?: string;
  /** Optional HMAC signing secret configured for this integration. */
  hmacSecret?: string;
  expectedAppId?: string;
  expectedEnvironment?: RevenueCatEnvironment | "sandbox" | "production";
  allowedStores?: readonly string[];
  allowMissingAppIdFor?: readonly string[];
  allowMissingEnvironmentFor?: readonly string[];
  allowMissingStoreFor?: readonly string[];
  clock?: () => number;
  toleranceSeconds?: number;
  maxBodyBytes?: number;
  maxJsonDepth?: number;
}

export interface RevenueCatWebhookVerificationInput {
  rawBody: Buffer;
  authorization: string | undefined;
  signature: string | undefined;
}

export type RevenueCatWebhookErrorCode =
  | "invalid_configuration"
  | "body_too_large"
  | "invalid_authorization"
  | "invalid_signature"
  | "invalid_timestamp"
  | "timestamp_outside_tolerance"
  | "invalid_json"
  | "invalid_envelope"
  | "unexpected_integration";

export class RevenueCatWebhookError extends Error {
  constructor(
    public readonly code: RevenueCatWebhookErrorCode,
    public readonly statusCode: 400 | 401 | 413,
    message: string,
  ) {
    super(message);
    this.name = "RevenueCatWebhookError";
  }
}
