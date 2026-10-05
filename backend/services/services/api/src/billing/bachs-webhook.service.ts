import { HttpException, Injectable, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { logSafeObservability } from "../edutu-api/edutu-api-usage.service";
import type { BachsWebhookConfig } from "./providers/bachs/bachs.config";
import {
  BachsWebhookError,
  BachsWebhookVerifier,
} from "./providers/bachs/bachs-webhook.verifier";
import type { BachsWebhookEvent } from "./providers/bachs/bachs-webhook.types";
import { decimalToMinorUnits } from "./providers/bachs/bachs-money";
export { decimalToMinorUnits } from "./providers/bachs/bachs-money";
import {
  CreditPurchaseService,
  type CreditPurchaseTransaction,
} from "./credit-purchase.service";
import {
  API_CREDIT_PRODUCT_QUANTITIES,
  isApiCreditProductKey,
} from "./types/billing-checkout.types";
import {
  getSubscriptionTierForProductKey,
  isSubscriptionProductKey,
} from "./plan-tiers";
import { redactProviderPayload } from "./provider-payload-redaction";
import { BachsSubscriptionProcessor } from "./bachs-subscription.processor";

type JsonRecord = Record<string, unknown>;

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function recordValue(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

@Injectable()
export class BachsWebhookService {
  private readonly logger = new Logger(BachsWebhookService.name);
  private readonly verifier: BachsWebhookVerifier;
  private readonly clock: () => number;
  private readonly creditPurchaseService: CreditPurchaseService;

  constructor(
    private readonly config: BachsWebhookConfig,
    options: {
      clock?: () => number;
      creditPurchaseService?: CreditPurchaseService;
    } = {},
  ) {
    this.clock = options.clock ?? Date.now;
    this.verifier = new BachsWebhookVerifier({
      secret: config.webhookSecret,
      expectedOrganizationId: config.expectedOrganizationId,
      expectedEnvironment: config.environment,
      clock: this.clock,
    });
    this.creditPurchaseService =
      options.creditPurchaseService ?? new CreditPurchaseService();
  }

  async handle(
    rawBody: Buffer,
    timestamp: string | undefined,
    signature: string | undefined,
    signatureV2?: string,
  ): Promise<{ status: "fulfilled" | "processed" | "duplicate" | "review" }> {
    if (!this.config.webhookEnabled) {
      throw new HttpException("Bachs webhook is not configured", 503);
    }

    let event: BachsWebhookEvent;
    try {
      event = this.verifier.verify({
        rawBody,
        timestampHeader: timestamp,
        signatureHeader: signature,
        signatureV2Header: signatureV2,
        deliveryEnvironment: this.config.environment,
      });
    } catch (error) {
      if (error instanceof BachsWebhookError) {
        logSafeObservability(
          this.logger,
          "billing_webhook_verification_failed",
          {
            provider: "bachs",
            environment: this.config.environment,
            outcome: "rejected",
            category: String(error.statusCode),
          },
          "warn",
        );
        throw new HttpException(error.message, error.statusCode);
      }
      throw error;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new HttpException("Bachs webhook payload is invalid", 400);
    }

    const payloadHash = createHash("sha256").update(rawBody).digest("hex");
    return db.transaction(async (tx) => {
      const inserted = await tx.execute(sql`
        insert into public.billing_provider_events (
          provider, environment, event_id, event_type, organization_id,
          received_at, status, payload_hash, raw_payload, updated_at
        ) values (
          'bachs', ${this.config.environment}, ${event.id}, ${event.type},
          ${event.organizationId}, now(), 'processing', ${payloadHash},
          ${JSON.stringify(redactProviderPayload(payload))}::jsonb, now()
        )
        on conflict (provider, environment, event_id) do nothing
        returning id
      `);
      const insertedRow = (
        inserted as unknown as { rows?: Array<{ id: unknown }> }
      ).rows?.[0];
      if (!insertedRow) {
        const existingResult = await tx.execute(sql`
          select id, status, payload_hash
          from public.billing_provider_events
          where provider = 'bachs'
            and environment = ${this.config.environment}
            and event_id = ${event.id}
          limit 1
        `);
        const existing = (
          existingResult as unknown as {
            rows?: Array<{
              id: unknown;
              status?: unknown;
              payload_hash?: unknown;
            }>;
          }
        ).rows?.[0];
        if (existing && String(existing.payload_hash) !== payloadHash) {
          await this.markReview(
            tx,
            existing.id,
            event,
            "provider_event_payload_conflict",
          );
          return { status: "review" as const };
        }
        return { status: "duplicate" as const };
      }

      if (
        [
          "customer.subscription.created",
          "customer.subscription.updated",
          "customer.subscription.deleted",
          "invoice.paid",
          "invoice.payment_failed",
        ].includes(event.type)
      ) {
        const reason = await new BachsSubscriptionProcessor(
          this.config.environment,
        ).process(tx, event);
        if (reason) {
          await this.markReview(tx, insertedRow.id, event, reason);
          return { status: "review" as const };
        }
        await this.markProcessed(tx, insertedRow.id);
        return { status: "processed" as const };
      }
      if (event.type !== "collection.succeeded") {
        if (
          [
            "checkout.completed",
            "checkout.expired",
            "collection.failed",
            "collection.underpaid",
          ].includes(event.type)
        ) {
          const status = await this.handleNonSuccessEvent(
            tx,
            insertedRow.id,
            event,
          );
          return { status };
        }
        await this.markReview(
          tx,
          insertedRow.id,
          event,
          event.type === "checkout.completed"
            ? "checkout_completion_requires_settled_payment"
            : "unsupported_event_type",
        );
        return { status: "review" as const };
      }

      const processed = await this.fulfillCollection(tx, insertedRow.id, event);
      if (processed === "review") {
        logSafeObservability(
          this.logger,
          "billing_webhook_review",
          {
            provider: "bachs",
            environment: this.config.environment,
            outcome: "review",
            category: event.type,
          },
          "warn",
        );
        return { status: "review" as const };
      }
      logSafeObservability(this.logger, "billing_webhook_fulfilled", {
        provider: "bachs",
        environment: this.config.environment,
        outcome: processed,
        category: event.type,
      });
      return { status: processed };
    });
  }

  private async handleNonSuccessEvent(
    tx: CreditPurchaseTransaction,
    eventRowId: unknown,
    event: BachsWebhookEvent,
  ): Promise<"processed" | "review"> {
    const data = event.data;
    const checkoutId = stringValue(data.checkout_id);
    const reference = stringValue(data.reference);
    const metadata = recordValue(data.metadata);
    const metadataIntentId = stringValue(metadata?.edutu_intent_id);
    if (
      !checkoutId ||
      (reference && metadataIntentId && reference !== metadataIntentId)
    ) {
      await this.markReview(
        tx,
        eventRowId,
        event,
        "checkout_correlation_missing",
      );
      return "review";
    }

    const intentId = metadataIntentId ?? reference;
    if (!intentId || !isUuid(intentId)) {
      await this.markReview(tx, eventRowId, event, "checkout_intent_not_found");
      return "review";
    }

    const intentResult = await tx.execute(sql`
      select id, user_id, product_key, product_snapshot, provider_checkout_id, status, expected_amount_minor, currency
      from public.billing_checkout_intents
      where id = ${intentId}::uuid
        and provider = 'bachs'
        and environment = ${this.config.environment}
      for update
    `);
    const intent = (intentResult as { rows?: Array<JsonRecord> }).rows?.[0];
    if (!intent || String(intent.provider_checkout_id) !== checkoutId) {
      await this.markReview(
        tx,
        eventRowId,
        event,
        "checkout_identity_mismatch",
      );
      return "review";
    }

    if (
      event.type === "checkout.completed" &&
      recordValue(intent.product_snapshot)?.renewalMode === "recurring"
    ) {
      const reason = await new BachsSubscriptionProcessor(
        this.config.environment,
      ).bindCheckout(tx, event, intent);
      if (reason) {
        await this.markReview(tx, eventRowId, event, reason, intentId);
        return "review";
      }
    }
    const currentStatus = String(intent.status);
    if (event.type === "collection.underpaid") {
      const paidAmount = stringValue(data.amount);
      const remainingAmount = stringValue(data.amount_remaining);
      const currency = stringValue(data.currency)?.toUpperCase() ?? null;
      const amountForReview = (value: string | null) =>
        value && /^\d{1,12}(?:\.\d{1,6})?$/.test(value) ? value : null;
      await tx.execute(sql`
        insert into public.billing_review_cases (
          provider, environment, event_id, case_type, details
        ) values (
          'bachs', ${this.config.environment}, ${eventRowId}, 'collection_underpaid',
          ${JSON.stringify({
            eventId: event.id,
            eventType: event.type,
            checkoutId,
            expectedAmountMinor: String(intent.expected_amount_minor),
            expectedCurrency: String(intent.currency).trim().toUpperCase(),
            paidAmount: amountForReview(paidAmount),
            amountRemaining: amountForReview(remainingAmount),
            currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : null,
          })}::jsonb
        )
      `);
      if (["open", "processing"].includes(currentStatus)) {
        await tx.execute(sql`
          update public.billing_checkout_intents
          set status = 'underpaid', failure_code = 'provider_collection_underpaid',
              updated_at = now()
          where id = ${intentId}::uuid and status in ('open', 'processing')
        `);
      }
      await tx.execute(sql`
        update public.billing_provider_events
        set status = 'review', last_error = 'collection_underpaid', updated_at = now()
        where id = ${eventRowId}
      `);
      return "review";
    }

    if (event.type === "checkout.completed") {
      if (currentStatus === "open") {
        await tx.execute(sql`
          update public.billing_checkout_intents
          set status = 'processing', updated_at = now()
          where id = ${intentId}::uuid and status = 'open'
        `);
      }
    } else if (["open", "processing"].includes(currentStatus)) {
      const nextStatus =
        event.type === "checkout.expired" ? "expired" : "failed";
      await tx.execute(sql`
        update public.billing_checkout_intents
        set status = ${nextStatus}, failure_code = ${`provider_${event.type.replaceAll(".", "_")}`},
            updated_at = now()
        where id = ${intentId}::uuid and status in ('open', 'processing')
      `);
    }

    await this.markProcessed(tx, eventRowId);
    return "processed";
  }

  private async fulfillCollection(
    tx: CreditPurchaseTransaction,
    eventRowId: unknown,
    event: BachsWebhookEvent,
  ): Promise<"fulfilled" | "processed" | "review"> {
    const data = event.data;
    const chargeId = stringValue(data.charge_id);
    const checkoutId = stringValue(data.checkout_id);
    const reference = stringValue(data.reference);
    const currency = stringValue(data.currency)?.toUpperCase();
    const amount = stringValue(data.amount);
    const status = stringValue(data.status)?.toLowerCase();
    const metadata = recordValue(data.metadata);
    const metadataIntentId = stringValue(metadata?.edutu_intent_id);
    if (reference && metadataIntentId && reference !== metadataIntentId) {
      await this.markReview(tx, eventRowId, event, "intent_reference_mismatch");
      return "review";
    }
    const intentId = metadataIntentId ?? reference;
    const cart = Array.isArray(data.product_cart) ? data.product_cart : [];
    const item = recordValue(cart[0]);
    const productId = stringValue(item?.product_id);
    const quantity = item?.quantity;

    if (
      !chargeId ||
      !checkoutId ||
      !intentId ||
      !isUuid(intentId) ||
      !currency ||
      !amount ||
      status !== "succeeded" ||
      cart.length !== 1 ||
      !productId ||
      quantity !== 1
    ) {
      await this.markReview(
        tx,
        eventRowId,
        event,
        "collection_payload_mismatch",
      );
      return "review";
    }

    const intentResult = await tx.execute(sql`
      select id, user_id, product_key, provider_checkout_id,
             expected_amount_minor, currency, status, product_snapshot
      from public.billing_checkout_intents
      where id = ${intentId}::uuid
        and provider = 'bachs'
        and environment = ${this.config.environment}
      for update
    `);
    const intent = (intentResult as { rows?: Array<JsonRecord> }).rows?.[0];
    const snapshot = recordValue(intent?.product_snapshot);
    if (!intent || !snapshot) {
      await this.markReview(tx, eventRowId, event, "checkout_intent_not_found");
      return "review";
    }

    const expectedCurrency = String(intent.currency).trim().toUpperCase();
    let actualAmount: bigint;
    try {
      actualAmount = decimalToMinorUnits(amount, currency);
    } catch {
      await this.markReview(
        tx,
        eventRowId,
        event,
        "collection_amount_invalid",
        intentId,
      );
      return "review";
    }
    const expectedAmount = BigInt(String(intent.expected_amount_minor));
    const snapshotProductKey = stringValue(snapshot.productKey);
    const snapshotQuantity = Number(snapshot.creditQuantity);
    const snapshotValidity = snapshot.validityDays;
    const subscriptionTier = snapshotProductKey
      ? getSubscriptionTierForProductKey(snapshotProductKey)
      : null;
    const isApiCredit = Boolean(
      snapshotProductKey && isApiCreditProductKey(snapshotProductKey),
    );
    const isOneTimeSubscription = Boolean(
      snapshotProductKey && isSubscriptionProductKey(snapshotProductKey),
    );
    const userId = stringValue(metadata?.user_id);
    const edutuUserId = stringValue(metadata?.edutu_user_id);
    const providerUserId = userId ?? edutuUserId;
    const providerIdentityIsExact =
      Boolean(providerUserId) &&
      (!userId || !edutuUserId || userId === edutuUserId);
    const commonIntentValid =
      String(intent.provider_checkout_id) !== checkoutId ||
      !snapshotProductKey ||
      (isApiCredit &&
        this.config.productMappings[snapshotProductKey] !== productId) ||
      String(snapshot.providerProductId) !== productId ||
      !providerIdentityIsExact ||
      providerUserId !== String(intent.user_id) ||
      expectedCurrency !== currency ||
      expectedAmount !== actualAmount ||
      !["open", "processing", "paid"].includes(String(intent.status));
    const validApiCredit =
      isApiCredit &&
      ["credits", "credit_pack"].includes(String(snapshot.fulfillmentKind)) &&
      snapshot.renewalMode === "one_time" &&
      snapshotQuantity ===
        API_CREDIT_PRODUCT_QUANTITIES[
          snapshotProductKey as keyof typeof API_CREDIT_PRODUCT_QUANTITIES
        ] &&
      snapshotValidity === null;
    const validOneTimeSubscription =
      isOneTimeSubscription &&
      Boolean(subscriptionTier) &&
      ["pro", "one_time_pass", "subscription"].includes(
        String(snapshot.fulfillmentKind),
      ) &&
      snapshot.renewalMode === "one_time" &&
      Number.isInteger(snapshotValidity) &&
      Number(snapshotValidity) > 0;

    const validConsumerCredit =
      !isApiCredit &&
      Boolean(snapshotProductKey) &&
      ["credits", "credit_pack"].includes(String(snapshot.fulfillmentKind)) &&
      snapshot.renewalMode === "one_time" &&
      Number.isSafeInteger(snapshotQuantity) &&
      snapshotQuantity > 0 &&
      snapshotValidity === null;

    const validRecurringSubscription =
      isOneTimeSubscription &&
      Boolean(subscriptionTier) &&
      ["pro", "subscription"].includes(String(snapshot.fulfillmentKind)) &&
      snapshot.renewalMode === "recurring" &&
      snapshotValidity === null &&
      currency === "USD";
    if (
      commonIntentValid ||
      (!validApiCredit &&
        !validOneTimeSubscription &&
        !validConsumerCredit &&
        !validRecurringSubscription)
    ) {
      await this.markReview(
        tx,
        eventRowId,
        event,
        "checkout_intent_mismatch",
        intentId,
      );
      return "review";
    }

    if (validRecurringSubscription) {
      // Initial collection confirms money only. Subscription lifecycle events
      // own access and invoice.paid owns the recurring payment ledger.
      await tx.execute(sql`
        update public.billing_checkout_intents set status = 'processing', updated_at = now()
        where id = ${intentId}::uuid and status = 'open'
      `);
      await this.markProcessed(tx, eventRowId);
      return "processed";
    }
    if (validOneTimeSubscription) {
      await tx.execute(sql`
        select public.billing_fulfill_one_time_purchase(
          'bachs',
          ${this.config.environment},
          ${chargeId},
          ${String(intent.user_id)},
          ${snapshotProductKey},
          ${Number(actualAmount)},
          ${currency}::char(3),
          ${event.createdAt}::timestamptz,
          ${intentId}::uuid
        )
      `);
      await tx.execute(sql`
        update public.billing_checkout_intents
        set status = 'fulfilled', updated_at = now()
        where id = ${intentId}::uuid
      `);
      await this.markProcessed(tx, eventRowId);
      return "fulfilled";
    }

    const fulfillment = await this.creditPurchaseService.fulfillInTransaction(
      tx,
      {
        provider: "bachs",
        environment: this.config.environment,
        eventId: event.id,
        providerReference: chargeId,
        userId: String(intent.user_id),
        productKey: snapshotProductKey,
        creditQuantity: snapshotQuantity,
        amountMinor: Number(actualAmount),
        currency,
      },
      {
        eventRowId: String(eventRowId),
        eventType: event.type,
        payload: redactProviderPayload(event),
        intentId,
        ...(validConsumerCredit
          ? {
              verifiedConsumerProduct: {
                productKey: snapshotProductKey,
                creditQuantity: snapshotQuantity,
                amountMinor: Number(actualAmount),
                currency,
                environment: this.config.environment,
              },
            }
          : {}),
      },
    );
    return fulfillment.status === "review" ? "review" : "fulfilled";
  }

  private async markProcessed(
    tx: CreditPurchaseTransaction,
    eventRowId: unknown,
  ): Promise<void> {
    await tx.execute(sql`
      update public.billing_provider_events
      set status = 'processed', processed_at = now(), updated_at = now()
      where id = ${eventRowId}
    `);
  }

  private async markReview(
    tx: CreditPurchaseTransaction,
    eventRowId: unknown,
    event: BachsWebhookEvent,
    reason: string,
    intentId?: string,
  ): Promise<void> {
    await tx.execute(sql`
      insert into public.billing_review_cases (
        provider, environment, event_id, case_type, details
      ) values (
        'bachs', ${this.config.environment}, ${eventRowId}, ${reason},
        ${JSON.stringify({ eventId: event.id, eventType: event.type })}::jsonb
      )
    `);
    await tx.execute(sql`
      update public.billing_provider_events
      set status = 'review', last_error = ${reason}, updated_at = now()
      where id = ${eventRowId}
    `);
    if (intentId) {
      await tx.execute(sql`
        update public.billing_checkout_intents
        set status = 'review_required', updated_at = now()
        where id = ${intentId}::uuid and status in ('open', 'processing', 'paid')
      `);
    }
    this.logger.warn(`Bachs event ${event.id} moved to review: ${reason}`);
  }
}
