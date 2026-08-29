import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  backendFetchJson: vi.fn(),
}));

vi.mock("../lib/backend", () => ({
  backendFetchJson: mocks.backendFetchJson,
}));

import Creators from "./Creators";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.backendFetchJson
    .mockResolvedValueOnce([
      {
        id: "app-1",
        userId: "user-1",
        displayName: "Test Mentor",
        bio: "Helps applicants",
        contentType: "mentorship",
        experience: "Five years",
        sampleContentUrl: null,
        status: "pending",
        adminNote: null,
        reviewedBy: null,
        reviewedAt: null,
        submittedAt: "2026-08-29T10:00:00.000Z",
        updatedAt: "2026-08-29T10:00:00.000Z",
        proofPath: "owner/2026-08-29/proof.pdf",
        proofFileName: "eligibility letter.pdf",
        proofFileType: "application/pdf",
        proofFileSize: 2048,
      },
    ])
    .mockResolvedValueOnce({ success: true, source: "database", users: [] })
    .mockResolvedValueOnce({
      url: "https://signed.example/proof",
      fileName: "eligibility letter.pdf",
      mimeType: "application/pdf",
      size: 2048,
      expiresIn: 300,
    });
});

describe("Creators proof review", () => {
  it("requests and opens a short-lived proof URL from the admin API", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<Creators />);

    fireEvent.click(await screen.findByText("Test Mentor"));
    fireEvent.click(
      await screen.findByRole("button", { name: /open proof/i }),
    );

    await waitFor(() =>
      expect(mocks.backendFetchJson).toHaveBeenCalledWith(
        "/admin/creator-applications/app-1/proof-download",
      ),
    );
    expect(open).toHaveBeenCalledWith(
      "https://signed.example/proof",
      "_blank",
      "noopener,noreferrer",
    );
  });
});
