export type BillingInterval = "weekly" | "monthly" | "yearly";
export type SubscriptionTier = "none" | "lite" | "pro" | "scholar";
export type NativeSubscriptionState =
  | "none"
  | "active"
  | "canceled"
  | "grace_period"
  | "account_hold"
  | "paused"
  | "expired"
  | "refunded"
  | "price_consent_required";

export interface NativeSubscriptionStatus {
  state: NativeSubscriptionState;
  tier: SubscriptionTier;
  cadence: BillingInterval | null;
  store: "APP_STORE" | "PLAY_STORE" | null;
  renewsAt: string | null;
  accessUntil: string | null;
  cancelAtPeriodEnd: boolean;
  scheduledChange: {
    tier: Exclude<SubscriptionTier, "none">;
    cadence: BillingInterval;
    effectiveAt: string;
  } | null;
  supportReference: string | null;
}

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
  nativeSubscription: NativeSubscriptionStatus;
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
