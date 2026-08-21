import { backendFetchJson } from "./backend";

export type MarketplaceAdminListing = {
  id: string;
  title: string;
  description?: string | null;
  category: string;
  type: string;
  price: number;
  capacity?: number | null;
  enrollmentCount: number;
  status: "pending" | "active" | "paused" | "rejected" | string;
  sellerName: string;
  sellerApproved: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MarketplaceReviewInput = {
  decision: "approve" | "reject";
  note?: string;
};

export function listMarketplaceAdminListings(status?: string) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return backendFetchJson<MarketplaceAdminListing[]>(
    `/marketplace/admin/listings${query}`,
  );
}

export function reviewMarketplaceListing(
  listingId: string,
  input: MarketplaceReviewInput,
) {
  return backendFetchJson<MarketplaceAdminListing>(
    `/marketplace/admin/listings/${encodeURIComponent(listingId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}
