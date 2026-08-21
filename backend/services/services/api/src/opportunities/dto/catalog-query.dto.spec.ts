import { OpportunityCatalogQuerySchema } from "./catalog-query.dto";

describe("OpportunityCatalogQuerySchema", () => {
  it("applies stable defaults", () => {
    expect(OpportunityCatalogQuerySchema.parse({})).toMatchObject({
      sort: "newest",
      limit: 20,
    });
  });

  it("caps page size at sixty", () => {
    expect(() => OpportunityCatalogQuerySchema.parse({ limit: 61 })).toThrow();
  });

  it("rejects inverted deadline ranges", () => {
    const result = OpportunityCatalogQuerySchema.safeParse({
      deadlineAfter: "2026-09-30",
      deadlineBefore: "2026-09-01",
    });

    expect(result.success).toBe(false);
  });

  it("accepts an inclusive one-day deadline range", () => {
    const result = OpportunityCatalogQuerySchema.safeParse({
      deadlineAfter: "2026-09-01",
      deadlineBefore: "2026-09-01",
      sort: "deadline",
    });

    expect(result.success).toBe(true);
  });
});
