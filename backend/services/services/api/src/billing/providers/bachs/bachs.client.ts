import { z } from "zod";
import {
  BACHS_CHECKOUT_ORIGIN,
  BACHS_PORTAL_ORIGIN,
  type BachsConfig,
} from "./bachs.config";
import type {
  BachsCheckoutInput,
  BachsCheckoutSession,
  BachsCreateCustomerInput,
  BachsCreateRefundInput,
  BachsCustomer,
  BachsListQuery,
  BachsListResult,
  BachsPayment,
  BachsPortalSession,
  BachsPortalSessionInput,
  BachsRefund,
  BachsSubscription,
} from "./bachs.types";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 2;

const decimalAmountSchema = z.string().regex(/^\d+(?:\.\d+)?$/);
const isoCurrencySchema = z.string().regex(/^[A-Z]{3}$/);
const dateTimeSchema = z.string().datetime({ offset: true });
const metadataSchema = z.record(z.string(), z.unknown());
const identifierSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9_-]+$/);
const idempotencyKeySchema = z.string().min(1).max(255);
const urlSchema = z.string().url();

const checkoutResponseSchema = z.object({
  checkout_id: identifierSchema,
  checkout_url: urlSchema,
  status: z.string().transform((value, context) => {
    const status = value.toLowerCase();
    if (!["open", "completed", "expired", "cancelled"].includes(status)) {
      context.addIssue({ code: "custom", message: "Unknown checkout status." });
      return z.NEVER;
    }
    return status as BachsCheckoutSession["status"];
  }),
  expires_at: dateTimeSchema,
  created_at: dateTimeSchema,
  reference: z.string().min(1).max(255).optional(),
});

const customerResponseSchema = z.object({
  customer_id: identifierSchema,
  email: z.string().email(),
  name: z.string().max(511).nullable().optional(),
  phone_number: z.string().max(64).nullable().optional(),
  metadata: metadataSchema,
  created_at: dateTimeSchema,
  updated_at: dateTimeSchema,
});

const portalResponseSchema = z.object({ id: identifierSchema, url: urlSchema });

const paymentResponseSchema = z.object({
  id: identifierSchema,
  reference: z.string().nullable().optional(),
  status: z.string().min(1),
  is_refundable: z.boolean(),
  amount: decimalAmountSchema,
  amount_paid: decimalAmountSchema,
  amount_remaining: decimalAmountSchema,
  settlement_amount: decimalAmountSchema,
  currency: isoCurrencySchema,
  created_at: dateTimeSchema,
  updated_at: dateTimeSchema,
});

const subscriptionResponseSchema = z.object({
  id: identifierSchema,
  status: z.string().min(1),
  currency: isoCurrencySchema,
  amount: decimalAmountSchema,
  current_period_start: dateTimeSchema.nullable().optional(),
  current_period_end: dateTimeSchema.nullable().optional(),
});

const refundResponseSchema = z.object({
  refund_id: identifierSchema,
  charge_id: identifierSchema,
  reference: z.string().min(1),
  status: z.string().min(1),
  requested_amount: decimalAmountSchema,
  refunded_amount: decimalAmountSchema.nullable(),
  created_at: dateTimeSchema,
  updated_at: dateTimeSchema,
});

const paginationSchema = z.object({
  next_cursor: z.string().nullable(),
  prev_cursor: z.string().nullable(),
  has_more: z.boolean(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});

const listQuerySchema = z.object({
  cursor: z.string().min(1).max(255).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export type BachsOperation =
  | "create_checkout_session"
  | "get_checkout_session"
  | "create_customer"
  | "get_customer"
  | "list_customers"
  | "create_portal_session"
  | "get_subscription"
  | "list_subscriptions"
  | "get_payment"
  | "list_payments"
  | "create_refund"
  | "get_refund"
  | "list_refunds";

export class BachsProviderError extends Error {
  constructor(
    readonly details: {
      code:
        | "bachs_disabled"
        | "request_invalid"
        | "timeout"
        | "network_error"
        | "provider_http_error"
        | "invalid_provider_response";
      operation: BachsOperation;
      retryable: boolean;
      status?: number;
    },
  ) {
    super(`Bachs ${details.operation} failed: ${details.code}.`);
    this.name = BachsProviderError.name;
  }

  get code() {
    return this.details.code;
  }

  get operation() {
    return this.details.operation;
  }

  get retryable() {
    return this.details.retryable;
  }

  get status() {
    return this.details.status;
  }
}

export class BachsClient {
  private readonly config: BachsConfig;

  constructor(config: BachsConfig) {
    this.config = config;
  }

  async createCheckoutSession(
    input: BachsCheckoutInput,
  ): Promise<BachsCheckoutSession> {
    const value = this.validate(
      "create_checkout_session",
      z.object({
        productId: identifierSchema,
        customer: z.object({
          email: z.string().email(),
          name: z.string().max(511).optional(),
          phoneNumber: z.string().max(64).optional(),
          metadata: metadataSchema.optional(),
        }),
        billingCurrency: isoCurrencySchema.optional(),
        allowedPaymentMethodTypes: z
          .array(z.enum(["card", "crypto", "bank_transfer", "mobile_money"]))
          .min(1)
          .optional(),
        successUrl: urlSchema,
        cancelUrl: urlSchema,
        reference: z.string().min(1).max(255).optional(),
        metadata: metadataSchema.optional(),
        idempotencyKey: idempotencyKeySchema,
      }),
      input,
    );
    const response = await this.request(
      "create_checkout_session",
      "POST",
      "/v1/checkout-sessions",
      {
        idempotencyKey: value.idempotencyKey,
        body: {
          customer: {
            email: value.customer.email,
            ...(value.customer.name ? { name: value.customer.name } : {}),
            ...(value.customer.phoneNumber
              ? { phone_number: value.customer.phoneNumber }
              : {}),
            ...(value.customer.metadata
              ? { metadata: value.customer.metadata }
              : {}),
          },
          product_cart: [{ product_id: value.productId, quantity: 1 }],
          ...(value.billingCurrency
            ? { billing_currency: value.billingCurrency }
            : {}),
          ...(value.allowedPaymentMethodTypes
            ? { allowed_payment_method_types: value.allowedPaymentMethodTypes }
            : {}),
          success_url: value.successUrl,
          cancel_url: value.cancelUrl,
          ...(value.reference ? { reference: value.reference } : {}),
          ...(value.metadata ? { metadata: value.metadata } : {}),
        },
      },
    );
    const parsed = this.parse(
      "create_checkout_session",
      checkoutResponseSchema,
      response,
    );
    this.assertHostedUrl(
      "create_checkout_session",
      parsed.checkout_url,
      BACHS_CHECKOUT_ORIGIN,
    );
    return {
      checkoutId: parsed.checkout_id,
      checkoutUrl: parsed.checkout_url,
      status: parsed.status,
      expiresAt: parsed.expires_at,
      createdAt: parsed.created_at,
      ...(parsed.reference ? { reference: parsed.reference } : {}),
    };
  }

  async getCheckoutSession(checkoutId: string): Promise<BachsCheckoutSession> {
    const response = await this.request(
      "get_checkout_session",
      "GET",
      `/v1/checkout-sessions/${this.identifier("get_checkout_session", checkoutId)}`,
    );
    const parsed = this.parse(
      "get_checkout_session",
      checkoutResponseSchema,
      response,
    );
    this.assertHostedUrl(
      "get_checkout_session",
      parsed.checkout_url,
      BACHS_CHECKOUT_ORIGIN,
    );
    return {
      checkoutId: parsed.checkout_id,
      checkoutUrl: parsed.checkout_url,
      status: parsed.status,
      expiresAt: parsed.expires_at,
      createdAt: parsed.created_at,
      ...(parsed.reference ? { reference: parsed.reference } : {}),
    };
  }

  async createCustomer(
    input: BachsCreateCustomerInput,
  ): Promise<BachsCustomer> {
    const value = this.validate(
      "create_customer",
      z.object({
        email: z.string().email(),
        name: z.string().max(511).optional(),
        phoneNumber: z.string().max(64).optional(),
        metadata: metadataSchema.optional(),
        idempotencyKey: idempotencyKeySchema,
      }),
      input,
    );
    const response = await this.request(
      "create_customer",
      "POST",
      "/v1/customers",
      {
        idempotencyKey: value.idempotencyKey,
        body: {
          email: value.email,
          ...(value.name ? { name: value.name } : {}),
          ...(value.phoneNumber ? { phone_number: value.phoneNumber } : {}),
          ...(value.metadata ? { metadata: value.metadata } : {}),
        },
      },
    );
    return this.customer("create_customer", response);
  }

  async getCustomer(customerId: string): Promise<BachsCustomer> {
    return this.customer(
      "get_customer",
      await this.request(
        "get_customer",
        "GET",
        `/v1/customers/${this.identifier("get_customer", customerId)}`,
      ),
    );
  }

  async listCustomers(
    query: BachsListQuery = {},
  ): Promise<BachsListResult<BachsCustomer>> {
    return this.list(
      "list_customers",
      "/v1/customers",
      query,
      customerResponseSchema,
      (value) => this.mapCustomer(value),
    );
  }

  async createPortalSession(
    input: BachsPortalSessionInput,
  ): Promise<BachsPortalSession> {
    const value = this.validate(
      "create_portal_session",
      z.object({
        customerId: identifierSchema,
        idempotencyKey: idempotencyKeySchema,
      }),
      input,
    );
    const response = await this.request(
      "create_portal_session",
      "POST",
      `/v1/customers/${value.customerId}/portal-sessions`,
      { idempotencyKey: value.idempotencyKey },
    );
    const parsed = this.parse(
      "create_portal_session",
      portalResponseSchema,
      response,
    );
    this.assertHostedUrl(
      "create_portal_session",
      parsed.url,
      BACHS_PORTAL_ORIGIN,
    );
    return parsed;
  }

  async getSubscription(subscriptionId: string): Promise<BachsSubscription> {
    return this.subscription(
      "get_subscription",
      await this.request(
        "get_subscription",
        "GET",
        `/v1/subscriptions/${this.identifier("get_subscription", subscriptionId)}`,
      ),
    );
  }

  async listSubscriptions(
    query: BachsListQuery = {},
  ): Promise<BachsListResult<BachsSubscription>> {
    return this.list(
      "list_subscriptions",
      "/v1/subscriptions",
      query,
      subscriptionResponseSchema,
      (value) => this.mapSubscription(value),
    );
  }

  async getPayment(paymentId: string): Promise<BachsPayment> {
    return this.payment(
      "get_payment",
      await this.request(
        "get_payment",
        "GET",
        `/v1/payments/${this.identifier("get_payment", paymentId)}`,
      ),
    );
  }

  async listPayments(
    query: BachsListQuery = {},
  ): Promise<BachsListResult<BachsPayment>> {
    return this.list(
      "list_payments",
      "/v1/payments",
      query,
      paymentResponseSchema,
      (value) => this.mapPayment(value),
    );
  }

  async createRefund(input: BachsCreateRefundInput): Promise<BachsRefund> {
    const value = this.validate(
      "create_refund",
      z
        .object({
          chargeId: identifierSchema,
          reference: z.string().min(1).max(128),
          reason: z.string().min(1).max(1024).optional(),
          amountMinor: z.bigint().nonnegative().optional(),
          currencyExponent: z
            .union([z.literal(0), z.literal(2), z.literal(3)])
            .optional(),
          idempotencyKey: idempotencyKeySchema,
        })
        .superRefine((candidate, context) => {
          if (
            candidate.amountMinor !== undefined &&
            candidate.currencyExponent === undefined
          )
            context.addIssue({
              code: "custom",
              message: "currencyExponent is required when amountMinor is set.",
            });
          if (
            candidate.amountMinor === undefined &&
            candidate.currencyExponent !== undefined
          )
            context.addIssue({
              code: "custom",
              message: "amountMinor is required when currencyExponent is set.",
            });
        }),
      input,
    );
    const response = await this.request(
      "create_refund",
      "POST",
      "/v1/refunds",
      {
        idempotencyKey: value.idempotencyKey,
        body: {
          charge_id: value.chargeId,
          reference: value.reference,
          ...(value.reason ? { reason: value.reason } : {}),
          ...(value.amountMinor !== undefined
            ? {
                amount: this.minorUnitsToDecimal(
                  value.amountMinor,
                  value.currencyExponent!,
                ),
              }
            : {}),
        },
      },
    );
    return this.refund("create_refund", response);
  }

  async getRefund(refundId: string): Promise<BachsRefund> {
    return this.refund(
      "get_refund",
      await this.request(
        "get_refund",
        "GET",
        `/v1/refunds/${this.identifier("get_refund", refundId)}`,
      ),
    );
  }

  async listRefunds(
    query: BachsListQuery = {},
  ): Promise<BachsListResult<BachsRefund>> {
    return this.list(
      "list_refunds",
      "/v1/refunds",
      query,
      refundResponseSchema,
      (value) => this.mapRefund(value),
    );
  }

  private async request(
    operation: BachsOperation,
    method: "GET" | "POST",
    path: string,
    options: { body?: Record<string, unknown>; idempotencyKey?: string } = {},
  ): Promise<unknown> {
    if (!this.config.checkoutEnabled) {
      throw new BachsProviderError({
        code: "bachs_disabled",
        operation,
        retryable: false,
      });
    }
    const config = this.config;
    const retryableRequest =
      method === "GET" || Boolean(options.idempotencyKey);
    let lastError: BachsProviderError | undefined;
    for (
      let attempt = 1;
      attempt <= (retryableRequest ? MAX_ATTEMPTS : 1);
      attempt += 1
    ) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(`${config.apiBaseUrl}${path}`, {
          method,
          signal: controller.signal,
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${config.apiKey}`,
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...(options.idempotencyKey
              ? { "Idempotency-Key": options.idempotencyKey }
              : {}),
          },
          ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        });
        if (!response.ok) {
          const retryable =
            retryableRequest && this.isRetryableStatus(response.status);
          lastError = new BachsProviderError({
            code: "provider_http_error",
            operation,
            retryable,
            status: response.status,
          });
          if (retryable && attempt < MAX_ATTEMPTS) continue;
          throw lastError;
        }
        try {
          return await response.json();
        } catch {
          throw new BachsProviderError({
            code: "invalid_provider_response",
            operation,
            retryable: false,
            status: response.status,
          });
        }
      } catch (error) {
        if (error instanceof BachsProviderError) throw error;
        const timedOut = controller.signal.aborted;
        lastError = new BachsProviderError({
          code: timedOut ? "timeout" : "network_error",
          operation,
          retryable: retryableRequest,
        });
        if (retryableRequest && attempt < MAX_ATTEMPTS) continue;
        throw lastError;
      } finally {
        clearTimeout(timeout);
      }
    }
    throw (
      lastError ??
      new BachsProviderError({
        code: "network_error",
        operation,
        retryable: false,
      })
    );
  }

  private async list<T extends z.ZodType>(
    operation: BachsOperation,
    path: string,
    query: BachsListQuery,
    itemSchema: T,
    mapper: (value: z.infer<T>) => unknown,
  ): Promise<BachsListResult<any>> {
    const value = this.validate(operation, listQuerySchema, query);
    const search = new URLSearchParams();
    if (value.cursor) search.set("cursor", value.cursor);
    if (value.limit) search.set("limit", String(value.limit));
    const response = await this.request(
      operation,
      "GET",
      `${path}${search.size ? `?${search.toString()}` : ""}`,
    );
    const parsed = this.parse(
      operation,
      z.object({
        items: z.array(itemSchema),
        pagination: paginationSchema.nullable().optional(),
      }),
      response,
    );
    return {
      items: parsed.items.map(mapper),
      pagination: parsed.pagination
        ? {
            nextCursor: parsed.pagination.next_cursor,
            previousCursor: parsed.pagination.prev_cursor,
            hasMore: parsed.pagination.has_more,
            limit: parsed.pagination.limit,
            offset: parsed.pagination.offset,
          }
        : null,
    };
  }

  private customer(
    operation: BachsOperation,
    response: unknown,
  ): BachsCustomer {
    return this.mapCustomer(
      this.parse(operation, customerResponseSchema, response),
    );
  }
  private mapCustomer(
    value: z.infer<typeof customerResponseSchema>,
  ): BachsCustomer {
    return {
      customerId: value.customer_id,
      email: value.email,
      ...(value.name ? { name: value.name } : {}),
      ...(value.phone_number ? { phoneNumber: value.phone_number } : {}),
      metadata: value.metadata,
      createdAt: value.created_at,
      updatedAt: value.updated_at,
    };
  }
  private subscription(
    operation: BachsOperation,
    response: unknown,
  ): BachsSubscription {
    return this.mapSubscription(
      this.parse(operation, subscriptionResponseSchema, response),
    );
  }
  private mapSubscription(
    value: z.infer<typeof subscriptionResponseSchema>,
  ): BachsSubscription {
    return {
      id: value.id,
      status: value.status,
      currency: value.currency,
      amount: value.amount,
      currentPeriodStart: value.current_period_start ?? null,
      currentPeriodEnd: value.current_period_end ?? null,
    };
  }
  private payment(operation: BachsOperation, response: unknown): BachsPayment {
    return this.mapPayment(
      this.parse(operation, paymentResponseSchema, response),
    );
  }
  private mapPayment(
    value: z.infer<typeof paymentResponseSchema>,
  ): BachsPayment {
    return {
      id: value.id,
      reference: value.reference ?? null,
      status: value.status,
      isRefundable: value.is_refundable,
      amount: value.amount,
      amountPaid: value.amount_paid,
      amountRemaining: value.amount_remaining,
      settlementAmount: value.settlement_amount,
      currency: value.currency,
      createdAt: value.created_at,
      updatedAt: value.updated_at,
    };
  }
  private refund(operation: BachsOperation, response: unknown): BachsRefund {
    return this.mapRefund(
      this.parse(operation, refundResponseSchema, response),
    );
  }
  private mapRefund(value: z.infer<typeof refundResponseSchema>): BachsRefund {
    return {
      refundId: value.refund_id,
      chargeId: value.charge_id,
      reference: value.reference,
      status: value.status,
      requestedAmount: value.requested_amount,
      refundedAmount: value.refunded_amount,
      createdAt: value.created_at,
      updatedAt: value.updated_at,
    };
  }

  private validate<T>(
    operation: BachsOperation,
    schema: z.ZodType<T>,
    value: unknown,
  ): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success)
      throw new BachsProviderError({
        code: "request_invalid",
        operation,
        retryable: false,
      });
    return parsed.data;
  }
  private parse<T>(
    operation: BachsOperation,
    schema: z.ZodType<T>,
    value: unknown,
  ): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success)
      throw new BachsProviderError({
        code: "invalid_provider_response",
        operation,
        retryable: false,
      });
    return parsed.data;
  }
  private identifier(operation: BachsOperation, value: string): string {
    return this.validate(operation, identifierSchema, value);
  }
  private isRetryableStatus(status: number): boolean {
    return status === 429 || status >= 500;
  }
  private assertHostedUrl(
    operation: BachsOperation,
    value: string,
    expectedOrigin: string,
  ): void {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new BachsProviderError({
        code: "invalid_provider_response",
        operation,
        retryable: false,
      });
    }
    if (
      url.origin !== expectedOrigin ||
      url.username ||
      url.password ||
      url.port
    )
      throw new BachsProviderError({
        code: "invalid_provider_response",
        operation,
        retryable: false,
      });
  }
  private minorUnitsToDecimal(
    amountMinor: bigint,
    exponent: 0 | 2 | 3,
  ): string {
    if (exponent === 0) return amountMinor.toString();
    const sign = amountMinor < 0n ? "-" : "";
    const absolute = (amountMinor < 0n ? -amountMinor : amountMinor)
      .toString()
      .padStart(exponent + 1, "0");
    return `${sign}${absolute.slice(0, -exponent)}.${absolute.slice(-exponent)}`;
  }
}
