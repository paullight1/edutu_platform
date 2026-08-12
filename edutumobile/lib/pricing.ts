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

/**
 * One-off "Season Pass": a single purchase that grants Pro for a fixed number of
 * days (matching a seasonal application cycle). Admin-configured; `enabled` is
 * false until the admin turns it on AND sets a positive price, so an absent /
 * partial config always reads as "not for sale".
 */
export interface SeasonPass {
  enabled: boolean;
  price: number;
  durationDays: number;
  label: string;
}

export interface PricingConfig {
  /** ISO-4217 code, e.g. 'NGN', 'USD', 'GHS'. */
  currency: string;
  /** Regular prices in major units (e.g. 9.99, not cents). */
  weeklyPrice: number;
  monthlyPrice: number;
  yearlyPrice: number;
  promo: PricingPromo;
  /** Optional credit top-up packs (admin-configured). */
  creditPacks?: CreditPack[];
  /** One-off Pro pass; disabled until the admin turns it on. */
  seasonPass: SeasonPass;
}

export const DEFAULT_PRICING: PricingConfig = {
  currency: 'NGN',
  weeklyPrice: 2000,
  monthlyPrice: 6500,
  yearlyPrice: 60000,
  promo: { active: false, label: '', weeklyPrice: null, monthlyPrice: null, yearlyPrice: null },
  seasonPass: { enabled: false, price: 15000, durationDays: 90, label: 'Season Pass' },
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
  const season = r.seasonPass && typeof r.seasonPass === 'object' ? r.seasonPass : {};

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
    promo: {
      active: promo.active === true,
      label: typeof promo.label === 'string' ? promo.label : '',
      weeklyPrice: toFiniteNumber(promo.weeklyPrice),
      monthlyPrice: toFiniteNumber(promo.monthlyPrice),
      yearlyPrice: toFiniteNumber(promo.yearlyPrice),
    },
    creditPacks,
    seasonPass: {
      // Only sellable when the admin explicitly enabled it AND set a positive
      // price — mirrors pay.edutu.org's fetchPricing so both surfaces agree.
      enabled: season.enabled === true && (toFiniteNumber(season.price) ?? 0) > 0,
      price: toFiniteNumber(season.price) ?? DEFAULT_PRICING.seasonPass.price,
      durationDays: (() => {
        const days = toFiniteNumber(season.durationDays);
        return days != null && Number.isInteger(days) && days >= 1 ? days : DEFAULT_PRICING.seasonPass.durationDays;
      })(),
      label:
        typeof season.label === 'string' && season.label.trim()
          ? season.label.trim()
          : DEFAULT_PRICING.seasonPass.label,
    },
  };
}

export type BillingPlan = 'weekly' | 'monthly' | 'yearly';

/** A checkout target: a recurring plan or the one-off season pass. */
export type CheckoutPlan = BillingPlan | 'season';

// ─── Admin-controlled paywall design + copy ──────────────────────────────────
// Served alongside pricing in GET /mobile-control/config (admin_settings.
// paywall), so admins can re-skin the paywall — headline, subtitle, badges,
// CTA, accent color, hero style — without a store release. Every empty field
// falls back to the app's built-in translated copy.

export type PaywallHeroStyle = 'collage' | 'gradient';

export interface PaywallContent {
  /** Hero headline line 1 (rendered in the accent color). */
  heroLine1: string;
  /** Hero headline line 2 (rendered white). */
  heroLine2: string;
  subtitle: string;
  /** Label on the big subscribe button. */
  ctaLabel: string;
  /** Reassurance line under the CTA (web-checkout flow only). */
  secureNote: string;
  /** Merchandising chip above each plan card. */
  badgeWeekly: string;
  badgeMonthly: string;
  badgeYearly: string;
  /** Optional benefit bullets; empty = no bullet list. */
  features: string[];
  /** #RRGGBB accent for highlights; empty = app default. */
  accentColor: string;
  /** 'collage' = poster mosaic hero; 'gradient' = plain gradient backdrop. */
  heroStyle: PaywallHeroStyle;
  /** Plan card pre-selected when the paywall opens. */
  defaultPlan: BillingPlan;
}

export const DEFAULT_PAYWALL_CONTENT: PaywallContent = {
  heroLine1: '',
  heroLine2: '',
  subtitle: '',
  ctaLabel: '',
  secureNote: '',
  badgeWeekly: '',
  badgeMonthly: '',
  badgeYearly: '',
  features: [],
  accentColor: '',
  heroStyle: 'collage',
  defaultPlan: 'weekly',
};

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

/** Defensive parse of the admin payload — any bad field falls back to a default. */
export function normalisePaywallContent(payload: unknown): PaywallContent {
  if (!payload || typeof payload !== 'object') return { ...DEFAULT_PAYWALL_CONTENT };
  const r = payload as Record<string, unknown>;

  const accent = cleanText(r.accentColor, 7);
  const plan = r.defaultPlan;

  return {
    heroLine1: cleanText(r.heroLine1, 80),
    heroLine2: cleanText(r.heroLine2, 80),
    subtitle: cleanText(r.subtitle, 240),
    ctaLabel: cleanText(r.ctaLabel, 60),
    secureNote: cleanText(r.secureNote, 300),
    badgeWeekly: cleanText(r.badgeWeekly, 30),
    badgeMonthly: cleanText(r.badgeMonthly, 30),
    badgeYearly: cleanText(r.badgeYearly, 30),
    features: Array.isArray(r.features)
      ? r.features
          .map((feature) => cleanText(feature, 80))
          .filter(Boolean)
          .slice(0, 6)
      : [],
    accentColor: /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : '',
    heroStyle: r.heroStyle === 'gradient' ? 'gradient' : 'collage',
    // All three cadences are live end-to-end (pay.edutu.org's isBillingPlan
    // accepts 'weekly' and planDurationDays grants it 7 days), so 'weekly' is a
    // real plan here and not just the "unrecognised value" bucket — it matches
    // DEFAULT_PAYWALL_CONTENT.defaultPlan and the paywall's initial selection.
    defaultPlan: plan === 'monthly' || plan === 'yearly' ? plan : 'weekly',
  };
}

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
