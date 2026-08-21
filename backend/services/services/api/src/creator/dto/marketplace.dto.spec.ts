import {
  MarketplaceCatalogQuerySchema,
  MarketplaceReviewSchema,
} from "./marketplace.dto";

describe("MarketplaceCatalogQuerySchema", () => {
  it("normalizes public catalogue filters and caps page size", () => {
    expect(
      MarketplaceCatalogQuerySchema.parse({
        q: "  scholarship coaching  ",
        category: "mentorship",
        type: "paid",
        limit: "1000",
      }),
    ).toEqual({
      q: "scholarship coaching",
      category: "mentorship",
      type: "paid",
      limit: 50,
    });
  });

  it("rejects unsupported listing types and oversized cursors", () => {
    expect(() => MarketplaceCatalogQuerySchema.parse({ type: "crypto" })).toThrow();
    expect(() =>
      MarketplaceCatalogQuerySchema.parse({ cursor: "x".repeat(513) }),
    ).toThrow();
  });
});

describe("MarketplaceReviewSchema", () => {
  it("only permits approve or reject moderation decisions", () => {
    expect(MarketplaceReviewSchema.parse({ decision: "approve" })).toEqual({
      decision: "approve",
    });
    expect(() => MarketplaceReviewSchema.parse({ decision: "active" })).toThrow();
  });
});
