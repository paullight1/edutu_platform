export type ReconciliationProvider = "bachs" | "revenuecat";
export type ReconciliationEnvironment = "sandbox" | "live";

export interface ReconciliationPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ReconciliationPayment {
  id: string;
  eventId: string | null;
  eventType: string;
  status: string;
  userId: string | null;
  productKey: string | null;
  amountMinor: bigint;
  currency: string;
  organizationId: string | null;
  checkoutIntentId: string | null;
  occurredAt: string;
  metadata: Record<string, unknown>;
  environment?: ReconciliationEnvironment;
  refundClassification?: "refunded" | "partial" | "none" | "unknown";
}

export interface ReconciliationIntent {
  id: string;
  status: string;
}

export interface ReconciliationEvent {
  id: string;
  status: string;
}

export interface ReconciliationGrant {
  provider: ReconciliationProvider;
  environment: ReconciliationEnvironment;
  sourceResourceId: string;
  userId: string | null;
  status: string;
}

export interface ReconciliationReviewCase {
  provider: ReconciliationProvider;
  environment: ReconciliationEnvironment;
  category: string;
  providerResourceId: string;
  details: Record<string, unknown>;
}

export interface BillingReconciliationStore {
  listRecentIntents(input: {
    since: Date;
    until: Date;
    statuses: string[];
  }): Promise<ReconciliationIntent[]>;
  listRecentEvents(input: {
    since: Date;
    until: Date;
    statuses: string[];
  }): Promise<ReconciliationEvent[]>;
  listLocalPayments(input: {
    provider: ReconciliationProvider;
    environment: ReconciliationEnvironment;
  }): Promise<ReconciliationPayment[]>;
  listLocalRefunds(input: {
    provider: ReconciliationProvider;
    environment: ReconciliationEnvironment;
  }): Promise<unknown[]>;
  listLocalSubscriptions(input: {
    provider: ReconciliationProvider;
    environment: ReconciliationEnvironment;
  }): Promise<unknown[]>;
  listLocalGrants(input: {
    provider: ReconciliationProvider;
    environment: ReconciliationEnvironment;
  }): Promise<ReconciliationGrant[]>;
  hasResource(input: {
    provider: ReconciliationProvider;
    environment: ReconciliationEnvironment;
    resourceId: string;
  }): Promise<boolean>;
  createReviewCase(input: ReconciliationReviewCase): Promise<void>;
}

export interface ProviderReadAdapter {
  provider: ReconciliationProvider;
  environment: ReconciliationEnvironment;
  listPayments(input: {
    cursor?: string;
    signal: AbortSignal;
  }): Promise<ReconciliationPage<ReconciliationPayment>>;
  listRefunds(input: {
    cursor?: string;
    signal: AbortSignal;
  }): Promise<ReconciliationPage<unknown>>;
  listSubscriptions(input: {
    cursor?: string;
    signal: AbortSignal;
  }): Promise<ReconciliationPage<unknown>>;
  listEntitlements?: (input: {
    cursor?: string;
    signal: AbortSignal;
  }) => Promise<ReconciliationPage<unknown>>;
}

export interface ReconciliationRepairInput {
  provider: ReconciliationProvider;
  environment: ReconciliationEnvironment;
  providerResourceId: string;
  source: "reconciliation";
  provenance: { reason: string };
}

export interface ReconciliationRepairResult {
  status: "enqueued" | "duplicate" | "skipped";
}

export interface ReconciliationResultMetric {
  category: string;
  provider?: ReconciliationProvider;
  environment?: ReconciliationEnvironment;
  count: number;
}

export interface ReconciliationRunResult {
  repaired: number;
  reviewCases: number;
  duplicates: number;
  providerErrors: number;
  checkoutEnabled: boolean;
  metrics: ReconciliationResultMetric[];
}
