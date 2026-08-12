import { Injectable } from "@nestjs/common";
import { randomBytes, createHash } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";

export type BillingEnvironment = "sandbox" | "live";
export type BillingRenewalMode = "recurring" | "one_time";
export type BillingFulfillmentKind = "pro" | "season_pass" | "credits";

export type BillingProduct = {
  productKey: string;
  fulfillmentKind: BillingFulfillmentKind;
  renewalMode: BillingRenewalMode;
  providerProductId: string | null;
  expectedAmountMinor: number;
  currency: string;
  cadence: string | null;
  creditQuantity: number | null;
  validityDays: number | null;
  allowedPaymentMethods: Array<
    "card" | "bank_transfer" | "mobile_money" | "crypto"
  >;
  catalogVersion: number;
};

export type CheckoutIntent = {
  id: string;
  userId: string;
  productKey: string;
  providerCheckoutId: string | null;
  providerReference: string | null;
  status: string;
  expiresAt: string | null;
  renewalMode: BillingRenewalMode;
  expectedAmountMinor: number;
  currency: string;
};

export type PublicCheckoutStatus =
  | "processing"
  | "active"
  | "failed"
  | "cancelled"
  | "underpaid"
  | "needs_review";

type RowResult<T> = { rows?: T[] };

@Injectable()
export class BillingRepository {
  private assertEnvironment(
    environment: string,
  ): asserts environment is BillingEnvironment {
    if (environment !== "sandbox" && environment !== "live") {
      throw new Error("Unsupported billing environment");
    }
  }

  private mapFulfillmentKind(value: unknown): BillingFulfillmentKind {
    switch (String(value)) {
      case "one_time_pass":
      case "subscription":
        return "pro";
      case "season_pass":
        return "season_pass";
      case "credit_pack":
        return "credits";
      default:
        throw new Error("Unsupported billing product fulfillment kind");
    }
  }

  private assertReturnSurface(returnSurface: string): void {
    if (returnSurface !== "web" && returnSurface !== "pwa") {
      throw new Error("Unsupported checkout return surface");
    }
  }

  static minorUnitsToDecimal(amountMinor: number, currency: string): string {
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
      throw new Error("amountMinor must be a non-negative safe integer");
    }

    const normalized = currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalized)) {
      throw new Error("currency must be an ISO 4217 code");
    }

    const supportedCurrencies = new Set(Intl.supportedValuesOf("currency"));
    if (!supportedCurrencies.has(normalized)) {
      throw new Error(`Unsupported ISO 4217 currency: ${normalized}`);
    }

    const fractionDigits = new Intl.NumberFormat("en", {
      style: "currency",
      currency: normalized,
    }).resolvedOptions().maximumFractionDigits;
    if (typeof fractionDigits !== "number") {
      throw new Error(`Currency precision is unavailable: ${normalized}`);
    }
    const divisor = 10n ** BigInt(fractionDigits);
    const minor = BigInt(amountMinor);
    const whole = minor / divisor;
    if (fractionDigits === 0) return whole.toString();
    const fraction = (minor % divisor).toString().padStart(fractionDigits, "0");
    return `${whole}.${fraction}`;
  }

  static toPublicStatus(status: string): PublicCheckoutStatus {
    switch (status.toLowerCase()) {
      case "fulfilled":
      case "active":
      case "paid":
        return "active";
      case "cancelled":
      case "canceled":
      case "expired":
        return "cancelled";
      case "underpaid":
        return "underpaid";
      case "review_required":
      case "quarantined":
      case "dead_letter":
        return "needs_review";
      case "failed":
      case "provider_failed":
        return "failed";
      default:
        return "processing";
    }
  }

  async findEnabledProduct(
    productKey: string,
    environment: BillingEnvironment,
  ): Promise<BillingProduct | null> {
    this.assertEnvironment(environment);
    const result = await db.execute(sql`
      select product.product_key, product.fulfillment_kind, product.renewal_mode,
             mapping.provider_product_id, product.expected_amount_minor,
             product.currency, product.cadence, product.credit_quantity,
             extract(epoch from product.entitlement_duration) / 86400 as validity_days,
             coalesce(
               product.payment_method_policy->'allowed_methods',
               '[]'::jsonb
             ) as allowed_payment_methods,
             product.catalog_version
      from billing_products product
      inner join billing_product_provider_mappings mapping
        on mapping.product_key = product.product_key
       and mapping.provider = 'bachs'
       and mapping.environment = ${environment}
      where product.product_key = ${productKey}
        and product.enabled = true
      limit 1
    `);
    const row = (result as RowResult<Record<string, unknown>>).rows?.[0];
    if (!row) return null;
    return {
      productKey: String(row.product_key),
      fulfillmentKind: this.mapFulfillmentKind(row.fulfillment_kind),
      renewalMode: String(row.renewal_mode) as BillingRenewalMode,
      providerProductId: row.provider_product_id
        ? String(row.provider_product_id)
        : null,
      expectedAmountMinor: Number(row.expected_amount_minor),
      currency: String(row.currency).toUpperCase(),
      cadence: row.cadence ? String(row.cadence) : null,
      creditQuantity:
        row.credit_quantity == null ? null : Number(row.credit_quantity),
      validityDays:
        row.validity_days == null ? null : Number(row.validity_days),
      allowedPaymentMethods: Array.isArray(row.allowed_payment_methods)
        ? (row.allowed_payment_methods as BillingProduct["allowedPaymentMethods"])
        : ["card"],
      catalogVersion: Number(row.catalog_version),
    };
  }

  async createOrReuseIntent(input: {
    userId: string;
    environment: BillingEnvironment;
    product: BillingProduct;
    idempotencyKey: string;
    returnSurface: string;
  }): Promise<{ intent: CheckoutIntent; created: boolean }> {
    this.assertEnvironment(input.environment);
    this.assertReturnSurface(input.returnSurface);
    const publicTokenHash = createHash("sha256")
      .update(randomBytes(32))
      .digest("hex");

    const result = await db.execute(sql`
      insert into billing_checkout_intents (
        public_token_hash, user_id, provider, environment, product_key,
        product_snapshot, expected_amount_minor, currency, status,
        idempotency_key, return_surface, expires_at
      )
      select
        ${publicTokenHash}, ${input.userId}, 'bachs', ${input.environment},
        product.product_key,
        jsonb_build_object(
          'productKey', product.product_key,
          'fulfillmentKind', product.fulfillment_kind,
          'renewalMode', product.renewal_mode,
          'providerProductId', mapping.provider_product_id,
          'amountMinor', product.expected_amount_minor,
          'currency', product.currency,
          'cadence', product.cadence,
          'creditQuantity', product.credit_quantity,
          'validityDays', extract(epoch from product.entitlement_duration) / 86400,
          'paymentMethods', coalesce(
            product.payment_method_policy->'allowed_methods',
            '[]'::jsonb
          ),
          'catalogVersion', product.catalog_version
        ),
        product.expected_amount_minor, product.currency,
        'creating', ${input.idempotencyKey}, ${input.returnSurface},
        now() + interval '60 minutes'
      from billing_products product
      inner join billing_product_provider_mappings mapping
        on mapping.product_key = product.product_key
       and mapping.provider = 'bachs'
       and mapping.environment = ${input.environment}
      where product.product_key = ${input.product.productKey}
        and product.enabled = true
        and mapping.provider_product_id = ${input.product.providerProductId}
        and product.expected_amount_minor = ${input.product.expectedAmountMinor}
        and product.currency = upper(${input.product.currency})::char(3)
        and product.renewal_mode = ${input.product.renewalMode}
        and product.catalog_version = ${input.product.catalogVersion}
      on conflict (provider, environment, user_id, idempotency_key)
        do nothing
      returning id, user_id, product_key, provider_checkout_id,
                provider_reference, status, expires_at,
                product_snapshot->>'renewalMode' as renewal_mode,
                expected_amount_minor, currency
    `);
    const inserted = (result as RowResult<Record<string, unknown>>).rows?.[0];
    if (inserted) return { intent: this.mapIntent(inserted), created: true };

    const existing = await db.execute(sql`
      select id, user_id, product_key, provider_checkout_id,
             provider_reference, status, expires_at,
             product_snapshot->>'renewalMode' as renewal_mode,
             expected_amount_minor, currency
      from billing_checkout_intents
      where provider = 'bachs'
        and environment = ${input.environment}
        and user_id = ${input.userId}
        and idempotency_key = ${input.idempotencyKey}
      limit 1
    `);
    const row = (existing as RowResult<Record<string, unknown>>).rows?.[0];
    if (!row) throw new Error("Unable to create or retrieve checkout intent");
    if (String(row.product_key) !== input.product.productKey) {
      throw new Error("Idempotency key was already used for another product");
    }
    return { intent: this.mapIntent(row), created: false };
  }

  async attachProviderCheckout(input: {
    intentId: string;
    checkoutId: string;
    checkoutUrl: string;
    expiresAt: string;
  }): Promise<void> {
    await db.execute(sql`
      update billing_checkout_intents
      set provider_checkout_id = ${input.checkoutId},
          provider_reference = ${input.intentId},
          provider_checkout_url_hash = encode(
            digest(${input.checkoutUrl}, 'sha256'), 'hex'
          ),
          status = 'open', expires_at = ${input.expiresAt}::timestamptz,
          updated_at = now()
      where id = ${input.intentId}::uuid and status in ('creating', 'open')
    `);
  }

  async markIntentFailed(intentId: string, errorCode: string): Promise<void> {
    await db.execute(sql`
      update billing_checkout_intents
      set status = 'provider_failed', failure_code = ${errorCode},
          updated_at = now()
      where id = ${intentId}::uuid and status = 'creating'
    `);
  }

  async getOwnedIntent(
    userId: string,
    intentId: string,
  ): Promise<CheckoutIntent | null> {
    const result = await db.execute(sql`
      select id, user_id, product_key, provider_checkout_id,
             provider_reference, status, expires_at,
             product_snapshot->>'renewalMode' as renewal_mode,
             expected_amount_minor, currency
      from billing_checkout_intents
      where id = ${intentId}::uuid and user_id = ${userId}
      limit 1
    `);
    const row = (result as RowResult<Record<string, unknown>>).rows?.[0];
    return row ? this.mapIntent(row) : null;
  }

  async findProviderCustomerId(
    userId: string,
    environment: BillingEnvironment,
  ): Promise<string | null> {
    this.assertEnvironment(environment);
    const result = await db.execute(sql`
      select provider_customer_id
      from billing_provider_customers
      where provider = 'bachs' and environment = ${environment}
        and user_id = ${userId}
      limit 1
    `);
    const row = (result as RowResult<Record<string, unknown>>).rows?.[0];
    return row?.provider_customer_id ? String(row.provider_customer_id) : null;
  }

  private mapIntent(row: Record<string, unknown>): CheckoutIntent {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      productKey: String(row.product_key),
      providerCheckoutId: row.provider_checkout_id
        ? String(row.provider_checkout_id)
        : null,
      providerReference: row.provider_reference
        ? String(row.provider_reference)
        : null,
      status: String(row.status),
      expiresAt: row.expires_at
        ? new Date(row.expires_at as string | Date).toISOString()
        : null,
      renewalMode: String(row.renewal_mode) as BillingRenewalMode,
      expectedAmountMinor: Number(row.expected_amount_minor),
      currency: String(row.currency),
    };
  }
}
