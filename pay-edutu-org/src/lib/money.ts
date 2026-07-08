export type BillingPlan = 'monthly' | 'yearly';

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

/** Days of Pro granted per plan for one-time (non-recurring) charges. */
export function planDurationDays(plan: BillingPlan): number {
  return plan === 'yearly' ? 366 : 31;
}

export function addDays(from: Date, days: number): Date {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function isBillingPlan(value: unknown): value is BillingPlan {
  return value === 'monthly' || value === 'yearly';
}
