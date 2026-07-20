// 'season' is a ONE-OFF purchase (no Paystack plan code) that grants Pro until a
// fixed date; its duration is admin-configured (pricing.seasonPass.durationDays),
// so it is never derived from planDurationDays below.
export type BillingPlan = 'monthly' | 'yearly' | 'season';

const CURRENCY_SYMBOLS: Record<string, string> = {
  NGN: '₦', USD: '$', GHS: '₵', KES: 'KSh', ZAR: 'R', GBP: '£', EUR: '€',
};

export function formatMoney(amountMajor: number, currency: string): string {
  const code = (currency || 'USD').toUpperCase();
  const symbol = CURRENCY_SYMBOLS[code] || `${code} `;
  const isWhole = Number.isInteger(amountMajor);
  const body = isWhole
    ? Math.round(amountMajor).toLocaleString('en-US')
    : amountMajor.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${symbol}${body}`;
}

/** Paystack charges in the minor unit (kobo/pesewa/cents) as an integer. */
export function toMinorUnits(amountMajor: number): number {
  return Math.round(amountMajor * 100);
}

/**
 * Days of Pro granted per plan for one-time (non-recurring) charges.
 * NOTE: grant sites pass an admin-configured `durationDays` (not `expiresAt`) for
 * season, and `grantPro` extends from max(current active expiry, now) using that
 * duration — so the 90 here is a rarely-reachable, type-safe fallback that keeps
 * this helper total over the union rather than the value actually used for season.
 */
export function planDurationDays(plan: BillingPlan): number {
  if (plan === 'yearly') return 366;
  if (plan === 'season') return 90;
  return 31;
}

export function addDays(from: Date, days: number): Date {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function isBillingPlan(value: unknown): value is BillingPlan {
  return value === 'monthly' || value === 'yearly' || value === 'season';
}
