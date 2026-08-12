// Shared Pro-pricing display helpers, used by both the UpgradeModal and the
// standalone /upgrade page so the two can never drift. Display amounts come
// from the admin-configured pricing group on the public /mobile-control/config
// (the same source as the mobile paywall). The FALLBACK values
// only apply while that config loads or if it is unreachable; the amount
// actually charged is always resolved server-side at checkout.
//
// This module is the ONE price source for the web app's monetization surfaces:
//   • useProPricing()      — load state both surfaces render from
//   • PRO_PLANS            — the plan catalogue (labels/cadence/badges/copy)
// Nothing else may hardcode a Pro amount. A surface that cannot yet show the
// real price must render a loading state, never a guess (see PricingState).

import { useEffect, useState } from 'react';
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

// ─── Shared load state ───────────────────────────────────────────────────────

export interface PricingState {
  /** Admin pricing once resolved; null until then (or if the fetch failed). */
  pricing: RemotePricing | null;
  /** True while the config request is in flight — render a skeleton, no price. */
  loading: boolean;
  /**
   * Config was unreachable. We then show FALLBACK_PRICING, which is the same
   * pricing is null in this state; use `displayPricing`.
   */
  failed: boolean;
  /** Safe-to-render pricing: never a hardcoded per-surface guess. */
  displayPricing: RemotePricing;
}

/**
 * The single pricing hook for every monetization surface. Both the upgrade
 * modal and the /upgrade page call this, so a price can never differ between
 * them — and neither can render an amount before the shared source resolves.
 */
export function useProPricing(active: boolean = true): PricingState {
  const [pricing, setPricing] = useState<RemotePricing | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!active || pricing) return;
    let cancelled = false;
    setLoading(true);
    void loadRemotePricing()
      .then((remote) => {
        if (cancelled) return;
        if (remote) setPricing(remote);
        else setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, pricing]);

  return { pricing, loading, failed, displayPricing: pricing ?? FALLBACK_PRICING };
}

// ─── Plan catalogue (shared by the modal and the /upgrade page) ──────────────

export interface ProPlanMeta {
  plan: BillingInterval;
  /** Server-owned catalogue key. It intentionally does not encode a price. */
  productKey: string;
  /** Short label used by compact surfaces (the modal cards). */
  label: string;
  /** Long label used by the full page. */
  longLabel: string;
  cadence: string;
  /** Badge shown when no promo is running. */
  defaultBadge?: string;
  hint: string;
  /** Renewal policy is resolved by the billing API and confirmed before redirect. */
  renewalHint: string;
  /** The visually emphasised card. */
  highlighted: boolean;
}

/** Weekly is deliberately kept system-wide — weekly = 7 days of Pro. */
export const PRO_PLANS: ProPlanMeta[] = [
  {
    plan: 'weekly',
    productKey: 'pro_weekly_pass',
    label: 'Pro Weekly',
    longLabel: 'Weekly',
    cadence: 'per week',
    hint: 'Try Pro for a big week — perfect around a deadline.',
    renewalHint: 'The payment page will show whether this purchase renews or is one-time access.',
    highlighted: false,
  },
  {
    plan: 'monthly',
    productKey: 'pro_monthly_pass',
    label: 'Pro Monthly',
    longLabel: 'Monthly',
    cadence: 'per month',
    defaultBadge: 'Most popular',
    hint: 'Full access for the month.',
    renewalHint: 'The payment page will show whether this purchase renews or is one-time access.',
    highlighted: false,
  },
  {
    plan: 'yearly',
    productKey: 'pro_yearly_pass',
    label: 'Pro Yearly',
    longLabel: 'Yearly',
    cadence: 'per year',
    defaultBadge: 'Best value',
    hint: 'A full year of Pro at our best price.',
    renewalHint: 'The payment page will show whether this purchase renews or is one-time access.',
    highlighted: true,
  },
];

export const SEASON_PASS_PRODUCT_KEY = 'season_pass';

const CREDIT_PACK_PRODUCT_KEYS: Record<number, string> = {
  100: 'credits_100',
  250: 'credits_250',
  700: 'credits_700',
};

export function creditPackProductKey(credits: number): string | null {
  return CREDIT_PACK_PRODUCT_KEYS[credits] ?? null;
}

export const PAYMENT_RENEWAL_DISCLOSURE =
  'The secure payment page will show whether the selected payment method renews automatically or provides one-time access.';
