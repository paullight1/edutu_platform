// Shared Pro-pricing display helpers, used by both the UpgradeModal and the
// standalone /upgrade page so the two can never drift. Display amounts come
// from the admin-configured pricing group on the public /mobile-control/config
// (the same source as the mobile paywall + pay.edutu.org). The FALLBACK values
// only apply while that config loads or if it is unreachable; the amount
// actually charged is always resolved server-side at checkout.
//
// This module is the ONE price source for the web app's monetization surfaces:
//   • useProPricing()      — load state both surfaces render from
//   • PRO_PLANS            — the plan catalogue (labels/cadence/badges/copy)
//   • buildProCheckoutUrl()— the pay.edutu.org hosted-checkout link
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
   * fallback pay.edutu.org uses when it cannot read the config either — so the
   * two still agree. `pricing` is null in this state; use `displayPricing`.
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
  /** Short label used by compact surfaces (the modal cards). */
  label: string;
  /** Long label used by the full page. */
  longLabel: string;
  cadence: string;
  /** Badge shown when no promo is running. */
  defaultBadge?: string;
  hint: string;
  /** The visually emphasised card. */
  highlighted: boolean;
}

/** Weekly is deliberately kept system-wide — weekly = 7 days of Pro. */
export const PRO_PLANS: ProPlanMeta[] = [
  {
    plan: 'weekly',
    label: 'Pro Weekly',
    longLabel: 'Weekly',
    cadence: 'per week',
    hint: 'Try Pro for a big week — perfect around a deadline.',
    highlighted: false,
  },
  {
    plan: 'monthly',
    label: 'Pro Monthly',
    longLabel: 'Monthly',
    cadence: 'per month',
    defaultBadge: 'Most popular',
    hint: 'Full access, month to month. Cancel anytime.',
    highlighted: false,
  },
  {
    plan: 'yearly',
    label: 'Pro Yearly',
    longLabel: 'Yearly',
    cadence: 'per year',
    defaultBadge: 'Best value',
    hint: 'A full year of Pro at our best price.',
    highlighted: true,
  },
];

// ─── pay.edutu.org hosted checkout ───────────────────────────────────────────

/**
 * Canonical WEB checkout origin. pay.edutu.org validates the price server-side
 * against the same admin config we read here, mints the Paystack transaction
 * and grants the entitlement from its webhook — the client can never self-grant
 * Pro. The backend's own POST /billing/checkout is deprecated for new web
 * subscription checkouts (see services/billing.ts).
 */
export const PRO_CHECKOUT_BASE_URL: string = (
  (import.meta.env?.VITE_PAY_CHECKOUT_URL as string | undefined) || 'https://pay.edutu.org'
).replace(/\/$/, '');

function checkoutBaseUrl(pricing: RemotePricing): string {
  // The admin config may ship its own checkout origin (the mobile PricingConfig
  // carries `checkoutBaseUrl`). Honour it when present so a migration of the
  // hosted checkout does not need a web release.
  const remote = (pricing as { checkoutBaseUrl?: unknown }).checkoutBaseUrl;
  if (typeof remote === 'string' && remote.trim()) return remote.trim().replace(/\/$/, '');
  return PRO_CHECKOUT_BASE_URL;
}

/**
 * Build the pay.edutu.org hosted-checkout URL for a Pro plan. Mirrors the
 * mobile contract in edutumobile/lib/pricing.ts `buildCheckoutUrl()`:
 * `uid, plan, currency, amount, ref` always; `email`, `platform` and `promo`
 * when known. `currency`/`amount` are DISPLAY ONLY — pay.edutu.org re-resolves
 * the charged amount from the admin config and ignores what we send.
 */
export function buildProCheckoutUrl(params: {
  uid: string;
  plan: BillingInterval;
  email?: string | null;
  pricing?: RemotePricing | null;
  ref?: string;
  platform?: string;
}): string {
  const pricing = params.pricing ?? FALLBACK_PRICING;
  const query = new URLSearchParams({
    uid: params.uid,
    plan: params.plan,
    currency: pricing.currency,
    amount: String(effectivePrice(pricing, params.plan)),
    ref: params.ref || 'edutu-web',
  });
  if (params.email) query.set('email', params.email);
  query.set('platform', params.platform || 'web');
  if (pricing.promo?.active) query.set('promo', pricing.promo.label || 'promo');
  return `${checkoutBaseUrl(pricing)}/checkout?${query.toString()}`;
}
