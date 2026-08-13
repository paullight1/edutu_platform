import { getApiBaseUrl } from '../lib/apiBaseUrl';

export type BillingInterval = 'weekly' | 'monthly' | 'yearly';
export type RenewalMode = 'recurring' | 'one_time';

export interface BillingStatus {
  isPro: boolean;
  proSince: string | null;
  proExpiresAt: string | null;
  credits: number;
  subscriptionStatus: string | null;
  entitlements: string[];
  featureAccess: Record<string, boolean>;
  transactions: BillingTransaction[];
}

/** Server-configured display metadata. None of these values are sent to checkout. */
export interface CreditProduct {
  productKey: string;
  creditQuantity: number;
  price: number;
  currency: string;
  label?: string;
  renewalMode: 'one_time';
  validityDays: null;
}

export interface BillingTransaction {
  id: string;
  provider: string;
  providerReference: string | null;
  type: string;
  amount: number;
  currency: string;
  status: string;
  description: string;
  createdAt: string | null;
}

export interface CheckoutResponse {
  intentId: string;
  checkoutUrl: string;
  expiresAt: string;
  /** Optional for compatibility while the checkout controller rolls out the richer response. */
  renewalMode?: RenewalMode;
  accessUntil?: string | null;
}

export class BillingRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BillingRequestError';
  }
}

export interface CreateCheckoutInput {
  /** Server-owned catalogue key; price, provider product, and fulfilment stay server-side. */
  productKey: string;
  returnSurface: 'web';
  /** One UUID generated for a user action and reused after a timeout retry. */
  idempotencyKey: string;
}

export type ManageDestination =
  | { kind: 'portal-session' }
  | { kind: 'external'; url: string }
  | { kind: 'none' };

const APP_STORE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';
const PLAY_STORE_SUBSCRIPTIONS_URL = 'https://play.google.com/store/account/subscriptions';
const BACHS_CHECKOUT_ORIGINS = new Set(['https://checkout.bachs.io']);
const activeCheckoutRequests = new Map<string, Promise<CheckoutResponse>>();

async function requestBilling<T>(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const apiBaseUrl = getApiBaseUrl('Billing API');
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const body = data && typeof data === 'object' ? data as Record<string, unknown> : {};
    const nestedError = body.error && typeof body.error === 'object'
      ? body.error as Record<string, unknown>
      : {};
    const code = typeof body.code === 'string'
      ? body.code
      : typeof nestedError.code === 'string'
        ? nestedError.code
        : response.status === 402
          ? 'credits_exhausted'
          : response.status === 503
            ? 'billing_unavailable'
            : 'billing_request_failed';
    const message = typeof body.message === 'string'
      ? body.message
      : typeof nestedError.message === 'string'
        ? nestedError.message
        : 'Billing request failed';
    throw new BillingRequestError(response.status, code, message);
  }

  return data as T;
}

export async function getBillingStatus(token: string): Promise<BillingStatus> {
  return requestBilling<BillingStatus>('/billing/status', token);
}

function isBillingCreditProduct(value: unknown): value is CreditProduct {
  if (!value || typeof value !== 'object') return false;
  const product = value as Record<string, unknown>;
  return typeof product.productKey === 'string' &&
    product.productKey.startsWith('api_credits_') &&
    Number.isSafeInteger(product.creditQuantity) &&
    Number(product.creditQuantity) > 0 &&
    typeof product.price === 'number' &&
    Number.isFinite(product.price) &&
    product.price > 0 &&
    typeof product.currency === 'string' &&
    /^[A-Z]{3}$/.test(product.currency) &&
    product.renewalMode === 'one_time' &&
    product.validityDays === null;
}

/**
 * Reads display metadata from the billing catalog that also resolves checkout.
 * The browser does not map quantities to product keys or fall back to the
 * general admin pricing config; all displayed values come from this response.
 */
export async function getCreditProducts(token: string): Promise<CreditProduct[]> {
  const data = await requestBilling<unknown>('/billing/catalog', token);
  const products = data && typeof data === 'object' && 'products' in data
    ? (data as { products?: unknown }).products
    : null;

  return Array.isArray(products)
    ? products.filter(isBillingCreditProduct).map((product) => ({
        ...product,
        currency: product.currency.toUpperCase(),
        label: typeof product.label === 'string' && product.label.trim()
          ? product.label.trim()
          : undefined,
      }))
    : [];
}

/** Bachs is opt-in until the server-side launch gate has passed. */
export function isBachsCheckoutEnabled(): boolean {
  return import.meta.env.VITE_BACHS_CHECKOUT_ENABLED === 'true';
}

export function validateBachsCheckoutUrl(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Billing returned an invalid checkout URL.');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Billing returned an invalid checkout URL.');
  }

  if (url.protocol !== 'https:' || url.username || url.password || !BACHS_CHECKOUT_ORIGINS.has(url.origin)) {
    throw new Error('Billing did not return a trusted Bachs checkout URL.');
  }

  return url.toString();
}

function validateCheckoutResponse(value: unknown): CheckoutResponse {
  if (!value || typeof value !== 'object') {
    throw new Error('Billing returned an invalid checkout response.');
  }

  const response = value as Record<string, unknown>;
  if (
    typeof response.intentId !== 'string' ||
    typeof response.expiresAt !== 'string' ||
    (response.renewalMode !== undefined &&
      response.renewalMode !== 'recurring' &&
      response.renewalMode !== 'one_time')
  ) {
    throw new Error('Billing returned an invalid checkout response.');
  }

  return {
    intentId: response.intentId,
    checkoutUrl: validateBachsCheckoutUrl(response.checkoutUrl),
    expiresAt: response.expiresAt,
    renewalMode: response.renewalMode,
    accessUntil: typeof response.accessUntil === 'string' ? response.accessUntil : null,
  };
}

/**
 * Starts an authenticated, server-owned checkout. No identity, email, price,
 * currency, promo, or destination arrives from the client or enters a URL.
 */
export function createCheckout(
  token: string,
  input: CreateCheckoutInput,
): Promise<CheckoutResponse> {
  if (!isBachsCheckoutEnabled()) {
    return Promise.reject(new Error('Payments are not ready yet. Please try again later.'));
  }

  const activeRequest = activeCheckoutRequests.get(input.idempotencyKey);
  if (activeRequest) return activeRequest;

  const request = requestBilling<unknown>('/billing/checkout', token, {
    method: 'POST',
    headers: { 'Idempotency-Key': input.idempotencyKey },
    body: JSON.stringify({
      productKey: input.productKey,
      returnSurface: input.returnSurface,
    }),
  }).then(validateCheckoutResponse);

  activeCheckoutRequests.set(input.idempotencyKey, request);
  void request
    .finally(() => activeCheckoutRequests.delete(input.idempotencyKey))
    .catch(() => undefined);
  return request;
}

/** Management is chosen from the provider, never a remotely configured URL. */
export function getManageDestination(provider: string | null | undefined): ManageDestination {
  switch (provider) {
    case 'bachs':
      return { kind: 'portal-session' };
    case 'revenuecat_app_store':
      return { kind: 'external', url: APP_STORE_SUBSCRIPTIONS_URL };
    case 'revenuecat_play_store':
      return { kind: 'external', url: PLAY_STORE_SUBSCRIPTIONS_URL };
    default:
      return { kind: 'none' };
  }
}
