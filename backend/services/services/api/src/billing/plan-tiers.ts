import { API_CREDIT_PRODUCT_QUANTITIES } from "./types/billing-checkout.types";

export type SubscriptionTier = "lite" | "pro" | "scholar";

const SUBSCRIPTION_PRODUCT_TIERS: Readonly<Record<string, SubscriptionTier>> = {
  lite_weekly_pass: "lite",
  lite_monthly_pass: "lite",
  lite_yearly_pass: "lite",
  pro_weekly_pass: "pro",
  pro_monthly_pass: "pro",
  pro_yearly_pass: "pro",
  scholar_weekly_pass: "scholar",
  scholar_monthly_pass: "scholar",
  scholar_yearly_pass: "scholar",
};

export function isApiCreditProductKey(productKey: string): boolean {
  return Object.prototype.hasOwnProperty.call(
    API_CREDIT_PRODUCT_QUANTITIES,
    productKey,
  );
}

export function isSubscriptionProductKey(productKey: string): boolean {
  return Object.prototype.hasOwnProperty.call(
    SUBSCRIPTION_PRODUCT_TIERS,
    productKey,
  );
}

export function getSubscriptionTierForProductKey(
  productKey: string,
): SubscriptionTier | null {
  return SUBSCRIPTION_PRODUCT_TIERS[productKey] ?? null;
}

export function getSubscriptionProductKey(
  tier: SubscriptionTier,
  interval: "weekly" | "monthly" | "yearly",
): string {
  return `${tier}_${interval}_pass`;
}
