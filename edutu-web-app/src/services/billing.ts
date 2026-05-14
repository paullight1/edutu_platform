export type BillingInterval = 'monthly' | 'yearly';

export interface BillingStatus {
  isPro: boolean;
  proSince: string | null;
  proExpiresAt: string | null;
  credits: number;
  subscriptionStatus: string | null;
  entitlements: string[];
  featureAccess: Record<string, boolean>;
}

export interface CheckoutResponse {
  provider: string;
  configured: boolean;
  message?: string;
  reference?: string;
  authorizationUrl?: string;
  accessCode?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function requestBilling<T>(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
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

export async function createCheckout(
  token: string,
  input: { plan: BillingInterval; feature?: string | null; returnTo?: string | null },
): Promise<CheckoutResponse> {
  return requestBilling<CheckoutResponse>('/billing/checkout', token, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
