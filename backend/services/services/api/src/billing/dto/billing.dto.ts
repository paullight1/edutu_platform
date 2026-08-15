export type BillingInterval = "weekly" | "monthly" | "yearly";
export type SubscriptionTier = "none" | "lite" | "pro" | "scholar";

export interface CreateCheckoutDto {
  plan?: BillingInterval;
  feature?: string;
  credits?: number;
  returnTo?: string;
}

export interface BillingStatus {
  isPro: boolean;
  planTier: SubscriptionTier;
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
