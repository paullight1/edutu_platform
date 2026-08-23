import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RunOpportunityReview from "./RunOpportunityReview";

const api = vi.hoisted(() => ({
  enhancePreview: vi.fn(),
  bulkImport: vi.fn(),
}));

vi.mock("../api/engineApi", () => ({ engineApi: api }));

describe("RunOpportunityReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.enhancePreview.mockResolvedValue({
      success: true,
      opportunity: {
        title: "Improved award",
        source: "Source one",
        sourceUrl: "https://source.example.com/award",
        applyUrl: "https://apply.example.com/award",
        description: "Improved description",
      },
    });
    api.bulkImport.mockResolvedValue({ success: true, inserted: 1, skipped: 0 });
  });

  it("improves a result with AI and publishes selected opportunities", async () => {
    const user = userEvent.setup();
    render(
      <RunOpportunityReview
        opportunities={[
          {
            title: "Raw award",
            source: "Source one",
            sourceUrl: "https://source.example.com/award",
            applyUrl: "https://apply.example.com/award",
          },
          {
            title: "Second award",
            source: "Source two",
            sourceUrl: "https://source.example.com/second",
            applyUrl: "https://apply.example.com/second",
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Improve Raw award" }));
    expect(await screen.findByText("Improved award")).toBeVisible();

    await user.click(screen.getByRole("checkbox", { name: "Select Improved award" }));
    await user.click(screen.getByRole("button", { name: "Publish selected" }));

    await waitFor(() => expect(api.bulkImport).toHaveBeenCalledTimes(1));
    expect(api.bulkImport).toHaveBeenCalledWith([
      expect.objectContaining({
        title: "Improved award",
        sourceUrl: "https://source.example.com/award",
        applyUrl: "https://apply.example.com/award",
        status: "pending",
      }),
    ]);
    expect(screen.getByText("Published 1 opportunity")).toBeVisible();
  });

  it("selects all valid results and reports skipped duplicates", async () => {
    const user = userEvent.setup();
    api.bulkImport.mockResolvedValue({ success: true, inserted: 1, skipped: 1 });
    render(
      <RunOpportunityReview
        opportunities={[
          {
            title: "One",
            source: "One",
            sourceUrl: "https://one.example.com",
            applyUrl: "https://one.example.com/apply",
          },
          {
            title: "Two",
            source: "Two",
            sourceUrl: "https://two.example.com",
            applyUrl: "https://two.example.com/apply",
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Select all opportunities" }));
    await user.click(screen.getByRole("button", { name: "Publish selected" }));

    expect(await screen.findByText("Published 1 opportunity; 1 already existed")).toBeVisible();
  });

  it("fails visibly when an opportunity has no source URL", async () => {
    const user = userEvent.setup();
    render(
      <RunOpportunityReview
        opportunities={[{ title: "No link award", source: "Unknown" }]}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Select No link award" }));
    await user.click(screen.getByRole("button", { name: "Publish selected" }));

    expect(screen.getByText("Selected opportunities do not have publishable source links")).toBeVisible();
    expect(api.bulkImport).not.toHaveBeenCalled();
  });
});
