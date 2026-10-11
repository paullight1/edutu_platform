import { describe, expect, it } from "vitest";
import {
  getExistingOpportunityImage,
  preserveBrandedSharePayload,
} from "./opportunityShareImages";

describe("getExistingOpportunityImage", () => {
  it("prefers the original source image over a generated flyer stored as image_url", () => {
    expect(
      getExistingOpportunityImage({
        image_url:
          "https://cdn.edutu.org/opportunity-share-cards/generated.webp",
        metadata: {
          source_image_url: "https://source.example.org/fellowship-poster.jpg",
        },
      }),
    ).toEqual({
      url: "https://source.example.org/fellowship-poster.jpg",
      path: "",
      format: "jpeg",
    });
  });

  it("uses the card image when it is an original image and no metadata source exists", () => {
    expect(
      getExistingOpportunityImage({
        image_url: "https://source.example.org/poster.png?width=400",
      }),
    ).toEqual({
      url: "https://source.example.org/poster.png?width=400",
      path: "",
      format: "png",
    });
  });

  it("does not offer an Edutu-generated flyer as the existing source image", () => {
    expect(
      getExistingOpportunityImage({
        image_url: "https://cdn.edutu.org/opportunity-share-cards/generated.png",
      }),
    ).toBeNull();
  });
});

describe("preserveBrandedSharePayload", () => {
  it("does not promote the original image to the template when creating an AI flyer", () => {
    const originalImage = { shareCard: { url: "https://source.example.org/poster.jpg" } };

    expect(
      preserveBrandedSharePayload({
        brandedPayload: null,
        payload: originalImage,
        selectedDesign: "existing",
      }),
    ).toBeNull();
  });

  it("preserves a fetched template across design changes", () => {
    const template = { shareCard: { url: "https://cdn.edutu.org/template.png" } };

    expect(
      preserveBrandedSharePayload({
        brandedPayload: template,
        payload: { shareCard: { url: "https://source.example.org/poster.jpg" } },
        selectedDesign: "existing",
      }),
    ).toBe(template);
  });

  it("uses the current payload only when it is already the branded design", () => {
    const template = { shareCard: { url: "https://cdn.edutu.org/template.png" } };

    expect(
      preserveBrandedSharePayload({ payload: template, selectedDesign: "branded" }),
    ).toBe(template);
  });
});
