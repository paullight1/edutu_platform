import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OpportunitySharePicker from "../../features/community/components/OpportunitySharePicker";

const opportunity = {
  id: "33333333-3333-4333-8333-333333333333",
  title: "Pan-African Scholars Programme",
  organization: "Africa Scholars Foundation",
  category: "scholarships",
  deadline: "2026-11-30",
  location: "Africa",
  summary: "Funding for students across Africa.",
  description: "",
  requirements: [],
  benefits: [],
  applicationProcess: [],
  match: 0,
};

const fetchOpportunities = vi.fn();
const searchOpportunityCatalog = vi.fn();

vi.mock("../../services/opportunities", () => ({
  getCachedOpportunitiesSync: () => [],
  fetchOpportunities: (...args: unknown[]) => fetchOpportunities(...args),
  searchOpportunityCatalog: (...args: unknown[]) =>
    searchOpportunityCatalog(...args),
}));

describe("community opportunity share picker", () => {
  beforeEach(() => {
    fetchOpportunities.mockReset().mockResolvedValue([opportunity]);
    searchOpportunityCatalog.mockReset().mockResolvedValue([opportunity]);
  });

  it("posts a catalog card with one click and exposes the reviewed import flow", async () => {
    const onShare = vi.fn();
    render(
      <MemoryRouter>
        <OpportunitySharePicker
          open
          sending={false}
          onClose={vi.fn()}
          onShare={onShare}
        />
      </MemoryRouter>,
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: /pan-african scholars programme/i,
      }),
    );
    expect(fetchOpportunities).toHaveBeenCalledWith({ limit: 60, force: true });
    expect(onShare).toHaveBeenCalledWith(opportunity);
    expect(
      screen.getByRole("link", { name: /submit or import an opportunity/i }),
    ).toHaveAttribute("href", "/app/submit-opportunity");
  });

  it("searches the complete server catalog and closes with Escape", async () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <OpportunitySharePicker
          open
          sending={false}
          onClose={onClose}
          onShare={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Search opportunities"), {
      target: { value: "Pan African" },
    });
    await waitFor(() =>
      expect(searchOpportunityCatalog).toHaveBeenCalledWith(
        "Pan African",
        expect.any(AbortSignal),
      ),
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
