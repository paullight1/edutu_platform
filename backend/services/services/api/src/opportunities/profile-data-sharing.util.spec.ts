import { allowsExternalProfileEmbedding } from "./profile-data-sharing.util";

describe("allowsExternalProfileEmbedding", () => {
  it("defaults to no external profile sharing when settings are absent", () => {
    expect(allowsExternalProfileEmbedding(null)).toBe(false);
    expect(allowsExternalProfileEmbedding({})).toBe(false);
  });

  it("requires an explicit boolean opt-in", () => {
    expect(
      allowsExternalProfileEmbedding({
        settings: { privacy: { dataSharing: true } },
      }),
    ).toBe(true);
    expect(
      allowsExternalProfileEmbedding({
        settings: { privacy: { dataSharing: false } },
      }),
    ).toBe(false);
    expect(
      allowsExternalProfileEmbedding({
        settings: { privacy: { dataSharing: "true" } },
      }),
    ).toBe(false);
  });

  it("accepts the snake_case projection used by some raw SQL/profile paths", () => {
    expect(
      allowsExternalProfileEmbedding({
        settings: { privacy: { data_sharing: true } },
      }),
    ).toBe(true);
  });
});
