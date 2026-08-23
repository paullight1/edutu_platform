import { getConfig } from './config';

export type MarketplaceEntitlement = {
  id: string;
  listingId: string;
  status: string;
  creditsSpent: number;
  enrolledAt: string;
  completedAt: string | null;
  title: string;
  category: string;
  type: string;
  imageUrl: string | null;
  accessUrl: string | null;
};

type FetchEntitlementsOptions = {
  token: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function fetchMarketplaceEntitlements({
  token,
  baseUrl = getConfig().apiBaseUrl,
  fetchImpl = fetch,
}: FetchEntitlementsOptions): Promise<MarketplaceEntitlement[]> {
  if (!token.trim()) {
    throw new Error('Sign in again to load marketplace access.');
  }

  const response = await fetchImpl(
    `${baseUrl.replace(/\/$/, '')}/marketplace/enrollments`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      payload?.message || payload?.error?.message || 'Unable to load marketplace access.',
    );
  }
  if (!Array.isArray(payload)) {
    throw new Error('Marketplace access response was invalid.');
  }

  return payload.map((row: Record<string, unknown>) => ({
    id: String(row.id ?? ''),
    listingId: String(row.listingId ?? ''),
    status: String(row.status ?? 'active'),
    creditsSpent: Number(row.creditsSpent ?? 0),
    enrolledAt: String(row.enrolledAt ?? ''),
    completedAt: row.completedAt ? String(row.completedAt) : null,
    title: String(row.title ?? 'Marketplace access'),
    category: String(row.category ?? ''),
    type: String(row.type ?? ''),
    imageUrl: safeHttpUrl(row.imageUrl),
    // Defense in depth for legacy rows created before the backend HTTP(S)
    // validation existed: never hand an arbitrary URI scheme to Linking.
    accessUrl: safeHttpUrl(row.accessUrl),
  }));
}
