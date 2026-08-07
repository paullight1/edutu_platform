export type BillingInterval = 'weekly' | 'monthly' | 'yearly';

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

import { getApiBaseUrl } from '../lib/apiBaseUrl';
import { buildProCheckoutUrl } from '../lib/proPricing';
import type { RemotePricing } from './mobileControl';

export interface CheckoutResponse {
  provider: string;
  configured: boolean;
  message?: string;
  reference?: string;
  authorizationUrl?: string;
  accessCode?: string;
}

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

export interface CreateCheckoutInput {
  plan?: BillingInterval;
  feature?: string | null;
  credits?: number | null;
  returnTo?: string | null;
  /**
   * Clerk user id. REQUIRED for the pay.edutu.org plan path — the hosted
   * checkout puts it in Paystack metadata and its webhook grants the
   * entitlement against it. Ignored on the credit-pack path (the backend reads
   * the identity off the bearer token instead).
   */
  uid?: string | null;
  /** Buyer email — Paystack requires one; without it no receipt can be sent. */
  email?: string | null;
  /** Admin pricing snapshot for display params only (amount is re-resolved). */
  pricing?: RemotePricing | null;
}

/**
 * Start a checkout.
 *
 * ─── ROUTING SPLIT (deliberate — do not "unify" this) ────────────────────────
 * PRO PLANS (`plan: weekly|monthly|yearly`) → pay.edutu.org hosted GET /checkout.
 *   pay.edutu.org is the canonical web checkout: it re-resolves the price from
 *   the admin config server-side, dedupes references so a double-tap cannot
 *   double-charge, and grants `billing_entitlements` from its Paystack webhook.
 *   No network call happens here — we just hand the browser a URL, so this path
 *   resolves synchronously with `authorizationUrl` set.
 *
 * CREDIT TOP-UPS (`feature: 'credits'` / any `credits` amount) → the backend's
 *   POST /billing/checkout, unchanged. pay.edutu.org's /checkout ONLY accepts a
 *   subscription plan (`isBillingPlan()` rejects everything else and 303s to an
 *   error page), so routing credit packs there would break every top-up. When
 *   pay.edutu.org learns to sell credit packs, move this arm over too — until
 *   then the backend Paystack checkout stays alive for credits (and for the
 *   in-flight webhooks of subscriptions bought before this change).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Both arms return the same `CheckoutResponse` shape, so callers keep their
 * existing `configured === false` / missing-`authorizationUrl` degradation.
 */
export async function createCheckout(
  token: string,
  input: CreateCheckoutInput,
): Promise<CheckoutResponse> {
  const isCreditTopUp = input.feature === 'credits' || typeof input.credits === 'number';

  if (!isCreditTopUp && input.plan) {
    if (!input.uid) {
      return {
        provider: 'pay.edutu.org',
        configured: false,
        message: 'We could not identify your account. Please sign in again and retry.',
      };
    }
    return {
      provider: 'pay.edutu.org',
      configured: true,
      authorizationUrl: buildProCheckoutUrl({
        uid: input.uid,
        plan: input.plan,
        email: input.email,
        pricing: input.pricing,
      }),
    };
  }

  // Credit packs (and any legacy call without a plan) — deprecated backend path.
  const { uid: _uid, email: _email, pricing: _pricing, ...backendInput } = input;
  return requestBilling<CheckoutResponse>('/billing/checkout', token, {
    method: 'POST',
    body: JSON.stringify(backendInput),
  });
}

/** Notify other tabs after a hosted checkout or payment return completes. */
export function broadcastBillingInvalidation(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('edutu:billing-invalidated', String(Date.now()));
}
