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
import {
  RevenueCatClient,
  type RevenueCatSubscriberSnapshot,
} from "./providers/revenuecat/revenuecat.client";
import { REVENUECAT_PROCESSOR_DATABASE } from "./revenuecat-event.processor";

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
  async listRecentIntents(input: {
    since: Date;
    until: Date;
    statuses: string[];
  }): Promise<Array<{ id: string; status: string }>> {
    const result = await db.execute(sql`
      select id, status
      from public.billing_checkout_intents
      where updated_at >= ${input.since.toISOString()}::timestamptz
        and updated_at <= ${input.until.toISOString()}::timestamptz
        and status = any(${input.statuses}::text[])
      order by updated_at asc
      limit 1000
    `);
    return (
      (result as { rows?: Array<{ id?: unknown; status?: unknown }> }).rows ??
      []
    )
      .filter((row) => row.id != null && row.status != null)
      .map((row) => ({ id: String(row.id), status: String(row.status) }));
  }
  async listRecentEvents(input: {
    since: Date;
    until: Date;
    statuses: string[];
  }): Promise<Array<{ id: string; status: string }>> {
    const result = await db.execute(sql`
      select id, status
      from public.billing_provider_events
      where updated_at >= ${input.since.toISOString()}::timestamptz
        and updated_at <= ${input.until.toISOString()}::timestamptz
        and status = any(${input.statuses}::text[])
      order by updated_at asc
      limit 1000
    `);
    return (
      (result as { rows?: Array<{ id?: unknown; status?: unknown }> }).rows ??
      []
    )
      .filter((row) => row.id != null && row.status != null)
      .map((row) => ({ id: String(row.id), status: String(row.status) }));
  }
  async listLocalPayments(input: {
    provider: ReconciliationProvider;
    environment: ReconciliationEnvironment;
  }): Promise<ReconciliationPayment[]> {
    const result = await db.execute(sql`
      select provider_resource_id, provider_event_id, user_id, amount_minor,
             currency, occurred_at, status, metadata
      from public.billing_payment_ledger
      where provider = ${input.provider}
        and environment = ${input.environment}
      order by occurred_at desc
      limit 5000
    `);
    return (
      (result as { rows?: Array<Record<string, unknown>> }).rows ?? []
    ).map((row) => ({
      id: String(row.provider_resource_id),
      eventId:
        row.provider_event_id == null ? null : String(row.provider_event_id),
      eventType: "payment.recorded",
      status: String(row.status ?? ""),
      userId: row.user_id == null ? null : String(row.user_id),
      productKey: null,
      amountMinor: BigInt(String(row.amount_minor ?? 0)),
      currency: String(row.currency ?? "").toUpperCase(),
      organizationId: null,
      checkoutIntentId: null,
      occurredAt: new Date(String(row.occurred_at)).toISOString(),
      metadata: asMetadata(row.metadata),
      environment: input.environment,
      refundClassification: "unknown" as const,
    }));
  }
  async listLocalRefunds(): Promise<unknown[]> {
    return [];
  }
  async listLocalSubscriptions(): Promise<unknown[]> {
    return [];
  }
  async listLocalGrants(input: {
    provider: ReconciliationProvider;
    environment: ReconciliationEnvironment;
  }): Promise<
    Array<{
      provider: ReconciliationProvider;
      environment: ReconciliationEnvironment;
      sourceResourceId: string;
      userId: string | null;
      status: string;
    }>
  > {
    const result = await db.execute(sql`
      select related_id, user_id, metadata
      from public.credit_transactions
      where type = 'purchase'
        and related_type = 'api_credit_purchase'
        and metadata->>'provider' = ${input.provider}
        and metadata->>'environment' = ${input.environment}
      limit 5000
    `);
    return ((result as { rows?: Array<Record<string, unknown>> }).rows ?? [])
      .filter((row) => row.related_id != null)
      .map((row) => ({
        provider: input.provider,
        environment: input.environment,
        sourceResourceId: String(row.related_id),
        userId: row.user_id == null ? null : String(row.user_id),
        status: "fulfilled",
      }));
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
      union all
      select 1 from public.credit_transactions
      where related_type = 'api_credit_purchase'
        and related_id = ${input.resourceId}
        and metadata->>'provider' = ${input.provider}
        and metadata->>'environment' = ${input.environment}
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

export interface RevenueCatLocalSubscriptionState {
  appUserId: string;
  environment: ReconciliationEnvironment;
  lineageId: string;
  entitlementKey: string;
  productKey: string;
  providerProductId: string | null;
  status: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  hasActiveGrant: boolean;
  scheduledProductKey: string | null;
  scheduledProviderProductId: string | null;
  scheduledChangeAt: Date | null;
}

export interface RevenueCatReconciliationPersistence {
  listSubjects(environment: ReconciliationEnvironment): Promise<string[]>;
  readLocalState(
    appUserId: string,
    environment: ReconciliationEnvironment,
  ): Promise<RevenueCatLocalSubscriptionState[]>;
  repairMissingGrant(state: RevenueCatLocalSubscriptionState): Promise<boolean>;
  createReviewCase(input: {
    provider: "revenuecat";
    environment: ReconciliationEnvironment;
    category: string;
    providerResourceId: string;
    details: Record<string, unknown>;
  }): Promise<void>;
}

type RevenueCatReconciliationDatabase = {
  execute(statement: ReturnType<typeof sql>): Promise<{ rows?: unknown[] }>;
};

function optionalDate(value: unknown): Date | null {
  if (value == null) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

@Injectable()
export class PostgresRevenueCatReconciliationPersistence implements RevenueCatReconciliationPersistence {
  constructor(
    @Inject(REVENUECAT_PROCESSOR_DATABASE)
    private readonly database: RevenueCatReconciliationDatabase = db as unknown as RevenueCatReconciliationDatabase,
  ) {}

  async listSubjects(
    environment: ReconciliationEnvironment,
  ): Promise<string[]> {
    const result = await this.database.execute(sql`
      select distinct user_id
      from public.billing_provider_subscriptions
      where provider = 'revenuecat' and environment = ${environment}
      order by user_id
      limit 5000
    `);
    return ((result.rows ?? []) as Array<{ user_id?: unknown }>)
      .map((row) => (row.user_id == null ? "" : String(row.user_id)))
      .filter(Boolean);
  }

  async readLocalState(
    appUserId: string,
    environment: ReconciliationEnvironment,
  ): Promise<RevenueCatLocalSubscriptionState[]> {
    const result = await this.database.execute(sql`
      select
        subscription.user_id,
        subscription.environment,
        subscription.provider_subscription_id,
        subscription.entitlement_key,
        subscription.product_key,
        binding.provider_product_id,
        subscription.status,
        subscription.current_period_start,
        subscription.current_period_end,
        subscription.scheduled_product_key,
        scheduled_binding.provider_product_id as scheduled_provider_product_id,
        subscription.scheduled_change_at,
        exists (
          select 1
          from public.billing_entitlement_grants grant_row
          where grant_row.provider = 'revenuecat'
            and grant_row.environment = subscription.environment
            and grant_row.source_kind = 'subscription'
            and grant_row.source_resource_id = subscription.provider_subscription_id
            and grant_row.feature_key = subscription.entitlement_key
            and grant_row.status = 'active'
            and grant_row.revoked_at is null
            and (grant_row.valid_until is null or grant_row.valid_until > now())
        ) as has_active_grant
      from public.billing_provider_subscriptions subscription
      left join public.billing_revenuecat_store_products binding
        on binding.environment = subscription.environment
       and binding.store = subscription.provider_store
       and binding.product_key = subscription.product_key
       and binding.cadence = subscription.cadence
      left join public.billing_revenuecat_store_products scheduled_binding
        on scheduled_binding.environment = subscription.environment
       and scheduled_binding.store = subscription.provider_store
       and scheduled_binding.product_key = subscription.scheduled_product_key
       and scheduled_binding.cadence = subscription.scheduled_cadence
      where subscription.provider = 'revenuecat'
        and subscription.environment = ${environment}
        and subscription.user_id = ${appUserId}
      order by subscription.provider_subscription_id
    `);
    return ((result.rows ?? []) as Array<Record<string, unknown>>).map(
      (row) => ({
        appUserId: String(row.user_id),
        environment: String(row.environment) as ReconciliationEnvironment,
        lineageId: String(row.provider_subscription_id),
        entitlementKey: String(row.entitlement_key),
        productKey: String(row.product_key),
        providerProductId:
          row.provider_product_id == null
            ? null
            : String(row.provider_product_id),
        status: String(row.status),
        currentPeriodStart: optionalDate(row.current_period_start),
        currentPeriodEnd: optionalDate(row.current_period_end),
        hasActiveGrant: row.has_active_grant === true,
        scheduledProductKey:
          row.scheduled_product_key == null
            ? null
            : String(row.scheduled_product_key),
        scheduledProviderProductId:
          row.scheduled_provider_product_id == null
            ? null
            : String(row.scheduled_provider_product_id),
        scheduledChangeAt: optionalDate(row.scheduled_change_at),
      }),
    );
  }

  async repairMissingGrant(
    state: RevenueCatLocalSubscriptionState,
  ): Promise<boolean> {
    if (state.environment !== "live") return false;
    const result = await this.database.execute(sql`
      with eligible as (
        select subscription.*
        from public.billing_provider_subscriptions subscription
        where subscription.provider = 'revenuecat'
          and subscription.environment = 'live'
          and subscription.provider_subscription_id = ${state.lineageId}
          and subscription.user_id = ${state.appUserId}
          and subscription.entitlement_key = ${state.entitlementKey}
          and subscription.status in (
            'active', 'canceled', 'grace_period', 'price_consent_required'
          )
          and (
            subscription.current_period_end is null
            or subscription.current_period_end > now()
          )
        for update
      ), upserted as (
        insert into public.billing_entitlement_grants as grant_row (
          provider, environment, source_kind, source_resource_id, user_id,
          feature_key, valid_from, valid_until, status
        )
        select
          'revenuecat', 'live', 'subscription', provider_subscription_id,
          user_id, entitlement_key, coalesce(current_period_start, now()),
          current_period_end, 'active'
        from eligible
        on conflict (
          provider, environment, source_kind, source_resource_id, feature_key
        ) do update
        set user_id = excluded.user_id,
            valid_from = excluded.valid_from,
            valid_until = excluded.valid_until,
            status = 'active',
            revoked_at = null,
            revoke_reason = null,
            updated_at = now()
        returning user_id
      )
      select public.billing_refresh_paid_tier_projections(user_id, now())
      from upserted
    `);
    return Boolean(result.rows?.length);
  }

  async createReviewCase(input: {
    provider: "revenuecat";
    environment: ReconciliationEnvironment;
    category: string;
    providerResourceId: string;
    details: Record<string, unknown>;
  }): Promise<void> {
    await this.database.execute(sql`
      insert into public.billing_review_cases (
        provider, environment, case_type, details
      ) values (
        'revenuecat', ${input.environment}, ${input.category},
        ${JSON.stringify(
          redactProviderPayload({
            providerResourceId: input.providerResourceId,
            ...input.details,
          }),
        )}::jsonb
      )
    `);
  }
}

export class RevenueCatReconciliationAdapter {
  constructor(
    private readonly client: Pick<RevenueCatClient, "getSubscriber">,
    private readonly persistence: RevenueCatReconciliationPersistence,
  ) {}

  async reconcile(
    environment: ReconciliationEnvironment,
    options: { now?: Date } = {},
  ): Promise<{ checked: number; repaired: number; reviewCases: number }> {
    const result = { checked: 0, repaired: 0, reviewCases: 0 };
    const now = options.now ?? new Date();
    const subjects = await this.persistence.listSubjects(environment);
    for (const appUserId of subjects) {
      const [snapshot, localState] = await Promise.all([
        this.client.getSubscriber(appUserId, environment),
        this.persistence.readLocalState(appUserId, environment),
      ]);
      result.checked += 1;
      const outcome = await this.reconcileSubscriber(
        snapshot,
        localState,
        environment,
        now,
      );
      result.repaired += outcome.repaired;
      result.reviewCases += outcome.reviewCases;
    }
    return result;
  }

  private async reconcileSubscriber(
    snapshot: RevenueCatSubscriberSnapshot,
    localState: RevenueCatLocalSubscriptionState[],
    environment: ReconciliationEnvironment,
    now: Date,
  ): Promise<{ repaired: number; reviewCases: number }> {
    let repaired = 0;
    let reviewCases = 0;
    const handledLineages = new Set<string>();

    for (const entitlement of snapshot.activeEntitlements) {
      const staleScheduled = localState.find(
        (state) =>
          state.scheduledProviderProductId === entitlement.productId &&
          state.scheduledChangeAt !== null &&
          state.scheduledChangeAt <= now &&
          state.providerProductId !== entitlement.productId,
      );
      if (staleScheduled) {
        handledLineages.add(staleScheduled.lineageId);
        await this.review(
          environment,
          "stale_scheduled_change",
          staleScheduled.lineageId,
          entitlement,
        );
        reviewCases += 1;
        continue;
      }

      const exact = localState.find(
        (state) => state.providerProductId === entitlement.productId,
      );
      if (!exact) {
        const sameEntitlement = localState.find(
          (state) => state.entitlementKey === entitlement.id,
        );
        if (sameEntitlement) {
          handledLineages.add(sameEntitlement.lineageId);
          await this.review(
            environment,
            "product_mismatch",
            sameEntitlement.lineageId,
            entitlement,
          );
        } else {
          await this.review(
            environment,
            "paid_without_grant",
            entitlement.productId,
            entitlement,
          );
        }
        reviewCases += 1;
        continue;
      }

      handledLineages.add(exact.lineageId);
      if (!exact.hasActiveGrant && environment === "live") {
        if (await this.persistence.repairMissingGrant(exact)) repaired += 1;
      }
    }

    for (const state of localState) {
      if (state.hasActiveGrant && !handledLineages.has(state.lineageId)) {
        await this.review(
          environment,
          "grant_without_provider_access",
          state.lineageId,
          { entitlementId: state.entitlementKey },
        );
        reviewCases += 1;
      }
    }
    return { repaired, reviewCases };
  }

  private review(
    environment: ReconciliationEnvironment,
    category: string,
    providerResourceId: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    return this.persistence.createReviewCase({
      provider: "revenuecat",
      environment,
      category,
      providerResourceId,
      details: redactProviderPayload(details) as Record<string, unknown>,
    });
  }
}
