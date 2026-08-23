import { beforeEach, describe, expect, it, vi } from "vitest";
import { backendFetchJson } from "./backend";
import {
  listMarketplaceAdminListings,
  reviewMarketplaceListing,
} from "./marketplaceAdminApi";

vi.mock("./backend", () => ({
  backendFetchJson: vi.fn(),
}));

const mockedFetch = vi.mocked(backendFetchJson);

describe("marketplace admin API", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  it("loads the pending moderation queue from the backend admin endpoint", async () => {
    mockedFetch.mockResolvedValue([]);
    await listMarketplaceAdminListings("pending");
    expect(mockedFetch).toHaveBeenCalledWith(
      "/marketplace/admin/listings?status=pending",
    );
  });

  it("sends approve/reject decisions to the audited backend route", async () => {
    mockedFetch.mockResolvedValue({ id: "listing-1", status: "active" });
    await reviewMarketplaceListing("listing-1", {
      decision: "approve",
      note: "Scope checked",
    });

    expect(mockedFetch).toHaveBeenCalledWith(
      "/marketplace/admin/listings/listing-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ decision: "approve", note: "Scope checked" }),
      }),
    );
  });
});
