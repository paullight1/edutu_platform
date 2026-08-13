import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import SubmitOpportunityPage from "../../components/SubmitOpportunityPage";

const submitOpportunity = vi.fn();
const fetchSubmissionsPolicy = vi.fn();

vi.mock("../../services/opportunitySubmissions", () => ({
  submitOpportunity: (...args: unknown[]) => submitOpportunity(...args),
  fetchMySubmissions: vi.fn().mockResolvedValue([]),
  respondToSubmission: vi.fn(),
}));

vi.mock("../../services/webConfig", () => ({
  fetchSubmissionsPolicy: (...args: unknown[]) => fetchSubmissionsPolicy(...args),
}));

vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ getToken: vi.fn().mockResolvedValue("token") }),
}));

describe("SubmitOpportunityPage", () => {
  it("always presents submissions as pending review even when settings disable approval", async () => {
    fetchSubmissionsPolicy.mockResolvedValue({
      requireApproval: false,
      paidSubmissions: false,
      costCredits: 0,
    });
    submitOpportunity.mockResolvedValue({ status: "pending" });

    render(
      <MemoryRouter>
        <SubmitOpportunityPage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(
        screen.getByText(/our team reviews every submission before it goes live/i),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /submit for review/i })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/mastercard foundation/i), {
      target: { value: "Community scholarship" },
    });
    fireEvent.click(screen.getByRole("button", { name: /submit for review/i }));

    await waitFor(() => expect(submitOpportunity).toHaveBeenCalled());
    expect(screen.getByText(/submitted for review/i)).toBeInTheDocument();
    expect(screen.queryByText(/submitted and published/i)).not.toBeInTheDocument();
  });
});
