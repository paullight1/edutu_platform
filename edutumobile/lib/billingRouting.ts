import type { BillingPlan, CheckoutPlan, SubscriptionTier } from './pricing';

export type PaymentRail = 'revenuecat' | 'bachs';
export type RuntimePlatform = 'ios' | 'android' | 'web' | string;

type RevenueCatPackageLike = {
  identifier?: string;
  product?: { identifier?: string } | null;
};

export type BachsBillingConfig = {
  enabled: boolean;
  apiBaseUrl: string;
};

type BillingResponse = Pick<Response, 'ok' | 'json'>;
type BillingRequest = (url: string, init: RequestInit) => Promise<BillingResponse>;

const BACHS_CHECKOUT_ORIGIN = 'https://checkout.bachs.io';
const BACHS_PORTAL_ORIGIN = 'https://portal.bachs.io';

const NATIVE_PRODUCT_IDS: Record<SubscriptionTier, Record<BillingPlan, string>> = {
  lite: {
    weekly: 'lite_weekly',
    monthly: 'lite_monthly',
    yearly: 'lite_yearly',
  },
  pro: {
    weekly: 'pro_weekly',
    monthly: 'pro_monthly',
    yearly: 'pro_yearly',
  },
  scholar: {
    weekly: 'scholar_weekly',
    monthly: 'scholar_monthly',
    yearly: 'scholar_yearly',
  },
};

const WEB_PRODUCT_KEYS: Record<SubscriptionTier, Record<CheckoutPlan, string>> = {
  lite: {
    weekly: 'lite_weekly_pass',
    monthly: 'lite_monthly_pass',
    yearly: 'lite_yearly_pass',
    season: 'season_pass',
  },
  pro: {
    weekly: 'pro_weekly_pass',
    monthly: 'pro_monthly_pass',
    yearly: 'pro_yearly_pass',
    season: 'season_pass',
  },
  scholar: {
    weekly: 'scholar_weekly_pass',
    monthly: 'scholar_monthly_pass',
    yearly: 'scholar_yearly_pass',
    season: 'season_pass',
  },
};

const WEB_CREDIT_PRODUCT_KEYS = new Set([
  'credits_small',
  'credits_medium',
  'credits_large',
  'credits_xlarge',
]);

export function getPaymentRail(platform: RuntimePlatform): PaymentRail {
  return platform === 'ios' || platform === 'android' ? 'revenuecat' : 'bachs';
}

export function visibleBillingPlans(
  platform: RuntimePlatform,
  packages: RevenueCatPackageLike[],
): BillingPlan[] {
  const plans: BillingPlan[] = ['monthly', 'yearly'];
  if (getPaymentRail(platform) === 'bachs' || nativePackageForPlan('weekly', packages)) {
    plans.splice(1, 0, 'weekly');
  }
  return plans;
}

export function nativePackageForPlan<T extends RevenueCatPackageLike>(
  plan: BillingPlan,
  packages: T[],
  tier: SubscriptionTier = 'pro',
): T | undefined {
  const productId = NATIVE_PRODUCT_IDS[tier][plan];
  return packages.find((pkg) => pkg.product?.identifier === productId);
}

export function webProductKeyForPlan(
  plan: CheckoutPlan,
  tier: SubscriptionTier = 'pro',
): string {
  return WEB_PRODUCT_KEYS[tier][plan];
}

export function webProductKeyForCredit(productId: string): string {
  if (!WEB_CREDIT_PRODUCT_KEYS.has(productId)) {
    throw new Error('Unknown credit product');
  }
  return productId;
}

export function isBachsCheckoutEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.EXPO_PUBLIC_BACHS_CHECKOUT_ENABLED === 'true';
}

export function getBachsBillingConfig(): BachsBillingConfig {
  return {
    enabled: isBachsCheckoutEnabled(),
    apiBaseUrl: (process.env.EXPO_PUBLIC_API_URL || 'https://edutu-platform.onrender.com').replace(/\/$/, ''),
  };
}

function assertReady(config: BachsBillingConfig, accessToken: string): void {
  if (!config.enabled) throw new Error('Payments are not ready');
  if (!accessToken) throw new Error('Sign in is required to manage payments');
}

function assertApprovedBachsUrl(value: unknown, origin: string, label: string): string {
  if (typeof value !== 'string') throw new Error(`Missing approved Bachs ${label} URL`);

  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.origin !== origin ||
      url.username ||
      url.password
    ) {
      throw new Error('untrusted URL');
    }
    return url.toString();
  } catch {
    throw new Error(`Missing approved Bachs ${label} URL`);
  }
}

async function parseJson(response: BillingResponse): Promise<Record<string, unknown>> {
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || typeof body !== 'object') {
    throw new Error('Payments are temporarily unavailable');
  }
  return body as Record<string, unknown>;
}

export function createCheckoutIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new Error('Secure checkout is unavailable in this browser');
  }
  return globalThis.crypto.randomUUID();
}

export async function requestBachsCheckout({
  accessToken,
  productKey,
  idempotencyKey,
  config = getBachsBillingConfig(),
  request = fetch,
}: {
  accessToken: string;
  productKey: string;
  idempotencyKey: string;
  config?: BachsBillingConfig;
  request?: BillingRequest;
}): Promise<{ checkoutUrl: string; intentId: string; expiresAt: string }> {
  assertReady(config, accessToken);
  const response = await request(`${config.apiBaseUrl}/billing/checkout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({ productKey, returnSurface: 'web' }),
  });
  const body = await parseJson(response);

  if (typeof body.intentId !== 'string' || typeof body.expiresAt !== 'string') {
    throw new Error('Invalid checkout response');
  }

  return {
    checkoutUrl: assertApprovedBachsUrl(body.checkoutUrl, BACHS_CHECKOUT_ORIGIN, 'checkout'),
    intentId: body.intentId,
    expiresAt: body.expiresAt,
  };
}

export async function requestBachsPortalSession({
  accessToken,
  config = getBachsBillingConfig(),
  request = fetch,
}: {
  accessToken: string;
  config?: BachsBillingConfig;
  request?: BillingRequest;
}): Promise<string> {
  assertReady(config, accessToken);
  const response = await request(`${config.apiBaseUrl}/billing/portal-session`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  const body = await parseJson(response);
  return assertApprovedBachsUrl(body.url, BACHS_PORTAL_ORIGIN, 'portal');
}
