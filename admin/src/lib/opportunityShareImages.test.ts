import { describe, expect, it, vi } from "vitest";

const { adminApiFetch } = vi.hoisted(() => ({
  adminApiFetch: vi.fn(),
}));

vi.mock("./apiClient", () => ({ adminApiFetch }));

import {
  createOpportunityShareImageFile,
  createOpportunityShareImagePreviewUrl,
  getShareImageFetchTarget,
  getExistingOpportunityImage,
  preserveBrandedSharePayload,
} from "./opportunityShareImages";

describe("getShareImageFetchTarget", () => {
  it("fetches original source images through the authenticated API proxy", () => {
    expect(
      getShareImageFetchTarget("https://api.example.org/", "opp/1", {
        url: "https://source.example.org/flyer.jpg",
        path: "",
      }),
    ).toEqual({
      url: "https://api.example.org/opportunities/admin/opp%2F1/source-image",
      requiresAdminAuth: true,
    });
  });

  it("fetches generated flyers directly from their hosted asset URL", () => {
    expect(
      getShareImageFetchTarget("https://api.example.org", "opp-1", {
        url: "https://cdn.example.org/generated.png",
        path: "opportunity-share-cards/opp-1.png",
      }),
    ).toEqual({
      url: "https://cdn.example.org/generated.png",
      requiresAdminAuth: false,
    });
  });
});

describe("createOpportunityShareImageFile", () => {
  const opportunity = { id: "opp-1", title: "WCSJ2027 Travel Fellowship" };

  it("uses the authenticated proxy for originals and creates a named image file", async () => {
    const blob = new Blob(["image"], { type: "image/jpeg" });
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => blob,
    });
    const getAdminHeaders = vi.fn().mockResolvedValue({ Authorization: "Bearer test" });
    const image = {
      url: "https://source.example.org/flyer.jpg",
      path: "",
      format: "jpeg" as const,
    };

    const result = await createOpportunityShareImageFile(
      "https://api.example.org",
      opportunity,
      image,
      getAdminHeaders,
      fetcher as typeof fetch,
    );

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.example.org/opportunities/admin/opp-1/source-image",
      { headers: { Authorization: "Bearer test" } },
    );
    expect(result?.file.name).toBe("wcsj2027-travel-fellowship-edutu.jpeg");
    expect(result?.file.type).toBe("image/jpeg");
  });

  it("uses the shared refresh-capable API client for production image downloads", async () => {
    const blob = new Blob(["image"], { type: "image/jpeg" });
    adminApiFetch.mockResolvedValue({ ok: true, blob: async () => blob });
    const getAdminHeaders = vi.fn().mockResolvedValue({
      Authorization: "Bearer stale-token",
    });

    const result = await createOpportunityShareImageFile(
      "https://api.example.org",
      opportunity,
      {
        url: "https://source.example.org/flyer.jpg",
        path: "",
        format: "jpeg",
      },
      getAdminHeaders,
    );

    expect(adminApiFetch).toHaveBeenCalledWith(
      "https://api.example.org/opportunities/admin/opp-1/source-image",
      { headers: { Authorization: "Bearer stale-token" } },
    );
    expect(result?.file.type).toBe("image/jpeg");
  });

  it("does not send admin credentials to the public generated-image host", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["image"], { type: "image/png" }),
    });
    const getAdminHeaders = vi.fn();

    await createOpportunityShareImageFile(
      "https://api.example.org",
      opportunity,
      {
        url: "https://cdn.example.org/flyer.png",
        path: "opportunity-share-cards/opp-1.png",
        format: "png",
      },
      getAdminHeaders,
      fetcher as typeof fetch,
    );

    expect(fetcher).toHaveBeenCalledWith("https://cdn.example.org/flyer.png");
    expect(getAdminHeaders).not.toHaveBeenCalled();
  });

  it("returns null when the image cannot be fetched or is missing", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false });
    const getAdminHeaders = vi.fn().mockResolvedValue({});

    await expect(
      createOpportunityShareImageFile(
        "https://api.example.org",
        opportunity,
        {
          url: "https://source.example.org/flyer.png",
          path: "",
          format: "png",
        },
        getAdminHeaders,
        fetcher as typeof fetch,
      ),
    ).resolves.toBeNull();
    await expect(
      createOpportunityShareImageFile(
        "https://api.example.org",
        opportunity,
        null,
        getAdminHeaders,
        fetcher as typeof fetch,
      ),
    ).resolves.toBeNull();
  });
});

describe("createOpportunityShareImagePreviewUrl", () => {
  it("loads the original image through the authenticated proxy for previews", async () => {
    const blob = new Blob(["image"], { type: "image/jpeg" });
    const fetcher = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob });
    const getAdminHeaders = vi.fn().mockResolvedValue({ Authorization: "Bearer test" });
    const createObjectUrl = vi.fn().mockReturnValue("blob:preview-image");

    await expect(
      createOpportunityShareImagePreviewUrl(
        "https://api.example.org",
        "opp-1",
        { url: "https://source.example.org/flyer.jpg", path: "", format: "jpeg" },
        getAdminHeaders,
        fetcher as typeof fetch,
        createObjectUrl,
      ),
    ).resolves.toBe("blob:preview-image");

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.example.org/opportunities/admin/opp-1/source-image",
      { headers: { Authorization: "Bearer test" } },
    );
    expect(createObjectUrl).toHaveBeenCalledWith(blob);
  });

  it("rejects non-image responses instead of previewing an error page", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["login page"], { type: "text/html" }),
    });
    const createObjectUrl = vi.fn();

    await expect(
      createOpportunityShareImagePreviewUrl(
        "https://api.example.org",
        "opp-1",
        { url: "https://source.example.org/flyer.jpg", path: "", format: "jpeg" },
        async () => ({}),
        fetcher as typeof fetch,
        createObjectUrl,
      ),
    ).resolves.toBeNull();
    expect(createObjectUrl).not.toHaveBeenCalled();
  });
});

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
