import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import OpportunityDecisionMeta from "./OpportunityDecisionMeta";

describe("OpportunityDecisionMeta", () => {
  it("shows eligibility, one fit reason, one risk, and estimated effort", () => {
    render(
      <OpportunityDecisionMeta
        eligibilityStatus="likely"
        matchReason="Matches your current study goal"
        risk="Requires two references"
        estimatedEffortHours={8}
      />,
    );

    expect(screen.getByText("Likely eligible")).toBeInTheDocument();
    expect(screen.getByText(/Matches your current study goal/)).toBeInTheDocument();
    expect(screen.getByText(/Requires two references/)).toBeInTheDocument();
    expect(screen.getByText("About 8h preparation")).toBeInTheDocument();
  });

  it("does not invent absent decision information", () => {
    render(<OpportunityDecisionMeta eligibilityStatus="unclear" />);
    expect(screen.getByText("Check eligibility")).toBeInTheDocument();
    expect(screen.queryByText(/Why it fits/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Watch out/)).not.toBeInTheDocument();
  });
});
