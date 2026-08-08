import { UpdateHomeCategoryLayoutSchema } from "./profile.dto";

describe("UpdateHomeCategoryLayoutSchema", () => {
  it("accepts a versioned, unique tile layout", () => {
    expect(
      UpdateHomeCategoryLayoutSchema.safeParse({
        tiles: [
          { id: "scholarships", size: "card" },
          { id: "internships", size: "long" },
        ],
        updatedAt: "2026-08-08T10:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("rejects duplicate category ids", () => {
    expect(
      UpdateHomeCategoryLayoutSchema.safeParse({
        tiles: [
          { id: "scholarships", size: "card" },
          { id: "scholarships", size: "icon" },
        ],
        updatedAt: "2026-08-08T10:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});
