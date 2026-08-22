import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  backendFetchJson: vi.fn(),
}));

vi.mock("../lib/backend", () => ({
  backendFetchJson: mocks.backendFetchJson,
}));

import CommunitySafety from "./CommunitySafety";

const openReport = {
  id: "11111111-1111-4111-8111-111111111111",
  targetType: "message" as const,
  targetId: "22222222-2222-4222-8222-222222222222",
  reporterId: "user_reporter",
  reason: "This message is harassing another member.",
  status: "open" as const,
  createdAt: "2026-08-22T12:00:00.000Z",
  group: {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Scholarship Builders",
    visibility: "public",
    archivedAt: null,
  },
  message: {
    id: "22222222-2222-4222-8222-222222222222",
    userId: "user_author",
    body: "A reported message body",
    deletedAt: null,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.backendFetchJson.mockResolvedValue({
    reports: [openReport],
    status: "open",
    generatedAt: "2026-08-22T12:05:00.000Z",
  });
});

describe("CommunitySafety", () => {
  it("renders the admin-only report context and enforcement controls", async () => {
    render(<CommunitySafety />);

    expect(await screen.findByRole("heading", { name: "Community safety queue" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Scholarship Builders" })).toBeInTheDocument();
    expect(screen.getByText("This message is harassing another member.")).toBeInTheDocument();
    expect(screen.getByText("A reported message body")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove message/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /archive group/i })).toBeInTheDocument();
  });

  it("moves a report into reviewing through the audited backend endpoint", async () => {
    mocks.backendFetchJson
      .mockResolvedValueOnce({
        reports: [openReport],
        status: "open",
        generatedAt: "2026-08-22T12:05:00.000Z",
      })
      .mockResolvedValueOnce({ ...openReport, status: "reviewing" });

    render(<CommunitySafety />);
    fireEvent.click(await screen.findByRole("button", { name: "Reviewing" }));

    await waitFor(() =>
      expect(mocks.backendFetchJson).toHaveBeenCalledWith(
        `/admin/community/reports/${openReport.id}`,
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ status: "reviewing" }),
        }),
      ),
    );
    expect(await screen.findByText("Report marked reviewing.")).toBeInTheDocument();
  });
});
