import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { decimalToMinorUnits } from "./bachs-webhook.service";
import { BachsClient } from "./providers/bachs/bachs.client";
import type { BachsConfig } from "./providers/bachs/bachs.config";
import type { BachsPayment } from "./providers/bachs/bachs.types";
import {
  BACHS_CHECKOUT_CONFIG,
  BACHS_CHECKOUT_PROVIDER,
} from "./types/billing-checkout.types";
import {
  redactProviderPayload,
  safeProviderError,
} from "./provider-payload-redaction";
import type {
  BillingReconciliationStore,
  BillingReconciliationStore as BillingReconciliationStorePort,
  ProviderReadAdapter,
  ReconciliationEnvironment,
  ReconciliationPage,
  ReconciliationPayment,
  ReconciliationProvider,
  ReconciliationRepairInput,
  ReconciliationRepairResult,
} from "./reconciliation/reconciliation.types";
import { CreditPurchaseService } from "./credit-purchase.service";

function asMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

@Injectable()
export class BachsReconciliationAdapter implements ProviderReadAdapter {
  readonly provider = "bachs" as const;
  readonly environment: ReconciliationEnvironment;

  constructor(
    @Inject(BACHS_CHECKOUT_PROVIDER) private readonly client: BachsClient,
    @Inject(BACHS_CHECKOUT_CONFIG) config: BachsConfig,
  ) {
    this.environment = config.environment;
  }

  async listPayments(input: {
    cursor?: string;
  }): Promise<ReconciliationPage<ReconciliationPayment>> {
    const result = await this.client.listPayments({
      cursor: input.cursor,
      limit: 100,
    });
    return {
      items: result.items.map((payment) => this.mapPayment(payment)),
      nextCursor: result.pagination?.nextCursor ?? null,
      hasMore: result.pagination?.hasMore ?? false,
    };
  }

  async listRefunds(): Promise<ReconciliationPage<unknown>> {
    return { items: [], nextCursor: null, hasMore: false };
  }

  async listSubscriptions(): Promise<ReconciliationPage<unknown>> {
    return { items: [], nextCursor: null, hasMore: false };
  }

  private mapPayment(payment: BachsPayment): ReconciliationPayment {
    const metadata = asMetadata(payment.metadata);
    const currency = payment.currency.toUpperCase();
    return {
      id: payment.id,
      eventId: typeof metadata.event_id === "string" ? metadata.event_id : null,
      eventType: "collection.succeeded",
      status: payment.status,
      userId:
        payment.userId ??
        (typeof metadata.user_id === "string" ? metadata.user_id : null),
      productKey:
        typeof metadata.product_key === "string" ? metadata.product_key : null,
      amountMinor: decimalToMinorUnits(
        payment.amountPaid || payment.amount,
        currency,
      ),
      currency,
      organizationId:
        typeof metadata.organization_id === "string"
          ? metadata.organization_id
          : null,
      checkoutIntentId:
        typeof metadata.edutu_intent_id === "string"
          ? metadata.edutu_intent_id
          : null,
      occurredAt: payment.createdAt,
      metadata,
      environment: this.environment,
      refundClassification: payment.isRefundable ? "none" : "unknown",
    };
  }
}

@Injectable()
export class PaystackReconciliationAdapter implements ProviderReadAdapter {
  readonly provider = "paystack" as const;
  readonly environment: ReconciliationEnvironment;

  constructor() {
    this.environment = process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_test")
      ? "sandbox"
      : "live";
  }

  async listPayments(input: {
    cursor?: string;
    signal: AbortSignal;
  }): Promise<ReconciliationPage<ReconciliationPayment>> {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey)
      throw new Error("Paystack reconciliation is not configured");
    const page = Math.max(1, Number(input.cursor ?? "1") || 1);
    const response = await fetch(
      `https://api.paystack.co/transaction?perPage=100&page=${page}`,
      {
        headers: { Authorization: `Bearer ${secretKey}` },
        signal: input.signal,
      },
    );
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.status || !Array.isArray(body.data)) {
      throw new Error(
        `Paystack reconciliation provider error: ${safeProviderError(body)}`,
      );
    }
    const items = body.data.map((payment: Record<string, unknown>) => {
      const metadata = asMetadata(payment.metadata);
      return {
        id: String(payment.reference ?? payment.id),
        eventId: payment.id == null ? null : String(payment.id),
        eventType: "charge.success",
        status: String(payment.status ?? ""),
        userId: typeof metadata.user_id === "string" ? metadata.user_id : null,
        productKey:
          typeof metadata.product_key === "string"
            ? metadata.product_key
            : null,
        amountMinor: BigInt(Number(payment.amount)),
        currency: String(payment.currency ?? "").toUpperCase(),
        organizationId: null,
        checkoutIntentId: null,
        occurredAt: String(payment.paid_at ?? payment.created_at),
        metadata,
        environment: this.environment,
        refundClassification: "none" as const,
      } satisfies ReconciliationPayment;
    });
    return {
      items,
      nextCursor: items.length === 100 ? String(page + 1) : null,
      hasMore: items.length === 100,
    };
  }

  async listRefunds(): Promise<ReconciliationPage<unknown>> {
    return { items: [], nextCursor: null, hasMore: false };
  }

  async listSubscriptions(): Promise<ReconciliationPage<unknown>> {
    return { items: [], nextCursor: null, hasMore: false };
  }
}

@Injectable()
export class BillingReconciliationStoreService implements BillingReconciliationStorePort {
  async listRecentIntents(): Promise<[]> {
    return [];
  }
  async listRecentEvents(): Promise<[]> {
    return [];
  }
  async listLocalPayments(): Promise<[]> {
    return [];
  }
  async listLocalRefunds(): Promise<[]> {
    return [];
  }
  async listLocalSubscriptions(): Promise<[]> {
    return [];
  }
  async listLocalGrants(): Promise<[]> {
    return [];
  }

  async hasResource(input: {
    provider: ReconciliationProvider;
    environment: ReconciliationEnvironment;
    resourceId: string;
  }): Promise<boolean> {
    const result = await db.execute(sql`
      select 1 from public.billing_payment_ledger
      where provider = ${input.provider}
        and environment = ${input.environment}
        and provider_resource_id = ${input.resourceId}
      union all
      select 1 from public.billing_provider_events
      where provider = ${input.provider}
        and environment = ${input.environment}
        and event_id = ${input.resourceId}
      limit 1
    `);
    return Boolean((result as { rows?: unknown[] }).rows?.length);
  }

  async createReviewCase(input: {
    provider: ReconciliationProvider;
    environment: ReconciliationEnvironment;
    category: string;
    providerResourceId: string;
    details: Record<string, unknown>;
  }): Promise<void> {
    await db.execute(sql`
      insert into public.billing_review_cases (provider, environment, case_type, details)
      values (
        ${input.provider}, ${input.environment}, ${input.category},
        ${JSON.stringify(
          redactProviderPayload({
            providerResourceId: input.providerResourceId,
            ...input.details,
          }),
        )}::jsonb
      )
    `);
  }

  async purgeExpiredRawPayloads(): Promise<number> {
    const result = await db.execute(sql`
      update public.billing_provider_events
      set raw_payload = null, updated_at = now()
      where raw_payload is not null and raw_payload_expires_at <= now()
      returning id
    `);
    return (result as { rows?: unknown[] }).rows?.length ?? 0;
  }
}

@Injectable()
export class BillingReconciliationRepair {
  constructor(private readonly purchases: CreditPurchaseService) {}

  async repair(
    input: ReconciliationRepairInput,
  ): Promise<ReconciliationRepairResult> {
    if (
      input.provider === "revenuecat" ||
      !input.userId ||
      !input.productKey ||
      !input.creditQuantity ||
      !input.amountMinor ||
      !input.currency
    )
      return { status: "skipped" };
    const result = await this.purchases.fulfill(
      {
        provider: input.provider,
        environment: input.environment,
        eventId: input.eventId ?? `reconciliation:${input.providerResourceId}`,
        providerReference: input.providerResourceId,
        userId: input.userId,
        productKey: input.productKey,
        creditQuantity: input.creditQuantity,
        amountMinor: Number(input.amountMinor),
        currency: input.currency,
      },
      {
        eventType:
          input.provider === "paystack"
            ? "charge.success"
            : "collection.succeeded",
        payload: redactProviderPayload(input.metadata ?? input),
        intentId: input.checkoutIntentId,
      },
    );
    return result.status === "duplicate"
      ? { status: "duplicate" }
      : result.status === "fulfilled"
        ? { status: "enqueued" }
        : { status: "skipped" };
  }
}
