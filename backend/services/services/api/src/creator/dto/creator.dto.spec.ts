import { MarketplaceListingSchema } from "./creator.dto";

describe("MarketplaceListingSchema fulfillment boundary", () => {
  it("accepts a paid listing only when it has a protected learner access URL", () => {
    expect(
      MarketplaceListingSchema.parse({
        title: "Scholarship clinic",
        category: "mentorship",
        type: "paid",
        price: 100,
        previewUrl: "https://example.com/booking",
      }),
    ).toMatchObject({
      type: "paid",
      price: 100,
      previewUrl: "https://example.com/booking",
    });
  });

  it("rejects paid or course listings that cannot deliver access", () => {
    expect(() =>
      MarketplaceListingSchema.parse({
        title: "Scholarship clinic",
        category: "mentorship",
        type: "paid",
        price: 100,
      }),
    ).toThrow("learner access URL");

    expect(() =>
      MarketplaceListingSchema.parse({
        title: "Application course",
        category: "course",
        type: "course",
        price: 0,
      }),
    ).toThrow("learner access URL");
  });

  it("rejects contradictory price semantics", () => {
    expect(() =>
      MarketplaceListingSchema.parse({
        title: "Not actually free",
        category: "resource",
        type: "free",
        price: 10,
      }),
    ).toThrow("Free listings cannot charge credits");

    expect(() =>
      MarketplaceListingSchema.parse({
        title: "Paid but zero",
        category: "resource",
        type: "paid",
        price: 0,
        previewUrl: "https://example.com/access",
      }),
    ).toThrow("Paid listings need a credit price");
  });

  it("accepts only http(s) marketplace URLs", () => {
    expect(() =>
      MarketplaceListingSchema.parse({
        title: "Unsafe preview",
        category: "resource",
        type: "course",
        price: 0,
        previewUrl: "javascript:alert(1)",
      }),
    ).toThrow("http(s)");

    expect(() =>
      MarketplaceListingSchema.parse({
        title: "Unsafe image",
        category: "resource",
        type: "free",
        price: 0,
        imageUrl: "file:///etc/passwd",
      }),
    ).toThrow("http(s)");
  });
});
