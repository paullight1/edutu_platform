import {
  UpdateHomeCategoryLayoutSchema,
  UpdateMemberSettingsSchema,
  UpdateProfileSchema,
} from "./profile.dto";

describe("UpdateProfileSchema authorization boundary", () => {
  it("rejects client-supplied role and admin metadata", () => {
    expect(
      UpdateProfileSchema.safeParse({
        fullName: "Regular User",
        role: "admin",
      }).success,
    ).toBe(false);

    expect(
      UpdateProfileSchema.safeParse({
        fullName: "Regular User",
        admin: true,
      }).success,
    ).toBe(false);
  });
});

describe("UpdateMemberSettingsSchema security boundary", () => {
  it("accepts user-managed privacy settings", () => {
    expect(
      UpdateMemberSettingsSchema.safeParse({
        privacy: { profileVisibility: "private" },
      }).success,
    ).toBe(true);
  });

  it("rejects client-forged authentication security state", () => {
    expect(
      UpdateMemberSettingsSchema.safeParse({
        security: { twoFactorEnabled: true },
      }).success,
    ).toBe(false);

    expect(
      UpdateMemberSettingsSchema.safeParse({
        security: { lastPasswordUpdate: "2026-08-21T08:00:00.000Z" },
      }).success,
    ).toBe(false);
  });
});

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
