export type BillingInterval = 'monthly' | 'yearly';

export interface CreateCheckoutDto {
  plan?: BillingInterval;
  feature?: string;
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
}
