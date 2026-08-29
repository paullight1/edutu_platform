import { BulkEnhanceSchema } from "./create-opportunity.dto";

describe("BulkEnhanceSchema", () => {
  const ids = [
    "1827885d-2d96-469e-b7f4-c580dd537334",
    "0f4309b5-d5f2-4e1e-a732-4932730dc4b3",
    "0d3a64ae-31f6-4afe-9bbb-73aff87cea98",
    "0a7a603a-b42b-4d5c-ac93-6ae42458bc15",
  ];

  it("limits synchronous AI-complete batches to three rows", () => {
    expect(BulkEnhanceSchema.safeParse({ ids: ids.slice(0, 3) }).success).toBe(
      true,
    );
    expect(BulkEnhanceSchema.safeParse({ ids }).success).toBe(false);
  });

  it("rejects duplicate opportunity IDs", () => {
    expect(BulkEnhanceSchema.safeParse({ ids: [ids[0], ids[0]] }).success).toBe(
      false,
    );
  });
});
