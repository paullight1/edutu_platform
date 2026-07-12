// ─── Admin-controlled subscription pricing ───────────────────────────────────
// Prices, currency and promos ("bonanza") are set by admins in the in-app
// Pricing & Promos screen (admin_settings.pricing) and served, read-only, inside
// GET /mobile-control/config. The paywall and pay.edutu.org read the same source
// so a price change happens in one place. This file holds ONLY public display
// data — never a payment secret (Paystack keys live on pay.edutu.org).

export interface PricingPromo {
  active: boolean;
  label: string;
  /** Optional promo override prices (major units). null → use the regular price. */
  weeklyPrice: number | null;
  monthlyPrice: number | null;
  yearlyPrice: number | null;
}

/** A purchasable credit top-up pack (admin-configured, displayed in the wallet). */
export interface CreditPack {
  credits: number;
  price: number;
  label?: string;
}

export interface PricingConfig {
  /** ISO-4217 code, e.g. 'NGN', 'USD', 'GHS'. */
  currency: string;
  /** Regular prices in major units (e.g. 9.99, not cents). */
  weeklyPrice: number;
  monthlyPrice: number;
  yearlyPrice: number;
  /** Hosted checkout + subscription-management origins. */
  checkoutBaseUrl: string;
  manageUrl: string;
  promo: PricingPromo;
  /** Optional credit top-up packs (admin-configured). */
  creditPacks?: CreditPack[];
}

export const DEFAULT_PRICING: PricingConfig = {
  currency: 'NGN',
  weeklyPrice: 2000,
  monthlyPrice: 6500,
  yearlyPrice: 60000,
  checkoutBaseUrl: 'https://pay.edutu.org',
  manageUrl: 'https://pay.edutu.org/account',
  promo: { active: false, label: '', weeklyPrice: null, monthlyPrice: null, yearlyPrice: null },
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  NGN: '₦', USD: '$', GHS: '₵', KES: 'KSh', ZAR: 'R',
  GBP: '£', EUR: '€', UGX: 'USh', TZS: 'TSh', RWF: 'FRw',
  INR: '₹', CAD: 'CA$', AUD: 'A$', XOF: 'CFA', XAF: 'CFA',
};

/** Format a price without relying on Intl (Hermes support varies across builds). */
export function formatMoney(amount: number, currency: string): string {
  const code = (currency || 'USD').toUpperCase();
  const symbol = CURRENCY_SYMBOLS[code] || `${code} `;
  // Whole numbers render without decimals (₦4,000, not ₦4,000.00); otherwise 2dp.
  const isWhole = Number.isInteger(amount);
  const formatted = isWhole
    ? Math.round(amount).toLocaleString('en-US')
    : amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${symbol}${formatted}`;
}

function toFiniteNumber(value: unknown): number | null {
  const n = typeof value === 'string' ? Number.parseFloat(value) : (value as number);
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
}

/** Defensive parse of the admin payload — any bad field falls back to a default. */
export function normalisePricing(payload: unknown): PricingConfig {
  if (!payload || typeof payload !== 'object') return { ...DEFAULT_PRICING };
  const r = payload as Record<string, any>;

  const weekly = toFiniteNumber(r.weeklyPrice);
  const monthly = toFiniteNumber(r.monthlyPrice);
  const yearly = toFiniteNumber(r.yearlyPrice);
  const promo = r.promo && typeof r.promo === 'object' ? r.promo : {};

  // The admin payload may also carry creditPacks, aiCosts, freeTier and
  // proFairUse — creditPacks is normalised below; the rest are server-side
  // billing knobs the app simply tolerates.
  const creditPacks: CreditPack[] = Array.isArray(r.creditPacks)
    ? r.creditPacks.reduce<CreditPack[]>((packs, pack: any) => {
        const credits = toFiniteNumber(pack?.credits);
        const price = toFiniteNumber(pack?.price);
        if (credits != null && price != null) {
          packs.push({ credits, price, label: typeof pack?.label === 'string' ? pack.label : undefined });
        }
        return packs;
      }, [])
    : [];

  // Currency and amounts must come from the SAME source. Blending the
  // server's currency with our baked-in NGN defaults rendered "$2,000".
  const currency =
    typeof r.currency === 'string' && r.currency.trim()
      ? r.currency.trim().toUpperCase()
      : DEFAULT_PRICING.currency;
  const hasAnyPrice = weekly != null || monthly != null || yearly != null;
  const sameCurrencyAsDefaults = currency === DEFAULT_PRICING.currency;

  const round2 = (value: number) => Math.round(value * 100) / 100;
  // Fill gaps in a foreign-currency payload from its own numbers, scaled by
  // our default weekly:monthly:yearly ratios — never from default amounts.
  const weeklyRatio = DEFAULT_PRICING.weeklyPrice / DEFAULT_PRICING.monthlyPrice;
  const yearlyRatio = DEFAULT_PRICING.yearlyPrice / DEFAULT_PRICING.monthlyPrice;
  const monthlyBase =
    monthly ?? (weekly != null ? weekly / weeklyRatio : yearly != null ? yearly / yearlyRatio : null);

  const resolvedCurrency = hasAnyPrice ? currency : DEFAULT_PRICING.currency;
  const fill = (value: number | null, fallback: number, derived: number | null): number => {
    if (value != null) return value;
    if (sameCurrencyAsDefaults || !hasAnyPrice) return fallback;
    return derived != null ? round2(derived) : fallback;
  };

  return {
    currency: resolvedCurrency,
    weeklyPrice: fill(weekly, DEFAULT_PRICING.weeklyPrice, monthlyBase != null ? monthlyBase * weeklyRatio : null),
    monthlyPrice: fill(monthly, DEFAULT_PRICING.monthlyPrice, monthlyBase),
    yearlyPrice: fill(yearly, DEFAULT_PRICING.yearlyPrice, monthlyBase != null ? monthlyBase * yearlyRatio : null),
    checkoutBaseUrl: typeof r.checkoutBaseUrl === 'string' && r.checkoutBaseUrl.trim()
      ? r.checkoutBaseUrl.trim().replace(/\/$/, '')
      : DEFAULT_PRICING.checkoutBaseUrl,
    manageUrl: typeof r.manageUrl === 'string' && r.manageUrl.trim()
      ? r.manageUrl.trim().replace(/\/$/, '')
      : DEFAULT_PRICING.manageUrl,
    promo: {
      active: promo.active === true,
      label: typeof promo.label === 'string' ? promo.label : '',
      weeklyPrice: toFiniteNumber(promo.weeklyPrice),
      monthlyPrice: toFiniteNumber(promo.monthlyPrice),
      yearlyPrice: toFiniteNumber(promo.yearlyPrice),
    },
    creditPacks,
  };
}

export type BillingPlan = 'weekly' | 'monthly' | 'yearly';

function regularPrice(pricing: PricingConfig, plan: BillingPlan): number {
  if (plan === 'weekly') return pricing.weeklyPrice;
  return plan === 'monthly' ? pricing.monthlyPrice : pricing.yearlyPrice;
}

/** The price actually charged for a plan (promo override wins when active). */
export function effectivePrice(pricing: PricingConfig, plan: BillingPlan): number {
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

/** True when a promo is active AND actually discounts this plan. */
export function hasPromoDiscount(pricing: PricingConfig, plan: BillingPlan): boolean {
  if (!pricing.promo.active) return false;
  return effectivePrice(pricing, plan) < regularPrice(pricing, plan);
}

/**
 * Build the pay.edutu.org hosted-checkout URL with the signed-in user's context.
 * pay.edutu.org maps this to a Paystack transaction; its webhook grants the
 * entitlement server-side (the client can never self-grant Pro).
 */
export function buildCheckoutUrl(
  pricing: PricingConfig,
  params: { uid: string; email?: string | null; plan: BillingPlan; platform?: string; ref?: string },
): string {
  const q = new URLSearchParams({
    uid: params.uid,
    plan: params.plan,
    currency: pricing.currency,
    amount: String(effectivePrice(pricing, params.plan)),
    ref: params.ref || 'edutu-mobile',
  });
  if (params.email) q.set('email', params.email);
  if (params.platform) q.set('platform', params.platform);
  if (pricing.promo.active) q.set('promo', pricing.promo.label || 'promo');
  return `${pricing.checkoutBaseUrl}/checkout?${q.toString()}`;
}

export function buildManageUrl(pricing: PricingConfig, uid: string): string {
  const q = new URLSearchParams({ uid });
  return `${pricing.manageUrl}?${q.toString()}`;
}
