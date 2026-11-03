import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ApplicationsPage from "../ApplicationsPage";
import {
  getApplicationPage,
  getApplicationHistory,
  updateApplicationStatus,
} from "../../services/applications";

const { getToken, user } = vi.hoisted(() => ({
  getToken: vi.fn(),
  user: { id: "user-1" },
}));
vi.mock("@clerk/clerk-react", () => ({ useAuth: () => ({ getToken }) }));
vi.mock("../../hooks/useAuth", () => ({ useAuth: () => ({ user }) }));
vi.mock("../../hooks/usePersonalization", () => ({
  usePersonalization: () => ({ explainOpportunity: vi.fn() }),
}));
vi.mock("../ui/ToastProvider", () => ({
  useToast: () => ({ success: vi.fn() }),
}));
vi.mock("../WebPushPrompt", () => ({ default: () => null }));
vi.mock("../../services/opportunities", () => ({
  fetchOpportunities: vi.fn().mockResolvedValue([]),
  isOpportunityExpired: () => false,
}));
vi.mock("../../services/bookmarks", () => ({
  getBookmarks: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../services/applications", async (original) => ({
  ...(await original<typeof import("../../services/applications")>()),
  getApplicationPage: vi.fn(),
  getApplicationHistory: vi.fn(),
  updateApplicationStatus: vi.fn(),
  getApplicationOpportunityIds: vi.fn().mockResolvedValue([]),
  fetchAnswerBankCount: vi.fn().mockResolvedValue(0),
}));
const row = {
  id: "app-1",
  user_id: "user-1",
  opportunity_id: "opp-1",
  opportunity_title: "North Star Fellowship",
  opportunity_category: "Scholarships",
  status: "rejected" as const,
  applied_at: "2026-10-01",
  notes: null,
};
const page = (items = [row]) => ({
  items,
  nextCursor: null,
  total: items.length,
  filteredTotal: items.length,
  counts: { rejected: items.length },
});
const renderPage = () =>
  render(
    <MemoryRouter>
      <ApplicationsPage />
    </MemoryRouter>,
  );

describe("ApplicationsPage recovery and loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getToken.mockResolvedValue("token");
    vi.mocked(getApplicationHistory).mockResolvedValue([]);
  });

  it("shows applications without waiting for optional reflection history", async () => {
    vi.mocked(getApplicationPage).mockResolvedValue(page());
    vi.mocked(getApplicationHistory).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(await screen.findByText(row.opportunity_title)).toBeVisible();
    expect(getApplicationHistory).not.toHaveBeenCalled();
  });

  it("keeps the current list visible throughout refresh", async () => {
    vi.mocked(getApplicationPage)
      .mockResolvedValueOnce(page())
      .mockReturnValueOnce(new Promise(() => {}));
    renderPage();
    await screen.findByText(row.opportunity_title);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(getApplicationPage).toHaveBeenCalledTimes(2));
    expect(screen.getByText(row.opportunity_title)).toBeVisible();
  });

  it("clears filters instead of navigating away when a search has no results", async () => {
    vi.mocked(getApplicationPage).mockResolvedValue(page());
    renderPage();
    await screen.findByText(row.opportunity_title);
    fireEvent.change(screen.getByPlaceholderText("Search applications"), {
      target: { value: "missing" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Clear filters" }),
    );
    expect(screen.getByPlaceholderText("Search applications")).toHaveValue("");
    expect(screen.getByText(row.opportunity_title)).toBeVisible();
  });

  it("offers sign-in recovery for a missing session", async () => {
    getToken.mockResolvedValue(null);
    renderPage();
    expect(await screen.findByText("Please sign in again")).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeVisible();
  });
  it("can reopen a saved reflection after returning to an already closed application", async () => {
    vi.mocked(getApplicationPage).mockResolvedValue(page());
    vi.mocked(getApplicationHistory).mockResolvedValue([
      {
        id: "history-1",
        application_id: row.id,
        event_type: "reflection",
        previous_status: "rejected",
        next_status: "rejected",
        note: "Prepare earlier",
        metadata: {},
        actor_user_id: "user-1",
        created_at: "2026-10-02",
      },
    ]);
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "Review reflection" }),
    );
    expect(await screen.findByDisplayValue("Prepare earlier")).toBeVisible();
  });

  it("retries failed reflection history without clearing the application list", async () => {
    vi.mocked(getApplicationPage).mockResolvedValue(page());
    vi.mocked(getApplicationHistory)
      .mockRejectedValueOnce(new Error("History temporarily unavailable"))
      .mockResolvedValueOnce([]);
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "Review reflection" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "History temporarily unavailable",
    );
    expect(screen.getByText(row.opportunity_title)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
    );
    expect(
      screen.getByPlaceholderText(
        "Optional: what would you try differently next time?",
      ),
    ).toBeEnabled();
    expect(getApplicationPage).toHaveBeenCalledTimes(1);
  });

  it("appends the next page and keeps aggregate stage counts", async () => {
    const second = {
      ...row,
      id: "app-2",
      opportunity_id: "opp-2",
      opportunity_title: "Second fellowship",
    };
    vi.mocked(getApplicationPage)
      .mockResolvedValueOnce({
        ...page(),
        nextCursor: "next",
        total: 2,
        filteredTotal: 2,
        counts: { rejected: 2 },
      })
      .mockResolvedValueOnce({
        ...page([second]),
        total: 2,
        filteredTotal: 2,
        counts: { rejected: 2 },
      });
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "Load more applications" }),
    );
    expect(await screen.findByText(second.opportunity_title)).toBeVisible();
    expect(screen.getByText(row.opportunity_title)).toBeVisible();
    expect(getApplicationPage).toHaveBeenLastCalledWith(
      "user-1",
      "token",
      expect.objectContaining({ cursor: "next" }),
    );
  });
  it("blocks pagination while a status change is saving", async () => {
    let finish!: (value: typeof row) => void;
    vi.mocked(getApplicationPage).mockResolvedValue({
      ...page(),
      nextCursor: "next",
      total: 2,
      filteredTotal: 2,
    });
    vi.mocked(updateApplicationStatus).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve as typeof finish;
      }),
    );
    renderPage();
    await screen.findByText(row.opportunity_title);
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "submitted" },
    });
    const more = screen.getByRole("button", { name: "Load more applications" });
    expect(more).toBeDisabled();
    fireEvent.click(more);
    expect(getApplicationPage).toHaveBeenCalledTimes(1);
    await act(async () => finish(row));
    await waitFor(() => expect(more).toBeEnabled());
  });
});
