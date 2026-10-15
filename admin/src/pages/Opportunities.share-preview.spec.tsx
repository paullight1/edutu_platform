// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createPreviewUrl } = vi.hoisted(() => ({
  createPreviewUrl: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: {
          session: {
            access_token: "test-access-token",
            user: { email: "admin@edutu.org" },
          },
        },
      })),
      refreshSession: vi.fn(async () => ({ data: { session: null } })),
      signOut: vi.fn(async () => ({ error: null })),
    },
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
let listedOpportunity = opportunity;

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
    listedOpportunity = opportunity;
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
              data: [listedOpportunity],
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
    expect(originalPreview).toHaveAttribute("src", opportunity.image_url);
    expect(createPreviewUrl).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(shareMock).toHaveBeenCalledOnce());

    const shareData = shareMock.mock.calls[0][0];
    expect(shareData.files).toHaveLength(1);
    expect(shareData.files[0].type).toBe("image/jpeg");
    expect(shareData.files[0].name).toBe(
      "wcsj2027-travel-fellowship-in-london-edutu.jpeg",
    );
  });

  it("uses the branded flyer instead of an empty state when no source image exists", async () => {
    listedOpportunity = {
      ...opportunity,
      image_url: null,
      metadata: { source_image_url: "" },
    };
    const user = userEvent.setup();
    render(<Opportunities />);

    await user.click(
      await screen.findByRole("button", {
        name: `Share ${opportunity.title}`,
      }),
    );

    const flyerPreview = await screen.findByRole("img", {
      name: "Edutu designed flyer",
    });
    expect(flyerPreview).toHaveAttribute(
      "src",
      "https://cdn.edutu.org/opportunity-share-cards/template.png",
    );
    expect(
      screen.queryByText("Flyer preview could not be loaded."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Use current image" }),
    ).not.toBeInTheDocument();
  });

  it("falls back to the authenticated image proxy when the original URL fails", async () => {
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
    expect(originalPreview).toHaveAttribute("src", opportunity.image_url);

    fireEvent.error(originalPreview);

    await waitFor(() => {
      expect(createPreviewUrl).toHaveBeenCalledWith(
        expect.any(String),
        opportunity.id,
        expect.objectContaining({
          url: opportunity.metadata.source_image_url,
          format: "jpeg",
        }),
        expect.any(Function),
      );
    });
    expect(
      await screen.findByRole("img", { name: "Current opportunity image" }),
    ).toHaveAttribute("src", "blob:source-opportunity-image");
  });

  it("falls back to an already-saved flyer when the original and proxy both fail", async () => {
    const savedFlyerUrl =
      "https://supabase.edutu.org/storage/v1/object/public/opportunity-share-cards/expiring/saved-flyer.png";
    listedOpportunity = {
      ...opportunity,
      image_url: savedFlyerUrl,
      metadata: { source_image_url: opportunity.metadata.source_image_url },
    };
    createPreviewUrl.mockResolvedValue(null);
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
    fireEvent.error(originalPreview);

    const savedFlyer = await screen.findByRole("img", {
      name: "AI-created opportunity flyer",
    });
    expect(savedFlyer).toHaveAttribute("src", savedFlyerUrl);
    const fallbackNotice = screen
      .getAllByRole("status")
      .find((element) =>
        element.textContent?.includes("The original image could not be loaded."),
      );
    expect(fallbackNotice?.textContent).toContain("saved flyer");
    expect(screen.getByRole("button", { name: "Share" })).toBeEnabled();
  });
});
