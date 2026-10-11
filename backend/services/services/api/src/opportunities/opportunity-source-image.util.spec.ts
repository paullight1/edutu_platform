import { getOpportunitySourceImageUrl } from "./opportunity-source-image.util";

describe("getOpportunitySourceImageUrl", () => {
  it("prefers the original source over a generated flyer in image_url", () => {
    expect(
      getOpportunitySourceImageUrl({
        image_url:
          "https://cdn.edutu.org/opportunity-share-cards/generated.png",
        metadata: {
          source_image_url: "https://source.example.org/flyer.jpg",
        },
      }),
    ).toBe("https://source.example.org/flyer.jpg");
  });

  it("rejects generated cards and unsafe URL forms", () => {
    expect(
      getOpportunitySourceImageUrl({
        image_url:
          "https://cdn.edutu.org/opportunity-share-cards/generated.png",
      }),
    ).toBeNull();
    expect(
      getOpportunitySourceImageUrl({
        image_url: "http://user:pass@source.example.org/flyer.jpg",
      }),
    ).toBeNull();
    expect(
      getOpportunitySourceImageUrl({
        image_url: "https://source.example.org:8443/flyer.jpg",
      }),
    ).toBeNull();
  });
});
