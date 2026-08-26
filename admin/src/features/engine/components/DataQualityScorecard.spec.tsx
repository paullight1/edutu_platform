import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DataQualityScorecard from "./DataQualityScorecard";

const mocks = vi.hoisted(() => ({
  getQualityScorecard: vi.fn(),
}));

vi.mock("../api/engineApi", () => ({
  engineApi: { getQualityScorecard: mocks.getQualityScorecard },
}));

describe("DataQualityScorecard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getQualityScorecard.mockResolvedValue({
      total: 120,
      active: 100,
      active_missing_deadline: 20,
      active_imageless: 5,
      duplicates: 2,
      active_stale_14d: 3,
      active_unknown_confidence: 10,
      pending_review: 4,
      active_listing_urls: 0,
      html_titles: 0,
      active_thin_description: 7,
      active_verified_7d: 90,
      newest_verification_at: "2026-08-25T12:00:00.000Z",
    });
  });

  it("renders rates against the active catalog denominator", async () => {
    render(<DataQualityScorecard />);

    const scorecard = await screen.findByRole("region", {
      name: "Catalog data quality",
    });
    expect(within(scorecard).getByText("20%", { selector: "strong" })).toBeVisible();
    expect(within(scorecard).getByText("90%", { selector: "strong" })).toBeVisible();
    expect(within(scorecard).getByText("2", { selector: "strong" })).toBeVisible();
  });

  it("offers a retry after the quality endpoint fails", async () => {
    const user = userEvent.setup();
    mocks.getQualityScorecard
      .mockRejectedValueOnce(new Error("quality unavailable"))
      .mockResolvedValueOnce({ total: 0, active: 0 });

    render(<DataQualityScorecard />);
    expect(await screen.findByRole("alert")).toHaveTextContent("quality unavailable");

    await user.click(screen.getByRole("button", { name: "Retry quality metrics" }));
    expect(mocks.getQualityScorecard).toHaveBeenCalledTimes(2);
  });
});
