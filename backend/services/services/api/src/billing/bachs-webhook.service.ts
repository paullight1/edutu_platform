import { HttpException, Injectable, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import type { BachsEnabledConfig } from "./providers/bachs/bachs.config";
import {
  BachsWebhookError,
  BachsWebhookVerifier,
} from "./providers/bachs/bachs-webhook.verifier";
import type { BachsWebhookEvent } from "./providers/bachs/bachs-webhook.types";

type JsonRecord = Record<string, unknown>;

export function decimalToMinorUnits(value: string, currency: string): bigint {
  const normalizedCurrency = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
    throw new Error("Bachs currency is invalid");
  }
  const fractionDigits =
    new Intl.NumberFormat("en", {
      style: "currency",
      currency: normalizedCurrency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) {
    throw new Error("Bachs amount is invalid");
  }
  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > fractionDigits) {
    throw new Error("Bachs amount has too many decimal places");
  }
  const scale = 10n ** BigInt(fractionDigits);
  const fractionValue = BigInt(fraction.padEnd(fractionDigits, "0") || "0");
  return BigInt(whole) * scale + fractionValue;
}

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

  constructor(
    private readonly config: BachsEnabledConfig,
    options: { clock?: () => number } = {},
  ) {
    this.clock = options.clock ?? Date.now;
    this.verifier = new BachsWebhookVerifier({
      secret: config.webhookSecret,
      expectedOrganizationId: config.expectedOrganizationId,
      expectedEnvironment: config.environment,
      clock: this.clock,
    });
  }

  async handle(
    rawBody: Buffer,
    timestamp: string | undefined,
    signature: string | undefined,
  ): Promise<{ status: "processed" | "duplicate" | "review" }> {
    if (!this.config.checkoutEnabled) {
      throw new HttpException("Bachs webhook is not configured", 503);
    }

    let event: BachsWebhookEvent;
    try {
      event = this.verifier.verify({
        rawBody,
        timestampHeader: timestamp,
        signatureHeader: signature,
        deliveryEnvironment: this.config.environment,
      });
    } catch (error) {
      if (error instanceof BachsWebhookError) {
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
          ${JSON.stringify(payload)}::jsonb, now()
        )
        on conflict (provider, environment, event_id) do nothing
        returning id
      `);
      const insertedRow = (
        inserted as unknown as { rows?: Array<{ id: unknown }> }
      ).rows?.[0];
      if (!insertedRow) return { status: "duplicate" as const };

      if (event.type === "checkout.completed") {
        await this.markProcessed(tx, insertedRow.id);
        return { status: "processed" as const };
      }

      if (event.type !== "collection.succeeded") {
        await this.markReview(
          tx,
          insertedRow.id,
          event,
          "unsupported_event_type",
        );
        return { status: "review" as const };
      }

      const processed = await this.fulfillCollection(tx, insertedRow.id, event);
      if (processed === "review") return { status: "review" as const };
      await this.markProcessed(tx, insertedRow.id);
      return { status: processed };
    });
  }

  private async fulfillCollection(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    eventRowId: unknown,
    event: BachsWebhookEvent,
  ): Promise<"processed" | "review"> {
    const data = event.data;
    const chargeId = stringValue(data.charge_id);
    const checkoutId = stringValue(data.checkout_id);
    const reference = stringValue(data.reference);
    const currency = stringValue(data.currency)?.toUpperCase();
    const amount = stringValue(data.amount);
    const status = stringValue(data.status)?.toLowerCase();
    const metadata = recordValue(data.metadata);
    const metadataIntentId = stringValue(metadata?.edutu_intent_id);
    const intentId = reference ?? metadataIntentId;
    const cart = Array.isArray(data.product_cart) ? data.product_cart : [];
    const item = recordValue(cart[0]);
    const productId = stringValue(item?.product_id);
    const quantity = item?.quantity;

    if (
      !chargeId ||
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
    const expectedAmount = BigInt(String(intent.expected_amount_minor));
    const actualAmount = decimalToMinorUnits(amount, currency);
    if (
      (checkoutId && String(intent.provider_checkout_id) !== checkoutId) ||
      String(snapshot.providerProductId) !== productId ||
      expectedCurrency !== currency ||
      expectedAmount !== actualAmount ||
      !["open", "processing", "paid"].includes(String(intent.status))
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

    const fulfillmentKind = String(snapshot.fulfillmentKind);
    const functionName =
      fulfillmentKind === "credit_pack" || fulfillmentKind === "credits"
        ? "billing_fulfill_credit_pack"
        : fulfillmentKind === "one_time_pass" ||
            fulfillmentKind === "season_pass"
          ? "billing_fulfill_one_time_purchase"
          : null;
    if (!functionName) {
      await this.markReview(
        tx,
        eventRowId,
        event,
        "unsupported_product_kind",
        intentId,
      );
      return "review";
    }

    const result = await tx.execute(sql`
      select public.${sql.raw(functionName)}(
        'bachs', ${this.config.environment}, ${chargeId}, ${String(intent.user_id)},
        ${String(intent.product_key)}, ${actualAmount}::bigint,
        ${currency}::char(3), ${event.createdAt}::timestamptz,
        ${intentId}::uuid
      ) as result
    `);
    const fulfillment = (result as { rows?: Array<{ result?: unknown }> })
      .rows?.[0]?.result;
    if (
      !recordValue(fulfillment)?.fulfilled &&
      !recordValue(fulfillment)?.duplicate
    ) {
      throw new Error("Bachs fulfillment did not complete");
    }

    await tx.execute(sql`
      update public.billing_checkout_intents
      set status = 'fulfilled', updated_at = now()
      where id = ${intentId}::uuid and status in ('open', 'processing', 'paid')
    `);
    return "processed";
  }

  private async markProcessed(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    eventRowId: unknown,
  ): Promise<void> {
    await tx.execute(sql`
      update public.billing_provider_events
      set status = 'processed', processed_at = now(), updated_at = now()
      where id = ${eventRowId}
    `);
  }

  private async markReview(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
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
