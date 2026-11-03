import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ApplicationFollowUpPrompt from "../ApplicationFollowUpPrompt";
import {
  getApplicationPage,
  getApplication,
  updateApplicationStatus,
} from "../../services/applications";
import type { ApplicationRecord } from "../../services/applications";
const { getToken } = vi.hoisted(() => ({
  getToken: vi.fn().mockResolvedValue("token"),
}));
vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ userId: "user-1", getToken }),
}));
vi.mock("../../services/applications", () => ({
  getApplicationPage: vi.fn(),
  getApplication: vi.fn(),
  recordApplicationEvent: vi.fn().mockResolvedValue(undefined),
  updateApplicationStatus: vi.fn(),
}));
const application = {
  id: "app-1",
  user_id: "user-1",
  opportunity_id: "opp-1",
  opportunity_title: "North Star Fellowship",
  opportunity_category: "Scholarships",
  status: "draft" as const,
  applied_at: "2026-01-01",
  notes: null,
};
const page = (items: ApplicationRecord[] = [application]) => ({
  items,
  nextCursor: null,
  total: items.length,
  filteredTotal: items.length,
  counts: {},
});
const renderPrompt = () =>
  render(
    <MemoryRouter>
      <ApplicationFollowUpPrompt />
    </MemoryRouter>,
  );
describe("submission confirmation prompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(getApplicationPage).mockResolvedValue(page());
  });
  it("records submission only after confirmation succeeds", async () => {
    let complete!: (value: ApplicationRecord) => void;
    vi.mocked(updateApplicationStatus).mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    renderPrompt();
    fireEvent.click(
      await screen.findByRole("button", { name: "Yes, I submitted it" }),
    );
    expect(
      await screen.findByRole("button", { name: "Saving…" }),
    ).toBeDisabled();
    expect(screen.getByRole("dialog")).toBeVisible();
    await act(async () => complete({ ...application, status: "submitted" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(updateApplicationStatus).toHaveBeenCalledWith(
      "app-1",
      "submitted",
      "token",
      undefined,
    );
  });
  it("leaves the draft intact and offers recovery when saving fails", async () => {
    vi.mocked(updateApplicationStatus).mockRejectedValue(
      new Error("Could not save"),
    );
    renderPrompt();
    fireEvent.click(
      await screen.findByRole("button", { name: "Yes, I submitted it" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not save",
    );
    expect(screen.getByRole("dialog")).toBeVisible();
  });
  it("snoozes a declined popup and never treats Not yet as submitted", async () => {
    const view = renderPrompt();
    fireEvent.click(await screen.findByRole("button", { name: "Not yet" }));
    expect(updateApplicationStatus).not.toHaveBeenCalled();
    view.unmount();
    renderPrompt();
    await waitFor(() => expect(getApplicationPage).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("does not prompt about already submitted applications", async () => {
    vi.mocked(getApplicationPage).mockResolvedValue(
      page([{ ...application, status: "submitted" }]),
    );
    renderPrompt();
    await waitFor(() => expect(getApplicationPage).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("asks about a freshly opened draft when the user returns from its external form", async () => {
    const fresh = { ...application, applied_at: new Date().toISOString() };
    vi.mocked(getApplicationPage).mockResolvedValue(page([fresh]));
    vi.mocked(getApplication).mockResolvedValue(fresh);
    renderPrompt();
    await waitFor(() => expect(getApplicationPage).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    act(() => {
      window.dispatchEvent(
        new CustomEvent("edutu:applications-changed", {
          detail: { userId: "user-1", application: fresh },
        }),
      );
      window.dispatchEvent(new Event("focus"));
    });
    expect(await screen.findByRole("dialog")).toBeVisible();
  });
  it("rechecks a delayed Apply response after focus, even during the initial request", async () => {
    let finish!: (value: ReturnType<typeof page>) => void;
    vi.mocked(getApplicationPage).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const fresh = { ...application, applied_at: new Date().toISOString() };
    vi.mocked(getApplication).mockResolvedValue(fresh);
    renderPrompt();
    await waitFor(() => expect(getApplicationPage).toHaveBeenCalledTimes(1));
    act(() => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(
        new CustomEvent("edutu:applications-changed", {
          detail: { userId: "user-1", application: fresh },
        }),
      );
    });
    await act(async () => finish(page([])));
    expect(await screen.findByRole("dialog")).toBeVisible();
    expect(getApplication).toHaveBeenCalledWith("app-1", "user-1", "token");
  });
});
