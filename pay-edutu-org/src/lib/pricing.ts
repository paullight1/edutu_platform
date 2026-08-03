import { config } from './env';
import type { BillingPlan } from './money';

// The admin sets prices/currency/promos inside the Edutu app; they are served
// (read-only) on GET /mobile-control/config. We fetch the SAME source so the
// amount we charge always equals what the user saw on the paywall — the amount
// in the checkout query string is display-only and never trusted for charging.

export interface ResolvedPricing {
  currency: string;
  weeklyPrice: number;
  monthlyPrice: number;
  yearlyPrice: number;
  promo: {
    active: boolean;
    label: string;
    weeklyPrice: number | null;
    monthlyPrice: number | null;
    yearlyPrice: number | null;
  };
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number.parseFloat(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
}

function fallbackPricing(): ResolvedPricing {
  return {
    currency: config.fallbackCurrency(),
    weeklyPrice: config.fallbackWeekly(),
    monthlyPrice: config.fallbackMonthly(),
    yearlyPrice: config.fallbackYearly(),
    promo: { active: false, label: '', weeklyPrice: null, monthlyPrice: null, yearlyPrice: null },
  };
}

export async function fetchPricing(): Promise<ResolvedPricing> {
  try {
    const res = await fetch(`${config.edutuApiUrl()}/mobile-control/config`, {
      // Never cache prices for long — an admin change must take effect quickly.
      next: { revalidate: 60 },
    });
    if (!res.ok) return fallbackPricing();
    const json = (await res.json()) as { pricing?: Record<string, any> };
    const p = json.pricing;
    if (!p) return fallbackPricing();

    const fb = fallbackPricing();
    const promo = p.promo && typeof p.promo === 'object' ? p.promo : {};
    return {
      currency: typeof p.currency === 'string' && p.currency.trim() ? p.currency.trim().toUpperCase() : fb.currency,
      weeklyPrice: num(p.weeklyPrice) ?? fb.weeklyPrice,
      monthlyPrice: num(p.monthlyPrice) ?? fb.monthlyPrice,
      yearlyPrice: num(p.yearlyPrice) ?? fb.yearlyPrice,
      promo: {
        active: promo.active === true,
        label: typeof promo.label === 'string' ? promo.label : '',
        weeklyPrice: num(promo.weeklyPrice),
        monthlyPrice: num(promo.monthlyPrice),
        yearlyPrice: num(promo.yearlyPrice),
      },
    };
  } catch {
    return fallbackPricing();
  }
}

function regularPrice(pricing: ResolvedPricing, plan: BillingPlan): number {
  if (plan === 'weekly') return pricing.weeklyPrice;
  return plan === 'monthly' ? pricing.monthlyPrice : pricing.yearlyPrice;
}

/** Server-authoritative price actually charged for a plan (promo wins). */
export function effectivePrice(pricing: ResolvedPricing, plan: BillingPlan): number {
  const regular = regularPrice(pricing, plan);
  if (!pricing.promo.active) return regular;
  const override =
    plan === 'weekly'
      ? pricing.promo.weeklyPrice
      : plan === 'monthly'
        ? pricing.promo.monthlyPrice
        : pricing.promo.yearlyPrice;
  return override != null ? override : regular;
}
