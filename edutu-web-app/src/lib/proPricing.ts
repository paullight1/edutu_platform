// Shared Pro-pricing display helpers, used by both the UpgradeModal and the
// standalone /upgrade page so the two can never drift. Display amounts come
// from the admin-configured pricing group on the public /mobile-control/config
// (the same source as the mobile paywall + pay.edutu.org). The FALLBACK values
// only apply while that config loads or if it is unreachable; the amount
// actually charged is always resolved server-side at checkout.

import { fetchMobileControlConfig, type RemotePricing } from '../services/mobileControl';
import type { BillingInterval } from '../services/billing';

export const FALLBACK_PRICING: RemotePricing = {
  currency: 'NGN',
  weeklyPrice: 2000,
  monthlyPrice: 6500,
  yearlyPrice: 60000,
};

export const FALLBACK_CREDIT_PACKS: Array<{ credits: number; price: number }> = [
  { credits: 100, price: 1500 },
  { credits: 250, price: 3000 },
  { credits: 700, price: 7000 },
];

export const CURRENCY_SYMBOLS: Record<string, string> = {
  NGN: '₦', USD: '$', GHS: '₵', KES: 'KSh', ZAR: 'R',
  GBP: '£', EUR: '€', UGX: 'USh', TZS: 'TSh', RWF: 'FRw',
};

export function formatMoney(amount: number, currency: string): string {
  const code = (currency || 'NGN').toUpperCase();
  const symbol = CURRENCY_SYMBOLS[code] || `${code} `;
  const formatted = Number.isInteger(amount)
    ? amount.toLocaleString('en-US')
    : amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${symbol}${formatted}`;
}

/** The price actually charged for a plan (an active promo override wins). */
export function effectivePrice(pricing: RemotePricing, plan: BillingInterval): number {
  const regular =
    plan === 'weekly' ? pricing.weeklyPrice : plan === 'monthly' ? pricing.monthlyPrice : pricing.yearlyPrice;
  if (!pricing.promo?.active) return regular;
  const override =
    plan === 'weekly'
      ? pricing.promo.weeklyPrice
      : plan === 'monthly'
        ? pricing.promo.monthlyPrice
        : pricing.promo.yearlyPrice;
  return typeof override === 'number' && override >= 0 ? override : regular;
}

// One fetch shared across the whole session — the modal can open repeatedly and
// the /upgrade page mounts on its own, but they resolve the same cached promise.
let pricingPromise: Promise<RemotePricing | null> | null = null;

export function loadRemotePricing(): Promise<RemotePricing | null> {
  if (!pricingPromise) {
    pricingPromise = fetchMobileControlConfig()
      .then((config) => {
        const pricing = config?.pricing;
        return pricing && typeof pricing.monthlyPrice === 'number' ? pricing : null;
      })
      .catch(() => {
        pricingPromise = null; // retry on the next call
        return null;
      });
  }
  return pricingPromise;
}
