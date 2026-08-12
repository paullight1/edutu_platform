import type {
  BachsCheckoutInput,
  BachsCheckoutSession,
  BachsPaymentMethod,
  BachsPortalSession,
} from "../providers/bachs/bachs.types";

export type BillingEnvironment = "sandbox" | "live";
export type BillingRenewalMode = "recurring" | "one_time";
export type BillingFulfillmentKind = "pro" | "season_pass" | "credits";
export type BillingReturnSurface = "web" | "pwa";

/** Stable Nest tokens used by the composition root when wiring the service. */
export const BACHS_CHECKOUT_REPOSITORY = Symbol("BACHS_CHECKOUT_REPOSITORY");
export const BACHS_CHECKOUT_PROVIDER = Symbol("BACHS_CHECKOUT_PROVIDER");
export const BACHS_PORTAL_REPOSITORY = Symbol("BACHS_PORTAL_REPOSITORY");
export const BACHS_PORTAL_PROVIDER = Symbol("BACHS_PORTAL_PROVIDER");
export const BILLING_CUSTOMER_IDENTITY_RESOLVER = Symbol(
  "BILLING_CUSTOMER_IDENTITY_RESOLVER",
);
export const BILLING_CLOCK = Symbol("BILLING_CLOCK");
export const BILLING_RATE_LIMITER = Symbol("BILLING_RATE_LIMITER");
export const BACHS_CHECKOUT_CONFIG = Symbol("BACHS_CHECKOUT_CONFIG");

export const BACHS_CHECKOUT_SUCCESS_URL = "https://pay.edutu.org/result";
export const BACHS_CHECKOUT_CANCEL_URL =
  "https://pay.edutu.org/result?state=cancelled";
export const BACHS_CHECKOUT_ORIGIN = "https://checkout.bachs.io";
export const BACHS_PORTAL_ORIGIN = "https://portal.bachs.io";

export interface CheckoutServiceConfig {
  checkoutEnabled: boolean;
  environment: BillingEnvironment;
  /** Maps Edutu catalog keys to the Bachs product in this environment. */
  productMappings: Readonly<Record<string, string>>;
}

export interface BillingCheckoutProduct {
  productKey: string;
  provider?: "bachs";
  environment?: BillingEnvironment;
  providerProductId: string | null;
  fulfillmentKind: BillingFulfillmentKind;
  renewalMode: BillingRenewalMode;
  expectedAmountMinor: number;
  currency: string;
  cadence: string | null;
  creditQuantity: number | null;
  validityDays: number | null;
  allowedPaymentMethods: BachsPaymentMethod[];
  catalogVersion: number;
  /** The only permitted zero-price catalog row. */
  isFree?: boolean;
}

export type BillingCreditProduct = BillingCheckoutProduct & {
  fulfillmentKind: "credits";
  renewalMode: "one_time";
  creditQuantity: number;
  validityDays: null;
};

/**
 * Catalog drift must never turn a credit top-up into a subscription or an
 * expiring grant. Repositories call this at the database boundary so malformed
 * enabled rows fail closed before checkout creation.
 */
export function assertBillingCheckoutProductContract(
  product: BillingCheckoutProduct,
): void {
  if (product.fulfillmentKind !== "credits") return;

  if (
    product.renewalMode !== "one_time" ||
    !Number.isSafeInteger(product.creditQuantity) ||
    (product.creditQuantity ?? 0) <= 0 ||
    product.validityDays !== null
  ) {
    throw new Error("Invalid credit product contract");
  }
}

export interface BillingProductSnapshot {
  productKey: string;
  providerProductId: string;
  fulfillmentKind: BillingFulfillmentKind;
  renewalMode: BillingRenewalMode;
  expectedAmountMinor: number;
  currency: string;
  cadence: string | null;
  creditQuantity: number | null;
  validityDays: number | null;
  allowedPaymentMethods: BachsPaymentMethod[];
  catalogVersion: number;
}

/**
 * The repository may return a richer record as migrations roll out. These are
 * the fields the service needs and returns; provider URLs are persisted only
 * as an opaque server-side value and are never accepted from the client.
 */
export interface BillingCheckoutIntentRecord {
  id: string;
  userId: string;
  productKey: string;
  providerCheckoutId: string | null;
  providerReference: string | null;
  providerCheckoutUrl?: string | null;
  status: string;
  expiresAt: string | null;
  renewalMode: BillingRenewalMode;
  expectedAmountMinor: number;
  currency: string;
  environment?: BillingEnvironment;
  productSnapshot?: Partial<BillingProductSnapshot> | null;
}

export interface CreateCheckoutRequest {
  productKey: string;
  returnSurface: BillingReturnSurface;
}

export interface BillingCheckoutResult {
  intentId: string;
  checkoutUrl: string;
  expiresAt: string;
  status: "open" | "creating";
  renewalMode: BillingRenewalMode;
  productSnapshot: BillingProductSnapshot;
}

export interface BillingCheckoutRepositoryPort {
  findEnabledProduct(
    productKey: string,
    environment: BillingEnvironment,
  ): Promise<BillingCheckoutProduct | null>;
  createOrReuseIntent(input: {
    userId: string;
    environment: BillingEnvironment;
    product: BillingCheckoutProduct;
    idempotencyKey: string;
    returnSurface: BillingReturnSurface;
  }): Promise<{ intent: BillingCheckoutIntentRecord; created: boolean }>;
  attachProviderCheckout(input: {
    intentId: string;
    checkoutId: string;
    checkoutUrl: string;
    expiresAt: string;
  }): Promise<void>;
  markIntentFailed(intentId: string, errorCode: string): Promise<void>;
}

export interface BillingPortalRepositoryPort {
  findProviderCustomerId(
    userId: string,
    environment: BillingEnvironment,
  ): Promise<string | null>;
}

export interface BillingCheckoutProviderPort {
  createCheckoutSession(
    input: BachsCheckoutInput,
  ): Promise<BachsCheckoutSession>;
  getCheckoutSession(checkoutId: string): Promise<BachsCheckoutSession>;
}

export interface BillingPortalProviderPort {
  createPortalSession(input: {
    customerId: string;
    idempotencyKey: string;
  }): Promise<BachsPortalSession>;
}

export type BillingCustomerIdentityResolution =
  | {
      status: "resolved";
      email: string;
      name?: string;
      phoneNumber?: string;
    }
  | { status: "missing" | "ambiguous" };

export interface BillingCustomerIdentityResolver {
  resolveCustomer(
    rawAuthSubject: string,
  ): Promise<BillingCustomerIdentityResolution>;
}

export interface ClockPort {
  now(): Date;
}

export interface CheckoutRateLimitDecision {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export interface BillingRateLimiterPort {
  reserve(
    rawAuthSubject: string,
    input: { idempotencyKey: string; now: Date },
  ): Promise<CheckoutRateLimitDecision> | CheckoutRateLimitDecision;
}
