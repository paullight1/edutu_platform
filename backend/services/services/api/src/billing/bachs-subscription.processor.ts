import { ServiceUnavailableException } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { CreditPurchaseTransaction } from "./credit-purchase.service";
import type { BachsWebhookEvent } from "./providers/bachs/bachs-webhook.types";
import { matchesBachsCadence } from "./providers/bachs/bachs-cadence";
import { decimalToMinorUnits } from "./providers/bachs/bachs-money";
import { getSubscriptionTierForProductKey } from "./plan-tiers";

type Row = Record<string, any>;
const object = (value: unknown): Row | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : null;
const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const date = (value: unknown): string | null => {
  const raw = text(value);
  return raw &&
    /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(raw) &&
    Number.isFinite(Date.parse(raw))
    ? raw
    : null;
};
const rows = (result: unknown): Row[] =>
  (result as { rows?: Row[] }).rows ?? [];

/** Ownership is bound only by the signed, intent-correlated checkout event.
 * Subscription and invoice events may arrive first: roll back and ask Bachs
 * to retry rather than acknowledge an event whose owner is not yet known.
 */
export class BachsSubscriptionProcessor {
  constructor(private readonly environment: "live" | "sandbox") {}

  async bindCheckout(
    tx: CreditPurchaseTransaction,
    event: BachsWebhookEvent,
    intent: Row,
  ): Promise<string | null> {
    const data = event.data;
    const snapshot = object(intent.product_snapshot);
    const subscription = object(data.subscription);
    const subscriptionId =
      text(subscription?.subscription_id) ?? text(subscription?.id);
    const customer = object(data.customer);
    const customerId = text(customer?.customer_id) ?? text(customer?.id);
    const metadata = object(data.metadata);
    if (
      !snapshot ||
      snapshot.renewalMode !== "recurring" ||
      !subscriptionId ||
      !customerId ||
      data.mode !== "subscription" ||
      data.payment_status !== "paid" ||
      metadata?.edutu_user_id !== intent.user_id ||
      data.currency !== String(intent.currency).trim() ||
      !["open", "processing", "paid", "fulfilled"].includes(
        String(intent.status),
      )
    )
      return "recurring_checkout_mismatch";
    try {
      if (
        decimalToMinorUnits(String(data.amount), String(data.currency)) !==
        BigInt(intent.expected_amount_minor)
      )
        return "recurring_checkout_amount_mismatch";
    } catch {
      return "recurring_checkout_amount_invalid";
    }
    const existing = rows(
      await tx.execute(sql`
      select user_id, checkout_intent_id, provider_customer_id
      from public.billing_provider_subscriptions
      where provider = 'bachs' and environment = ${this.environment}
        and provider_subscription_id = ${subscriptionId} for update
    `),
    )[0];
    if (
      existing &&
      (existing.user_id !== intent.user_id ||
        String(existing.checkout_intent_id) !== String(intent.id) ||
        existing.provider_customer_id !== customerId)
    )
      return "subscription_owner_conflict";
    const customerOwner = rows(
      await tx.execute(sql`
      select user_id, provider_customer_id from public.billing_provider_customers
      where provider = 'bachs' and environment = ${this.environment}
        and (provider_customer_id = ${customerId} or user_id = ${intent.user_id}) for update
    `),
    )[0];
    if (
      customerOwner &&
      (customerOwner.user_id !== intent.user_id ||
        customerOwner.provider_customer_id !== customerId)
    )
      return "subscription_customer_conflict";
    await tx.execute(sql`
      insert into public.billing_provider_customers(provider, environment, user_id, provider_customer_id)
      values ('bachs', ${this.environment}, ${intent.user_id}, ${customerId})
      on conflict (provider, environment, user_id) do nothing
    `);
    await tx.execute(sql`
      insert into public.billing_provider_subscriptions
        (provider, environment, provider_subscription_id, provider_customer_id,
         user_id, product_key, status, cadence, checkout_intent_id)
      values ('bachs', ${this.environment}, ${subscriptionId}, ${customerId},
        ${intent.user_id}, ${intent.product_key}, 'pending', ${snapshot.cadence}, ${intent.id}::uuid)
      on conflict (provider, environment, provider_subscription_id) do nothing
    `);
    return null;
  }

  async process(
    tx: CreditPurchaseTransaction,
    event: BachsWebhookEvent,
  ): Promise<string | null> {
    const data = event.data;
    const invoiceEvent = event.type.startsWith("invoice.");
    const subscriptionId = invoiceEvent
      ? text(object(data.subscription)?.subscription_id)
      : text(data.subscription_id);
    const customerId = text(object(data.customer)?.customer_id);
    if (!subscriptionId || !customerId) return "subscription_payload_invalid";
    const current = rows(
      await tx.execute(sql`
      select subscription.*, product.expected_amount_minor, product.currency,
        product.feature_key, product.cadence as product_cadence, product.renewal_mode,
        mapping.provider_product_id
      from public.billing_provider_subscriptions subscription
      join public.billing_products product on product.product_key = subscription.product_key
      join public.billing_product_provider_mappings mapping
        on mapping.product_key = product.product_key and mapping.provider = 'bachs'
       and mapping.environment = subscription.environment
      where subscription.provider = 'bachs' and subscription.environment = ${this.environment}
        and subscription.provider_subscription_id = ${subscriptionId}
      for update of subscription
    `),
    )[0];
    if (!current)
      throw new ServiceUnavailableException(
        "Subscription checkout binding is pending; retry this event.",
      );
    if (
      current.provider_customer_id !== customerId ||
      current.renewal_mode !== "recurring"
    )
      return "subscription_identity_mismatch";
    // Paid invoices retain their financial record even after newer lifecycle events.
    if (invoiceEvent) return this.invoice(tx, event, current, subscriptionId);
    if (
      event.type !== "customer.subscription.deleted" &&
      data.status !== "canceled" &&
      current.provider_updated_at &&
      Date.parse(current.provider_updated_at) > Date.parse(event.createdAt)
    )
      return null;
    // Canceled is terminal in Bachs. Delayed payments must never resurrect it.
    if (
      current.status === "canceled" &&
      event.type !== "customer.subscription.deleted"
    )
      return null;

    const status = text(data.status);
    const start = date(data.current_period_start);
    const end = date(data.current_period_end);
    if (
      !start ||
      !end ||
      Date.parse(end) <= Date.parse(start) ||
      !["active", "trialing", "past_due", "unpaid", "canceled"].includes(
        status ?? "",
      ) ||
      typeof data.cancel_at_period_end !== "boolean" ||
      data.quantity !== 1
    )
      return "subscription_period_invalid";
    if (event.type === "customer.subscription.deleted" && status !== "canceled")
      return "subscription_deletion_invalid";
    const product = rows(
      await tx.execute(sql`
      select product.product_key, product.feature_key, product.expected_amount_minor,
        product.currency, product.cadence, product.renewal_mode
      from public.billing_products product
      join public.billing_product_provider_mappings mapping on mapping.product_key = product.product_key
      where mapping.provider = 'bachs' and mapping.environment = ${this.environment}
        and mapping.provider_product_id = ${text(data.product_id)} and product.enabled
    `),
    )[0];
    if (
      !product ||
      !getSubscriptionTierForProductKey(product.product_key) ||
      product.renewal_mode !== "recurring" ||
      String(product.currency).trim() !== data.currency ||
      data.currency !== "USD" ||
      !matchesBachsCadence(object(data.billing_cycle), product.cadence)
    )
      return "subscription_product_mismatch";
    try {
      if (
        decimalToMinorUnits(String(data.amount), String(data.currency)) !==
        BigInt(product.expected_amount_minor)
      )
        return "subscription_price_mismatch";
    } catch {
      return "subscription_price_invalid";
    }
    if (
      status !== "canceled" &&
      current.current_period_start &&
      Date.parse(start) < Date.parse(current.current_period_start)
    )
      return null;
    const canceledAt = data.canceled_at == null ? null : date(data.canceled_at);
    if (data.canceled_at != null && !canceledAt)
      return "subscription_cancellation_invalid";
    await tx.execute(sql`
      update public.billing_provider_subscriptions
      set product_key = ${product.product_key}, status = ${status}, cadence = ${product.cadence},
        current_period_start = ${start}::timestamptz, current_period_end = ${end}::timestamptz,
        cancel_at_period_end = ${data.cancel_at_period_end}, canceled_at = ${canceledAt}::timestamptz,
        provider_updated_at = ${event.createdAt}::timestamptz, updated_at = now()
      where id = ${current.id}::uuid
    `);
    if (status === "canceled") {
      await this.revoke(
        tx,
        subscriptionId,
        event.createdAt,
        "subscription_canceled",
      );
    }
    // Only a settled invoice grants paid access. Active/trialing lifecycle
    // states are not proof that this billing period has been paid.
    // past_due/unpaid does not extend the previously paid access period.
    return null;
  }

  private async invoice(
    tx: CreditPurchaseTransaction,
    event: BachsWebhookEvent,
    current: Row,
    subscriptionId: string,
  ): Promise<string | null> {
    const data = event.data;
    const invoiceId = text(data.invoice_id);
    const start = date(data.period_start);
    const end = date(data.period_end);
    if (
      !invoiceId ||
      !start ||
      !end ||
      Date.parse(end) <= Date.parse(start) ||
      data.currency !== String(current.currency).trim()
    )
      return "invoice_payload_invalid";
    if (event.type === "invoice.payment_failed") {
      // A delayed failed attempt for an already settled period cannot undo it.
      const settled = rows(
        await tx.execute(sql`
        select id from public.billing_payment_ledger
        where provider = 'bachs' and environment = ${this.environment}
          and provider_resource_id = ${invoiceId} and status = 'succeeded'
      `),
      )[0];
      if (
        settled ||
        current.status === "canceled" ||
        (current.provider_updated_at &&
          Date.parse(current.provider_updated_at) >
            Date.parse(event.createdAt)) ||
        (current.current_period_start &&
          Date.parse(start) < Date.parse(current.current_period_start))
      )
        return null;
      await tx.execute(sql`
        update public.billing_provider_subscriptions set status = 'past_due',
          provider_updated_at = ${event.createdAt}::timestamptz, updated_at = now()
        where id = ${current.id}::uuid
      `);
      return null;
    }
    const maxDays = { weekly: 7, monthly: 31, yearly: 366 }[
      current.product_cadence as string
    ];
    if (!maxDays || Date.parse(end) - Date.parse(start) > maxDays * 86400000)
      return "invoice_period_invalid";
    if (data.status !== "paid") return "invoice_not_paid";
    let amount: bigint;
    try {
      amount = decimalToMinorUnits(
        String(data.amount_paid),
        String(data.currency),
      );
      if (
        decimalToMinorUnits(
          String(data.amount_remaining),
          String(data.currency),
        ) !== 0n ||
        decimalToMinorUnits(String(data.total), String(data.currency)) !==
          amount ||
        amount !== BigInt(current.expected_amount_minor)
      )
        return "invoice_amount_mismatch";
    } catch {
      return "invoice_amount_invalid";
    }
    const inserted = rows(
      await tx.execute(sql`
      insert into public.billing_payment_ledger(provider, environment, provider_resource_id,
        provider_event_id, checkout_intent_id, user_id, entry_kind, amount_minor,
        currency, customer_amount_minor, customer_currency, status, occurred_at, metadata)
      values ('bachs', ${this.environment}, ${invoiceId}, ${event.id},
        ${current.checkout_intent_id}::uuid, ${current.user_id}, 'charge', ${amount.toString()}::bigint,
        ${data.currency}::char(3), ${amount.toString()}::bigint, ${data.currency}::char(3),
        'succeeded', ${event.createdAt}::timestamptz,
        ${JSON.stringify({ product_key: current.product_key, subscription_id: subscriptionId, period_start: start, period_end: end })}::jsonb)
      on conflict (provider, environment, provider_resource_id) do nothing
      returning id
    `),
    );
    // The unique invoice owns all side effects, even if it arrives under a new event ID.
    if (
      !inserted.length ||
      current.status === "canceled" ||
      (current.current_period_start &&
        Date.parse(start) < Date.parse(current.current_period_start))
    )
      return null;
    const newerGrant = rows(
      await tx.execute(sql`
      select id from public.billing_entitlement_grants
      where provider = 'bachs' and environment = ${this.environment}
        and source_kind = 'subscription' and source_resource_id = ${subscriptionId}
        and valid_from > ${start}::timestamptz
    `),
    );
    if (newerGrant.length) return null;
    await tx.execute(sql`
      update public.billing_provider_subscriptions set status = 'active',
        current_period_start = ${start}::timestamptz, current_period_end = ${end}::timestamptz,
        provider_updated_at = greatest(provider_updated_at, ${event.createdAt}::timestamptz), updated_at = now()
      where id = ${current.id}::uuid
    `);
    await this.grant(
      tx,
      current.user_id,
      subscriptionId,
      current.feature_key,
      start,
      end,
    );
    await this.fulfillIntent(tx, current.checkout_intent_id);
    return null;
  }

  private async fulfillIntent(
    tx: CreditPurchaseTransaction,
    intentId: string | null,
  ) {
    if (intentId)
      await tx.execute(sql`
      update public.billing_checkout_intents set status = 'fulfilled', updated_at = now()
      where id = ${intentId}::uuid and status in ('open', 'processing', 'paid')
    `);
  }

  private async revoke(
    tx: CreditPurchaseTransaction,
    subscriptionId: string,
    occurredAt: string,
    reason: string,
  ) {
    await tx.execute(sql`
      update public.billing_entitlement_grants set status = 'revoked',
        revoked_at = ${occurredAt}::timestamptz, revoke_reason = ${reason}, updated_at = now()
      where provider = 'bachs' and environment = ${this.environment}
        and source_kind = 'subscription' and source_resource_id = ${subscriptionId}
    `);
  }

  private async grant(
    tx: CreditPurchaseTransaction,
    userId: string,
    subscriptionId: string,
    tier: string,
    start: string,
    end: string,
  ) {
    await tx.execute(sql`
      update public.billing_entitlement_grants set status = 'revoked', revoked_at = now(),
        revoke_reason = 'subscription_plan_changed', updated_at = now()
      where provider = 'bachs' and environment = ${this.environment}
        and source_kind = 'subscription' and source_resource_id = ${subscriptionId}
        and feature_key <> ${tier}
    `);
    await tx.execute(sql`
      insert into public.billing_entitlement_grants(provider, environment, source_kind,
        source_resource_id, user_id, feature_key, valid_from, valid_until, status)
      values ('bachs', ${this.environment}, 'subscription', ${subscriptionId}, ${userId},
        ${tier}, ${start}::timestamptz, ${end}::timestamptz, 'active')
      on conflict (provider, environment, source_kind, source_resource_id, feature_key)
      do update set valid_from = excluded.valid_from, valid_until = excluded.valid_until,
        status = 'active', revoked_at = null, revoke_reason = null, updated_at = now()
    `);
  }
}
