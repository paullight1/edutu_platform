import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import JourneyStatusBadge from "./JourneyStatusBadge";

describe("JourneyStatusBadge", () => {
  it.each([
    ["shortlisted", "Shortlisted"],
    ["preparing", "Preparing"],
    ["ready_to_apply", "Ready to apply"],
    ["application_opened", "Application opened"],
    ["applied", "Applied"],
    ["offer", "Offer"],
    ["rejected", "Not selected"],
  ] as const)("renders %s with accessible text", (state, label) => {
    render(<JourneyStatusBadge state={state} />);
    expect(screen.getByText(label)).toHaveAttribute("data-journey-state", state);
  });
});
