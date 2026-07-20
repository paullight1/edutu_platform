import { config } from './env';
import type { BillingPlan } from './money';

// The admin sets prices/currency/promos inside the Edutu app; they are served
// (read-only) on GET /mobile-control/config. We fetch the SAME source so the
// amount we charge always equals what the user saw on the paywall — the amount
// in the checkout query string is display-only and never trusted for charging.

export interface SeasonPass {
  /** When false, the checkout route rejects `plan=season` (never mints a charge). */
  enabled: boolean;
  price: number;
  durationDays: number;
  label: string;
}

export interface ResolvedPricing {
  currency: string;
  monthlyPrice: number;
  yearlyPrice: number;
  promo: { active: boolean; label: string; monthlyPrice: number | null; yearlyPrice: number | null };
  /** One-off pass; absent on older API versions → treated as disabled. */
  seasonPass: SeasonPass;
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number.parseFloat(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
}

// Duration fallback when the admin config can't be read — mirrors the backend
// PricingSettingsSchema default (durationDays 90) so grants stay sane offline.
const SEASON_FALLBACK_DAYS = 90;

function fallbackPricing(): ResolvedPricing {
  return {
    currency: config.fallbackCurrency(),
    monthlyPrice: config.fallbackMonthly(),
    yearlyPrice: config.fallbackYearly(),
    promo: { active: false, label: '', monthlyPrice: null, yearlyPrice: null },
    // Fail safe: unknown/absent config ⇒ the pass is not for sale.
    seasonPass: { enabled: false, price: 0, durationDays: SEASON_FALLBACK_DAYS, label: 'Season Pass' },
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
    const sp = p.seasonPass && typeof p.seasonPass === 'object' ? p.seasonPass : {};
    return {
      currency: typeof p.currency === 'string' && p.currency.trim() ? p.currency.trim().toUpperCase() : fb.currency,
      monthlyPrice: num(p.monthlyPrice) ?? fb.monthlyPrice,
      yearlyPrice: num(p.yearlyPrice) ?? fb.yearlyPrice,
      promo: {
        active: promo.active === true,
        label: typeof promo.label === 'string' ? promo.label : '',
        monthlyPrice: num(promo.monthlyPrice),
        yearlyPrice: num(promo.yearlyPrice),
      },
      seasonPass: {
        // Only sellable when the admin explicitly enabled it AND set a positive price.
        enabled: sp.enabled === true && (num(sp.price) ?? 0) > 0,
        price: num(sp.price) ?? fb.seasonPass.price,
        durationDays: (() => {
          const d = num(sp.durationDays);
          return d != null && Number.isInteger(d) && d >= 1 ? d : fb.seasonPass.durationDays;
        })(),
        label: typeof sp.label === 'string' && sp.label.trim() ? sp.label : fb.seasonPass.label,
      },
    };
  } catch {
    return fallbackPricing();
  }
}

/** Server-authoritative price actually charged for a plan (promo wins). */
export function effectivePrice(pricing: ResolvedPricing, plan: BillingPlan): number {
  const regular = plan === 'monthly' ? pricing.monthlyPrice : pricing.yearlyPrice;
  if (!pricing.promo.active) return regular;
  const override = plan === 'monthly' ? pricing.promo.monthlyPrice : pricing.promo.yearlyPrice;
  return override != null ? override : regular;
}
