// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createPreviewUrl } = vi.hoisted(() => ({
  createPreviewUrl: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({
  supabase: {
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
    removeChannel: vi.fn(),
  },
}));

vi.mock("../lib/backend", () => ({
  getAdminAuthHeaders: vi.fn(async () => ({
    "Content-Type": "application/json",
    Authorization: "Bearer test-token",
  })),
}));

vi.mock("../lib/opportunityShareImages", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/opportunityShareImages")>();
  return {
    ...actual,
    createOpportunityShareImagePreviewUrl: createPreviewUrl,
  };
});

import Opportunities from "./Opportunities";

const opportunity = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "WCSJ2027 Travel Fellowship in London",
  summary: "Travel support for science journalists.",
  description: "Support for journalists attending the conference.",
  category: "Fellowships",
  organization: "World Conference of Science Journalists",
  location: "London",
  is_remote: false,
  application_url: "https://example.org/apply",
  source_url: "https://example.org/fellowship",
  close_date: "2026-10-23",
  image_url: "https://source.example.org/wcsj-flyer.jpg",
  is_featured: false,
  status: "active",
  created_at: "2026-08-29T00:00:00.000Z",
  views: 0,
  applications: 0,
  metadata: {
    source_image_url: "https://source.example.org/wcsj-flyer.jpg",
  },
};

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: vi.fn(async () => body),
  } as unknown as Response;
}

describe("opportunity share image chooser", () => {
  let shareMock: ReturnType<typeof vi.fn>;
  let originalShareDescriptor: PropertyDescriptor | undefined;
  let originalCanShareDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    createPreviewUrl.mockResolvedValue("blob:source-opportunity-image");

    const sourceBlob = new Blob(["original source flyer"], {
      type: "image/jpeg",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/opportunities/admin/list")) {
          return Promise.resolve(
            jsonResponse({
              data: [opportunity],
              page: 1,
              limit: 50,
              total: 1,
              totalPages: 1,
              hasMore: false,
            }),
          );
        }
        if (url.endsWith("/opportunities/admin/stats")) {
          return Promise.resolve(
            jsonResponse({
              total: 1,
              active: 1,
              expired: 0,
              missingDeadline: 0,
              featured: 0,
              expiringSoon: 0,
              needsReview: 0,
            }),
          );
        }
        if (url.endsWith("/opportunities/admin/11111111-1111-4111-8111-111111111111/share-card")) {
          return Promise.resolve(
            jsonResponse({
              success: true,
              shareUrl: "https://edutu.org/share/opportunity/11111111-1111-4111-8111-111111111111",
              shareText: "WCSJ2027 Travel Fellowship in London",
              shareCard: {
                url: "https://cdn.edutu.org/opportunity-share-cards/template.png",
                path: "opportunity-share-cards/template.png",
                format: "png",
              },
            }),
          );
        }
        if (url.endsWith("/opportunities/admin/11111111-1111-4111-8111-111111111111/source-image")) {
          return Promise.resolve({
            ok: true,
            blob: async () => sourceBlob,
          } as Response);
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    originalShareDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      "share",
    );
    originalCanShareDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      "canShare",
    );
    shareMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: shareMock,
    });
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalShareDescriptor) {
      Object.defineProperty(navigator, "share", originalShareDescriptor);
    } else {
      Reflect.deleteProperty(navigator, "share");
    }
    if (originalCanShareDescriptor) {
      Object.defineProperty(navigator, "canShare", originalCanShareDescriptor);
    } else {
      Reflect.deleteProperty(navigator, "canShare");
    }
  });

  it("opens on the original image and shares that image instead of the template", async () => {
    const user = userEvent.setup();
    render(<Opportunities />);

    await user.click(
      await screen.findByRole("button", {
        name: `Share ${opportunity.title}`,
      }),
    );

    const originalPreview = await screen.findByRole("img", {
      name: "Current opportunity image",
    });
    expect(originalPreview).toHaveAttribute(
      "src",
      "blob:source-opportunity-image",
    );
    expect(createPreviewUrl).toHaveBeenCalledWith(
      expect.any(String),
      opportunity.id,
      expect.objectContaining({
        url: opportunity.metadata.source_image_url,
        format: "jpeg",
      }),
      expect.any(Function),
    );

    await user.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(shareMock).toHaveBeenCalledOnce());

    const shareData = shareMock.mock.calls[0][0];
    expect(shareData.files).toHaveLength(1);
    expect(shareData.files[0].type).toBe("image/jpeg");
    expect(shareData.files[0].name).toBe(
      "wcsj2027-travel-fellowship-in-london-edutu.jpeg",
    );
  });
});
