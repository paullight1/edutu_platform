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
  renewalMode: RenewalMode;
  accessUntil?: string | null;
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
    throw new Error(data?.message || 'Billing request failed');
  }

  return data as T;
}

export async function getBillingStatus(token: string): Promise<BillingStatus> {
  return requestBilling<BillingStatus>('/billing/status', token);
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
    (response.renewalMode !== 'recurring' && response.renewalMode !== 'one_time')
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
