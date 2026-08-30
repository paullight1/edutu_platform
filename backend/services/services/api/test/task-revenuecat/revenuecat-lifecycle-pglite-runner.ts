import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

type ApplyResult = {
  outcome: "applied" | "duplicate" | "stale" | "review";
  userId: string;
  tier?: "lite" | "pro" | "scholar";
  status?: string;
  reason?: string;
};

const root = resolve(__dirname, "../../../../../../");

function migration(name: string): string {
  return readFileSync(resolve(root, "supabase/migrations", name), "utf8");
}

async function apply(
  database: PGlite,
  input: {
    environment?: "sandbox" | "live";
    eventId: string;
    eventType: string;
    userId: string;
    productId?: string;
    lineage?: string;
    transactionId?: string;
    occurredAt: string;
    expiresAt?: string | null;
    event?: Record<string, unknown>;
  },
): Promise<ApplyResult> {
  const result = await database.query<{ result: ApplyResult }>(
    `select public.billing_apply_revenuecat_subscription_event(
      $1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz, $10::jsonb
    ) as result`,
    [
      input.environment ?? "live",
      input.eventId,
      input.eventType,
      input.userId,
      input.productId ?? "edutu_pro_monthly_v1",
      input.lineage ?? "lineage-default",
      input.transactionId ?? `${input.eventId}-transaction`,
      input.occurredAt,
      input.expiresAt ?? null,
      JSON.stringify({
        api_version: "1.0",
        event: {
          type: input.eventType,
          id: input.eventId,
          app_user_id: input.userId,
          product_id: input.productId ?? "edutu_pro_monthly_v1",
          original_transaction_id: input.lineage ?? "lineage-default",
          ...input.event,
        },
      }),
    ],
  );
  const value = result.rows[0]?.result;
  if (!value) throw new Error(`No apply result for ${input.eventId}`);
  return value;
}

async function scalar<T>(database: PGlite, sql: string): Promise<T> {
  const result = await database.query<{ value: T }>(sql);
  if (!result.rows[0]) throw new Error(`No row for scalar query: ${sql}`);
  return result.rows[0].value;
}

async function main() {
  const database = new PGlite();
  try {
    await database.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema auth;
      create function auth.jwt() returns jsonb
      language sql stable as $$ select '{}'::jsonb $$;
    `);
    for (const name of [
      "20260811120000_bachs_unified_billing_core.sql",
      "20260811123000_derived_entitlements.sql",
      "20260812120000_bachs_checkout_contract_hardening.sql",
      "20260830120000_revenuecat_subscription_authority.sql",
    ]) {
      await database.exec(migration(name));
    }

    const initial = await apply(database, {
      eventId: "event-initial",
      eventType: "INITIAL_PURCHASE",
      userId: "user-initial",
      lineage: "lineage-initial",
      occurredAt: "2026-08-30T10:00:00.000Z",
      expiresAt: "2026-09-30T10:00:00.000Z",
      event: { purchased_at_ms: 1788084000000 },
    });
    const duplicate = await apply(database, {
      eventId: "event-initial",
      eventType: "INITIAL_PURCHASE",
      userId: "user-initial",
      lineage: "lineage-initial",
      occurredAt: "2026-08-30T10:00:00.000Z",
      expiresAt: "2026-09-30T10:00:00.000Z",
    });
    if (initial.outcome !== "applied" || duplicate.outcome !== "duplicate") {
      throw new Error(`Unexpected duplicate results: ${JSON.stringify({ initial, duplicate })}`);
    }
    const initialSubscriptions = await scalar<number>(
      database,
      `select count(*)::integer as value from public.billing_provider_subscriptions
       where provider = 'revenuecat' and environment = 'live'
         and provider_subscription_id = 'lineage-initial'`,
    );
    const initialGrants = await scalar<number>(
      database,
      `select count(*)::integer as value from public.billing_entitlement_grants
       where provider = 'revenuecat' and environment = 'live'
         and source_resource_id = 'lineage-initial' and feature_key = 'pro'`,
    );
    if (initialSubscriptions !== 1 || initialGrants !== 1) {
      throw new Error(`Duplicate effect detected: ${initialSubscriptions}/${initialGrants}`);
    }

    const concurrentResults = await Promise.all([
      apply(database, {
        eventId: "event-concurrent",
        eventType: "INITIAL_PURCHASE",
        userId: "user-concurrent",
        lineage: "lineage-concurrent",
        occurredAt: "2026-08-30T10:00:00.000Z",
        expiresAt: "2026-09-30T10:00:00.000Z",
      }),
      apply(database, {
        eventId: "event-concurrent",
        eventType: "INITIAL_PURCHASE",
        userId: "user-concurrent",
        lineage: "lineage-concurrent",
        occurredAt: "2026-08-30T10:00:00.000Z",
        expiresAt: "2026-09-30T10:00:00.000Z",
      }),
    ]);
    if (
      concurrentResults.filter(({ outcome }) => outcome === "applied").length !== 1 ||
      concurrentResults.filter(({ outcome }) => outcome === "duplicate").length !== 1
    ) {
      throw new Error(`Concurrent duplicate was not fenced: ${JSON.stringify(concurrentResults)}`);
    }

    const renewal = await apply(database, {
      eventId: "event-renewal-newer",
      eventType: "RENEWAL",
      userId: "user-reordered",
      lineage: "lineage-reordered",
      occurredAt: "2026-09-30T10:00:00.000Z",
      expiresAt: "2026-10-30T10:00:00.000Z",
    });
    const staleInitial = await apply(database, {
      eventId: "event-initial-older",
      eventType: "INITIAL_PURCHASE",
      userId: "user-reordered",
      lineage: "lineage-reordered",
      occurredAt: "2026-08-30T10:00:00.000Z",
      expiresAt: "2026-09-30T10:00:00.000Z",
    });
    const reorderedExpiry = await scalar<string>(
      database,
      `select current_period_end::text as value
       from public.billing_provider_subscriptions
       where provider = 'revenuecat' and environment = 'live'
         and provider_subscription_id = 'lineage-reordered'`,
    );
    if (
      renewal.outcome !== "applied" ||
      staleInitial.outcome !== "stale" ||
      !reorderedExpiry.startsWith("2026-10-30")
    ) {
      throw new Error(
        `Reordered event overwrote current state: ${JSON.stringify({ renewal, staleInitial, reorderedExpiry })}`,
      );
    }

    const staleCancellation = await apply(database, {
      eventId: "event-cancel-stale",
      eventType: "CANCELLATION",
      userId: "user-reordered",
      lineage: "lineage-reordered",
      occurredAt: "2026-09-01T10:00:00.000Z",
      expiresAt: "2026-09-30T10:00:00.000Z",
    });
    const statusAfterStaleCancellation = await scalar<string>(
      database,
      `select status as value from public.billing_provider_subscriptions
       where provider_subscription_id = 'lineage-reordered'`,
    );
    if (
      staleCancellation.outcome !== "stale" ||
      statusAfterStaleCancellation !== "active"
    ) {
      throw new Error(
        `Stale cancellation changed current access: ${JSON.stringify({ staleCancellation, statusAfterStaleCancellation })}`,
      );
    }

    const canceled = await apply(database, {
      eventId: "event-cancel",
      eventType: "CANCELLATION",
      userId: "user-reordered",
      lineage: "lineage-reordered",
      occurredAt: "2026-10-01T10:00:00.000Z",
      expiresAt: "2026-10-30T10:00:00.000Z",
    });
    const canceledGrant = await scalar<number>(
      database,
      `select count(*)::integer as value from public.billing_entitlement_grants
       where source_resource_id = 'lineage-reordered' and status = 'active'
         and valid_until = '2026-10-30T10:00:00.000Z'::timestamptz`,
    );
    if (canceled.status !== "canceled" || canceledGrant !== 1) {
      throw new Error(`Cancellation lost paid-through access: ${JSON.stringify(canceled)}`);
    }

    await database.exec(`
      insert into public.billing_entitlement_grants (
        provider, environment, source_kind, source_resource_id, user_id,
        feature_key, valid_from, valid_until, status
      ) values (
        'bachs', 'live', 'subscription', 'bachs-overlap', 'user-reordered',
        'pro', '2026-08-01T00:00:00Z', '2027-08-01T00:00:00Z', 'active'
      );
    `);
    const refunded = await apply(database, {
      eventId: "event-refund",
      eventType: "REFUND",
      userId: "user-reordered",
      lineage: "lineage-reordered",
      occurredAt: "2026-10-02T10:00:00.000Z",
      expiresAt: "2026-10-02T10:00:00.000Z",
    });
    const remainingBachsGrant = await scalar<number>(
      database,
      `select count(*)::integer as value from public.billing_entitlement_grants
       where provider = 'bachs' and source_resource_id = 'bachs-overlap' and status = 'active'`,
    );
    const remainingRevenueCatGrant = await scalar<number>(
      database,
      `select count(*)::integer as value from public.billing_entitlement_grants
       where provider = 'revenuecat' and source_resource_id = 'lineage-reordered'`,
    );
    if (
      refunded.status !== "refunded" ||
      remainingBachsGrant !== 1 ||
      remainingRevenueCatGrant !== 0
    ) {
      throw new Error("Refund crossed provider source boundaries");
    }

    const reversed = await apply(database, {
      eventId: "event-refund-reversed",
      eventType: "REFUND_REVERSED",
      userId: "user-reordered",
      lineage: "lineage-reordered",
      occurredAt: "2026-10-03T10:00:00.000Z",
      expiresAt: "2026-10-30T10:00:00.000Z",
    });
    if (reversed.status !== "active") {
      throw new Error(`Refund reversal did not restore access: ${JSON.stringify(reversed)}`);
    }

    await apply(database, {
      environment: "sandbox",
      eventId: "event-sandbox",
      eventType: "INITIAL_PURCHASE",
      userId: "user-sandbox",
      lineage: "lineage-sandbox",
      occurredAt: "2026-08-30T10:00:00.000Z",
      expiresAt: "2026-09-30T10:00:00.000Z",
      productId: "edutu_lite_weekly_test_v1",
    });
    const sandboxSubscriptions = await scalar<number>(
      database,
      `select count(*)::integer as value from public.billing_provider_subscriptions
       where environment = 'sandbox' and provider_subscription_id = 'lineage-sandbox'`,
    );
    const sandboxEffectiveGrants = await scalar<number>(
      database,
      `select count(*)::integer as value from public.billing_entitlement_grants
       where environment = 'sandbox' and source_resource_id = 'lineage-sandbox'`,
    );
    if (sandboxSubscriptions !== 1 || sandboxEffectiveGrants !== 0) {
      throw new Error("Sandbox event affected effective access");
    }

    await apply(database, {
      eventId: "event-change-initial",
      eventType: "INITIAL_PURCHASE",
      userId: "user-change",
      lineage: "lineage-change",
      occurredAt: "2026-08-30T10:00:00.000Z",
      expiresAt: "2026-09-30T10:00:00.000Z",
      productId: "edutu_pro_monthly_v1",
    });
    await apply(database, {
      eventId: "event-change-scheduled",
      eventType: "PRODUCT_CHANGE",
      userId: "user-change",
      lineage: "lineage-change",
      occurredAt: "2026-09-01T10:00:00.000Z",
      expiresAt: "2026-09-30T10:00:00.000Z",
      productId: "edutu_pro_monthly_v1",
      event: { new_product_id: "edutu_scholar_monthly_v1" },
    });
    const scheduledBeforeRenewal = await scalar<string>(
      database,
      `select scheduled_product_key as value
       from public.billing_provider_subscriptions
       where provider_subscription_id = 'lineage-change'`,
    );
    await apply(database, {
      eventId: "event-change-renewal",
      eventType: "RENEWAL",
      userId: "user-change",
      lineage: "lineage-change",
      occurredAt: "2026-09-30T10:00:01.000Z",
      expiresAt: "2026-10-30T10:00:00.000Z",
      productId: "edutu_scholar_monthly_v1",
    });
    const scheduledAfterRenewal = await database.query<{
      product_key: string;
      scheduled_product_key: string | null;
      scheduled_cadence: string | null;
      scheduled_change_at: string | null;
    }>(`
      select product_key, scheduled_product_key, scheduled_cadence,
             scheduled_change_at::text
      from public.billing_provider_subscriptions
      where provider_subscription_id = 'lineage-change'
    `);
    const changed = scheduledAfterRenewal.rows[0];
    if (
      scheduledBeforeRenewal !== "scholar_monthly" ||
      changed?.product_key !== "scholar_monthly" ||
      changed.scheduled_product_key !== null ||
      changed.scheduled_cadence !== null ||
      changed.scheduled_change_at !== null
    ) {
      throw new Error(
        `Applied plan change left a stale schedule: ${JSON.stringify({ scheduledBeforeRenewal, changed })}`,
      );
    }

    await apply(database, {
      eventId: "event-transfer-source",
      eventType: "INITIAL_PURCHASE",
      userId: "user-transfer-old",
      lineage: "lineage-transfer",
      occurredAt: "2026-08-30T10:00:00.000Z",
      expiresAt: "2026-09-30T10:00:00.000Z",
      productId: "edutu_lite_monthly_v1",
    });
    const transfer = await apply(database, {
      eventId: "event-transfer",
      eventType: "TRANSFER",
      userId: "user-transfer-new",
      lineage: "lineage-transfer",
      occurredAt: "2026-08-31T10:00:00.000Z",
      expiresAt: null,
      productId: "edutu_lite_monthly_v1",
      event: {
        transferred_from: ["user-transfer-old"],
        transferred_to: ["user-transfer-new"],
      },
    });
    const transferOwner = await scalar<string>(
      database,
      `select user_id as value from public.billing_provider_subscriptions
       where provider_subscription_id = 'lineage-transfer'`,
    );
    const oldOwnerGrants = await scalar<number>(
      database,
      `select count(*)::integer as value from public.billing_entitlement_grants
       where source_resource_id = 'lineage-transfer' and user_id = 'user-transfer-old'`,
    );
    const newOwnerGrants = await scalar<number>(
      database,
      `select count(*)::integer as value from public.billing_entitlement_grants
       where source_resource_id = 'lineage-transfer' and user_id = 'user-transfer-new'`,
    );
    if (
      transfer.outcome !== "applied" ||
      transferOwner !== "user-transfer-new" ||
      oldOwnerGrants !== 0 ||
      newOwnerGrants !== 1
    ) {
      throw new Error(`Transfer was not atomic: ${JSON.stringify({ transfer, transferOwner, oldOwnerGrants, newOwnerGrants })}`);
    }

    const unknownProduct = await apply(database, {
      eventId: "event-unknown-product",
      eventType: "INITIAL_PURCHASE",
      userId: "user-review",
      lineage: "lineage-review-product",
      occurredAt: "2026-08-30T10:00:00.000Z",
      expiresAt: "2026-09-30T10:00:00.000Z",
      productId: "unknown_product",
    });
    const unknownEvent = await apply(database, {
      eventId: "event-unknown-type",
      eventType: "FUTURE_EVENT",
      userId: "user-review",
      lineage: "lineage-review-event",
      occurredAt: "2026-08-30T10:00:00.000Z",
      expiresAt: "2026-09-30T10:00:00.000Z",
    });
    if (
      unknownProduct.outcome !== "review" ||
      unknownProduct.reason !== "unknown_product" ||
      unknownEvent.outcome !== "review" ||
      unknownEvent.reason !== "unsupported_event_type"
    ) {
      throw new Error(`Unknown input did not route to review: ${JSON.stringify({ unknownProduct, unknownEvent })}`);
    }

    process.stdout.write(
      "RevenueCat lifecycle idempotency and ordering verified\n",
    );
    process.stdout.write(
      "RevenueCat source isolation and transfer verified\n",
    );
  } finally {
    await database.close();
  }
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
