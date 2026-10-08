import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import OpportunityReview from "./OpportunityReview";

const original = {
  title: "Browse Internships",
  source: "scraper",
  description: "Source article",
  summary: "Original summary",
};
const props = { index: 0, onToggle: vi.fn() };
describe("opportunity improvement evidence", () => {
  it("does not label an identical response as improved", () => {
    render(
      <OpportunityReview
        {...props}
        entry={{
          original,
          current: { ...original },
          selected: true,
          improving: false,
          error: null,
        }}
      />,
    );
    expect(screen.getByText(/No content changes/)).toBeInTheDocument();
    expect(screen.queryByText("Improved preview")).not.toBeInTheDocument();
  });
  it("shows title and structured changes even when the article is unchanged", () => {
    render(
      <OpportunityReview
        {...props}
        entry={{
          original,
          current: {
            ...original,
            title: "EBID Young Professional Program",
            requirements: ["Bachelor degree"],
          },
          selected: true,
          improving: false,
          error: null,
        }}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "EBID Young Professional Program" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Bachelor degree")).toBeInTheDocument();
    expect(screen.getByText("2 fields changed")).toBeInTheDocument();
  });
});
