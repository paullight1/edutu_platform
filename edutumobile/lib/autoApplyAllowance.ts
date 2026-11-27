import type { SubscriptionTier } from './pricing';

export type AutoApplyAllowance = {
  monthlyLimit: number;
  used: number;
  resetAt: string;
  upgradeOptions: { tier: SubscriptionTier; monthlyLimit: number }[];
};

export function autoApplyUpgradeOptions(allowance?: AutoApplyAllowance | null) {
  if (!allowance || allowance.used < allowance.monthlyLimit || !Array.isArray(allowance.upgradeOptions)) return [];
  return allowance.upgradeOptions.filter(option => option && Number.isSafeInteger(option.monthlyLimit) &&
    option.monthlyLimit > Math.max(allowance.monthlyLimit, allowance.used));
}
