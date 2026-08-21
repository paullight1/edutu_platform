import { afterEach, describe, expect, it, vi } from "vitest";
import {
  enrollMarketplaceListing,
  fetchMarketplaceListing,
  fetchMarketplaceListings,
  getMarketplaceEnrollments,
  getWallet,
} from "./marketplace";

vi.mock("../lib/apiBaseUrl", () => ({
  getApiBaseUrl: () => "https://api.test",
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("marketplace service", () => {
  it("passes public catalogue filters and cursor to the backend", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ items: [], nextCursor: null, hasMore: false }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchMarketplaceListings({
      q: "cv review",
      category: "career",
      type: "paid",
      cursor: "cursor-1",
      limit: 20,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/marketplace/listings?q=cv+review&category=career&type=paid&cursor=cursor-1&limit=20",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("loads one public listing without requiring a session token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "listing-1", title: "CV review" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchMarketplaceListing("listing-1");
    expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty(
      "Authorization",
    );
  });

  it("requires authenticated server routes for enrollments, purchase and wallet", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getMarketplaceEnrollments("token-1");
    await enrollMarketplaceListing("listing-1", "token-1");
    await getWallet("token-1");

    for (const [, options] of fetchMock.mock.calls) {
      expect(options?.headers).toMatchObject({
        Authorization: "Bearer token-1",
      });
    }
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "POST" });
  });
});
