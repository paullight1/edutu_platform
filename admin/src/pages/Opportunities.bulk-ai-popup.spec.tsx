// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Opportunities from "./Opportunities";

const realtimeChannel = {
  on: vi.fn(),
  subscribe: vi.fn(),
};
realtimeChannel.on.mockReturnValue(realtimeChannel);
realtimeChannel.subscribe.mockReturnValue(realtimeChannel);

vi.mock("../lib/supabase", () => ({
  supabase: {
    channel: vi.fn(() => realtimeChannel),
    removeChannel: vi.fn(),
  },
}));

vi.mock("../lib/backend", () => ({
  getAdminAuthHeaders: vi.fn(async () => ({
    "Content-Type": "application/json",
  })),
}));

const opportunity = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Test scholarship",
  summary: "A short summary",
  description: "A description that AI should improve.",
  category: "Scholarships",
  organization: "Test Foundation",
  location: "Remote",
  is_remote: true,
  application_url: "https://example.com/apply",
  source_url: "https://example.com",
  close_date: "2027-01-10",
  image_url: "",
  is_featured: false,
  status: "pending_review",
  created_at: "2026-08-29T00:00:00.000Z",
  views: 0,
  applications: 0,
  metadata: { needs_review: true },
};

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: vi.fn(async () => body),
  } as unknown as Response;
}

let resolveBulkResponse: (response: Response) => void;

describe("Opportunities AI completion popup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realtimeChannel.on.mockReturnValue(realtimeChannel);
    realtimeChannel.subscribe.mockReturnValue(realtimeChannel);

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/opportunities/admin/bulk-enhance")) {
          return new Promise<Response>((resolve, reject) => {
            resolveBulkResponse = resolve;
            const abort = () =>
              reject(
                new DOMException("The operation was aborted", "AbortError"),
              );
            if (init?.signal?.aborted) abort();
            else init?.signal?.addEventListener("abort", abort, { once: true });
          });
        }
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
        if (url.includes("/opportunities/admin/stats")) {
          return Promise.resolve(
            jsonResponse({
              total: 1,
              active: 0,
              expired: 0,
              missingDeadline: 0,
              featured: 0,
              expiringSoon: 0,
              needsReview: 1,
            }),
          );
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
  });

  it("shows real progress and waits for the active batch to reconcile after cancel", async () => {
    const user = userEvent.setup();
    render(<Opportunities />);

    await user.click(
      await screen.findByRole(
        "checkbox",
        { name: "Select Test scholarship" },
        { timeout: 5_000 },
      ),
    );
    await user.click(screen.getByRole("button", { name: "AI Complete" }));

    const popup = await screen.findByRole("status", {
      name: "AI completion progress",
    });
    expect(popup).toHaveAttribute("aria-busy", "true");
    expect(
      screen.getByText("AI completing opportunity details"),
    ).toBeInTheDocument();
    expect(screen.getByText("Improving 1–1 of 1")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "0",
    );

    await user.click(
      screen.getByRole("button", { name: "Minimize AI completion progress" }),
    );
    expect(
      screen.queryByRole("status", { name: "AI completion progress" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Expand AI completion progress" }),
    ).toHaveTextContent("0 / 1");

    await user.click(
      screen.getByRole("button", { name: "Expand AI completion progress" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Cancel AI completion" }),
    );

    expect(
      screen.getByText("Stopping after the current request…"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cancel AI completion" }),
    ).toBeDisabled();

    resolveBulkResponse(
      jsonResponse({
        success: true,
        processed: 1,
        enhanced: 1,
        failed: 0,
        failedIds: [],
      }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("status", { name: "AI completion progress" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByText(
        "AI completion cancelled. 0 opportunities remain selected.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("1 selected")).not.toBeInTheDocument();
  });
});
