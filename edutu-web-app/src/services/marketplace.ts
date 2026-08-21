import { getApiBaseUrl } from "../lib/apiBaseUrl";

export type MarketplaceListing = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  type: "free" | "paid" | "credit" | "course" | string;
  price: number;
  imageUrl: string | null;
  previewUrl: string | null;
  eventDate: string | null;
  eventEndDate: string | null;
  eventLocation: string | null;
  capacity: number | null;
  enrollmentCount: number;
  rating: number;
  reviewCount: number;
  isFeatured: boolean;
  tags: string[] | null;
  createdAt: string;
  updatedAt: string;
  sellerName: string;
  sellerVerified: boolean;
  soldOut: boolean;
  remainingCapacity: number | null;
};

export type MarketplacePage = {
  items: MarketplaceListing[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type MarketplaceEnrollment = {
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
};

export type WalletTransaction = {
  id: string;
  userId: string;
  amount: number;
  type: string;
  status: string;
  referenceId: string | null;
  description: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type MarketplaceWallet = {
  balance: number;
  transactions: WalletTransaction[];
};

export type MarketplaceListingInput = {
  title: string;
  description?: string;
  category: string;
  type?: "free" | "paid" | "credit" | "course";
  price?: number;
  imageUrl?: string;
  previewUrl?: string;
  tags?: string[];
  eventDate?: string;
  eventEndDate?: string;
  eventLocation?: string;
  capacity?: number;
};

async function marketplaceRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const apiBaseUrl = getApiBaseUrl("Marketplace API");
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (options.body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? "GET",
    ...options,
    headers: {
      ...headers,
      ...(options.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(
      payload?.message || payload?.error?.message || "Marketplace request failed",
    );
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return payload as T;
}

export async function fetchMarketplaceListings(
  filters: {
    q?: string;
    category?: string;
    type?: "free" | "paid" | "credit" | "course";
    cursor?: string;
    limit?: number;
  } = {},
): Promise<MarketplacePage> {
  const params = new URLSearchParams();
  if (filters.q?.trim()) params.set("q", filters.q.trim());
  if (filters.category) params.set("category", filters.category);
  if (filters.type) params.set("type", filters.type);
  if (filters.cursor) params.set("cursor", filters.cursor);
  if (filters.limit) params.set("limit", String(filters.limit));
  const query = params.toString();
  return marketplaceRequest<MarketplacePage>(
    `/marketplace/listings${query ? `?${query}` : ""}`,
  );
}

export function fetchMarketplaceListing(id: string) {
  return marketplaceRequest<MarketplaceListing>(
    `/marketplace/listings/${encodeURIComponent(id)}`,
  );
}

export function getMarketplaceEnrollments(token: string) {
  return marketplaceRequest<MarketplaceEnrollment[]>(
    "/marketplace/enrollments",
    {},
    token,
  );
}

export function enrollMarketplaceListing(id: string, token: string) {
  return marketplaceRequest<MarketplaceEnrollment>(
    `/marketplace/${encodeURIComponent(id)}/enroll`,
    { method: "POST" },
    token,
  );
}

export function getWallet(token: string) {
  return marketplaceRequest<MarketplaceWallet>("/wallet", {}, token);
}

export function createMarketplaceListing(
  input: MarketplaceListingInput,
  token: string,
) {
  return marketplaceRequest<MarketplaceListing>(
    "/marketplace/listings",
    { method: "POST", body: JSON.stringify(input) },
    token,
  );
}
