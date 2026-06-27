export type BillingInterval = "monthly" | "yearly";

export interface CreateCheckoutDto {
  plan?: BillingInterval;
  feature?: string;
  credits?: number;
  returnTo?: string;
}

export interface BillingStatus {
  isPro: boolean;
  proSince: string | null;
  proExpiresAt: string | null;
  credits: number;
  subscriptionStatus: string | null;
  entitlements: string[];
  featureAccess: Record<string, boolean>;
  transactions: BillingTransactionSummary[];
}

export interface BillingTransactionSummary {
  id: string;
  provider: string;
  providerReference: string | null;
  type: string;
  amount: number;
  currency: string;
  status: string;
  description: string;
  createdAt: string | null;
}
