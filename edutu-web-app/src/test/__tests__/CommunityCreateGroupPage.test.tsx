import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityCreationRequestResponse } from "../../features/community/types";

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(async () => "clerk-token"),
  submitCreationRequest: vi.fn(),
  cancelCreationRequest: vi.fn(),
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ getToken: mocks.getToken }),
}));

vi.mock("../../services/opportunities", () => ({
  fetchOpportunities: vi.fn(async () => []),
  getCachedOpportunitiesSync: () => [],
}));

vi.mock("../../features/community/api", () => ({
  CommunityApi: class {
    submitCreationRequest = mocks.submitCreationRequest;
    cancelCreationRequest = mocks.cancelCreationRequest;
  },
  isCommunityApiError: () => false,
}));

import CommunityCreateGroupPage from "../../features/community/CommunityCreateGroupPage";

const submission: CommunityCreationRequestResponse = {
  request: {
  id: "request-created",
  requesterId: "user-owner",
  name: "Chevening 2027 applicants",
  description: "Application support",
  opportunityId: null,
  visibility: "public",
  joinPolicy: "open",
  coverEmoji: "💬",
  coverImageResourceUrl: null,
  status: "pending",
  reviewedBy: null,
  reviewedAt: null,
  rejectionReason: null,
  approvedGroupId: null,
  createdAt: "2026-08-27T00:00:00.000Z",
  updatedAt: "2026-08-27T00:00:00.000Z",
  },
  slots: { used: 1, limit: 2 },
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/app/community/groups/new"]}>
      <Routes>
        <Route
          path="/app/community/groups/new"
          element={<CommunityCreateGroupPage />}
        />
        <Route
          path="/app/community/groups/:id"
          element={<p>Created community destination</p>}
        />
        <Route
          path="/app/community/groups"
          element={<p>Created community destination</p>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.submitCreationRequest.mockResolvedValue(submission);
  mocks.cancelCreationRequest.mockResolvedValue({
    ...submission,
    request: { ...submission.request, status: "cancelled" },
    slots: { used: 0, limit: 2 },
  });
});

describe("CommunityCreateGroupPage", () => {
  it("submits the proposal for review and shows a slot-aware receipt", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Community name"), {
      target: { value: "Chevening 2027 applicants" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));

    expect(await screen.findByText("Your request is pending review")).toBeVisible();
    expect(screen.getByText("1 of 2 community slots used")).toBeVisible();

    expect(mocks.submitCreationRequest).toHaveBeenCalledWith({
      name: "Chevening 2027 applicants",
      description: undefined,
      opportunityId: undefined,
      visibility: "public",
      joinPolicy: "open",
      coverEmoji: "💬",
    });
  });

  it("lets the creator cancel a pending proposal", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Community name"), {
      target: { value: "Chevening 2027 applicants" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    await screen.findByText("Your request is pending review");
    fireEvent.click(screen.getByRole("button", { name: "Cancel request" }));

    await screen.findByText("Created community destination");
    expect(mocks.cancelCreationRequest).toHaveBeenCalledWith("request-created");
  });
});
