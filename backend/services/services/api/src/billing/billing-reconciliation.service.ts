import { Inject, Injectable, Logger } from "@nestjs/common";
import { BILLING_RECONCILIATION_OPTIONS } from "./reconciliation/reconciliation.types";
import { logSafeObservability } from "../edutu-api/edutu-api-usage.service";
import type {
  BillingReconciliationStore,
  ProviderReadAdapter,
  ReconciliationEnvironment,
  ReconciliationPage,
  ReconciliationPayment,
  ReconciliationProvider,
  ReconciliationRepairInput,
  ReconciliationRepairResult,
  ReconciliationResultMetric,
  ReconciliationRunResult,
} from "./reconciliation/reconciliation.types";

type Repair = (
  input: ReconciliationRepairInput,
) => Promise<ReconciliationRepairResult>;

const RECENT_WINDOW_MS = 15 * 60_000;
const DEFAULT_MAX_PAGES = 100;

@Injectable()
export class BillingReconciliationService {
  private readonly logger = new Logger(BillingReconciliationService.name);

  constructor(
    @Inject(BILLING_RECONCILIATION_OPTIONS)
    private readonly options: {
      adapters: ProviderReadAdapter[];
      store: BillingReconciliationStore;
      repair: Repair;
      checkoutEnabled: boolean;
      expectedOrganizationId?: string;
      expectedAmountMinor?: bigint;
      expectedCurrency?: string;
      expectedProductKey?: string;
      expectedProducts?: Readonly<
        Record<
          string,
          { amountMinor: bigint; currency: string; creditQuantity: number }
        >
      >;
      maxPages?: number;
      maxReadAttempts?: number;
    },
  ) {}

  async reconcileRecent(
    input: { now?: Date } = {},
  ): Promise<ReconciliationRunResult> {
    const now = input.now ?? new Date();
    const since = new Date(now.getTime() - RECENT_WINDOW_MS);
    await this.options.store.listRecentIntents({
      since,
      until: now,
      statuses: ["open", "pending", "failed"],
    });
    await this.options.store.listRecentEvents({
      since,
      until: now,
      statuses: ["received", "retrying", "dead_letter"],
    });
    const result = await this.scanProviders(now, false);
    this.logRun("recent", result);
    return result;
  }

  async purgeExpiredProviderPayloads(): Promise<number> {
    return this.options.store.purgeExpiredRawPayloads?.() ?? 0;
  }

  async reconcileDaily(
    input: { now?: Date } = {},
  ): Promise<ReconciliationRunResult> {
    const now = input.now ?? new Date();
    const result = await this.scanProviders(now, true);
    this.logRun("daily", result);
    return result;
  }

  private logRun(category: string, result: ReconciliationRunResult): void {
    logSafeObservability(
      this.logger,
      "billing_reconciliation_run",
      {
        category,
        outcome: result.providerErrors > 0 ? "degraded" : "completed",
        repaired: result.repaired,
        reviewCases: result.reviewCases,
        duplicates: result.duplicates,
        providerErrors: result.providerErrors,
      },
      result.providerErrors > 0 ? "warn" : "log",
    );
  }

  private async scanProviders(
    now: Date,
    includeAllResources: boolean,
  ): Promise<ReconciliationRunResult> {
    const result: ReconciliationRunResult = {
      repaired: 0,
      reviewCases: 0,
      duplicates: 0,
      providerErrors: 0,
      checkoutEnabled: this.options.checkoutEnabled,
      metrics: [],
    };

    for (const adapter of this.options.adapters) {
      const providerResult = await this.scanAdapter(
        adapter,
        now,
        includeAllResources,
      );
      result.repaired += providerResult.repaired;
      result.reviewCases += providerResult.reviewCases;
      result.duplicates += providerResult.duplicates;
      result.providerErrors += providerResult.providerErrors;
      result.metrics.push(...providerResult.metrics);
    }
    return result;
  }

  private async scanAdapter(
    adapter: ProviderReadAdapter,
    now: Date,
    includeAllResources: boolean,
  ): Promise<ReconciliationRunResult> {
    const result: ReconciliationRunResult = {
      repaired: 0,
      reviewCases: 0,
      duplicates: 0,
      providerErrors: 0,
      checkoutEnabled: this.options.checkoutEnabled,
      metrics: [],
    };
    const seenCursors = new Set<string>();
    const seenResources = new Set<string>();
    let cursor: string | undefined;
    let pages = 0;
    while (pages++ < (this.options.maxPages ?? DEFAULT_MAX_PAGES)) {
      let response: ReconciliationPage<ReconciliationPayment>;
      try {
        response = await this.readWithRetry(adapter, cursor);
      } catch (error) {
        result.providerErrors += 1;
        this.addMetric(result.metrics, "provider_outage", adapter, 1);
        this.logger.warn(
          `Billing reconciliation read failed for ${adapter.provider}/${adapter.environment}: ${this.safeError(error)}`,
        );
        break;
      }

      await this.options.store.listLocalGrants({
        provider: adapter.provider,
        environment: adapter.environment,
      });
      for (const payment of response.items) {
        const outcome = await this.inspectPayment(
          adapter,
          payment,
          includeAllResources,
          seenResources,
        );
        result.repaired += outcome.repaired;
        result.reviewCases += outcome.reviewCases;
        result.duplicates += outcome.duplicates;
        if (outcome.metric)
          this.addMetric(result.metrics, outcome.metric, adapter, 1);
      }

      if (
        !response.hasMore ||
        !response.nextCursor ||
        seenCursors.has(response.nextCursor)
      )
        break;
      seenCursors.add(response.nextCursor);
      cursor = response.nextCursor;
    }
    return result;
  }

  private async readWithRetry(
    adapter: ProviderReadAdapter,
    cursor: string | undefined,
  ): Promise<ReconciliationPage<ReconciliationPayment>> {
    const attempts = this.options.maxReadAttempts ?? 2;
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await adapter.listPayments({
          cursor,
          signal: AbortSignal.timeout(10_000),
        });
      } catch (error) {
        lastError = error;
        if (!this.isRetryable(error) || attempt === attempts - 1) throw error;
      }
    }
    throw lastError;
  }

  private async inspectPayment(
    adapter: ProviderReadAdapter,
    payment: ReconciliationPayment,
    includeAllResources: boolean,
    seenResources: Set<string>,
  ): Promise<{
    repaired: number;
    reviewCases: number;
    duplicates: number;
    metric?: string;
  }> {
    const category = this.classify(payment, adapter.environment);
    if (category) {
      await this.options.store.createReviewCase({
        provider: adapter.provider,
        environment: adapter.environment,
        category,
        providerResourceId: payment.id,
        details: this.redact(payment.metadata),
      });
      return { repaired: 0, reviewCases: 1, duplicates: 0, metric: category };
    }

    const exists = await this.options.store.hasResource({
      provider: adapter.provider,
      environment: adapter.environment,
      resourceId: payment.id,
    });
    if (exists && !includeAllResources)
      return { repaired: 0, reviewCases: 0, duplicates: 0 };
    if (exists) return { repaired: 0, reviewCases: 0, duplicates: 0 };
    if (seenResources.has(payment.id))
      return { repaired: 0, reviewCases: 0, duplicates: 0 };
    seenResources.add(payment.id);

    const repair = await this.options.repair({
      provider: adapter.provider,
      environment: adapter.environment,
      providerResourceId: payment.id,
      source: "reconciliation",
      provenance: { reason: "deterministic_missing_provider_event" },
      userId: payment.userId ?? undefined,
      productKey: payment.productKey ?? undefined,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      eventId: payment.eventId,
      creditQuantity: this.creditQuantity(payment),
      checkoutIntentId: payment.checkoutIntentId ?? undefined,
      metadata: payment.metadata,
    });
    if (repair.status === "duplicate") {
      return {
        repaired: 0,
        reviewCases: 0,
        duplicates: 1,
        metric: "duplicate_repair",
      };
    }
    return {
      repaired: 1,
      reviewCases: 0,
      duplicates: 0,
      metric: "missing_provider_event",
    };
  }

  private classify(
    payment: ReconciliationPayment,
    expectedEnvironment: ReconciliationEnvironment,
  ): string | undefined {
    if (
      !["succeeded", "success", "paid", "completed"].includes(
        payment.status.toLowerCase(),
      )
    ) {
      return "payment_not_successful";
    }
    if (!payment.userId) return "identity_mismatch";
    if (
      this.options.expectedOrganizationId &&
      payment.organizationId !== this.options.expectedOrganizationId
    ) {
      return "organization_mismatch";
    }
    if (this.options.expectedProducts) {
      const expectedProduct = payment.productKey
        ? this.options.expectedProducts[payment.productKey]
        : undefined;
      if (!expectedProduct) return "product_mismatch";
      if (payment.amountMinor !== expectedProduct.amountMinor) {
        return "amount_mismatch";
      }
      if (
        payment.currency.toUpperCase() !==
        expectedProduct.currency.toUpperCase()
      ) {
        return "currency_mismatch";
      }
    } else {
      const expectedAmount = this.options.expectedAmountMinor ?? 1_200n;
      if (payment.amountMinor !== expectedAmount) return "amount_mismatch";
      const expectedProduct =
        this.options.expectedProductKey ?? "pro_monthly_pass";
      if (payment.productKey !== expectedProduct) return "product_mismatch";
      if (
        this.options.expectedCurrency &&
        payment.currency.toUpperCase() !==
          this.options.expectedCurrency.toUpperCase()
      ) {
        return "currency_mismatch";
      }
    }
    if (payment.environment && payment.environment !== expectedEnvironment)
      return "environment_mismatch";
    if (payment.refundClassification === "unknown")
      return "refund_classification_ambiguous";
    return undefined;
  }

  private creditQuantity(payment: ReconciliationPayment): number | undefined {
    const value = payment.metadata.credit_quantity ?? payment.metadata.credits;
    return typeof value === "number" && Number.isSafeInteger(value)
      ? value
      : undefined;
  }

  private addMetric(
    metrics: ReconciliationResultMetric[],
    category: string,
    adapter: Pick<ProviderReadAdapter, "provider" | "environment">,
    count: number,
  ) {
    const current = metrics.find(
      (item) =>
        item.category === category &&
        item.provider === adapter.provider &&
        item.environment === adapter.environment,
    );
    if (current) current.count += count;
    else
      metrics.push({
        category,
        provider: adapter.provider,
        environment: adapter.environment,
        count,
      });
  }

  private isRetryable(error: unknown): boolean {
    return Boolean(
      error &&
      typeof error === "object" &&
      (error as { retryable?: unknown }).retryable === true,
    );
  }

  private safeError(error: unknown): string {
    return error instanceof Error
      ? error.message.slice(0, 200)
      : "unknown provider error";
  }

  private redact(value: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (/email|url|token|secret|raw|authorization/i.test(key)) continue;
      if (typeof item === "string") result[key] = item.slice(0, 200);
      else if (
        typeof item === "number" ||
        typeof item === "boolean" ||
        item === null
      )
        result[key] = item;
    }
    return result;
  }
}
