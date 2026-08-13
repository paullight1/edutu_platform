import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { matchUserIdRef } from "../common/user-id";
import { API_CREDIT_PRODUCT_QUANTITIES } from "./types/billing-checkout.types";
import { redactProviderPayload } from "./provider-payload-redaction";

export type VerifiedCreditPurchase = {
  provider: "bachs" | "paystack";
  environment: "sandbox" | "live";
  eventId: string;
  providerReference: string;
  userId: string;
  productKey: string;
  creditQuantity: number;
  amountMinor: number;
  currency: string;
};

export type CreditPurchaseResult = {
  status: "fulfilled" | "duplicate" | "review";
  creditsAdded: number;
  ledgerId: string | null;
};

export type CreditPurchaseTransaction = {
  execute(statement: SQL): Promise<{ rows?: unknown[] }>;
};

export type CreditPurchaseDatabase = {
  transaction<T>(
    callback: (transaction: CreditPurchaseTransaction) => Promise<T>,
  ): Promise<T>;
};

export const CREDIT_PURCHASE_DATABASE = Symbol("CREDIT_PURCHASE_DATABASE");

export type CreditPurchaseContext = {
  eventRowId?: string;
  eventType?: string;
  payload?: unknown;
  payloadHash?: string;
  intentId?: string;
  allowLegacyPaystackProduct?: boolean;
  legacyAudit?: {
    providerReference: string;
    userId: string;
    amountMajor: number;
    currency: string;
    payload: unknown;
  };
};

type Row = Record<string, unknown>;

const LEGACY_PAYSTACK_PRODUCT = "legacy_paystack_credit_topup";

@Injectable()
export class CreditPurchaseService {
  private readonly logger = new Logger(CreditPurchaseService.name);

  constructor(
    @Inject(CREDIT_PURCHASE_DATABASE)
    private readonly database: CreditPurchaseDatabase = db as unknown as CreditPurchaseDatabase,
  ) {}

  async fulfill(
    input: VerifiedCreditPurchase,
    context: CreditPurchaseContext = {},
  ): Promise<CreditPurchaseResult> {
    return this.database.transaction((transaction) =>
      this.fulfillInTransaction(transaction, input, {
        eventType:
          context.eventType ??
          (input.provider === "bachs"
            ? "collection.succeeded"
            : "charge.success"),
        payload: context.payload ?? input,
        ...context,
      }),
    );
  }

  /**
   * Applies a provider payment inside the caller's transaction. Bachs uses
   * this after its signed event has already been inserted, so event storage,
   * intent state, ledger insertion, and the profile mirror share one commit.
   */
  async fulfillInTransaction(
    transaction: CreditPurchaseTransaction,
    input: VerifiedCreditPurchase,
    context: CreditPurchaseContext = {},
  ): Promise<CreditPurchaseResult> {
    const eventRowId =
      context.eventRowId ??
      (await this.insertEvent(transaction, input, context)).eventRowId;

    if (!eventRowId) {
      return { status: "duplicate", creditsAdded: 0, ledgerId: null };
    }

    const invalidReason = this.invalidInputReason(input, context);
    if (invalidReason) {
      await this.markReview(
        transaction,
        eventRowId,
        invalidReason,
        context.intentId,
      );
      return { status: "review", creditsAdded: 0, ledgerId: null };
    }

    if (context.legacyAudit) {
      const audit = await transaction.execute(sql`
        update public.billing_transactions
        set status = 'completed',
            metadata = ${JSON.stringify(
              redactProviderPayload(context.legacyAudit.payload),
            )}::jsonb
        where provider = 'paystack'
          and provider_reference = ${context.legacyAudit.providerReference}
          and user_id = ${context.legacyAudit.userId}
          and amount = ${context.legacyAudit.amountMajor}
          and upper(currency) = upper(${context.legacyAudit.currency})
          and status in ('pending', 'processing', 'completed')
        returning id
      `);
      if (!this.firstRow(audit)) {
        await this.markReview(
          transaction,
          eventRowId,
          "legacy_audit_write_failed",
          context.intentId,
        );
        return { status: "review", creditsAdded: 0, ledgerId: null };
      }
    }

    await transaction.execute(
      sql`select set_config('app.credit_op', 'on', true)`,
    );
    const inserted = await transaction.execute(sql`
      insert into public.credit_transactions (
        user_id, amount, type, description, related_id, related_type, metadata
      ) values (
        ${input.userId}, ${input.creditQuantity}, 'purchase',
        ${`API credit purchase: +${input.creditQuantity}`},
        ${input.providerReference}, 'api_credit_purchase',
        ${JSON.stringify({
          provider: input.provider,
          environment: input.environment,
          productKey: input.productKey,
          amountMinor: input.amountMinor,
          currency: input.currency.toUpperCase(),
          intentId: context.intentId ?? null,
        })}::jsonb
      )
      on conflict (related_type, related_id)
        where related_id is not null
          and related_type in ('api_request', 'api_credit_purchase')
      do nothing
      returning id
    `);
    const ledgerId = this.firstRow(inserted)?.id;

    if (ledgerId) {
      const profile = await transaction.execute(sql`
        update public.profiles
        set credits = coalesce(credits, 0) + ${input.creditQuantity},
            updated_at = now()
        where ctid = (
          select ctid
          from public.profiles
          where ${matchUserIdRef("user_id::text", input.userId)}
          order by
            case when user_id::text = ${input.userId} then 0 else 1 end,
            coalesce(credits, 0) desc,
            ctid
          limit 1
        )
        returning user_id
      `);
      if (!this.firstRow(profile)) {
        throw new Error("billing profile was not found");
      }

      await this.markProcessed(transaction, eventRowId, context.intentId);
      return {
        status: "fulfilled",
        creditsAdded: input.creditQuantity,
        ledgerId: String(ledgerId),
      };
    }

    const existing = await transaction.execute(sql`
      select id, user_id, amount, related_type, metadata
      from public.credit_transactions
      where related_type = 'api_credit_purchase'
        and related_id = ${input.providerReference}
      limit 1
    `);
    const existingRow = this.firstRow(existing);
    if (!existingRow) {
      throw new Error("credit purchase ledger insert was inconclusive");
    }

    if (
      String(existingRow.user_id) !== input.userId ||
      Number(existingRow.amount) !== input.creditQuantity ||
      String(existingRow.related_type) !== "api_credit_purchase"
    ) {
      await this.markReview(
        transaction,
        eventRowId,
        "provider_reference_reused_with_mismatched_purchase",
        context.intentId,
      );
      return { status: "review", creditsAdded: 0, ledgerId: null };
    }

    await this.markProcessed(transaction, eventRowId, context.intentId);
    return {
      status: "duplicate",
      creditsAdded: 0,
      ledgerId: String(existingRow.id),
    };
  }

  private async insertEvent(
    transaction: CreditPurchaseTransaction,
    input: VerifiedCreditPurchase,
    context: CreditPurchaseContext,
  ): Promise<{ eventRowId: string | null }> {
    const payload = context.payload ?? input;
    const payloadHash =
      context.payloadHash ??
      createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    const inserted = await transaction.execute(sql`
      insert into public.billing_provider_events (
        provider, environment, event_id, event_type, received_at, status,
        payload_hash, raw_payload, updated_at
      ) values (
        ${input.provider}, ${input.environment}, ${input.eventId},
        ${context.eventType ?? "credit.purchase.succeeded"}, now(), 'processing',
        ${payloadHash}, ${JSON.stringify(payload)}::jsonb, now()
      )
      on conflict (provider, environment, event_id) do nothing
      returning id
    `);
    const row = this.firstRow(inserted);
    if (row?.id) return { eventRowId: String(row.id) };

    const existing = await transaction.execute(sql`
      select id, status, payload_hash
      from public.billing_provider_events
      where provider = ${input.provider}
        and environment = ${input.environment}
        and event_id = ${input.eventId}
      limit 1
    `);
    const existingRow = this.firstRow(existing);
    if (!existingRow) {
      throw new Error("billing event insert was inconclusive");
    }
    if (String(existingRow.status) === "review") {
      return { eventRowId: null };
    }
    if (String(existingRow.payload_hash) !== payloadHash) {
      await this.markReview(
        transaction,
        String(existingRow.id),
        "provider_event_payload_conflict",
        context.intentId,
      );
    }
    return { eventRowId: null };
  }

  private invalidInputReason(
    input: VerifiedCreditPurchase,
    context: CreditPurchaseContext,
  ): string | null {
    if (!input.eventId.trim() || !input.providerReference.trim())
      return "missing_provider_identity";
    if (!input.userId.trim()) return "missing_user_identity";
    if (input.environment !== "sandbox" && input.environment !== "live")
      return "invalid_environment";
    if (!/^[A-Z]{3}$/.test(input.currency.trim().toUpperCase()))
      return "invalid_currency";
    if (
      !Intl.supportedValuesOf("currency").includes(
        input.currency.trim().toUpperCase(),
      )
    )
      return "unsupported_currency";
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0)
      return "invalid_amount";
    if (
      !Number.isSafeInteger(input.creditQuantity) ||
      input.creditQuantity <= 0
    )
      return "invalid_credit_quantity";
    if (
      input.provider === "bachs" &&
      (!Object.prototype.hasOwnProperty.call(
        API_CREDIT_PRODUCT_QUANTITIES,
        input.productKey,
      ) ||
        API_CREDIT_PRODUCT_QUANTITIES[
          input.productKey as keyof typeof API_CREDIT_PRODUCT_QUANTITIES
        ] !== input.creditQuantity)
    ) {
      return "api_product_quantity_mismatch";
    }
    if (
      input.provider === "paystack" &&
      input.productKey === LEGACY_PAYSTACK_PRODUCT &&
      !context.allowLegacyPaystackProduct
    ) {
      return "legacy_paystack_purchase_not_locally_verified";
    }
    if (
      input.provider === "paystack" &&
      input.productKey !== LEGACY_PAYSTACK_PRODUCT &&
      (!Object.prototype.hasOwnProperty.call(
        API_CREDIT_PRODUCT_QUANTITIES,
        input.productKey,
      ) ||
        API_CREDIT_PRODUCT_QUANTITIES[
          input.productKey as keyof typeof API_CREDIT_PRODUCT_QUANTITIES
        ] !== input.creditQuantity)
    ) {
      return "api_product_quantity_mismatch";
    }
    return null;
  }

  private async markProcessed(
    transaction: CreditPurchaseTransaction,
    eventRowId: string,
    intentId?: string,
  ): Promise<void> {
    await transaction.execute(sql`
      update public.billing_provider_events
      set status = 'processed', processed_at = now(), updated_at = now()
      where id = ${eventRowId}
    `);
    if (intentId) {
      await transaction.execute(sql`
        update public.billing_checkout_intents
        set status = 'fulfilled', updated_at = now()
        where id = ${intentId}::uuid and status in ('open', 'processing', 'paid')
      `);
    }
  }

  private async markReview(
    transaction: CreditPurchaseTransaction,
    eventRowId: string,
    reason: string,
    intentId?: string,
  ): Promise<void> {
    await transaction.execute(sql`
      insert into public.billing_review_cases (event_id, case_type, details)
      values (
        ${eventRowId}, ${reason}, ${JSON.stringify({ intentId: intentId ?? null })}::jsonb
      )
    `);
    await transaction.execute(sql`
      update public.billing_provider_events
      set status = 'review', last_error = ${reason}, updated_at = now()
      where id = ${eventRowId}
    `);
    if (intentId) {
      await transaction.execute(sql`
        update public.billing_checkout_intents
        set status = 'review_required', updated_at = now()
        where id = ${intentId}::uuid and status in ('open', 'processing', 'paid')
      `);
    }
    this.logger.warn(`Credit purchase moved to review: ${reason}`);
  }

  private firstRow(result: { rows?: unknown[] }): Row | null {
    const row = result.rows?.[0];
    return row && typeof row === "object" && !Array.isArray(row)
      ? (row as Row)
      : null;
  }
}

export { LEGACY_PAYSTACK_PRODUCT };
